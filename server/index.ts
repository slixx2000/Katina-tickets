import crypto from 'crypto';
import 'dotenv/config';
import express, {type Request, type Response} from 'express';
import type { Prisma } from '@prisma/client';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { createClient } from '@supabase/supabase-js';
import { buildAuthCookieName, buildClearedCookie, buildSetCookieHeaders, getAuthCookieOptions } from './auth/cookies';
import { createCsrfGuard, createInMemoryRateLimiter, createOriginGuard, type AuthenticatedRequest } from './auth/index';
import { buildAuditEvent, logAuditEvent, type AuditEvent } from './auth/audit';
import { InMemorySessionStore, type AuthPrincipal } from './auth/session-store';
import type { SessionStore } from './auth/session-store';
import { InMemoryAuthRepository } from './auth/repository';
import type { AuthRepository } from './auth/repository';
import { verifySupabaseAccessToken } from './auth/supabase';
import { MFA_RECOMMENDED_ROLES, normalizeAppRole, type AppRole } from '../shared/auth/roles';
import { isPrismaAvailable, prisma } from './lib/prisma';
import { PrismaSessionStore } from './auth/prisma-session-store';
import { PrismaAuthRepository } from './auth/prisma-repository';
import { canUseLencoGateway, createLencoCheckoutSession, parseLencoWebhookEvent } from './lib/lenco';
import {
  buildOtpAuthUri,
  decryptMfaSecret,
  encryptMfaSecret,
  generateBackupCodes,
  generateTotpSecret,
  hashRecoveryCode,
  verifyTotpCode,
} from './auth/mfa';

type LencoPaymentRequest = {
  amount?: unknown;
  currency?: unknown;
  description?: unknown;
  customerEmail?: unknown;
  customerName?: unknown;
  metadata?: unknown;
};

type RequestWithRawBody = Request & {
  rawBody?: Buffer;
};

type AuthExchangeRequest = {
  accessToken?: unknown;
  mfaCode?: unknown;
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

function hasValue(value: string | undefined) {
  return typeof value === 'string' && value.trim().length > 0;
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
  const lencoSecretConfigured = hasValue(process.env.LENCO_SECRET_KEY);
  const lencoWebhookSecretConfigured = hasValue(process.env.LENCO_WEBHOOK_SECRET);

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

  if (isProductionRuntime() && !lencoSecretConfigured) {
    errors.push('LENCO_SECRET_KEY_REQUIRED_IN_PRODUCTION');
  }

  if (isProductionRuntime() && !lencoWebhookSecretConfigured) {
    errors.push('LENCO_WEBHOOK_SECRET_REQUIRED_IN_PRODUCTION');
  }

  if (lencoSecretConfigured && !lencoWebhookSecretConfigured) {
    warnings.push('LENCO_WEBHOOK_SECRET_MISSING_SIGNATURE_VERIFICATION_REDUCED');
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

app.use(
  express.json({
    limit: '1mb',
    verify: (request, _response, buffer) => {
      (request as RequestWithRawBody).rawBody = Buffer.from(buffer);
    },
  }),
);

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
  if (!signatureHeader) {
    return null;
  }

  const trimmed = signatureHeader.trim();
  if (!trimmed) {
    return null;
  }

  const parts = trimmed.split(',').map((part) => part.trim());
  const direct = parts.find((part) => !part.includes('='));
  if (direct) {
    return direct;
  }

  const keyValue = parts.find((part) => part.startsWith('v1=')) || parts[0];
  return keyValue.includes('=') ? keyValue.split('=')[1] : keyValue;
}

function verifyWebhookSignature(rawBody: Buffer, signatureHeader: string | undefined) {
  const secret = process.env.LENCO_WEBHOOK_SECRET;
  const providedSignature = parseWebhookSignature(signatureHeader);
  const isProd = isProductionRuntime();

  if (!secret || !providedSignature) {
    if (isProd) {
      return false;
    }

    return true;
  }

  const normalizedProvidedSignature = providedSignature.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalizedProvidedSignature)) {
    return false;
  }

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  if (expectedSignature.length !== normalizedProvidedSignature.length) {
    return false;
  }

  return crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(normalizedProvidedSignature));
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
  const secret = process.env.NEXTAUTH_SECRET || process.env.LENCO_WEBHOOK_SECRET;
  if (!secret && process.env.NODE_ENV === 'production') {
    throw new Error('NEXTAUTH_SECRET or LENCO_WEBHOOK_SECRET must be configured in production.');
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

  return await document.save();
}

function buildTicketPdfStoragePath(reference: string) {
  const normalizedReference = reference.replace(/[^A-Za-z0-9_-]/g, '-');
  return `${DEFAULT_EVENT_YEAR}/${normalizedReference}.pdf`;
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

  const event = await ensureDefaultEvent();
  if (!event) {
    return false;
  }

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

  if (!payment || payment.status !== 'PAID') {
    return false;
  }

  const metadata = (payment.metadata ?? {}) as Record<string, unknown>;
  const ticketType = parseTicketType(metadata.ticketType);
  const quantity = parseQuantity(metadata.quantity);
  if (!ticketType || !quantity) {
    return false;
  }

  try {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.paymentReservation.findUnique({ where: { paymentReference: reference } });
      if (existing) {
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

      await createTicketsForReservation(tx, {
        reservationId: reservation.id,
        eventId: event.id,
        ticketType: toInventoryEnum(ticketType),
        holderName: reservation.fullName,
        holderEmail: reservation.email,
        quantity: reservation.quantity,
      });
    });
    return true;
  } catch {
    return false;
  }
}

async function queueTicketDeliveryAfterPersistence(reference: string) {
  if (!isPrismaAvailable()) {
    return false;
  }

  const reservation = await prisma.paymentReservation.findUnique({
    where: { paymentReference: reference },
    select: {
      id: true,
      email: true,
      quantity: true,
      tickets: {
        select: {
          id: true,
        },
      },
    },
  });

  if (!reservation || reservation.tickets.length < reservation.quantity) {
    logEvent('warn', 'ticket.delivery.skipped.persistence-incomplete', {
      reference,
      reservationFound: Boolean(reservation),
      expectedTicketCount: reservation?.quantity ?? null,
      actualTicketCount: reservation?.tickets.length ?? null,
    });
    return false;
  }

  // Delivery integration point: this executes only after reservation + ticket persistence has been verified.
  logEvent('info', 'ticket.delivery.ready', {
    reference,
    email: reservation.email,
    ticketCount: reservation.tickets.length,
    providerConfigured: hasValue(process.env.TICKET_DELIVERY_PROVIDER),
  });

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

  return result.count > 0;
}

async function persistWebhookDelivery(input: {
  providerEventId: string;
  signature?: string;
  payload: Record<string, unknown>;
}) {
  if (!isPrismaAvailable()) {
    if (inMemoryWebhookEvents.has(input.providerEventId)) {
      return false;
    }

    inMemoryWebhookEvents.add(input.providerEventId);
    return true;
  }

  try {
    await prisma.webhookDelivery.create({
      data: {
        provider: 'LENCO',
        providerEventId: input.providerEventId,
        signature: input.signature,
        payload: toPrismaJson(input.payload) ?? ({} as Prisma.InputJsonValue),
      },
    });
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('Unique constraint failed')) {
      return false;
    }
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

app.get('/api/auth/session', async (request: Request, response: Response) => {
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

app.post('/api/auth/exchange', authRateLimiter, createOriginGuard(allowedOrigins), createCsrfGuard(allowedOrigins), async (request: Request, response: Response) => {
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
    const user = await authRepository.upsertUserFromOAuth({
      id: verifiedUser.id,
      email: verifiedUser.email,
      role: verifiedUser.role,
      mfaEnabled: verifiedUser.mfaEnabled,
    });

    const hasActiveMfaFactor = roleRequiresMfa(user.role)
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

app.post('/api/auth/logout', authRateLimiter, async (request: Request, response: Response) => {
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

app.post('/api/auth/refresh', authRateLimiter, createOriginGuard(allowedOrigins), createCsrfGuard(allowedOrigins), async (request: Request, response: Response) => {
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

app.post('/api/auth/mfa/enroll', authRateLimiter, createOriginGuard(allowedOrigins), createCsrfGuard(allowedOrigins), async (request: Request, response: Response) => {
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

app.post('/api/auth/mfa/activate', authRateLimiter, createOriginGuard(allowedOrigins), createCsrfGuard(allowedOrigins), async (request: Request, response: Response) => {
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

app.post('/api/auth/mfa/disable', authRateLimiter, createOriginGuard(allowedOrigins), createCsrfGuard(allowedOrigins), async (request: Request, response: Response) => {
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

app.get('/api/auth/mfa/status', async (request: Request, response: Response) => {
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

  if (!(await requireMfaForPrincipal(request, response, principal))) {
    return;
  }

  if (!['SUPER_ADMIN'].includes(principal.role)) {
    response.status(403).json({ success: false, message: 'Forbidden.' });
    return;
  }

  response.json({ success: true, section: 'admin', user: principal });
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

app.post('/api/scanner/validate', async (request: Request<{}, unknown, ScannerValidateRequest>, response: Response) => {
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

app.post('/api/scanner/check-in', async (request: Request<{}, unknown, ScannerCheckInRequest>, response: Response) => {
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

  response.json({ success: true, section: 'finance', user: principal });
});

app.post('/api/organizer/events', async (request: Request, response: Response) => {
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
    })),
  });
});

app.post('/api/pay', paymentRateLimiter, createOriginGuard(allowedOrigins), createCsrfGuard(allowedOrigins), async (request: AuthenticatedRequest & Request<unknown, unknown, LencoPaymentRequest>, response: Response) => {
  const principal = await requireAuthenticatedSession(request);
  if (!principal) {
    response.status(401).json({ success: false, message: 'Sign in is required before purchasing tickets.' });
    return;
  }

  const {amount, currency, description, customerEmail, customerName, metadata} = request.body;

  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
    response.status(400).json({success: false, message: 'A valid amount is required.'});
    return;
  }

  if (!isNonEmptyString(currency) || !isNonEmptyString(description)) {
    response.status(400).json({success: false, message: 'Currency and description are required.'});
    return;
  }

  const normalizedMetadata = toJsonObject(metadata);
  const ticketType = parseTicketType(normalizedMetadata?.ticketType);
  const quantity = parseQuantity(normalizedMetadata?.quantity);
  if (!ticketType || !quantity) {
    response.status(400).json({ success: false, message: 'Payment metadata must include ticketType and quantity.' });
    return;
  }

  if (!canUseLencoGateway()) {
    response.status(503).json({ success: false, message: 'Payment provider not configured on the server.' });
    return;
  }

  const reference = `LENCO-${crypto.randomUUID()}`;
  const payload: {
    amount: number;
    currency: string;
    description: string;
    customerEmail?: string;
    customerName?: string;
    metadata?: Record<string, unknown>;
    reference: string;
  } = {
    amount,
    currency: currency.trim().toUpperCase(),
    description: description.trim(),
    customerEmail: isNonEmptyString(customerEmail) ? customerEmail.trim() : undefined,
    customerName: isNonEmptyString(customerName) ? customerName.trim() : undefined,
    metadata: normalizedMetadata,
    reference,
  };

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

  let checkout;
  try {
    checkout = await createLencoCheckoutSession(payload);
  } catch (error) {
    if (isPrismaAvailable()) {
      await updatePaymentIntentFromWebhook({ reference, status: 'FAILED' });
    }
    response.status(502).json({
      success: false,
      message: error instanceof Error ? error.message : 'Unable to create checkout session with payment provider.',
    });
    return;
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

  response.json({
    success: true,
    message: 'Payment session created.',
    reference,
    checkoutUrl: checkout.checkoutUrl,
    providerReference: checkout.providerReference,
    status: checkout.status ?? 'PENDING',
  });
});

app.post(
  '/api/webhook',
  webhookRateLimiter,
  async (request: Request, response: Response) => {
    const rawBody = (request as RequestWithRawBody).rawBody ?? Buffer.from('');
    const signature = request.header('x-lenco-signature') || request.header('x-webhook-signature');

    if (!verifyWebhookSignature(rawBody, signature)) {
      response.status(401).json({success: false, message: 'Invalid webhook signature.'});
      return;
    }

    let event: unknown = null;
    if (rawBody.length > 0) {
      try {
        event = JSON.parse(rawBody.toString('utf8'));
      } catch {
        response.status(400).json({success: false, message: 'Webhook body must be valid JSON.'});
        return;
      }
    }

    const parsed = parseLencoWebhookEvent(event);
    if (!parsed) {
      response.status(400).json({ success: false, message: 'Webhook payload is missing event ID or reference.' });
      return;
    }

    const payload = toJsonObject(event) ?? {};
    const inserted = await persistWebhookDelivery({
      providerEventId: parsed.providerEventId,
      signature: signature ?? undefined,
      payload,
    });

    if (!inserted) {
      response.json({ success: true, received: true, duplicate: true });
      return;
    }

    const updated = await updatePaymentIntentFromWebhook({
      reference: parsed.reference,
      providerPaymentId: parsed.providerPaymentId,
      status: parsed.status,
    });

    const reservationCreated = parsed.status === 'PAID'
      ? await finalizeReservationForPaidPayment(parsed.reference)
      : false;

    const ticketDeliveryReady = parsed.status === 'PAID' && reservationCreated
      ? await queueTicketDeliveryAfterPersistence(parsed.reference)
      : false;

    logEvent('info', 'payment.webhook.processed', {
      eventId: parsed.providerEventId,
      reference: parsed.reference,
      status: parsed.status,
      transactionUpdated: updated,
      reservationCreated,
      ticketDeliveryReady,
    });

    response.json({
      success: true,
      received: true,
      eventId: parsed.providerEventId,
      reference: parsed.reference,
      status: parsed.status,
      transactionUpdated: updated,
      reservationCreated,
      ticketDeliveryReady,
    });
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
  });
});

app.get('/api/payments/:reference/ticket-pdf', ticketReadRateLimiter, async (request: Request<{ reference: string }>, response: Response) => {
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

  const primaryTicket = reservation.tickets[0] ?? null;
  const resolvedStoragePath = primaryTicket?.pdfStoragePath || buildTicketPdfStoragePath(reference);

  const storedPdf = await downloadTicketPdfFromStorage(resolvedStoragePath);
  if (storedPdf) {
    const storedChecksum = computeSha256Hex(storedPdf);
    const checksumMismatch = Boolean(primaryTicket?.pdfChecksum && primaryTicket.pdfChecksum !== storedChecksum);

    if (!checksumMismatch) {
      if (primaryTicket && (!primaryTicket.pdfStoragePath || !primaryTicket.pdfChecksum)) {
        await prisma.ticket.updateMany({
          where: { reservationId: reservation.id },
          data: {
            pdfStoragePath: resolvedStoragePath,
            pdfChecksum: storedChecksum,
            pdfGeneratedAt: new Date(),
          },
        });
      }

      response.setHeader('Content-Type', 'application/pdf');
      response.setHeader('Content-Disposition', `attachment; filename="katina-ticket-${reference}.pdf"`);
      response.send(Buffer.from(storedPdf));
      return;
    }

    logEvent('warn', 'ticket.pdf.checksum-mismatch.regenerate', {
      reference,
      storagePath: resolvedStoragePath,
    });
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

  let pdfBytes: Uint8Array;
  try {
    pdfBytes = await buildTicketPdfBytes({
      reference,
      fullName: reservation.fullName,
      email: reservation.email,
      ticketType: fromInventoryEnum(reservation.ticketType),
      quantity: reservation.quantity,
      seatDetails,
      qrCodeValue: ticket?.qrCodeValue ?? signTicketToken(reference),
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
    logEvent('warn', 'ticket.pdf.upload.failed-fallback', {
      reference,
      storagePath: resolvedStoragePath,
    });
  }

  if (uploaded && reservation.tickets.length > 0) {
    await prisma.ticket.updateMany({
      where: {
        reservationId: reservation.id,
      },
      data: {
        pdfStoragePath: resolvedStoragePath,
        pdfChecksum: generatedChecksum,
        pdfGeneratedAt: new Date(),
      },
    });
  }

  response.setHeader('Content-Type', 'application/pdf');
  response.setHeader('Content-Disposition', `attachment; filename="katina-ticket-${reference}.pdf"`);
  response.send(Buffer.from(pdfBytes));
});

export { app };

if (process.env.NODE_ENV !== 'test') {
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