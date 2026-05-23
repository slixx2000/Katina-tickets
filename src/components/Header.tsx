import { Menu, ShoppingBag, ArrowLeft, ShieldAlert } from 'lucide-react';
import { ScreenType } from '../types';

interface HeaderProps {
  currentScreen: ScreenType;
  onNavigate: (screen: ScreenType) => void;
  onBack?: () => void;
  hasItemsInBag?: boolean;
}

export default function Header({ currentScreen, onNavigate, onBack, hasItemsInBag }: HeaderProps) {
  // Hide main header background/structure on transactional screens for a focused experience,
  // or return a minimalist unified header.
  const isMinimal = ['registration', 'checkout', 'confirmed'].includes(currentScreen);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 w-full bg-[#F4F4F2] backdrop-blur-md border-b border-[#6A6A57]/30 py-4 px-6 md:px-20 transition-all duration-300 shadow-sm">
      <div className="max-w-7xl mx-auto flex justify-between items-center relative">
        {/* Left Side: Back / Menu */}
        {onBack ? (
          <button
            onClick={onBack}
            className="group flex items-center gap-2 text-[#6A6A57] hover:text-[#4E1413] transition-colors cursor-pointer py-1"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform text-[#4E1413]" />
            <span className="font-label-caps text-[10px] md:text-xs text-[#2E2E2A]">Return</span>
          </button>
        ) : (
          <button 
            onClick={() => onNavigate('admin')}
            title="Access Admin Console"
            className="group flex items-center gap-2 text-[#6A6A57] hover:text-[#4E1413] transition-colors cursor-pointer py-1"
          >
            <Menu className="w-5 h-5 group-hover:rotate-90 transition-transform duration-300 text-[#4E1413]" />
            <span className="font-label-caps text-[10px] md:text-sm text-[#2E2E2A] group-hover:text-[#4E1413] transition-colors hidden sm:inline">Portal</span>
          </button>
        )}

        {/* Center Logo */}
        <div 
          onClick={() => onNavigate('landing')}
          className="font-display text-lg sm:text-2xl md:text-3xl tracking-[0.2em] text-[#2E2E2A] font-bold uppercase text-center cursor-pointer select-none hover:opacity-80 transition-opacity"
        >
          KATINA BASIL
        </div>

        {/* Right Action: Shopping Bag & Admin Portal Toggle */}
        <div className="flex items-center gap-4">
          <button 
            onClick={() => onNavigate(currentScreen === 'admin' ? 'landing' : 'admin')}
            className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-none tracking-widest text-[9px] font-label-caps transition-all duration-300 ${
              currentScreen === 'admin' 
                ? 'border-[#4E1413] text-[#4E1413] bg-[#4E1413]/10 hover:bg-[#4E1413] hover:text-white' 
                : 'border-[#6A6A57]/30 text-[#6A6A57] hover:text-[#4E1413] hover:border-[#4E1413]'
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{currentScreen === 'admin' ? 'Exit Admin' : 'Admin'}</span>
          </button>

          <button 
            className="relative p-1 text-[#6A6A57] hover:text-[#4E1413] transition-colors"
            onClick={() => onNavigate('select-allocation')}
          >
            <ShoppingBag className="w-5 h-5 text-[#4E1413]" />
            {hasItemsInBag && (
              <span className="absolute -top-1 -right-1 w-2 h-2 bg-[#4E1413] rounded-full shadow-[0_0_8px_rgba(78,20,19,0.8)]"></span>
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
