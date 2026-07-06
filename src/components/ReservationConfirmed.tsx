import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { CheckCircle, Wallet, Download, Sparkles, Star, Hash } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { TicketPackage, RegistrationData } from '../types';
import logoAndBackground from '../assets/logo_and_bg.png';

function logFrontendEvent(step: string, data: Record<string, unknown> = {}) {
  const payload = {
    timestamp: new Date().toISOString(),
    level: 'info',
    event: `FRONTEND ${step}`,
    service: 'katina-tickets-client',
    ...data,
  };

  console.log(JSON.stringify(payload));
}

interface ReservationConfirmedProps {
  registrationData: RegistrationData;
  selectedPackage: TicketPackage;
  paymentReference: string;
  paymentStatus: 'pending' | 'completed' | 'failed';
  onNavigateHome: () => void;
  onGoToAdmin: () => void;
}

export default function ReservationConfirmed({ registrationData, selectedPackage, paymentReference, paymentStatus, onNavigateHome, onGoToAdmin }: ReservationConfirmedProps) {
  const [ticketId, setTicketId] = useState('');
  const [seatId, setSeatId] = useState('Pending assignment');
  const [paymentLabel, setPaymentLabel] = useState<'PENDING' | 'PAID' | 'FAILED'>('PENDING');
  const [ticketToken, setTicketToken] = useState('pending-ticket-token');
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [isSyncingReservation, setIsSyncingReservation] = useState(true);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [syncAttempt, setSyncAttempt] = useState(0);

  useEffect(() => {
    let mounted = true;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    setTicketId(paymentReference);
    setSyncError(null);
    setIsSyncingReservation(true);

    const localStatus = paymentStatus === 'completed' ? 'PAID' : paymentStatus === 'failed' ? 'FAILED' : 'PENDING';
    setPaymentLabel(localStatus);

    const resolveReservation = async () => {
      logFrontendEvent('reservation.sync.started', { paymentReference, paymentStatus });

      try {
        const response = await fetch(`/api/payments/${encodeURIComponent(paymentReference)}/reservation`);
        logFrontendEvent('reservation.sync.response.received', { paymentReference, statusCode: response.status });

        if (!response.ok) {
          if (!mounted) return;
          if (response.status === 401) {
            setSyncError('Your session expired. Sign in again to access ticket details.');
          } else if (response.status === 403) {
            setSyncError('This ticket cannot be accessed from your account.');
          } else if (response.status === 404) {
            setSyncError('Ticket reservation was not found for this reference yet.');
          } else {
            setSyncError('Unable to load ticket details right now. Please retry.');
          }
          return;
        }

        const payload = await response.json();
        logFrontendEvent('reservation.sync.succeeded', { paymentReference, responseBody: payload });
        if (!mounted) return;

        const status = String(payload?.paymentStatus ?? '').toUpperCase();
        if (status === 'PAID' || status === 'FAILED' || status === 'PENDING') {
          setPaymentLabel(status);
        }

        const seats = Array.isArray(payload?.reservation?.seatDetails)
          ? payload.reservation.seatDetails.filter((item: unknown) => typeof item === 'string')
          : [];

        if (seats.length > 0) {
          setSeatId(seats.join(', '));
        }

        if (status === 'PAID') {
          if (pollTimer) {
            clearInterval(pollTimer);
            pollTimer = null;
          }

          logFrontendEvent('ticket.token.request.started', { paymentReference });
          const tokenResponse = await fetch(`/api/payments/${encodeURIComponent(paymentReference)}/ticket-token`);
          logFrontendEvent('ticket.token.response.received', { paymentReference, statusCode: tokenResponse.status });
          if (!tokenResponse.ok) {
            if (tokenResponse.status === 401) {
              setSyncError('Your session expired. Sign in again to retrieve the ticket token.');
            } else if (tokenResponse.status === 403) {
              setSyncError('This ticket token is restricted to the purchasing account.');
            } else {
              setSyncError('Ticket details loaded, but token generation is pending.');
            }
          } else {
            const tokenPayload = await tokenResponse.json();
            logFrontendEvent('ticket.token.succeeded', { paymentReference, responseBody: tokenPayload });
            if (typeof tokenPayload?.token === 'string' && tokenPayload.token.length > 0 && mounted) {
              setTicketToken(tokenPayload.token);
            }
          }
        } else if (status === 'FAILED') {
          if (pollTimer) {
            clearInterval(pollTimer);
            pollTimer = null;
          }
        }
      } catch (error) {
        logFrontendEvent('reservation.sync.error', {
          paymentReference,
          errorMessage: error instanceof Error ? error.message : String(error),
        });
        if (mounted) {
          setSyncError('Network error while syncing reservation details. Please retry.');
        }
      } finally {
        if (mounted) {
          setIsSyncingReservation(false);
        }
      }
    };

    void resolveReservation();

    pollTimer = setInterval(() => {
      if (mounted) {
        void resolveReservation();
      }
    }, 5000);

    return () => {
      mounted = false;
      if (pollTimer) {
        clearInterval(pollTimer);
      }
    };
  }, [paymentReference, paymentStatus, syncAttempt]);

  const handleDownloadPdf = async () => {
    logFrontendEvent('ticket.pdf.download.started', {
      paymentReference,
      paymentLabel,
    });
    setDownloadError(null);

    if (paymentLabel !== 'PAID') {
      setDownloadError('Ticket PDF becomes available after payment confirmation.');
      return;
    }

    setIsDownloadingPdf(true);
    try {
      const response = await fetch(`/api/payments/${encodeURIComponent(paymentReference)}/ticket-pdf`);
      logFrontendEvent('ticket.pdf.download.response.received', {
        paymentReference,
        statusCode: response.status,
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        if (response.status === 401) {
          setDownloadError('Sign in again to download this ticket.');
        } else if (response.status === 403) {
          setDownloadError('This ticket belongs to another account.');
        } else if (response.status === 429) {
          setDownloadError('Download rate limit reached. Please wait and retry.');
        } else {
          setDownloadError(payload?.message || 'Unable to download ticket PDF right now.');
        }
        return;
      }

      const blob = await response.blob();
      logFrontendEvent('ticket.pdf.download.succeeded', {
        paymentReference,
        sizeBytes: blob.size,
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `katina-ticket-${paymentReference}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      logFrontendEvent('ticket.pdf.download.error', {
        paymentReference,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      setDownloadError('Unable to download ticket PDF right now.');
    } finally {
      setIsDownloadingPdf(false);
    }
  };

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

        {isSyncingReservation && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full border border-[#F4F4F2]/25 bg-[#4E1413]/60 px-4 py-3"
          >
            <div className="flex items-center justify-between text-[10px] font-label-caps uppercase tracking-[0.2em] text-[#F4F4F2] font-bold">
              <span>Syncing Ticket Details</span>
              <span>In Progress</span>
            </div>
            <div className="mt-2 h-1 w-full overflow-hidden bg-[#F4F4F2]/15">
              <motion.div
                className="h-full bg-[#F4F4F2]"
                animate={{ x: ['-100%', '100%'] }}
                transition={{ repeat: Infinity, duration: 1.2, ease: 'linear' }}
              />
            </div>
          </motion.div>
        )}

        {syncError && (
          <div className="w-full border border-red-300/35 bg-red-900/30 px-4 py-3 text-red-100 text-sm font-sans flex items-center justify-between gap-4">
            <span>{syncError}</span>
            <button
              type="button"
              onClick={() => setSyncAttempt((prev) => prev + 1)}
              className="text-[10px] font-label-caps tracking-widest uppercase border border-red-200/40 px-3 py-1 hover:bg-red-800/35 transition-colors cursor-pointer"
            >
              Retry
            </button>
          </div>
        )}

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
            <img
              src={logoAndBackground}
              alt="Brand mark"
              className="absolute top-4 right-4 w-16 h-16 md:w-20 md:h-20 object-contain opacity-30 pointer-events-none select-none z-10"
            />
            
            {/* Header section with brand and star icon */}
            <div className="p-8 md:p-10 flex flex-col gap-6 relative">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="font-display text-4xl tracking-widest text-[#F4F4F2] uppercase leading-none select-none font-bold">
                    KATINA BASIL
                  </h2>
                  <p className="font-label-caps text-[10px] text-[#F4F4F2] mt-2 flex items-center gap-1 font-bold tracking-wider">
                    <Sparkles className="w-3.5 h-3.5 text-[#F4F4F2] animate-pulse" />
                    {selectedPackage.id === 'vip' ? 'Priority Access Credential' : 'General admittance pass'}
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
                    <span className="text-xs sm:text-sm text-[#F4F4F2] font-bold">Fashion Show</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="font-label-caps text-[9px] text-[#F4F4F2]/60 mb-0.5 font-bold">Date</span>
                    <span className="text-xs sm:text-sm text-[#F4F4F2] font-semibold">30 October 2026</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="font-label-caps text-[9px] text-[#F4F4F2]/60 mb-0.5 font-bold">Time</span>
                    <span className="text-xs sm:text-sm text-[#F4F4F2] font-semibold">6:00 PM - 9:00 PM</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="font-label-caps text-[9px] text-[#F4F4F2]/60 mb-0.5 font-bold">Location</span>
                    <span className="text-xs sm:text-sm text-[#F4F4F2] font-semibold">Mulungushi Conference Centre</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="font-label-caps text-[9px] text-[#F4F4F2]/60 mb-0.5 font-bold">Seat</span>
                    <span className="text-xs sm:text-sm text-[#F4F4F2] font-bold">{seatId}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="font-label-caps text-[9px] text-[#F4F4F2]/60 mb-0.5 font-bold">Payment</span>
                    <span className="text-xs sm:text-sm text-[#F4F4F2] font-semibold">{paymentLabel}</span>
                  </div>
                </div>
              </div>

              {/* Barcode/Cryptographic QR Code container */}
              <div className="flex flex-col items-center gap-3 shrink-0">
                <div className="w-36 h-36 bg-[#F4F4F2] rounded-none border border-[#F4F4F2]/30 p-2 relative overflow-hidden group-hover:border-[#F4F4F2]/60 transition-colors">
                  <QRCodeSVG
                    value={ticketToken}
                    size={128}
                    bgColor="#F4F4F2"
                    fgColor="#111111"
                    level="M"
                    includeMargin={false}
                    className="w-full h-full"
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
            onClick={handleDownloadPdf}
            disabled={isDownloadingPdf}
            className="w-full sm:w-auto px-8 py-4 bg-transparent border border-[#F4F4F2]/30 text-[#F4F4F2] font-label-caps text-[11px] flex items-center justify-center gap-2 hover:border-[#F4F4F2] hover:text-[#F4F4F2] hover:bg-[#F4F4F2]/10 transition-all duration-500 rounded-none cursor-pointer"
          >
            <Download className="w-4 h-4 shrink-0" />
            <span>{isDownloadingPdf ? 'DOWNLOADING...' : 'DOWNLOAD TICKET'}</span>
          </button>
        </div>

        {downloadError && (
          <div className="w-full border border-red-300/35 bg-red-900/30 px-4 py-3 text-red-100 text-sm font-sans">
            {downloadError}
          </div>
        )}

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
