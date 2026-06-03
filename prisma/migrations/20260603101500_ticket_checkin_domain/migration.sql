-- Production ticket validation and check-in domain

CREATE TYPE "TicketStatus" AS ENUM ('ACTIVE', 'CHECKED_IN', 'REFUNDED', 'CANCELLED');
CREATE TYPE "TicketScanResult" AS ENUM ('VALID', 'ALREADY_CHECKED_IN', 'REFUNDED', 'CANCELLED', 'INVALID_TICKET');

CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Ticket" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "qrCodeValue" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "ticketType" "TicketInventoryType" NOT NULL,
    "holderName" TEXT NOT NULL,
    "holderEmail" TEXT NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'ACTIVE',
    "checkedInAt" TIMESTAMP(3),
    "checkedInByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TicketScanLog" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT,
    "scannerAdminId" TEXT,
    "scanTimestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "result" "TicketScanResult" NOT NULL,
    "deviceInfo" JSONB,
    "scannedValue" TEXT NOT NULL,
    CONSTRAINT "TicketScanLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TicketSequence" (
    "id" INTEGER NOT NULL,
    "lastIssued" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TicketSequence_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Event_slug_key" ON "Event"("slug");
CREATE INDEX "Event_createdAt_idx" ON "Event"("createdAt");

CREATE UNIQUE INDEX "Ticket_ticketId_key" ON "Ticket"("ticketId");
CREATE UNIQUE INDEX "Ticket_qrCodeValue_key" ON "Ticket"("qrCodeValue");
CREATE INDEX "Ticket_reservationId_idx" ON "Ticket"("reservationId");
CREATE INDEX "Ticket_eventId_idx" ON "Ticket"("eventId");
CREATE INDEX "Ticket_status_idx" ON "Ticket"("status");
CREATE INDEX "Ticket_holderEmail_idx" ON "Ticket"("holderEmail");
CREATE INDEX "Ticket_holderName_idx" ON "Ticket"("holderName");

CREATE INDEX "TicketScanLog_ticketId_idx" ON "TicketScanLog"("ticketId");
CREATE INDEX "TicketScanLog_scannerAdminId_idx" ON "TicketScanLog"("scannerAdminId");
CREATE INDEX "TicketScanLog_scanTimestamp_idx" ON "TicketScanLog"("scanTimestamp");
CREATE INDEX "TicketScanLog_result_idx" ON "TicketScanLog"("result");

ALTER TABLE "Ticket"
    ADD CONSTRAINT "Ticket_reservationId_fkey"
    FOREIGN KEY ("reservationId") REFERENCES "PaymentReservation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Ticket"
    ADD CONSTRAINT "Ticket_eventId_fkey"
    FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Ticket"
    ADD CONSTRAINT "Ticket_checkedInByAdminId_fkey"
    FOREIGN KEY ("checkedInByAdminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TicketScanLog"
    ADD CONSTRAINT "TicketScanLog_ticketId_fkey"
    FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TicketScanLog"
    ADD CONSTRAINT "TicketScanLog_scannerAdminId_fkey"
    FOREIGN KEY ("scannerAdminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
