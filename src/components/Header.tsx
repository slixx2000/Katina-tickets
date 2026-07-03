import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Menu, ArrowLeft, Sun, Moon, Ticket, X } from 'lucide-react';
import { SignInButton, SignUpButton, Show, UserButton } from '@clerk/react';
import { ScreenType } from '../types';

interface HeaderProps {
  currentScreen: ScreenType;
  onNavigate: (screen: ScreenType) => void;
  onBack?: () => void;
  isDarkMode: boolean;
  onToggleTheme: () => void;
  showAdminPortal?: boolean;
}

export default function Header({ 
  currentScreen, 
  onNavigate, 
  onBack, 
  isDarkMode,
  onToggleTheme,
  showAdminPortal = false,
}: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 w-full bg-[var(--header-bg)] backdrop-blur-md border-b border-[color:var(--header-border)] py-4 px-6 md:px-20 transition-all duration-300 shadow-sm">
      <div className="max-w-7xl mx-auto flex justify-between items-center relative">
        {/* Left Side: Back Button OR Interactive Hamburger Menu Toggle */}
        {onBack ? (
          <button
            onClick={() => {
              setMenuOpen(false);
              onBack();
            }}
            className="group flex items-center gap-2 text-[var(--theme-white-part-text-muted)] hover:text-[var(--app-cta-hover)] transition-colors cursor-pointer py-1"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform text-[var(--app-cta-hover)]" />
            <span className="font-label-caps text-[10px] md:text-xs text-[var(--theme-white-part-text)]">Return</span>
          </button>
        ) : (
          <div className="flex items-center">
            {/* Interactive Hamburger button */}
            <button 
              onClick={() => setMenuOpen(prev => !prev)}
              className="group flex items-center justify-center text-[var(--theme-white-part-text-muted)] hover:text-[var(--app-cta-hover)] transition-colors cursor-pointer p-2 bg-[color:var(--theme-white-part-text)]/5 border border-[color:var(--theme-white-part-border)] hover:border-[var(--app-cta-hover)] rounded-none z-50 animate-fade-in"
              aria-label="Toggle Navigation Menu"
            >
              {menuOpen ? (
                <X className="w-5 h-5 text-[var(--app-cta-hover)] transition-transform duration-300" />
              ) : (
                <Menu className="w-5 h-5 text-[var(--app-cta-hover)] group-hover:rotate-90 transition-transform duration-300" />
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
          className="font-display text-lg sm:text-2xl md:text-3xl tracking-[0.2em] text-[var(--app-text-soft)] font-bold uppercase text-center cursor-pointer select-none hover:opacity-80 transition-opacity"
        >
          KATINA BASIL
        </div>

        {/* Right Action: Auth Controls */}
        <div className="flex items-center gap-4 md:gap-5">
          <Show when="signed-out">
            <SignInButton mode="modal">
              <button className="px-4 py-2 text-[10px] md:text-xs tracking-[0.16em] font-bold uppercase border border-[color:var(--theme-white-part-border)] text-[var(--theme-white-part-text)] hover:bg-[color:var(--app-cta-hover)]/10 transition-colors">
                Sign In
              </button>
            </SignInButton>
            <SignUpButton mode="modal">
              <button className="hidden md:inline-block px-4 py-2 text-[10px] md:text-xs tracking-[0.16em] font-bold uppercase bg-[var(--app-cta-hover)] text-[var(--app-on-cta)] border border-[var(--app-cta-hover)] hover:opacity-90 transition-opacity">
                Sign Up
              </button>
            </SignUpButton>
          </Show>

          <Show when="signed-in">
            <div className="scale-95 md:scale-105 origin-right">
              <UserButton>
                <UserButton.MenuItems>
                  <UserButton.Action
                    label="View My Tickets"
                    labelIcon={<Ticket className="w-4 h-4" />}
                    onClick={() => onNavigate('my-tickets')}
                  />
                  <UserButton.Action label="manageAccount" />
                  <UserButton.Action label="signOut" />
                </UserButton.MenuItems>
              </UserButton>
            </div>
          </Show>
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
            className="absolute top-full left-6 md:left-20 mt-2 w-72 bg-[var(--theme-white-part-bg)] border border-[color:var(--theme-white-part-border)] p-6 shadow-2xl z-50 text-[var(--theme-white-part-text)] rounded-none font-sans"
          >
            <div className="flex flex-col gap-6">
              {showAdminPortal && (
                <div>
                  <span className="font-display text-[9px] tracking-[0.25em] font-bold uppercase text-[var(--theme-white-part-text-muted)] block mb-3">
                    SYSTEM PORTAL
                  </span>

                  <div className="bg-[color:var(--theme-white-part-text)]/5 p-0.5 border border-[color:var(--theme-white-part-border)] rounded-none">
                    <button
                      onClick={() => {
                        onNavigate('admin');
                        setMenuOpen(false);
                      }}
                      className={`w-full text-center py-2.5 font-label-caps text-[10px] tracking-widest uppercase transition-all duration-300 font-bold ${
                        currentScreen === 'admin'
                          ? 'bg-[var(--app-cta-hover)] text-[var(--app-on-cta)]'
                          : 'text-[var(--theme-white-part-text)] hover:bg-[color:var(--app-cta-hover)]/10'
                      }`}
                    >
                      ADMIN
                    </button>
                  </div>
                </div>
              )}

              {/* Section 2: Display Settings */}
              <div>
                <span className="font-display text-[9px] tracking-[0.25em] font-bold uppercase text-[var(--theme-white-part-text-muted)] block mb-3">
                  VISUAL INTERFACE
                </span>
                
                <div className="flex items-center justify-between py-2 border-t border-b border-[color:var(--theme-white-part-border)] hover:bg-[color:var(--theme-white-part-text)]/5 px-2 transition-colors duration-300 font-sans">
                  <span className="text-[10px] font-bold tracking-widest uppercase text-[var(--theme-white-part-text)] flex items-center gap-2 select-none">
                    {isDarkMode ? (
                      <>
                        <Moon className="w-3.5 h-3.5 text-[var(--app-cta-hover)]" />
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
                    className="relative w-12 h-6 bg-[color:var(--theme-white-part-text)]/20 rounded-full transition-colors duration-300 focus:outline-none cursor-pointer"
                    aria-label="Toggle Dark Mode"
                  >
                    <div 
                      className={`absolute top-1 left-1 bg-[var(--app-cta-hover)] w-4 h-4 rounded-full transition-transform duration-300 flex items-center justify-center ${
                        isDarkMode ? 'translate-x-6' : ''
                      }`}
                    />
                  </button>
                </div>
              </div>
              
              <div className="text-[9px] text-[var(--theme-white-part-text-muted)] text-center tracking-widest font-semibold uppercase leading-tight font-sans">
                Active Preset: {isDarkMode ? 'MIDNIGHT COAL' : 'IVORY SATIN'}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
