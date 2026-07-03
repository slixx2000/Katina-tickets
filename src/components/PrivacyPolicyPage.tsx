import { ShieldCheck } from 'lucide-react';

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-[#666E54] text-[#F4F4F2] px-6 md:px-20 pt-32 pb-20">
      <div className="max-w-4xl mx-auto border border-[#F4F4F2]/20 bg-[#4E1413]/80 p-6 md:p-10">
        <div className="flex items-center gap-3 mb-4">
          <ShieldCheck className="w-5 h-5 text-[#F4F4F2]/90" />
          <p className="font-label-caps text-[10px] tracking-[0.22em] uppercase text-[#F4F4F2]/70">Legal</p>
        </div>
        <h1 className="font-display text-3xl md:text-4xl font-bold mb-3">Privacy Policy</h1>
        <p className="text-sm text-[#F4F4F2]/75 mb-8 font-sans">
          Effective date: 04 July 2026. This policy is designed to align with Zambia's Data Protection Act No. 3 of 2021.
        </p>

        <div className="space-y-6 text-sm leading-relaxed text-[#F4F4F2]/85 font-sans">
          <section>
            <h2 className="font-label-caps text-[11px] tracking-widest uppercase text-[#F4F4F2] mb-2">1. Data We Collect</h2>
            <p>
              We collect account identity and ticketing details including full name, email address, phone number, ticket type,
              quantity, reservation and payment references, session metadata, and ticket validation/check-in records.
            </p>
          </section>

          <section>
            <h2 className="font-label-caps text-[11px] tracking-widest uppercase text-[#F4F4F2] mb-2">2. Purpose of Processing</h2>
            <p>
              We process personal data to authenticate users, issue tickets, prevent fraud, fulfill event access obligations,
              perform scanner validation/check-in, maintain financial/audit records, and support customer service and platform security.
            </p>
          </section>

          <section>
            <h2 className="font-label-caps text-[11px] tracking-widest uppercase text-[#F4F4F2] mb-2">3. Data Retention</h2>
            <p>
              We retain personal data only for as long as needed for event operations, contractual obligations, legal/accounting duties,
              and fraud/security monitoring. Retention periods are reviewed periodically and records are deleted or anonymized when no longer required.
            </p>
          </section>

          <section>
            <h2 className="font-label-caps text-[11px] tracking-widest uppercase text-[#F4F4F2] mb-2">4. Third-Party Sharing</h2>
            <p>
              We share limited data with service providers that support payment processing, infrastructure hosting, and analytics.
              Card and mobile money payment credentials are processed by Lenco and are not stored on our servers.
            </p>
          </section>

          <section>
            <h2 className="font-label-caps text-[11px] tracking-widest uppercase text-[#F4F4F2] mb-2">5. User Rights</h2>
            <p>
              Subject to applicable law, you may request access, correction, deletion, objection/restriction of processing,
              and withdrawal of consent for non-essential processing. You may also request a copy of your personal data.
            </p>
          </section>

          <section>
            <h2 className="font-label-caps text-[11px] tracking-widest uppercase text-[#F4F4F2] mb-2">6. Data Requests & Contact</h2>
            <p>
              For privacy or data subject requests, contact: privacy@katinabasil.com. We may request identity verification before processing requests.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
