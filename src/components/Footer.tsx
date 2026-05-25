export default function Footer() {
  return (
    <footer className="w-full py-16 px-6 md:px-20 flex flex-col md:flex-row justify-between items-center gap-8 bg-[var(--footer-bg)] border-t border-[color:var(--header-border)] mt-12 select-none relative z-10 text-[color:var(--footer-text)] transition-all duration-300">
      <div className="font-display text-[color:var(--footer-text)] text-2xl uppercase tracking-widest font-bold">
        KATINA BASIL
      </div>
      
      <div className="flex flex-wrap justify-center gap-6 md:gap-8 text-[color:var(--footer-text-muted)] font-sans">
        <a 
          href="#privacy" 
          onClick={(e) => { e.preventDefault(); alert("Privacy safeguards protect private members only."); }}
          className="font-label-caps text-[10px] md:text-xs text-[color:var(--footer-text)] hover:text-[#4E1413] transition-colors tracking-widest font-bold"
        >
          PRIVACY
        </a>
        <a 
          href="#logistics" 
          onClick={(e) => { e.preventDefault(); alert("Showroom logistics maps and backstage protocols are managed privately."); }}
          className="font-label-caps text-[10px] md:text-xs text-[color:var(--footer-text)] hover:text-[#4E1413] transition-colors tracking-widest font-bold"
        >
          LOGISTICS
        </a>
        <a 
          href="#membership" 
          onClick={(e) => { e.preventDefault(); alert("Concierge handles verified private member applications."); }}
          className="font-label-caps text-[10px] md:text-xs text-[color:var(--footer-text)] hover:text-[#4E1413] transition-colors tracking-widest font-bold"
        >
          MEMBERSHIP
        </a>
        <a 
          href="#press" 
          onClick={(e) => { e.preventDefault(); alert("Press accreditation gates open 14 days prior to event."); }}
          className="font-label-caps text-[10px] md:text-xs text-[color:var(--footer-text)] hover:text-[#4E1413] transition-colors tracking-widest font-bold"
        >
          PRESS
        </a>
      </div>

      <div className="font-label-caps text-[9px] md:text-[10px] tracking-widest text-[color:var(--footer-text-muted)] text-center font-sans uppercase font-semibold">
        © 2026 KATINA BASIL. PRIVATE MEMBERS ONLY.
      </div>
    </footer>
  );
}
