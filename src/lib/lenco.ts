export interface LencoPaymentRequest {
  amount: number;
  currency: string;
  description: string;
  customerEmail?: string;
  customerName?: string;
  metadata?: Record<string, string | number | boolean>;
}

export interface LencoPaymentResponse {
  success: boolean;
  statusCode?: number;
  message?: string;
  reference?: string;
  checkoutUrl?: string;
  providerReference?: string;
  status?: string;
}

export async function processLencoPayment(payload: LencoPaymentRequest): Promise<LencoPaymentResponse> {
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
      return {
        success: true,
        statusCode: response.status,
        message: data.message,
        reference: data.reference,
        checkoutUrl: data.checkoutUrl,
        providerReference: data.providerReference,
        status: data.status,
      };
    }

    const errorBody = await response.json().catch(() => null);
    if (errorBody?.message) {
      return { success: false, statusCode: response.status, message: errorBody.message };
    }
  } catch {
    return { success: false, message: 'Unable to reach payment service. Please retry shortly.' };
  }

  return { success: false, message: 'Payment session could not be created.' };
}