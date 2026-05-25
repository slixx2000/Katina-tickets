import crypto from 'crypto';
import 'dotenv/config';
import express, {type Request, type Response} from 'express';

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

const app = express();
const port = Number(process.env.PORT || 8787);

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

app.get('/api/health', (_request: Request, response: Response) => {
  response.json({ok: true, service: 'katina-tickets-api'});
});

app.post('/api/pay', (request: Request<unknown, unknown, LencoPaymentRequest>, response: Response) => {
  const {amount, currency, description, customerEmail, customerName, metadata} = request.body;

  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
    response.status(400).json({success: false, message: 'A valid amount is required.'});
    return;
  }

  if (!isNonEmptyString(currency) || !isNonEmptyString(description)) {
    response.status(400).json({success: false, message: 'Currency and description are required.'});
    return;
  }

  const reference = `LENCO-${crypto.randomUUID()}`;
  const payload = {
    amount,
    currency: currency.trim().toUpperCase(),
    description: description.trim(),
    customerEmail: isNonEmptyString(customerEmail) ? customerEmail.trim() : undefined,
    customerName: isNonEmptyString(customerName) ? customerName.trim() : undefined,
    metadata: metadata && typeof metadata === 'object' ? metadata : undefined,
    reference,
  };

  response.json({
    success: true,
    message: 'Payment session created.',
    reference,
    checkoutUrl: undefined,
    payment: payload,
  });
});

app.post(
  '/api/webhook',
  (request: Request, response: Response) => {
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

    response.json({success: true, received: true, event});
  },
);

app.listen(port, () => {
  console.log(`Katina Tickets API listening on http://127.0.0.1:${port}`);
});