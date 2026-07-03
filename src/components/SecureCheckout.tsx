import React, { useRef, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowRight, CheckCircle2, AlertCircle, ShieldCheck, Wallet, XCircle } from 'lucide-react';
import { TicketPackage, RegistrationData, PaymentData } from '../types';

interface SecureCheckoutProps {
  registrationData: RegistrationData;
  selectedPackage: TicketPackage;
  onSubmit: (data: PaymentData) => void;
}

type CheckoutOutcome = {
  status: 'completed' | 'failed' | 'pending';
  reference: string;
  message: string;
};

type PendingPaymentSubmission = PaymentData;

const MOBILE_MONEY_OPERATORS = [
  { value: 'mtn', label: 'MTN' },
  { value: 'airtel', label: 'Airtel' },
  { value: 'zamtel', label: 'Zamtel' },
] as const;

export default function SecureCheckout({ registrationData, selectedPackage, onSubmit }: SecureCheckoutProps) {
  const [isScriptLoaded, setIsScriptLoaded] = useState(false);
  const [isLaunchingWidget, setIsLaunchingWidget] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState(registrationData.phone || '');
  const [operator, setOperator] = useState<'mtn' | 'airtel' | 'zamtel'>('mtn');
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [checkoutOutcome, setCheckoutOutcome] = useState<CheckoutOutcome | null>(null);
  const [pendingSubmission, setPendingSubmission] = useState<PendingPaymentSubmission | null>(null);
  const submitLockRef = useRef(false);

  const basePriceTimesQty = selectedPackage.price * registrationData.quantity;
  const taxesFees = Math.round(basePriceTimesQty * 0.01);
  const grandTotal = basePriceTimesQty + taxesFees;
  const lencoPublicKey = import.meta.env.VITE_LENCO_PUBLIC_KEY || import.meta.env.VITE_LENCO_PUBLIC_KEY_DEV;
  const widgetScriptSrc = import.meta.env.MODE === 'production'
    ? 'https://pay.lenco.co/js/v1/inline.js'
    : 'https://pay.sandbox.lenco.co/js/v1/inline.js';

  React.useEffect(() => {
    const existingScript = document.querySelector(`script[src="${widgetScriptSrc}"]`);
    if (existingScript) {
      setIsScriptLoaded(true);
      return;
    }

    const script = document.createElement('script');
    script.src = widgetScriptSrc;
    script.async = true;
    script.onload = () => setIsScriptLoaded(true);
    script.onerror = () => setCheckoutError('Unable to load the Lenco payment widget.');
    document.body.appendChild(script);

    return () => {
      script.onload = null;
      script.onerror = null;
    };
  }, [widgetScriptSrc]);

  const handleCheckoutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (submitLockRef.current) {
      return;
    }

    const normalizedPhoneNumber = phoneNumber.replace(/[^0-9+]/g, '').trim();
    if (!/^\+?[0-9]{9,15}$/.test(normalizedPhoneNumber)) {
      setCheckoutError('Enter the mobile money phone number for this payment.');
      return;
    }

    if (!lencoPublicKey) {
      setCheckoutError('Missing Lenco public key for the payment widget.');
      return;
    }

    submitLockRef.current = true;
    setIsProcessingPayment(true);
    setIsLaunchingWidget(true);
    setCheckoutError(null);

    try {
      const launchResponse = await fetch('/api/pay', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: grandTotal,
          currency: 'ZMW',
          description: `${selectedPackage.name} x${registrationData.quantity}`,
          customerEmail: registrationData.email,
          customerName: registrationData.fullName,
          phoneNumber: normalizedPhoneNumber,
          operator,
          metadata: {
            quantity: registrationData.quantity,
            ticketType: registrationData.ticketType,
            paymentMethod: 'mobilemoney',
          },
        }),
      });

      const launchPayload = await launchResponse.json().catch(() => null);
      if (!launchResponse.ok || !launchPayload?.reference) {
        setCheckoutError(launchPayload?.message || 'Payment could not be started. Please retry.');
        return;
      }

      const reference = String(launchPayload.reference);
      const lenco = (window as Window & { LencoPay?: { getPaid: (args: Record<string, unknown>) => void } }).LencoPay;
      if (!lenco) {
        setCheckoutError('The Lenco payment widget is not available.');
        return;
      }

      const [firstName, ...restNames] = registrationData.fullName.trim().split(/\s+/);
      const lastName = restNames.join(' ').trim() || 'Guest';

      lenco.getPaid({
        key: lencoPublicKey,
        reference,
        email: registrationData.email,
        amount: grandTotal,
        currency: 'ZMW',
        label: 'Katina Basil Checkout',
        channels: ['mobile-money'],
        customer: {
          firstName: firstName || 'Guest',
          lastName,
          phone: normalizedPhoneNumber,
        },
        onSuccess: async (response: { reference?: string }) => {
          const verifiedReference = response.reference || reference;
          const verifyResponse = await fetch(`/api/payments/${encodeURIComponent(verifiedReference)}/lenco-status`, {
            credentials: 'include',
          });
          const verifyPayload = await verifyResponse.json().catch(() => null);
          const verifyStatus = String(verifyPayload?.status || '').toUpperCase();
          const normalizedStatus = verifyStatus === 'PAID' || verifyStatus === 'SUCCESSFUL' || verifyStatus === 'SUCCESS'
            ? 'completed'
            : verifyStatus === 'FAILED'
              ? 'failed'
              : 'pending';

          const submission: PaymentData = {
            method: 'mobilemoney',
            reference: verifiedReference,
            status: normalizedStatus,
          };

          setPendingSubmission(submission);
          setCheckoutOutcome({
            status: normalizedStatus,
            reference: verifiedReference,
            message: normalizedStatus === 'completed'
              ? 'Payment complete. Your reservation has been secured.'
              : 'Payment is pending provider confirmation. Continue once the payment is confirmed.',
          });
        },
        onClose: () => {
          setCheckoutError('Payment window was closed before completion.');
        },
        onConfirmationPending: () => {
          setCheckoutOutcome({
            status: 'pending',
            reference,
            message: 'Payment is awaiting confirmation from Lenco.',
          });
        },
      });
    } catch {
      setCheckoutError('Unexpected checkout error. Please retry in a moment.');
    } finally {
      setIsProcessingPayment(false);
      setIsLaunchingWidget(false);
      submitLockRef.current = false;
    }
  };

  return (
    <div className="secure-checkout min-h-screen relative pt-32 pb-20 px-6 md:px-20 max-w-7xl mx-auto w-full bg-[#666E54] text-[color:var(--checkout-text)]">
      {checkoutOutcome && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center px-6">
          <div className="absolute inset-0 bg-black/65" onClick={() => { setCheckoutOutcome(null); setPendingSubmission(null); }} aria-hidden="true" />
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="relative w-full max-w-md border border-[color:var(--checkout-border)] bg-[color:var(--checkout-panel)] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.45)]"
            role="dialog"
            aria-modal="true"
            aria-label="Payment result"
          >
            <div className="flex items-start gap-3">
              {checkoutOutcome.status === 'completed' ? (
                <CheckCircle2 className="mt-0.5 h-5 w-5 text-[#dfe3b0]" />
              ) : checkoutOutcome.status === 'failed' ? (
                <XCircle className="mt-0.5 h-5 w-5 text-[#ffb6b6]" />
              ) : (
                <AlertCircle className="mt-0.5 h-5 w-5 text-[#F4F4F2]" />
              )}

              <div className="flex-1">
                <p className="font-label-caps text-[10px] uppercase tracking-[0.2em] text-[color:var(--checkout-text)]/70">
                  {checkoutOutcome.status === 'completed'
                    ? 'Transaction Approved'
                    : checkoutOutcome.status === 'failed'
                      ? 'Transaction Declined'
                      : 'Transaction Pending'}
                </p>
                <h3 className="mt-2 font-display text-2xl text-[color:var(--checkout-text)] font-bold">
                  {checkoutOutcome.status === 'completed'
                    ? 'Payment Confirmed'
                    : checkoutOutcome.status === 'failed'
                      ? 'Payment Failed'
                      : 'Payment In Review'}
                </h3>
                <p className="mt-3 text-sm text-[color:var(--checkout-text)]/85 font-sans leading-relaxed">
                  {checkoutOutcome.message}
                </p>
                <p className="mt-2 text-[10px] uppercase tracking-[0.2em] text-[color:var(--checkout-text)]/65 font-label-caps">
                  Reference: {checkoutOutcome.reference}
                </p>
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => { setCheckoutOutcome(null); setPendingSubmission(null); }}
                className="flex-1 border border-[color:var(--checkout-border)] py-3 text-[10px] font-label-caps tracking-[0.2em] text-[color:var(--checkout-text)]/85 hover:bg-[#F4F4F2]/10 transition-colors cursor-pointer"
              >
                {checkoutOutcome.status === 'failed' ? 'Try Again' : 'Close'}
              </button>

              {checkoutOutcome.status !== 'failed' && pendingSubmission && (
                <button
                  type="button"
                  onClick={() => {
                    const submission = pendingSubmission;
                    setCheckoutOutcome(null);
                    setPendingSubmission(null);
                    onSubmit(submission);
                  }}
                  className="flex-1 border border-[color:var(--checkout-submit-border)] bg-[color:var(--checkout-submit-bg)] py-3 text-[10px] font-label-caps tracking-[0.2em] text-[color:var(--checkout-submit-text)] hover:bg-[color:var(--checkout-submit-hover-bg)] hover:text-[color:var(--checkout-submit-hover-text)] transition-colors cursor-pointer"
                >
                  Continue
                </button>
              )}
            </div>
          </motion.div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-start mt-4">
        <div className="lg:col-span-5 order-2 lg:order-1 flex flex-col gap-8">
          <div className="bg-[color:var(--checkout-panel)] border border-[color:var(--checkout-border)] p-8 rounded-none shadow-[0_4px_30px_rgba(0,0,0,0.25)] text-[color:var(--checkout-summary-text)]">
            <h2 className="font-label-caps text-xs text-[color:var(--checkout-summary-text)]/70 mb-6 uppercase tracking-[0.25em] font-bold">
              Order Summary
            </h2>
            <div className="flex flex-col gap-4 border-t border-[color:var(--checkout-border)] pt-6">
              <div className="flex justify-between items-center text-xs sm:text-sm font-sans">
                <span className="text-[color:var(--checkout-summary-text)]/80 font-medium">
                  {selectedPackage.name} (x{registrationData.quantity})
                </span>
                <span className="text-[color:var(--checkout-summary-text)] font-bold">
                  K{basePriceTimesQty.toLocaleString()}.00
                </span>
              </div>
              <div className="flex justify-between items-center text-xs sm:text-sm font-sans">
                <span className="text-[color:var(--checkout-summary-text)]/80 font-medium">Taxes &amp; Fees (1%)</span>
                <span className="text-[color:var(--checkout-summary-text)] font-bold">
                  K{taxesFees.toLocaleString()}.00
                </span>
              </div>
            </div>
            <div className="flex justify-between items-end border-t border-[color:var(--checkout-border)] mt-8 pt-8">
              <span className="font-label-caps text-xs text-[color:var(--checkout-summary-text)]/70 uppercase tracking-widest font-bold">
                Total
              </span>
              <span className="font-headline-md text-3xl sm:text-4xl text-[color:var(--checkout-summary-text)] font-bold">
                K{grandTotal.toLocaleString()}.00
              </span>
            </div>
          </div>
        </div>

        <div className="lg:col-span-7 order-1 lg:order-2 flex flex-col gap-10">
          {isProcessingPayment && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="border border-[#F4F4F2]/25 bg-[#4E1413]/50 px-4 py-3 text-[#F4F4F2] font-sans"
            >
              <div className="flex items-center justify-between text-xs uppercase tracking-[0.2em] font-label-caps font-bold">
                <span>Processing Secure Payment</span>
                <span>Please wait</span>
              </div>
              <div className="mt-2 h-1 w-full overflow-hidden bg-[#F4F4F2]/15">
                <motion.div
                  className="h-full bg-[#F4F4F2]"
                  animate={{ x: ['-100%', '100%'] }}
                  transition={{ repeat: Infinity, duration: 1.2, ease: 'linear' }}
                />
              </div>
            </motion.div>
          )}

          {checkoutError && (
            <div className="border border-red-300/40 bg-red-900/30 px-4 py-3 text-red-100 text-sm font-sans">
              {checkoutError}
            </div>
          )}

          <div>
            <span className="font-label-caps text-[10px] text-[color:var(--checkout-text)]/80 tracking-[0.3em] uppercase block mb-2 font-bold">SECURE ENDPOINT</span>
            <h1 className="font-display text-4xl sm:text-5xl text-[color:var(--checkout-text)] mb-2 leading-none font-bold">
              Mobile Money Checkout
            </h1>
            <p className="font-body-md text-xs sm:text-sm text-[color:var(--checkout-text)]/85 leading-relaxed font-sans">
              Complete your payment using an approved mobile money wallet.
            </p>
          </div>

          <form onSubmit={handleCheckoutSubmit} className="flex flex-col gap-8 font-sans max-w-2xl">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="flex flex-col gap-3 border border-[color:var(--checkout-border)] p-4 bg-[#F4F4F2]/5">
                <span className="font-label-caps text-[10px] uppercase tracking-[0.2em]">Mobile Money Number</span>
                <input
                  type="tel"
                  value={phoneNumber}
                  onChange={(event) => setPhoneNumber(event.target.value)}
                  placeholder="0977 123 456"
                  className="bg-transparent border-0 border-b border-[color:var(--checkout-border)] px-0 py-2 text-[color:var(--checkout-text)] focus:outline-none focus:border-[color:var(--checkout-text)]"
                  required
                />
              </label>

              <label className="flex flex-col gap-3 border border-[color:var(--checkout-border)] p-4 bg-[#F4F4F2]/5">
                <span className="font-label-caps text-[10px] uppercase tracking-[0.2em]">Operator</span>
                <select
                  value={operator}
                  onChange={(event) => setOperator(event.target.value as 'mtn' | 'airtel' | 'zamtel')}
                  className="bg-transparent border-0 border-b border-[color:var(--checkout-border)] px-0 py-2 text-[color:var(--checkout-text)] focus:outline-none focus:border-[color:var(--checkout-text)]"
                >
                  {MOBILE_MONEY_OPERATORS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="bg-[#F4F4F2]/5 border border-[color:var(--checkout-border)] p-6 text-center rounded-none my-2 font-sans max-w-lg">
              <p className="text-sm text-[color:var(--checkout-text)] mb-3 leading-relaxed flex items-center justify-center gap-2">
                <Wallet className="w-4 h-4" />
                Mobile money payment only for now.
              </p>
              <p className="text-xs text-[color:var(--checkout-text)]/60">
                You will receive a direct collection request from Lenco after submission.
              </p>
              <p className="text-xs text-[color:var(--checkout-text)]/75 mt-2">
                Card and payment credentials are processed by Lenco and are not stored on our servers.
              </p>
            </div>

            <div className="pt-8">
              <button
                type="submit"
                disabled={isProcessingPayment || !isScriptLoaded}
                className="w-full bg-[color:var(--checkout-submit-bg)] hover:bg-[color:var(--checkout-submit-hover-bg)] hover:shadow-[0_0_20px_rgba(78,20,19,0.3)] border border-[color:var(--checkout-submit-border)] hover:border-black text-[color:var(--checkout-submit-text)] hover:text-[color:var(--checkout-submit-hover-text)] py-5 px-8 font-label-caps text-xs tracking-[0.2em] uppercase rounded-none transition-all duration-500 flex justify-center items-center gap-3 cursor-pointer group font-bold disabled:opacity-70 disabled:cursor-not-allowed"
              >
                <span>{isProcessingPayment ? 'Processing Payment...' : isLaunchingWidget ? 'Launching Widget...' : 'Authorize Payment'}</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-2 transition-transform duration-500 text-[color:var(--checkout-submit-text)] group-hover:text-[color:var(--checkout-submit-hover-text)] shrink-0" />
              </button>

              <div className="flex items-center justify-center gap-2 mt-6 text-[color:var(--checkout-text)]/60">
                <ShieldCheck className="w-4 h-4 text-[color:var(--checkout-text)]" />
                <span className="font-label-caps text-[10px] uppercase tracking-widest text-[color:var(--checkout-text)]/80">
                  Encrypted end-to-end transaction
                </span>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}