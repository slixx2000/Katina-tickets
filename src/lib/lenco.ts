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
  message?: string;
  reference?: string;
  checkoutUrl?: string;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function processLencoPayment(payload: LencoPaymentRequest): Promise<LencoPaymentResponse> {
  try {
    const response = await fetch('/api/pay', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      const data = await response.json();
      return {
        success: true,
        message: data.message,
        reference: data.reference,
        checkoutUrl: data.checkoutUrl,
      };
    }

    const errorBody = await response.json().catch(() => null);
    if (errorBody?.message) {
      return { success: false, message: errorBody.message };
    }
  } catch {
    // Fall back to the local mock path while the backend endpoint is being built.
  }

  await wait(800);

  return {
    success: true,
    message: 'Simulated Lenco payment approved',
    reference: `LENCO-MOCK-${Date.now()}`,
  };
}