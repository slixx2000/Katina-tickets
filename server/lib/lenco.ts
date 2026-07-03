import crypto from 'crypto';

type LencoCollectionStatus = 'PENDING' | 'PROCESSING' | 'PAID' | 'FAILED' | 'CANCELLED' | 'REFUNDED';

type LencoResponseEnvelope<T> = {
  success?: boolean;
  message?: string;
  data?: T;
  result?: T;
  collection?: T;
  status?: string;
};

export type LencoMobileMoneyOperator = 'mtn' | 'airtel' | 'zamtel';

export type LencoMobileMoneyCollection = {
  id?: string;
  reference?: string;
  lencoReference?: string;
  status?: string;
  amount?: number;
  currency?: string;
  phoneNumber?: string;
  operator?: string;
};

export type LencoMobileMoneyCollectionRequest = {
  amount: number;
  currency: string;
  description: string;
  customerEmail?: string;
  customerName?: string;
  phoneNumber: string;
  operator: LencoMobileMoneyOperator;
  reference: string;
  metadata?: Record<string, unknown>;
};

export type LencoCollectionStatusResponse = {
  success: boolean;
  message?: string;
  id?: string;
  reference?: string;
  lencoReference?: string;
  status?: LencoCollectionStatus;
};

function getLencoApiBaseUrl() {
  const configuredBaseUrl = process.env.LENCO_API_BASE_URL?.trim();
  if (configuredBaseUrl) {
    return configuredBaseUrl.replace(/\/$/, '');
  }

  const env = (process.env.LENCO_ENV || '').trim().toLowerCase();
  if (env === 'sandbox' || env === 'test') {
    return 'https://sandbox.lenco.co/access/v2';
  }

  return 'https://api.lenco.co/access/v2';
}

function getLencoSecretKey() {
  return process.env.LENCO_SECRET_KEY?.trim() || null;
}

function hasLencoCredentials() {
  return Boolean(getLencoApiBaseUrl() && getLencoSecretKey());
}

function buildLencoHeaders() {
  const secretKey = getLencoSecretKey();
  if (!secretKey) {
    throw new Error('LENCO_SECRET_KEY is required to call Lenco.');
  }

  return {
    Authorization: `Bearer ${secretKey}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

function readEnvelope<T>(payload: unknown): LencoResponseEnvelope<T> {
  if (typeof payload !== 'object' || payload === null) {
    return {};
  }

  return payload as LencoResponseEnvelope<T>;
}

function extractCollection<T>(payload: unknown): T | null {
  const envelope = readEnvelope<T>(payload);
  return envelope.data ?? envelope.result ?? envelope.collection ?? (typeof payload === 'object' && payload !== null ? (payload as T) : null);
}

function normalizeStatus(value: unknown): LencoCollectionStatus {
  const normalized = typeof value === 'string' ? value.trim().toUpperCase() : '';

  if (normalized === 'SUCCESS') {
    return 'PAID';
  }

  if (normalized === 'PENDING' || normalized === 'PROCESSING' || normalized === 'PAID' || normalized === 'FAILED' || normalized === 'CANCELLED' || normalized === 'REFUNDED') {
    return normalized;
  }

  return 'PENDING';
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

async function postLencoJson<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${getLencoApiBaseUrl()}${path}`, {
    method: 'POST',
    headers: buildLencoHeaders(),
    body: JSON.stringify(body),
  });

  const payload = await parseJsonResponse(response);
  if (!response.ok) {
    const message = typeof payload === 'object' && payload !== null && 'message' in payload
      ? String((payload as { message?: unknown }).message ?? '')
      : '';
    throw new Error(message || `Lenco request failed with HTTP ${response.status}.`);
  }

  return extractCollection<T>(payload) as T;
}

async function getLencoJson<T>(path: string): Promise<T> {
  const secretKey = getLencoSecretKey();
  if (!secretKey) {
    throw new Error('LENCO_SECRET_KEY is required to call Lenco.');
  }

  const response = await fetch(`${getLencoApiBaseUrl()}${path}`, {
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
    throw new Error(message || `Lenco request failed with HTTP ${response.status}.`);
  }

  return extractCollection<T>(payload) as T;
}

export function canUseLencoGateway() {
  return hasLencoCredentials();
}

export async function createLencoMobileMoneyCollection(request: LencoMobileMoneyCollectionRequest) {
  const payload = await postLencoJson<LencoMobileMoneyCollection>('/collections/mobile-money', {
    amount: Math.round(request.amount),
    currency: request.currency,
    description: request.description,
    customerEmail: request.customerEmail,
    customerName: request.customerName,
    phoneNumber: request.phoneNumber,
    operator: request.operator,
    reference: request.reference,
    metadata: request.metadata,
  });

  return {
    id: payload.id ?? payload.reference ?? request.reference,
    reference: payload.reference ?? request.reference,
    lencoReference: payload.lencoReference ?? payload.id ?? request.reference,
    status: normalizeLencoPaymentStatus(payload.status),
  };
}

export async function createLencoCardCollection(): Promise<never> {
  throw new Error('Card collections are not enabled in this build.');
}

export async function submitLencoMobileMoneyOtp(): Promise<never> {
  throw new Error('Mobile money OTP submission is not enabled in this build.');
}

export async function getLencoCollectionStatus(reference: string): Promise<LencoCollectionStatusResponse> {
  const payload = await getLencoJson<LencoMobileMoneyCollection>(`/collections/status/${encodeURIComponent(reference)}`);
  return {
    success: true,
    reference: payload.reference ?? reference,
    id: payload.id,
    lencoReference: payload.lencoReference ?? payload.id,
    status: normalizeLencoPaymentStatus(payload.status),
  };
}

export function normalizeLencoPaymentStatus(value: unknown): LencoCollectionStatus {
  return normalizeStatus(value);
}

export function parseLencoWebhookEvent(event: unknown) {
  const payload = typeof event === 'object' && event !== null ? event as Record<string, unknown> : null;
  if (!payload) {
    return null;
  }

  const reference = typeof payload.reference === 'string'
    ? payload.reference
    : typeof payload.data === 'object' && payload.data !== null && typeof (payload.data as Record<string, unknown>).reference === 'string'
      ? String((payload.data as Record<string, unknown>).reference)
      : null;

  const providerPaymentId = typeof payload.id === 'string'
    ? payload.id
    : typeof payload.data === 'object' && payload.data !== null && typeof (payload.data as Record<string, unknown>).id === 'string'
      ? String((payload.data as Record<string, unknown>).id)
      : undefined;

  const status = normalizeLencoPaymentStatus(
    typeof payload.status === 'string'
      ? payload.status
      : typeof payload.data === 'object' && payload.data !== null
        ? (payload.data as Record<string, unknown>).status
        : undefined,
  );

  const eventId = typeof payload.eventId === 'string'
    ? payload.eventId
    : typeof payload.data === 'object' && payload.data !== null && typeof (payload.data as Record<string, unknown>).eventId === 'string'
      ? String((payload.data as Record<string, unknown>).eventId)
      : crypto.createHash('sha1').update(JSON.stringify(payload)).digest('hex');

  if (!reference) {
    return null;
  }

  return {
    providerEventId: eventId,
    reference,
    providerPaymentId,
    status,
    event: typeof payload.event === 'string' ? payload.event : undefined,
  };
}