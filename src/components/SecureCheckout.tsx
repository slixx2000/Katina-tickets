import React, { useState } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, ArrowRight, Lock, CreditCard, Wallet, Smartphone, ShieldCheck } from 'lucide-react';
import { TicketPackage, RegistrationData, PaymentData } from '../types';
import { processLencoPayment } from '../lib/lenco';

interface SecureCheckoutProps {
  registrationData: RegistrationData;
  selectedPackage: TicketPackage;
  onBack: () => void;
  onSubmit: (data: PaymentData) => void;
}

export default function SecureCheckout({ registrationData, selectedPackage, onBack, onSubmit }: SecureCheckoutProps) {
  const [method, setMethod] = useState<'card' | 'applepay' | 'mobilemoney'>('card');
  const [cardNumber, setCardNumber] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [securityCode, setSecurityCode] = useState('');
  const [cardholderName, setCardholderName] = useState('');
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);

  // Floating label active states
  const [activeInput, setActiveInput] = useState<string | null>(null);

  const summaryImage = "https://lh3.googleusercontent.com/aida-public/AB6AXuCcE9FAo1MJoh4XwfSz8KA49uwsJr9_4R6fzRpOx57j02tFKBEwA0fB-ot5u--K3PcJmawS26p-hjZaTbVGxlzi774LZvmvHKDEeXFrt-A0ajj2aYDyJA-cp7-S0URf8lERPhzu6tlJGGeJuiZHBWrSveeDU5dl9eBs8O4N-jCsmUdHNXVWDXi5Qx7czz55ctFjXiZuVOHO9i9uxxHu7GVUI4ti5KjMimaXM8IhlIZ79RsnokVTcdTVCYRDIY0_IZImXcfjruv45L71";

  // Calculations
  const basePriceTimesQty = selectedPackage.price * registrationData.quantity;
  const taxesFees = Math.round(basePriceTimesQty * 0.2); // 20%
  const grandTotal = basePriceTimesQty + taxesFees;

  const handleCheckoutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessingPayment(true);

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
        alert(result.message || 'Payment failed');
        return;
      }

      onSubmit({
        cardNumber: method === 'card' ? cardNumber : 'Simulated Checkout',
        expiryDate: method === 'card' ? expiryDate : '01/30',
        securityCode: method === 'card' ? securityCode : '123',
        cardholderName: method === 'card' ? cardholderName : registrationData.fullName,
        method
      });
    } finally {
      setIsProcessingPayment(false);
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
    <div className="min-h-screen relative pt-32 pb-20 px-6 md:px-20 max-w-7xl mx-auto w-full bg-[#666E54] text-[#F4F4F2]">
      {/* Absolute Back Route Action */}
      <div className="absolute top-8 left-6 md:left-12 z-50">
        <button
          onClick={onBack}
          className="group flex items-center gap-2 text-[#F4F4F2] hover:text-[#F4F4F2]/80 transition-colors cursor-pointer py-1"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          <span className="font-label-caps text-xs">Return</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-start mt-4">
        
        {/* LEFT COLUMN: Order Summary Card (Maroon Page theme) */}
        <div className="lg:col-span-5 order-2 lg:order-1 flex flex-col gap-8">
          <div className="bg-[#4E1413] border border-[#F4F4F2]/20 p-8 rounded-none shadow-[0_4px_30px_rgba(0,0,0,0.25)] text-[#F4F4F2]">
            <h2 className="font-label-caps text-xs text-[#F4F4F2]/70 mb-6 uppercase tracking-[0.25em] font-bold">
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

            <h3 className="font-headline-sm text-2xl text-[#F4F4F2] mb-2 leading-snug font-bold">
              Katina Basil Showcase
            </h3>
            <p className="font-body-md text-xs text-[#F4F4F2]/85 mb-8 font-sans">
              Ciela Resort, Lusaka • Private Allocations Access
            </p>

            {/* Calculations lines list */}
            <div className="flex flex-col gap-4 border-t border-[#F4F4F2]/25 pt-6">
              <div className="flex justify-between items-center text-xs sm:text-sm font-sans">
                <span className="text-[#F4F4F2]/80 font-medium">
                  {selectedPackage.name} (x{registrationData.quantity})
                </span>
                <span className="text-[#F4F4F2] font-bold">
                  K{basePriceTimesQty.toLocaleString()}.00
                </span>
              </div>

              <div className="flex justify-between items-center text-xs sm:text-sm font-sans">
                <span className="text-[#F4F4F2]/80 font-medium">Private Afterparty</span>
                <span className="text-[#4E1413] font-label-caps text-[10px] bg-[#F4F4F2] border border-[#F4F4F2] px-2 py-0.5 font-bold">
                  Included
                </span>
              </div>

              <div className="flex justify-between items-center text-xs sm:text-sm font-sans">
                <span className="text-[#F4F4F2]/80 font-medium">Taxes &amp; Fees (20%)</span>
                <span className="text-[#F4F4F2] font-bold">
                  K{taxesFees.toLocaleString()}.00
                </span>
              </div>
            </div>

            {/* Grand Total output with maroon coloring */}
            <div className="flex justify-between items-end border-t border-[#F4F4F2]/25 mt-8 pt-8">
              <span className="font-label-caps text-xs text-[#F4F4F2]/70 uppercase tracking-widest font-bold">
                Total
              </span>
              <span className="font-headline-md text-3xl sm:text-4xl text-[#F4F4F2] font-bold">
                K{grandTotal.toLocaleString()}.00
              </span>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Interactive Payment Form */}
        <div className="lg:col-span-7 order-1 lg:order-2 flex flex-col gap-10">
          <div>
            <span className="font-label-caps text-[10px] text-[#F4F4F2]/80 tracking-[0.3em] uppercase block mb-2 font-bold">SECURE ENDPOINT</span>
            <h1 className="font-display text-4xl sm:text-5xl text-[#F4F4F2] mb-2 leading-none font-bold">
              Secure Checkout
            </h1>
            <p className="font-body-md text-xs sm:text-sm text-[#F4F4F2]/85 leading-relaxed font-sans">
              Complete your certified seat reservation coordinates for the upcoming Katina Basil showcase.
            </p>
          </div>

          {/* Payment Method Tabs */}
          <div className="flex flex-col gap-4 font-sans">
            <span className="font-label-caps text-[10px] text-[#F4F4F2]/75 uppercase tracking-widest leading-none font-bold">
              Payment Method
            </span>
            <div className="grid grid-cols-3 gap-4">
              
              {/* Method: Credit Card */}
              <button
                type="button"
                onClick={() => setMethod('card')}
                className={`relative flex flex-col items-center justify-center gap-2.5 py-4 border rounded-none transition-all duration-300 cursor-pointer ${
                  method === 'card'
                    ? 'border-[#F4F4F2] bg-[#F4F4F2]/10 text-[#F4F4F2]'
                    : 'border-[#F4F4F2]/25 hover:border-[#F4F4F2]/50 bg-transparent text-[#F4F4F2]/70 hover:text-[#F4F4F2]'
                }`}
              >
                <CreditCard className={`w-5 h-5 ${method === 'card' ? 'text-[#F4F4F2]' : ''}`} />
                <span className={`font-label-caps text-[9px] tracking-widest ${method === 'card' ? 'text-[#F4F4F2] font-bold' : ''}`}>
                  Bank Card
                </span>
                
                {/* Active Dot Indicator */}
                {method === 'card' && (
                  <div className="absolute top-2.5 right-2.5 w-1.5 h-1.5 bg-[#F4F4F2] rounded-full shadow-[0_0_8px_rgba(255,255,255,0.8)]"></div>
                )}
              </button>

              {/* Method: Apple Pay */}
              <button
                type="button"
                onClick={() => setMethod('applepay')}
                className={`relative flex flex-col items-center justify-center gap-2.5 py-4 border rounded-none transition-all duration-300 cursor-pointer ${
                  method === 'applepay'
                    ? 'border-[#F4F4F2] bg-[#F4F4F2]/10 text-[#F4F4F2]'
                    : 'border-[#F4F4F2]/25 hover:border-[#F4F4F2]/50 bg-transparent text-[#F4F4F2]/70 hover:text-[#F4F4F2]'
                }`}
              >
                <Wallet className={`w-5 h-5 ${method === 'applepay' ? 'text-[#F4F4F2]' : ''}`} />
                <span className={`font-label-caps text-[9px] tracking-widest ${method === 'applepay' ? 'text-[#F4F4F2] font-bold' : ''}`}>
                  Apple Pay
                </span>

                {method === 'applepay' && (
                  <div className="absolute top-2.5 right-2.5 w-1.5 h-1.5 bg-[#F4F4F2] rounded-full shadow-[0_0_8px_rgba(255,255,255,0.8)]"></div>
                )}
              </button>

              {/* Method: Mobile Money */}
              <button
                type="button"
                onClick={() => setMethod('mobilemoney')}
                className={`relative flex flex-col items-center justify-center gap-2.5 py-4 border rounded-none transition-all duration-300 cursor-pointer ${
                  method === 'mobilemoney'
                    ? 'border-[#F4F4F2] bg-[#F4F4F2]/10 text-[#F4F4F2]'
                    : 'border-[#F4F4F2]/25 hover:border-[#F4F4F2]/50 bg-transparent text-[#F4F4F2]/70 hover:text-[#F4F4F2]'
                }`}
              >
                <Smartphone className={`w-5 h-5 ${method === 'mobilemoney' ? 'text-[#F4F4F2]' : ''}`} />
                <span className={`font-label-caps text-[9px] tracking-widest ${method === 'mobilemoney' ? 'text-[#F4F4F2] font-bold' : ''}`}>
                  Mobile Money
                </span>

                {method === 'mobilemoney' && (
                  <div className="absolute top-2.5 right-2.5 w-1.5 h-1.5 bg-[#F4F4F2] rounded-full shadow-[0_0_8px_rgba(255,255,255,0.8)]"></div>
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
                    className="peer w-full bg-transparent border-0 border-b-[0.5px] border-[#F4F4F2]/30 px-0 py-2.5 text-[#F4F4F2] focus:outline-none focus:ring-0 focus:border-[#F4F4F2] transition-colors text-sm md:text-base font-mono tracking-widest"
                  />
                  <label
                    htmlFor="cardNumber"
                    className={`absolute left-0 transition-all duration-300 text-[10px] tracking-widest uppercase font-label-caps ${
                      activeInput === 'cardNumber' || cardNumber
                        ? '-top-3 text-[#F4F4F2]'
                        : 'top-5 text-[#F4F4F2]/60'
                    }`}
                  >
                    Card Number
                  </label>
                  <Lock className="absolute right-0 top-6 w-4 h-4 text-[#F4F4F2]/50 pointer-events-none" />
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
                      className="peer w-full bg-transparent border-0 border-b-[0.5px] border-[#F4F4F2]/30 px-0 py-2.5 text-[#F4F4F2] focus:outline-none focus:ring-0 focus:border-[#F4F4F2] transition-colors text-sm md:text-base font-mono tracking-wide"
                    />
                    <label
                      htmlFor="expiry"
                      className={`absolute left-0 transition-all duration-300 text-[10px] tracking-widest uppercase font-label-caps ${
                        activeInput === 'expiry' || expiryDate
                          ? '-top-3 text-[#F4F4F2]'
                          : 'top-5 text-[#F4F4F2]/60'
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
                      className="peer/cvc w-full bg-transparent border-0 border-b-[0.5px] border-[#F4F4F2]/30 px-0 py-2.5 text-[#F4F4F2] focus:outline-none focus:ring-0 focus:border-[#F4F4F2] transition-colors text-sm md:text-base font-mono tracking-wide"
                    />
                    <label
                      htmlFor="cvc"
                      className={`absolute left-0 transition-all duration-300 text-[10px] tracking-widest uppercase font-label-caps ${
                        activeInput === 'cvc' || securityCode
                          ? '-top-3 text-[#F4F4F2]'
                          : 'top-5 text-[#F4F4F2]/60'
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
                    className="peer w-full bg-transparent border-0 border-b-[0.5px] border-[#F4F4F2]/30 px-0 py-2.5 text-[#F4F4F2] focus:outline-none focus:ring-0 focus:border-[#F4F4F2] transition-colors text-sm md:text-base"
                  />
                  <label
                    htmlFor="cardHolder"
                    className={`absolute left-0 transition-all duration-300 text-[10px] tracking-widest uppercase font-label-caps ${
                      activeInput === 'cardHolder' || cardholderName
                        ? '-top-3 text-[#F4F4F2]'
                        : 'top-5 text-[#F4F4F2]/60'
                    }`}
                  >
                    Cardholder Name
                  </label>
                </div>
              </>
            ) : (
              <div className="bg-[#F4F4F2]/5 border border-[#F4F4F2]/10 p-6 text-center rounded-none my-4 font-sans max-w-lg">
                <p className="text-sm text-[#F4F4F2] mb-3 leading-relaxed">
                  You are checking out using <strong>{method === 'applepay' ? 'Apple Pay' : 'Mobile Money'}</strong>.
                </p>
                <p className="text-xs text-[#F4F4F2]/60">
                  Transactions are authorized using secure device hardware biometric chips.
                </p>
              </div>
            )}

            {/* Authorize Payment Action button */}
            <div className="pt-8">
              <button
                type="submit"
                disabled={isProcessingPayment}
                className="w-full bg-[#F4F4F2] hover:bg-white hover:shadow-[0_0_20px_rgba(244,244,242,0.3)] border border-[#F4F4F2] text-[#4E1413] py-5 px-8 font-label-caps text-xs tracking-[0.2em] uppercase rounded-none transition-all duration-500 flex justify-center items-center gap-3 cursor-pointer group font-bold disabled:opacity-70 disabled:cursor-not-allowed"
              >
                <span>{isProcessingPayment ? 'Processing Payment...' : 'Authorize Payment'}</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-2 transition-transform duration-500 text-[#4E1413] shrink-0" />
              </button>

              {/* End-to-end security tag */}
              <div className="flex items-center justify-center gap-2 mt-6 text-[#F4F4F2]/60">
                <ShieldCheck className="w-4 h-4 text-[#F4F4F2]" />
                <span className="font-label-caps text-[10px] uppercase tracking-widest text-[#F4F4F2]/80">
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
