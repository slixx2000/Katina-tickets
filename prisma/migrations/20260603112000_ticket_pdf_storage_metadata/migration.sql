-- Persist ticket PDF storage metadata for Supabase Storage integration

ALTER TABLE "Ticket"
  ADD COLUMN "pdfStoragePath" TEXT,
  ADD COLUMN "pdfChecksum" TEXT,
  ADD COLUMN "pdfGeneratedAt" TIMESTAMP(3);

CREATE INDEX "Ticket_pdfStoragePath_idx" ON "Ticket"("pdfStoragePath");
