import React, { useState } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, ArrowRight, Minus, Plus, Calendar, MapPin, Gift, Lock } from 'lucide-react';
import { TicketPackage, RegistrationData } from '../types';

interface GuestRegistrationProps {
  selectedPackage: TicketPackage;
  onBack: () => void;
  onSubmit: (data: RegistrationData) => void;
}

export default function GuestRegistration({ selectedPackage, onBack, onSubmit }: GuestRegistrationProps) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [quantity, setQuantity] = useState(1);

  const leftBgImage = "https://lh3.googleusercontent.com/aida-public/AB6AXuAFWHMOi9pDGvDLpBtqBoC_sGnWV-FAJs5RpNvz_oeFTBAv1MrS7PGmp3bKp2kFCqkO1arY5FKjz5cvU7M9CHDdEzcFqZY5_-hHg7WCJAQsQMpKSF5ycBN6ul5PnHYsnn0tkWLNfgv8QTpM5U_VM3NKRciIJxrN1NhK7WjcT6XkKpnGRphRB9WmXgSD2Wu-1TogY1PZX7UuWgzfVm8DPBPidP6kWKL8wsbr1_07VS37P7wehz1XMKNip1RlEfXE0b1I4FworCEacQtO";

  const totalDue = selectedPackage.price * quantity;

  // Form error states
  const [errors, setErrors] = useState<{ fullName?: string; email?: string }>({});

  const handlePlus = () => {
    if (quantity < 6) setQuantity(prev => prev + 1);
  };

  const handleMinus = () => {
    if (quantity > 1) setQuantity(prev => prev - 1);
  };

  const handleSubmitForm = (e: React.FormEvent) => {
    e.preventDefault();

    // Minor validation checks
    const newErrors: { fullName?: string; email?: string } = {};
    if (!fullName.trim()) newErrors.fullName = 'Full Legal Name is required';
    if (!email.trim() || !email.includes('@')) newErrors.email = 'Valid Email Address is required';

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    onSubmit({
      fullName,
      email,
      phone,
      quantity,
      ticketType: selectedPackage.id
    });
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row w-full bg-[#666E54] text-[#F4F4F2]">
      {/* Absolute Back Button floating over top left */}
      <div className="absolute top-8 left-6 md:left-12 z-50">
        <button
          onClick={onBack}
          className="group flex items-center gap-2 text-[#F4F4F2] hover:text-[#F4F4F2]/80 transition-colors cursor-pointer py-1"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          <span className="font-label-caps text-xs">Return</span>
        </button>
      </div>

      {/* LEFT SIDE: Cinematic Event Details Panel */}
      <section className="relative w-full lg:w-1/2 h-[450px] lg:h-screen flex-shrink-0 bg-[#666E54] overflow-hidden group">
        {/* Dark Background Scale Image */}
        <div 
          className="absolute inset-0 bg-cover bg-center transition-transform duration-[20s] ease-out group-hover:scale-105"
          style={{ backgroundImage: `url(${leftBgImage})` }}
        />

        {/* Cinematic shadows/gradient blends */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#666E54] via-[#666E54]/50 to-transparent lg:hidden" />
        <div className="absolute inset-0 hidden lg:block bg-gradient-to-r from-transparent via-[#666E54]/25 to-[#666E54]" />
        <div className="absolute inset-0 bg-black/35 mix-blend-multiply" />

        {/* Glassmorphism Details Card Overlay */}
        <div className="absolute bottom-8 left-6 right-6 lg:bottom-16 lg:left-16 lg:right-16 max-w-md p-8 bg-[#4E1413] border border-[#F4F4F2]/20 rounded-none shadow-[0_4px_30px_rgba(0,0,0,0.3)] z-10 text-[#F4F4F2]">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-2.5 h-2.5 rounded-full bg-[#F4F4F2] shadow-[0_0_12px_rgba(244,244,242,0.8)] animate-pulse"></span>
            <span className="font-label-caps text-[10px] text-[#F4F4F2]/90 tracking-[0.25em] font-bold">Selected Package</span>
          </div>

          <h2 className="font-headline-md text-3xl text-[#F4F4F2] mb-2 uppercase leading-none font-bold">
            {selectedPackage.name}
          </h2>

          <p className="font-body-md text-xs md:text-sm text-[#F4F4F2]/80 mb-6 border-b border-[#F4F4F2]/20 pb-6 leading-relaxed">
            {selectedPackage.description}
          </p>

          <div className="space-y-4">
            <div className="flex justify-between items-start gap-3">
              <span className="flex items-center gap-1.5 font-label-caps text-[10px] text-[#F4F4F2]/70 font-semibold">
                <Calendar className="w-3.5 h-3.5 text-[#F4F4F2]" /> Date &amp; Time
              </span>
              <span className="font-body-md text-xs text-right text-[#F4F4F2] font-semibold">
                Nov 12, 2026<br />
                8:00 PM CAT
              </span>
            </div>

            <div className="flex justify-between items-start gap-3">
              <span className="flex items-center gap-1.5 font-label-caps text-[10px] text-[#F4F4F2]/70 font-semibold">
                <MapPin className="w-3.5 h-3.5 text-[#F4F4F2]" /> Location
              </span>
              <span className="font-body-md text-xs text-right text-[#F4F4F2] font-semibold">
                Ciela Resort &amp; Spa<br />
                Lusaka, Zambia
              </span>
            </div>

            <div className="flex justify-between items-center pt-4 border-t border-[#F4F4F2]/20">
              <span className="flex items-center gap-1.5 font-label-caps text-[10px] text-[#F4F4F2]/70 font-semibold">
                <Gift className="w-3.5 h-3.5 text-[#F4F4F2]" /> Price / Entry
              </span>
              <span className="font-display text-xl text-[#F4F4F2] font-bold">
                K{selectedPackage.price.toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* RIGHT SIDE: Guest Registration Form */}
      <section className="relative w-full lg:w-1/2 flex flex-col justify-center px-6 py-16 md:px-16 lg:px-24 z-20 bg-[#4E1413]">
        <div className="max-w-lg w-full mx-auto">
          
          <header className="mb-10 font-sans">
            <h1 className="font-headline-sm text-4xl text-[#F4F4F2] mb-2 font-bold leading-none">Guest Registration</h1>
            <p className="font-body-md text-xs md:text-sm text-[#F4F4F2]/80">
              Please provide credentials for the delegation leader. All physical showroom access badges are certified and strictly non-transferable.
            </p>
          </header>Exciting details are saved below.

          <form onSubmit={handleSubmitForm} className="space-y-8 font-sans">
            {/* Input: FULL LEGAL NAME */}
            <div className="relative group flex flex-col pt-4">
              <input
                id="fullName"
                type="text"
                required
                value={fullName}
                onChange={(e) => {
                  setFullName(e.target.value);
                  if (errors.fullName) setErrors(prev => ({ ...prev, fullName: undefined }));
                }}
                placeholder="Name on official identity credentials"
                className="peer w-full bg-transparent border-b border-[#F4F4F2]/30 py-3 text-[#F4F4F2] focus:outline-none focus:border-[#F4F4F2] transition-colors text-sm font-sans placeholder-[#F4F4F2]/40"
              />
              <label 
                htmlFor="fullName"
                className="absolute top-0 left-0 font-label-caps text-[10px] text-[#F4F4F2]/70 transition-all peer-placeholder-shown:text-xs peer-placeholder-shown:top-4 peer-focus:top-0 peer-focus:text-[#F4F4F2] font-bold"
              >
                FULL LEGAL NAME
              </label>
              {errors.fullName && <p className="text-[#F4F4F2]/90 bg-red-950/40 text-xs mt-1.5 p-1 border border-red-500/20">{errors.fullName}</p>}
            </div>

            {/* Input: EMAIL ADDRESS */}
            <div className="relative group flex flex-col pt-4">
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (errors.email) setErrors(prev => ({ ...prev, email: undefined }));
                }}
                placeholder="Secure email for priority digital credentials"
                className="peer w-full bg-transparent border-b border-[#F4F4F2]/30 py-3 text-[#F4F4F2] focus:outline-none focus:border-[#F4F4F2] transition-colors text-sm font-sans placeholder-[#F4F4F2]/40"
              />
              <label 
                htmlFor="email"
                className="absolute top-0 left-0 font-label-caps text-[10px] text-[#F4F4F2]/70 transition-all peer-placeholder-shown:text-xs peer-placeholder-shown:top-4 peer-focus:top-0 peer-focus:text-[#F4F4F2] font-bold"
              >
                EMAIL ADDRESS
              </label>
              {errors.email && <p className="text-[#F4F4F2]/90 bg-red-950/40 text-xs mt-1.5 p-1 border border-red-500/20">{errors.email}</p>}
            </div>

            {/* Input: PHONE NUMBER */}
            <div className="relative group flex flex-col pt-4">
              <input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Optional digits, e.g. +260 97 1234567"
                className="peer w-full bg-transparent border-b border-[#F4F4F2]/30 py-3 text-[#F4F4F2] focus:outline-none focus:border-[#F4F4F2] transition-colors text-sm font-sans placeholder-[#F4F4F2]/40"
              />
              <label 
                htmlFor="phone"
                className="absolute top-0 left-0 font-label-caps text-[10px] text-[#F4F4F2]/70 transition-all peer-placeholder-shown:text-xs peer-placeholder-shown:top-4 peer-focus:top-0 peer-focus:text-[#F4F4F2] font-bold"
              >
                PHONE NUMBER (OPTIONAL)
              </label>
            </div>

            {/* Tickets Quantity Allocation Counter & Subtotal Summary */}
            <div className="pt-8 mt-10 border-t border-[#F4F4F2]/20 flex flex-col gap-6">
              
              {/* Counter Row */}
              <div className="flex justify-between items-center bg-[#F4F4F2]/10 p-4 border border-[#F4F4F2]/20 rounded-none">
                <span className="font-label-caps text-[11px] text-[#F4F4F2]/90 tracking-[0.2em] leading-none font-bold">
                  ALLOCATION COUNT
                </span>
                
                <div className="flex items-center gap-4">
                  <button
                    type="button"
                    onClick={handleMinus}
                    disabled={quantity <= 1}
                    className="w-8 h-8 rounded-full border border-[#F4F4F2]/40 flex items-center justify-center text-[#F4F4F2]/90 hover:border-white hover:text-white transition-colors disabled:opacity-20 cursor-pointer"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="font-body-lg text-lg text-[#F4F4F2] font-bold w-4 text-center select-none" id="quantity-display">
                    {quantity}
                  </span>
                  <button
                    type="button"
                    onClick={handlePlus}
                    disabled={quantity >= 6}
                    className="w-8 h-8 rounded-full border border-[#F4F4F2]/40 flex items-center justify-center text-[#F4F4F2]/90 hover:border-white hover:text-white transition-colors disabled:opacity-20 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Total Summary Row */}
              <div className="flex justify-between items-end py-2">
                <span className="font-label-caps text-xs text-[#F4F4F2]/80 font-bold">TOTAL DUE</span>
                <span className="font-display text-3xl sm:text-4xl text-[#F4F4F2] font-bold" id="total-price">
                  K{totalDue.toLocaleString()}
                </span>
              </div>
            </div>

            {/* Primary Submit Button */}
            <button
              type="submit"
              className="w-full bg-[#F4F4F2] text-[#4E1413] font-label-caps text-xs py-6 tracking-[0.2em] font-bold hover:bg-white hover:text-[#4E1413] transition-all duration-500 ease-out mt-8 flex items-center justify-center gap-3 relative group overflow-hidden cursor-pointer"
            >
              <Lock className="w-4 h-4 mr-1 text-[#4E1413] shrink-0" />
              <span className="relative z-10 font-label-caps font-bold">PROCEED TO SECURE CHECKOUT</span>
              <ArrowRight className="w-4 h-4 relative z-10 transition-transform duration-500 group-hover:translate-x-2 shrink-0 text-[#4E1413]" />
            </button>

            <p className="font-body-md text-[10px] md:text-xs text-[#F4F4F2]/60 text-center mt-4 uppercase tracking-wider leading-relaxed">
              By proceeding with this transaction, you agree to our strict confidentiality non-disclosure terms and private event guidelines.
            </p>
          </form>
        </div>
      </section>
    </div>
  );
}
