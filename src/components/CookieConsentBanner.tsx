import { useMemo, useState } from 'react';

type CookieConsent = {
  essential: true;
  analytics: boolean;
  marketing: boolean;
  updatedAt: string;
};

type CookieConsentBannerProps = {
  consent: CookieConsent | null;
  onSave: (consent: CookieConsent) => void;
};

export default function CookieConsentBanner({ consent, onSave }: CookieConsentBannerProps) {
  const [expanded, setExpanded] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);

  const visible = useMemo(() => consent === null, [consent]);

  if (!visible) {
    return null;
  }

  const save = (value: { analytics: boolean; marketing: boolean }) => {
    onSave({
      essential: true,
      analytics: value.analytics,
      marketing: value.marketing,
      updatedAt: new Date().toISOString(),
    });
  };

  return (
    <div className="fixed bottom-4 left-4 right-4 z-[120] border border-[#F4F4F2]/25 bg-[#4E1413] text-[#F4F4F2] p-4 md:p-5 shadow-2xl">
      <p className="font-label-caps text-[10px] tracking-[0.2em] uppercase text-[#F4F4F2]/70 mb-2">Cookie Consent</p>
      <p className="text-xs md:text-sm text-[#F4F4F2]/85 font-sans leading-relaxed">
        We use essential cookies for security and checkout. Analytics and marketing cookies are blocked until you consent.
      </p>

      {expanded ? (
        <div className="mt-3 space-y-2 text-xs">
          <label className="flex items-center justify-between border border-[#F4F4F2]/20 px-3 py-2">
            <span>Essential (always on)</span>
            <span className="text-[#F4F4F2]/70">Enabled</span>
          </label>
          <label className="flex items-center justify-between border border-[#F4F4F2]/20 px-3 py-2 cursor-pointer">
            <span>Analytics</span>
            <input type="checkbox" checked={analytics} onChange={(event) => setAnalytics(event.target.checked)} />
          </label>
          <label className="flex items-center justify-between border border-[#F4F4F2]/20 px-3 py-2 cursor-pointer">
            <span>Marketing</span>
            <input type="checkbox" checked={marketing} onChange={(event) => setMarketing(event.target.checked)} />
          </label>
        </div>
      ) : null}

      <div className="mt-4 flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className="text-[10px] font-label-caps tracking-widest uppercase border border-[#F4F4F2]/25 px-3 py-2 hover:border-[#F4F4F2] cursor-pointer"
        >
          {expanded ? 'Hide Choices' : 'Customize'}
        </button>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => save({ analytics: false, marketing: false })}
            className="text-[10px] font-label-caps tracking-widest uppercase border border-[#F4F4F2]/25 px-3 py-2 hover:border-[#F4F4F2] cursor-pointer"
          >
            Reject Non-Essential
          </button>
          <button
            type="button"
            onClick={() => save(expanded ? { analytics, marketing } : { analytics: true, marketing: true })}
            className="text-[10px] font-label-caps tracking-widest uppercase border border-[#F4F4F2] bg-[#F4F4F2] text-[#4E1413] px-3 py-2 hover:bg-[#ecebe8] cursor-pointer"
          >
            {expanded ? 'Save Choices' : 'Accept All'}
          </button>
        </div>
      </div>
    </div>
  );
}
