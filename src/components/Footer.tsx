import type { ScreenType } from '../types';

interface FooterProps {
  onNavigate: (screen: ScreenType) => void;
}

export default function Footer({ onNavigate }: FooterProps) {
  return (
    <footer className="w-full py-16 px-6 md:px-20 flex flex-col md:flex-row justify-between items-center gap-8 bg-[var(--footer-bg)] border-t border-[color:var(--header-border)] mt-12 select-none relative z-10 text-[color:var(--footer-text)] transition-all duration-300">
      <div className="font-display text-[color:var(--footer-text)] text-2xl uppercase tracking-widest font-bold">
        KATINA BASIL
      </div>
      
      <div className="flex flex-wrap justify-center gap-6 md:gap-8 text-[color:var(--footer-text-muted)] font-sans">
        <a 
          href="/privacy-policy" 
          onClick={(e) => { e.preventDefault(); onNavigate('privacy-policy'); }}
          className="font-label-caps text-[10px] md:text-xs text-[color:var(--footer-text)] hover:text-[#4E1413] transition-colors tracking-widest font-bold"
        >
          PRIVACY POLICY
        </a>
        <a 
          href="/terms-and-conditions" 
          onClick={(e) => { e.preventDefault(); onNavigate('terms-and-conditions'); }}
          className="font-label-caps text-[10px] md:text-xs text-[color:var(--footer-text)] hover:text-[#4E1413] transition-colors tracking-widest font-bold"
        >
          TERMS &amp; CONDITIONS
        </a>
        <a 
          href="/cookie-policy" 
          onClick={(e) => { e.preventDefault(); onNavigate('cookie-policy'); }}
          className="font-label-caps text-[10px] md:text-xs text-[color:var(--footer-text)] hover:text-[#4E1413] transition-colors tracking-widest font-bold"
        >
          COOKIE POLICY
        </a>
      </div>

      <div className="font-label-caps text-[9px] md:text-[10px] tracking-widest text-[color:var(--footer-text-muted)] text-center font-sans uppercase font-semibold">
        © 2026 KATINA BASIL. PRIVATE MEMBERS ONLY.
      </div>
    </footer>
  );
}
