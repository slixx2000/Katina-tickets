import { motion } from 'motion/react';
import { ShieldCheck } from 'lucide-react';
import { SignInButton } from '@clerk/react';

export default function CustomerAuthGate() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#666E54] text-[#F4F4F2] px-6 py-24">
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.25, 1, 0.5, 1] }}
        className="w-full max-w-xl border border-[#F4F4F2]/20 bg-[#4E1413] p-8 md:p-10 shadow-2xl"
      >
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 border border-[#F4F4F2]/30 bg-[#F4F4F2]/10 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-[#F4F4F2]" />
          </div>
          <h1 className="font-headline-sm text-2xl md:text-3xl font-bold">Sign In To Continue</h1>
        </div>

        <p className="text-sm text-[#F4F4F2]/80 leading-relaxed mb-8 font-sans">
          Ticket purchases require an authenticated customer account. Continue with Clerk sign in to protect
          reservations, ticket ownership, and download access.
        </p>

        <SignInButton mode="modal">
          <button
            type="button"
            className="w-full border border-[#F4F4F2] bg-[#F4F4F2] text-[#4E1413] font-label-caps text-xs tracking-[0.2em] py-4 font-bold hover:bg-[#ecebe8] transition-colors cursor-pointer inline-flex items-center justify-center gap-3"
          >
            Sign In
          </button>
        </SignInButton>
      </motion.div>
    </div>
  );
}
