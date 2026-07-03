import crypto from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { normalizeAppRole, type AppRole } from '../../shared/auth/roles.js';
import type {
  AuthPrincipal,
  CreateSessionOptions,
  SessionBundle,
  SessionLookup,
  SessionStore,
} from './session-store.js';

const DEFAULT_SESSION_TTL_MS = 1000 * 60 * 60 * 8;
const DEFAULT_REFRESH_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const DEFAULT_IDLE_TIMEOUT_MS = 1000 * 60 * 30;

function resolveIdleTimeoutMs() {
  const raw = process.env.SESSION_IDLE_TIMEOUT_MINUTES;
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_IDLE_TIMEOUT_MS;
  }

  return parsed * 60 * 1000;
}

const SESSION_IDLE_TIMEOUT_MS = resolveIdleTimeoutMs();

function isIdle(lastSeenAt: Date | null) {
  if (!lastSeenAt) {
    return false;
  }

  return Date.now() - lastSeenAt.getTime() > SESSION_IDLE_TIMEOUT_MS;
}

function hashToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function secureToken() {
  return crypto.randomBytes(32).toString('hex');
}

function clonePrincipal(principal: AuthPrincipal): AuthPrincipal {
  return {
    userId: principal.userId,
    email: principal.email,
    role: normalizeAppRole(principal.role),
    mfaEnabled: principal.mfaEnabled,
  };
}

function principalFromUser(user: { id: string; email: string; role: string; mfaEnabled: boolean }): AuthPrincipal {
  return {
    userId: user.id,
    email: user.email,
    role: normalizeAppRole(user.role) as AppRole,
    mfaEnabled: user.mfaEnabled,
  };
}

export class PrismaSessionStore implements SessionStore {
  constructor(private readonly db: PrismaClient) {}

  async createSession(principal: AuthPrincipal, options: CreateSessionOptions = {}): Promise<SessionBundle> {
    const accessToken = secureToken();
    const refreshToken = secureToken();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + (options.sessionTtlMs ?? DEFAULT_SESSION_TTL_MS));
    const refreshExpiresAt = new Date(now.getTime() + (options.refreshTtlMs ?? DEFAULT_REFRESH_TTL_MS));

    const session = await this.db.session.create({
      data: {
        userId: principal.userId,
        sessionTokenHash: hashToken(accessToken),
        refreshTokenHash: hashToken(refreshToken),
        status: 'ACTIVE',
        expiresAt,
        refreshExpiresAt,
        lastSeenAt: now,
      },
    });

    await this.db.refreshToken.create({
      data: {
        userId: principal.userId,
        sessionId: session.id,
        tokenHash: hashToken(refreshToken),
        expiresAt: refreshExpiresAt,
      },
    });

    return {
      sessionId: session.id,
      accessToken,
      refreshToken,
      expiresAt,
      refreshExpiresAt,
      principal: clonePrincipal(principal),
    };
  }

  async getSessionByAccessToken(accessToken: string): Promise<SessionLookup | null> {
    const tokenHash = hashToken(accessToken);
    const session = await this.db.session.findFirst({
      where: {
        sessionTokenHash: tokenHash,
        status: 'ACTIVE',
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: { user: { select: { id: true, email: true, role: true, mfaEnabled: true } } },
    });

    if (!session) return null;

    if (isIdle(session.lastSeenAt)) {
      await this.invalidateSessionById(session.id);
      return null;
    }

    await this.db.session.update({
      where: { id: session.id },
      data: { lastSeenAt: new Date() },
    });

    return {
      sessionId: session.id,
      principal: principalFromUser(session.user),
      expiresAt: session.expiresAt,
      refreshExpiresAt: session.refreshExpiresAt,
      revokedAt: session.revokedAt,
    };
  }

  async rotateSession(refreshToken: string): Promise<SessionBundle | null> {
    const tokenHash = hashToken(refreshToken);
    const session = await this.db.session.findFirst({
      where: {
        refreshTokenHash: tokenHash,
        status: 'ACTIVE',
        revokedAt: null,
        refreshExpiresAt: { gt: new Date() },
      },
      include: { user: { select: { id: true, email: true, role: true, mfaEnabled: true } } },
    });

    if (!session) return null;

    if (isIdle(session.lastSeenAt)) {
      await this.invalidateSessionById(session.id);
      return null;
    }

    const newAccessToken = secureToken();
    const newRefreshToken = secureToken();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + DEFAULT_SESSION_TTL_MS);
    const refreshExpiresAt = new Date(now.getTime() + DEFAULT_REFRESH_TTL_MS);

    await this.db.$transaction([
      this.db.refreshToken.updateMany({
        where: { sessionId: session.id, revokedAt: null },
        data: { revokedAt: now },
      }),
      this.db.session.update({
        where: { id: session.id },
        data: {
          sessionTokenHash: hashToken(newAccessToken),
          refreshTokenHash: hashToken(newRefreshToken),
          expiresAt,
          refreshExpiresAt,
          lastSeenAt: now,
        },
      }),
      this.db.refreshToken.create({
        data: {
          userId: session.userId,
          sessionId: session.id,
          tokenHash: hashToken(newRefreshToken),
          expiresAt: refreshExpiresAt,
        },
      }),
    ]);

    return {
      sessionId: session.id,
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      expiresAt,
      refreshExpiresAt,
      principal: principalFromUser(session.user),
    };
  }

  async invalidateSessionByAccessToken(accessToken: string): Promise<boolean> {
    const session = await this.db.session.findFirst({
      where: { sessionTokenHash: hashToken(accessToken) },
      select: { id: true },
    });
    if (!session) return false;
    return this.invalidateSessionById(session.id);
  }

  async invalidateSessionById(sessionId: string): Promise<boolean> {
    const now = new Date();
    await this.db.$transaction([
      this.db.session.update({
        where: { id: sessionId },
        data: { status: 'REVOKED', revokedAt: now },
      }),
      this.db.refreshToken.updateMany({
        where: { sessionId, revokedAt: null },
        data: { revokedAt: now },
      }),
    ]);
    return true;
  }

  async revokeAllForUser(userId: string): Promise<number> {
    const now = new Date();
    const result = await this.db.session.updateMany({
      where: { userId, status: 'ACTIVE' },
      data: { status: 'REVOKED', revokedAt: now },
    });
    await this.db.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: now },
    });
    return result.count;
  }

  async listActiveSessionsForUser(userId: string): Promise<SessionLookup[]> {
    const sessions = await this.db.session.findMany({
      where: {
        userId,
        status: 'ACTIVE',
        expiresAt: { gt: new Date() },
      },
      include: { user: { select: { id: true, email: true, role: true, mfaEnabled: true } } },
      orderBy: { createdAt: 'desc' },
    });

    return sessions.map((s) => ({
      sessionId: s.id,
      principal: principalFromUser(s.user),
      expiresAt: s.expiresAt,
      refreshExpiresAt: s.refreshExpiresAt,
      revokedAt: s.revokedAt,
    }));
  }
}
