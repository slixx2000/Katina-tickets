import type { Request } from 'express';

export type AuditEventName =
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILED'
  | 'LOGOUT'
  | 'ROLE_CHANGED'
  | 'PERMISSION_DENIED'
  | 'MFA_ENROLLED'
  | 'MFA_VERIFIED'
  | 'MFA_FAILED'
  | 'SESSION_CREATED'
  | 'SESSION_ROTATED'
  | 'SESSION_REVOKED';

export type AuditEvent = {
  name: AuditEventName;
  actorUserId?: string | null;
  targetUserId?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
  request?: Request | null;
};

export function buildAuditEvent(event: AuditEvent) {
  const request = event.request;
  const { request: _request, ...rest } = event;

  return {
    ...rest,
    ipAddress:
      event.ipAddress ??
      request?.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() ??
      request?.headers['x-real-ip']?.toString() ??
      null,
    userAgent: event.userAgent ?? request?.headers['user-agent']?.toString() ?? null,
    timestamp: new Date().toISOString(),
  };
}

export function logAuditEvent(event: AuditEvent) {
  const payload = buildAuditEvent(event);
  console.info('[audit]', JSON.stringify(payload));
  return payload;
}
