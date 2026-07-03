import React, { useRef, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowRight, Lock, CreditCard, Wallet, Smartphone, ShieldCheck, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import { TicketPackage, RegistrationData, PaymentData } from '../types';
import { processLencoPayment } from '../lib/lenco';

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

export default function SecureCheckout({ registrationData, selectedPackage, onSubmit }: SecureCheckoutProps) {
  const [method, setMethod] = useState<'card' | 'applepay' | 'mobilemoney'>('card');
  const [cardNumber, setCardNumber] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [securityCode, setSecurityCode] = useState('');
  const [cardholderName, setCardholderName] = useState('');
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [checkoutOutcome, setCheckoutOutcome] = useState<CheckoutOutcome | null>(null);
  const [pendingSubmission, setPendingSubmission] = useState<PendingPaymentSubmission | null>(null);
  const submitLockRef = useRef(false);

  // Floating label active states
  const [activeInput, setActiveInput] = useState<string | null>(null);

  const summaryImage = "https://lh3.googleusercontent.com/aida-public/AB6AXuCcE9FAo1MJoh4XwfSz8KA49uwsJr9_4R6fzRpOx57j02tFKBEwA0fB-ot5u--K3PcJmawS26p-hjZaTbVGxlzi774LZvmvHKDEeXFrt-A0ajj2aYDyJA-cp7-S0URf8lERPhzu6tlJGGeJuiZHBWrSveeDU5dl9eBs8O4N-jCsmUdHNXVWDXi5Qx7czz55ctFjXiZuVOHO9i9uxxHu7GVUI4ti5KjMimaXM8IhlIZ79RsnokVTcdTVCYRDIY0_IZImXcfjruv45L71";

  // Calculations
  const basePriceTimesQty = selectedPackage.price * registrationData.quantity;
  const taxesFees = Math.round(basePriceTimesQty * 0.01); // 1%
  const grandTotal = basePriceTimesQty + taxesFees;

  const handleCheckoutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (submitLockRef.current) {
      return;
    }

    submitLockRef.current = true;
    setIsProcessingPayment(true);
    setCheckoutError(null);

    try {
      const result = await processLencoPayment({
        amount: grandTotal,
        currency: 'ZMW',
        description: `${selectedPackage.name} x${registrationData.quantity}`,
        customerEmail: registrationData.email,
        customerName: registrationData.fullName,
        metadata: {
          quantity: registrationData.quantity,
          ticketType: registrationData.ticketType,
          paymentMethod: method,
        },
      });

      if (!result.success) {
        if (result.statusCode === 401) {
          setCheckoutError('You must sign in before purchasing tickets. Please return and authenticate.');
        } else if (result.statusCode === 429) {
          setCheckoutError('Too many payment attempts were made. Please wait a minute and try again.');
        } else if (result.statusCode === 503) {
          setCheckoutError('Payments are temporarily unavailable. Please try again shortly.');
        } else {
          setCheckoutError(result.message || 'Payment could not be started. Please retry.');
        }
        return;
      }

      if (result.checkoutUrl) {
        window.open(result.checkoutUrl, '_blank', 'noopener,noreferrer');
      }

      const normalizedStatus =
        result.status && ['paid', 'completed', 'success', 'successful'].includes(result.status.toLowerCase())
          ? 'completed'
          : result.status && ['failed', 'declined', 'error'].includes(result.status.toLowerCase())
            ? 'failed'
            : 'pending';

      if (!result.reference) {
        setCheckoutError('Payment provider did not return a reference. Please retry.');
        return;
      }

      if (normalizedStatus === 'failed') {
        setPendingSubmission(null);
        setCheckoutOutcome({
          status: 'failed',
          reference: result.reference,
          message: 'Your transaction was declined. Please review your details or try another payment method.',
        });
        return;
      }

      setPendingSubmission({
        method,
        reference: result.reference,
        providerReference: result.providerReference,
        status: normalizedStatus,
      });

      if (normalizedStatus === 'completed') {
        setCheckoutOutcome({
          status: 'completed',
          reference: result.reference,
          message: 'Payment complete. Your reservation has been secured.',
        });
      } else {
        setCheckoutOutcome({
          status: 'pending',
          reference: result.reference,
          message: 'Payment is pending provider confirmation. You can track status on the next screen.',
        });
      }
    } catch {
      setCheckoutError('Unexpected checkout error. Please retry in a moment.');
    } finally {
      setIsProcessingPayment(false);
      submitLockRef.current = false;
    }
  };

  // Helper to format Card Number (XXXX XXXX XXXX XXXX)
  const handleCardNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value.replace(/\D/g, '');
    const formatted = rawValue.match(/.{1,4}/g)?.join(' ') || '';
    setCardNumber(formatted.slice(0, 19));
  };

  // Helper to format Expiry Date (MM/YY)
  const handleExpiryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value.replace(/\D/g, '');
    let formatted = rawValue;
    if (rawValue.length > 2) {
      formatted = `${rawValue.slice(0, 2)}/${rawValue.slice(2, 4)}`;
    }
    setExpiryDate(formatted.slice(0, 5));
  };

  // Helper to limit CVC (3-4 digits)
  const handleCvcChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value.replace(/\D/g, '');
    setSecurityCode(rawValue.slice(0, 4));
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
        
        {/* LEFT COLUMN: Order Summary Card (Maroon Page theme) */}
        <div className="lg:col-span-5 order-2 lg:order-1 flex flex-col gap-8">
          <div className="bg-[color:var(--checkout-panel)] border border-[color:var(--checkout-border)] p-8 rounded-none shadow-[0_4px_30px_rgba(0,0,0,0.25)] text-[color:var(--checkout-summary-text)]">
            <h2 className="font-label-caps text-xs text-[color:var(--checkout-summary-text)]/70 mb-6 uppercase tracking-[0.25em] font-bold">
              Order Summary
            </h2>

            {/* Event photo ticket with absolute hover zoom effects */}
            <div className="w-full h-64 mb-8 overflow-hidden rounded-none relative group bg-[#666E54]">
              <div className="absolute inset-0 bg-black/10 z-10" />
              <img
                alt="Katina Basil Showcase Event Ticket"
                src={summaryImage}
                className="w-full h-full object-cover transform scale-100 group-hover:scale-105 transition-transform duration-1000 ease-in-out"
                referrerPolicy="no-referrer"
              />
            </div>

            <h3 className="font-headline-sm text-2xl text-[color:var(--checkout-summary-text)] mb-2 leading-snug font-bold">
              Fashion Show
            </h3>
            <p className="font-body-md text-xs text-[color:var(--checkout-summary-text)]/85 mb-8 font-sans">
              Mulungushi Conference Centre, Lusaka • 30 October 2026, 6 PM - 9 PM
            </p>

            {/* Calculations lines list */}
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
                <span className="text-[color:var(--checkout-summary-text)]/80 font-medium">Package Benefits</span>
                <span className="text-[#4E1413] font-label-caps text-[10px] bg-[#F4F4F2] border border-[#F4F4F2] px-2 py-0.5 font-bold">
                  Included
                </span>
              </div>

              <div className="flex justify-between items-center text-xs sm:text-sm font-sans">
                <span className="text-[color:var(--checkout-summary-text)]/80 font-medium">Taxes &amp; Fees (1%)</span>
                <span className="text-[color:var(--checkout-summary-text)] font-bold">
                  K{taxesFees.toLocaleString()}.00
                </span>
              </div>
            </div>

            {/* Grand Total output with maroon coloring */}
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

        {/* RIGHT COLUMN: Interactive Payment Form */}
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
              Secure Checkout
            </h1>
            <p className="font-body-md text-xs sm:text-sm text-[color:var(--checkout-text)]/85 leading-relaxed font-sans">
              Complete your certified seat reservation coordinates for the upcoming Katina Basil showcase.
            </p>
          </div>

          {/* Payment Method Tabs */}
          <div className="flex flex-col gap-4 font-sans">
            <span className="font-label-caps text-[10px] text-[color:var(--checkout-text)]/75 uppercase tracking-widest leading-none font-bold">
              Payment Method
            </span>
            <div className="grid grid-cols-3 gap-4">
              
              {/* Method: Credit Card */}
              <button
                type="button"
                onClick={() => setMethod('card')}
                className={`relative flex flex-col items-center justify-center gap-2.5 py-4 border rounded-none transition-all duration-300 cursor-pointer ${
                  method === 'card'
                    ? 'border-[color:var(--checkout-text)] bg-[color:var(--checkout-text)]/10 text-[color:var(--checkout-text)]'
                    : 'border-[color:var(--checkout-border)] hover:border-[color:var(--checkout-text)]/50 bg-transparent text-[color:var(--checkout-text)]/70 hover:text-[color:var(--checkout-text)]'
                }`}
              >
                <CreditCard className={`w-5 h-5 ${method === 'card' ? 'text-[color:var(--checkout-text)]' : ''}`} />
                <span className={`font-label-caps text-[9px] tracking-widest ${method === 'card' ? 'text-[color:var(--checkout-text)] font-bold' : ''}`}>
                  Bank Card
                </span>
                
                {/* Active Dot Indicator */}
                {method === 'card' && (
                  <div className="absolute top-2.5 right-2.5 w-1.5 h-1.5 bg-[color:var(--checkout-text)] rounded-full shadow-[0_0_8px_rgba(255,255,255,0.8)]"></div>
                )}
              </button>

              {/* Method: Apple Pay */}
              <button
                type="button"
                onClick={() => setMethod('applepay')}
                className={`relative flex flex-col items-center justify-center gap-2.5 py-4 border rounded-none transition-all duration-300 cursor-pointer ${
                  method === 'applepay'
                    ? 'border-[color:var(--checkout-text)] bg-[color:var(--checkout-text)]/10 text-[color:var(--checkout-text)]'
                    : 'border-[color:var(--checkout-border)] hover:border-[color:var(--checkout-text)]/50 bg-transparent text-[color:var(--checkout-text)]/70 hover:text-[color:var(--checkout-text)]'
                }`}
              >
                <Wallet className={`w-5 h-5 ${method === 'applepay' ? 'text-[color:var(--checkout-text)]' : ''}`} />
                <span className={`font-label-caps text-[9px] tracking-widest ${method === 'applepay' ? 'text-[color:var(--checkout-text)] font-bold' : ''}`}>
                  Apple Pay
                </span>

                {method === 'applepay' && (
                  <div className="absolute top-2.5 right-2.5 w-1.5 h-1.5 bg-[color:var(--checkout-text)] rounded-full shadow-[0_0_8px_rgba(255,255,255,0.8)]"></div>
                )}
              </button>

              {/* Method: Mobile Money */}
              <button
                type="button"
                onClick={() => setMethod('mobilemoney')}
                className={`relative flex flex-col items-center justify-center gap-2.5 py-4 border rounded-none transition-all duration-300 cursor-pointer ${
                  method === 'mobilemoney'
                    ? 'border-[color:var(--checkout-text)] bg-[color:var(--checkout-text)]/10 text-[color:var(--checkout-text)]'
                    : 'border-[color:var(--checkout-border)] hover:border-[color:var(--checkout-text)]/50 bg-transparent text-[color:var(--checkout-text)]/70 hover:text-[color:var(--checkout-text)]'
                }`}
              >
                <Smartphone className={`w-5 h-5 ${method === 'mobilemoney' ? 'text-[color:var(--checkout-text)]' : ''}`} />
                <span className={`font-label-caps text-[9px] tracking-widest ${method === 'mobilemoney' ? 'text-[color:var(--checkout-text)] font-bold' : ''}`}>
                  Mobile Money
                </span>

                {method === 'mobilemoney' && (
                  <div className="absolute top-2.5 right-2.5 w-1.5 h-1.5 bg-[color:var(--checkout-text)] rounded-full shadow-[0_0_8px_rgba(255,255,255,0.8)]"></div>
                )}
              </button>

            </div>
          </div>

          {/* Minimalist Interactive Form */}
          <form onSubmit={handleCheckoutSubmit} className="flex flex-col gap-8 font-sans">
            
            {method === 'card' ? (
              <>
                {/* Input: Card Number */}
                <div className="relative group pt-4">
                  <input
                    id="cardNumber"
                    type="text"
                    required
                    value={cardNumber}
                    onChange={handleCardNumberChange}
                    onFocus={() => setActiveInput('cardNumber')}
                    onBlur={() => setActiveInput(null)}
                    placeholder="0000 0000 0000 0000"
                    className="peer w-full bg-transparent border-0 border-b-[0.5px] border-[color:var(--checkout-border)] px-0 py-2.5 text-[color:var(--checkout-text)] focus:outline-none focus:ring-0 focus:border-[color:var(--checkout-text)] transition-colors text-sm md:text-base font-mono tracking-widest"
                  />
                  <label
                    htmlFor="cardNumber"
                    className={`absolute left-0 transition-all duration-300 text-[10px] tracking-widest uppercase font-label-caps ${
                      activeInput === 'cardNumber' || cardNumber
                        ? '-top-3 text-[color:var(--checkout-text)]'
                        : 'top-5 text-[color:var(--checkout-text)]/60'
                    }`}
                  >
                    Card Number
                  </label>
                  <Lock className="absolute right-0 top-6 w-4 h-4 text-[color:var(--checkout-text)]/50 pointer-events-none" />
                </div>

                {/* Expiry and CVC Grid */}
                <div className="grid grid-cols-2 gap-8">
                  {/* Expiry Date input */}
                  <div className="relative group pt-4">
                    <input
                      id="expiry"
                      type="text"
                      required
                      value={expiryDate}
                      onChange={handleExpiryChange}
                      onFocus={() => setActiveInput('expiry')}
                      onBlur={() => setActiveInput(null)}
                      placeholder="MM/YY"
                      className="peer w-full bg-transparent border-0 border-b-[0.5px] border-[color:var(--checkout-border)] px-0 py-2.5 text-[color:var(--checkout-text)] focus:outline-none focus:ring-0 focus:border-[color:var(--checkout-text)] transition-colors text-sm md:text-base font-mono tracking-wide"
                    />
                    <label
                      htmlFor="expiry"
                      className={`absolute left-0 transition-all duration-300 text-[10px] tracking-widest uppercase font-label-caps ${
                        activeInput === 'expiry' || expiryDate
                          ? '-top-3 text-[color:var(--checkout-text)]'
                          : 'top-5 text-[color:var(--checkout-text)]/60'
                      }`}
                    >
                      Expiry Date
                    </label>
                  </div>

                  {/* CVC Code input */}
                  <div className="relative group pt-4">
                    <input
                      id="cvc"
                      type="text"
                      required
                      value={securityCode}
                      onChange={handleCvcChange}
                      onFocus={() => setActiveInput('cvc')}
                      onBlur={() => setActiveInput(null)}
                      placeholder="CVC"
                      className="peer/cvc w-full bg-transparent border-0 border-b-[0.5px] border-[color:var(--checkout-border)] px-0 py-2.5 text-[color:var(--checkout-text)] focus:outline-none focus:ring-0 focus:border-[color:var(--checkout-text)] transition-colors text-sm md:text-base font-mono tracking-wide"
                    />
                    <label
                      htmlFor="cvc"
                      className={`absolute left-0 transition-all duration-300 text-[10px] tracking-widest uppercase font-label-caps ${
                        activeInput === 'cvc' || securityCode
                          ? '-top-3 text-[color:var(--checkout-text)]'
                          : 'top-5 text-[color:var(--checkout-text)]/60'
                      }`}
                    >
                      Security Code
                    </label>
                  </div>
                </div>

                {/* Cardholder Name input */}
                <div className="relative group pt-4">
                  <input
                    id="cardHolder"
                    type="text"
                    required
                    value={cardholderName}
                    onChange={(e) => setCardholderName(e.target.value)}
                    onFocus={() => setActiveInput('cardHolder')}
                    onBlur={() => setActiveInput(null)}
                    placeholder="Name exactly as printed on card"
                    className="peer w-full bg-transparent border-0 border-b-[0.5px] border-[color:var(--checkout-border)] px-0 py-2.5 text-[color:var(--checkout-text)] focus:outline-none focus:ring-0 focus:border-[color:var(--checkout-text)] transition-colors text-sm md:text-base"
                  />
                  <label
                    htmlFor="cardHolder"
                    className={`absolute left-0 transition-all duration-300 text-[10px] tracking-widest uppercase font-label-caps ${
                      activeInput === 'cardHolder' || cardholderName
                        ? '-top-3 text-[color:var(--checkout-text)]'
                        : 'top-5 text-[color:var(--checkout-text)]/60'
                    }`}
                  >
                    Cardholder Name
                  </label>
                </div>
              </>
            ) : (
              <div className="bg-[#F4F4F2]/5 border border-[color:var(--checkout-border)] p-6 text-center rounded-none my-4 font-sans max-w-lg">
                <p className="text-sm text-[color:var(--checkout-text)] mb-3 leading-relaxed">
                  You are checking out using <strong>{method === 'applepay' ? 'Apple Pay' : 'Mobile Money'}</strong>.
                </p>
                <p className="text-xs text-[color:var(--checkout-text)]/60">
                  Transactions are authorized using secure device hardware biometric chips.
                </p>
              </div>
            )}

            {/* Authorize Payment Action button */}
            <div className="pt-8">
              <button
                type="submit"
                disabled={isProcessingPayment}
                className="w-full bg-[color:var(--checkout-submit-bg)] hover:bg-[color:var(--checkout-submit-hover-bg)] hover:shadow-[0_0_20px_rgba(78,20,19,0.3)] border border-[color:var(--checkout-submit-border)] hover:border-black text-[color:var(--checkout-submit-text)] hover:text-[color:var(--checkout-submit-hover-text)] py-5 px-8 font-label-caps text-xs tracking-[0.2em] uppercase rounded-none transition-all duration-500 flex justify-center items-center gap-3 cursor-pointer group font-bold disabled:opacity-70 disabled:cursor-not-allowed"
              >
                <span>{isProcessingPayment ? 'Processing Payment...' : 'Authorize Payment'}</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-2 transition-transform duration-500 text-[color:var(--checkout-submit-text)] group-hover:text-[color:var(--checkout-submit-hover-text)] shrink-0" />
              </button>

              {/* End-to-end security tag */}
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
