import crypto from 'crypto';

type BilaPaymentStatus = 'pending' | 'completed' | 'failed' | 'refunded';

type BilaResponseEnvelope<T> = {
  success?: boolean;
  message?: string;
  data?: T;
  error?: string;
};

export type BilaMobileMoneyProvider = 'mtn' | 'airtel' | 'zamtel' | 'vodacom';

export type BilaMobileMoneyCollection = {
  id?: string;
  reference?: string;
  status?: string;
  amount?: number;
  currency?: string;
  phone?: string;
  provider?: string;
};

export type BilaMobileMoneyCollectionRequest = {
  amount: number;
  currency: string;
  description?: string;
  customerEmail?: string;
  customerName?: string;
  phone: string;
  provider: BilaMobileMoneyProvider;
  reference: string;
  metadata?: Record<string, unknown>;
  callback_url?: string;
  walletId: string;
  country: string;
  bearer?: 'merchant' | 'customer';
  narration?: string;
  customerNames?: string;
};

export type BilaCollectionStatusResponse = {
  success: boolean;
  message?: string;
  id?: string;
  reference?: string;
  status?: BilaPaymentStatus;
};

export function getBilaApiBaseUrl() {
  const configuredBaseUrl = process.env.BILA_API_BASE_URL?.trim();
  if (configuredBaseUrl) {
    return configuredBaseUrl.replace(/\/$/, '');
  }

  return 'https://api.usebila.com';
}

function getBilaSecretKey() {
  return process.env.BILA_SECRET_KEY?.trim() || null;
}

export function getBilaWalletId() {
  const walletId = process.env.BILA_WALLET_ID?.trim();
  if (!walletId) {
    throw new Error('BILA_WALLET_ID is required to create Bila mobile money collections.');
  }
  return walletId;
}

export function getBilaCountry() {
  return process.env.BILA_COUNTRY?.trim().toLowerCase() || 'zm';
}

function hasBilaCredentials() {
  return Boolean(getBilaApiBaseUrl() && getBilaSecretKey() && process.env.BILA_WALLET_ID?.trim());
}

function buildBilaHeaders() {
  const secretKey = getBilaSecretKey();
  if (!secretKey) {
    throw new Error('BILA_SECRET_KEY is required to call Bila.');
  }

  return {
    'x-api-key': secretKey,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

function readEnvelope<T>(payload: unknown): BilaResponseEnvelope<T> {
  if (typeof payload !== 'object' || payload === null) {
    return {};
  }

  return payload as BilaResponseEnvelope<T>;
}

function extractData<T>(payload: unknown): T | null {
  const envelope = readEnvelope<T>(payload);
  return envelope.data ?? (typeof payload === 'object' && payload !== null ? (payload as T) : null);
}

function normalizeStatus(value: unknown): BilaPaymentStatus {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';

  if (normalized === 'pending' || normalized === 'completed' || normalized === 'failed' || normalized === 'refunded') {
    return normalized;
  }

  // Map common alternative status names
  if (normalized === 'success' || normalized === 'paid') {
    return 'completed';
  }

  if (normalized === 'cancelled') {
    return 'failed';
  }

  return 'pending';
}

async function parseJsonResponse(response: Response) {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

async function postBilaJson<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const finalUrl = `${getBilaApiBaseUrl()}${path}`;
  // Log non-sensitive request information for debugging (do not log secrets)
  try {
    const safeBody = {...body};
    if ('walletId' in safeBody) delete (safeBody as Record<string, unknown>).walletId;
    console.info('[BILA] outgoing.request', { finalUrl, body: safeBody, bilaApiBaseUrlDefined: Boolean(process.env.BILA_API_BASE_URL), bilaSecretDefined: Boolean(process.env.BILA_SECRET_KEY), bilaWalletDefined: Boolean(process.env.BILA_WALLET_ID) });
  } catch (e) {
    console.warn('[BILA] outgoing.request.logging.failed', String(e));
  }

  const response = await fetch(finalUrl, {
    method: 'POST',
    headers: buildBilaHeaders(),
    body: JSON.stringify(body),
  });

  console.info('[BILA] outgoing.response', { finalUrl, status: response.status });

  const payload = await parseJsonResponse(response);
  if (!response.ok) {
    const message = typeof payload === 'object' && payload !== null && 'message' in payload
      ? String((payload as { message?: unknown }).message ?? '')
      : '';
    throw new Error(message || `Bila request failed with HTTP ${response.status}.`);
  }

  return extractData<T>(payload) as T;
}

async function getBilaJson<T>(path: string): Promise<T> {
  const secretKey = getBilaSecretKey();
  if (!secretKey) {
    throw new Error('BILA_SECRET_KEY is required to call Bila.');
  }

  const response = await fetch(`${getBilaApiBaseUrl()}${path}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      Accept: 'application/json',
    },
  });

  const payload = await parseJsonResponse(response);
  if (!response.ok) {
    const message = typeof payload === 'object' && payload !== null && 'message' in payload
      ? String((payload as { message?: unknown }).message ?? '')
      : '';
    throw new Error(message || `Bila request failed with HTTP ${response.status}.`);
  }

  return extractData<T>(payload) as T;
}

export function canUseBilaGateway() {
  return hasBilaCredentials();
}

export async function createBilaMobileMoneyCollection(request: BilaMobileMoneyCollectionRequest) {
  const requestPayload = {
    amount: Math.round(request.amount),
    reference: request.reference,
    phone: request.phone,
    operator: request.provider,
    country: request.country,
    walletId: request.walletId,
    bearer: request.bearer ?? 'merchant',
    narration: request.narration ?? request.description,
    customerName: request.customerName ?? request.customerNames,
  } as Record<string, unknown>;

  // Log prepared payload without secrets
  try {
    const safePayload = {...requestPayload};
    if ('walletId' in safePayload) delete safePayload.walletId;
    console.info('[BILA] create.collection.pre', { path: '/api/v1/bila/collections/mobile-money', safePayload, bilaApiBaseUrlDefined: Boolean(process.env.BILA_API_BASE_URL), bilaSecretDefined: Boolean(process.env.BILA_SECRET_KEY), bilaWalletDefined: Boolean(process.env.BILA_WALLET_ID) });
  } catch (e) {
    console.warn('[BILA] create.collection.pre.logging.failed', String(e));
  }

  const payload = await postBilaJson<BilaMobileMoneyCollection>('/api/v1/bila/collections/mobile-money', requestPayload);

  return {
    id: payload.id ?? payload.reference ?? request.reference,
    reference: payload.reference ?? request.reference,
    bilaReference: payload.id ?? request.reference,
    status: normalizeBilaPaymentStatus(payload.status),
  };
}

export async function getBilaCollectionStatus(reference: string): Promise<BilaCollectionStatusResponse> {
  const payload = await getBilaJson<BilaMobileMoneyCollection>(`/api/v1/bila/collections/status/${encodeURIComponent(reference)}`);
  return {
    success: true,
    reference: payload.reference ?? reference,
    id: payload.id,
    status: normalizeBilaPaymentStatus(payload.status),
  };
}

export function normalizeBilaPaymentStatus(value: unknown): BilaPaymentStatus {
  return normalizeStatus(value);
}

export function parseBilaWebhookEvent(event: unknown) {
  const payload = typeof event === 'object' && event !== null ? event as Record<string, unknown> : null;
  if (!payload) {
    return null;
  }

  // Bila webhook structure typically includes event type and data
  const eventType = typeof payload.event === 'string' ? payload.event : '';
  const data = typeof payload.data === 'object' && payload.data !== null
    ? (payload.data as Record<string, unknown>)
    : (payload as Record<string, unknown>);

  const reference = typeof data.reference === 'string'
    ? data.reference
    : typeof payload.reference === 'string'
      ? payload.reference
      : null;

  const providerPaymentId = typeof data.id === 'string'
    ? data.id
    : typeof payload.id === 'string'
      ? payload.id
      : undefined;

  const status = normalizeBilaPaymentStatus(
    typeof data.status === 'string' ? data.status : typeof payload.status === 'string' ? payload.status : undefined,
  );

  const eventId = typeof payload.eventId === 'string'
    ? payload.eventId
    : crypto.createHash('sha1').update(JSON.stringify(payload)).digest('hex');

  if (!reference) {
    return null;
  }

  return {
    providerEventId: eventId,
    reference,
    providerPaymentId,
    status,
    event: eventType,
  };
}

/**
 * Verify Bila webhook signature using HMAC-SHA256.
 * Follows the same pattern as the current webhook signature verification in server/index.ts.
 */
export function verifyBilaWebhookSignature(rawBody: string, signatureHeader: string): boolean {
  const secret = process.env.BILA_WEBHOOK_SECRET?.trim();
  if (!secret) {
    console.warn('[WEBHOOK] BILA_WEBHOOK_SECRET not configured');
    return false;
  }

  try {
    // Bila sends signature in a header (typically x-webhook-signature or similar)
    // Format: typically "whsec_..." or similar
    const expectedSignature = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    
    // Remove any "whsec_" prefix if present in the header
    const cleanedHeader = signatureHeader.replace(/^sha256=/, '').replace(/^whsec_/, '');

    if (expectedSignature.length !== cleanedHeader.length) {
      console.warn('[WEBHOOK] Signature length mismatch', {
        expectedLength: expectedSignature.length,
        receivedLength: cleanedHeader.length,
      });
      return false;
    }
    
    // Use constant-time comparison to prevent timing attacks
    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature),
      Buffer.from(cleanedHeader),
    );
  } catch (error) {
    console.warn('[WEBHOOK] Signature verification failed:', error instanceof Error ? error.message : 'Unknown error');
    return false;
  }
}
