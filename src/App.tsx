/**
 * ATELIER COUTURE - Luxury Ticket Concierge & Event Management Console
 */
import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '@clerk/react';

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
import CustomerAuthGate from './components/CustomerAuthGate';
import MyTickets from './components/MyTickets';
import TicketsSoldOut from './components/TicketsSoldOut';
import PrivacyPolicyPage from './components/PrivacyPolicyPage';
import TermsAndConditionsPage from './components/TermsAndConditionsPage';
import CookiePolicyPage from './components/CookiePolicyPage';
import CookieConsentBanner from './components/CookieConsentBanner';
import { supabase } from './lib/supabaseClient';
import { canEnterAdminConsole, clearServerSession, fetchServerSession, type AppSessionUser } from './auth/session';

// Types and schemas definition
import { ScreenType, TicketType, TicketPackage, RegistrationData, PaymentData, AdminStats, CookieConsentPreference } from './types';

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
  ticketsSold: 0,
  ticketsTotal: 0,
  totalRevenue: 0,
  remainingInventory: {
    ordinary: 0,
    vip: 0
  },
  transactions: [],
  chartsData: []
};

export default function App() {
  const { isLoaded: isClerkAuthLoaded, isSignedIn: isClerkSignedIn, getToken } = useAuth();
  const [currentScreen, setCurrentScreen] = useState<ScreenType>('landing');
  const [isDarkMode, setIsDarkMode] = useState<boolean>(false);
  const [currentUser, setCurrentUser] = useState<AppSessionUser | null>(null);
  
  // Custom Dynamic State Handlers
  const [packages, setPackages] = useState<TicketPackage[]>(INITIAL_PACKAGES);
  const [selectedPkgId, setSelectedPkgId] = useState<TicketType | null>(null);
  const [pendingTicketType, setPendingTicketType] = useState<TicketType | null>(null);
  const [pendingPostAuthScreen, setPendingPostAuthScreen] = useState<ScreenType | null>(null);
  const [registrationData, setRegistrationData] = useState<RegistrationData | null>(null);
  const [paymentData, setPaymentData] = useState<PaymentData | null>(null);
  const [adminStats, setAdminStats] = useState<AdminStats>(INITIAL_STATS);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);
  const hasAuthenticatedCustomer = Boolean(currentUser);
  const isAdminVisible = canEnterAdminConsole(currentUser);
  const areTicketsSoldOut = packages.every((pkg) => pkg.remaining <= 0);
  const inactivityTimerRef = useRef<number | null>(null);

  const sessionIdleTimeoutMinutes = Number.parseInt(import.meta.env.VITE_SESSION_IDLE_TIMEOUT_MINUTES || '30', 10);
  const sessionIdleTimeoutMs = (Number.isFinite(sessionIdleTimeoutMinutes) && sessionIdleTimeoutMinutes > 0
    ? sessionIdleTimeoutMinutes
    : 30) * 60 * 1000;

  // T&C agreement state — persisted in sessionStorage so accepted once per visit
  const [showTermsModal, setShowTermsModal] = useState<boolean>(false);
  const [cookieConsent, setCookieConsent] = useState<CookieConsentPreference | null>(null);
  const pendingNavAfterTerms = useRef<ScreenType | null>(null);

  const LEGAL_PATH_TO_SCREEN: Record<string, ScreenType> = {
    '/privacy-policy': 'privacy-policy',
    '/terms-and-conditions': 'terms-and-conditions',
    '/cookie-policy': 'cookie-policy',
  };

  const SCREEN_TO_LEGAL_PATH: Partial<Record<ScreenType, string>> = {
    'privacy-policy': '/privacy-policy',
    'terms-and-conditions': '/terms-and-conditions',
    'cookie-policy': '/cookie-policy',
  };

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

  const exchangeSupabaseSession = async (): Promise<AppSessionUser | null> => {
    const sessionPayload = await supabase.auth.getSession();
    const accessToken = sessionPayload.data?.session?.access_token;
    if (!accessToken) {
      return null;
    }

    const exchangeResponse = await fetch('/api/session-auth/exchange', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ accessToken }),
    });

    if (!exchangeResponse.ok) {
      return null;
    }

    await supabase.auth.signOut({ scope: 'local' });
    return await fetchServerSession();
  };

  const exchangeClerkSession = async (): Promise<AppSessionUser | null> => {
    if (!isClerkSignedIn) {
      return null;
    }

    const clerkToken = await getToken();
    if (!clerkToken) {
      return null;
    }

    const exchangeResponse = await fetch('/api/session-auth/clerk-exchange', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ clerkToken }),
    });

    if (!exchangeResponse.ok) {
      return null;
    }

    return await fetchServerSession();
  };

  useEffect(() => {
    let mounted = true;

    const syncSession = async () => {
      let user = await fetchServerSession();

      if (!user) {
        user = await exchangeSupabaseSession();
      }

      if (!user && isClerkAuthLoaded && isClerkSignedIn) {
        user = await exchangeClerkSession();
      }

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
  }, [isClerkAuthLoaded, isClerkSignedIn, getToken]);

  useEffect(() => {
    if (isClerkSignedIn) {
      return;
    }

    // Keep Supabase-backed admin sessions intact, but terminate customer server session when Clerk signs out.
    if (currentUser?.role === 'CUSTOMER') {
      void clearServerSession();
      setCurrentUser(null);
    }
  }, [isClerkSignedIn, currentUser]);

  useEffect(() => {
    if (currentScreen !== 'customer-auth' || !hasAuthenticatedCustomer) {
      return;
    }

    if (pendingTicketType) {
      setSelectedPkgId(pendingTicketType);
      setPendingTicketType(null);
      setCurrentScreen('registration');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    if (pendingPostAuthScreen) {
      setCurrentScreen(pendingPostAuthScreen);
      setPendingPostAuthScreen(null);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setCurrentScreen('select-allocation');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [currentScreen, hasAuthenticatedCustomer, pendingTicketType, pendingPostAuthScreen]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
  }, [isDarkMode]);

  useEffect(() => {
    const path = window.location.pathname;
    const legalScreen = LEGAL_PATH_TO_SCREEN[path];
    if (legalScreen) {
      setCurrentScreen(legalScreen);
    }

    const handlePopState = () => {
      const nextPath = window.location.pathname;
      const nextLegalScreen = LEGAL_PATH_TO_SCREEN[nextPath];
      setCurrentScreen(nextLegalScreen || 'landing');
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  useEffect(() => {
    const legalPath = SCREEN_TO_LEGAL_PATH[currentScreen];
    if (legalPath) {
      if (window.location.pathname !== legalPath) {
        window.history.pushState({}, '', legalPath);
      }
      return;
    }

    if (window.location.pathname !== '/') {
      window.history.pushState({}, '', '/');
    }
  }, [currentScreen]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('cookie_consent_pref');
      if (!saved) {
        return;
      }

      const parsed = JSON.parse(saved) as CookieConsentPreference;
      if (parsed && parsed.essential === true) {
        setCookieConsent(parsed);
        (window as Window & { __katinaCookieConsent?: CookieConsentPreference }).__katinaCookieConsent = parsed;
      }
    } catch {
      // Ignore malformed persisted consent.
    }
  }, []);

  const handleCookieConsentSave = (value: CookieConsentPreference) => {
    setCookieConsent(value);
    try {
      localStorage.setItem('cookie_consent_pref', JSON.stringify(value));
    } catch {
      // Ignore local storage write failures.
    }

    (window as Window & { __katinaCookieConsent?: CookieConsentPreference }).__katinaCookieConsent = value;
  };

  useEffect(() => {
    if (!currentUser) {
      if (inactivityTimerRef.current !== null) {
        window.clearTimeout(inactivityTimerRef.current);
        inactivityTimerRef.current = null;
      }
      return;
    }

    const protectedScreens: ScreenType[] = ['select-allocation', 'registration', 'checkout', 'my-tickets'];

    const forceSessionTimeout = () => {
      void (async () => {
        await clearServerSession();
        setCurrentUser(null);
        setPendingTicketType(null);
        setPendingPostAuthScreen(null);
        if (protectedScreens.includes(currentScreen)) {
          setCurrentScreen('customer-auth');
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      })();
    };

    const resetTimer = () => {
      if (inactivityTimerRef.current !== null) {
        window.clearTimeout(inactivityTimerRef.current);
      }

      inactivityTimerRef.current = window.setTimeout(forceSessionTimeout, sessionIdleTimeoutMs);
    };

    const trackedEvents: Array<keyof WindowEventMap> = ['pointerdown', 'keydown', 'scroll', 'touchstart'];
    trackedEvents.forEach((eventName) => window.addEventListener(eventName, resetTimer, { passive: true }));
    resetTimer();

    return () => {
      trackedEvents.forEach((eventName) => window.removeEventListener(eventName, resetTimer));
      if (inactivityTimerRef.current !== null) {
        window.clearTimeout(inactivityTimerRef.current);
        inactivityTimerRef.current = null;
      }
    };
  }, [currentUser, currentScreen, sessionIdleTimeoutMs]);

  // Selections retrieve
  const activeSelectedPackage = packages.find(p => p.id === selectedPkgId) || packages[0];

  const handleSelectPackage = (id: TicketType) => {
    const selectedPackage = packages.find((pkg) => pkg.id === id);
    if (!selectedPackage || selectedPackage.remaining <= 0) {
      setCurrentScreen('sold-out');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    if (!hasAuthenticatedCustomer) {
      setPendingTicketType(id);
      setCurrentScreen('customer-auth');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setSelectedPkgId(id);
    setCurrentScreen('registration');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleRegistrationSubmit = (data: RegistrationData) => {
    if (!hasAuthenticatedCustomer) {
      setCurrentScreen('customer-auth');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setRegistrationData(data);
    setCurrentScreen('checkout');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCheckoutSubmit = (data: PaymentData) => {
    if (!hasAuthenticatedCustomer) {
      setCurrentScreen('customer-auth');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setPaymentData(data);

    setCurrentScreen('confirmed');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleBackNavigation = () => {
    if (currentScreen === 'select-allocation') {
      setCurrentScreen('landing');
    } else if (currentScreen === 'my-tickets') {
      setCurrentScreen('landing');
    } else if (currentScreen === 'customer-auth') {
      setCurrentScreen('select-allocation');
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

  const syncAdminStats = async () => {
    if (currentScreen !== 'admin' || !isAdminVisible) {
      return;
    }

    setAdminLoading(true);
    setAdminError(null);

    try {
      const response = await fetch('/api/admin/overview', {
        credentials: 'include',
        headers: {
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        setAdminError(
          response.status === 401
            ? 'Sign in as an admin to view dashboard analytics.'
            : response.status === 403
              ? 'You are not authorized to view this dashboard.'
              : 'Unable to load admin overview.'
        );
        return;
      }

      const payload = await response.json();
      if (!payload?.stats) {
        setAdminError('Admin overview returned an unexpected response.');
        return;
      }

      setAdminStats(payload.stats as AdminStats);
      setAdminError(null);
    } catch {
      setAdminError('Network error while loading admin analytics.');
    } finally {
      setAdminLoading(false);
    }
  };

  useEffect(() => {
    if (currentScreen !== 'admin' || !isAdminVisible) {
      return;
    }

    let mounted = true;
    void syncAdminStats();

    const intervalId = window.setInterval(() => {
      if (mounted) {
        void syncAdminStats();
      }
    }, 45000);

    return () => {
      mounted = false;
      window.clearInterval(intervalId);
    };
  }, [currentScreen, isAdminVisible]);

  const handleNavigate = (screen: ScreenType) => {
    if (screen === 'admin' && !isAdminVisible) {
      return;
    }

    if (screen === 'my-tickets' && !hasAuthenticatedCustomer) {
      setPendingPostAuthScreen('my-tickets');
      setCurrentScreen('customer-auth');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setCurrentScreen(screen);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const appCanvasClass = !isDarkMode && currentScreen === 'admin'
    ? 'bg-[#b8c58f]'
    : 'bg-[var(--app-canvas)]';

  return (
    <div className={`relative min-h-screen ${appCanvasClass} text-[var(--app-text)] selection:bg-[var(--app-cta-hover)] selection:text-[var(--app-on-cta)] flex flex-col justify-between overflow-x-hidden transition-all duration-500`}>
      
      {/* Absolute Dynamic Header Navigation Portal */}
      <Header 
        currentScreen={currentScreen} 
        onNavigate={handleNavigate}
        onBack={
          ['select-allocation', 'customer-auth', 'my-tickets', 'registration', 'checkout', 'confirmed'].includes(currentScreen)
            ? handleBackNavigation
            : undefined
        }
        isDarkMode={isDarkMode}
        onToggleTheme={() => setIsDarkMode((prev: boolean) => !prev)}
        showAdminPortal={isAdminVisible}
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
              areTicketsSoldOut ? (
                <TicketsSoldOut
                  onBackHome={() => setCurrentScreen('landing')}
                  onViewTickets={() => handleNavigate('my-tickets')}
                />
              ) : (
                <SelectAllocation
                  packages={packages.slice(0, 2)}
                  onSelect={handleSelectPackage}
                />
              )
            )}

            {currentScreen === 'sold-out' && (
              <TicketsSoldOut
                onBackHome={() => setCurrentScreen('landing')}
                onViewTickets={() => handleNavigate('my-tickets')}
              />
            )}

            {currentScreen === 'customer-auth' && (
              <CustomerAuthGate />
            )}

            {currentScreen === 'my-tickets' && (
              <MyTickets />
            )}

            {currentScreen === 'registration' && (
              <GuestRegistration 
                selectedPackage={activeSelectedPackage} 
                onSubmit={handleRegistrationSubmit} 
              />
            )}

            {currentScreen === 'checkout' && registrationData && (
              <SecureCheckout 
                registrationData={registrationData} 
                selectedPackage={activeSelectedPackage} 
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
                  isLoading={adminLoading}
                  error={adminError}
                  onRefresh={syncAdminStats}
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

            {currentScreen === 'privacy-policy' && <PrivacyPolicyPage />}
            {currentScreen === 'terms-and-conditions' && <TermsAndConditionsPage />}
            {currentScreen === 'cookie-policy' && <CookiePolicyPage />}
          </motion.div>
        </AnimatePresence>
      </div>

      <CookieConsentBanner consent={cookieConsent} onSave={handleCookieConsentSave} />

      {/* Global Brand Footer component */}
      <div id="footer-brand">
        <Footer onNavigate={handleNavigate} />
      </div>

    </div>
  );
}
