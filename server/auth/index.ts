import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import {
  APP_ROLES,
  canAccessPermission,
  hasRole,
  normalizeAppRole,
  type AppRole,
} from '../../shared/auth/roles.js';

export type AuthPrincipal = {
  userId: string;
  email: string;
  role: AppRole;
  mfaEnabled: boolean;
};

export type AuthenticatedRequest = Request & {
  auth?: AuthPrincipal;
};

export type SessionResolver = (sessionToken: string) => Promise<AuthPrincipal | null>;

export type AuthMiddlewareOptions = {
  resolveSession: SessionResolver;
  requiredRoles?: readonly AppRole[];
  requireMfa?: boolean;
};

export type PermissionKey = 'dashboard' | 'events' | 'scanner' | 'support' | 'finance' | 'users';

export function parseCookieHeader(cookieHeader: string | undefined) {
  if (!cookieHeader) {
    return new Map<string, string>();
  }

  const cookies = new Map<string, string>();
  const pairs = cookieHeader.split(';');

  for (const pair of pairs) {
    const [rawName, ...rawValue] = pair.split('=');
    const name = rawName.trim();
    const value = rawValue.join('=').trim();
    if (name) {
      cookies.set(name, decodeURIComponent(value));
    }
  }

  return cookies;
}

export function getSessionToken(request: Request, cookieName = 'session-token') {
  const cookieHeader = request.headers.cookie;
  const cookies = parseCookieHeader(cookieHeader);
  return cookies.get(cookieName) ?? null;
}

export function createSessionMiddleware(options: AuthMiddlewareOptions) {
  return async function sessionMiddleware(request: AuthenticatedRequest, response: Response, next: NextFunction) {
    try {
      const token = getSessionToken(request);
      if (!token) {
        response.status(401).json({ success: false, message: 'Authentication required.' });
        return;
      }

      const principal = await options.resolveSession(token);
      if (!principal) {
        response.status(401).json({ success: false, message: 'Invalid or expired session.' });
        return;
      }

      if (options.requireMfa && !principal.mfaEnabled) {
        response.status(403).json({ success: false, message: 'MFA is required for this action.' });
        return;
      }

      if (options.requiredRoles && !hasRole(options.requiredRoles, principal.role)) {
        response.status(403).json({ success: false, message: 'Forbidden.' });
        return;
      }

      request.auth = principal;
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function createRoleGuard(requiredRoles: readonly AppRole[]) {
  return (request: AuthenticatedRequest, response: Response, next: NextFunction) => {
    if (!request.auth) {
      response.status(401).json({ success: false, message: 'Authentication required.' });
      return;
    }

    if (!hasRole(requiredRoles, request.auth.role)) {
      response.status(403).json({ success: false, message: 'Forbidden.' });
      return;
    }

    next();
  };
}

export function createOriginGuard(allowedOrigins: readonly string[]) {
  const normalizedAllowed = allowedOrigins
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
    .map((value) => {
      try {
        return new URL(value).origin;
      } catch {
        return value.replace(/\/+$/, '');
      }
    });

  const isAllowedOrigin = (value: string | undefined, request: Request) => {
    if (!value) {
      return true;
    }

    let requestOrigin: string;
    try {
      requestOrigin = new URL(value).origin;
    } catch {
      return false;
    }

    if (normalizedAllowed.includes(requestOrigin)) {
      return true;
    }

    const forwardedHost = request.headers['x-forwarded-host'];
    const hostHeader = typeof forwardedHost === 'string'
      ? forwardedHost.split(',')[0]?.trim()
      : request.headers.host;
    if (!hostHeader) {
      return false;
    }

    const normalizedHost = hostHeader.toLowerCase();
    const requestHost = new URL(requestOrigin).host.toLowerCase();
    return requestHost === normalizedHost;
  };

  return (request: Request, response: Response, next: NextFunction) => {
    const origin = request.headers.origin;
    if (!origin) {
      next();
      return;
    }

    if (!isAllowedOrigin(origin, request)) {
      response.status(403).json({ success: false, message: 'Origin not allowed.' });
      return;
    }

    next();
  };
}

export function createCsrfGuard(allowedOrigins: readonly string[]) {
  const normalizedAllowed = allowedOrigins
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
    .map((value) => {
      try {
        return new URL(value).origin;
      } catch {
        return value.replace(/\/+$/, '');
      }
    });

  const isAllowedOrigin = (value: string | undefined, request: Request) => {
    if (!value) {
      return true;
    }

    let requestOrigin: string;
    try {
      requestOrigin = new URL(value).origin;
    } catch {
      return false;
    }

    if (normalizedAllowed.includes(requestOrigin)) {
      return true;
    }

    const forwardedHost = request.headers['x-forwarded-host'];
    const hostHeader = typeof forwardedHost === 'string'
      ? forwardedHost.split(',')[0]?.trim()
      : request.headers.host;
    if (!hostHeader) {
      return false;
    }

    const normalizedHost = hostHeader.toLowerCase();
    const requestHost = new URL(requestOrigin).host.toLowerCase();
    return requestHost === normalizedHost;
  };

  return (request: Request, response: Response, next: NextFunction) => {
    const origin = request.headers.origin;
    const referer = request.headers.referer;

    if (!origin && !referer) {
      next();
      return;
    }

    const matched = [origin, referer].some((value) => isAllowedOrigin(value, request));
    if (!matched) {
      response.status(403).json({ success: false, message: 'CSRF validation failed.' });
      return;
    }

    next();
  };
}

export function createInMemoryRateLimiter(options: { limit: number; windowMs: number }) {
  const buckets = new Map<string, { count: number; resetAt: number }>();

  return (request: Request, response: Response, next: NextFunction) => {
    const key = request.ip || request.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() || 'unknown';
    const now = Date.now();
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + options.windowMs });
      next();
      return;
    }

    bucket.count += 1;
    if (bucket.count > options.limit) {
      response.status(429).json({ success: false, message: 'Too many requests. Try again later.' });
      return;
    }

    next();
  };
}

export function signAuditEvent(secret: string, payload: Record<string, unknown>) {
  return crypto.createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex');
}

export function mapAllowedRoles(required: readonly AppRole[]) {
  return required.filter((role) => APP_ROLES.includes(role));
}

export function canAuthorizeRole(permission: PermissionKey, role?: AppRole | null) {
  return canAccessPermission(permission, role);
}
