export default function Footer() {
  return (
    <footer className="w-full py-16 px-6 md:px-20 flex flex-col md:flex-row justify-between items-center gap-8 bg-[#0e0e0e] border-t border-white/5 opacity-80 mt-12 select-none relative z-10">
      <div className="font-display text-on-surface text-2xl uppercase tracking-widest text-[#e5e2e1]">
        ATELIER
      </div>
      
      <div className="flex flex-wrap justify-center gap-6 md:gap-8 text-[#c4c7c7] font-sans">
        <a 
          href="#privacy" 
          onClick={(e) => { e.preventDefault(); alert("Privacy safeguards protect private members only."); }}
          className="font-label-caps text-[10px] md:text-xs text-on-surface-variant hover:text-white transition-colors tracking-widest"
        >
          PRIVACY
        </a>
        <a 
          href="#logistics" 
          onClick={(e) => { e.preventDefault(); alert("Showroom logistics maps and backstage protocols are managed privately."); }}
          className="font-label-caps text-[10px] md:text-xs text-on-surface-variant hover:text-white transition-colors tracking-widest"
        >
          LOGISTICS
        </a>
        <a 
          href="#membership" 
          onClick={(e) => { e.preventDefault(); alert("Concierge handles verified private member applications."); }}
          className="font-label-caps text-[10px] md:text-xs text-on-surface-variant hover:text-white transition-colors tracking-widest"
        >
          MEMBERSHIP
        </a>
        <a 
          href="#press" 
          onClick={(e) => { e.preventDefault(); alert("Press accreditation gates open 14 days prior to event."); }}
          className="font-label-caps text-[10px] md:text-xs text-on-surface-variant hover:text-white transition-colors tracking-widest"
        >
          PRESS
        </a>
      </div>

      <div className="font-label-caps text-[9px] md:text-[10px] tracking-widest text-on-surface-variant/40 text-center font-sans uppercase">
        © 2026 ATELIER COUTURE. PRIVATE MEMBERS ONLY.
      </div>
    </footer>
  );
}
