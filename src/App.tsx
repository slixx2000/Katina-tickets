/**
 * ATELIER COUTURE - Luxury Ticket Concierge & Event Management Console
 */
import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';

// Core Components Imports
import Header from './components/Header';
import LandingHero from './components/LandingHero';
import SelectAllocation from './components/SelectAllocation';
import GuestRegistration from './components/GuestRegistration';
import SecureCheckout from './components/SecureCheckout';
import ReservationConfirmed from './components/ReservationConfirmed';
import AdminDashboard from './components/AdminDashboard';
import Footer from './components/Footer';
import AdminLogin from './components/AdminLogin';
import TermsAndConditionsModal from './components/TermsAndConditionsModal';
import { supabase } from './lib/supabaseClient';
import { canEnterAdminConsole, clearServerSession, fetchServerSession, type AppSessionUser } from './auth/session';

// Types and schemas definition
import { ScreenType, TicketType, TicketPackage, RegistrationData, PaymentData, AdminStats, Transaction } from './types';

// Static / Initial interactive states definition
const INITIAL_PACKAGES: TicketPackage[] = [
  {
    id: 'ordinary',
    name: 'Ordinary Ticket',
    price: 725,
    remaining: 600,
    totalCap: 600,
    description: 'General access package for the Fashion Show with curated hospitality and allocated seating.',
    benefits: [
      'Fashion show access',
      'Red carpet experience',
      'Reserved access to runway pieces',
      'Complimentary drinks and snacks',
      'Allocated seating',
      'Meet and greet',
      'Live music',
      'Gift bags'
    ]
  },
  {
    id: 'vip',
    name: 'Priority Ticket',
    price: 1250,
    remaining: 300,
    totalCap: 300,
    description: 'Priority package for enhanced runway access, front row seating, and backstage entry after the show.',
    benefits: [
      'Priority show access',
      'Red carpet experience',
      'Priority access to runway pieces',
      'Complimentary snacks and drinks',
      'Front row seating',
      'Meet and greet',
      'Live music',
      'Priority gift bags',
      'After-show backstage access'
    ]
  }
];

const INITIAL_STATS: AdminStats = {
  ticketsSold: 7,
  ticketsTotal: 900,
  totalRevenue: 0,
  remainingInventory: {
    ordinary: 600,
    vip: 300
  },
  transactions: [
    {
      id: 'AT-817-XQ',
      fullName: 'Eleanor Vance',
      initials: 'EV',
      ticketType: 'vip',
      quantity: 2,
      amount: 2500,
      timestamp: '2 MINS AGO',
      status: 'completed',
      seatDetails: ['Row A, 12', 'Row A, 13']
    },
    {
      id: 'AT-324-LM',
      fullName: 'Julian Ross',
      initials: 'JR',
      ticketType: 'ordinary',
      quantity: 1,
      amount: 725,
      timestamp: '15 MINS AGO',
      status: 'completed',
      seatDetails: ['Row C, 18']
    },
    {
      id: 'AT-905-ZW',
      fullName: 'Aria Winters',
      initials: 'AW',
      ticketType: 'vip',
      quantity: 4,
      amount: 5000,
      timestamp: '1 HOUR AGO',
      status: 'completed',
      seatDetails: ['Row B, 1', 'Row B, 2', 'Row B, 3', 'Row B, 4']
    }
  ],
  chartsData: [
    { day: 'MON', count: 5, revenue: 3625 },
    { day: 'TUE', count: 8, revenue: 5800 },
    { day: 'WED', count: 3, revenue: 2175 },
    { day: 'THU', count: 12, revenue: 8700 },
    { day: 'FRI', count: 10, revenue: 7250 },
    { day: 'SAT', count: 16, revenue: 11600 },
    { day: 'SUN', count: 13, revenue: 9425 }
  ]
};

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<ScreenType>('landing');
  const [isDarkMode, setIsDarkMode] = useState<boolean>(false);
  const [currentUser, setCurrentUser] = useState<AppSessionUser | null>(null);
  
  // Custom Dynamic State Handlers
  const [packages, setPackages] = useState<TicketPackage[]>(INITIAL_PACKAGES);
  const [selectedPkgId, setSelectedPkgId] = useState<TicketType | null>(null);
  const [registrationData, setRegistrationData] = useState<RegistrationData | null>(null);
  const [paymentData, setPaymentData] = useState<PaymentData | null>(null);
  const [adminStats, setAdminStats] = useState<AdminStats>(INITIAL_STATS);

  // Bag indicator flag
  const hasItemsInBag = selectedPkgId !== null;

  // T&C agreement state — persisted in sessionStorage so accepted once per visit
  const [showTermsModal, setShowTermsModal] = useState<boolean>(false);
  const pendingNavAfterTerms = useRef<ScreenType | null>(null);

  const hasAcceptedTerms = (): boolean => {
    try { return sessionStorage.getItem('tc_accepted') === '1'; } catch { return false; }
  };

  const markTermsAccepted = () => {
    try { sessionStorage.setItem('tc_accepted', '1'); } catch { /* ignore */ }
  };

  // Intercept navigation that requires T&C acceptance
  const requestNavWithTerms = (screen: ScreenType) => {
    if (hasAcceptedTerms()) {
      setCurrentScreen(screen);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      pendingNavAfterTerms.current = screen;
      setShowTermsModal(true);
    }
  };

  const handleTermsAccept = () => {
    markTermsAccepted();
    setShowTermsModal(false);
    if (pendingNavAfterTerms.current) {
      setCurrentScreen(pendingNavAfterTerms.current);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      pendingNavAfterTerms.current = null;
    }
  };

  const handleTermsDecline = () => {
    setShowTermsModal(false);
    pendingNavAfterTerms.current = null;
  };

  useEffect(() => {
    let mounted = true;

    const syncSession = async () => {
      const user = await fetchServerSession();
      if (mounted) {
        setCurrentUser(user);
      }
    };

    const syncInventory = async () => {
      type InventoryItem = {
        ticketType: TicketType;
        price: number;
        remaining: number;
        totalCap: number;
      };

      try {
        const response = await fetch('/api/inventory');
        if (!response.ok) return;
        const payload = await response.json();
        if (!payload?.success || !Array.isArray(payload.items)) return;
        const items = payload.items as InventoryItem[];

        if (!mounted) return;

        const inventoryByType = new Map(
          items.map((item) => [item.ticketType, item]),
        );

        setPackages((prev) =>
          prev.map((pkg) => {
            const inventory = inventoryByType.get(pkg.id);
            if (!inventory) return pkg;
            return {
              ...pkg,
              price: inventory.price,
              remaining: inventory.remaining,
              totalCap: inventory.totalCap,
            };
          }),
        );
      } catch {
        // Keep local defaults when inventory endpoint is unavailable.
      }
    };

    void syncSession();
    void syncInventory();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
  }, [isDarkMode]);

  // Selections retrieve
  const activeSelectedPackage = packages.find(p => p.id === selectedPkgId) || packages[0];

  const handleSelectPackage = (id: TicketType) => {
    setSelectedPkgId(id);
    setCurrentScreen('registration');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleRegistrationSubmit = (data: RegistrationData) => {
    setRegistrationData(data);
    setCurrentScreen('checkout');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCheckoutSubmit = (data: PaymentData) => {
    setPaymentData(data);
    
    // Add real-time booked ticket registration to the admin metrics list!
    if (registrationData) {
      const uniqueId = data.reference;
      const nameInitials = registrationData.fullName
        .split(' ')
        .map(n => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase() || 'GT';

      const costPaid = activeSelectedPackage.price * registrationData.quantity;

      const newTransaction: Transaction = {
        id: uniqueId,
        fullName: registrationData.fullName,
        initials: nameInitials,
        ticketType: registrationData.ticketType,
        quantity: registrationData.quantity,
        amount: costPaid,
        timestamp: 'JUST NOW',
        status: data.status,
        seatDetails: Array.from({ length: registrationData.quantity }, (_, i) => `Row A, ${14 + i}`)
      };

      // Prepend to transaction analytics logs
      setAdminStats(prev => ({
        ...prev,
        ticketsSold: data.status === 'completed' ? prev.ticketsSold + registrationData.quantity : prev.ticketsSold,
        transactions: [newTransaction, ...prev.transactions]
      }));

      // Decrement availability counts
      setPackages(prev => prev.map(pkg => {
        if (pkg.id === registrationData.ticketType && data.status === 'completed') {
          return {
            ...pkg,
            remaining: Math.max(0, pkg.remaining - registrationData.quantity)
          };
        }
        return pkg;
      }));
    }

    setCurrentScreen('confirmed');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleBackNavigation = () => {
    if (currentScreen === 'select-allocation') {
      setCurrentScreen('landing');
    } else if (currentScreen === 'registration') {
      setCurrentScreen('select-allocation');
    } else if (currentScreen === 'checkout') {
      setCurrentScreen('registration');
    } else if (currentScreen === 'confirmed') {
      // Clear flow
      setSelectedPkgId(null);
      setRegistrationData(null);
      setPaymentData(null);
      setCurrentScreen('landing');
    } else if (currentScreen === 'admin') {
      setCurrentScreen('landing');
    }
  };

  const refreshCurrentUser = async () => {
    setCurrentUser(await fetchServerSession());
  };

  return (
    <div className="relative min-h-screen bg-[var(--app-canvas)] text-[var(--app-text)] selection:bg-[var(--app-cta-hover)] selection:text-[var(--app-on-cta)] flex flex-col justify-between overflow-x-hidden transition-all duration-500">
      
      {/* Absolute Dynamic Header Navigation Portal */}
      <Header 
        currentScreen={currentScreen} 
        onNavigate={(screen) => {
          setCurrentScreen(screen);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        onBack={
          ['select-allocation', 'registration', 'checkout', 'confirmed'].includes(currentScreen)
            ? handleBackNavigation
            : undefined
        }
        hasItemsInBag={hasItemsInBag}
        isDarkMode={isDarkMode}
        onToggleTheme={() => setIsDarkMode((prev: boolean) => !prev)}
      />

      {/* Terms & Conditions Modal — shown before first ticket navigation */}
      <TermsAndConditionsModal
        isOpen={showTermsModal}
        onAccept={handleTermsAccept}
        onDecline={handleTermsDecline}
      />

      {/* Primary Route Screen Containers */}
      <div className="flex-grow">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentScreen}
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.02 }}
            transition={{ duration: 0.5, ease: [0.25, 1, 0.5, 1] }}
          >
            {currentScreen === 'landing' && (
              <LandingHero 
                onBuyTickets={() => requestNavWithTerms('select-allocation')} 
                onExploreMore={() => {
                  const targetEl = document.getElementById('footer-brand');
                  if (targetEl) targetEl.scrollIntoView({ behavior: 'smooth' });
                }}
              />
            )}
            {currentScreen === 'select-allocation' && (
              <SelectAllocation 
                packages={packages.slice(0, 2)} 
                onSelect={handleSelectPackage} 
              />
            )}

            {currentScreen === 'registration' && (
              <GuestRegistration 
                selectedPackage={activeSelectedPackage} 
                onBack={handleBackNavigation} 
                onSubmit={handleRegistrationSubmit} 
              />
            )}

            {currentScreen === 'checkout' && registrationData && (
              <SecureCheckout 
                registrationData={registrationData} 
                selectedPackage={activeSelectedPackage} 
                onBack={handleBackNavigation} 
                onSubmit={handleCheckoutSubmit} 
              />
            )}

            {currentScreen === 'confirmed' && registrationData && paymentData && (
              <ReservationConfirmed 
                registrationData={registrationData} 
                selectedPackage={activeSelectedPackage} 
                paymentReference={paymentData.reference}
                paymentStatus={paymentData.status}
                onNavigateHome={() => {
                  setSelectedPkgId(null);
                  setRegistrationData(null);
                  setPaymentData(null);
                  setCurrentScreen('landing');
                }}
                onGoToAdmin={() => setCurrentScreen('admin')}
              />
            )}

            {currentScreen === 'admin' && (
              canEnterAdminConsole(currentUser) ? (
                <AdminDashboard 
                  stats={adminStats} 
                  packages={packages} 
                  currentUser={currentUser}
                  onBackToMain={() => setCurrentScreen('landing')}
                  onUpdateInventory={(updatedPkgs) => setPackages(updatedPkgs)}
                  onSessionRefresh={refreshCurrentUser}
                  onSignOut={async () => {
                    await clearServerSession();
                    setCurrentUser(null);
                    setCurrentScreen('landing');
                  }}
                />
              ) : (
                <AdminLogin onSuccess={() => {
                  void (async () => {
                    setCurrentUser(await fetchServerSession());
                    setCurrentScreen('admin');
                  })();
                }} />
              )
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Global Brand Footer component */}
      <div id="footer-brand">
        <Footer />
      </div>

    </div>
  );
}
