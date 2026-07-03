import type { PrismaClient } from '@prisma/client';
import { normalizeAppRole, type AppRole } from '../../shared/auth/roles.js';
import type { AuditLogRecord, AuthRepository, AuthUserRecord } from './repository.js';

const VALID_AUDIT_ACTIONS = new Set([
  'LOGIN_SUCCESS', 'LOGIN_FAILED', 'LOGOUT',
  'MFA_ENROLLED', 'MFA_VERIFIED', 'MFA_FAILED',
  'SESSION_CREATED', 'SESSION_ROTATED', 'SESSION_REVOKED',
  'ROLE_CHANGED', 'PERMISSION_DENIED',
  'PASSWORD_RESET_REQUESTED', 'PASSWORD_RESET_COMPLETED',
] as const);

type PrismaAuditAction = typeof VALID_AUDIT_ACTIONS extends Set<infer T> ? T : never;

function toAuditAction(action: string): PrismaAuditAction {
  if (VALID_AUDIT_ACTIONS.has(action as PrismaAuditAction)) {
    return action as PrismaAuditAction;
  }
  return 'LOGIN_FAILED';
}

function mapUser(user: { id: string; email: string; role: string; mfaEnabled: boolean; isActive: boolean }): AuthUserRecord {
  return {
    id: user.id,
    email: user.email,
    role: normalizeAppRole(user.role) as AppRole,
    mfaEnabled: user.mfaEnabled,
    isActive: user.isActive,
  };
}

export class PrismaAuthRepository implements AuthRepository {
  constructor(private readonly db: PrismaClient) {}

  async findUserById(userId: string): Promise<AuthUserRecord | null> {
    const user = await this.db.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, role: true, mfaEnabled: true, isActive: true },
    });
    return user ? mapUser(user) : null;
  }

  async findUserByEmail(email: string): Promise<AuthUserRecord | null> {
    const user = await this.db.user.findUnique({
      where: { email: email.toLowerCase() },
      select: { id: true, email: true, role: true, mfaEnabled: true, isActive: true },
    });
    return user ? mapUser(user) : null;
  }

  async upsertUserFromOAuth(input: {
    id: string;
    email: string;
    role: AppRole;
    mfaEnabled: boolean;
  }): Promise<AuthUserRecord> {
    const user = await this.db.user.upsert({
      where: { providerUserId: input.id },
      create: {
        providerUserId: input.id,
        email: input.email.toLowerCase(),
        role: input.role,
        mfaEnabled: input.mfaEnabled,
        provider: 'SUPABASE',
        isActive: true,
        lastLoginAt: new Date(),
      },
      update: {
        email: input.email.toLowerCase(),
        mfaEnabled: input.mfaEnabled,
        lastLoginAt: new Date(),
      },
      select: { id: true, email: true, role: true, mfaEnabled: true, isActive: true },
    });

    return mapUser(user);
  }

  async recordAuditLog(entry: AuditLogRecord): Promise<void> {
    await this.db.auditLog.create({
      data: {
        action: toAuditAction(entry.action),
        actorUserId: entry.actorUserId ?? null,
        targetUserId: entry.targetUserId ?? null,
        resourceType: entry.resourceType ?? null,
        resourceId: entry.resourceId ?? null,
        ipAddress: entry.ipAddress ?? null,
        userAgent: entry.userAgent ?? null,
        metadata: (entry.metadata as object) ?? undefined,
      },
    });
  }
}
