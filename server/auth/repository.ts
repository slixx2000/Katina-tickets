import type { AppRole } from '../../shared/auth/roles.js';

export type AuthUserRecord = {
  id: string;
  email: string;
  role: AppRole;
  mfaEnabled: boolean;
  isActive: boolean;
};

export type AuditLogRecord = {
  action: string;
  actorUserId?: string | null;
  targetUserId?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
};

export type SessionPrincipal = {
  userId: string;
  email: string;
  role: AppRole;
  mfaEnabled: boolean;
};

export interface AuthRepository {
  findUserById(userId: string): Promise<AuthUserRecord | null>;
  findUserByEmail(email: string): Promise<AuthUserRecord | null>;
  upsertUserFromOAuth(input: { id: string; email: string; role: AppRole; mfaEnabled: boolean }): Promise<AuthUserRecord>;
  recordAuditLog(entry: AuditLogRecord): Promise<void>;
}

export class InMemoryAuthRepository implements AuthRepository {
  private readonly users = new Map<string, AuthUserRecord>();
  private readonly usersByEmail = new Map<string, string>();
  public readonly auditLogs: AuditLogRecord[] = [];

  async findUserById(userId: string) {
    return this.users.get(userId) ?? null;
  }

  async findUserByEmail(email: string) {
    const userId = this.usersByEmail.get(email.toLowerCase());
    if (!userId) return null;
    return this.users.get(userId) ?? null;
  }

  async upsertUserFromOAuth(input: { id: string; email: string; role: AppRole; mfaEnabled: boolean }) {
    const record: AuthUserRecord = {
      id: input.id,
      email: input.email.toLowerCase(),
      role: input.role,
      mfaEnabled: input.mfaEnabled,
      isActive: true,
    };
    this.users.set(record.id, record);
    this.usersByEmail.set(record.email, record.id);
    return record;
  }

  async recordAuditLog(entry: AuditLogRecord) {
    this.auditLogs.push(entry);
  }
}
