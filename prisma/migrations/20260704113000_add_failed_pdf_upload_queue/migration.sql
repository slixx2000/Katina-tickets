-- Durable queue for failed ticket PDF storage uploads.
CREATE TYPE "PdfUploadRetryStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'EXHAUSTED');

CREATE TABLE "FailedPdfUpload" (
  "id" TEXT NOT NULL,
  "paymentReference" TEXT NOT NULL,
  "ticketRecordId" TEXT NOT NULL,
  "ticketPublicId" TEXT NOT NULL,
  "storagePath" TEXT NOT NULL,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "status" "PdfUploadRetryStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "lastAttemptAt" TIMESTAMP(3),
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "FailedPdfUpload_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FailedPdfUpload_ticketRecordId_key" ON "FailedPdfUpload"("ticketRecordId");
CREATE INDEX "FailedPdfUpload_status_nextAttemptAt_idx" ON "FailedPdfUpload"("status", "nextAttemptAt");
CREATE INDEX "FailedPdfUpload_paymentReference_idx" ON "FailedPdfUpload"("paymentReference");

ALTER TABLE "FailedPdfUpload"
ADD CONSTRAINT "FailedPdfUpload_ticketRecordId_fkey"
FOREIGN KEY ("ticketRecordId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
