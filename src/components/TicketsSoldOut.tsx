import { motion } from 'motion/react';
import { AlertTriangle, ArrowLeft, Ticket } from 'lucide-react';

type TicketsSoldOutProps = {
  onBackHome: () => void;
  onViewTickets: () => void;
};

export default function TicketsSoldOut({ onBackHome, onViewTickets }: TicketsSoldOutProps) {
  return (
    <section className="relative min-h-screen bg-[#4E1413] pt-32 pb-24 px-6 md:px-20 overflow-hidden">
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_20%_20%,rgba(244,244,242,0.08),transparent_55%),radial-gradient(circle_at_80%_10%,rgba(223,227,176,0.15),transparent_45%)]" />

      <div className="relative z-10 mx-auto max-w-3xl border border-[#F4F4F2]/25 bg-[#2F0C0B]/70 p-8 md:p-12 text-[#F4F4F2] shadow-[0_30px_80px_rgba(0,0,0,0.35)]">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex items-center gap-3"
        >
          <AlertTriangle className="h-5 w-5 text-[#dfe3b0]" />
          <p className="font-label-caps text-[10px] tracking-[0.2em] uppercase text-[#F4F4F2]/75">Inventory update</p>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.5 }}
          className="mt-4 font-display text-4xl sm:text-5xl leading-none"
        >
          Tickets Sold Out
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          className="mt-5 text-sm sm:text-base text-[#F4F4F2]/85 leading-relaxed"
        >
          All allocations for this event are currently sold out. If any seats are released or a waitlist opens, new inventory will appear automatically.
        </motion.p>

        <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onBackHome}
            className="inline-flex items-center justify-center gap-2 border border-[#F4F4F2]/40 px-4 py-3 text-[10px] tracking-[0.18em] uppercase font-label-caps hover:bg-[#F4F4F2]/10 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Home
          </button>
          <button
            type="button"
            onClick={onViewTickets}
            className="inline-flex items-center justify-center gap-2 border border-[#dfe3b0] bg-[#dfe3b0] px-4 py-3 text-[10px] tracking-[0.18em] uppercase font-label-caps text-[#2F0C0B] hover:opacity-90 transition-opacity"
          >
            <Ticket className="h-4 w-4" />
            View My Tickets
          </button>
        </div>
      </div>
    </section>
  );
}
