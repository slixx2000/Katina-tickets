import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  BarChart, Download, Settings, Users, ArrowRight, Camera, 
  Scan, Check, Play, UserCheck, ShieldAlert, Award, TrendingUp, X, RefreshCw
} from 'lucide-react';
import { AdminStats, Transaction, TicketPackage, RegistrationData } from '../types';

interface AdminDashboardProps {
  stats: AdminStats;
  packages: TicketPackage[];
  onBackToMain: () => void;
  onUpdateInventory: (updatedPkgs: TicketPackage[]) => void;
}

export default function AdminDashboard({ stats, packages, onBackToMain, onUpdateInventory }: AdminDashboardProps) {
  const [activeTab, setActiveTab] = useState<'7D' | '30D' | 'YTD'>('30D');
  const [showGuestList, setShowGuestList] = useState(false);
  const [showInventoryCustomizer, setShowInventoryCustomizer] = useState(false);
  const [showStaffAssignments, setShowStaffAssignments] = useState(false);

  // Scanner Simulator States
  const [scannerActive, setScannerActive] = useState(true);
  const [scanningMessage, setScanningMessage] = useState('Camera Active. Waiting for ticket barcode...');
  const [scanResult, setScanResult] = useState<{ success: boolean; guestName: string; details: string; code: string } | null>(null);

  // Sound simulation (visibly flashes/alerts)
  const simulateScanSuccess = (guestName: string, details: string, code: string) => {
    setScanningMessage('Scanning barcode...');
    setTimeout(() => {
      // Create synthetic audio beep for elite realism!
      try {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(880, audioCtx.currentTime); // high pure beep
        gainNode.gain.setValueAtTime(0.05, audioCtx.currentTime);
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.12);
      } catch (e) {
        // Fallback silently if audio context blocked/unsupported
      }

      setScanResult({
        success: true,
        guestName,
        details,
        code
      });
      setScanningMessage('Access Granted.');
    }, 750);
  };

  const handleScanSimulationClick = () => {
    // Choose a random transaction or current user to scan
    const candidates = stats.transactions.filter(t => t.status === 'completed');
    if (candidates.length === 0) {
      alert('No guest candidates registered to simulate scans.');
      return;
    }
    const target = candidates[Math.floor(Math.random() * candidates.length)];
    simulateScanSuccess(
      target.fullName, 
      `${target.ticketType.toUpperCase()} - ${target.quantity} Ticket(s)`,
      target.id
    );
  };

  const resetScanner = () => {
    setScanResult(null);
    setScanningMessage('Camera Active. Waiting for ticket barcode...');
  };

  // Inventory adjustment temporary inputs
  const [ordinaryPrice, setOrdinaryPrice] = useState(packages.find(p => p.id === 'ordinary')?.price || 250);
  const [vipPrice, setVipPrice] = useState(packages.find(p => p.id === 'vip')?.price || 850);
  const [ordinaryCap, setOrdinaryCap] = useState(packages.find(p => p.id === 'ordinary')?.remaining || 400);
  const [vipCap, setVipCap] = useState(packages.find(p => p.id === 'vip')?.remaining || 200);

  const handleSaveInventory = () => {
    const updated = packages.map(pkg => {
      if (pkg.id === 'ordinary') {
        return { ...pkg, price: ordinaryPrice, remaining: ordinaryCap };
      }
      if (pkg.id === 'vip') {
        return { ...pkg, price: vipPrice, remaining: vipCap };
      }
      return pkg;
    });
    onUpdateInventory(updated);
    setShowInventoryCustomizer(false);
    alert('Ticketing allocations and price limits have been updated.');
  };

  const scannerBgImage = "https://lh3.googleusercontent.com/aida-public/AB6AXuD6lkHjiGOPPxAEP0_HFjywqRR1SAAroa_GodbyqNe-Bt6fV9A9BJIHRDRn1uMnJ7V-PRN-Mc0aONBq0oli8h21ZVEbk-gTKoWgEoas-8xvYm2qM5-tYOgF2eukZ_EP8_kWSOy6TYJffQZlNDD-i97705m9RaaAJHJYm0GcTG6CMhbWipaC2q0IjeyCsd-m-upJ3XSrb_S37ExRdPKCGVncUuQ2UxILp6v1PhxbR7ns4EVQRPNmsFiJz-uzSfL6UldnYccpH3oxarzt";

  // Dynamic calculations based on stats prop
  const activeTicketsSold = stats.ticketsSold;
  const activeRevenue = stats.transactions
    .filter(t => t.status === 'completed')
    .reduce((sum, current) => sum + current.amount, stats.totalRevenue);

  return (
    <div className="relative z-10 pt-32 pb-32 md:pb-24 px-6 md:px-20 max-w-7xl mx-auto w-full text-white font-sans min-h-screen">
      
      {/* Background radial soft light blur */}
      <div className="fixed top-0 left-1/4 w-[800px] h-[800px] bg-tertiary/10 rounded-full blur-[120px] pointer-events-none z-0"></div>

      {/* DASHBOARD TOP HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-end justify-between mb-12 gap-6 relative z-10 border-b border-white/5 pb-8">
        <div>
          <span className="font-label-caps text-[10px] text-tertiary tracking-[0.3em] block mb-2 uppercase">LIVE ANALYTICS CONSOLE</span>
          <h2 className="font-display text-4xl sm:text-5xl text-on-surface uppercase tracking-tight">
            Fall Collection Premiere
          </h2>
        </div>
        <div className="flex gap-4 font-sans text-xs">
          <button 
            type="button"
            onClick={() => alert(`Dynamic analytics stats for ${activeTab} exported successfully as CSV.`)}
            className="px-6 py-3 border border-white/20 hover:border-white hover:bg-white/5 bg-transparent rounded-none tracking-widest font-label-caps cursor-pointer transition-all duration-300"
          >
            EXPORT DATA
          </button>
          <button 
            type="button"
            onClick={() => setShowInventoryCustomizer(true)}
            className="px-6 py-3 bg-[#e5e2e1] hover:bg-white text-black hover:scale-105 rounded-none tracking-widest font-label-caps cursor-pointer transition-all duration-300 font-semibold"
          >
            MANAGE EVENT
          </button>
        </div>
      </div>

      {/* THREE Core KPI Widgets Grid Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12 relative z-10 font-sans">
        
        {/* KPI 1: TICKETS SOLD */}
        <div className="bg-white/[0.03] backdrop-blur-2xl border border-white/10 p-8 flex flex-col gap-4 group hover:bg-white/[0.05] hover:border-white/20 transition-all duration-500 rounded-none">
          <div className="flex justify-between items-start">
            <span className="font-label-caps text-[10px] text-on-surface-variant tracking-widest">TICKETS SOLD</span>
            <Users className="w-5 h-5 text-tertiary opacity-80" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl sm:text-5xl font-display text-white">{activeTicketsSold}</span>
            <span className="text-sm text-on-surface-variant font-medium">/ {stats.ticketsTotal}</span>
          </div>
          <div className="w-full h-[3px] bg-white/10 mt-2 rounded-full overflow-hidden">
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: `${(activeTicketsSold / stats.ticketsTotal) * 100}%` }}
              transition={{ duration: 1.5, ease: "easeOut" }}
              className="h-full bg-tertiary shadow-[0_0_8px_#e9c349]" 
            />
          </div>
        </div>

        {/* KPI 2: TOTAL REVENUE */}
        <div className="bg-white/[0.03] backdrop-blur-2xl border border-white/10 p-8 flex flex-col gap-4 group hover:bg-white/[0.05] hover:border-white/20 transition-all duration-500 rounded-none">
          <div className="flex justify-between items-start">
            <span className="font-label-caps text-[10px] text-on-surface-variant tracking-widest">TOTAL REVENUE</span>
            <Award className="w-5 h-5 text-tertiary opacity-80" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl sm:text-5xl font-display text-white">
              K{activeRevenue.toLocaleString()}
            </span>
          </div>
          <p className="font-body-md text-xs text-tertiary flex items-center gap-1 mt-2 tracking-wide font-semibold">
            <TrendingUp className="w-3.5 h-3.5 text-tertiary" /> +14.2% since yesterday
          </p>
        </div>

        {/* KPI 3: REMAINING SEATS */}
        <div className="bg-white/[0.03] backdrop-blur-2xl border border-white/10 p-8 flex flex-col gap-4 group hover:bg-white/[0.05] hover:border-white/20 transition-all duration-500 rounded-none">
          <div className="flex justify-between items-start">
            <span className="font-label-caps text-[10px] text-on-surface-variant tracking-widest">REMAINING INVENTORY</span>
            <Scan className="w-5 h-5 text-tertiary opacity-80" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl sm:text-5xl font-display text-white">
              {stats.ticketsTotal - activeTicketsSold}
            </span>
            <span className="text-xs text-on-surface-variant font-label-caps tracking-widest">SEATS LEFT</span>
          </div>
          <p className="font-body-md text-xs text-on-surface-variant mt-2 font-medium tracking-wide">
            VIP allocations limits remaining: {packages.find(p => p.id === 'vip')?.remaining || 200}
          </p>
        </div>

      </div>

      {/* MAIN TWO-COLUMN DASHBOARD CONTENT GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 relative z-10">
        
        {/* Left Side (span 8): Chart & Acquisitions list */}
        <div className="lg:col-span-8 flex flex-col gap-10">
          
          {/* Custom Animated SVG/CSS Bar Chart representation of ticket allocations rates */}
          <div className="bg-white/[0.02] backdrop-blur-2xl border border-white/10 p-8 min-h-[420px] rounded-none flex flex-col relative overflow-hidden">
            <div className="flex justify-between items-center mb-10 relative z-10 transition-all">
              <h3 className="font-headline-sm text-2xl text-on-surface uppercase">Live Acquisition Velocities</h3>
              
              {/* Timing filters selectors tabs */}
              <div className="flex gap-4 font-sans text-xs">
                {(['7D', '30D', 'YTD'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`font-label-caps text-[10px] tracking-widest cursor-pointer pb-0.5 border-b uppercase transition-all ${
                      activeTab === tab
                        ? 'text-tertiary border-tertiary font-bold'
                        : 'text-on-surface-variant border-transparent hover:text-white'
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Interactive SVG/CSS bar display blocks */}
            <div className="flex-grow flex items-end justify-between gap-3 relative z-10 opacity-75 min-h-[220px]">
              {stats.chartsData.map((dataObj, charIdx) => {
                // Adjust bar heights slightly depending on timing tab
                const multiFactor = activeTab === '7D' ? 1.4 : (activeTab === 'YTD' ? 0.7 : 1);
                const heightPercentage = Math.min(100, Math.max(15, dataObj.count * 15 * multiFactor));
                
                return (
                  <div key={charIdx} className="w-full flex flex-col items-center group/bar cursor-help">
                    {/* Tooltip on hover */}
                    <div className="absolute -top-1 px-3 py-1 bg-black text-[9px] font-mono tracking-widest text-tertiary border border-tertiary/30 rounded-none rotate-0 group-hover/bar:flex hidden flex-col items-center shadow-lg transition-all duration-300">
                      <span>{dataObj.count} Allocations</span>
                      <span className="text-white">K{dataObj.revenue.toLocaleString()}</span>
                    </div>

                    {/* Styled Cylinder bar with custom colorations */}
                    <div className="w-full bg-[#1c1b1b] rounded-t-sm h-48 sm:h-56 relative flex items-end border border-white/5">
                      <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: `${heightPercentage}%` }}
                        transition={{ duration: 1, delay: charIdx * 0.05, ease: "easeOut" }}
                        className={`w-full rounded-t-sm transition-all duration-300 ${
                          charIdx === stats.chartsData.length - 1
                            ? 'bg-tertiary shadow-[0_0_15px_rgba(233,195,73,0.5)] border-t border-white'
                            : 'bg-white/20 group-hover/bar:bg-tertiary/50'
                        }`}
                      />
                    </div>
                    
                    {/* Label */}
                    <span className="font-mono text-[9px] sm:text-[10px] text-on-surface-variant/50 group-hover/bar:text-tertiary transition-colors mt-3">
                      {dataObj.day}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Transactions List */}
          <div className="flex flex-col gap-0 font-sans">
            <h3 className="font-label-caps text-[11px] text-on-surface-variant mb-4 tracking-widest">
              RECENT BOOKING REGISTRY
            </h3>
            
            <div className="divide-y divide-white/5 border border-white/10 bg-white/[0.01]">
              {stats.transactions.map((trObj, idx) => {
                const initBg = idx % 3 === 0 ? 'bg-tertiary/10 text-tertiary' : idx % 3 === 1 ? 'bg-white/10 text-white' : 'bg-primary-fixed-dim/20 text-[#ffe088]';

                return (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: idx * 0.1 }}
                    key={trObj.id} 
                    className="flex items-center justify-between py-5 px-6 hover:bg-white/[0.03] transition-colors duration-300 cursor-pointer group"
                  >
                    <div className="flex items-center gap-4 sm:gap-6">
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center border border-white/10 font-bold shrink-0 text-sm ${initBg}`}>
                        {trObj.initials}
                      </div>
                      <div>
                        <h4 className="font-headline-sm text-lg sm:text-xl text-on-surface group-hover:text-tertiary transition-colors leading-tight">
                          {trObj.fullName}
                        </h4>
                        <p className="text-xs text-[#c4c7c7] font-medium font-sans">
                          {trObj.ticketType.toUpperCase()} Tier • {trObj.quantity} Ticket(s)
                        </p>
                      </div>
                    </div>

                    <div className="text-right">
                      <p className="text-base sm:text-lg text-white font-bold font-mono">
                        K{trObj.amount.toLocaleString()}
                      </p>
                      <p className="font-label-caps text-[9px] text-[#8e9192] tracking-wider mt-0.5">
                        {trObj.timestamp}
                      </p>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>

        </div>

        {/* Right Side (span 4): Scanner simulator and controllers */}
        <div className="lg:col-span-4 flex flex-col gap-8">
          
          {/* QR Entry Scanner Simulation Module layout */}
          <div className="bg-white/[0.02] backdrop-blur-3xl border border-white/25 p-1.5 flex flex-col rounded-none group select-none">
            
            {/* Viewfinder background */}
            <div className="relative aspect-square w-full bg-[#0e0e0e] overflow-hidden flex items-center justify-center">
              <img
                alt="Scanner atmospheric viewfinder background"
                src={scannerBgImage}
                className="absolute inset-0 w-full h-full object-cover opacity-25 grayscale mix-blend-screen"
                referrerPolicy="no-referrer"
              />
              
              {/* Viewfinder Scanning Grid overlay line sweep */}
              <div className="absolute inset-8 border border-white/20 flex flex-col justify-between p-1">
                <div className="flex justify-between w-full">
                  <div className="w-8 h-8 border-t-2 border-l-2 border-tertiary"></div>
                  <div className="w-8 h-8 border-t-2 border-r-2 border-tertiary"></div>
                </div>

                {/* Laser Sweep Beam line animation */}
                <div className="w-full h-[1px] bg-tertiary/80 shadow-[0_0_12px_#e9c349] absolute left-0 top-1/2 -translate-y-1/2 animate-bounce" />

                <div className="flex justify-between w-full">
                  <div className="w-8 h-8 border-b-2 border-l-2 border-tertiary"></div>
                  <div className="w-8 h-8 border-b-2 border-r-2 border-tertiary"></div>
                </div>
              </div>

              {/* Scan result popup card */}
              <AnimatePresence>
                {scanResult && (
                  <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.8, opacity: 0 }}
                    className="absolute inset-6 bg-[#0e0e0e]/95 backdrop-blur-md border border-tertiary/40 flex flex-col items-center justify-center text-center p-6 z-20 shadow-2xl"
                  >
                    <div className="w-12 h-12 rounded-full bg-green-500/10 border border-green-500/30 flex items-center justify-center mb-3">
                      <Check className="w-6 h-6 text-green-400" />
                    </div>
                    <span className="font-label-caps text-[9px] text-green-400 tracking-[0.2em] mb-1">ACCESS GRANTED</span>
                    <h4 className="font-headline-sm text-lg text-white mb-1 uppercase">{scanResult.guestName}</h4>
                    <p className="text-[10px] text-on-surface-variant font-sans mb-1">{scanResult.details}</p>
                    <p className="text-[9px] text-on-surface-variant/40 font-mono mb-4">ID: {scanResult.code}</p>
                    
                    <button
                      type="button"
                      onClick={resetScanner}
                      className="px-4 py-2 border border-white/10 hover:border-white text-[9px] font-label-caps tracking-widest text-[#e5e2e1] hover:bg-white/5 rounded-none cursor-pointer"
                    >
                      Scan Next
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Controller Scanner Details Action below */}
            <div className="p-6 flex justify-between items-center text-sans bg-[#0e0e0e]/30">
              <div>
                <h4 className="font-label-caps text-[10px] text-on-surface tracking-widest leading-none mb-1.5">ENTRY BARCODE SCANNER</h4>
                <p className={`text-[11px] font-sans ${scanResult ? 'text-green-400' : 'text-on-surface-variant'}`}>
                  {scanningMessage}
                </p>
              </div>
              <button 
                type="button"
                onClick={handleScanSimulationClick}
                title="Trigger simulated scan"
                className="w-12 h-12 rounded-full bg-[#e5e2e1] text-black hover:bg-tertiary hover:text-on-tertiary flex items-center justify-center hover:scale-105 transition-all cursor-pointer shadow-lg shrink-0"
              >
                <Camera className="w-5 h-5 shrink-0" />
              </button>
            </div>

          </div>

          {/* Quick Management Panel actions buttons list */}
          <div className="bg-white/[0.02] backdrop-blur-2xl border border-white/10 p-8 flex flex-col gap-4">
            <h3 className="font-label-caps text-[11px] text-[#c4c7c7] mb-2 tracking-widest">
              PORTAL CONFIGURATION ACTIONS
            </h3>

            {/* Guest list viewer toggle button */}
            <button
              onClick={() => {
                setShowGuestList(!showGuestList);
                setShowInventoryCustomizer(false);
                setShowStaffAssignments(false);
              }}
              className="w-full py-4 px-5 border border-white/10 bg-transparent text-left flex justify-between items-center group hover:border-tertiary/50 hover:bg-white/[0.03] transition-all duration-300 cursor-pointer"
            >
              <span className="text-xs sm:text-sm font-label-caps tracking-widest text-on-surface group-hover:text-tertiary transition-colors">
                {showGuestList ? 'Close Guest Registry' : 'Guest Registry List'}
              </span>
              <ArrowRight className="w-4 h-4 text-on-surface-variant group-hover:text-tertiary transition-colors shrink-0" />
            </button>

            {/* Configuration prices adjust */}
            <button
              onClick={() => {
                setShowInventoryCustomizer(!showInventoryCustomizer);
                setShowGuestList(false);
                setShowStaffAssignments(false);
              }}
              className="w-full py-4 px-5 border border-white/10 bg-transparent text-left flex justify-between items-center group hover:border-tertiary/50 hover:bg-white/[0.03] transition-all duration-300 cursor-pointer"
            >
              <span className="text-xs sm:text-sm font-label-caps tracking-widest text-on-surface group-hover:text-tertiary transition-colors">
                Adjust Pricing &amp; Caps
              </span>
              <ArrowRight className="w-4 h-4 text-on-surface-variant group-hover:text-tertiary transition-colors shrink-0" />
            </button>

            {/* Staff assignments table viewers */}
            <button
              onClick={() => {
                setShowStaffAssignments(!showStaffAssignments);
                setShowGuestList(false);
                setShowInventoryCustomizer(false);
              }}
              className="w-full py-4 px-5 border border-white/10 bg-transparent text-left flex justify-between items-center group hover:border-tertiary/50 hover:bg-white/[0.03] transition-all duration-300 cursor-pointer"
            >
              <span className="text-xs sm:text-sm font-label-caps tracking-widest text-on-surface group-hover:text-tertiary transition-colors">
                Staff Logistics Assignments
              </span>
              <ArrowRight className="w-4 h-4 text-on-surface-variant group-hover:text-tertiary transition-colors shrink-0" />
            </button>
          </div>

        </div>

      </div>

      {/* EXPANDABLE MANAGEMENT SUBPLOTS MODAL ACCORDIONS */}
      <AnimatePresence>
        
        {/* Guest List Overlay drawer */}
        {showGuestList && (
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 30 }}
            className="mt-12 bg-[#1c1b1b] border border-white/10 p-8 rounded-sm font-sans"
          >
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-headline-sm text-2xl uppercase">Registered Event Delegates List</h3>
              <button onClick={() => setShowGuestList(false)} className="p-1 cursor-pointer"><X className="w-5 h-5" /></button>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-on-surface-variant font-label-caps text-[10px]">
                    <th className="pb-3 text-left">Delegate Name</th>
                    <th className="pb-3 text-left">Badge Level</th>
                    <th className="pb-3 text-left">Quantity Seats</th>
                    <th className="pb-3 text-left">Total Value Paid</th>
                    <th className="pb-3 text-right">Credentials ID</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 font-sans">
                  {stats.transactions.filter(t => t.status === 'completed').map((t, index) => (
                    <tr key={index} className="hover:bg-white/5 transition-colors">
                      <td className="py-3 pr-2 font-semibold text-white">{t.fullName}</td>
                      <td className="py-3 pr-2"><span className="text-tertiary uppercase text-[10px] font-label-caps bg-tertiary/10 border border-tertiary/20 px-2.5 py-0.5">{t.ticketType}</span></td>
                      <td className="py-3 pr-2 text-on-surface-variant">{t.quantity}</td>
                      <td className="py-3 pr-2 font-bold">K{t.amount.toLocaleString()}</td>
                      <td className="py-3 text-right font-mono text-xs text-on-surface-variant/70">{t.id}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}

        {/* Adjust prices settings list drawer */}
        {showInventoryCustomizer && (
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 30 }}
            className="mt-12 bg-[#1c1b1b] border border-white/10 p-8 rounded-sm font-sans"
          >
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-headline-sm text-2xl uppercase">Integrate Allocations Limitations</h3>
              <button onClick={() => setShowInventoryCustomizer(false)} className="p-1 cursor-pointer"><X className="w-5 h-5" /></button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 mb-6 font-sans text-xs">
              
              {/* Ordinary Settings */}
              <div className="space-y-4">
                <h4 className="font-label-caps text-[11px] text-tertiary">Ordinary Allocation Config</h4>
                <div>
                  <label className="block text-[10px] font-label-caps text-on-surface-variant mb-1">Ordinary Price (ZMW)</label>
                  <input 
                    type="number"
                    value={ordinaryPrice}
                    onChange={(e) => setOrdinaryPrice(Number(e.target.value))}
                    className="w-full bg-[#131313] border border-white/20 p-2.5 text-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-label-caps text-on-surface-variant mb-1">Ordinary Inventory Remaining</label>
                  <input 
                    type="number"
                    value={ordinaryCap}
                    onChange={(e) => setOrdinaryCap(Number(e.target.value))}
                    className="w-full bg-[#131313] border border-white/20 p-2.5 text-white"
                  />
                </div>
              </div>

              {/* VIP Settings */}
              <div className="space-y-4">
                <h4 className="font-label-caps text-[11px] text-tertiary">VIP Allocation Config</h4>
                <div>
                  <label className="block text-[10px] font-label-caps text-on-surface-variant mb-1">VIP Price (ZMW)</label>
                  <input 
                    type="number"
                    value={vipPrice}
                    onChange={(e) => setVipPrice(Number(e.target.value))}
                    className="w-full bg-[#131313] border border-white/20 p-2.5 text-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-label-caps text-on-surface-variant mb-1">VIP Inventory Remaining</label>
                  <input 
                    type="number"
                    value={vipCap}
                    onChange={(e) => setVipCap(Number(e.target.value))}
                    className="w-full bg-[#131313] border border-white/20 p-2.5 text-white"
                  />
                </div>
              </div>

            </div>

            <div className="flex justify-end gap-4 text-xs font-sans">
              <button 
                onClick={() => setShowInventoryCustomizer(false)}
                className="px-6 py-2 border border-white/10 hover:border-white tracking-widest font-label-caps text-[10px] cursor-pointer"
              >
                Cancel
              </button>
              <button 
                onClick={handleSaveInventory}
                className="px-6 py-2 bg-tertiary hover:scale-105 text-black font-label-caps text-[10px] font-bold cursor-pointer transition-all duration-300"
              >
                Apply Allocations
              </button>
            </div>
          </motion.div>
        )}

        {/* Staff Logistics assignment drawer */}
        {showStaffAssignments && (
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 30 }}
            className="mt-12 bg-[#1c1b1b] border border-white/10 p-8 rounded-sm font-sans"
          >
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-headline-sm text-2xl uppercase">Staff Assignments &amp; Duties</h3>
              <button onClick={() => setShowStaffAssignments(false)} className="p-1 cursor-pointer"><X className="w-5 h-5" /></button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 text-xs font-sans leading-relaxed">
              <div className="bg-[#131313] p-4 border border-white/5">
                <h4 className="font-label-caps text-tertiary text-[10px] mb-2 font-bold uppercase">Front Desk Concierge</h4>
                <p className="text-on-surface-variant/80">Manage entry permissions whitelist, check credentials validation codes, assign complimentary VIP pass seating coordinates.</p>
                <span className="text-[10px] font-label-caps text-[#ffe088] mt-4 block">Lead: Jean-Paul M.</span>
              </div>
              
              <div className="bg-[#131313] p-4 border border-white/5">
                <h4 className="font-label-caps text-tertiary text-[10px] mb-2 font-bold uppercase">Catering &amp; Lounge</h4>
                <p className="text-on-surface-variant/80">Champagne flute service allocation inside Grand Palais private lounge. Stock checking, reserve luxury refreshments.</p>
                <span className="text-[10px] font-label-caps text-[#ffe088] mt-4 block">Lead: Colette Du Bois</span>
              </div>

              <div className="bg-[#131313] p-4 border border-white/5">
                <h4 className="font-label-caps text-tertiary text-[10px] mb-2 font-bold uppercase">Runway Lighting Techs</h4>
                <p className="text-on-surface-variant/80">Maintain optimal cinematic stark spotlamps intensity levels. Low-smoke haze control for high-fashion avant-garde aesthetic backlights.</p>
                <span className="text-[10px] font-label-caps text-[#ffe088] mt-4 block">Lead: Pierre L’Orange</span>
              </div>
            </div>
          </motion.div>
        )}

      </AnimatePresence>

    </div>
  );
}
