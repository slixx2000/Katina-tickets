/**
 * ATELIER COUTURE - Luxury Ticket Concierge & Event Management Console
 */
import { useState } from 'react';
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

// Types and schemas definition
import { ScreenType, TicketType, TicketPackage, RegistrationData, PaymentData, AdminStats, Transaction } from './types';

// Static / Initial interactive states definition
const INITIAL_PACKAGES: TicketPackage[] = [
  {
    id: 'ordinary',
    name: 'Ordinary Ticket',
    price: 250,
    remaining: 400,
    totalCap: 500,
    description: 'Standard access admittance pass to general show halls, featuring ambient acoustics and standard seating.',
    benefits: [
      'General Admission Seating placement',
      'Access to Main Hall Runway Installation',
      'Private Lounge & Elite Champagne (Not Included)'
    ]
  },
  {
    id: 'vip',
    name: 'VIP Case Pass',
    price: 850,
    remaining: 200,
    totalCap: 250,
    description: 'Highly exclusive backstage VIP passes complete with pre-reserved rows inside the historic venues.',
    benefits: [
      'Pre-allocated priority row placing',
      'Backstage Passes Post-Showcase',
      'Private Bar Lounge & elite refreshments access'
    ]
  },
  {
    id: 'front_row' as any, // Advanced Elite Option matching the exact $2,500 VIP Price inside screenshots for absolute fidelity!
    name: 'Front Row VIP Elite',
    price: 2500,
    remaining: 24,
    totalCap: 30,
    description: 'The ultimate luxury front-row atelier showcase ticket. Elite status coordinates including couture gifts.',
    benefits: [
      'Couture Front-Row VIP placement and seat assignment',
      'Backstage verified access credentials post-runway',
      'Private After-Party invitation with designers'
    ]
  }
];

const INITIAL_STATS: AdminStats = {
  ticketsSold: 412,
  ticketsTotal: 500,
  totalRevenue: 125000,
  remainingInventory: {
    ordinary: 400,
    vip: 200
  },
  transactions: [
    {
      id: 'AT-817-XQ',
      fullName: 'Eleanor Vance',
      initials: 'EV',
      ticketType: 'vip',
      quantity: 2,
      amount: 1700,
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
      amount: 250,
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
      amount: 3400,
      timestamp: '1 HOUR AGO',
      status: 'completed',
      seatDetails: ['Row B, 1', 'Row B, 2', 'Row B, 3', 'Row B, 4']
    }
  ],
  chartsData: [
    { day: 'MON', count: 5, revenue: 1250 },
    { day: 'TUE', count: 8, revenue: 2000 },
    { day: 'WED', count: 3, revenue: 750 },
    { day: 'THU', count: 12, revenue: 3000 },
    { day: 'FRI', count: 10, revenue: 4500 },
    { day: 'SAT', count: 16, revenue: 8500 },
    { day: 'SUN', count: 13, revenue: 11050 }
  ]
};

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<ScreenType>('landing');
  
  // Custom Dynamic State Handlers
  const [packages, setPackages] = useState<TicketPackage[]>(INITIAL_PACKAGES);
  const [selectedPkgId, setSelectedPkgId] = useState<TicketType | null>(null);
  const [registrationData, setRegistrationData] = useState<RegistrationData | null>(null);
  const [paymentData, setPaymentData] = useState<PaymentData | null>(null);
  const [adminStats, setAdminStats] = useState<AdminStats>(INITIAL_STATS);

  // Bag indicator flag
  const hasItemsInBag = selectedPkgId !== null;

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
      const uniqueId = `AT-${Math.floor(100 + Math.random() * 900)}-${Math.random().toString(36).substring(2, 4).toUpperCase()}`;
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
        status: 'completed',
        seatDetails: Array.from({ length: registrationData.quantity }, (_, i) => `Row A, ${14 + i}`)
      };

      // Prepend to transaction analytics logs
      setAdminStats(prev => ({
        ...prev,
        ticketsSold: prev.ticketsSold + registrationData.quantity,
        transactions: [newTransaction, ...prev.transactions]
      }));

      // Decrement availability counts
      setPackages(prev => prev.map(pkg => {
        if (pkg.id === registrationData.ticketType) {
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

  return (
    <div className="relative min-h-screen bg-[#666E54] text-[#F4F4F2] selection:bg-[#4E1413] selection:text-[#F4F4F2] flex flex-col justify-between overflow-x-hidden">
      
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
                onBuyTickets={() => setCurrentScreen('select-allocation')} 
                onExploreMore={() => {
                  const targetEl = document.getElementById('footer-brand');
                  if (targetEl) targetEl.scrollIntoView({ behavior: 'smooth' });
                }}
              />
            )}

            {currentScreen === 'select-allocation' && (
              <SelectAllocation 
                packages={packages} 
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

            {currentScreen === 'confirmed' && registrationData && (
              <ReservationConfirmed 
                registrationData={registrationData} 
                selectedPackage={activeSelectedPackage} 
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
              <AdminDashboard 
                stats={adminStats} 
                packages={packages} 
                onBackToMain={() => setCurrentScreen('landing')}
                onUpdateInventory={(updatedPkgs) => setPackages(updatedPkgs)}
              />
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
