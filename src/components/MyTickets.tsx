import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Download, Ticket, Calendar, MapPin, Loader2, RefreshCw } from 'lucide-react';

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
  tickets?: Array<{
    id: string;
    ticketId: string;
    token: string;
    status: 'ACTIVE' | 'CHECKED_IN' | 'REFUNDED' | 'CANCELLED';
    pdf?: {
      available: boolean;
      generatedAt: string | null;
    };
  }>;
};

export default function MyTickets() {
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

  const handleDownload = async (reference: string, ticketId?: string) => {
    const downloadKey = ticketId ? `${reference}:${ticketId}` : reference;
    setDownloadingRef(downloadKey);
    setError(null);

    try {
      const query = ticketId ? `?ticketId=${encodeURIComponent(ticketId)}` : '';
      const response = await fetch(`/api/payments/${encodeURIComponent(reference)}/ticket-pdf${query}`, {
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
      anchor.download = ticketId ? `katina-ticket-${ticketId}.pdf` : `katina-ticket-${reference}.pdf`;
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

                <div className="w-full md:w-auto space-y-2">
                  {(item.tickets && item.tickets.length > 0 ? item.tickets : []).map((ticket) => {
                    const downloadKey = `${item.paymentReference}:${ticket.id}`;
                    return (
                      <div key={ticket.id} className="border border-[#F4F4F2]/20 px-3 py-2 min-w-[260px]">
                        <p className="text-[10px] text-[#F4F4F2]/80 font-label-caps tracking-widest uppercase">{ticket.ticketId}</p>
                        <p className="text-[10px] text-[#F4F4F2]/65 font-mono break-all mt-1">{ticket.token}</p>
                        <button
                          type="button"
                          onClick={() => void handleDownload(item.paymentReference, ticket.id)}
                          disabled={downloadingRef === downloadKey}
                          className="mt-2 w-full px-4 py-2 border border-[#F4F4F2]/35 hover:border-[#F4F4F2] text-[#F4F4F2] font-label-caps text-[10px] tracking-[0.2em] uppercase inline-flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed"
                        >
                          {downloadingRef === downloadKey ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                          {downloadingRef === downloadKey ? 'Downloading...' : 'Download Ticket PDF'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
