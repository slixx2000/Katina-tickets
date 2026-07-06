import crypto from 'crypto';
import 'dotenv/config';
import express, {type Request, type Response} from 'express';
import type { PaymentStatus } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { createClerkClient, verifyToken } from '@clerk/backend';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { createClient } from '@supabase/supabase-js';
import QRCode from 'qrcode';
import { buildAuthCookieName, buildClearedCookie, buildSetCookieHeaders, getAuthCookieOptions } from './auth/cookies.js';
import { createCsrfGuard, createInMemoryRateLimiter, createOriginGuard, type AuthenticatedRequest } from './auth/index.js';
import { buildAuditEvent, logAuditEvent, type AuditEvent } from './auth/audit.js';
import { InMemorySessionStore, type AuthPrincipal } from './auth/session-store.js';
import type { SessionStore } from './auth/session-store.js';
import { InMemoryAuthRepository } from './auth/repository.js';
import type { AuthRepository } from './auth/repository.js';
import { verifySupabaseAccessToken } from './auth/supabase.js';
import { MFA_RECOMMENDED_ROLES, normalizeAppRole, type AppRole } from '../shared/auth/roles.js';
import { isPrismaAvailable, prisma } from './lib/prisma.js';
import { PrismaSessionStore } from './auth/prisma-session-store.js';
import { PrismaAuthRepository } from './auth/prisma-repository.js';
import { canUseBilaGateway, createBilaMobileMoneyCollection, getBilaCollectionStatus, getBilaWalletId, getBilaCountry, parseBilaWebhookEvent, verifyBilaWebhookSignature, getBilaApiBaseUrl } from './lib/bila.js';
import {
  buildOtpAuthUri,
  decryptMfaSecret,
  encryptMfaSecret,
  generateBackupCodes,
  generateTotpSecret,
  hashRecoveryCode,
  verifyTotpCode,
} from './auth/mfa.js';

type BilaPaymentRequest = {
  amount?: unknown;
  currency?: unknown;
  description?: unknown;
  customerEmail?: unknown;
  customerName?: unknown;
  phone?: unknown;
  provider?: unknown;
  metadata?: unknown;
  phoneNumber?: unknown;
  operator?: unknown;
};

type RequestWithRawBody = Request & {
  rawBody?: Buffer;
};

type AuthExchangeRequest = {
  accessToken?: unknown;
  mfaCode?: unknown;
};

type ClerkExchangeRequest = {
  clerkToken?: unknown;
};

type AuthRefreshRequest = {
  refreshToken?: unknown;
};

type MfaEnrollRequest = {
  label?: unknown;
};

type MfaActivateRequest = {
  factorId?: unknown;
  code?: unknown;
};

type MfaDisableRequest = {
  code?: unknown;
};

type ScannerValidateRequest = {
  qrCodeValue?: unknown;
  deviceInfo?: unknown;
};

type ScannerCheckInRequest = {
  ticketId?: unknown;
  deviceInfo?: unknown;
};

type SessionPayload = {
  authenticated: boolean;
  user: AuthPrincipal | null;
  expiresAt?: string | null;
  refreshExpiresAt?: string | null;
};

type TicketTypeKey = 'ordinary' | 'vip';

const DEFAULT_INVENTORY: Record<TicketTypeKey, { price: number; totalCap: number; remaining: number }> = {
  ordinary: { price: 725, totalCap: 600, remaining: 600 },
  vip: { price: 1250, totalCap: 300, remaining: 300 },
};

const DEFAULT_EVENT_SLUG = 'fashion-show-2026';
const DEFAULT_EVENT_NAME = 'Fashion Show 2026';
const DEFAULT_EVENT_YEAR = '2026';
const DEFAULT_TICKET_PDF_BUCKET = 'tickets';

const app = express();
const port = Number(process.env.PORT || 8787);
const sessionStore: SessionStore = isPrismaAvailable() ? new PrismaSessionStore(prisma) : new InMemorySessionStore();
const authRepository: AuthRepository = isPrismaAvailable() ? new PrismaAuthRepository(prisma) : new InMemoryAuthRepository();
const sessionCookieName = buildAuthCookieName('katina-session');
const refreshCookieName = buildAuthCookieName('katina-refresh');

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const startupTimestamp = Date.now();

function logEvent(level: LogLevel, event: string, data: Record<string, unknown> = {}) {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    event,
    service: 'katina-tickets-api',
    environment: process.env.NODE_ENV || 'development',
    ...data,
  };

  const message = JSON.stringify(payload);
  if (level === 'error') {
    console.error(message);
    return;
  }

  if (level === 'warn') {
    console.warn(message);
    return;
  }

  console.log(message);
}

function resolveRequestId(request?: Request) {
  return request?.header('x-request-id')
    || request?.header('x-correlation-id')
    || request?.header('x-amzn-trace-id')
    || undefined;
}

function logStructuredEvent(level: LogLevel, prefix: string, route: string, step: string, data: Record<string, unknown> = {}) {
  logEvent(level, `${prefix} ${step}`, {
    route,
    prefix,
    step,
    ...data,
  });
}

function logPaymentError(prefix: string, route: string, step: string, error: unknown, data: Record<string, unknown> = {}) {
  const message = error instanceof Error ? error.message : String(error);
  const stackTrace = error instanceof Error ? error.stack : undefined;

  logStructuredEvent('error', prefix, route, step, {
    errorMessage: message,
    stackTrace,
    ...data,
  });
}

function hasValue(value: string | undefined) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isDatabaseConnectivityError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return message.includes("can't reach database server") || message.includes('prismaclientinitializationerror');
}

function isProductionRuntime() {
  return (process.env.NODE_ENV || '').toLowerCase() === 'production';
}

function validateStartupConfig() {
  const errors: string[] = [];
  const warnings: string[] = [];
  const nodeEnv = process.env.NODE_ENV || 'development';
  const dbConfigured = isPrismaAvailable();
  const dbRequired = nodeEnv === 'production' || process.env.REQUIRE_DATABASE === 'true';
  const appUrlConfigured = hasValue(process.env.APP_URL) || hasValue(process.env.APP_ORIGIN);
  const supabaseUrlConfigured = hasValue(process.env.SUPABASE_URL) || hasValue(process.env.VITE_SUPABASE_URL);
  const supabaseServiceKeyConfigured = hasValue(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const bilaSecretConfigured = hasValue(process.env.BILA_SECRET_KEY);
  const bilaWebhookSecretConfigured = hasValue(process.env.BILA_WEBHOOK_SECRET);

  if (!appUrlConfigured) {
    warnings.push('APP_URL_OR_ORIGIN_MISSING');
  }

  if (dbRequired && !dbConfigured) {
    errors.push('DATABASE_URL_REQUIRED');
  }

  if (supabaseServiceKeyConfigured && !supabaseUrlConfigured) {
    errors.push('SUPABASE_URL_REQUIRED_WITH_SERVICE_KEY');
  }

  if (hasValue(process.env.SUPABASE_TICKETS_BUCKET) && (!supabaseUrlConfigured || !supabaseServiceKeyConfigured)) {
    warnings.push('TICKET_STORAGE_BUCKET_CONFIGURED_WITHOUT_SUPABASE_ADMIN_CREDENTIALS');
  }

  if (isProductionRuntime() && !bilaSecretConfigured) {
    errors.push('BILA_SECRET_KEY_REQUIRED_IN_PRODUCTION');
  }

  if (isProductionRuntime() && !bilaWebhookSecretConfigured) {
    errors.push('BILA_WEBHOOK_SECRET_REQUIRED_IN_PRODUCTION');
  }

  if (bilaSecretConfigured && !bilaWebhookSecretConfigured) {
    warnings.push('BILA_WEBHOOK_SECRET_MISSING_SIGNATURE_VERIFICATION_REDUCED');
  }

  return {
    nodeEnv,
    dbConfigured,
    dbRequired,
    errors,
    warnings,
  };
}

async function checkDatabaseReadiness() {
  if (!isPrismaAvailable()) {
    return {
      configured: false,
      ready: true,
      reason: 'DATABASE_NOT_CONFIGURED',
    };
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
    return {
      configured: true,
      ready: true,
      reason: 'OK',
    };
  } catch (error) {
    return {
      configured: true,
      ready: false,
      reason: error instanceof Error ? error.message : 'DATABASE_UNAVAILABLE',
    };
  }
}

function normalizeAllowedOrigin(value: string | undefined) {
  if (!value || value.trim().length === 0) {
    return null;
  }

  const raw = value.trim();
  try {
    return new URL(raw).origin;
  } catch {
    return raw;
  }
}

const configuredOrigins = [
  process.env.APP_URL,
  process.env.APP_ORIGIN,
  process.env.VITE_APP_URL,
  ...(process.env.CSRF_ALLOWED_ORIGINS || '').split(',').map((value) => value.trim()),
]
  .map((value) => normalizeAllowedOrigin(value))
  .filter((value): value is string => typeof value === 'string' && value.length > 0);

const allowedOrigins = Array.from(
  new Set([
    ...configuredOrigins,
    'http://localhost:3000',
    'http://127.0.0.1:3000',
  ]),
);
const authRateLimiter = createInMemoryRateLimiter({ limit: 8, windowMs: 60_000 });
const paymentRateLimiter = createInMemoryRateLimiter({ limit: 20, windowMs: 60_000 });
const webhookRateLimiter = createInMemoryRateLimiter({ limit: 120, windowMs: 60_000 });
const ticketReadRateLimiter = createInMemoryRateLimiter({ limit: 60, windowMs: 60_000 });
const inMemoryWebhookEvents = new Set<string>();

function sanitizeString(value: string) {
  return value
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/[<>]/g, '')
    .trim();
}

function sanitizeUnknown(value: unknown): unknown {
  if (typeof value === 'string') {
    return sanitizeString(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeUnknown(item));
  }

  if (value && typeof value === 'object') {
    const input = value as Record<string, unknown>;
    const output: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(input)) {
      output[key] = sanitizeUnknown(nestedValue);
    }
    return output;
  }

  return value;
}

app.use(
  express.json({
    limit: '1mb',
    verify: (request, _response, buffer) => {
      (request as RequestWithRawBody).rawBody = Buffer.from(buffer);
    },
  }),
);

app.use((request, response, next) => {
  const forwardedProto = String(request.headers['x-forwarded-proto'] || '').toLowerCase();
  const secure = request.secure || forwardedProto === 'https';

  if (isProductionRuntime() && !secure) {
    const host = request.headers.host;
    if (host) {
      response.redirect(301, `https://${host}${request.originalUrl}`);
      return;
    }
  }

  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "connect-src 'self' https://api.usebila.com https://*.supabase.co",
    "font-src 'self' data:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');

  response.setHeader('Content-Security-Policy', csp);
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  if (isProductionRuntime()) {
    response.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  next();
});

app.use((request, _response, next) => {
  request.body = sanitizeUnknown(request.body);
  request.query = sanitizeUnknown(request.query) as Request['query'];
  next();
});

app.use((request, response, next) => {
  const contentType = String(request.headers['content-type'] || '').toLowerCase();
  if (contentType.includes('multipart/form-data')) {
    response.status(415).json({
      success: false,
      message: 'File uploads are not supported by this API.',
    });
    return;
  }

  next();
});

app.use((request, response, next) => {
  const requestStart = process.hrtime.bigint();

  response.on('finish', () => {
    const elapsedMs = Number(process.hrtime.bigint() - requestStart) / 1_000_000;
    logEvent('info', 'http.request.completed', {
      method: request.method,
      path: request.path,
      statusCode: response.statusCode,
      durationMs: Number(elapsedMs.toFixed(2)),
      ip: request.ip,
      userAgent: request.header('user-agent') ?? null,
    });
  });

  next();
});

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function resolveClerkSecretCandidates() {
  const useDevClerkInstance = !isProductionRuntime() && process.env.CLERK_USE_DEV_INSTANCE === 'true';
  const preferred = useDevClerkInstance ? process.env.CLERK_SECRET_KEY_DEV : process.env.CLERK_SECRET_KEY;
  const fallback = useDevClerkInstance ? process.env.CLERK_SECRET_KEY : process.env.CLERK_SECRET_KEY_DEV;
  const candidates: string[] = [];

  if (isNonEmptyString(preferred)) {
    candidates.push(preferred.trim());
  }

  // In development, allow fallback to the alternate secret to reduce stale-cookie
  // friction when switching between live and dev Clerk instances.
  if (!isProductionRuntime() && isNonEmptyString(fallback)) {
    const normalizedFallback = fallback.trim();
    if (!candidates.includes(normalizedFallback)) {
      candidates.push(normalizedFallback);
    }
  }

  return candidates;
}

function normalizeMfaCode(value: unknown) {
  if (!isNonEmptyString(value)) {
    return null;
  }

  const normalized = value.trim().toUpperCase();
  return normalized.length > 0 ? normalized : null;
}

function roleRequiresMfa(role: AppRole) {
  return MFA_RECOMMENDED_ROLES.includes(role);
}

function isAdminConsoleRole(role: AppRole) {
  return ['SUPER_ADMIN', 'ORGANIZER', 'SUPPORT', 'FINANCE'].includes(role);
}

function parseAdminConsoleAllowlist() {
  const raw = process.env.ADMIN_CONSOLE_ALLOWLIST_EMAILS || '';
  return new Set(
    raw
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter((email) => email.length > 0),
  );
}

function getAuthCookieValue(request: Request, cookieName: string) {
  const cookieHeader = request.headers.cookie;
  if (!cookieHeader) return null;

  const cookies = cookieHeader.split(';');
  for (const cookie of cookies) {
    const [rawName, ...rawValue] = cookie.split('=');
    if (rawName?.trim() === cookieName) {
      return decodeURIComponent(rawValue.join('=').trim());
    }
  }

  return null;
}

function setAuthCookies(response: Response, accessToken: string, refreshToken: string, expiresAt: Date, refreshExpiresAt: Date) {
  response.setHeader(
    'Set-Cookie',
    buildSetCookieHeaders([
      [sessionCookieName, accessToken, { ...getAuthCookieOptions(Math.max(60, Math.floor((expiresAt.getTime() - Date.now()) / 1000))) }],
      [refreshCookieName, refreshToken, { ...getAuthCookieOptions(Math.max(60, Math.floor((refreshExpiresAt.getTime() - Date.now()) / 1000))) }],
    ]),
  );
}

function clearAuthCookies(response: Response) {
  response.setHeader('Set-Cookie', [buildClearedCookie(sessionCookieName), buildClearedCookie(refreshCookieName)]);
}

async function emitAuditEvent(event: AuditEvent) {
  const payload = buildAuditEvent(event);
  logAuditEvent(event);

  try {
    await authRepository.recordAuditLog({
      action: payload.name,
      actorUserId: payload.actorUserId,
      targetUserId: payload.targetUserId,
      resourceType: payload.resourceType,
      resourceId: payload.resourceId,
      ipAddress: payload.ipAddress,
      userAgent: payload.userAgent,
      metadata: payload.metadata,
    });
  } catch (error) {
    logEvent('warn', 'audit.persist.failed', {
      action: payload.name,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function resolveUserHasActiveMfaFactor(userId: string) {
  if (!isPrismaAvailable()) {
    return false;
  }

  const count = await prisma.mfaFactor.count({
    where: {
      userId,
      type: 'TOTP',
      status: 'ACTIVE',
      revokedAt: null,
    },
  });

  return count > 0;
}

async function verifyUserMfaCode(userId: string, code: string) {
  if (!isPrismaAvailable()) {
    return false;
  }

  const factors = await prisma.mfaFactor.findMany({
    where: {
      userId,
      status: 'ACTIVE',
      revokedAt: null,
      type: { in: ['TOTP', 'BACKUP_CODE'] },
    },
    select: {
      id: true,
      type: true,
      secret: true,
    },
  });

  for (const factor of factors) {
    if (factor.type === 'TOTP' && factor.secret) {
      try {
        const secret = decryptMfaSecret(factor.secret);
        if (verifyTotpCode(secret, code, { window: 1 })) {
          return true;
        }
      } catch {
        continue;
      }
    }

    if (factor.type === 'BACKUP_CODE' && factor.secret) {
      if (hashRecoveryCode(code) === factor.secret) {
        await prisma.mfaFactor.update({
          where: { id: factor.id },
          data: {
            status: 'DISABLED',
            revokedAt: new Date(),
            secret: null,
          },
        });
        return true;
      }
    }
  }

  return false;
}

async function requireMfaForPrincipal(request: Request, response: Response, principal: AuthPrincipal) {
  if (!roleRequiresMfa(principal.role)) {
    return true;
  }

  const userHasActiveMfa = await resolveUserHasActiveMfaFactor(principal.userId);
  if (!userHasActiveMfa) {
    response.status(403).json({
      success: false,
      message: 'MFA enrollment is required for this role.',
      mfaRequired: true,
      mfaEnrolled: false,
    });
    await emitAuditEvent({
      name: 'MFA_FAILED',
      actorUserId: principal.userId,
      targetUserId: principal.userId,
      metadata: { reason: 'MFA_ENROLLMENT_REQUIRED', role: principal.role },
      request,
    });
    return false;
  }

  if (!principal.mfaEnabled) {
    response.status(403).json({
      success: false,
      message: 'MFA verification is required for this role.',
      mfaRequired: true,
      mfaEnrolled: true,
    });
    await emitAuditEvent({
      name: 'MFA_FAILED',
      actorUserId: principal.userId,
      targetUserId: principal.userId,
      metadata: { reason: 'MFA_VERIFICATION_REQUIRED', role: principal.role },
      request,
    });
    return false;
  }

  return true;
}

function buildSessionPayload(session: { principal: AuthPrincipal; expiresAt: Date; refreshExpiresAt: Date } | null): SessionPayload {
  if (!session) {
    return { authenticated: false, user: null };
  }

  return {
    authenticated: true,
    user: session.principal,
    expiresAt: session.expiresAt.toISOString(),
    refreshExpiresAt: session.refreshExpiresAt.toISOString(),
  };
}

async function resolveSessionFromCookie(request: Request): Promise<AuthPrincipal | null> {
  const token = getAuthCookieValue(request, sessionCookieName);
  if (!token) {
    return null;
  }

  const session = await sessionStore.getSessionByAccessToken(token);
  return session?.principal ?? null;
}

function resolveMfaFlag(requestedRole: AppRole) {
  return MFA_RECOMMENDED_ROLES.includes(requestedRole);
}

function parseWebhookSignature(signatureHeader: string | undefined) {
  if (!signatureHeader) return null;
  return signatureHeader.split(',')[0].trim();
}

function verifyWebhookSignature(rawBody: Buffer, signatureHeader: string | undefined) {
  const secret = process.env.BILA_WEBHOOK_SECRET?.trim();
  const providedSignature = parseWebhookSignature(signatureHeader);

  if (!secret || !providedSignature) {
    return false;
  }

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(expectedSignature, 'hex'),
    Buffer.from(providedSignature, 'hex')
  );
}

function toJsonObject(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }

  return value as Record<string, unknown>;
}

function toPrismaJson(value: Record<string, unknown> | undefined): Prisma.InputJsonValue | undefined {
  if (!value) {
    return undefined;
  }

  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function toInventoryEnum(ticketType: TicketTypeKey): 'ORDINARY' | 'VIP' {
  return ticketType === 'vip' ? 'VIP' : 'ORDINARY';
}

function fromInventoryEnum(value: 'ORDINARY' | 'VIP'): TicketTypeKey {
  return value === 'VIP' ? 'vip' : 'ordinary';
}

function parseTicketType(value: unknown): TicketTypeKey | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === 'ordinary' || normalized === 'vip') {
    return normalized;
  }

  return null;
}

function parseQuantity(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    return null;
  }

  return value;
}

function buildSeatDetails(reference: string, ticketType: TicketTypeKey, quantity: number) {
  const prefix = ticketType === 'vip' ? 'VIP' : 'ORD';
  const refPart = reference.slice(-8).toUpperCase();
  return Array.from({ length: quantity }, (_unused, index) => `${prefix}-${refPart}-${index + 1}`);
}

function base64UrlEncode(value: string) {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function signTicketToken(reference: string) {
  const secret = process.env.NEXTAUTH_SECRET || process.env.BILA_WEBHOOK_SECRET;
  if (!secret && process.env.NODE_ENV === 'production') {
    throw new Error('NEXTAUTH_SECRET or BILA_WEBHOOK_SECRET must be configured in production.');
  }

  const resolvedSecret = secret || 'katina-dev-ticket-secret';
  const payload = base64UrlEncode(
    JSON.stringify({
      ref: reference,
      iat: Date.now(),
      iss: 'katina-tickets',
    }),
  );
  const signature = crypto.createHmac('sha256', resolvedSecret).update(payload).digest('base64url');
  return `kt.${payload}.${signature}`;
}

function isDevAuthBypassEnabled() {
  const flag = String(process.env.ALLOW_DEV_AUTH_BYPASS ?? '').toLowerCase();
  const env = String(process.env.NODE_ENV ?? '').toLowerCase();
  const isDevOrTest = env === 'development' || env === 'test';
  return isDevOrTest && flag === 'true';
}

function isLoopbackOrigin(originHeader: string | undefined) {
  if (!originHeader) {
    return false;
  }

  try {
    const url = new URL(originHeader);
    return url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '::1';
  } catch {
    return false;
  }
}

async function buildTicketPdfBytes(input: {
  reference: string;
  fullName: string;
  email: string;
  ticketType: TicketTypeKey;
  quantity: number;
  seatDetails: string[];
  qrCodeValue: string;
}) {
  const document = await PDFDocument.create();
  const page = document.addPage([595, 842]); // A4
  const fontRegular = await document.embedFont(StandardFonts.Helvetica);
  const fontBold = await document.embedFont(StandardFonts.HelveticaBold);

  const drawLine = (label: string, value: string, y: number) => {
    page.drawText(label, { x: 56, y, size: 11, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
    page.drawText(value, { x: 180, y, size: 11, font: fontRegular, color: rgb(0.15, 0.15, 0.15) });
  };

  page.drawText('Fashion Show - Digital Ticket', {
    x: 56,
    y: 790,
    size: 24,
    font: fontBold,
    color: rgb(0.16, 0.05, 0.04),
  });

  page.drawText('This ticket was issued by Katina Tickets.', {
    x: 56,
    y: 768,
    size: 11,
    font: fontRegular,
    color: rgb(0.25, 0.25, 0.25),
  });

  drawLine('Event', 'Fashion Show', 736);
  drawLine('Date', '30 October 2026', 712);
  drawLine('Time', '6:00 PM - 9:00 PM', 688);
  drawLine('Venue', 'Mulungushi Conference Centre', 664);
  drawLine('Payment Reference', input.reference, 636);
  drawLine('Guest Name', input.fullName, 612);
  drawLine('Guest Email', input.email, 588);
  drawLine('Ticket Type', input.ticketType.toUpperCase(), 564);
  drawLine('Quantity', String(input.quantity), 540);
  drawLine('Seats', input.seatDetails.join(', '), 516);

  page.drawText(`Issued at: ${new Date().toISOString()}`, {
    x: 56,
    y: 484,
    size: 10,
    font: fontRegular,
    color: rgb(0.35, 0.35, 0.35),
  });

  page.drawText('Ticket Token (Scanner Payload)', {
    x: 56,
    y: 448,
    size: 11,
    font: fontBold,
    color: rgb(0.1, 0.1, 0.1),
  });
  page.drawText(input.qrCodeValue, {
    x: 56,
    y: 428,
    size: 8,
    font: fontRegular,
    color: rgb(0.2, 0.2, 0.2),
    maxWidth: 480,
    lineHeight: 10,
  });

  const qrDataUrl = await QRCode.toDataURL(input.qrCodeValue, {
    margin: 1,
    width: 220,
    errorCorrectionLevel: 'M',
  });
  const qrPngBytes = Buffer.from(qrDataUrl.replace(/^data:image\/png;base64,/, ''), 'base64');
  const qrImage = await document.embedPng(qrPngBytes);
  page.drawImage(qrImage, {
    x: 56,
    y: 180,
    width: 180,
    height: 180,
  });

  page.drawText('Present this QR at entry for scanning.', {
    x: 56,
    y: 160,
    size: 10,
    font: fontRegular,
    color: rgb(0.25, 0.25, 0.25),
  });

  return await document.save();
}

function buildTicketPdfStoragePath(reference: string, ticketId?: string) {
  const normalizedReference = reference.replace(/[^A-Za-z0-9_-]/g, '-');
  if (!ticketId) {
    return `${DEFAULT_EVENT_YEAR}/${normalizedReference}.pdf`;
  }

  const normalizedTicketId = ticketId.replace(/[^A-Za-z0-9_-]/g, '-');
  return `${DEFAULT_EVENT_YEAR}/${normalizedReference}-${normalizedTicketId}.pdf`;
}

function computeSha256Hex(value: Uint8Array) {
  return crypto.createHash('sha256').update(Buffer.from(value)).digest('hex');
}

function isValidPdfBuffer(value: Uint8Array) {
  if (value.length < 5) {
    return false;
  }

  const signature = Buffer.from(value.slice(0, 5)).toString('utf8');
  return signature === '%PDF-';
}

function getTicketStorageClient() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = process.env.SUPABASE_TICKETS_BUCKET || DEFAULT_TICKET_PDF_BUCKET;

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return {
    client,
    bucket,
  };
}

async function downloadTicketPdfFromStorage(storagePath: string) {
  const storage = getTicketStorageClient();
  if (!storage) {
    return null;
  }

  const result = await storage.client.storage.from(storage.bucket).download(storagePath);
  if (result.error || !result.data) {
    return null;
  }

  const buffer = new Uint8Array(await result.data.arrayBuffer());
  return isValidPdfBuffer(buffer) ? buffer : null;
}

async function uploadTicketPdfToStorage(storagePath: string, bytes: Uint8Array) {
  const storage = getTicketStorageClient();
  if (!storage) {
    return false;
  }

  const result = await storage.client.storage.from(storage.bucket).upload(storagePath, Buffer.from(bytes), {
    cacheControl: '3600',
    contentType: 'application/pdf',
    upsert: true,
  });

  return !result.error;
}

const MAX_TICKET_PDF_UPLOAD_RETRIES = 5;
const TICKET_PDF_RETRY_INTERVAL_MS = 5 * 60 * 1000;

function resolveInternalRetryToken() {
  return (process.env.PDF_UPLOAD_RETRY_TOKEN || '').trim();
}

function isInternalRetryAuthorized(request: Request) {
  const expected = resolveInternalRetryToken();
  if (!expected) {
    return false;
  }

  const authorization = request.header('authorization') || '';
  const bearerToken = authorization.toLowerCase().startsWith('bearer ')
    ? authorization.slice(7).trim()
    : '';
  return bearerToken.length > 0 && bearerToken === expected;
}

async function enqueueFailedPdfUpload(input: {
  paymentReference: string;
  ticketRecordId: string;
  ticketPublicId: string;
  storagePath: string;
  errorMessage: string;
}) {
  if (!isPrismaAvailable()) {
    return;
  }

  const nextAttemptAt = new Date(Date.now() + TICKET_PDF_RETRY_INTERVAL_MS);

  await prisma.failedPdfUpload.upsert({
    where: {
      ticketRecordId: input.ticketRecordId,
    },
    create: {
      paymentReference: input.paymentReference,
      ticketRecordId: input.ticketRecordId,
      ticketPublicId: input.ticketPublicId,
      storagePath: input.storagePath,
      status: 'PENDING',
      attemptCount: 0,
      lastError: input.errorMessage,
      nextAttemptAt,
    },
    update: {
      paymentReference: input.paymentReference,
      ticketPublicId: input.ticketPublicId,
      storagePath: input.storagePath,
      status: 'PENDING',
      lastError: input.errorMessage,
      nextAttemptAt,
    },
  });
}

async function processPendingPdfUploadRetry(row: {
  id: string;
  paymentReference: string;
  ticketRecordId: string;
  ticketPublicId: string;
  storagePath: string;
  attemptCount: number;
}) {
  const now = new Date();
  const nextAttemptCount = row.attemptCount + 1;

  const reservation = await prisma.paymentReservation.findUnique({
    where: { paymentReference: row.paymentReference },
    select: {
      fullName: true,
      email: true,
      ticketType: true,
      quantity: true,
      seatDetails: true,
    },
  });
  const ticket = await prisma.ticket.findUnique({
    where: { id: row.ticketRecordId },
    select: {
      id: true,
      ticketId: true,
      qrCodeValue: true,
    },
  });

  if (!reservation || !ticket) {
    await prisma.failedPdfUpload.update({
      where: { id: row.id },
      data: {
        status: 'EXHAUSTED',
        attemptCount: nextAttemptCount,
        lastAttemptAt: now,
        nextAttemptAt: now,
        lastError: !reservation
          ? 'Reservation not found while retrying PDF upload.'
          : 'Ticket not found while retrying PDF upload.',
      },
    });

    logEvent('error', 'ticket.pdf.upload.retry.exhausted', {
      reference: row.paymentReference,
      ticketId: row.ticketPublicId,
      storagePath: row.storagePath,
      attempts: nextAttemptCount,
      actionRequired: true,
      reason: 'MISSING_DATA',
    });
    return { status: 'exhausted' as const };
  }

  const seatDetails = Array.isArray(reservation.seatDetails)
    ? reservation.seatDetails.filter((item): item is string => typeof item === 'string')
    : [];

  try {
    const pdfBytes = await buildTicketPdfBytes({
      reference: row.paymentReference,
      fullName: reservation.fullName,
      email: reservation.email,
      ticketType: fromInventoryEnum(reservation.ticketType),
      quantity: reservation.quantity,
      seatDetails,
      qrCodeValue: ticket.qrCodeValue || signTicketToken(row.paymentReference),
    });

    const uploaded = await uploadTicketPdfToStorage(row.storagePath, pdfBytes);
    if (uploaded) {
      await prisma.$transaction([
        prisma.ticket.update({
          where: { id: ticket.id },
          data: {
            pdfStoragePath: row.storagePath,
            pdfChecksum: computeSha256Hex(pdfBytes),
            pdfGeneratedAt: now,
          },
        }),
        prisma.failedPdfUpload.update({
          where: { id: row.id },
          data: {
            status: 'SUCCEEDED',
            attemptCount: nextAttemptCount,
            lastAttemptAt: now,
            nextAttemptAt: now,
            lastError: null,
          },
        }),
      ]);

      logEvent('info', 'ticket.pdf.upload.retry.succeeded', {
        reference: row.paymentReference,
        ticketId: row.ticketPublicId,
        storagePath: row.storagePath,
        attempt: nextAttemptCount,
      });
      return { status: 'succeeded' as const };
    }

    const exhausted = nextAttemptCount >= MAX_TICKET_PDF_UPLOAD_RETRIES;
    const nextAttemptAt = exhausted ? now : new Date(Date.now() + TICKET_PDF_RETRY_INTERVAL_MS * nextAttemptCount);
    await prisma.failedPdfUpload.update({
      where: { id: row.id },
      data: {
        status: exhausted ? 'EXHAUSTED' : 'PENDING',
        attemptCount: nextAttemptCount,
        lastAttemptAt: now,
        nextAttemptAt,
        lastError: 'Storage upload failed during retry run.',
      },
    });

    logEvent('error', exhausted ? 'ticket.pdf.upload.retry.exhausted' : 'ticket.pdf.upload.retry.failed', {
      reference: row.paymentReference,
      ticketId: row.ticketPublicId,
      storagePath: row.storagePath,
      attempt: nextAttemptCount,
      actionRequired: true,
    });

    return { status: exhausted ? 'exhausted' as const : 'failed' as const };
  } catch (error) {
    const exhausted = nextAttemptCount >= MAX_TICKET_PDF_UPLOAD_RETRIES;
    const nextAttemptAt = exhausted ? now : new Date(Date.now() + TICKET_PDF_RETRY_INTERVAL_MS * nextAttemptCount);
    await prisma.failedPdfUpload.update({
      where: { id: row.id },
      data: {
        status: exhausted ? 'EXHAUSTED' : 'PENDING',
        attemptCount: nextAttemptCount,
        lastAttemptAt: now,
        nextAttemptAt,
        lastError: error instanceof Error ? error.message : String(error),
      },
    });

    logEvent('error', exhausted ? 'ticket.pdf.upload.retry.exhausted' : 'ticket.pdf.upload.retry.failed', {
      reference: row.paymentReference,
      ticketId: row.ticketPublicId,
      storagePath: row.storagePath,
      attempt: nextAttemptCount,
      actionRequired: true,
      error: error instanceof Error ? error.message : String(error),
    });

    return { status: exhausted ? 'exhausted' as const : 'failed' as const };
  }
}

async function ensureDefaultEvent() {
  if (!isPrismaAvailable()) {
    return null;
  }

  return await prisma.event.upsert({
    where: { slug: DEFAULT_EVENT_SLUG },
    update: { name: DEFAULT_EVENT_NAME },
    create: {
      slug: DEFAULT_EVENT_SLUG,
      name: DEFAULT_EVENT_NAME,
      startsAt: new Date('2026-10-30T18:00:00.000Z'),
    },
    select: {
      id: true,
      name: true,
    },
  });
}

function buildTicketIdFromSequence(sequenceNumber: number) {
  return `KB-${DEFAULT_EVENT_YEAR}-${String(sequenceNumber).padStart(6, '0')}`;
}

function buildQrCodeValue() {
  return `ktk_${crypto.randomUUID().replace(/-/g, '')}`;
}

async function issueNextTicketSequenceNumber(tx: Prisma.TransactionClient) {
  const sequence = await tx.ticketSequence.upsert({
    where: { id: 1 },
    update: {
      lastIssued: {
        increment: 1,
      },
    },
    create: {
      id: 1,
      lastIssued: 1,
    },
    select: {
      lastIssued: true,
    },
  });

  return sequence.lastIssued;
}

async function createTicketsForReservation(tx: Prisma.TransactionClient, input: {
  reservationId: string;
  eventId: string;
  ticketType: 'ORDINARY' | 'VIP';
  holderName: string;
  holderEmail: string;
  quantity: number;
}) {
  const existingCount = await tx.ticket.count({
    where: { reservationId: input.reservationId },
  });

  const missingCount = Math.max(0, input.quantity - existingCount);
  if (missingCount === 0) {
    return;
  }

  for (let index = 0; index < missingCount; index += 1) {
    const sequenceNumber = await issueNextTicketSequenceNumber(tx);
    await tx.ticket.create({
      data: {
        ticketId: buildTicketIdFromSequence(sequenceNumber),
        qrCodeValue: buildQrCodeValue(),
        reservationId: input.reservationId,
        eventId: input.eventId,
        ticketType: input.ticketType,
        holderName: input.holderName,
        holderEmail: input.holderEmail,
      },
    });
  }
}

async function backfillTicketsFromReservations(eventId: string) {
  if (!isPrismaAvailable()) {
    return;
  }

  const reservations = await prisma.paymentReservation.findMany({
    select: {
      id: true,
      fullName: true,
      email: true,
      quantity: true,
      ticketType: true,
      tickets: {
        select: { id: true },
      },
    },
  });

  for (const reservation of reservations) {
    if (reservation.tickets.length >= reservation.quantity) {
      continue;
    }

    await prisma.$transaction(async (tx) => {
      await createTicketsForReservation(tx, {
        reservationId: reservation.id,
        eventId,
        ticketType: reservation.ticketType,
        holderName: reservation.fullName,
        holderEmail: reservation.email,
        quantity: reservation.quantity,
      });
    });
  }
}

async function ensureTicketDomainSeed() {
  if (!isPrismaAvailable()) {
    return;
  }

  const event = await ensureDefaultEvent();
  if (!event) {
    return;
  }

  await backfillTicketsFromReservations(event.id);
}

function resolveScanResultForTicketStatus(status: 'ACTIVE' | 'CHECKED_IN' | 'REFUNDED' | 'CANCELLED') {
  if (status === 'ACTIVE') {
    return 'VALID' as const;
  }
  if (status === 'CHECKED_IN') {
    return 'ALREADY_CHECKED_IN' as const;
  }
  if (status === 'REFUNDED') {
    return 'REFUNDED' as const;
  }
  return 'CANCELLED' as const;
}

async function recordTicketScanLog(input: {
  ticketId?: string | null;
  scannerAdminId?: string | null;
  result: 'VALID' | 'ALREADY_CHECKED_IN' | 'REFUNDED' | 'CANCELLED' | 'INVALID_TICKET';
  scannedValue: string;
  deviceInfo?: Record<string, unknown>;
}) {
  if (!isPrismaAvailable()) {
    return;
  }

  await prisma.ticketScanLog.create({
    data: {
      ticketId: input.ticketId ?? null,
      scannerAdminId: input.scannerAdminId ?? null,
      result: input.result,
      scannedValue: input.scannedValue,
      deviceInfo: toPrismaJson(input.deviceInfo),
    },
  });
}

async function ensureTicketInventorySeed() {
  if (!isPrismaAvailable()) {
    return;
  }

  const alignInventory = async (type: 'ORDINARY' | 'VIP', defaults: { price: number; totalCap: number; remaining: number }) => {
    const existing = await prisma.ticketInventory.findUnique({ where: { type } });

    if (!existing) {
      await prisma.ticketInventory.create({
        data: {
          type,
          price: defaults.price,
          totalCap: defaults.totalCap,
          remaining: defaults.remaining,
        },
      });
      return;
    }

    const sold = Math.max(0, existing.totalCap - existing.remaining);
    const nextRemaining = Math.max(0, defaults.totalCap - sold);

    await prisma.ticketInventory.update({
      where: { type },
      data: {
        price: defaults.price,
        totalCap: defaults.totalCap,
        remaining: nextRemaining,
      },
    });
  };

  await alignInventory('ORDINARY', DEFAULT_INVENTORY.ordinary);
  await alignInventory('VIP', DEFAULT_INVENTORY.vip);
}

async function listInventory() {
  if (!isPrismaAvailable()) {
    return [
      {
        ticketType: 'ordinary' as TicketTypeKey,
        price: DEFAULT_INVENTORY.ordinary.price,
        totalCap: DEFAULT_INVENTORY.ordinary.totalCap,
        remaining: DEFAULT_INVENTORY.ordinary.remaining,
      },
      {
        ticketType: 'vip' as TicketTypeKey,
        price: DEFAULT_INVENTORY.vip.price,
        totalCap: DEFAULT_INVENTORY.vip.totalCap,
        remaining: DEFAULT_INVENTORY.vip.remaining,
      },
    ];
  }

  await ensureTicketInventorySeed();
  const rows = await prisma.ticketInventory.findMany({ orderBy: { type: 'asc' } });
  return rows.map((row) => ({
    ticketType: fromInventoryEnum(row.type),
    price: row.price,
    totalCap: row.totalCap,
    remaining: row.remaining,
  }));
}

async function finalizeReservationForPaidPayment(reference: string) {
  if (!isPrismaAvailable()) {
    return false;
  }

  logStructuredEvent('info', '[TICKET]', 'server.finalizeReservationForPaidPayment', 'reservation.finalization.started', {
    paymentReference: reference,
  });

  const event = await ensureDefaultEvent();
  if (!event) {
    return false;
  }

  logStructuredEvent('info', '[DATABASE]', 'server.finalizeReservationForPaidPayment', 'query.payment.transaction.started', {
    paymentReference: reference,
  });

  const payment = await prisma.paymentTransaction.findUnique({
    where: { reference },
    select: {
      reference: true,
      userId: true,
      customerEmail: true,
      customerName: true,
      status: true,
      metadata: true,
    },
  });

  if (!payment) {
    logStructuredEvent('warn', '[DATABASE]', 'server.finalizeReservationForPaidPayment', 'query.payment.transaction.not.found', {
      paymentReference: reference,
    });
    return false;
  }

  if (payment.status !== 'PAID') {
    logStructuredEvent('warn', '[DATABASE]', 'server.finalizeReservationForPaidPayment', 'payment.status.not.paid', {
      paymentReference: reference,
      paymentStatus: payment.status,
    });
    return false;
  }

  logStructuredEvent('info', '[DATABASE]', 'server.finalizeReservationForPaidPayment', 'query.payment.transaction.succeeded', {
    paymentReference: reference,
    userId: payment.userId,
    paymentStatus: payment.status,
  });

  const metadata = (payment.metadata ?? {}) as Record<string, unknown>;
  const ticketType = parseTicketType(metadata.ticketType);
  const quantity = parseQuantity(metadata.quantity);
  if (!ticketType || !quantity) {
    return false;
  }

  try {
    logStructuredEvent('info', '[DATABASE]', 'server.finalizeReservationForPaidPayment', 'reservation.transaction.started', {
      paymentReference: reference,
      ticketType,
      quantity,
    });

    await prisma.$transaction(async (tx) => {
      logStructuredEvent('info', '[DATABASE]', 'server.finalizeReservationForPaidPayment', 'query.payment.reservation.started', {
        paymentReference: reference,
      });
      const existing = await tx.paymentReservation.findUnique({ where: { paymentReference: reference } });
      if (existing) {
        logStructuredEvent('info', '[DATABASE]', 'server.finalizeReservationForPaidPayment', 'query.payment.reservation.succeeded', {
          paymentReference: reference,
          orderId: existing.id,
        });
        await createTicketsForReservation(tx, {
          reservationId: existing.id,
          eventId: event.id,
          ticketType: toInventoryEnum(ticketType),
          holderName: existing.fullName,
          holderEmail: existing.email,
          quantity: existing.quantity,
        });
        return;
      }

      const inventoryResult = await tx.ticketInventory.updateMany({
        where: {
          type: toInventoryEnum(ticketType),
          remaining: { gte: quantity },
        },
        data: {
          remaining: { decrement: quantity },
        },
      });

      logStructuredEvent('info', '[DATABASE]', 'server.finalizeReservationForPaidPayment', 'inventory.update.succeeded', {
        paymentReference: reference,
        ticketType,
        rowsAffected: inventoryResult.count,
      });

      if (inventoryResult.count === 0) {
        throw new Error('INSUFFICIENT_INVENTORY');
      }

      const reservation = await tx.paymentReservation.create({
        data: {
          paymentReference: reference,
          userId: payment.userId,
          fullName: payment.customerName ?? 'Guest',
          email: payment.customerEmail ?? 'guest@example.com',
          ticketType: toInventoryEnum(ticketType),
          quantity,
          seatDetails: buildSeatDetails(reference, ticketType, quantity),
        },
      });

      logStructuredEvent('info', '[DATABASE]', 'server.finalizeReservationForPaidPayment', 'reservation.created', {
        paymentReference: reference,
        orderId: reservation.id,
        ticketType,
        quantity: reservation.quantity,
      });

      await createTicketsForReservation(tx, {
        reservationId: reservation.id,
        eventId: event.id,
        ticketType: toInventoryEnum(ticketType),
        holderName: reservation.fullName,
        holderEmail: reservation.email,
        quantity: reservation.quantity,
      });
    }, {
      isolationLevel: 'Serializable',
    });

    logStructuredEvent('info', '[TICKET]', 'server.finalizeReservationForPaidPayment', 'reservation.finalization.succeeded', {
      paymentReference: reference,
    });
    return true;
  } catch (error) {
    logPaymentError('[TICKET]', 'server.finalizeReservationForPaidPayment', 'reservation.finalization.failed', error, {
      paymentReference: reference,
    });
    return false;
  }
}

async function queueTicketDeliveryAfterPersistence(reference: string) {
  if (!isPrismaAvailable()) {
    return false;
  }

  logStructuredEvent('info', '[TICKET]', 'server.queueTicketDeliveryAfterPersistence', 'ticket.delivery.check.started', {
    paymentReference: reference,
  });

  const reservation = await prisma.paymentReservation.findUnique({
    where: { paymentReference: reference },
    select: {
      id: true,
      fullName: true,
      email: true,
      ticketType: true,
      quantity: true,
      seatDetails: true,
      tickets: {
        select: {
          id: true,
          ticketId: true,
          qrCodeValue: true,
          pdfStoragePath: true,
          pdfChecksum: true,
        },
      },
    },
  });

  if (!reservation || reservation.tickets.length < reservation.quantity) {
    logStructuredEvent('warn', '[TICKET]', 'server.queueTicketDeliveryAfterPersistence', 'ticket.delivery.skipped.persistence.incomplete', {
      paymentReference: reference,
      reservationFound: Boolean(reservation),
      expectedTicketCount: reservation?.quantity ?? null,
      actualTicketCount: reservation?.tickets.length ?? null,
    });
    return false;
  }

  logStructuredEvent('info', '[TICKET]', 'server.queueTicketDeliveryAfterPersistence', 'ticket.delivery.ready', {
    paymentReference: reference,
    email: reservation.email,
    ticketCount: reservation.tickets.length,
    providerConfigured: hasValue(process.env.TICKET_DELIVERY_PROVIDER),
  });

  const seatDetails = Array.isArray(reservation.seatDetails)
    ? reservation.seatDetails.filter((item): item is string => typeof item === 'string')
    : [];

  for (const ticket of reservation.tickets) {
    if (ticket.pdfStoragePath && ticket.pdfChecksum) {
      continue;
    }

    try {
      const storagePath = buildTicketPdfStoragePath(reference, ticket.ticketId);

      const pdfBytes = await buildTicketPdfBytes({
        reference,
        fullName: reservation.fullName,
        email: reservation.email,
        ticketType: fromInventoryEnum(reservation.ticketType),
        quantity: reservation.quantity,
        seatDetails,
        qrCodeValue: ticket.qrCodeValue || signTicketToken(reference),
      });

      const checksum = computeSha256Hex(pdfBytes);
      const uploaded = await uploadTicketPdfToStorage(storagePath, pdfBytes);

      if (uploaded) {
        await prisma.ticket.update({
          where: { id: ticket.id },
          data: {
            pdfStoragePath: storagePath,
            pdfChecksum: checksum,
            pdfGeneratedAt: new Date(),
          },
        });

        logStructuredEvent('info', '[TICKET]', 'server.queueTicketDeliveryAfterPersistence', 'pdf.eager.generated', {
          paymentReference: reference,
          ticketId: ticket.ticketId,
        });
      } else {
        logStructuredEvent('warn', '[TICKET]', 'server.queueTicketDeliveryAfterPersistence', 'pdf.eager.upload.failed', {
          paymentReference: reference,
          ticketId: ticket.ticketId,
        });

        await enqueueFailedPdfUpload({
          paymentReference: reference,
          ticketRecordId: ticket.id,
          ticketPublicId: ticket.ticketId,
          storagePath,
          errorMessage: 'Eager PDF generation upload failed after payment finalization.',
        });
      }
    } catch (error) {
      logPaymentError('[TICKET]', 'server.queueTicketDeliveryAfterPersistence', 'pdf.eager.generation.failed', error, {
        paymentReference: reference,
        ticketId: ticket.ticketId,
      });
    }
  }

  return true;
}

async function persistPaymentIntent(input: {
  reference: string;
  amount: number;
  currency: string;
  description: string;
  customerEmail?: string;
  customerName?: string;
  userId?: string;
  metadata?: Record<string, unknown>;
}) {
  if (!isPrismaAvailable()) {
    return;
  }

  logStructuredEvent('info', '[DATABASE]', 'server.persistPaymentIntent', 'create.payment.transaction.started', {
    paymentReference: input.reference,
    userId: input.userId,
    amount: input.amount,
    currency: input.currency,
    description: input.description,
  });

  try {
    await prisma.paymentTransaction.create({
      data: {
        reference: input.reference,
        amount: Math.round(input.amount),
        currency: input.currency,
        description: input.description,
        customerEmail: input.customerEmail,
        customerName: input.customerName,
        userId: input.userId,
        status: 'PENDING',
        metadata: toPrismaJson(input.metadata),
      },
    });

    logStructuredEvent('info', '[DATABASE]', 'server.persistPaymentIntent', 'create.payment.transaction.succeeded', {
      paymentReference: input.reference,
      userId: input.userId,
      paymentStatus: 'PENDING',
      rowsAffected: 1,
    });
  } catch (error) {
    logPaymentError('[DATABASE]', 'server.persistPaymentIntent', 'create.payment.transaction.failed', error, {
      paymentReference: input.reference,
      userId: input.userId,
    });
    throw error;
  }
}

async function updatePaymentIntentFromWebhook(input: {
  reference: string;
  providerPaymentId?: string;
  status: 'PENDING' | 'PAID' | 'FAILED' | 'CANCELLED' | 'REFUNDED';
}) {
  if (!isPrismaAvailable()) {
    return false;
  }

  const now = new Date();
  logStructuredEvent('info', '[DATABASE]', 'server.updatePaymentIntentFromWebhook', 'update.payment.transaction.started', {
    paymentReference: input.reference,
    providerPaymentId: input.providerPaymentId,
    paymentStatus: input.status,
  });

  try {
    const result = await prisma.paymentTransaction.updateMany({
      where: { reference: input.reference },
      data: {
        providerPaymentId: input.providerPaymentId,
        status: input.status,
        paidAt: input.status === 'PAID' ? now : undefined,
        failedAt: input.status === 'FAILED' ? now : undefined,
        cancelledAt: input.status === 'CANCELLED' ? now : undefined,
        refundedAt: input.status === 'REFUNDED' ? now : undefined,
      },
    });

    logStructuredEvent('info', '[DATABASE]', 'server.updatePaymentIntentFromWebhook', 'update.payment.transaction.succeeded', {
      paymentReference: input.reference,
      providerPaymentId: input.providerPaymentId,
      paymentStatus: input.status,
      rowsAffected: result.count,
    });

    return result.count > 0;
  } catch (error) {
    logPaymentError('[DATABASE]', 'server.updatePaymentIntentFromWebhook', 'update.payment.transaction.failed', error, {
      paymentReference: input.reference,
      providerPaymentId: input.providerPaymentId,
      paymentStatus: input.status,
    });
    throw error;
  }
}

async function resolvePaymentReference(providerPaymentId?: string, transactionId?: string): Promise<string | null> {
  if (!isPrismaAvailable()) return null;

  const conditions = [
    providerPaymentId ? { providerPaymentId } : undefined,
    transactionId ? { providerPaymentId: transactionId } : undefined,
  ].filter(Boolean);

  if (conditions.length === 0) return null;

  const match = await prisma.paymentTransaction.findFirst({
    where: { OR: conditions as any },
    select: { reference: true },
  });

  return match?.reference ?? null;
}

function mapBilaStatusToPaymentStatus(status: string | undefined) {
  if (status === 'completed') {
    return 'PAID' as const;
  }

  if (status === 'failed') {
    return 'FAILED' as const;
  }

  if (status === 'refunded') {
    return 'REFUNDED' as const;
  }

  if (status === 'pending') {
    return 'PENDING' as const;
  }

  return 'PENDING' as const;
}

async function applyPaymentStatusAndFinalize(input: {
  reference: string;
  providerPaymentId?: string;
  status: 'PENDING' | 'PAID' | 'FAILED' | 'CANCELLED' | 'REFUNDED';
}) {
  const transactionUpdated = await updatePaymentIntentFromWebhook({
    reference: input.reference,
    providerPaymentId: input.providerPaymentId,
    status: input.status,
  });

  if (input.status !== 'PAID') {
    if (input.status === 'FAILED' || input.status === 'CANCELLED' || input.status === 'REFUNDED') {
      logEvent('warn', 'payment.status.nonpaid', {
        reference: input.reference,
        status: input.status,
        transactionUpdated,
      });
    }

    return {
      transactionUpdated,
      reservationFinalized: false,
      ticketDeliveryReady: false,
    };
  }

  const reservationFinalized = await finalizeReservationForPaidPayment(input.reference);
  const ticketDeliveryReady = reservationFinalized
    ? await queueTicketDeliveryAfterPersistence(input.reference)
    : false;

  return {
    transactionUpdated,
    reservationFinalized,
    ticketDeliveryReady,
  };
}

async function persistWebhookDelivery(input: {
  providerEventId: string;
  signature?: string;
  payload: Record<string, unknown>;
}) {
  if (!isPrismaAvailable()) {
    if (inMemoryWebhookEvents.has(input.providerEventId)) {
      logStructuredEvent('info', '[DATABASE]', 'server.persistWebhookDelivery', 'duplicate.webhook.skipped', {
        eventId: input.providerEventId,
      });
      return false;
    }

    inMemoryWebhookEvents.add(input.providerEventId);
    logStructuredEvent('info', '[DATABASE]', 'server.persistWebhookDelivery', 'webhook.delivery.cached', {
      eventId: input.providerEventId,
    });
    return true;
  }

  logStructuredEvent('info', '[DATABASE]', 'server.persistWebhookDelivery', 'create.webhook.delivery.started', {
    eventId: input.providerEventId,
  });

  try {
    await prisma.webhookDelivery.create({
      data: {
        provider: 'BILA',
        providerEventId: input.providerEventId,
        signature: input.signature,
        payload: toPrismaJson(input.payload) ?? ({} as Prisma.InputJsonValue),
      },
    });
    logStructuredEvent('info', '[DATABASE]', 'server.persistWebhookDelivery', 'create.webhook.delivery.succeeded', {
      eventId: input.providerEventId,
    });
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('Unique constraint failed')) {
      logStructuredEvent('info', '[DATABASE]', 'server.persistWebhookDelivery', 'duplicate.webhook.delivery', {
        eventId: input.providerEventId,
        errorMessage: message,
      });
      return false;
    }
    logPaymentError('[DATABASE]', 'server.persistWebhookDelivery', 'create.webhook.delivery.failed', error, {
      eventId: input.providerEventId,
    });
    throw error;
  }
}

app.get('/api/health', async (_request: Request, response: Response) => {
  const db = await checkDatabaseReadiness();

  response.json({
    ok: true,
    service: 'katina-tickets-api',
    uptimeSeconds: Math.round((Date.now() - startupTimestamp) / 1000),
    environment: process.env.NODE_ENV || 'development',
    dependencies: {
      database: db,
    },
  });
});

app.get('/api/readiness', async (_request: Request, response: Response) => {
  const db = await checkDatabaseReadiness();
  const ready = db.ready;

  if (!ready) {
    response.status(503).json({
      ok: false,
      ready: false,
      service: 'katina-tickets-api',
      dependencies: {
        database: db,
      },
    });
    return;
  }

  response.json({
    ok: true,
    ready: true,
    service: 'katina-tickets-api',
    dependencies: {
      database: db,
    },
  });
});

app.get('/api/inventory', async (_request: Request, response: Response) => {
  const items = await listInventory();
  response.json({ success: true, items });
});

app.get('/api/session-auth/session', async (request: Request, response: Response) => {
  const token = getAuthCookieValue(request, sessionCookieName);
  if (!token) {
    response.json({ authenticated: false, user: null });
    return;
  }

  const session = await sessionStore.getSessionByAccessToken(token);
  if (!session) {
    response.json({ authenticated: false, user: null });
    return;
  }

  response.json(buildSessionPayload(session));
});

app.post('/api/session-auth/exchange', authRateLimiter, createOriginGuard(allowedOrigins), createCsrfGuard(allowedOrigins), async (request: Request, response: Response) => {
  const body = request.body as AuthExchangeRequest;
  const accessToken = typeof body?.accessToken === 'string' ? body.accessToken : null;
  const providedMfaCode = normalizeMfaCode(body?.mfaCode);

  if (!accessToken) {
    response.status(400).json({ success: false, message: 'An access token is required.' });
    return;
  }

  const verifiedUser = await verifySupabaseAccessToken(accessToken);
  let principal: AuthPrincipal | null = null;

  if (verifiedUser) {
    const normalizedEmail = verifiedUser.email.trim().toLowerCase();
    const adminAllowlist = parseAdminConsoleAllowlist();
    const isAllowlistedAdmin = adminAllowlist.has(normalizedEmail);

    const requestedRole = verifiedUser.role;
    const role = isAllowlistedAdmin
      ? (isAdminConsoleRole(requestedRole) ? requestedRole : 'SUPER_ADMIN')
      : (isAdminConsoleRole(requestedRole) ? 'CUSTOMER' : requestedRole);

    logEvent('info', 'auth.exchange.supabase', {
      email: normalizedEmail,
      allowlistSize: adminAllowlist.size,
      isAllowlistedAdmin,
      requestedRole,
      finalRole: role,
      allowlistEmails: Array.from(adminAllowlist),
    });

    const user = await authRepository.upsertUserFromOAuth({
      id: verifiedUser.id,
      email: verifiedUser.email,
      role,
      mfaEnabled: verifiedUser.mfaEnabled,
    });

    // Skip MFA requirement for allowlisted admins since they're already authenticated via allowlist
    const shouldRequireMfa = roleRequiresMfa(user.role) && !isAllowlistedAdmin;
    const hasActiveMfaFactor = shouldRequireMfa
      ? await resolveUserHasActiveMfaFactor(user.id)
      : false;

    if (hasActiveMfaFactor) {
      if (!providedMfaCode || !(await verifyUserMfaCode(user.id, providedMfaCode))) {
        await emitAuditEvent({
          name: 'MFA_FAILED',
          actorUserId: user.id,
          targetUserId: user.id,
          metadata: { reason: 'MFA_CHALLENGE_FAILED', role: user.role },
          request,
        });
        response.status(401).json({
          success: false,
          message: 'MFA code is required to complete sign-in.',
          mfaRequired: true,
        });
        return;
      }

      await prisma.user.update({
        where: { id: user.id },
        data: { mfaEnabled: true },
      });
      await emitAuditEvent({
        name: 'MFA_VERIFIED',
        actorUserId: user.id,
        targetUserId: user.id,
        metadata: { source: 'AUTH_EXCHANGE' },
        request,
      });
    }

    principal = {
      userId: user.id,
      email: user.email,
      role: user.role,
      mfaEnabled: hasActiveMfaFactor ? true : user.mfaEnabled,
    };
  } else if (isDevAuthBypassEnabled() && accessToken.startsWith('dev-session:')) {
    if (!isLoopbackOrigin(request.headers.origin)) {
      response.status(403).json({ success: false, message: 'Development auth bypass is only allowed from localhost origins.' });
      return;
    }

    const tokenParts = accessToken.split(':');
    if (tokenParts.length !== 3) {
      response.status(400).json({ success: false, message: 'Invalid development token format.' });
      return;
    }

    const [, email = '', role = 'CUSTOMER'] = tokenParts;
    if (!isNonEmptyString(email) || !email.includes('@')) {
      response.status(400).json({ success: false, message: 'Invalid development token.' });
      return;
    }

    const bypassRole = normalizeAppRole(role, 'CUSTOMER');
    const user = await authRepository.upsertUserFromOAuth({
      id: `dev-${crypto.createHash('sha1').update(email).digest('hex').slice(0, 12)}`,
      email,
      role: bypassRole,
      mfaEnabled: resolveMfaFlag(bypassRole),
    });

    principal = {
      userId: user.id,
      email: user.email,
      role: user.role,
      mfaEnabled: user.mfaEnabled,
    };
  }

  if (!principal) {
    await emitAuditEvent({
      name: 'LOGIN_FAILED',
      metadata: { reason: 'ACCESS_TOKEN_VERIFICATION_FAILED' },
      request,
    });
    response.status(401).json({ success: false, message: 'Unable to verify the provided access token.' });
    return;
  }

  const bundle = await sessionStore.createSession(principal);
  setAuthCookies(response, bundle.accessToken, bundle.refreshToken, bundle.expiresAt, bundle.refreshExpiresAt);
  await emitAuditEvent({
    name: 'LOGIN_SUCCESS',
    actorUserId: principal.userId,
    targetUserId: principal.userId,
    metadata: { role: principal.role },
    request: request as Request,
  });

  response.json({
    success: true,
    authenticated: true,
    user: principal,
    expiresAt: bundle.expiresAt.toISOString(),
    refreshExpiresAt: bundle.refreshExpiresAt.toISOString(),
  });
});

app.post('/api/session-auth/clerk-exchange', authRateLimiter, createOriginGuard(allowedOrigins), createCsrfGuard(allowedOrigins), async (request: Request, response: Response) => {
  const body = request.body as ClerkExchangeRequest;
  const clerkToken = typeof body?.clerkToken === 'string' ? body.clerkToken.trim() : '';
  if (!clerkToken) {
    response.status(400).json({ success: false, message: 'A Clerk token is required.' });
    return;
  }

  const clerkSecretCandidates = resolveClerkSecretCandidates();
  if (clerkSecretCandidates.length === 0) {
    response.status(503).json({ success: false, message: 'Clerk server authentication is not configured.' });
    return;
  }

  try {
    let claims: Awaited<ReturnType<typeof verifyToken>> | null = null;
    let verifiedSecretKey: string | null = null;
    let lastVerificationError: unknown = null;

    for (const candidateKey of clerkSecretCandidates) {
      try {
        claims = await verifyToken(clerkToken, { secretKey: candidateKey });
        verifiedSecretKey = candidateKey;
        break;
      } catch (verificationError) {
        lastVerificationError = verificationError;
      }
    }

    if (!claims || !verifiedSecretKey) {
      throw lastVerificationError instanceof Error
        ? lastVerificationError
        : new Error('Unable to verify Clerk token with configured keys.');
    }

    const clerkUserId = typeof claims.sub === 'string' ? claims.sub : null;
    if (!clerkUserId) {
      response.status(401).json({ success: false, message: 'Invalid Clerk token.' });
      return;
    }

    const clerkClient = createClerkClient({ secretKey: verifiedSecretKey });
    const clerkUser = await clerkClient.users.getUser(clerkUserId);
    const primaryEmail = clerkUser.emailAddresses.find((email) => email.id === clerkUser.primaryEmailAddressId)?.emailAddress
      ?? clerkUser.emailAddresses[0]?.emailAddress;

    if (!isNonEmptyString(primaryEmail)) {
      response.status(400).json({ success: false, message: 'Clerk account is missing a primary email address.' });
      return;
    }

    const normalizedEmail = primaryEmail.trim().toLowerCase();
    const adminAllowlist = parseAdminConsoleAllowlist();
    const isAllowlistedAdmin = adminAllowlist.has(normalizedEmail);

    const metadataRole =
      (clerkUser.publicMetadata?.role as unknown) ??
      (clerkUser.privateMetadata?.role as unknown) ??
      (clerkUser.unsafeMetadata?.role as unknown);
    const requestedRole = normalizeAppRole(metadataRole, 'CUSTOMER');
    const role = isAllowlistedAdmin
      ? (isAdminConsoleRole(requestedRole) ? requestedRole : 'SUPER_ADMIN')
      : (isAdminConsoleRole(requestedRole) ? 'CUSTOMER' : requestedRole);
    const clerkMfaEnabled =
      (clerkUser.publicMetadata?.mfaEnabled as unknown) === true ||
      (clerkUser as unknown as { twoFactorEnabled?: boolean }).twoFactorEnabled === true ||
      (clerkUser as unknown as { totpEnabled?: boolean }).totpEnabled === true;

    const user = await authRepository.upsertUserFromOAuth({
      id: clerkUser.id,
      email: primaryEmail,
      role,
      mfaEnabled: clerkMfaEnabled,
    });

    const principal: AuthPrincipal = {
      userId: user.id,
      email: user.email,
      role: user.role,
      mfaEnabled: user.mfaEnabled,
    };

    const bundle = await sessionStore.createSession(principal);
    setAuthCookies(response, bundle.accessToken, bundle.refreshToken, bundle.expiresAt, bundle.refreshExpiresAt);
    await emitAuditEvent({
      name: 'LOGIN_SUCCESS',
      actorUserId: principal.userId,
      targetUserId: principal.userId,
      metadata: { role: principal.role, provider: 'clerk' },
      request,
    });

    response.json({
      success: true,
      authenticated: true,
      user: principal,
      expiresAt: bundle.expiresAt.toISOString(),
      refreshExpiresAt: bundle.refreshExpiresAt.toISOString(),
    });
  } catch (error) {
    const dbUnavailable = isDatabaseConnectivityError(error);
    await emitAuditEvent({
      name: 'LOGIN_FAILED',
      metadata: {
        reason: error instanceof Error ? error.message : String(error),
        provider: 'clerk',
      },
      request,
    });
    response.status(dbUnavailable ? 503 : 401).json({
      success: false,
      message: dbUnavailable
        ? 'Authentication is temporarily unavailable because the database is offline. Please retry in a minute.'
        : 'Unable to verify Clerk session.',
    });
  }
});

app.post('/api/session-auth/logout', authRateLimiter, createOriginGuard(allowedOrigins), createCsrfGuard(allowedOrigins), async (request: Request, response: Response) => {
  const token = getAuthCookieValue(request, sessionCookieName);
  if (token) {
    const session = await sessionStore.getSessionByAccessToken(token);
    if (session) {
      await emitAuditEvent({
        name: 'LOGOUT',
        actorUserId: session.principal.userId,
        targetUserId: session.principal.userId,
        metadata: { role: session.principal.role },
        request,
      });
    }
    await sessionStore.invalidateSessionByAccessToken(token);
  }

  clearAuthCookies(response);
  response.json({ success: true });
});

app.post('/api/session-auth/refresh', authRateLimiter, createOriginGuard(allowedOrigins), createCsrfGuard(allowedOrigins), async (request: Request, response: Response) => {
  const body = request.body as AuthRefreshRequest;
  const refreshToken = typeof body?.refreshToken === 'string'
    ? body.refreshToken
    : getAuthCookieValue(request, refreshCookieName);

  if (!refreshToken) {
    response.status(400).json({ success: false, message: 'Refresh token is required.' });
    return;
  }

  const rotated = await sessionStore.rotateSession(refreshToken);
  if (!rotated) {
    response.status(401).json({ success: false, message: 'Refresh token is invalid or expired.' });
    return;
  }

  setAuthCookies(response, rotated.accessToken, rotated.refreshToken, rotated.expiresAt, rotated.refreshExpiresAt);
  response.json({
    success: true,
    authenticated: true,
    user: rotated.principal,
    expiresAt: rotated.expiresAt.toISOString(),
    refreshExpiresAt: rotated.refreshExpiresAt.toISOString(),
  });
});

app.post('/api/session-auth/mfa/enroll', authRateLimiter, createOriginGuard(allowedOrigins), createCsrfGuard(allowedOrigins), async (request: Request, response: Response) => {
  const principal = await requireAuthenticatedSession(request);
  if (!principal) {
    response.status(401).json({ success: false, message: 'Authentication required.' });
    return;
  }

  if (!isPrismaAvailable()) {
    response.status(503).json({ success: false, message: 'MFA enrollment requires persistent storage.' });
    return;
  }

  const body = request.body as MfaEnrollRequest;
  const label = isNonEmptyString(body?.label) ? body.label.trim() : 'Authenticator App';
  const secret = generateTotpSecret();
  let encryptedSecret: string;
  try {
    encryptedSecret = encryptMfaSecret(secret);
  } catch (error) {
    response.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Unable to encrypt MFA secret.',
    });
    return;
  }
  const issuer = process.env.MFA_TOTP_ISSUER || 'Katina Tickets';

  await prisma.mfaFactor.updateMany({
    where: {
      userId: principal.userId,
      type: 'TOTP',
      status: 'PENDING',
      revokedAt: null,
    },
    data: {
      status: 'DISABLED',
      revokedAt: new Date(),
    },
  });

  const factor = await prisma.mfaFactor.create({
    data: {
      userId: principal.userId,
      type: 'TOTP',
      status: 'PENDING',
      label,
      secret: encryptedSecret,
    },
  });

  await emitAuditEvent({
    name: 'MFA_ENROLLED',
    actorUserId: principal.userId,
    targetUserId: principal.userId,
    metadata: { factorId: factor.id, state: 'PENDING' },
    request,
  });

  response.json({
    success: true,
    factorId: factor.id,
    secret,
    otpauthUrl: buildOtpAuthUri({
      issuer,
      accountName: principal.email,
      secret,
    }),
  });
});

app.post('/api/session-auth/mfa/activate', authRateLimiter, createOriginGuard(allowedOrigins), createCsrfGuard(allowedOrigins), async (request: Request, response: Response) => {
  const principal = await requireAuthenticatedSession(request);
  if (!principal) {
    response.status(401).json({ success: false, message: 'Authentication required.' });
    return;
  }

  if (!isPrismaAvailable()) {
    response.status(503).json({ success: false, message: 'MFA activation requires persistent storage.' });
    return;
  }

  const body = request.body as MfaActivateRequest;
  const factorId = isNonEmptyString(body?.factorId) ? body.factorId.trim() : null;
  const code = normalizeMfaCode(body?.code);
  if (!factorId || !code) {
    response.status(400).json({ success: false, message: 'factorId and code are required.' });
    return;
  }

  const factor = await prisma.mfaFactor.findFirst({
    where: {
      id: factorId,
      userId: principal.userId,
      type: 'TOTP',
      status: 'PENDING',
      revokedAt: null,
    },
    select: {
      id: true,
      secret: true,
    },
  });

  if (!factor?.secret) {
    response.status(404).json({ success: false, message: 'Pending MFA factor not found.' });
    return;
  }

  let decryptedSecret: string;
  try {
    decryptedSecret = decryptMfaSecret(factor.secret);
  } catch {
    response.status(500).json({ success: false, message: 'Stored MFA secret is unreadable.' });
    return;
  }
  if (!verifyTotpCode(decryptedSecret, code, { window: 1 })) {
    await emitAuditEvent({
      name: 'MFA_FAILED',
      actorUserId: principal.userId,
      targetUserId: principal.userId,
      metadata: { reason: 'MFA_ACTIVATE_CODE_INVALID' },
      request,
    });
    response.status(400).json({ success: false, message: 'Invalid MFA code.' });
    return;
  }

  const backupCodes = generateBackupCodes(8);
  const now = new Date();
  await prisma.$transaction([
    prisma.mfaFactor.update({
      where: { id: factor.id },
      data: {
        status: 'ACTIVE',
        verifiedAt: now,
      },
    }),
    prisma.mfaFactor.updateMany({
      where: {
        userId: principal.userId,
        type: 'BACKUP_CODE',
        revokedAt: null,
      },
      data: {
        status: 'DISABLED',
        revokedAt: now,
      },
    }),
    prisma.user.update({
      where: { id: principal.userId },
      data: { mfaEnabled: true },
    }),
    ...backupCodes.map((backupCode) =>
      prisma.mfaFactor.create({
        data: {
          userId: principal.userId,
          type: 'BACKUP_CODE',
          status: 'ACTIVE',
          label: 'Recovery Code',
          secret: hashRecoveryCode(backupCode),
          verifiedAt: now,
        },
      }),
    ),
  ]);

  await emitAuditEvent({
    name: 'MFA_VERIFIED',
    actorUserId: principal.userId,
    targetUserId: principal.userId,
    metadata: { source: 'MFA_ACTIVATE' },
    request,
  });

  response.json({
    success: true,
    backupCodes,
    message: 'MFA is now active. Save your recovery codes securely.',
  });
});

app.post('/api/session-auth/mfa/disable', authRateLimiter, createOriginGuard(allowedOrigins), createCsrfGuard(allowedOrigins), async (request: Request, response: Response) => {
  const principal = await requireAuthenticatedSession(request);
  if (!principal) {
    response.status(401).json({ success: false, message: 'Authentication required.' });
    return;
  }

  if (!isPrismaAvailable()) {
    response.status(503).json({ success: false, message: 'MFA management requires persistent storage.' });
    return;
  }

  const body = request.body as MfaDisableRequest;
  const code = normalizeMfaCode(body?.code);
  if (!code) {
    response.status(400).json({ success: false, message: 'MFA code is required.' });
    return;
  }

  const verified = await verifyUserMfaCode(principal.userId, code);
  if (!verified) {
    await emitAuditEvent({
      name: 'MFA_FAILED',
      actorUserId: principal.userId,
      targetUserId: principal.userId,
      metadata: { reason: 'MFA_DISABLE_CODE_INVALID' },
      request,
    });
    response.status(400).json({ success: false, message: 'Invalid MFA code.' });
    return;
  }

  await prisma.$transaction([
    prisma.mfaFactor.updateMany({
      where: {
        userId: principal.userId,
        status: { in: ['PENDING', 'ACTIVE'] },
        revokedAt: null,
      },
      data: {
        status: 'DISABLED',
        revokedAt: new Date(),
        secret: null,
      },
    }),
    prisma.user.update({
      where: { id: principal.userId },
      data: { mfaEnabled: false },
    }),
  ]);

  await emitAuditEvent({
    name: 'SESSION_REVOKED',
    actorUserId: principal.userId,
    targetUserId: principal.userId,
    metadata: { source: 'MFA_DISABLE' },
    request,
  });

  response.json({ success: true, message: 'MFA has been disabled for this account.' });
});

app.get('/api/session-auth/mfa/status', async (request: Request, response: Response) => {
  const principal = await requireAuthenticatedSession(request);
  if (!principal) {
    response.status(401).json({ success: false, message: 'Authentication required.' });
    return;
  }

  if (!isPrismaAvailable()) {
    response.json({
      success: true,
      enrolled: false,
      pending: false,
      required: roleRequiresMfa(principal.role),
      factorId: null,
      label: null,
      otpauthUrl: null,
      secret: null,
    });
    return;
  }

  const factors = await prisma.mfaFactor.findMany({
    where: {
      userId: principal.userId,
      revokedAt: null,
      type: { in: ['TOTP', 'BACKUP_CODE'] },
    },
    select: {
      id: true,
      type: true,
      status: true,
      label: true,
      secret: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  const pendingFactor = factors.find((factor) => factor.type === 'TOTP' && factor.status === 'PENDING') ?? null;
  const activeTotpFactor = factors.find((factor) => factor.type === 'TOTP' && factor.status === 'ACTIVE') ?? null;
  const recoveryCodeCount = factors.filter((factor) => factor.type === 'BACKUP_CODE' && factor.status === 'ACTIVE').length;

  let secret: string | null = null;
  let otpauthUrl: string | null = null;
  if (pendingFactor?.secret) {
    try {
      secret = decryptMfaSecret(pendingFactor.secret);
      otpauthUrl = buildOtpAuthUri({
        issuer: process.env.MFA_TOTP_ISSUER || 'Katina Tickets',
        accountName: principal.email,
        secret,
      });
    } catch {
      secret = null;
      otpauthUrl = null;
    }
  }

  response.json({
    success: true,
    enrolled: Boolean(activeTotpFactor),
    pending: Boolean(pendingFactor),
    required: roleRequiresMfa(principal.role),
    factorId: pendingFactor?.id ?? activeTotpFactor?.id ?? null,
    label: pendingFactor?.label ?? activeTotpFactor?.label ?? null,
    secret,
    otpauthUrl,
    recoveryCodeCount,
  });
});

const requireAuthenticatedSession = async (request: Request): Promise<AuthPrincipal | null> => {
  const principal = await resolveSessionFromCookie(request);
  return principal;
};

const PAYMENT_ADMIN_ROLES: readonly AppRole[] = ['SUPER_ADMIN', 'FINANCE', 'SUPPORT'];

function buildUserInitials(fullName: string) {
  const parts = fullName
    .trim()
    .split(/\s+/)
    .filter((part) => part.length > 0)
    .slice(0, 2);

  if (parts.length === 0) {
    return 'GT';
  }

  return parts.map((part) => part[0]?.toUpperCase() ?? '').join('') || 'GT';
}

function mapDashboardStatus(status: PaymentStatus) {
  if (status === 'PAID') {
    return 'completed' as const;
  }

  if (status === 'PENDING') {
    return 'pending' as const;
  }

  return 'failed' as const;
}

function normalizeSeatDetails(value: Prisma.JsonValue) {
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  return value.filter((item): item is string => typeof item === 'string');
}

async function buildSalesDashboardData() {
  if (!isPrismaAvailable()) {
    return {
      ticketsSold: 0,
      ticketsTotal: 0,
      totalRevenue: 0,
      remainingInventory: {
        ordinary: 0,
        vip: 0,
      },
      transactions: [] as Array<{
        id: string;
        fullName: string;
        initials: string;
        ticketType: 'ordinary' | 'vip';
        quantity: number;
        amount: number;
        timestamp: string;
        status: 'pending' | 'completed' | 'failed';
        seatDetails: string[];
      }>,
      chartsData: [] as Array<{
        day: string;
        count: number;
        revenue: number;
      }>,
    };
  }

  const [inventoryRows, paidTransactions] = await Promise.all([
    prisma.ticketInventory.findMany({
      select: {
        type: true,
        totalCap: true,
        remaining: true,
      },
    }),
    prisma.paymentTransaction.findMany({
      where: {
        status: 'PAID',
      },
      orderBy: {
        paidAt: 'desc',
      },
      select: {
        reference: true,
        amount: true,
        customerName: true,
        paidAt: true,
        createdAt: true,
        status: true,
      },
    }),
  ]);

  const paidReferences = paidTransactions.map((row) => row.reference);
  const reservations = paidReferences.length
    ? await prisma.paymentReservation.findMany({
        where: {
          paymentReference: {
            in: paidReferences,
          },
        },
        select: {
          paymentReference: true,
          fullName: true,
          ticketType: true,
          quantity: true,
          seatDetails: true,
        },
      })
    : [];

  const reservationByReference = new Map(reservations.map((row) => [row.paymentReference, row]));

  const transactions = paidTransactions.map((row) => {
    const reservation = reservationByReference.get(row.reference);
    const fullName = reservation?.fullName || row.customerName || 'Guest';
    const timestamp = (row.paidAt || row.createdAt).toISOString();

    return {
      id: row.reference,
      fullName,
      initials: buildUserInitials(fullName),
      ticketType: reservation ? fromInventoryEnum(reservation.ticketType) : 'ordinary',
      quantity: reservation?.quantity ?? 1,
      amount: row.amount,
      timestamp,
      status: mapDashboardStatus(row.status),
      seatDetails: reservation ? normalizeSeatDetails(reservation.seatDetails as Prisma.JsonValue) : [],
    };
  });

  const today = new Date();
  const chartsData = Array.from({ length: 7 }, (_unused, index) => {
    const pointDate = new Date(today);
    pointDate.setHours(0, 0, 0, 0);
    pointDate.setDate(today.getDate() - (6 - index));

    const nextDay = new Date(pointDate);
    nextDay.setDate(pointDate.getDate() + 1);

    const dayTransactions = paidTransactions.filter((row) => {
      const timestamp = row.paidAt || row.createdAt;
      return timestamp >= pointDate && timestamp < nextDay;
    });

    return {
      day: pointDate.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase(),
      count: dayTransactions.length,
      revenue: dayTransactions.reduce((sum, row) => sum + row.amount, 0),
    };
  });

  const remainingInventory = {
    ordinary: 0,
    vip: 0,
  };
  let ticketsTotal = 0;
  for (const row of inventoryRows) {
    const type = fromInventoryEnum(row.type);
    remainingInventory[type] = row.remaining;
    ticketsTotal += row.totalCap;
  }

  return {
    ticketsSold: transactions.reduce((sum, row) => sum + row.quantity, 0),
    ticketsTotal,
    totalRevenue: paidTransactions.reduce((sum, row) => sum + row.amount, 0),
    remainingInventory,
    transactions,
    chartsData,
  };
}

function canAccessPaymentReference(principal: AuthPrincipal, paymentUserId: string | null) {
  if (PAYMENT_ADMIN_ROLES.includes(principal.role)) {
    return true;
  }

  return Boolean(paymentUserId && principal.userId === paymentUserId);
}

app.get('/api/admin/overview', async (request: Request, response: Response) => {
  const principal = await requireAuthenticatedSession(request);
  if (!principal) {
    response.status(401).json({ success: false, message: 'Authentication required.' });
    return;
  }

  if (!['SUPER_ADMIN'].includes(principal.role)) {
    logEvent('warn', 'admin.access.denied', {
      email: principal.email,
      actualRole: principal.role,
      requiredRole: 'SUPER_ADMIN',
    });
    response.status(403).json({
      success: false,
      message: 'Forbidden.',
      debug: { actualRole: principal.role, requiredRole: 'SUPER_ADMIN', email: principal.email },
    });
    return;
  }

  const stats = await buildSalesDashboardData();

  response.json({
    success: true,
    section: 'admin',
    user: principal,
    stats,
  });
});

app.get('/api/scanner/dashboard', async (request: Request, response: Response) => {
  const principal = await requireAuthenticatedSession(request);
  if (!principal) {
    response.status(401).json({ success: false, message: 'Authentication required.' });
    return;
  }

  if (!(await requireMfaForPrincipal(request, response, principal))) {
    return;
  }

  if (!['SUPER_ADMIN', 'SCANNER'].includes(principal.role)) {
    response.status(403).json({ success: false, message: 'Forbidden.' });
    return;
  }

  if (!isPrismaAvailable()) {
    response.json({
      success: true,
      section: 'scanner',
      user: principal,
      stats: {
        totalTicketsSold: 0,
        totalCheckedIn: 0,
        remainingAttendees: 0,
        refundedTickets: 0,
        cancelledTickets: 0,
      },
      recentScans: [],
    });
    return;
  }

  const [
    totalTicketsSold,
    totalCheckedIn,
    remainingAttendees,
    refundedTickets,
    cancelledTickets,
    recentScans,
  ] = await Promise.all([
    prisma.ticket.count(),
    prisma.ticket.count({ where: { status: 'CHECKED_IN' } }),
    prisma.ticket.count({ where: { status: 'ACTIVE' } }),
    prisma.ticket.count({ where: { status: 'REFUNDED' } }),
    prisma.ticket.count({ where: { status: 'CANCELLED' } }),
    prisma.ticketScanLog.findMany({
      orderBy: { scanTimestamp: 'desc' },
      take: 25,
      include: {
        ticket: {
          select: {
            ticketId: true,
            ticketType: true,
            holderName: true,
            status: true,
            pdfStoragePath: true,
            pdfChecksum: true,
            pdfGeneratedAt: true,
            event: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    }),
  ]);

  response.json({
    success: true,
    section: 'scanner',
    user: principal,
    stats: {
      totalTicketsSold,
      totalCheckedIn,
      remainingAttendees,
      refundedTickets,
      cancelledTickets,
    },
    recentScans: recentScans.map((scan) => ({
      id: scan.id,
      scanTimestamp: scan.scanTimestamp.toISOString(),
      result: scan.result,
      scannedValue: scan.scannedValue,
      ticket: scan.ticket
        ? {
            ticketId: scan.ticket.ticketId,
            ticketType: fromInventoryEnum(scan.ticket.ticketType),
            holderName: scan.ticket.holderName,
            eventName: scan.ticket.event.name,
            currentStatus: scan.ticket.status,
            pdf: {
              available: Boolean(scan.ticket.pdfStoragePath && scan.ticket.pdfChecksum),
              generatedAt: scan.ticket.pdfGeneratedAt?.toISOString() ?? null,
            },
          }
        : null,
    })),
  });
});

app.get('/api/scanner/search', async (request: Request, response: Response) => {
  const principal = await requireAuthenticatedSession(request);
  if (!principal) {
    response.status(401).json({ success: false, message: 'Authentication required.' });
    return;
  }

  if (!(await requireMfaForPrincipal(request, response, principal))) {
    return;
  }

  if (!['SUPER_ADMIN', 'SCANNER'].includes(principal.role)) {
    response.status(403).json({ success: false, message: 'Forbidden.' });
    return;
  }

  const query = typeof request.query.q === 'string' ? request.query.q.trim() : '';
  if (!query) {
    response.json({ success: true, items: [] });
    return;
  }

  if (!isPrismaAvailable()) {
    response.json({ success: true, items: [] });
    return;
  }

  const tickets = await prisma.ticket.findMany({
    where: {
      OR: [
        { ticketId: { contains: query, mode: 'insensitive' } },
        { holderEmail: { contains: query, mode: 'insensitive' } },
        { holderName: { contains: query, mode: 'insensitive' } },
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: 40,
    include: {
      event: {
        select: {
          name: true,
        },
      },
      reservation: {
        select: {
          paymentReference: true,
        },
      },
    },
  });

  response.json({
    success: true,
    items: tickets.map((ticket) => ({
      id: ticket.id,
      ticketId: ticket.ticketId,
      qrCodeValue: ticket.qrCodeValue,
      ticketType: fromInventoryEnum(ticket.ticketType),
      holderName: ticket.holderName,
      holderEmail: ticket.holderEmail,
      status: ticket.status,
      eventName: ticket.event.name,
      paymentReference: ticket.reservation.paymentReference,
      checkedInAt: ticket.checkedInAt?.toISOString() ?? null,
      pdf: {
        available: Boolean(ticket.pdfStoragePath && ticket.pdfChecksum),
        generatedAt: ticket.pdfGeneratedAt?.toISOString() ?? null,
      },
    })),
  });
});

app.post('/api/scanner/validate', createOriginGuard(allowedOrigins), createCsrfGuard(allowedOrigins), async (request: Request<{}, unknown, ScannerValidateRequest>, response: Response) => {
  const principal = await requireAuthenticatedSession(request);
  if (!principal) {
    response.status(401).json({ success: false, message: 'Authentication required.' });
    return;
  }

  if (!(await requireMfaForPrincipal(request, response, principal))) {
    return;
  }

  if (!['SUPER_ADMIN', 'SCANNER'].includes(principal.role)) {
    response.status(403).json({ success: false, message: 'Forbidden.' });
    return;
  }

  const qrCodeValue = typeof request.body.qrCodeValue === 'string' ? request.body.qrCodeValue.trim() : '';
  if (!qrCodeValue) {
    response.status(400).json({ success: false, message: 'qrCodeValue is required.' });
    return;
  }

  const deviceInfo = {
    ...(toJsonObject(request.body.deviceInfo) ?? {}),
    userAgent: request.header('user-agent') ?? null,
  };

  if (!isPrismaAvailable()) {
    response.status(503).json({ success: false, message: 'Scanner validation requires persistent storage.' });
    return;
  }

  const ticket = await prisma.ticket.findUnique({
    where: { qrCodeValue },
    include: {
      event: {
        select: {
          name: true,
        },
      },
    },
  });

  if (!ticket) {
    await recordTicketScanLog({
      result: 'INVALID_TICKET',
      scannedValue: qrCodeValue,
      scannerAdminId: principal.userId,
      deviceInfo,
    });

    response.status(404).json({
      success: true,
      result: 'INVALID_TICKET',
      ticket: null,
    });
    return;
  }

  const result = resolveScanResultForTicketStatus(ticket.status);

  await recordTicketScanLog({
    ticketId: ticket.id,
    scannerAdminId: principal.userId,
    result,
    scannedValue: qrCodeValue,
    deviceInfo,
  });

  response.json({
    success: true,
    result,
    ticket: {
      id: ticket.id,
      ticketId: ticket.ticketId,
      ticketType: fromInventoryEnum(ticket.ticketType),
      holderName: ticket.holderName,
      eventName: ticket.event.name,
      currentStatus: ticket.status,
      pdf: {
        available: Boolean(ticket.pdfStoragePath && ticket.pdfChecksum),
        generatedAt: ticket.pdfGeneratedAt?.toISOString() ?? null,
      },
    },
  });
});

app.post('/api/scanner/check-in', createOriginGuard(allowedOrigins), createCsrfGuard(allowedOrigins), async (request: Request<{}, unknown, ScannerCheckInRequest>, response: Response) => {
  const principal = await requireAuthenticatedSession(request);
  if (!principal) {
    response.status(401).json({ success: false, message: 'Authentication required.' });
    return;
  }

  if (!(await requireMfaForPrincipal(request, response, principal))) {
    return;
  }

  if (!['SUPER_ADMIN', 'SCANNER'].includes(principal.role)) {
    response.status(403).json({ success: false, message: 'Forbidden.' });
    return;
  }

  const ticketId = typeof request.body.ticketId === 'string' ? request.body.ticketId.trim() : '';
  if (!ticketId) {
    response.status(400).json({ success: false, message: 'ticketId is required.' });
    return;
  }

  const deviceInfo = {
    ...(toJsonObject(request.body.deviceInfo) ?? {}),
    userAgent: request.header('user-agent') ?? null,
  };

  if (!isPrismaAvailable()) {
    response.status(503).json({ success: false, message: 'Check-in requires persistent storage.' });
    return;
  }

  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: {
      event: {
        select: {
          name: true,
        },
      },
    },
  });

  if (!ticket) {
    await recordTicketScanLog({
      result: 'INVALID_TICKET',
      scannedValue: ticketId,
      scannerAdminId: principal.userId,
      deviceInfo,
    });

    response.status(404).json({
      success: true,
      result: 'INVALID_TICKET',
      ticket: null,
    });
    return;
  }

  if (ticket.status !== 'ACTIVE') {
    const result = resolveScanResultForTicketStatus(ticket.status);

    await recordTicketScanLog({
      ticketId: ticket.id,
      scannerAdminId: principal.userId,
      result,
      scannedValue: ticket.qrCodeValue,
      deviceInfo,
    });

    response.status(409).json({
      success: true,
      result,
      ticket: {
        id: ticket.id,
        ticketId: ticket.ticketId,
        ticketType: fromInventoryEnum(ticket.ticketType),
        holderName: ticket.holderName,
        eventName: ticket.event.name,
        currentStatus: ticket.status,
        pdf: {
          available: Boolean(ticket.pdfStoragePath && ticket.pdfChecksum),
          generatedAt: ticket.pdfGeneratedAt?.toISOString() ?? null,
        },
      },
    });
    return;
  }

  const checkedIn = await prisma.ticket.update({
    where: { id: ticket.id },
    data: {
      status: 'CHECKED_IN',
      checkedInAt: new Date(),
      checkedInByAdminId: principal.userId,
    },
    include: {
      event: {
        select: {
          name: true,
        },
      },
    },
  });

  await recordTicketScanLog({
    ticketId: checkedIn.id,
    scannerAdminId: principal.userId,
    result: 'VALID',
    scannedValue: checkedIn.qrCodeValue,
    deviceInfo,
  });

  response.json({
    success: true,
    result: 'VALID',
    ticket: {
      id: checkedIn.id,
      ticketId: checkedIn.ticketId,
      ticketType: fromInventoryEnum(checkedIn.ticketType),
      holderName: checkedIn.holderName,
      eventName: checkedIn.event.name,
      currentStatus: checkedIn.status,
      checkedInAt: checkedIn.checkedInAt?.toISOString() ?? null,
      pdf: {
        available: Boolean(checkedIn.pdfStoragePath && checkedIn.pdfChecksum),
        generatedAt: checkedIn.pdfGeneratedAt?.toISOString() ?? null,
      },
    },
  });
});

app.get('/api/finance/reports', async (request: Request, response: Response) => {
  const principal = await requireAuthenticatedSession(request);
  if (!principal) {
    response.status(401).json({ success: false, message: 'Authentication required.' });
    return;
  }

  if (!(await requireMfaForPrincipal(request, response, principal))) {
    return;
  }

  if (!['SUPER_ADMIN', 'FINANCE'].includes(principal.role)) {
    response.status(403).json({ success: false, message: 'Forbidden.' });
    return;
  }

  const stats = await buildSalesDashboardData();

  response.json({
    success: true,
    section: 'finance',
    user: principal,
    stats,
  });
});

app.post('/api/organizer/events', createOriginGuard(allowedOrigins), createCsrfGuard(allowedOrigins), async (request: Request, response: Response) => {
  const principal = await requireAuthenticatedSession(request);
  if (!principal) {
    response.status(401).json({ success: false, message: 'Authentication required.' });
    return;
  }

  if (!(await requireMfaForPrincipal(request, response, principal))) {
    return;
  }

  if (!['SUPER_ADMIN', 'ORGANIZER'].includes(principal.role)) {
    response.status(403).json({ success: false, message: 'Forbidden.' });
    return;
  }

  response.json({ success: true, section: 'organizer', user: principal });
});

app.get('/api/me/tickets', ticketReadRateLimiter, async (request: Request, response: Response) => {
  const principal = await requireAuthenticatedSession(request);
  if (!principal) {
    response.status(401).json({ success: false, message: 'Authentication required.' });
    return;
  }

  if (!isPrismaAvailable()) {
    response.json({ success: true, items: [] });
    return;
  }

  const reservations = await prisma.paymentReservation.findMany({
    where: {
      userId: principal.userId,
    },
    orderBy: {
      createdAt: 'desc',
    },
    select: {
      paymentReference: true,
      ticketType: true,
      quantity: true,
      fullName: true,
      email: true,
      seatDetails: true,
      createdAt: true,
      tickets: {
        select: {
          id: true,
          ticketId: true,
          qrCodeValue: true,
          status: true,
          pdfStoragePath: true,
          pdfChecksum: true,
          pdfGeneratedAt: true,
        },
      },
    },
  });

  const references = reservations.map((row) => row.paymentReference);
  const paymentStatuses = references.length
    ? await prisma.paymentTransaction.findMany({
        where: {
          reference: { in: references },
        },
        select: {
          reference: true,
          status: true,
        },
      })
    : [];

  const statusByReference = new Map(paymentStatuses.map((row) => [row.reference, row.status]));

  response.json({
    success: true,
    items: reservations.map((row) => ({
      paymentReference: row.paymentReference,
      ticketType: fromInventoryEnum(row.ticketType),
      quantity: row.quantity,
      fullName: row.fullName,
      email: row.email,
      seatDetails: Array.isArray(row.seatDetails)
        ? row.seatDetails.filter((item): item is string => typeof item === 'string')
        : [],
      purchasedAt: row.createdAt.toISOString(),
      paymentStatus: statusByReference.get(row.paymentReference) ?? 'PENDING',
      pdf: {
        available: row.tickets.some((ticket) => Boolean(ticket.pdfStoragePath && ticket.pdfChecksum)),
        generatedAt: row.tickets.find((ticket) => ticket.pdfGeneratedAt)?.pdfGeneratedAt?.toISOString() ?? null,
      },
      tickets: row.tickets.map((ticket) => ({
        id: ticket.id,
        ticketId: ticket.ticketId,
        token: ticket.qrCodeValue,
        status: ticket.status,
        pdf: {
          available: Boolean(ticket.pdfStoragePath && ticket.pdfChecksum),
          generatedAt: ticket.pdfGeneratedAt?.toISOString() ?? null,
        },
      })),
    })),
  });
});

app.post('/api/pay', paymentRateLimiter, createOriginGuard(allowedOrigins), createCsrfGuard(allowedOrigins), async (request: AuthenticatedRequest & Request<unknown, unknown, BilaPaymentRequest>, response: Response) => {
  const route = '/api/pay';
  const requestId = resolveRequestId(request);
  const startedAt = Date.now();
  const principal = await requireAuthenticatedSession(request);

  if (!principal) {
    logStructuredEvent('warn', '[PAYMENT]', route, 'auth.required', {
      requestId,
      message: 'Sign in is required before purchasing tickets.',
    });
    response.status(401).json({ success: false, message: 'Sign in is required before purchasing tickets.' });
    return;
  }

  const {
    amount,
    currency,
    description,
    customerEmail,
    customerName,
    phone,
    provider,
    metadata,
    phoneNumber,
    operator,
  } = request.body;

  const normalizedPhone = isNonEmptyString(phone)
    ? phone.trim()
    : isNonEmptyString(phoneNumber)
      ? String(phoneNumber).trim()
      : '';

  const normalizedProvider = isNonEmptyString(provider)
    ? provider.trim().toLowerCase()
    : isNonEmptyString(operator)
      ? String(operator).trim().toLowerCase()
      : '';

  logStructuredEvent('info', '[PAYMENT]', route, 'request.received', {
    requestId,
    userId: principal.userId,
    amount,
    currency: typeof currency === 'string' ? currency : undefined,
    description: typeof description === 'string' ? description : undefined,
    customerEmail: typeof customerEmail === 'string' ? customerEmail : undefined,
    customerName: typeof customerName === 'string' ? customerName : undefined,
    phone: normalizedPhone,
    provider: normalizedProvider,
    rawPhone: isNonEmptyString(phoneNumber) ? phoneNumber : isNonEmptyString(phone) ? phone : undefined,
    rawProvider: isNonEmptyString(operator) ? operator : isNonEmptyString(provider) ? provider : undefined,
    metadata: toJsonObject(metadata),
    requestBody: request.body,
  });

  try {
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
      logStructuredEvent('warn', '[PAYMENT]', route, 'validation.failed', {
        requestId,
        userId: principal.userId,
        reason: 'invalid_amount',
        amount,
      });
      logStructuredEvent('debug', '[PAYMENT]', route, 'early.return', { requestId, userId: principal.userId, reason: 'invalid_amount', amount });
      response.status(400).json({success: false, message: 'A valid amount is required.'});
      return;
    }

    if (!isNonEmptyString(currency) || !isNonEmptyString(description)) {
      logStructuredEvent('warn', '[PAYMENT]', route, 'validation.failed', {
        requestId,
        userId: principal.userId,
        reason: 'missing_currency_or_description',
      });
      logStructuredEvent('debug', '[PAYMENT]', route, 'early.return', { requestId, userId: principal.userId, reason: 'missing_currency_or_description' });
      response.status(400).json({success: false, message: 'Currency and description are required.'});
      return;
    }

    if (!normalizedPhone) {
      logStructuredEvent('warn', '[PAYMENT]', route, 'validation.failed', {
        requestId,
        userId: principal.userId,
        reason: 'missing_phone_number',
      });
      logStructuredEvent('debug', '[PAYMENT]', route, 'early.return', { requestId, userId: principal.userId, reason: 'missing_phone_number' });
      response.status(400).json({ success: false, message: 'A mobile money phone number is required.' });
      return;
    }

    const validProviders = ['mtn', 'airtel', 'zamtel', 'vodacom'];
    if (!validProviders.includes(normalizedProvider)) {
      logStructuredEvent('warn', '[PAYMENT]', route, 'validation.failed', {
        requestId,
        userId: principal.userId,
        reason: 'invalid_provider',
        provider: normalizedProvider,
      });
      logStructuredEvent('debug', '[PAYMENT]', route, 'early.return', { requestId, userId: principal.userId, reason: 'invalid_provider', provider: normalizedProvider });
      response.status(400).json({ success: false, message: 'A valid mobile money provider is required.' });
      return;
    }

    const normalizedMetadata = toJsonObject(metadata);
    const ticketType = parseTicketType(normalizedMetadata?.ticketType);
    const quantity = parseQuantity(normalizedMetadata?.quantity);
    if (!ticketType || !quantity) {
      logStructuredEvent('warn', '[PAYMENT]', route, 'validation.failed', {
        requestId,
        userId: principal.userId,
        reason: 'missing_ticket_metadata',
        metadata: normalizedMetadata,
      });
      logStructuredEvent('debug', '[PAYMENT]', route, 'early.return', { requestId, userId: principal.userId, reason: 'missing_ticket_metadata', metadata: normalizedMetadata });
      response.status(400).json({ success: false, message: 'Payment metadata must include ticketType and quantity.' });
      return;
    }

    // Log environment presence before attempting gateway
    logStructuredEvent('debug', '[PAYMENT]', route, 'env.check', {
      requestId,
      userId: principal.userId,
      BILA_API_BASE_URL_defined: Boolean(process.env.BILA_API_BASE_URL),
      BILA_SECRET_KEY_defined: Boolean(process.env.BILA_SECRET_KEY),
      BILA_WALLET_ID_defined: Boolean(process.env.BILA_WALLET_ID),
    });

    if (!canUseBilaGateway()) {
      logStructuredEvent('warn', '[PAYMENT]', route, 'gateway.unavailable', {
        requestId,
        userId: principal.userId,
      });
      logStructuredEvent('debug', '[PAYMENT]', route, 'early.return', { requestId, userId: principal.userId, reason: 'gateway.unavailable' });
      response.status(503).json({ success: false, message: 'Payment provider not configured on the server.' });
      return;
    }

    const reference = `BILA-${crypto.randomUUID()}`;
    const payload: {
      amount: number;
      currency: string;
      description: string;
      customerEmail?: string;
      customerName?: string;
      phone: string;
      provider: 'mtn' | 'airtel' | 'zamtel' | 'vodacom';
      metadata?: Record<string, unknown>;
      reference: string;
    } = {
      amount,
      currency: currency.trim().toUpperCase(),
      description: description.trim(),
      customerEmail: isNonEmptyString(customerEmail) ? customerEmail.trim() : undefined,
      customerName: isNonEmptyString(customerName) ? customerName.trim() : undefined,
      phone: normalizedPhone,
      provider: normalizedProvider as 'mtn' | 'airtel' | 'zamtel' | 'vodacom',
      metadata: normalizedMetadata,
      reference,
    };

    logStructuredEvent('info', '[PAYMENT]', route, 'payment.reference.created', {
      requestId,
      userId: principal.userId,
      paymentReference: reference,
      amount: payload.amount,
      currency: payload.currency,
      description: payload.description,
      metadata: payload.metadata,
      customerEmail: payload.customerEmail,
      customerName: payload.customerName,
      phone: payload.phone,
      provider: payload.provider,
    });

    await persistPaymentIntent({
      reference,
      amount,
      currency: payload.currency,
      description: payload.description,
      customerEmail: payload.customerEmail,
      customerName: payload.customerName,
      userId: principal.userId,
      metadata: payload.metadata,
    });

    // Log that we are about to call Bila and preview the non-sensitive request body
    try {
      const bilaPreview = {
        amount: payload.amount,
        currency: payload.currency,
        description: payload.description,
        customerEmail: payload.customerEmail,
        customerName: payload.customerName,
        phone: payload.phone,
        provider: payload.provider,
        reference,
        metadata: payload.metadata,
        callback_url: process.env.BILA_WEBHOOK_URL?.trim() || undefined,
        country: getBilaCountry(),
        bearer: 'merchant',
        narration: payload.description,
      } as Record<string, unknown>;

      logStructuredEvent('info', '[PAYMENT]', route, 'bila.call.pre', {
        requestId,
        userId: principal.userId,
        bilaApiBaseUrlDefined: Boolean(process.env.BILA_API_BASE_URL),
        bilaSecretDefined: Boolean(process.env.BILA_SECRET_KEY),
        bilaWalletDefined: Boolean(process.env.BILA_WALLET_ID),
        finalUrlPreview: (typeof getBilaApiBaseUrl === 'function') ? getBilaApiBaseUrl() + '/api/v1/bila/collections/mobile-money' : undefined,
        bilaRequestPreview: bilaPreview,
      });
    } catch (e) {
      logStructuredEvent('warn', '[PAYMENT]', route, 'bila.call.pre.logging.failed', { requestId, userId: principal.userId, error: e instanceof Error ? e.message : String(e) });
    }

    const collection = await createBilaMobileMoneyCollection({
      amount: payload.amount,
      currency: payload.currency,
      description: payload.description,
      customerEmail: payload.customerEmail,
      customerName: payload.customerName,
      phone: payload.phone,
      provider: payload.provider,
      reference,
      metadata: payload.metadata,
      callback_url: process.env.BILA_WEBHOOK_URL?.trim() || undefined,
      walletId: getBilaWalletId(),
      country: getBilaCountry(),
      bearer: 'merchant',
      narration: payload.description,
      customerNames: payload.customerName,
    });

    logStructuredEvent('info', '[PAYMENT]', route, 'bila.call.post', { requestId, userId: principal.userId, bilaCollectionId: collection.id, bilaStatus: collection.status });

    if (collection.id) {
      await updatePaymentIntentFromWebhook({
        reference,
        providerPaymentId: collection.id,
        status: 'PENDING',
      });
    }

    if (collection.status === 'completed') {
      await applyPaymentStatusAndFinalize({
        reference,
        providerPaymentId: collection.id,
        status: 'PAID',
      });
    }

    await emitAuditEvent({
      name: 'SESSION_CREATED',
      actorUserId: principal.userId,
      targetUserId: principal.userId,
      resourceType: 'payment-intent',
      resourceId: reference,
      metadata: { amount, currency: payload.currency, role: principal.role },
      request: request as Request,
    });

    logStructuredEvent('info', '[PAYMENT]', route, 'response.sent', {
      requestId,
      userId: principal.userId,
      paymentReference: reference,
      amount: payload.amount,
      currency: payload.currency,
      bilaReference: collection.id,
      providerStatus: collection.status,
      httpStatus: 200,
      elapsedMs: Date.now() - startedAt,
      responseBody: {
        success: true,
        message: 'Bila payment request created successfully. Check your mobile wallet for the approval prompt.',
        reference,
        amount: payload.amount,
        currency: payload.currency,
        bilaReference: collection.id,
        status: collection.status,
      },
    });

    response.json({
      success: true,
      message: 'Bila payment request created successfully. Check your mobile wallet for the approval prompt.',
      reference,
      amount: payload.amount,
      currency: payload.currency,
      bilaReference: collection.id,
      status: collection.status,
      customerEmail: payload.customerEmail,
      customerName: payload.customerName,
      phone: payload.phone,
      provider: payload.provider,
    });
  } catch (error) {
    logPaymentError('[PAYMENT]', route, 'session.creation.failed', error, {
      requestId,
      userId: principal.userId,
      amount,
      currency: typeof currency === 'string' ? currency : undefined,
    });
    response.status(500).json({ success: false, message: 'Unable to start payment session.' });
  }
});

app.get('/api/payments/:reference/bila-status', ticketReadRateLimiter, async (request: Request<{ reference: string }>, response: Response) => {
  const route = '/api/payments/:reference/bila-status';
  const requestId = resolveRequestId(request);
  const startedAt = Date.now();
  const principal = await requireAuthenticatedSession(request);
  if (!principal) {
    logStructuredEvent('warn', '[VERIFY]', route, 'auth.required', {
      requestId,
      message: 'Authentication required.',
    });
    response.status(401).json({ success: false, message: 'Authentication required.' });
    return;
  }

  const { reference } = request.params;
  if (!reference || reference.trim().length < 8) {
    logStructuredEvent('warn', '[VERIFY]', route, 'validation.failed', {
      requestId,
      userId: principal.userId,
      reason: 'missing_reference',
    });
    response.status(400).json({ success: false, message: 'Payment reference is required.' });
    return;
  }

  logStructuredEvent('info', '[VERIFY]', route, 'request.received', {
    requestId,
    userId: principal.userId,
    paymentReference: reference,
  });

  const payment = isPrismaAvailable()
    ? await prisma.paymentTransaction.findUnique({ where: { reference }, select: { userId: true } })
    : { userId: null };

  if (!payment) {
    logStructuredEvent('warn', '[VERIFY]', route, 'payment.not.found', {
      requestId,
      userId: principal.userId,
      paymentReference: reference,
    });
    response.status(404).json({ success: false, message: 'Payment not found for reference.' });
    return;
  }

  if (!canAccessPaymentReference(principal, payment.userId ?? null)) {
    logStructuredEvent('warn', '[VERIFY]', route, 'access.denied', {
      requestId,
      userId: principal.userId,
      paymentReference: reference,
    });
    response.status(403).json({ success: false, message: 'You are not authorized to view this payment.' });
    return;
  }

  if (!canUseBilaGateway()) {
    logStructuredEvent('warn', '[VERIFY]', route, 'gateway.unavailable', {
      requestId,
      userId: principal.userId,
      paymentReference: reference,
    });
    response.status(503).json({ success: false, message: 'Payment provider not configured on the server.' });
    return;
  }

  try {
    const status = await getBilaCollectionStatus(reference);
    let transactionUpdated = false;
    let reservationFinalized = false;
    let ticketDeliveryReady = false;

    logStructuredEvent('info', '[VERIFY]', route, 'bila.status.requested', {
      requestId,
      userId: principal.userId,
      paymentReference: reference,
      bilaReference: status.id,
      providerStatus: status.status,
    });

    if (isPrismaAvailable() && status.status) {
      const mappedStatus = mapBilaStatusToPaymentStatus(status.status);

      logStructuredEvent('info', '[DATABASE]', route, 'payment.status.verify', {
        requestId,
        userId: principal.userId,
        paymentReference: reference,
        providerStatus: status.status,
        mappedStatus,
      });

      const finalized = await applyPaymentStatusAndFinalize({
        reference,
        providerPaymentId: status.id,
        status: mappedStatus,
      });

      transactionUpdated = finalized.transactionUpdated;
      reservationFinalized = finalized.reservationFinalized;
      ticketDeliveryReady = finalized.ticketDeliveryReady;
    }

    logStructuredEvent('info', '[VERIFY]', route, 'response.sent', {
      requestId,
      userId: principal.userId,
      paymentReference: reference,
      httpStatus: 200,
      elapsedMs: Date.now() - startedAt,
      responseBody: {
        success: true,
        reference,
        status: status.status,
        transactionUpdated,
        reservationFinalized,
        ticketDeliveryReady,
      },
    });

    response.json({
      success: true,
      reference,
      id: status.id,
      bilaReference: status.id,
      status: status.status,
      transactionUpdated,
      reservationFinalized,
      ticketDeliveryReady,
    });
  } catch (error) {
    logPaymentError('[VERIFY]', route, 'verification.failed', error, {
      requestId,
      userId: principal.userId,
      paymentReference: reference,
      elapsedMs: Date.now() - startedAt,
    });
    response.status(502).json({
      success: false,
      message: error instanceof Error ? error.message : 'Unable to verify payment status with Bila.',
    });
  }
});

app.post(
  '/api/webhooks/bila',
  webhookRateLimiter,
  async (request: Request, response: Response) => {
    const route = '/api/webhooks/bila';
    const startedAt = Date.now();
    const requestId = resolveRequestId(request);
    const rawBody = (request as RequestWithRawBody).rawBody ?? Buffer.from('');
    const signature = request.header('x-bila-signature') || request.header('x-webhook-signature');

    console.log('==========================');
    console.log('WEBHOOK RECEIVED');
    console.log('==========================');
    logStructuredEvent('info', '[WEBHOOK]', route, 'received', {
      requestId,
      method: request.method,
      url: request.originalUrl,
      headers: request.headers,
      signatureHeader: signature,
      rawBody: rawBody.toString('utf8'),
    });

    try {
      let verificationReason = 'signature_validation_skipped';
      if (process.env.BILA_WEBHOOK_SECRET) {
        verificationReason = !signature ? 'missing_signature_header' : 'signature_mismatch';
      }

      logStructuredEvent('info', '[WEBHOOK]', route, 'signature.verification.started', {
        requestId,
        signatureHeader: signature,
      });
      const timestamp = request.header('x-bila-timestamp');
      const verificationPassed = verifyBilaWebhookSignature(rawBody.toString('utf8'), signature ?? '', timestamp ?? undefined);
      if (!verificationPassed) {
        logStructuredEvent('warn', '[WEBHOOK]', route, 'signature.verification.failed', {
          requestId,
          signatureHeader: signature,
          failureReason: verificationReason,
          rawBodyLength: rawBody.length,
        });
        response.status(401).json({success: false, message: 'Invalid webhook signature.'});
        logStructuredEvent('info', '[WEBHOOK]', route, 'response.sent', {
          requestId,
          httpStatus: 401,
          responseBody: { success: false, message: 'Invalid webhook signature.' },
          elapsedMs: Date.now() - startedAt,
        });
        return;
      }

      logStructuredEvent('info', '[WEBHOOK]', route, 'signature.verification.succeeded', {
        requestId,
        signatureHeader: signature,
      });

      let event: unknown = null;
      if (rawBody.length > 0) {
        try {
          event = JSON.parse(rawBody.toString('utf8'));
        } catch (error) {
          logPaymentError('[WEBHOOK]', route, 'invalid.json', error, {
            requestId,
            rawBody: rawBody.toString('utf8'),
          });
          response.status(400).json({success: false, message: 'Webhook body must be valid JSON.'});
          logStructuredEvent('info', '[WEBHOOK]', route, 'response.sent', {
            requestId,
            httpStatus: 400,
            responseBody: { success: false, message: 'Webhook body must be valid JSON.' },
            elapsedMs: Date.now() - startedAt,
          });
          return;
        }
      }

      const parsedBody = toJsonObject(event) ?? {};
      logStructuredEvent('info', '[WEBHOOK]', route, 'parsed.body', {
        requestId,
        parsedBody,
        eventType: typeof parsedBody.event === 'string' ? parsedBody.event : undefined,
        paymentReference: typeof parsedBody.reference === 'string' ? parsedBody.reference : undefined,
        transactionId: typeof parsedBody.id === 'string' ? parsedBody.id : undefined,
        paymentStatus: typeof parsedBody.status === 'string' ? parsedBody.status : undefined,
        amount: parsedBody.amount,
        currency: parsedBody.currency,
      });

      const parsed = parseBilaWebhookEvent(event);
      if (!parsed) {
        logStructuredEvent('warn', '[WEBHOOK]', route, 'missing.reference', {
          requestId,
          parsedBody,
        });
        response.status(400).json({ success: false, message: 'Webhook payload is missing event ID or reference.' });
        logStructuredEvent('info', '[WEBHOOK]', route, 'response.sent', {
          requestId,
          httpStatus: 400,
          responseBody: { success: false, message: 'Webhook payload is missing event ID or reference.' },
          elapsedMs: Date.now() - startedAt,
        });
        return;
      }

      logStructuredEvent('info', '[WEBHOOK]', route, 'event.parsed', {
        requestId,
        paymentReference: parsed.reference,
        transactionId: parsed.providerPaymentId,
        paymentStatus: parsed.status,
        eventId: parsed.providerEventId,
        eventType: parsed.event,
      });

      let resolvedReference = parsed.reference;
      if (!resolvedReference) {
        resolvedReference = await resolvePaymentReference(parsed.providerPaymentId, parsed.transactionId);
        if (!resolvedReference) {
          logStructuredEvent('warn', '[WEBHOOK]', route, 'reference.not.found', {
            requestId,
            providerPaymentId: parsed.providerPaymentId,
            transactionId: parsed.transactionId,
          });
          response.status(404).json({ success: false, message: 'No matching payment found for this webhook.' });
          logStructuredEvent('info', '[WEBHOOK]', route, 'response.sent', {
            requestId,
            httpStatus: 404,
            responseBody: { success: false, message: 'No matching payment found for this webhook.' },
            elapsedMs: Date.now() - startedAt,
          });
          return;
        }
      }

      const payload = toJsonObject(event) ?? {};
      const inserted = await persistWebhookDelivery({
        providerEventId: parsed.providerEventId,
        signature: signature ?? undefined,
        payload,
      });

      if (!inserted) {
        logStructuredEvent('info', '[WEBHOOK]', route, 'duplicate.webhook.received', {
          requestId,
          paymentReference: resolvedReference,
          eventId: parsed.providerEventId,
        });
        response.json({ success: true, received: true, duplicate: true });
        logStructuredEvent('info', '[WEBHOOK]', route, 'response.sent', {
          requestId,
          httpStatus: 200,
          responseBody: { success: true, received: true, duplicate: true },
          elapsedMs: Date.now() - startedAt,
        });
        return;
      }

      const finalized = await applyPaymentStatusAndFinalize({
        reference: resolvedReference,
        providerPaymentId: parsed.providerPaymentId,
        status: mapBilaStatusToPaymentStatus(parsed.status),
      });

      logEvent('info', 'payment.webhook.processed', {
        eventId: parsed.providerEventId,
        reference: resolvedReference,
        status: parsed.status,
        transactionUpdated: finalized.transactionUpdated,
        reservationFinalized: finalized.reservationFinalized,
        ticketDeliveryReady: finalized.ticketDeliveryReady,
        requestId,
      });

      logStructuredEvent('info', '[WEBHOOK]', route, 'response.sent', {
        requestId,
        paymentReference: resolvedReference,
        transactionId: parsed.providerPaymentId,
        paymentStatus: parsed.status,
        httpStatus: 200,
        elapsedMs: Date.now() - startedAt,
        responseBody: {
          success: true,
          received: true,
          eventId: parsed.providerEventId,
          reference: resolvedReference,
          status: parsed.status,
          transactionUpdated: finalized.transactionUpdated,
          reservationCreated: finalized.reservationFinalized,
          ticketDeliveryReady: finalized.ticketDeliveryReady,
        },
      });

      response.json({
        success: true,
        received: true,
        eventId: parsed.providerEventId,
        reference: resolvedReference,
        status: parsed.status,
        transactionUpdated: finalized.transactionUpdated,
        reservationCreated: finalized.reservationFinalized,
        ticketDeliveryReady: finalized.ticketDeliveryReady,
      });
    } catch (error) {
      logPaymentError('[WEBHOOK]', route, 'processing.failed', error, {
        requestId,
        rawBody: rawBody.toString('utf8'),
      });
      response.status(500).json({ success: false, message: 'Webhook processing failed.' });
      logStructuredEvent('error', '[WEBHOOK]', route, 'response.sent', {
        requestId,
        httpStatus: 500,
        responseBody: { success: false, message: 'Webhook processing failed.' },
        elapsedMs: Date.now() - startedAt,
      });
    }
  },
);

app.get('/api/payments/:reference/reservation', ticketReadRateLimiter, async (request: Request<{ reference: string }>, response: Response) => {
  const principal = await requireAuthenticatedSession(request);
  if (!principal) {
    response.status(401).json({ success: false, message: 'Authentication required.' });
    return;
  }

  const { reference } = request.params;
  if (!reference || reference.trim().length < 8) {
    response.status(400).json({ success: false, message: 'Payment reference is required.' });
    return;
  }

  if (!isPrismaAvailable()) {
    response.json({
      success: true,
      reference,
      paymentStatus: 'PENDING',
      reservation: null,
    });
    return;
  }

  const payment = await prisma.paymentTransaction.findUnique({
    where: { reference },
    select: { status: true, userId: true },
  });

  if (!payment) {
    response.status(404).json({ success: false, message: 'Payment not found for reference.' });
    return;
  }

  if (!canAccessPaymentReference(principal, payment.userId ?? null)) {
    response.status(403).json({ success: false, message: 'You are not authorized to view this reservation.' });
    return;
  }

  const reservation = await prisma.paymentReservation.findUnique({
    where: { paymentReference: reference },
    select: {
      fullName: true,
      email: true,
      quantity: true,
      seatDetails: true,
      ticketType: true,
      createdAt: true,
    },
  });

  response.json({
    success: true,
    reference,
    paymentStatus: payment.status,
    reservation: reservation
      ? {
          fullName: reservation.fullName,
          email: reservation.email,
          quantity: reservation.quantity,
          seatDetails: reservation.seatDetails,
          ticketType: fromInventoryEnum(reservation.ticketType),
          createdAt: reservation.createdAt.toISOString(),
        }
      : null,
  });
});

app.get('/api/payments/:reference/ticket-token', ticketReadRateLimiter, async (request: Request<{ reference: string }>, response: Response) => {
  const principal = await requireAuthenticatedSession(request);
  if (!principal) {
    response.status(401).json({ success: false, message: 'Authentication required.' });
    return;
  }

  const { reference } = request.params;
  if (!reference || reference.trim().length < 8) {
    response.status(400).json({ success: false, message: 'Payment reference is required.' });
    return;
  }

  if (!isPrismaAvailable()) {
    response.status(503).json({ success: false, message: 'Ticket token requires persistent storage.' });
    return;
  }

  const payment = await prisma.paymentTransaction.findUnique({
    where: { reference },
    select: { status: true, userId: true },
  });
  if (!payment || payment.status !== 'PAID') {
    response.status(404).json({ success: false, message: 'No paid ticket found for this reference.' });
    return;
  }

  if (!canAccessPaymentReference(principal, payment.userId ?? null)) {
    response.status(403).json({ success: false, message: 'You are not authorized to access this ticket.' });
    return;
  }

  const reservation = await prisma.paymentReservation.findUnique({
    where: { paymentReference: reference },
    select: { id: true },
  });
  if (!reservation) {
    response.status(404).json({ success: false, message: 'Reservation not found for reference.' });
    return;
  }

  const ticket = await prisma.ticket.findFirst({
    where: {
      reservationId: reservation.id,
    },
    orderBy: {
      createdAt: 'asc',
    },
    select: {
      qrCodeValue: true,
    },
  });

  if (!ticket) {
    response.status(404).json({ success: false, message: 'No ticket token found for this reservation.' });
    return;
  }

  response.json({
    success: true,
    reference,
    token: ticket.qrCodeValue,
    tokens: await prisma.ticket.findMany({
      where: {
        reservationId: reservation.id,
      },
      orderBy: {
        createdAt: 'asc',
      },
      select: {
        id: true,
        ticketId: true,
        qrCodeValue: true,
      },
    }).then((tickets) => tickets.map((row) => ({
      id: row.id,
      ticketId: row.ticketId,
      token: row.qrCodeValue,
    }))),
  });
});

app.get('/api/payments/:reference/ticket-pdf', ticketReadRateLimiter, async (request: Request<{ reference: string }>, response: Response) => {
  const principal = await requireAuthenticatedSession(request);
  if (!principal) {
    response.status(401).json({ success: false, message: 'Authentication required.' });
    return;
  }

  const { reference } = request.params;
  const ticketIdParam = typeof request.query.ticketId === 'string' ? request.query.ticketId.trim() : '';
  if (!reference || reference.trim().length < 8) {
    response.status(400).json({ success: false, message: 'Payment reference is required.' });
    return;
  }

  if (!isPrismaAvailable()) {
    response.status(503).json({ success: false, message: 'Ticket PDF requires persistent storage.' });
    return;
  }

  const payment = await prisma.paymentTransaction.findUnique({
    where: { reference },
    select: { status: true, userId: true },
  });
  if (!payment || payment.status !== 'PAID') {
    response.status(404).json({ success: false, message: 'No paid ticket found for this reference.' });
    return;
  }

  if (!canAccessPaymentReference(principal, payment.userId ?? null)) {
    response.status(403).json({ success: false, message: 'You are not authorized to download this ticket.' });
    return;
  }

  const reservation = await prisma.paymentReservation.findUnique({
    where: { paymentReference: reference },
    select: {
      id: true,
      fullName: true,
      email: true,
      ticketType: true,
      quantity: true,
      seatDetails: true,
      tickets: {
        select: {
          id: true,
          ticketId: true,
          qrCodeValue: true,
          pdfStoragePath: true,
          pdfChecksum: true,
        },
        orderBy: {
          createdAt: 'asc',
        },
      },
    },
  });
  if (!reservation) {
    response.status(404).json({ success: false, message: 'Reservation not found for reference.' });
    return;
  }

  const seatDetails = Array.isArray(reservation.seatDetails)
    ? reservation.seatDetails.filter((item): item is string => typeof item === 'string')
    : [];

  const selectedTicket = ticketIdParam
    ? reservation.tickets.find((ticket) => ticket.id === ticketIdParam)
    : reservation.tickets[0];

  if (!selectedTicket) {
    response.status(404).json({ success: false, message: 'Ticket not found for this reservation.' });
    return;
  }

  const resolvedStoragePath = selectedTicket.pdfStoragePath || buildTicketPdfStoragePath(reference, selectedTicket.ticketId);

  const storedPdf = await downloadTicketPdfFromStorage(resolvedStoragePath);
  if (storedPdf) {
    const storedChecksum = computeSha256Hex(storedPdf);
    const checksumMismatch = Boolean(selectedTicket.pdfChecksum && selectedTicket.pdfChecksum !== storedChecksum);

    if (!checksumMismatch) {
      if (!selectedTicket.pdfStoragePath || !selectedTicket.pdfChecksum) {
        await prisma.ticket.update({
          where: { id: selectedTicket.id },
          data: {
            pdfStoragePath: resolvedStoragePath,
            pdfChecksum: storedChecksum,
            pdfGeneratedAt: new Date(),
          },
        });
      }

      response.setHeader('Content-Type', 'application/pdf');
      response.setHeader('Content-Disposition', `attachment; filename="katina-ticket-${selectedTicket.ticketId}.pdf"`);
      response.send(Buffer.from(storedPdf));
      return;
    }

    logEvent('warn', 'ticket.pdf.checksum-mismatch.regenerate', {
      reference,
      storagePath: resolvedStoragePath,
    });
  }

  let pdfBytes: Uint8Array;
  try {
    pdfBytes = await buildTicketPdfBytes({
      reference,
      fullName: reservation.fullName,
      email: reservation.email,
      ticketType: fromInventoryEnum(reservation.ticketType),
      quantity: reservation.quantity,
      seatDetails,
      qrCodeValue: selectedTicket.qrCodeValue || signTicketToken(reference),
    });
  } catch (error) {
    response.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Unable to build ticket PDF.',
    });
    return;
  }

  const generatedChecksum = computeSha256Hex(pdfBytes);
  const uploaded = await uploadTicketPdfToStorage(resolvedStoragePath, pdfBytes);

  if (!uploaded) {
    logEvent('error', 'ticket.pdf.upload.failed-fallback', {
      reference,
      ticketId: selectedTicket.ticketId,
      storagePath: resolvedStoragePath,
      actionRequired: true,
      message: 'PDF was served to client but storage backup failed. Retry has been queued in persistent storage.',
    });

    await enqueueFailedPdfUpload({
      paymentReference: reference,
      ticketRecordId: selectedTicket.id,
      ticketPublicId: selectedTicket.ticketId,
      storagePath: resolvedStoragePath,
      errorMessage: 'Initial storage upload failed while serving ticket PDF.',
    });
  }

  if (uploaded && reservation.tickets.length > 0) {
    await prisma.ticket.update({
      where: {
        id: selectedTicket.id,
      },
      data: {
        pdfStoragePath: resolvedStoragePath,
        pdfChecksum: generatedChecksum,
        pdfGeneratedAt: new Date(),
      },
    });
  }

  response.setHeader('Content-Type', 'application/pdf');
  response.setHeader('Content-Disposition', `attachment; filename="katina-ticket-${selectedTicket.ticketId}.pdf"`);
  response.send(Buffer.from(pdfBytes));
});

app.get('/api/internal/retry-pdf-uploads', async (request: Request, response: Response) => {
  if (!isInternalRetryAuthorized(request)) {
    response.status(401).json({ success: false, message: 'Unauthorized.' });
    return;
  }

  if (!isPrismaAvailable()) {
    response.status(503).json({ success: false, message: 'Retry queue requires persistent storage.' });
    return;
  }

  const now = new Date();
  const pending = await prisma.failedPdfUpload.findMany({
    where: {
      status: 'PENDING',
      nextAttemptAt: {
        lte: now,
      },
    },
    orderBy: {
      nextAttemptAt: 'asc',
    },
    take: 25,
    select: {
      id: true,
      paymentReference: true,
      ticketRecordId: true,
      ticketPublicId: true,
      storagePath: true,
      attemptCount: true,
    },
  });

  let succeeded = 0;
  let failed = 0;
  let exhausted = 0;

  for (const row of pending) {
    const result = await processPendingPdfUploadRetry(row);
    if (result.status === 'succeeded') {
      succeeded += 1;
    } else if (result.status === 'exhausted') {
      exhausted += 1;
    } else {
      failed += 1;
    }
  }

  response.json({
    success: true,
    processed: pending.length,
    succeeded,
    failed,
    exhausted,
  });
});

app.get('/api/internal/retry-pdf-uploads/status', async (request: Request, response: Response) => {
  if (!isInternalRetryAuthorized(request)) {
    response.status(401).json({ success: false, message: 'Unauthorized.' });
    return;
  }

  if (!isPrismaAvailable()) {
    response.status(503).json({ success: false, message: 'Retry queue requires persistent storage.' });
    return;
  }

  const now = new Date();

  const [pendingCount, succeededCount, exhaustedCount, failedCount, oldestPending] = await Promise.all([
    prisma.failedPdfUpload.count({
      where: {
        status: 'PENDING',
        attemptCount: 0,
      },
    }),
    prisma.failedPdfUpload.count({
      where: {
        status: 'SUCCEEDED',
      },
    }),
    prisma.failedPdfUpload.count({
      where: {
        status: 'EXHAUSTED',
      },
    }),
    prisma.failedPdfUpload.count({
      where: {
        status: 'PENDING',
        attemptCount: {
          gt: 0,
        },
      },
    }),
    prisma.failedPdfUpload.findFirst({
      where: {
        status: 'PENDING',
      },
      orderBy: {
        createdAt: 'asc',
      },
      select: {
        createdAt: true,
        nextAttemptAt: true,
      },
    }),
  ]);

  const oldestPendingAgeSeconds = oldestPending
    ? Math.max(0, Math.floor((now.getTime() - oldestPending.createdAt.getTime()) / 1000))
    : null;

  response.json({
    success: true,
    queue: {
      pending: pendingCount,
      succeeded: succeededCount,
      failed: failedCount,
      exhausted: exhaustedCount,
    },
    oldestPending: oldestPending
      ? {
          createdAt: oldestPending.createdAt.toISOString(),
          nextAttemptAt: oldestPending.nextAttemptAt.toISOString(),
          ageSeconds: oldestPendingAgeSeconds,
        }
      : null,
    generatedAt: now.toISOString(),
  });
});

export { app };

if (process.env.NODE_ENV !== 'test' && process.env.VERCEL !== '1') {
  const startupValidation = validateStartupConfig();
  for (const warning of startupValidation.warnings) {
    logEvent('warn', 'startup.config.warning', { code: warning });
  }

  if (startupValidation.errors.length > 0) {
    for (const errorCode of startupValidation.errors) {
      logEvent('error', 'startup.config.error', { code: errorCode });
    }
    throw new Error(`Startup configuration validation failed: ${startupValidation.errors.join(', ')}`);
  }

  void ensureTicketInventorySeed();
  void ensureTicketDomainSeed();

  app.listen(port, () => {
    logEvent('info', 'server.started', {
      port,
      host: '127.0.0.1',
      dbConfigured: isPrismaAvailable(),
    });
  });
}