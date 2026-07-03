import { Cookie } from 'lucide-react';

export default function CookiePolicyPage() {
  return (
    <div className="min-h-screen bg-[#666E54] text-[#F4F4F2] px-6 md:px-20 pt-32 pb-20">
      <div className="max-w-4xl mx-auto border border-[#F4F4F2]/20 bg-[#4E1413]/80 p-6 md:p-10">
        <div className="flex items-center gap-3 mb-4">
          <Cookie className="w-5 h-5 text-[#F4F4F2]/90" />
          <p className="font-label-caps text-[10px] tracking-[0.22em] uppercase text-[#F4F4F2]/70">Legal</p>
        </div>
        <h1 className="font-display text-3xl md:text-4xl font-bold mb-3">Cookie Policy</h1>
        <p className="text-sm text-[#F4F4F2]/75 mb-8 font-sans">Effective date: 04 July 2026.</p>

        <div className="space-y-6 text-sm leading-relaxed text-[#F4F4F2]/85 font-sans">
          <section>
            <h2 className="font-label-caps text-[11px] tracking-widest uppercase text-[#F4F4F2] mb-2">1. Essential Cookies</h2>
            <p>
              Required for authentication, session security, fraud protection, and core ticket purchase functionality.
              These cannot be disabled while using the platform.
            </p>
          </section>

          <section>
            <h2 className="font-label-caps text-[11px] tracking-widest uppercase text-[#F4F4F2] mb-2">2. Analytics Cookies</h2>
            <p>
              Used to measure performance and improve service quality. Analytics are disabled by default until you grant consent.
            </p>
          </section>

          <section>
            <h2 className="font-label-caps text-[11px] tracking-widest uppercase text-[#F4F4F2] mb-2">3. Marketing Cookies</h2>
            <p>
              Used for campaign attribution and personalization. Marketing cookies are disabled by default until you grant consent.
            </p>
          </section>

          <section>
            <h2 className="font-label-caps text-[11px] tracking-widest uppercase text-[#F4F4F2] mb-2">4. Consent Control</h2>
            <p>
              You can accept all, reject non-essential, or customize analytics/marketing categories from the cookie banner.
              Your choice is stored and respected on future visits.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
