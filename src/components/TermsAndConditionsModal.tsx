import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ScrollText } from 'lucide-react';

interface TermsAndConditionsModalProps {
  isOpen: boolean;
  onAccept: () => void;
  onDecline: () => void;
}

const SECTIONS = [
  {
    title: 'TICKET PURCHASE & PAYMENT',
    body: [
      'All ticket purchases made through this platform are final. By completing your transaction, you enter into a binding agreement for admission to the Katina Basil Fall/Winter 2026 Haute Couture Showcase ("the Event").',
      'Tickets are priced in Zambian Kwacha (ZMW). Full payment is required at the time of booking. Your reservation is only confirmed upon receipt of a successful payment confirmation from our payment processor.',
      'In the event of a payment failure or processing error, no reservation is guaranteed until you receive an explicit confirmation reference via email.',
    ],
  },
  {
    title: 'NON-REFUND & NON-TRANSFER POLICY',
    body: [
      'All sales are strictly final. No refunds, exchanges, or cancellations will be issued for any reason, including but not limited to changes in personal circumstance, travel disruption, illness, or inability to attend.',
      'Tickets are personal and non-transferable. Each ticket is issued to the named guest on the reservation and is valid solely for that individual\'s admission. Resale, gifting, or transfer of tickets to a third party is prohibited and may result in denial of entry without recourse.',
      'Duplicate or fraudulent tickets will be void upon scanning and no refund will be issued.',
    ],
  },
  {
    title: 'EVENT CANCELLATION OR POSTPONEMENT',
    body: [
      'In the unlikely event that the Event is cancelled outright by the organiser due to circumstances beyond reasonable control (including force majeure, government restrictions, or venue unavailability), ticket holders will be notified via the email address provided at registration.',
      'In the event of cancellation, a credit or partial refund may be offered at the sole discretion of Katina Basil. Refunds, if issued, will be processed to the original payment method and may take 7–21 business days.',
      'Should the Event be postponed rather than cancelled, tickets will automatically remain valid for the rescheduled date. Guests who cannot attend the new date may request a credit note by contacting us within 14 days of the rescheduled date announcement.',
    ],
  },
  {
    title: 'ADMISSION & CONDUCT',
    body: [
      'Ticket holders must present their digital ticket QR code (or printed equivalent) together with a valid government-issued photo identification at the point of entry. Failure to produce matching identification may result in denial of admission.',
      'The Event is strictly 18 years of age and over. No exceptions will be made.',
      'All guests are expected to conduct themselves with decorum befitting a luxury private showcase. The organisers reserve the right to refuse admission or remove any person whose conduct is deemed disruptive, offensive, or inconsistent with the nature of the Event, without refund.',
      'Dress code is strictly Smart Elegant / Black Tie Optional. The organisers reserve the right to decline admission to guests not meeting the dress standard.',
    ],
  },
  {
    title: 'PHOTOGRAPHY, RECORDING & INTELLECTUAL PROPERTY',
    body: [
      'Personal photography for non-commercial use is permitted in designated areas. Flash photography and video recording are strictly prohibited on the runway and during live presentations without prior written consent from the organiser.',
      'By attending the Event, guests consent to being photographed, filmed, or otherwise recorded as part of the general audience for editorial, promotional, or archival purposes. These recordings remain the exclusive intellectual property of Katina Basil.',
      'All creative works, designs, garments, and presentations featured at the Event are the intellectual property of Katina Basil and are protected under applicable copyright and design law. Unauthorised reproduction, distribution, or commercial exploitation is prohibited.',
    ],
  },
  {
    title: 'DATA PRIVACY & COMMUNICATION',
    body: [
      'Personal data collected during the registration and payment process (including your full name, email address, and phone number) is processed solely for the purposes of fulfilling your ticket reservation, verifying identity at entry, and communicating Event-related information.',
      'We do not sell, rent, or share your personal data with third parties for marketing purposes. Data may be shared with our payment processor, event security, and venue partners strictly on a need-to-know basis.',
      'By completing your registration you consent to receiving transactional communications from Katina Basil relating to this Event. You may opt out of non-essential communications at any time by contacting us at the address below.',
    ],
  },
  {
    title: 'LIABILITY LIMITATION',
    body: [
      'Katina Basil and its organisers, agents, and venue partners accept no liability for loss, theft, damage, injury, or illness sustained by guests during or in connection with the Event, except where such liability cannot be excluded by law.',
      'Guests attend at their own risk. The organisers strongly advise all guests to make appropriate travel and personal insurance arrangements prior to attending.',
      'The total liability of the organiser to any ticket holder shall in no circumstances exceed the face value of the ticket purchased.',
    ],
  },
  {
    title: 'GOVERNING LAW & CONTACT',
    body: [
      'These Terms & Conditions are governed by and construed in accordance with the laws of the Republic of Zambia. Any disputes arising in connection with these terms shall be subject to the exclusive jurisdiction of the courts of Zambia.',
      'For enquiries regarding your reservation or these terms, please contact us at: events@katinabasil.com',
    ],
  },
];

export default function TermsAndConditionsModal({ isOpen, onAccept, onDecline }: TermsAndConditionsModalProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Reset scroll on open
  useEffect(() => {
    if (isOpen && scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [isOpen]);

  // Trap focus / close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDecline();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onDecline]);

  // Prevent body scroll while open
  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            key="tc-backdrop"
            className="fixed inset-0 z-[9998] bg-black/70 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
            onClick={onDecline}
            aria-hidden="true"
          />

          {/* Modal Panel */}
          <motion.div
            key="tc-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="tc-modal-title"
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-8"
            initial={{ opacity: 0, scale: 0.96, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 20 }}
            transition={{ duration: 0.45, ease: [0.25, 1, 0.5, 1] }}
          >
            <div
              className="relative w-full max-w-2xl max-h-[90vh] flex flex-col bg-[#4E1413] border border-[rgba(244,244,242,0.18)] shadow-[0_40px_120px_rgba(0,0,0,0.65)]"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-start justify-between px-8 pt-8 pb-6 border-b border-[rgba(244,244,242,0.15)] shrink-0">
                <div className="flex items-center gap-4">
                  <div className="w-9 h-9 border border-[rgba(244,244,242,0.25)] flex items-center justify-center shrink-0">
                    <ScrollText className="w-4 h-4 text-[#F4F4F2]/70" />
                  </div>
                  <div>
                    <p className="font-label-caps text-[10px] tracking-[0.45em] text-[#F4F4F2]/55 mb-1">
                      KATINA BASIL · FALL / WINTER 2026
                    </p>
                    <h2
                      id="tc-modal-title"
                      className="font-display text-xl sm:text-2xl text-[#F4F4F2] font-bold tracking-wide leading-none"
                    >
                      Terms &amp; Conditions
                    </h2>
                  </div>
                </div>
                <button
                  onClick={onDecline}
                  aria-label="Decline and close"
                  className="w-8 h-8 flex items-center justify-center border border-[rgba(244,244,242,0.18)] text-[#F4F4F2]/60 hover:text-[#F4F4F2] hover:border-[rgba(244,244,242,0.45)] transition-all duration-300 shrink-0 cursor-pointer ml-4"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Scrollable Body */}
              <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto px-8 py-7 space-y-8 scrollbar-thin"
                style={{ scrollbarColor: 'rgba(244,244,242,0.15) transparent', scrollbarWidth: 'thin' }}
              >
                {/* Intro */}
                <p className="font-body-md text-[13px] text-[#F4F4F2]/75 leading-relaxed border-l-2 border-[rgba(244,244,242,0.2)] pl-4">
                  Please read these Terms &amp; Conditions carefully before completing your ticket purchase for the{' '}
                  <span className="text-[#F4F4F2] font-semibold">Katina Basil Fall/Winter 2026 Haute Couture Showcase</span>.
                  By accepting, you confirm that you have read, understood, and agree to be bound by all of the following terms.
                  Last updated: <span className="text-[#F4F4F2]/60 italic">May 2026</span>.
                </p>

                {SECTIONS.map((section, idx) => (
                  <div key={idx}>
                    <h3 className="font-label-caps text-[10px] tracking-[0.38em] text-[#F4F4F2]/55 mb-3 flex items-center gap-3">
                      <span className="w-4 h-[1px] bg-[rgba(244,244,242,0.25)] shrink-0" />
                      {section.title}
                    </h3>
                    <div className="space-y-3">
                      {section.body.map((para, pIdx) => (
                        <p key={pIdx} className="font-body-md text-[13px] text-[#F4F4F2]/75 leading-relaxed">
                          {para}
                        </p>
                      ))}
                    </div>
                  </div>
                ))}

                {/* Scroll fade buffer */}
                <div className="h-4" />
              </div>

              {/* Footer / Actions */}
              <div className="px-8 py-6 border-t border-[rgba(244,244,242,0.15)] shrink-0 space-y-4">
                <p className="font-label-caps text-[10px] tracking-[0.3em] text-[#F4F4F2]/45 text-center">
                  BY CLICKING "I AGREE" YOU ACCEPT THESE TERMS IN FULL
                </p>
                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    onClick={onDecline}
                    className="flex-1 py-4 border border-[rgba(244,244,242,0.25)] text-[#F4F4F2]/70 font-label-caps text-[10px] tracking-[0.28em] hover:border-[rgba(244,244,242,0.5)] hover:text-[#F4F4F2] transition-all duration-300 cursor-pointer"
                  >
                    DECLINE
                  </button>
                  <button
                    onClick={onAccept}
                    className="flex-[2] py-4 bg-[#F4F4F2] text-[#4E1413] font-label-caps text-[10px] tracking-[0.28em] font-bold hover:bg-[#e8e8e6] transition-all duration-300 cursor-pointer border border-[#F4F4F2]"
                  >
                    I AGREE — CONTINUE TO TICKETS
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
