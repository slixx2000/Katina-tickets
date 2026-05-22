import { motion } from 'motion/react';
import { ArrowDown } from 'lucide-react';

interface LandingHeroProps {
  onBuyTickets: () => void;
  onExploreMore?: () => void;
}

export default function LandingHero({ onBuyTickets, onExploreMore }: LandingHeroProps) {
  const bgImage = "https://lh3.googleusercontent.com/aida-public/AB6AXuAWo33r9v-z6f7jAfM5E98wMtQ4ICYdNN0NPw88qNPw9aI8Q_MLsIYOFbb1z_OAdJb1Sii7tz1L_FwxBZzuXutxm87FS6wnTxOdxVvazWT1cep7xeK8o1Obi_00XQ9fvRWxMRSGKZmpFt8C6tLlZyAfo3_fHjidjC0FMu8Migugv-2gD5PZIYBBDLk8VW9DuEHb--U0-1azk_YuVaV5eUQ-JJFNdNuv1gge7kHkEWSPpGLblKZMQFulQpskiA7SQuolco_ObRc3yrvF";

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden">
      {/* Background Cinematic Image with Luxury dark vignettes */}
      <div 
        className="absolute inset-0 bg-cover bg-center bg-no-referrer z-0"
        style={{ 
          backgroundImage: `url(${bgImage})`,
        }}
        referrerPolicy="no-referrer"
      />
      
      {/* Heavy obsidian/luxury gradient layers to give extreme contrast and depth */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#131313]/50 via-[#131313]/85 to-[#0e0e0e] z-0" />
      <div className="absolute inset-x-0 bottom-0 h-96 bg-gradient-to-t from-[#0e0e0e] to-transparent z-0" />
      
      {/* Interactive backlighting effect */}
      <div className="absolute w-[600px] h-[600px] rounded-full bg-white/[0.02] blur-[100px] pointer-events-none z-0" />

      {/* Main Content Showcase */}
      <div className="relative z-10 flex flex-col items-center justify-center text-center px-6 max-w-4xl mx-auto pt-20">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.2, ease: [0.25, 1, 0.5, 1] }}
          className="flex flex-col items-center"
        >
          {/* Subtle Accent Card label */}
          <span className="text-tertiary tracking-[0.4em] font-label-caps text-[10px] md:text-sm mb-6 block drop-shadow">
            HAUTE COUTURE SHOWCASE
          </span>

          {/* Huge Display Typographic Title */}
          <h1 className="font-display text-5xl sm:text-7xl md:text-9xl tracking-tighter text-[#e5e2e1] uppercase leading-none select-none drop-shadow-2xl">
            ATELIER
          </h1>

          <div className="w-16 h-[1px] bg-tertiary/60 my-8 shadow-[0_0_8px_#e9c349]" />

          {/* Event subtitle */}
          <p className="font-label-caps text-on-surface-variant text-[11px] md:text-sm mb-12 tracking-[0.3em] uppercase max-w-xl leading-relaxed">
            LUSAKA | FALL WINTER 2026 | CIELA RESORT
          </p>

          {/* Golden/Glass luxury action button */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <button
              onClick={onBuyTickets}
              className="relative px-12 py-5 bg-[#e5e2e1]/5 backdrop-blur-md border border-white/20 hover:border-tertiary text-white font-label-caps tracking-[0.25em] transition-all duration-500 ease-out cursor-pointer hover:shadow-[0_0_30px_rgba(233,195,73,0.15)] hover:bg-[#131313]/40 group"
            >
              {/* Inner subtle glow */}
              <span className="absolute inset-0 bg-gradient-to-r from-tertiary/0 via-tertiary/5 to-tertiary/0 opacity-0 group-hover:opacity-100 transition-opacity duration-1000" />
              <span className="relative z-10 group-hover:text-tertiary transition-colors">Buy Tickets</span>
            </button>
            
            {onExploreMore && (
              <button
                onClick={onExploreMore}
                className="px-8 py-5 text-on-surface-variant hover:text-white font-label-caps tracking-[0.2em] transition-all duration-300 cursor-pointer"
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
          <ArrowDown className="w-4 h-4 text-tertiary" />
        </motion.div>
      </motion.div>
    </div>
  );
}
