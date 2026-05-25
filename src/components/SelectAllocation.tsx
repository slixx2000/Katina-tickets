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
            className="font-label-caps text-[#F4F4F2] font-semibold tracking-[0.3em] mb-3 text-xs"
          >
            KATINA BASIL SHOWCASE ACCESS
          </motion.p>
          <motion.h1 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, ease: [0.25, 1, 0.5, 1] }}
            className="font-display text-4xl sm:text-6xl md:text-7xl text-[#F4F4F2] mb-6 tracking-tight leading-none"
          >
            SELECT ALLOCATION
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3, duration: 1 }}
            className="font-body-md text-[#F4F4F2]/80 max-w-2xl mx-auto leading-relaxed text-sm md:text-base"
          >
            Secure your attendance. Due to the intimate and elite nature of the showroom, seating arrangements and ticketing availability are strictly regulated and limited.
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
                className="relative group rounded-none p-8 md:p-10 cursor-pointer outline-none border border-[#6A6A57]/30 bg-[#4E1413] hover:shadow-[0_0_35px_rgba(78,20,19,0.35)] transition-all duration-500 flex flex-col justify-between text-[#F4F4F2]"
              >
                <div>
                  {/* Card Header */}
                  <div className="mb-8 relative z-10">
                    <div className="flex justify-between items-start mb-4">
                      <h2 className={`font-label-caps text-[11px] md:text-xs tracking-[0.25em] flex items-center gap-2 ${
                        isUltra ? 'text-[#F4F4F2] font-bold' : 'text-[#F4F4F2]/80'
                      }`}>
                        {isUltra && <Trophy className="w-3.5 h-3.5 text-[#F4F4F2]" />}
                        {isVip && <Sparkles className="w-3.5 h-3.5 text-[#F4F4F2]" />}
                        {!isVip && !isUltra && <Shield className="w-3.5 h-3.5 text-[#F4F4F2]/60" />}
                        {pkg.name}
                      </h2>
                      {isUltra && (
                        <span className="bg-[#F4F4F2]/10 border border-[#F4F4F2]/30 text-[#F4F4F2] font-label-caps text-[9px] px-2.5 py-0.5 rounded-none tracking-widest">
                          Elite Front Row
                        </span>
                      )}
                    </div>

                    <div className="flex items-baseline gap-1 mt-2">
                      <span className="text-xs text-[#F4F4F2]/80 tracking-widest uppercase font-label-caps mr-1">
                        K
                      </span>
                      <span className="text-3xl sm:text-4xl md:text-5xl font-display text-[#F4F4F2]">
                        {pkg.price.toLocaleString()}
                      </span>
                      <span className="text-[10px] text-[#F4F4F2]/70 tracking-widest uppercase font-label-caps ml-1">
                        ZMW
                      </span>
                    </div>

                    <p className={`font-label-caps text-[9px] mt-2 tracking-widest uppercase ${
                      isUltra ? 'text-[#F4F4F2]/70' : 'text-[#F4F4F2]/50'
                    }`}>
                      {pkg.remaining} ALLOWED CONCESSIONS REMAINING
                    </p>
                  </div>

                  {/* Aesthetic divider line */}
                  <div className="w-full h-[0.5px] mb-6 bg-[#F4F4F2]/20" />

                  {/* Core Description */}
                  <p className="font-body-md text-sm text-[#F4F4F2]/90 mb-6 group-hover:text-white transition-colors">
                    {pkg.description}
                  </p>

                  {/* Perks Accordion Toggle */}
                  <div className="mb-8">
                    <button
                      onClick={(e) => toggleExpand(pkg.id, e)}
                      className="flex items-center gap-1.5 text-xs font-label-caps tracking-widest text-[#F4F4F2] hover:text-[#F4F4F2]/85 transition-all uppercase py-2 cursor-pointer font-sans"
                    >
                      <span>{isExpanded ? 'Hide Specs' : 'Expand Details'}</span>
                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-[#F4F4F2]" /> : <ChevronDown className="w-3.5 h-3.5" />}
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
                          <ul className="flex flex-col gap-3 py-2 border-t border-[#F4F4F2]/20">
                            {pkg.benefits.map((benefit, bIdx) => {
                              const isForbidden = benefit.toLowerCase().includes('(no)') || benefit.toLowerCase().includes('not included');
                              const displayBenefit = benefit.replace(/\s*\([^)]*\)/, '');

                              return (
                                <li 
                                  key={bIdx} 
                                  className={`flex items-center gap-2.5 text-xs ${
                                    isForbidden ? 'text-[#F4F4F2]/40 line-through' : 'text-[#F4F4F2]/95'
                                  }`}
                                >
                                  {isForbidden ? (
                                    <X className="w-3.5 h-3.5 text-[#F4F4F2]/55 shrink-0" />
                                  ) : (
                                    <Check className="w-3.5 h-3.5 text-[#F4F4F2] shrink-0" />
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
                  className="w-full py-4 text-center border font-label-caps text-[10px] md:text-xs tracking-[0.2em] transition-all duration-500 uppercase cursor-pointer rounded-none font-bold bg-[#F4F4F2] text-[#4E1413] border-[#F4F4F2] hover:bg-[#F4F4F2]/90 hover:border-[#F4F4F2]"
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
