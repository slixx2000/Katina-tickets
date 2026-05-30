type LencoCreateCheckoutInput = {
  amount: number;
  currency: string;
  description: string;
  customerEmail?: string;
  customerName?: string;
  metadata?: Record<string, unknown>;
  reference: string;
};

export type LencoCheckoutResponse = {
  providerReference?: string;
  checkoutUrl?: string;
  status?: string;
};

function lencoBaseUrl() {
  const explicit = process.env.LENCO_API_BASE_URL;
  if (explicit && explicit.trim().length > 0) {
    return explicit.trim();
  }

  const env = process.env.LENCO_ENV?.toLowerCase();
  if (env === 'production' || env === 'prod' || env === 'live') {
    return 'https://api.lenco.co';
  }

  return 'https://api.sandbox.lenco.co';
}

function lencoSecretKey() {
  const key = process.env.LENCO_SECRET_KEY;
  return typeof key === 'string' && key.length > 0 ? key : null;
}

function normalizeUrl(url: string) {
  return url.replace(/\/+$/, '');
}

function resolveCheckoutPath() {
  const fromEnv = process.env.LENCO_CHECKOUT_PATH;
  if (fromEnv && fromEnv.trim().length > 0) {
    return fromEnv.startsWith('/') ? fromEnv : `/${fromEnv}`;
  }

  return '/v1/checkout/sessions';
}

function extractCheckoutUrl(payload: Record<string, unknown>): string | undefined {
  const candidates = [
    payload.checkoutUrl,
    payload.checkout_url,
    payload.paymentUrl,
    payload.payment_url,
    payload.url,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate;
    }
  }

  return undefined;
}

function extractProviderReference(payload: Record<string, unknown>): string | undefined {
  const candidates = [
    payload.reference,
    payload.providerReference,
    payload.provider_reference,
    payload.transactionReference,
    payload.transaction_reference,
    payload.id,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate;
    }
  }

  return undefined;
}

export function canUseLencoGateway() {
  return Boolean(lencoSecretKey());
}

export async function createLencoCheckoutSession(input: LencoCreateCheckoutInput): Promise<LencoCheckoutResponse> {
  const secretKey = lencoSecretKey();
  if (!secretKey) {
    throw new Error('Lenco is not configured. Set LENCO_SECRET_KEY before creating payments.');
  }

  const appUrl = process.env.APP_URL ?? process.env.APP_ORIGIN;
  const callbackUrl = appUrl ? `${normalizeUrl(appUrl)}/payment/callback` : undefined;

  const response = await fetch(`${normalizeUrl(lencoBaseUrl())}${resolveCheckoutPath()}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${secretKey}`,
      Accept: 'application/json',
    },
    body: JSON.stringify({
      amount: input.amount,
      currency: input.currency,
      description: input.description,
      reference: input.reference,
      customer: {
        email: input.customerEmail,
        name: input.customerName,
      },
      metadata: input.metadata,
      callbackUrl,
    }),
  });

  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const message = typeof payload.message === 'string'
      ? payload.message
      : `Lenco checkout session failed with status ${response.status}.`;
    throw new Error(message);
  }

  return {
    providerReference: extractProviderReference(payload),
    checkoutUrl: extractCheckoutUrl(payload),
    status: typeof payload.status === 'string' ? payload.status : undefined,
  };
}

export type NormalizedPaymentStatus = 'PENDING' | 'PAID' | 'FAILED' | 'CANCELLED' | 'REFUNDED';

export function normalizePaymentStatus(rawStatus: string | undefined | null): NormalizedPaymentStatus {
  const status = String(rawStatus ?? '').trim().toLowerCase();

  if (['paid', 'completed', 'success', 'successful', 'captured'].includes(status)) {
    return 'PAID';
  }

  if (['failed', 'declined', 'error'].includes(status)) {
    return 'FAILED';
  }

  if (['cancelled', 'canceled', 'voided'].includes(status)) {
    return 'CANCELLED';
  }

  if (['refunded', 'refund'].includes(status)) {
    return 'REFUNDED';
  }

  return 'PENDING';
}

export type ParsedWebhookEvent = {
  providerEventId: string;
  reference: string;
  providerPaymentId?: string;
  status: NormalizedPaymentStatus;
  rawStatus?: string;
};

function valueAsString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

export function parseLencoWebhookEvent(payload: unknown): ParsedWebhookEvent | null {
  const root = asRecord(payload);
  const data = asRecord(root.data);

  const providerEventId =
    valueAsString(root.eventId) ||
    valueAsString(root.event_id) ||
    valueAsString(root.id) ||
    valueAsString(data.eventId) ||
    valueAsString(data.event_id) ||
    valueAsString(data.id);

  const reference =
    valueAsString(root.reference) ||
    valueAsString(root.tx_ref) ||
    valueAsString(data.reference) ||
    valueAsString(data.tx_ref);

  const rawStatus =
    valueAsString(root.status) ||
    valueAsString(root.event) ||
    valueAsString(data.status) ||
    valueAsString(data.event);

  if (!providerEventId || !reference) {
    return null;
  }

  const providerPaymentId =
    valueAsString(root.paymentId) ||
    valueAsString(root.payment_id) ||
    valueAsString(data.paymentId) ||
    valueAsString(data.payment_id);

  return {
    providerEventId,
    reference,
    providerPaymentId,
    status: normalizePaymentStatus(rawStatus),
    rawStatus,
  };
}
