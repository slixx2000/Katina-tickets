export interface LencoPaymentRequest {
  amount: number;
  currency: string;
  description: string;
  customerEmail?: string;
  customerName?: string;
  phoneNumber: string;
  operator: 'mtn' | 'airtel' | 'zamtel';
  metadata?: Record<string, string | number | boolean>;
}

export interface LencoPaymentResponse {
  success: boolean;
  statusCode?: number;
  message?: string;
  reference?: string;
  id?: string;
  lencoReference?: string;
  status?: string;
}

function logFrontendEvent(step: string, data: Record<string, unknown> = {}) {
  const payload = {
    timestamp: new Date().toISOString(),
    level: 'info',
    event: `FRONTEND ${step}`,
    service: 'katina-tickets-client',
    ...data,
  };

  console.log(JSON.stringify(payload));
}

export async function processLencoPayment(payload: LencoPaymentRequest): Promise<LencoPaymentResponse> {
  const paymentReference = `LENCO-${Math.random().toString(36).slice(2)}`;
  logFrontendEvent('payment.session.request.started', {
    paymentReference,
    amount: payload.amount,
    currency: payload.currency,
    description: payload.description,
    metadata: payload.metadata,
  });

  try {
    const response = await fetch('/api/pay', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      const data = await response.json();
      logFrontendEvent('payment.session.request.succeeded', {
        paymentReference: data.reference || paymentReference,
        statusCode: response.status,
        responseBody: data,
      });
      return {
        success: true,
        statusCode: response.status,
        message: data.message,
        reference: data.reference,
        id: data.id,
        lencoReference: data.lencoReference,
        status: data.status,
      };
    }

    if (response.status === 404) {
      logFrontendEvent('payment.session.request.failed', {
        paymentReference,
        statusCode: response.status,
        reason: 'route_not_deployed',
      });
      return {
        success: false,
        statusCode: response.status,
        message: 'Payment API route is not deployed. Please contact support to complete the server deployment.',
      };
    }

    const errorBody = await response.json().catch(() => null);
    if (errorBody?.message) {
      logFrontendEvent('payment.session.request.failed', {
        paymentReference,
        statusCode: response.status,
        reason: errorBody.message,
      });
      return { success: false, statusCode: response.status, message: errorBody.message };
    }

    const fallbackText = await response.text().catch(() => '');
    if (fallbackText && fallbackText.trim().length > 0) {
      logFrontendEvent('payment.session.request.failed', {
        paymentReference,
        statusCode: response.status,
        reason: fallbackText.trim(),
      });
      return { success: false, statusCode: response.status, message: fallbackText.trim() };
    }
  } catch (error) {
    logFrontendEvent('payment.session.request.error', {
      paymentReference,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return { success: false, message: 'Unable to reach payment service. Please retry shortly.' };
  }

  logFrontendEvent('payment.session.request.failed', {
    paymentReference,
    reason: 'unknown_error',
  });
  return { success: false, message: 'Payment collection could not be created.' };
}