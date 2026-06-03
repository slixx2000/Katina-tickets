import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, Download, Ticket, Calendar, MapPin, Loader2, RefreshCw, LogOut } from 'lucide-react';
import type { AppSessionUser } from '../auth/session';

type TicketRecord = {
  paymentReference: string;
  ticketType: 'ordinary' | 'vip';
  quantity: number;
  fullName: string;
  email: string;
  seatDetails: string[];
  paymentStatus: string;
  purchasedAt: string;
  pdf?: {
    available: boolean;
    generatedAt: string | null;
  };
};

interface MyTicketsProps {
  onBack: () => void;
  currentUser: AppSessionUser | null;
  onSignOut: () => Promise<void>;
}

export default function MyTickets({ onBack, currentUser, onSignOut }: MyTicketsProps) {
  const [items, setItems] = useState<TicketRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadingRef, setDownloadingRef] = useState<string | null>(null);

  const paidItems = useMemo(
    () => items.filter((item) => item.paymentStatus === 'PAID'),
    [items],
  );

  const loadTickets = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/me/tickets', {
        credentials: 'include',
        headers: {
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          setError('Sign in is required to view your tickets.');
        } else if (response.status === 429) {
          setError('Too many requests. Please wait and try again.');
        } else {
          setError('Unable to load your tickets right now.');
        }
        return;
      }

      const payload = await response.json();
      const records = Array.isArray(payload?.items) ? payload.items : [];
      setItems(records as TicketRecord[]);
    } catch {
      setError('Network error while loading ticket history.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadTickets();
  }, []);

  const handleDownload = async (reference: string) => {
    setDownloadingRef(reference);
    setError(null);

    try {
      const response = await fetch(`/api/payments/${encodeURIComponent(reference)}/ticket-pdf`, {
        credentials: 'include',
      });

      if (!response.ok) {
        if (response.status === 401) {
          setError('Sign in again to download your ticket PDF.');
        } else if (response.status === 403) {
          setError('This ticket is not available for your account.');
        } else if (response.status === 429) {
          setError('Download rate limit reached. Please retry shortly.');
        } else {
          const payload = await response.json().catch(() => null);
          setError(payload?.message || 'Unable to download ticket PDF.');
        }
        return;
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `katina-ticket-${reference}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError('Unable to download ticket PDF right now.');
    } finally {
      setDownloadingRef(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#666E54] text-[#F4F4F2] pt-32 pb-24 px-6 md:px-20">
      <div className="max-w-5xl mx-auto">
        <button
          type="button"
          onClick={onBack}
          className="group mb-8 inline-flex items-center gap-2 text-xs font-label-caps tracking-widest text-[#F4F4F2]/75 hover:text-[#F4F4F2] transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          Back
        </button>

        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8">
          <div>
            <p className="font-label-caps text-[10px] tracking-[0.28em] text-[#F4F4F2]/65 uppercase mb-2">Customer Portal</p>
            <h1 className="font-display text-4xl sm:text-5xl font-bold">My Tickets</h1>
          </div>
          <button
            type="button"
            onClick={() => void loadTickets()}
            className="inline-flex items-center gap-2 px-4 py-2 border border-[#F4F4F2]/35 hover:border-[#F4F4F2] text-xs font-label-caps tracking-widest uppercase transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
        </div>

        <div className="border border-[#F4F4F2]/20 bg-[#4E1413]/65 p-5 mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="font-label-caps text-[10px] tracking-[0.2em] uppercase text-[#F4F4F2]/60 mb-2">Session</p>
            <p className="text-sm font-sans text-[#F4F4F2] font-semibold">{currentUser?.email ?? 'Unknown account'}</p>
            <p className="text-xs font-sans text-[#F4F4F2]/70 mt-1">Role: {currentUser?.role ?? 'CUSTOMER'} • Status: Active</p>
          </div>
          <button
            type="button"
            onClick={() => void onSignOut()}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 border border-[#F4F4F2]/35 hover:border-[#F4F4F2] text-xs font-label-caps tracking-widest uppercase transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </button>
        </div>

        {isLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="border border-[#F4F4F2]/20 bg-[#4E1413]/65 p-6"
          >
            <div className="flex items-center justify-between text-[10px] font-label-caps uppercase tracking-[0.2em] font-bold mb-3">
              <span>Loading Ticket Ledger</span>
              <Loader2 className="w-4 h-4 animate-spin" />
            </div>
            <div className="space-y-3">
              <div className="h-3 bg-[#F4F4F2]/20 animate-pulse" />
              <div className="h-3 bg-[#F4F4F2]/15 animate-pulse" />
              <div className="h-3 bg-[#F4F4F2]/10 animate-pulse" />
            </div>
          </motion.div>
        )}

        {!isLoading && error && (
          <div className="border border-red-300/35 bg-red-900/30 px-4 py-3 text-red-100 text-sm font-sans mb-6">
            {error}
          </div>
        )}

        {!isLoading && !error && paidItems.length === 0 && (
          <div className="border border-[#F4F4F2]/20 bg-[#4E1413]/45 p-8 text-center">
            <Ticket className="w-8 h-8 mx-auto mb-3 text-[#F4F4F2]/70" />
            <p className="font-label-caps text-xs tracking-widest uppercase text-[#F4F4F2]/80 mb-2">No Paid Tickets Yet</p>
            <p className="text-sm text-[#F4F4F2]/70 font-sans">Once your purchase is completed, your tickets will appear here for quick download.</p>
          </div>
        )}

        {!isLoading && !error && paidItems.length > 0 && (
          <div className="space-y-4">
            {paidItems.map((item) => (
              <div
                key={item.paymentReference}
                className="border border-[#F4F4F2]/20 bg-[#4E1413]/65 p-5 md:p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-5"
              >
                <div className="space-y-2">
                  <p className="font-label-caps text-[10px] tracking-[0.22em] uppercase text-[#F4F4F2]/65">
                    {item.ticketType === 'vip' ? 'Priority Ticket' : 'Ordinary Ticket'}
                  </p>
                  <p className="font-headline-sm text-xl font-bold">{item.fullName}</p>
                  <div className="text-xs text-[#F4F4F2]/75 font-sans flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                    <span className="inline-flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" /> {new Date(item.purchasedAt).toLocaleString()}</span>
                    <span className="inline-flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" /> Mulungushi Conference Centre</span>
                  </div>
                  <p className="text-xs text-[#F4F4F2]/70 font-mono">Ref: {item.paymentReference}</p>
                  <p className="text-xs text-[#F4F4F2]/75 font-sans">Seats: {item.seatDetails.length > 0 ? item.seatDetails.join(', ') : 'Pending assignment'}</p>
                  <p className="text-[10px] text-[#F4F4F2]/60 font-label-caps tracking-widest uppercase">
                    PDF {item.pdf?.available ? 'Synced' : 'Pending'}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => void handleDownload(item.paymentReference)}
                  disabled={downloadingRef === item.paymentReference}
                  className="w-full md:w-auto px-6 py-3 border border-[#F4F4F2]/35 hover:border-[#F4F4F2] text-[#F4F4F2] font-label-caps text-[10px] tracking-[0.2em] uppercase inline-flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  {downloadingRef === item.paymentReference ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                  {downloadingRef === item.paymentReference ? 'Downloading...' : 'Download PDF'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
