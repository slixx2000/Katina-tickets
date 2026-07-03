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

function stripPathFromUrl(url: string) {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return url;
  }
}

function resolveCheckoutPath() {
  const fromEnv = process.env.LENCO_CHECKOUT_PATH;
  if (fromEnv && fromEnv.trim().length > 0) {
    return fromEnv.startsWith('/') ? fromEnv : `/${fromEnv}`;
  }

  return '/v1/checkout/sessions';
}

function resolveCheckoutCandidates(baseUrl: string, checkoutPath: string) {
  const normalizedBase = normalizeUrl(baseUrl);
  const normalizedPath = checkoutPath.startsWith('/') ? checkoutPath : `/${checkoutPath}`;
  const originOnlyBase = normalizeUrl(stripPathFromUrl(normalizedBase));
  const candidates = new Set<string>();

  candidates.add(`${normalizedBase}${normalizedPath}`);

  // If the configured base includes an API path segment (for example /access/v2),
  // also try the host-origin + checkout path variant.
  if (originOnlyBase !== normalizedBase) {
    candidates.add(`${originOnlyBase}${normalizedPath}`);
  }

  // Some environments are configured with /access/v2 in LENCO_API_BASE_URL while
  // keeping /v1/... in LENCO_CHECKOUT_PATH. Try a path without /v1 as fallback.
  if (normalizedBase.includes('/access/v2') && normalizedPath.startsWith('/v1/')) {
    candidates.add(`${normalizedBase}${normalizedPath.replace('/v1/', '/')}`);

    // Also try host-origin variants for both /v1/... and /... paths.
    candidates.add(`${originOnlyBase}${normalizedPath}`);
    candidates.add(`${originOnlyBase}${normalizedPath.replace('/v1/', '/')}`);
  }

  if (normalizedPath === '/v1/checkout/sessions') {
    candidates.add(`${originOnlyBase}/checkout/sessions`);
    candidates.add(`${normalizedBase}/checkout/sessions`);
  }

  return Array.from(candidates);
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

function extractProviderErrorMessage(payload: Record<string, unknown>, statusCode: number) {
  const directMessageCandidates = [
    payload.message,
    payload.error,
    payload.detail,
    payload.error_description,
  ];

  for (const candidate of directMessageCandidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate;
    }
  }

  if (Array.isArray(payload.errors) && payload.errors.length > 0) {
    const firstError = payload.errors[0];
    if (typeof firstError === 'string' && firstError.trim().length > 0) {
      return firstError;
    }

    if (typeof firstError === 'object' && firstError !== null) {
      const errorRecord = firstError as Record<string, unknown>;
      const nested = errorRecord.message || errorRecord.error || errorRecord.detail;
      if (typeof nested === 'string' && nested.trim().length > 0) {
        return nested;
      }
    }
  }

  return `Lenco checkout session failed with status ${statusCode}.`;
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
  const endpointCandidates = resolveCheckoutCandidates(lencoBaseUrl(), resolveCheckoutPath());

  let lastErrorMessage = 'Unable to create checkout session with Lenco.';
  let lastErrorStatusCode: number | null = null;
  let lastAttemptedEndpoint: string | null = null;

  for (let index = 0; index < endpointCandidates.length; index += 1) {
    const endpoint = endpointCandidates[index];
    const isLastCandidate = index === endpointCandidates.length - 1;
    lastAttemptedEndpoint = endpoint;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${secretKey}`,
        'x-api-key': secretKey,
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
    if (response.ok) {
      return {
        providerReference: extractProviderReference(payload),
        checkoutUrl: extractCheckoutUrl(payload),
        status: typeof payload.status === 'string' ? payload.status : undefined,
      };
    }

    lastErrorStatusCode = response.status;
    lastErrorMessage = extractProviderErrorMessage(payload, response.status);

    // For endpoint/path mismatches, continue to fallback candidates.
    if (!isLastCandidate && (response.status === 404 || response.status === 405)) {
      continue;
    }

    if (isLastCandidate || response.status !== 404) {
      break;
    }
  }

  const diagnostics = [
    `endpoint=${lastAttemptedEndpoint ?? 'unknown'}`,
    `status=${lastErrorStatusCode ?? 'unknown'}`,
  ].join(' ');

  throw new Error(`${lastErrorMessage} (${diagnostics})`);
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
