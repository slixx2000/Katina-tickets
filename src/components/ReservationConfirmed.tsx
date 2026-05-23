import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { CheckCircle, Wallet, Download, Sparkles, Star, Calendar, MapPin, Armchair, Hash } from 'lucide-react';
import { TicketPackage, RegistrationData } from '../types';

interface ReservationConfirmedProps {
  registrationData: RegistrationData;
  selectedPackage: TicketPackage;
  onNavigateHome: () => void;
  onGoToAdmin: () => void;
}

export default function ReservationConfirmed({ registrationData, selectedPackage, onNavigateHome, onGoToAdmin }: ReservationConfirmedProps) {
  const [ticketId, setTicketId] = useState('');
  const [seatId, setSeatId] = useState('');

  const qrImage = "https://lh3.googleusercontent.com/aida-public/AB6AXuCdny86GPQvSD5A4h4L7VCxXHwnjoueFdqE6S4vfdeS4z8WEiDNhW9ZTYWCmCVvv18En8rn7_e8ce7VhRnRY2Fl2MPXBsk6z_wcMZwsjhYZo9L-YdMA9ofpDFXyvxuLQ_nyz1ZzVhAWqFSYx0wKuVBqk6NAOcuFyXd5hJ3kQIBL4iSflXUHapVdDvHjqMvxwA1T1DKob_12Ifn_k4AsYtdIqgK34hLu-W3P4GU6Y_jrCStepXbvWWwfmiPfs5dcIj-U5NyP-yAAhWb1";

  useEffect(() => {
    // Generate lovely random high-fashion credential identifiers
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = 'AT-';
    for (let i = 0; i < 3; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    result += '-';
    for (let i = 0; i < 2; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setTicketId(result);

    // Random seating arrangement e.g., Row A, Slot 12
    const rows = ['A', 'B', 'C', 'D'];
    const row = selectedPackage.price === 2500 ? 'A' : (selectedPackage.price === 850 ? 'B' : rows[Math.floor(Math.random() * rows.length)]);
    const slot = Math.floor(Math.random() * 24) + 1;
    setSeatId(`Row ${row}, ${slot}`);
  }, [selectedPackage]);

  return (
    <div className="min-h-screen relative flex flex-col items-center justify-center overflow-hidden p-6 md:p-12 bg-[#666E54] text-[#F4F4F2]">
      {/* Background radial highlight light */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80vw] h-[80vh] bg-[radial-gradient(circle,rgba(244,244,242,0.04)_0%,transparent_70%)] pointer-events-none z-0" />

      <main className="w-full max-w-2xl z-10 flex flex-col items-center gap-10">
        
        {/* Success Header Area */}
        <motion.div 
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="flex flex-col items-center text-center gap-4"
        >
          <div className="w-16 h-16 rounded-full bg-[#4E1413]/10 border border-[#4E1413]/30 flex items-center justify-center mb-1 shadow-[0_0_15px_rgba(78,20,19,0.2)]">
            <CheckCircle className="w-8 h-8 text-[#4E1413]" />
          </div>
          <h1 className="font-headline-md text-3xl sm:text-4xl text-[#F4F4F2] font-bold">
            Reservation Confirmed
          </h1>
          <p className="font-body-md text-xs sm:text-sm text-[#F4F4F2]/85 max-w-sm sm:max-w-md leading-relaxed font-sans">
            Your presence is officially requested. Your digital security access credentials have been securely minted.
          </p>
        </motion.div>

        {/* VIP Digital Pass Ticket Card */}
        <motion.div
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="w-full relative group"
        >
          {/* Subtle glowing halo edges */}
          <div className="absolute -inset-1 bg-[#4E1413]/5 rounded-none blur-2xl opacity-40 group-hover:opacity-60 transition-opacity duration-1000"></div>

          {/* Maroon outline/pass container */}
          <div className="relative bg-[#4E1413] border border-[#F4F4F2]/20 hover:border-[#F4F4F2]/40 transition-colors duration-700 rounded-none overflow-hidden shadow-2xl flex flex-col text-[#F4F4F2]">
            
            {/* Header section with brand and star icon */}
            <div className="p-8 md:p-10 flex flex-col gap-6 relative">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="font-display text-4xl tracking-widest text-[#F4F4F2] uppercase leading-none select-none font-bold">
                    KATINA BASIL
                  </h2>
                  <p className="font-label-caps text-[10px] text-[#F4F4F2] mt-2 flex items-center gap-1 font-bold tracking-wider">
                    <Sparkles className="w-3.5 h-3.5 text-[#F4F4F2] animate-pulse" />
                    {selectedPackage.price === 2500 ? 'VIP Access Credential' : 'General admittance pass'}
                  </p>
                </div>
                <div className="w-12 h-12 bg-[#F4F4F2]/10 rounded-full border border-[#F4F4F2]/25 flex items-center justify-center shadow-inner">
                  <Star className="w-6 h-6 text-[#F4F4F2] fill-[#F4F4F2]/95" />
                </div>
              </div>
            </div>

            {/* Holographic Security separating barcode line */}
            <div className="h-[1.5px] w-full bg-gradient-to-r from-transparent via-[#F4F4F2]/50 to-transparent" />

            {/* Credential Details section */}
            <div className="p-8 md:p-10 bg-[#F4F4F2]/10 flex flex-col md:flex-row gap-8 justify-between items-center md:items-start text-[#F4F4F2]">
              
              <div className="flex flex-col gap-6 w-full md:w-auto flex-1 font-sans">
                {/* Issued To Client Info */}
                <div className="flex flex-col">
                  <span className="font-label-caps text-[9px] text-[#F4F4F2]/65 mb-1 font-bold">Issued To</span>
                  <span className="font-headline-sm text-2xl text-[#F4F4F2] group-hover:text-white transition-colors font-bold">
                    {registrationData.fullName || 'Honorary Guest'}
                  </span>
                </div>

                {/* Event specs columns keys */}
                <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                  <div className="flex flex-col">
                    <span className="font-label-caps text-[9px] text-[#F4F4F2]/60 mb-0.5 font-bold">Event</span>
                    <span className="text-xs sm:text-sm text-[#F4F4F2] font-bold">Katina Basil Showcase</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="font-label-caps text-[9px] text-[#F4F4F2]/60 mb-0.5 font-bold">Date</span>
                    <span className="text-xs sm:text-sm text-[#F4F4F2] font-semibold">Nov 12, 2026</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="font-label-caps text-[9px] text-[#F4F4F2]/60 mb-0.5 font-bold">Location</span>
                    <span className="text-xs sm:text-sm text-[#F4F4F2] font-semibold">Ciela Resort</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="font-label-caps text-[9px] text-[#F4F4F2]/60 mb-0.5 font-bold">Seat</span>
                    <span className="text-xs sm:text-sm text-[#F4F4F2] font-bold">{seatId}</span>
                  </div>
                </div>
              </div>

              {/* Barcode/Cryptographic QR Code container */}
              <div className="flex flex-col items-center gap-3 shrink-0">
                <div className="w-36 h-36 bg-[#F4F4F2] rounded-none border border-[#F4F4F2]/30 p-2 relative overflow-hidden group-hover:border-[#F4F4F2]/60 transition-colors">
                  <img
                    alt="Cryptographic Certified Security Tag"
                    src={qrImage}
                    className="w-full h-full object-cover mix-blend-multiply opacity-95 group-hover:opacity-100 transition-all duration-700"
                    referrerPolicy="no-referrer"
                  />
                  {/* Glowing Laser scanner line sweeping up and down */}
                  <div className="absolute top-1/2 left-0 w-full h-[1.5px] bg-[#4E1413] shadow-[0_0_8px_rgba(78,20,19,0.8)] animate-bounce" />
                </div>
                
                <span className="font-label-caps text-[10px] text-[#F4F4F2]/75 tracking-[0.25em] flex items-center gap-1 select-all font-mono font-bold">
                  <Hash className="w-3 h-3 text-[#F4F4F2]/50" /> {ticketId}
                </span>
              </div>

            </div>

          </div>
        </motion.div>

        {/* Bottom Actions Row buttons */}
        <div className="w-full flex flex-col sm:flex-row gap-4 justify-center items-center mt-2 font-sans">
          <button
            onClick={() => {
              alert("Certified pass addition to system Wallet is simulated.");
            }}
            className="w-full sm:w-auto px-8 py-4 bg-[#F4F4F2] text-[#4E1413] font-label-caps text-[11px] font-bold flex items-center justify-center gap-2 hover:bg-[#F4F4F2]/90 hover:text-[#4E1413] transition-colors duration-500 rounded-none cursor-pointer border border-[#F4F4F2]"
          >
            <Wallet className="w-4 h-4 text-[#F4F4F2] shrink-0" />
            <span>ADD TO WALLET</span>
          </button>

          <button
            onClick={() => {
              alert("Pass downloaded as simulated PDF credential coordinates.");
            }}
            className="w-full sm:w-auto px-8 py-4 bg-transparent border border-[#F4F4F2]/30 text-[#F4F4F2] font-label-caps text-[11px] flex items-center justify-center gap-2 hover:border-[#F4F4F2] hover:text-[#F4F4F2] hover:bg-[#F4F4F2]/10 transition-all duration-500 rounded-none cursor-pointer"
          >
            <Download className="w-4 h-4 shrink-0" />
            <span>DOWNLOAD TICKET</span>
          </button>
        </div>

        {/* Concierge Portal Option button */}
        <div className="pt-4 flex flex-col items-center font-sans">
          <button
            onClick={onNavigateHome}
            className="text-xs font-label-caps text-[#F4F4F2]/80 hover:text-[#F4F4F2] tracking-widest transition-colors mb-3 uppercase underline cursor-pointer font-bold animate-pulse"
          >
            Back to Showroom Hero
          </button>
          <button
            onClick={onGoToAdmin}
            className="text-[10px] sm:text-xs font-label-caps text-[#F4F4F2]/60 hover:text-[#F4F4F2] tracking-widest transition-colors uppercase cursor-pointer"
          >
            Go to Admin Dashboard to Scan Tickets
          </button>
        </div>

      </main>
    </div>
  );
}
