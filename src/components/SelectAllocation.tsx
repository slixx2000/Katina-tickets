import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Check, X, Sparkles, Shield, Trophy, ChevronDown, ChevronUp } from 'lucide-react';
import { TicketType, TicketPackage } from '../types';

interface SelectAllocationProps {
  packages: TicketPackage[];
  onSelect: (ticketType: TicketType) => void;
}

export default function SelectAllocation({ packages, onSelect }: SelectAllocationProps) {
  const [expandedId, setExpandedId] = useState<TicketType | 'front_row' | null>(null);

  const bgImage = "https://lh3.googleusercontent.com/aida-public/AB6AXuC5rJnXp129X8QLL72N1k9Y24Jh1rWNSMHNpzaIUw6uizbyTQjgFZf51kg1COw7JcqMejqnvL4FruJroIFV57V1sfJ2r-i-MOJF9ZvSkFdw3FSNizL5Cixws8AzxV88I2-s310eKF-IRRyF4k4xCG9jwMGiGzMJTStlIa0LLU1XRcnLgYD1gqiuDf-wL2WtmM0xAM7QAu0ZTqOxtXvjh-kqAwesscAB2HRkYSTkwXpTsa5hvmUVvAaAwIdG_yCVLEKbtLFZZa4Lje0f";

  const toggleExpand = (id: TicketType, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedId(expandedId === id ? null : id);
  };

  return (
    <div className="relative min-h-screen pt-32 pb-24 px-6 md:px-20 overflow-hidden flex flex-col justify-center items-center">
      {/* Background Texture and Luxury folded silk effect */}
      <div 
        className="fixed inset-0 z-0 bg-cover bg-center opacity-15 pointer-events-none"
        style={{ backgroundImage: `url(${bgImage})` }}
        referrerPolicy="no-referrer"
      />
      
      {/* Dynamic ambient radial gradients to feel exceptionally moody */}
      <div className="fixed inset-0 z-0 pointer-events-none bg-[radial-gradient(circle_at_50%_0%,rgba(233,195,73,0.04)_0%,transparent_75%)]" />

      <div className="relative z-10 w-full max-w-6xl mx-auto flex flex-col items-center">
        {/* Header Section */}
        <div className="text-center mb-16 md:mb-20 max-w-3xl">
          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8 }}
            className="font-label-caps text-tertiary tracking-[0.3em] mb-3 text-xs"
          >
            FW24 PREMIERE ACCESS
          </motion.p>
          <motion.h1 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, ease: [0.25, 1, 0.5, 1] }}
            className="font-display text-4xl sm:text-6xl md:text-7xl text-[#e5e2e1] mb-6 tracking-tight leading-none"
          >
            SELECT ALLOCATION
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3, duration: 1 }}
            className="font-body-md text-on-surface-variant max-w-2xl mx-auto leading-relaxed text-sm md:text-base"
          >
            Secure your attendance. Due to the intimate and elite nature of the atelier, seating arrangements and ticketing availability are strictly regulated and limited.
          </motion.p>
        </div>

        {/* Ticket Cards Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 md:gap-10 w-full">
          {packages.map((pkg, idx) => {
            const isVip = pkg.id === 'vip';
            const isUltra = pkg.price === 2500;
            const isExpanded = expandedId === pkg.id;

            return (
              <motion.article
                key={pkg.id}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: idx * 0.15 }}
                tabIndex={0}
                onClick={() => onSelect(pkg.id)}
                className={`relative group rounded-xl p-8 md:p-10 cursor-pointer outline-none border transition-all duration-700 backdrop-blur-3xl flex flex-col justify-between ${
                  isUltra 
                    ? 'border-[#e9c349]/30 bg-[#e9c349]/[0.02] hover:bg-[#e9c349]/[0.05] hover:border-[#e9c349]/50 hover:shadow-[0_0_50px_rgba(233,195,73,0.1)]'
                    : isVip
                    ? 'border-white/10 bg-white/[0.04] hover:bg-white/[0.07] hover:border-white/30 hover:shadow-[0_0_45px_rgba(255,255,255,0.06)]'
                    : 'border-white/5 bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/15'
                }`}
              >
                {/* Highlight top border gradient lines */}
                <div className={`absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent ${
                  isUltra ? 'via-tertiary/60' : isVip ? 'via-primary/50' : 'via-white/10'
                } to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-1000`} />

                {/* Ambient glow decoration backlights */}
                {isUltra && (
                  <div className="absolute top-10 right-0 w-24 h-24 bg-tertiary/10 blur-[40px] rounded-full pointer-events-none opacity-50 group-hover:opacity-100 transition-opacity duration-1000" />
                )}

                <div>
                  {/* Card Header */}
                  <div className="mb-8 relative z-10">
                    <div className="flex justify-between items-start mb-4">
                      <h2 className={`font-label-caps text-[11px] md:text-xs tracking-[0.25em] flex items-center gap-2 ${
                        isUltra ? 'text-tertiary font-bold' : 'text-on-surface-variant'
                      }`}>
                        {isUltra && <Trophy className="w-3.5 h-3.5 text-tertiary" />}
                        {isVip && <Sparkles className="w-3.5 h-3.5 text-primary" />}
                        {!isVip && !isUltra && <Shield className="w-3.5 h-3.5 text-on-surface-variant/40" />}
                        {pkg.name}
                      </h2>
                      {isUltra && (
                        <span className="bg-tertiary/10 border border-tertiary/30 text-tertiary font-label-caps text-[9px] px-2.5 py-0.5 rounded-none tracking-widest">
                          Elite Front Row
                        </span>
                      )}
                    </div>

                    <div className="flex items-baseline gap-1 mt-2">
                      <span className="text-xs text-tertiary tracking-widest uppercase font-label-caps mr-1">
                        K
                      </span>
                      <span className="text-3xl sm:text-4xl md:text-5xl font-display text-white">
                        {pkg.price.toLocaleString()}
                      </span>
                      <span className="text-[10px] text-on-surface-variant tracking-widest uppercase font-label-caps ml-1">
                        ZMW
                      </span>
                    </div>

                    <p className={`font-label-caps text-[9px] mt-2 tracking-widest uppercase ${
                      isUltra ? 'text-tertiary/60' : 'text-on-surface-variant/40'
                    }`}>
                      {pkg.remaining} ALLOWED CONCESSIONS REMAINING
                    </p>
                  </div>

                  {/* Aesthetic divider line */}
                  <div className={`w-full h-[0.5px] mb-6 transition-colors duration-500 ${
                    isUltra ? 'bg-tertiary/20 group-hover:bg-tertiary/40' : 'bg-white/10 group-hover:bg-white/20'
                  }`} />

                  {/* Core Description */}
                  <p className="font-body-md text-sm text-on-surface-variant/80 mb-6 group-hover:text-white transition-colors">
                    {pkg.description}
                  </p>

                  {/* Perks Accordion Toggle */}
                  <div className="mb-8">
                    <button
                      onClick={(e) => toggleExpand(pkg.id, e)}
                      className="flex items-center gap-1.5 text-xs font-label-caps tracking-widest text-primary/70 hover:text-white hover:opacity-100 transition-all uppercase py-2 cursor-pointer"
                    >
                      <span>{isExpanded ? 'Hide Specs' : 'Expand Details'}</span>
                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-tertiary" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>

                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.4, ease: [0.25, 1, 0.5, 1] }}
                          className="overflow-hidden mt-4"
                        >
                          <ul className="flex flex-col gap-3 py-2 border-t border-white/5">
                            {pkg.benefits.map((benefit, bIdx) => {
                              const isForbidden = benefit.toLowerCase().includes('(no)') || benefit.toLowerCase().includes('not included');
                              const displayBenefit = benefit.replace(/\s*\([^)]*\)/, '');

                              return (
                                <li 
                                  key={bIdx} 
                                  className={`flex items-center gap-2.5 text-xs ${
                                    isForbidden ? 'text-on-surface-variant/30 line-through' : 'text-on-surface/90'
                                  }`}
                                >
                                  {isForbidden ? (
                                    <X className="w-3.5 h-3.5 text-red-500/50 shrink-0" />
                                  ) : (
                                    <Check className={`w-3.5 h-3.5 shrink-0 ${
                                      isUltra ? 'text-tertiary' : 'text-white'
                                    }`} />
                                  )}
                                  <span className="tracking-wide">{displayBenefit}</span>
                                </li>
                              );
                            })}
                          </ul>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                {/* Select button */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect(pkg.id);
                  }}
                  className={`w-full py-4 text-center border font-label-caps text-[10px] md:text-xs tracking-[0.2em] transition-all duration-500 uppercase cursor-pointer rounded-none font-semibold ${
                    isUltra
                      ? 'bg-tertiary text-on-tertiary border-transparent hover:bg-transparent hover:border-tertiary hover:text-tertiary'
                      : 'bg-[#e5e2e1] text-[#0e0e0e] border-transparent hover:bg-transparent hover:border-white hover:text-white'
                  }`}
                >
                  Select {pkg.name.split(' ')[0]}
                </button>
              </motion.article>
            );
          })}
        </div>
      </div>
    </div>
  );
}
