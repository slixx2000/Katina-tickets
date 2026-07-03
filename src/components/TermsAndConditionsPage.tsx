import { ScrollText } from 'lucide-react';

export default function TermsAndConditionsPage() {
  return (
    <div className="min-h-screen bg-[#666E54] text-[#F4F4F2] px-6 md:px-20 pt-32 pb-20">
      <div className="max-w-4xl mx-auto border border-[#F4F4F2]/20 bg-[#4E1413]/80 p-6 md:p-10">
        <div className="flex items-center gap-3 mb-4">
          <ScrollText className="w-5 h-5 text-[#F4F4F2]/90" />
          <p className="font-label-caps text-[10px] tracking-[0.22em] uppercase text-[#F4F4F2]/70">Legal</p>
        </div>
        <h1 className="font-display text-3xl md:text-4xl font-bold mb-3">Terms and Conditions</h1>
        <p className="text-sm text-[#F4F4F2]/75 mb-8 font-sans">Effective date: 04 July 2026.</p>

        <div className="space-y-6 text-sm leading-relaxed text-[#F4F4F2]/85 font-sans">
          <section>
            <h2 className="font-label-caps text-[11px] tracking-widest uppercase text-[#F4F4F2] mb-2">1. Account Rules</h2>
            <p>
              Users must provide accurate registration details, protect account credentials, and use the platform lawfully.
              We may suspend access for abuse, fraud, or misuse of ticketing/check-in systems.
            </p>
          </section>

          <section>
            <h2 className="font-label-caps text-[11px] tracking-widest uppercase text-[#F4F4F2] mb-2">2. Refund and Cancellation</h2>
            <p>
              Tickets are generally non-refundable except where required by law, event cancellation policy, or organizer discretion.
              Event changes/cancellations may result in replacement dates, credits, or partial/full refunds depending on circumstances.
            </p>
          </section>

          <section>
            <h2 className="font-label-caps text-[11px] tracking-widest uppercase text-[#F4F4F2] mb-2">3. Payment Processing</h2>
            <p>
              Payments are processed by Lenco. We do not store full card details or payment credentials on our servers.
            </p>
          </section>

          <section>
            <h2 className="font-label-caps text-[11px] tracking-widest uppercase text-[#F4F4F2] mb-2">4. Liability Limits</h2>
            <p>
              To the extent permitted by law, our liability is limited to direct losses up to the amount paid for the relevant ticket/order.
              We are not liable for indirect or consequential losses.
            </p>
          </section>

          <section>
            <h2 className="font-label-caps text-[11px] tracking-widest uppercase text-[#F4F4F2] mb-2">5. Dispute Resolution</h2>
            <p>
              These terms are governed by the laws of the Republic of Zambia. Parties will attempt good-faith resolution first,
              and unresolved disputes are subject to the competent courts in Zambia.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
