import crypto from 'node:crypto';
import { type AppRole, normalizeAppRole } from '../../shared/auth/roles.js';

export type AuthPrincipal = {
  userId: string;
  email: string;
  role: AppRole;
  mfaEnabled: boolean;
};

export type SessionBundle = {
  sessionId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  refreshExpiresAt: Date;
  principal: AuthPrincipal;
};

export type StoredSessionRecord = {
  sessionId: string;
  accessTokenHash: string;
  refreshTokenHash: string;
  principal: AuthPrincipal;
  expiresAt: Date;
  refreshExpiresAt: Date;
  revokedAt: Date | null;
  accessTokenVersion: number;
  refreshTokenVersion: number;
  createdAt: Date;
  updatedAt: Date;
  lastSeenAt: Date | null;
};

export type SessionLookup = {
  sessionId: string;
  principal: AuthPrincipal;
  expiresAt: Date;
  refreshExpiresAt: Date;
  revokedAt: Date | null;
};

export type CreateSessionOptions = {
  sessionTtlMs?: number;
  refreshTtlMs?: number;
};

export type SessionStore = {
  createSession(principal: AuthPrincipal, options?: CreateSessionOptions): Promise<SessionBundle>;
  getSessionByAccessToken(accessToken: string): Promise<SessionLookup | null>;
  rotateSession(refreshToken: string): Promise<SessionBundle | null>;
  invalidateSessionByAccessToken(accessToken: string): Promise<boolean>;
  invalidateSessionById(sessionId: string): Promise<boolean>;
  revokeAllForUser(userId: string): Promise<number>;
  listActiveSessionsForUser(userId: string): Promise<SessionLookup[]>;
};

const DEFAULT_SESSION_TTL_MS = 1000 * 60 * 60 * 8;
const DEFAULT_REFRESH_TTL_MS = 1000 * 60 * 60 * 24 * 30;

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

export class InMemorySessionStore implements SessionStore {
  private readonly sessionsById = new Map<string, StoredSessionRecord>();
  private readonly accessTokenIndex = new Map<string, string>();
  private readonly refreshTokenIndex = new Map<string, string>();

  async createSession(principal: AuthPrincipal, options: CreateSessionOptions = {}): Promise<SessionBundle> {
    const sessionId = crypto.randomUUID();
    const accessToken = secureToken();
    const refreshToken = secureToken();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + (options.sessionTtlMs ?? DEFAULT_SESSION_TTL_MS));
    const refreshExpiresAt = new Date(now.getTime() + (options.refreshTtlMs ?? DEFAULT_REFRESH_TTL_MS));

    const record: StoredSessionRecord = {
      sessionId,
      accessTokenHash: hashToken(accessToken),
      refreshTokenHash: hashToken(refreshToken),
      principal: clonePrincipal(principal),
      expiresAt,
      refreshExpiresAt,
      revokedAt: null,
      accessTokenVersion: 1,
      refreshTokenVersion: 1,
      createdAt: now,
      updatedAt: now,
      lastSeenAt: now,
    };

    this.sessionsById.set(sessionId, record);
    this.accessTokenIndex.set(record.accessTokenHash, sessionId);
    this.refreshTokenIndex.set(record.refreshTokenHash, sessionId);

    return Promise.resolve({
      sessionId,
      accessToken,
      refreshToken,
      expiresAt,
      refreshExpiresAt,
      principal: clonePrincipal(principal),
    });
  }

  async getSessionByAccessToken(accessToken: string): Promise<SessionLookup | null> {
    const sessionId = this.accessTokenIndex.get(hashToken(accessToken));
    if (!sessionId) return null;

    const record = this.sessionsById.get(sessionId);
    if (!record || record.revokedAt) return null;
    if (record.expiresAt.getTime() <= Date.now()) return null;

    record.lastSeenAt = new Date();
    record.updatedAt = new Date();

    return Promise.resolve(this.toLookup(record));
  }

  async rotateSession(refreshToken: string): Promise<SessionBundle | null> {
    const hashed = hashToken(refreshToken);
    const sessionId = this.refreshTokenIndex.get(hashed);
    if (!sessionId) return null;

    const record = this.sessionsById.get(sessionId);
    if (!record || record.revokedAt) return null;
    if (record.refreshExpiresAt.getTime() <= Date.now()) return null;
    if (record.refreshTokenHash !== hashed) return null;

    const newAccessToken = secureToken();
    const newRefreshToken = secureToken();
    record.accessTokenHash = hashToken(newAccessToken);
    record.refreshTokenHash = hashToken(newRefreshToken);
    record.accessTokenVersion += 1;
    record.refreshTokenVersion += 1;
    record.updatedAt = new Date();
    record.lastSeenAt = new Date();
    record.expiresAt = new Date(Date.now() + DEFAULT_SESSION_TTL_MS);
    record.refreshExpiresAt = new Date(Date.now() + DEFAULT_REFRESH_TTL_MS);

    this.accessTokenIndex.set(record.accessTokenHash, sessionId);
    this.refreshTokenIndex.set(record.refreshTokenHash, sessionId);

    return Promise.resolve({
      sessionId,
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      expiresAt: record.expiresAt,
      refreshExpiresAt: record.refreshExpiresAt,
      principal: clonePrincipal(record.principal),
    });
  }

  async invalidateSessionByAccessToken(accessToken: string): Promise<boolean> {
    const sessionId = this.accessTokenIndex.get(hashToken(accessToken));
    if (!sessionId) return false;
    return this.invalidateSessionById(sessionId);
  }

  async invalidateSessionById(sessionId: string): Promise<boolean> {
    const record = this.sessionsById.get(sessionId);
    if (!record || record.revokedAt) return false;

    record.revokedAt = new Date();
    record.updatedAt = new Date();
    return true;
  }

  async revokeAllForUser(userId: string): Promise<number> {
    let revoked = 0;
    for (const record of this.sessionsById.values()) {
      if (record.principal.userId === userId && !record.revokedAt) {
        record.revokedAt = new Date();
        record.updatedAt = new Date();
        revoked += 1;
      }
    }
    return revoked;
  }

  async listActiveSessionsForUser(userId: string): Promise<SessionLookup[]> {
    return Array.from(this.sessionsById.values())
      .filter((record) => record.principal.userId === userId && !record.revokedAt && record.expiresAt.getTime() > Date.now())
      .map((record) => this.toLookup(record));
  }

  private toLookup(record: StoredSessionRecord): SessionLookup {
    return {
      sessionId: record.sessionId,
      principal: clonePrincipal(record.principal),
      expiresAt: record.expiresAt,
      refreshExpiresAt: record.refreshExpiresAt,
      revokedAt: record.revokedAt,
    };
  }
}
