import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  BarChart, Download, Settings, Users, ArrowRight, Camera, 
  Scan, Check, Play, UserCheck, ShieldAlert, Award, TrendingUp, X, RefreshCw
} from 'lucide-react';
import { AdminStats, Transaction, TicketPackage, RegistrationData } from '../types';
import MfaSettingsPanel from './MfaSettingsPanel';
import type { AppSessionUser } from '../auth/session';

interface AdminDashboardProps {
  stats: AdminStats;
  packages: TicketPackage[];
  currentUser: AppSessionUser;
  onBackToMain: () => void;
  onUpdateInventory: (updatedPkgs: TicketPackage[]) => void;
  onSignOut: () => void;
  onSessionRefresh: () => Promise<void>;
}

export default function AdminDashboard({ stats, packages, currentUser, onBackToMain, onUpdateInventory, onSignOut, onSessionRefresh }: AdminDashboardProps) {
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
    <div className="relative z-10 pt-32 pb-32 md:pb-24 px-6 md:px-20 max-w-7xl mx-auto w-full text-[#F4F4F2] font-sans min-h-screen">
      
      {/* Background radial soft light blur */}
      <div className="fixed top-0 left-1/4 w-[800px] h-[800px] bg-[#4E1413]/10 rounded-full blur-[120px] pointer-events-none z-0"></div>

      {/* DASHBOARD TOP HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-end justify-between mb-12 gap-6 relative z-10 border-b border-[#F4F4F2]/20 pb-8">
        <div>
          <span className="font-label-caps text-[10px] text-[#F4F4F2]/80 tracking-[0.3em] block mb-2 uppercase font-bold">LIVE ANALYTICS CONSOLE</span>
          <h2 className="font-display text-4xl sm:text-5xl text-[#F4F4F2] uppercase tracking-tight font-bold">
            Katina Basil Showcase
          </h2>
        </div>
        <div className="flex gap-4 font-sans text-xs">
          <button 
            type="button"
            onClick={() => alert(`Dynamic analytics stats for ${activeTab} exported successfully as CSV.`)}
            className="px-6 py-3 border border-[#F4F4F2]/30 hover:border-[#F4F4F2] hover:bg-[#F4F4F2]/10 bg-transparent rounded-none tracking-widest font-label-caps cursor-pointer transition-all duration-300 font-bold"
          >
            EXPORT DATA
          </button>
          <button 
            type="button"
            onClick={() => setShowInventoryCustomizer(true)}
            className="px-6 py-3 bg-[#4E1413] hover:bg-[#4E1413]/90 text-[#F4F4F2] rounded-none tracking-widest font-label-caps cursor-pointer transition-all duration-300 font-bold"
          >
            MANAGE EVENT
          </button>
          <button
            type="button"
            onClick={onSignOut}
            className="px-6 py-3 bg-[#111111] hover:bg-[#000000] text-[#A3A46A] rounded-none tracking-widest font-label-caps cursor-pointer transition-all duration-300 font-bold border border-[#A3A46A]/30"
          >
            SIGN OUT
          </button>
        </div>
      </div>

      <MfaSettingsPanel currentUser={currentUser} onSessionRefresh={onSessionRefresh} />

      {/* THREE Core KPI Widgets Grid Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12 relative z-10 font-sans">
        
        {/* KPI 1: TICKETS SOLD */}
        <div className="bg-[#4E1413] border border-[#6A6A57]/30 p-8 flex flex-col gap-4 group hover:bg-[#4E1413]/95 hover:border-[#F4F4F2]/30 transition-all duration-500 rounded-none text-[#F4F4F2] shadow-md">
          <div className="flex justify-between items-start">
            <span className="font-label-caps text-[10px] text-[#F4F4F2]/70 tracking-widest font-bold">TICKETS SOLD</span>
            <Users className="w-5 h-5 text-[#F4F4F2] opacity-90" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl sm:text-5xl font-display text-[#F4F4F2] font-bold">{activeTicketsSold}</span>
            <span className="text-sm text-[#F4F4F2]/65 font-medium">/ {stats.ticketsTotal}</span>
          </div>
          <div className="w-full h-[3px] bg-[#F4F4F2]/20 mt-2 rounded-none overflow-hidden">
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: `${(activeTicketsSold / stats.ticketsTotal) * 100}%` }}
              transition={{ duration: 1.5, ease: "easeOut" }}
              className="h-full bg-[#F4F4F2] shadow-[0_0_8px_rgba(244,244,242,0.5)]" 
            />
          </div>
        </div>

        {/* KPI 2: TOTAL REVENUE */}
        <div className="bg-[#4E1413] border border-[#6A6A57]/30 p-8 flex flex-col gap-4 group hover:bg-[#4E1413]/95 hover:border-[#F4F4F2]/30 transition-all duration-500 rounded-none text-[#F4F4F2] shadow-md">
          <div className="flex justify-between items-start">
            <span className="font-label-caps text-[10px] text-[#F4F4F2]/70 tracking-widest font-bold">TOTAL REVENUE</span>
            <Award className="w-5 h-5 text-[#F4F4F2] opacity-90" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl sm:text-5xl font-display text-[#F4F4F2] font-bold">
              K{activeRevenue.toLocaleString()}
            </span>
          </div>
          <p className="font-body-md text-xs text-[#F4F4F2]/90 flex items-center gap-1 mt-2 tracking-wide font-semibold">
            <TrendingUp className="w-3.5 h-3.5 text-[#F4F4F2]" /> +14.2% since yesterday
          </p>
        </div>

        {/* KPI 3: REMAINING SEATS */}
        <div className="bg-[#4E1413] border border-[#6A6A57]/30 p-8 flex flex-col gap-4 group hover:bg-[#4E1413]/95 hover:border-[#F4F4F2]/30 transition-all duration-500 rounded-none text-[#F4F4F2] shadow-md">
          <div className="flex justify-between items-start">
            <span className="font-label-caps text-[10px] text-[#F4F4F2]/70 tracking-widest font-bold">REMAINING INVENTORY</span>
            <Scan className="w-5 h-5 text-[#F4F4F2] opacity-90" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl sm:text-5xl font-display text-[#F4F4F2] font-bold">
              {stats.ticketsTotal - activeTicketsSold}
            </span>
            <span className="text-xs text-[#F4F4F2]/70 font-label-caps tracking-widest font-bold">SEATS LEFT</span>
          </div>
          <p className="font-body-md text-xs text-[#F4F4F2]/60 mt-2 font-medium tracking-wide">
            VIP allocations limits remaining: {packages.find(p => p.id === 'vip')?.remaining || 200}
          </p>
        </div>

      </div>

      {/* MAIN TWO-COLUMN DASHBOARD CONTENT GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 relative z-10">
        
        {/* Left Side (span 8): Chart & Acquisitions list */}
        <div className="lg:col-span-8 flex flex-col gap-10">
          
          {/* Custom Animated SVG/CSS Bar Chart representation of ticket allocations rates */}
          <div className="bg-[#4E1413] border border-[#6A6A57]/30 p-8 min-h-[420px] rounded-none flex flex-col relative overflow-hidden text-[#F4F4F2] shadow-md shadow-[#4E1413]/25">
            <div className="flex justify-between items-center mb-10 relative z-10 transition-all">
              <h3 className="font-headline-sm text-2xl text-[#F4F4F2] uppercase font-bold">Live Acquisition Velocities</h3>
              
              {/* Timing filters selectors tabs */}
              <div className="flex gap-4 font-sans text-xs">
                {(['7D', '30D', 'YTD'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`font-label-caps text-[10px] tracking-widest cursor-pointer pb-0.5 border-b uppercase transition-all ${
                      activeTab === tab
                        ? 'text-[#F4F4F2] border-[#F4F4F2] font-bold'
                        : 'text-[#F4F4F2]/50 border-transparent hover:text-[#F4F4F2]'
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Interactive SVG/CSS bar display blocks */}
            <div className="flex-grow flex items-end justify-between gap-3 relative z-10 opacity-95 min-h-[220px]">
              {stats.chartsData.map((dataObj, charIdx) => {
                // Adjust bar heights slightly depending on timing tab
                const multiFactor = activeTab === '7D' ? 1.4 : (activeTab === 'YTD' ? 0.7 : 1);
                const heightPercentage = Math.min(100, Math.max(15, dataObj.count * 15 * multiFactor));
                
                return (
                  <div key={charIdx} className="w-full flex flex-col items-center group/bar cursor-help">
                    {/* Tooltip on hover */}
                    <div className="absolute -top-1 px-3 py-1 bg-[#F4F4F2] text-[9px] font-mono tracking-widest text-[#4E1413] border border-[#F4F4F2]/20 rounded-none rotate-0 group-hover/bar:flex hidden flex-col items-center shadow-lg transition-all duration-300">
                      <span>{dataObj.count} Allocations</span>
                      <span className="text-[#4E1413]/90 font-bold">K{dataObj.revenue.toLocaleString()}</span>
                    </div>

                    {/* Styled Cylinder bar with custom colorations */}
                    <div className="w-full bg-[#F4F4F2]/10 rounded-none h-48 sm:h-56 relative flex items-end border border-[#F4F4F2]/20">
                      <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: `${heightPercentage}%` }}
                        transition={{ duration: 1, delay: charIdx * 0.05, ease: "easeOut" }}
                        className={`w-full rounded-none transition-all duration-300 ${
                          charIdx === stats.chartsData.length - 1
                            ? 'bg-[#F4F4F2] shadow-[0_0_15px_rgba(244,244,242,0.4)] border-t border-[#F4F4F2]'
                            : 'bg-[#F4F4F2]/30 group-hover/bar:bg-[#F4F4F2]/55'
                        }`}
                      />
                    </div>
                    
                    {/* Label */}
                    <span className="font-mono text-[9px] sm:text-[10px] text-[#F4F4F2]/70 group-hover/bar:text-white transition-colors mt-3 font-bold">
                      {dataObj.day}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Transactions List */}
          <div className="flex flex-col gap-0 font-sans">
            <h3 className="font-label-caps text-[11px] text-[#F4F4F2]/90 mb-4 tracking-widest font-bold">
              RECENT BOOKING REGISTRY
            </h3>
            
            <div className="divide-y divide-[#F4F4F2]/20 border border-[#6A6A57]/30 bg-[#4E1413] text-[#F4F4F2] rounded-none shadow-md">
              {stats.transactions.map((trObj, idx) => {
                const initBg = idx % 3 === 0 
                  ? 'bg-[#F4F4F2]/10 text-[#F4F4F2]' 
                  : idx % 3 === 1 
                    ? 'bg-[#F4F4F2]/20 text-[#F4F4F2]/90' 
                    : 'bg-[#F4F4F2]/30 text-white';

                return (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: idx * 0.1 }}
                    key={trObj.id} 
                    className="flex items-center justify-between py-5 px-6 hover:bg-[#F4F4F2]/10 transition-colors duration-300 cursor-pointer group"
                  >
                    <div className="flex items-center gap-4 sm:gap-6">
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center border border-[#F4F4F2]/20 font-bold shrink-0 text-sm ${initBg}`}>
                        {trObj.initials}
                      </div>
                      <div>
                        <h4 className="font-headline-sm text-lg sm:text-xl text-[#F4F4F2] group-hover:text-white transition-colors leading-tight font-bold">
                          {trObj.fullName}
                        </h4>
                        <p className="text-xs text-[#F4F4F2]/75 font-semibold font-sans">
                          {trObj.ticketType.toUpperCase()} Tier • {trObj.quantity} Ticket(s)
                        </p>
                      </div>
                    </div>

                    <div className="text-right">
                      <p className="text-base sm:text-lg text-[#F4F4F2] font-bold font-mono">
                        K{trObj.amount.toLocaleString()}
                      </p>
                      <p className="font-label-caps text-[9px] text-[#F4F4F2]/60 tracking-wider mt-0.5 font-semibold">
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
          <div className="bg-[#4E1413] border border-[#6A6A57]/45 p-2.5 flex flex-col rounded-none group select-none text-[#F4F4F2] shadow-md shadow-[#4E1413]/25">
            
            {/* Viewfinder background */}
            <div className="relative aspect-square w-full bg-[#2E2E2A] overflow-hidden flex items-center justify-center">
              <img
                alt="Scanner atmospheric viewfinder background"
                src={scannerBgImage}
                className="absolute inset-0 w-full h-full object-cover opacity-20 grayscale"
                referrerPolicy="no-referrer"
              />
              
              {/* Viewfinder Scanning Grid overlay line sweep */}
              <div className="absolute inset-8 border border-[#F4F4F2]/20 flex flex-col justify-between p-1">
                <div className="flex justify-between w-full">
                  <div className="w-8 h-8 border-t-2 border-l-2 border-[#F4F4F2]"></div>
                  <div className="w-8 h-8 border-t-2 border-r-2 border-[#F4F4F2]"></div>
                </div>
 
                {/* Laser Sweep Beam line animation */}
                <div className="w-full h-[1.5px] bg-[#4E1413] shadow-[0_0_12px_rgba(78,20,19,0.8)] absolute left-0 top-1/2 -translate-y-1/2 animate-bounce" />
 
                <div className="flex justify-between w-full">
                  <div className="w-8 h-8 border-b-2 border-l-2 border-[#F4F4F2]"></div>
                  <div className="w-8 h-8 border-b-2 border-r-2 border-[#F4F4F2]"></div>
                </div>
              </div>
 
              {/* Scan result popup card */}
              <AnimatePresence>
                {scanResult && (
                  <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.8, opacity: 0 }}
                    className="absolute inset-6 bg-[#F4F4F2]/95 border border-[#4E1413]/30 flex flex-col items-center justify-center text-center p-6 z-20 shadow-2xl text-[#2E2E2A]"
                  >
                    <div className="w-12 h-12 rounded-full bg-green-500/10 border border-green-500/30 flex items-center justify-center mb-3">
                      <Check className="w-6 h-6 text-green-700 font-bold" />
                    </div>
                    <span className="font-label-caps text-[9px] text-green-700 tracking-[0.2em] mb-1 font-bold">ACCESS GRANTED</span>
                    <h4 className="font-headline-sm text-lg text-[#2E2E2A] mb-1 uppercase font-bold">{scanResult.guestName}</h4>
                    <p className="text-[10px] text-[#6A6A57] font-sans mb-1 font-medium">{scanResult.details}</p>
                    <p className="text-[9px] text-[#6A6A57]/60 font-mono mb-4 font-bold">ID: {scanResult.code}</p>
                    
                    <button
                      type="button"
                      onClick={resetScanner}
                      className="px-4 py-2 border border-[#6A6A57]/40 text-[#2E2E2A] hover:bg-[#6A6A57]/10 text-[9px] font-label-caps tracking-widest rounded-none cursor-pointer font-bold"
                    >
                      Scan Next
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
 
            {/* Controller Scanner Details Action below */}
            <div className="p-6 flex justify-between items-center text-sans bg-[#F4F4F2]/10">
              <div>
                <h4 className="font-label-caps text-[10px] text-[#F4F4F2]/80 tracking-widest leading-none mb-1.5 font-bold">ENTRY BARCODE SCANNER</h4>
                <p className={`text-[11px] font-sans font-medium ${scanResult ? 'text-green-400' : 'text-[#F4F4F2]/60'}`}>
                  {scanningMessage}
                </p>
              </div>
              <button 
                type="button"
                onClick={handleScanSimulationClick}
                title="Trigger simulated scan"
                className="w-12 h-12 rounded-full bg-[#F4F4F2] text-[#4E1413] hover:bg-white hover:text-[#4E1413] flex items-center justify-center hover:scale-105 transition-all cursor-pointer shadow-lg shrink-0"
              >
                <Camera className="w-5 h-5 shrink-0" />
              </button>
            </div>
 
          </div>

          {/* Quick Management Panel actions buttons list */}
          <div className="bg-[#4E1413] border border-[#6A6A57]/30 p-8 flex flex-col gap-4 text-[#F4F4F2] shadow-md shadow-[#4E1413]/25">
            <h3 className="font-label-caps text-[11px] text-[#F4F4F2]/70 mb-2 tracking-widest font-bold">
              PORTAL CONFIGURATION ACTIONS
            </h3>

            {/* Guest list viewer toggle button */}
            <button
              onClick={() => {
                setShowGuestList(!showGuestList);
                setShowInventoryCustomizer(false);
                setShowStaffAssignments(false);
              }}
              className="w-full py-4 px-5 border border-[#F4F4F2]/30 bg-transparent text-left flex justify-between items-center group hover:border-[#F4F4F2]/80 hover:bg-[#F4F4F2]/10 transition-all duration-300 cursor-pointer"
            >
              <span className="text-xs sm:text-sm font-label-caps tracking-widest text-[#F4F4F2] group-hover:text-white transition-colors font-bold">
                {showGuestList ? 'Close Guest Registry' : 'Guest Registry List'}
              </span>
              <ArrowRight className="w-4 h-4 text-[#F4F4F2]/60 group-hover:text-white transition-colors shrink-0" />
            </button>

            {/* Configuration prices adjust */}
            <button
              onClick={() => {
                setShowInventoryCustomizer(!showInventoryCustomizer);
                setShowGuestList(false);
                setShowStaffAssignments(false);
              }}
              className="w-full py-4 px-5 border border-[#F4F4F2]/30 bg-transparent text-left flex justify-between items-center group hover:border-[#F4F4F2]/80 hover:bg-[#F4F4F2]/10 transition-all duration-300 cursor-pointer"
            >
              <span className="text-xs sm:text-sm font-label-caps tracking-widest text-[#F4F4F2] group-hover:text-white transition-colors font-bold">
                Adjust Pricing &amp; Caps
              </span>
              <ArrowRight className="w-4 h-4 text-[#F4F4F2]/60 group-hover:text-white transition-colors shrink-0" />
            </button>

            {/* Staff assignments table viewers */}
            <button
              onClick={() => {
                setShowStaffAssignments(!showStaffAssignments);
                setShowGuestList(false);
                setShowInventoryCustomizer(false);
              }}
              className="w-full py-4 px-5 border border-[#F4F4F2]/30 bg-transparent text-left flex justify-between items-center group hover:border-[#F4F4F2]/80 hover:bg-[#F4F4F2]/10 transition-all duration-300 cursor-pointer"
            >
              <span className="text-xs sm:text-sm font-label-caps tracking-widest text-[#F4F4F2] group-hover:text-white transition-colors font-bold">
                Staff Logistics Assignments
              </span>
              <ArrowRight className="w-4 h-4 text-[#F4F4F2]/60 group-hover:text-white transition-colors shrink-0" />
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
            className="mt-12 bg-[#4E1413] border border-[#F4F4F2]/20 p-8 rounded-none font-sans text-[#F4F4F2] shadow-xl"
          >
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-headline-sm text-2xl uppercase text-[#F4F4F2] font-bold">Registered Event Delegates List</h3>
              <button onClick={() => setShowGuestList(false)} className="p-1 cursor-pointer hover:text-white text-[#F4F4F2]/70"><X className="w-5 h-5" /></button>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm text-[#F4F4F2]">
                <thead>
                  <tr className="border-b border-[#F4F4F2]/20 text-[#F4F4F2]/70 font-label-caps text-[10px] font-bold">
                    <th className="pb-3 text-left">Delegate Name</th>
                    <th className="pb-3 text-left">Badge Level</th>
                    <th className="pb-3 text-left">Quantity Seats</th>
                    <th className="pb-3 text-left">Total Value Paid</th>
                    <th className="pb-3 text-right">Credentials ID</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F4F4F2]/10 font-sans">
                  {stats.transactions.filter(t => t.status === 'completed').map((t, index) => (
                    <tr key={index} className="hover:bg-[#F4F4F2]/10 transition-colors">
                      <td className="py-3 pr-2 font-bold text-[#F4F4F2]">{t.fullName}</td>
                      <td className="py-3 pr-2"><span className="text-[#4E1413] uppercase text-[10px] font-label-caps bg-[#F4F4F2] border border-[#F4F4F2]/30 px-2.5 py-0.5 font-bold">{t.ticketType}</span></td>
                      <td className="py-3 pr-2 text-[#F4F4F2]/80 font-semibold">{t.quantity}</td>
                      <td className="py-3 pr-2 font-bold text-[#F4F4F2]">K{t.amount.toLocaleString()}</td>
                      <td className="py-3 text-right font-mono text-xs text-[#F4F4F2]/60 font-bold">{t.id}</td>
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
            className="mt-12 bg-[#4E1413] border border-[#F4F4F2]/20 p-8 rounded-none font-sans text-[#F4F4F2] shadow-xl"
          >
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-headline-sm text-2xl uppercase text-[#F4F4F2] font-bold">Integrate Allocations Limitations</h3>
              <button onClick={() => setShowInventoryCustomizer(false)} className="p-1 cursor-pointer hover:text-white text-[#F4F4F2]/70"><X className="w-5 h-5" /></button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 mb-6 font-sans text-xs">
              
              {/* Ordinary Settings */}
              <div className="space-y-4">
                <h4 className="font-label-caps text-[11px] text-[#F4F4F2]/90 font-bold">Ordinary Allocation Config</h4>
                <div>
                  <label className="block text-[10px] font-label-caps text-[#F4F4F2]/70 mb-1 font-bold">Ordinary Price (ZMW)</label>
                  <input 
                    type="number"
                    value={ordinaryPrice}
                    onChange={(e) => setOrdinaryPrice(Number(e.target.value))}
                    className="w-full bg-[#4E1413] border border-[#F4F4F2]/20 p-2.5 text-[#F4F4F2] font-bold focus:border-[#F4F4F2]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-label-caps text-[#F4F4F2]/70 mb-1 font-bold">Ordinary Inventory Remaining</label>
                  <input 
                    type="number"
                    value={ordinaryCap}
                    onChange={(e) => setOrdinaryCap(Number(e.target.value))}
                    className="w-full bg-[#4E1413] border border-[#F4F4F2]/20 p-2.5 text-[#F4F4F2] font-bold focus:border-[#F4F4F2]"
                  />
                </div>
              </div>

              {/* VIP Settings */}
              <div className="space-y-4">
                <h4 className="font-label-caps text-[11px] text-[#F4F4F2]/90 font-bold">VIP Allocation Config</h4>
                <div>
                  <label className="block text-[10px] font-label-caps text-[#F4F4F2]/70 mb-1 font-bold">VIP Price (ZMW)</label>
                  <input 
                    type="number"
                    value={vipPrice}
                    onChange={(e) => setVipPrice(Number(e.target.value))}
                    className="w-full bg-[#4E1413] border border-[#F4F4F2]/20 p-2.5 text-[#F4F4F2] font-bold focus:border-[#F4F4F2]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-label-caps text-[#F4F4F2]/70 mb-1 font-bold">VIP Inventory Remaining</label>
                  <input 
                    type="number"
                    value={vipCap}
                    onChange={(e) => setVipCap(Number(e.target.value))}
                    className="w-full bg-[#4E1413] border border-[#F4F4F2]/20 p-2.5 text-[#F4F4F2] font-bold focus:border-[#F4F4F2]"
                  />
                </div>
              </div>

            </div>

            <div className="flex justify-end gap-4 text-xs font-sans">
              <button 
                onClick={() => setShowInventoryCustomizer(false)}
                className="px-6 py-2 border border-[#F4F4F2]/30 hover:border-white text-[#F4F4F2]/80 tracking-widest font-label-caps text-[10px] cursor-pointer font-bold"
              >
                Cancel
              </button>
              <button 
                onClick={handleSaveInventory}
                className="px-6 py-2 bg-[#F4F4F2] text-[#4E1413] hover:scale-105 font-label-caps text-[10px] font-bold cursor-pointer transition-all duration-300"
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
            className="mt-12 bg-[#4E1413] border border-[#F4F4F2]/20 p-8 rounded-none font-sans text-[#F4F4F2] shadow-xl"
          >
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-headline-sm text-2xl uppercase text-[#F4F4F2] font-bold">Staff Assignments &amp; Duties</h3>
              <button onClick={() => setShowStaffAssignments(false)} className="p-1 cursor-pointer hover:text-white text-[#F4F4F2]/70"><X className="w-5 h-5" /></button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 text-xs font-sans leading-relaxed">
              <div className="bg-[#F4F4F2]/10 p-4 border border-[#F4F4F2]/20">
                <h4 className="font-label-caps text-[#F4F4F2] text-[10px] mb-2 font-bold uppercase tracking-wider">Front Desk Concierge</h4>
                <p className="text-[#F4F4F2]/80 font-medium font-sans">Manage entry permissions whitelist, check credentials validation codes, assign complimentary VIP pass seating coordinates.</p>
                <span className="text-[10px] font-label-caps text-[#F4F4F2] mt-4 block font-bold">Lead: Jean-Paul M.</span>
              </div>
              
              <div className="bg-[#F4F4F2]/10 p-4 border border-[#F4F4F2]/20">
                <h4 className="font-label-caps text-[#F4F4F2] text-[10px] mb-2 font-bold uppercase tracking-wider">Catering &amp; Lounge</h4>
                <p className="text-[#F4F4F2]/80 font-medium font-sans">Champagne flute service allocation inside Grand Palais private lounge. Stock checking, reserve luxury refreshments.</p>
                <span className="text-[10px] font-label-caps text-[#F4F4F2] mt-4 block font-bold">Lead: Colette Du Bois</span>
              </div>

              <div className="bg-[#F4F4F2]/10 p-4 border border-[#F4F4F2]/20">
                <h4 className="font-label-caps text-[#F4F4F2] text-[10px] mb-2 font-bold uppercase tracking-wider">Runway Lighting Techs</h4>
                <p className="text-[#F4F4F2]/80 font-medium font-sans">Maintain optimal cinematic stark spotlamps intensity levels. Low-smoke haze control for high-fashion avant-garde aesthetic backlights.</p>
                <span className="text-[10px] font-label-caps text-[#F4F4F2] mt-4 block font-bold">Lead: Pierre L’Orange</span>
              </div>
            </div>
          </motion.div>
        )}

      </AnimatePresence>

    </div>
  );
}
