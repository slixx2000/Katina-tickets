import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Menu, ShoppingBag, ArrowLeft, Sun, Moon, X } from 'lucide-react';
import { ScreenType } from '../types';

interface HeaderProps {
  currentScreen: ScreenType;
  onNavigate: (screen: ScreenType) => void;
  onBack?: () => void;
  hasItemsInBag?: boolean;
  isDarkMode: boolean;
  onToggleTheme: () => void;
}

export default function Header({ 
  currentScreen, 
  onNavigate, 
  onBack, 
  hasItemsInBag,
  isDarkMode,
  onToggleTheme
}: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 w-full bg-[#F4F4F2] backdrop-blur-md border-b border-[#6A6A57]/30 py-4 px-6 md:px-20 transition-all duration-300 shadow-sm">
      <div className="max-w-7xl mx-auto flex justify-between items-center relative">
        {/* Left Side: Back Button OR Interactive Hamburger Menu Toggle */}
        {onBack ? (
          <button
            onClick={() => {
              setMenuOpen(false);
              onBack();
            }}
            className="group flex items-center gap-2 text-[#6A6A57] hover:text-[#4E1413] transition-colors cursor-pointer py-1"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform text-[#4E1413]" />
            <span className="font-label-caps text-[10px] md:text-xs text-[#2E2E2A]">Return</span>
          </button>
        ) : (
          <div className="flex items-center">
            {/* Interactive Hamburger button */}
            <button 
              onClick={() => setMenuOpen(prev => !prev)}
              className="group flex items-center justify-center text-[#6A6A57] hover:text-[#4E1413] transition-colors cursor-pointer p-2 bg-[#2E2E2A]/5 border border-[#6A6A57]/30 hover:border-[#4E1413] rounded-none z-50 animate-fade-in"
              aria-label="Toggle Navigation Menu"
            >
              {menuOpen ? (
                <X className="w-5 h-5 text-[#4E1413] transition-transform duration-300" />
              ) : (
                <Menu className="w-5 h-5 text-[#4E1413] group-hover:rotate-90 transition-transform duration-300" />
              )}
            </button>
          </div>
        )}

        {/* Center Logo */}
        <div 
          onClick={() => {
            setMenuOpen(false);
            onNavigate('landing');
          }}
          className="font-display text-lg sm:text-2xl md:text-3xl tracking-[0.2em] text-[#666E54] font-bold uppercase text-center cursor-pointer select-none hover:opacity-80 transition-opacity"
        >
          KATINA BASIL
        </div>

        {/* Right Action: Shopping Bag & Shortcut */}
        <div className="flex items-center gap-4">
          <button 
            className="relative p-2 text-[#6A6A57] hover:text-[#4E1413] transition-colors cursor-pointer"
            onClick={() => {
              setMenuOpen(false);
              onNavigate('select-allocation');
            }}
          >
            <ShoppingBag className="w-5 h-5 text-[#4E1413]" />
            {hasItemsInBag && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-[#4E1413] rounded-full shadow-[0_0_8px_rgba(78,20,19,0.8)]"></span>
            )}
          </button>
        </div>
      </div>

      {/* Floating Dynamic Menu Dropdown (Settings + Admin combined) */}
      <AnimatePresence>
        {menuOpen && !onBack && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            className="absolute top-full left-6 md:left-20 mt-2 w-72 bg-[#F4F4F2] border border-[#6A6A57]/30 p-6 shadow-2xl z-50 text-[#2E2E2A] rounded-none font-sans"
          >
            <div className="flex flex-col gap-6">
              {/* Section 1: Navigation / Admin Portal */}
              <div>
                <span className="font-display text-[9px] tracking-[0.25em] font-bold uppercase text-[#6A6A57] block mb-3">
                  SYSTEM PORTAL
                </span>
                
                <div className="bg-[#2E2E2A]/5 p-0.5 border border-[#6A6A57]/30 rounded-none">
                  <button
                    onClick={() => {
                      onNavigate('admin');
                      setMenuOpen(false);
                    }}
                    className={`w-full text-center py-2.5 font-label-caps text-[10px] tracking-widest uppercase transition-all duration-300 font-bold ${
                      currentScreen === 'admin'
                        ? 'bg-[#4E1413] text-white'
                        : 'text-[#2E2E2A] hover:bg-[#4E1413]/10'
                    }`}
                  >
                    ACCESS ADMIN DASHBOARD
                  </button>
                </div>
              </div>

              {/* Section 2: Display Settings */}
              <div>
                <span className="font-display text-[9px] tracking-[0.25em] font-bold uppercase text-[#6A6A57] block mb-3">
                  VISUAL INTERFACE
                </span>
                
                <div className="flex items-center justify-between py-2 border-t border-b border-[#6A6A57]/30 hover:bg-[#2E2E2A]/5 px-2 transition-colors duration-300 font-sans">
                  <span className="text-[10px] font-bold tracking-widest uppercase text-[#2E2E2A] flex items-center gap-2 select-none">
                    {isDarkMode ? (
                      <>
                        <Moon className="w-3.5 h-3.5 text-[#4E1413]" />
                        <span>DARK VISUALS</span>
                      </>
                    ) : (
                      <>
                        <Sun className="w-3.5 h-3.5 text-amber-600 animate-spin" style={{ animationDuration: '6s' }} />
                        <span>LIGHT VISUALS</span>
                      </>
                    )}
                  </span>
                  
                  {/* Premium Slide/Toggle switch */}
                  <button
                    onClick={() => {
                      onToggleTheme();
                    }}
                    className="relative w-12 h-6 bg-[#2E2E2A]/20 rounded-full transition-colors duration-300 focus:outline-none cursor-pointer"
                    aria-label="Toggle Dark Mode"
                  >
                    <div 
                      className={`absolute top-1 left-1 bg-[#4E1413] w-4 h-4 rounded-full transition-transform duration-300 flex items-center justify-center ${
                        isDarkMode ? 'translate-x-6' : ''
                      }`}
                    />
                  </button>
                </div>
              </div>
              
              <div className="text-[9px] text-[#6A6A57] text-center tracking-widest font-semibold uppercase leading-tight font-sans">
                Active Preset: {isDarkMode ? 'MIDNIGHT COAL' : 'IVORY SATIN'}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
