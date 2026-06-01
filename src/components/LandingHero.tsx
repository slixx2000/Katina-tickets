import { motion } from 'motion/react';
import { ArrowDown } from 'lucide-react';

interface LandingHeroProps {
  onBuyTickets: () => void;
  onExploreMore?: () => void;
}

export default function LandingHero({ onBuyTickets, onExploreMore }: LandingHeroProps) {
  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden bg-[linear-gradient(180deg,var(--hero-bg-start),var(--hero-bg-mid)_48%,var(--hero-bg-end))]">
      {/* Radiant Glow for luxury depth */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[85vw] h-[85vw] max-w-[900px] max-h-[900px] rounded-full bg-[color:var(--hero-glow)] blur-[130px] pointer-events-none z-0 animate-pulse" style={{ animationDuration: '9s' }} />
      <div className="absolute top-1/4 left-1/3 w-[50vw] h-[50vw] max-w-[500px] rounded-full bg-[color:var(--hero-accent-glow)] blur-[100px] pointer-events-none z-0" />
      
      {/* Colossal Typographic Background "KATINA BASIL" in Bank Gothic acting as a luxury texture */}
      <div className="absolute inset-0 flex flex-col items-center justify-center overflow-hidden pointer-events-none select-none z-0 p-4">
        <h1 className="text-[12vw] md:text-[14vw] font-display font-bold uppercase tracking-[0.15em] leading-[1.1] text-center select-none" style={{ color: 'var(--hero-cta-text)', opacity: 0.04 }}>
          KATINA
          <br className="sm:hidden" />
          <span className="sm:inline hidden"> </span>
          BASIL
        </h1>
      </div>

      {/* Main Content Showcase */}
      <div className="relative z-10 flex flex-col items-center justify-center text-center px-6 max-w-4xl mx-auto pt-20">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.2, ease: [0.25, 1, 0.5, 1] }}
          className="flex flex-col items-center"
        >
          {/* Subtle Accent Card label */}
          <span className="text-[color:var(--hero-text-muted)] tracking-[0.5em] font-label-caps text-[10px] md:text-[12px] mb-6 block select-none">
            HAUTE COUTURE SHOWCASE
          </span>

          {/* Elegant Front-row Brand Title serving as Logo Presence */}
          <h2 className="font-display text-4xl sm:text-5xl md:text-7xl tracking-[0.3em] text-[color:var(--hero-text)] uppercase leading-none font-bold select-none drop-shadow-lg mb-8">
            KATINA BASIL
          </h2>

          <div className="w-24 h-[1px] bg-[color:var(--hero-divider)] mb-8" />

          {/* Event subtitle */}
          <p className="font-label-caps text-[color:var(--hero-text-muted)] text-[10px] md:text-xs mb-12 tracking-[0.35em] uppercase max-w-xl leading-relaxed">
            FASHION SHOW | 30 OCTOBER 2026 | MULUNGUSHI CONFERENCE CENTRE | 6 PM - 9 PM
          </p>

          {/* Golden/Glass luxury action button */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <button
              onClick={onBuyTickets}
              className="relative px-12 py-5 bg-[var(--hero-cta-bg)] border border-[var(--hero-cta-border)] text-[var(--hero-cta-text)] hover:text-[var(--hero-cta-hover-text)] hover:border-[var(--hero-cta-hover-border)] font-label-caps tracking-[0.25em] transition-all duration-500 ease-out cursor-pointer hover:shadow-[0_0_30px_rgba(78,20,19,0.38)] hover:bg-[var(--hero-cta-hover-bg)] font-bold group"
            >
               BUY TICKETS
            </button>
            
            {onExploreMore && (
              <button
                onClick={onExploreMore}
                className="px-8 py-5 text-black hover:text-black font-label-caps tracking-[0.2em] transition-all duration-300 cursor-pointer"
              >
                Explore Concept
              </button>
            )}
          </div>
        </motion.div>
      </div>

      {/* Bottom Scroll Indicator with cinematic bounce */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.6 }}
        transition={{ delay: 1, duration: 1 }}
        onClick={onExploreMore}
        className="absolute bottom-24 md:bottom-12 w-full flex flex-col items-center justify-center z-10 text-on-surface-variant/60 cursor-pointer hover:text-white transition-colors"
      >
        <p className="font-label-caps text-[9px] md:text-[10px] tracking-[0.4em] mb-2 uppercase">
          Scroll to Explore
        </p>
        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
        >
          <ArrowDown className="w-4 h-4 text-[#4E1413]" />
        </motion.div>
      </motion.div>
    </div>
  );
}
