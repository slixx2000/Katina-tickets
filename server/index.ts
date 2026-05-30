import crypto from 'crypto';
import 'dotenv/config';
import express, {type Request, type Response} from 'express';
import type { Prisma } from '@prisma/client';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { buildAuthCookieName, buildClearedCookie, buildSetCookieHeaders, getAuthCookieOptions } from './auth/cookies';
import { createCsrfGuard, createInMemoryRateLimiter, createOriginGuard, type AuthenticatedRequest } from './auth/index';
import { logAuditEvent } from './auth/audit';
import { InMemorySessionStore, type AuthPrincipal } from './auth/session-store';
import type { SessionStore } from './auth/session-store';
import { InMemoryAuthRepository } from './auth/repository';
import type { AuthRepository } from './auth/repository';
import { verifySupabaseAccessToken } from './auth/supabase';
import { MFA_RECOMMENDED_ROLES, type AppRole } from '../shared/auth/roles';
import { isPrismaAvailable, prisma } from './lib/prisma';
import { PrismaSessionStore } from './auth/prisma-session-store';
import { PrismaAuthRepository } from './auth/prisma-repository';
import { canUseLencoGateway, createLencoCheckoutSession, parseLencoWebhookEvent } from './lib/lenco';

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
};

type AuthRefreshRequest = {
  refreshToken?: unknown;
};

type SessionPayload = {
  authenticated: boolean;
  user: AuthPrincipal | null;
  expiresAt?: string | null;
  refreshExpiresAt?: string | null;
};

type TicketTypeKey = 'ordinary' | 'vip';

const DEFAULT_INVENTORY: Record<TicketTypeKey, { price: number; totalCap: number; remaining: number }> = {
  ordinary: { price: 250, totalCap: 500, remaining: 500 },
  vip: { price: 850, totalCap: 250, remaining: 250 },
};

const app = express();
const port = Number(process.env.PORT || 8787);
const sessionStore: SessionStore = isPrismaAvailable() ? new PrismaSessionStore(prisma) : new InMemorySessionStore();
const authRepository: AuthRepository = isPrismaAvailable() ? new PrismaAuthRepository(prisma) : new InMemoryAuthRepository();
const sessionCookieName = buildAuthCookieName('katina-session');
const refreshCookieName = buildAuthCookieName('katina-refresh');
const allowedOrigins = [process.env.APP_URL, process.env.APP_ORIGIN, process.env.VITE_APP_URL].filter(
  (value): value is string => typeof value === 'string' && value.length > 0,
);
const authRateLimiter = createInMemoryRateLimiter({ limit: 8, windowMs: 60_000 });
const paymentRateLimiter = createInMemoryRateLimiter({ limit: 20, windowMs: 60_000 });
const webhookRateLimiter = createInMemoryRateLimiter({ limit: 120, windowMs: 60_000 });
const inMemoryWebhookEvents = new Set<string>();

app.use(
  express.json({
    limit: '1mb',
    verify: (request, _response, buffer) => {
      (request as RequestWithRawBody).rawBody = Buffer.from(buffer);
    },
  }),
);

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
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

  if (!secret || !providedSignature) {
    return true;
  }

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  if (expectedSignature.length !== providedSignature.length) {
    return false;
  }

  return crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(providedSignature));
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
  const env = process.env.NODE_ENV;
  return (env === 'development' || env === 'test') && flag === 'true';
}

async function buildTicketPdfBytes(input: {
  reference: string;
  fullName: string;
  email: string;
  ticketType: TicketTypeKey;
  quantity: number;
  seatDetails: string[];
}) {
  const document = await PDFDocument.create();
  const page = document.addPage([595, 842]); // A4
  const fontRegular = await document.embedFont(StandardFonts.Helvetica);
  const fontBold = await document.embedFont(StandardFonts.HelveticaBold);

  const drawLine = (label: string, value: string, y: number) => {
    page.drawText(label, { x: 56, y, size: 11, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
    page.drawText(value, { x: 180, y, size: 11, font: fontRegular, color: rgb(0.15, 0.15, 0.15) });
  };

  page.drawText('KATINA BASIL - Digital Ticket', {
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

  drawLine('Payment Reference', input.reference, 720);
  drawLine('Guest Name', input.fullName, 696);
  drawLine('Guest Email', input.email, 672);
  drawLine('Ticket Type', input.ticketType.toUpperCase(), 648);
  drawLine('Quantity', String(input.quantity), 624);
  drawLine('Seats', input.seatDetails.join(', '), 600);

  page.drawText(`Issued at: ${new Date().toISOString()}`, {
    x: 56,
    y: 560,
    size: 10,
    font: fontRegular,
    color: rgb(0.35, 0.35, 0.35),
  });

  const token = signTicketToken(input.reference);
  page.drawText('Ticket Token (Scanner Payload)', {
    x: 56,
    y: 520,
    size: 11,
    font: fontBold,
    color: rgb(0.1, 0.1, 0.1),
  });
  page.drawText(token, {
    x: 56,
    y: 500,
    size: 8,
    font: fontRegular,
    color: rgb(0.2, 0.2, 0.2),
    maxWidth: 480,
    lineHeight: 10,
  });

  return await document.save();
}

async function ensureTicketInventorySeed() {
  if (!isPrismaAvailable()) {
    return;
  }

  const count = await prisma.ticketInventory.count();
  if (count > 0) {
    return;
  }

  await prisma.ticketInventory.createMany({
    data: [
      {
        type: 'ORDINARY',
        price: DEFAULT_INVENTORY.ordinary.price,
        totalCap: DEFAULT_INVENTORY.ordinary.totalCap,
        remaining: DEFAULT_INVENTORY.ordinary.remaining,
      },
      {
        type: 'VIP',
        price: DEFAULT_INVENTORY.vip.price,
        totalCap: DEFAULT_INVENTORY.vip.totalCap,
        remaining: DEFAULT_INVENTORY.vip.remaining,
      },
    ],
  });
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

      await tx.paymentReservation.create({
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
    });
    return true;
  } catch {
    return false;
  }
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

app.get('/api/health', (_request: Request, response: Response) => {
  response.json({ok: true, service: 'katina-tickets-api'});
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

  if (!accessToken) {
    response.status(400).json({ success: false, message: 'An access token is required.' });
    return;
  }

  const verifiedUser = await verifySupabaseAccessToken(accessToken);
  let principal: AuthPrincipal | null = null;

  if (verifiedUser) {
    principal = {
      userId: verifiedUser.id,
      email: verifiedUser.email,
      role: verifiedUser.role,
      mfaEnabled: verifiedUser.mfaEnabled,
    };
    await authRepository.upsertUserFromOAuth({
      id: verifiedUser.id,
      email: verifiedUser.email,
      role: verifiedUser.role,
      mfaEnabled: verifiedUser.mfaEnabled,
    });
  } else if (isDevAuthBypassEnabled() && accessToken.startsWith('dev-session:')) {
    const [, email = '', role = 'SUPPORT'] = accessToken.split(':');
    if (!isNonEmptyString(email)) {
      response.status(400).json({ success: false, message: 'Invalid development token.' });
      return;
    }

    principal = {
      userId: `dev-${crypto.createHash('sha1').update(email).digest('hex').slice(0, 12)}`,
      email,
      role: role as AppRole,
      mfaEnabled: resolveMfaFlag(role as AppRole),
    };
  }

  if (!principal) {
    response.status(401).json({ success: false, message: 'Unable to verify the provided access token.' });
    return;
  }

  const bundle = await sessionStore.createSession(principal);
  setAuthCookies(response, bundle.accessToken, bundle.refreshToken, bundle.expiresAt, bundle.refreshExpiresAt);
  logAuditEvent({
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
      logAuditEvent({
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

const requireAuthenticatedSession = async (request: Request): Promise<AuthPrincipal | null> => {
  const principal = await resolveSessionFromCookie(request);
  return principal;
};

app.get('/api/admin/overview', async (request: Request, response: Response) => {
  const principal = await requireAuthenticatedSession(request);
  if (!principal) {
    response.status(401).json({ success: false, message: 'Authentication required.' });
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

  if (!['SUPER_ADMIN', 'SCANNER'].includes(principal.role)) {
    response.status(403).json({ success: false, message: 'Forbidden.' });
    return;
  }

  response.json({ success: true, section: 'scanner', user: principal });
});

app.get('/api/finance/reports', async (request: Request, response: Response) => {
  const principal = await requireAuthenticatedSession(request);
  if (!principal) {
    response.status(401).json({ success: false, message: 'Authentication required.' });
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

  if (!['SUPER_ADMIN', 'ORGANIZER'].includes(principal.role)) {
    response.status(403).json({ success: false, message: 'Forbidden.' });
    return;
  }

  response.json({ success: true, section: 'organizer', user: principal });
});

app.post('/api/pay', paymentRateLimiter, createOriginGuard(allowedOrigins), createCsrfGuard(allowedOrigins), async (request: AuthenticatedRequest & Request<unknown, unknown, LencoPaymentRequest>, response: Response) => {
  const principal = await requireAuthenticatedSession(request);
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
    userId: principal?.userId,
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

  if (principal) {
    logAuditEvent({
      name: 'SESSION_CREATED',
      actorUserId: principal.userId,
      targetUserId: principal.userId,
      resourceType: 'payment-intent',
      resourceId: reference,
      metadata: { amount, currency: payload.currency, role: principal.role },
      request: request as Request,
    });
  }

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

    response.json({
      success: true,
      received: true,
      eventId: parsed.providerEventId,
      reference: parsed.reference,
      status: parsed.status,
      transactionUpdated: updated,
      reservationCreated,
    });
  },
);

app.get('/api/payments/:reference/reservation', async (request: Request<{ reference: string }>, response: Response) => {
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
    select: { status: true },
  });

  if (!payment) {
    response.status(404).json({ success: false, message: 'Payment not found for reference.' });
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

app.get('/api/payments/:reference/ticket-token', async (request: Request<{ reference: string }>, response: Response) => {
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
    select: { status: true },
  });
  if (!payment || payment.status !== 'PAID') {
    response.status(404).json({ success: false, message: 'No paid ticket found for this reference.' });
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

  try {
    response.json({
      success: true,
      reference,
      token: signTicketToken(reference),
    });
  } catch (error) {
    response.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Unable to sign ticket token.',
    });
  }
});

app.get('/api/payments/:reference/ticket-pdf', async (request: Request<{ reference: string }>, response: Response) => {
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
    select: { status: true },
  });
  if (!payment || payment.status !== 'PAID') {
    response.status(404).json({ success: false, message: 'No paid ticket found for this reference.' });
    return;
  }

  const reservation = await prisma.paymentReservation.findUnique({
    where: { paymentReference: reference },
    select: {
      fullName: true,
      email: true,
      ticketType: true,
      quantity: true,
      seatDetails: true,
    },
  });
  if (!reservation) {
    response.status(404).json({ success: false, message: 'Reservation not found for reference.' });
    return;
  }

  const seatDetails = Array.isArray(reservation.seatDetails)
    ? reservation.seatDetails.filter((item): item is string => typeof item === 'string')
    : [];

  let pdfBytes: Uint8Array;
  try {
    pdfBytes = await buildTicketPdfBytes({
      reference,
      fullName: reservation.fullName,
      email: reservation.email,
      ticketType: fromInventoryEnum(reservation.ticketType),
      quantity: reservation.quantity,
      seatDetails,
    });
  } catch (error) {
    response.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Unable to build ticket PDF.',
    });
    return;
  }

  response.setHeader('Content-Type', 'application/pdf');
  response.setHeader('Content-Disposition', `attachment; filename="katina-ticket-${reference}.pdf"`);
  response.send(Buffer.from(pdfBytes));
});

export { app };

if (process.env.NODE_ENV !== 'test') {
  void ensureTicketInventorySeed();

  app.listen(port, () => {
    console.log(`Katina Tickets API listening on http://127.0.0.1:${port}`);
  });
}