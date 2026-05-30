import type { NextFunction, Request, Response } from 'express';
import { hasRole, type AppRole } from '../../shared/auth/roles';
import type { SessionPrincipal } from './repository';

export type AuthenticatedRequest = Request & {
  auth?: SessionPrincipal;
};

export function requireSession(request: AuthenticatedRequest, response: Response, next: NextFunction) {
  if (!request.auth) {
    response.status(401).json({ success: false, message: 'Authentication required.' });
    return;
  }

  next();
}

export function requireRoles(allowedRoles: readonly AppRole[], options: { requireMfa?: boolean } = {}) {
  return (request: AuthenticatedRequest, response: Response, next: NextFunction) => {
    if (!request.auth) {
      response.status(401).json({ success: false, message: 'Authentication required.' });
      return;
    }

    if (options.requireMfa && !request.auth.mfaEnabled) {
      response.status(403).json({ success: false, message: 'MFA is required for this action.' });
      return;
    }

    if (!hasRole(allowedRoles, request.auth.role)) {
      response.status(403).json({ success: false, message: 'Forbidden.' });
      return;
    }

    next();
  };
}
