-- Align ticket inventory to Fashion Show package pricing and caps.
-- Preserve sold count by recalculating remaining as max(new_cap - sold, 0).

UPDATE "TicketInventory"
SET
  "price" = 725,
  "remaining" = GREATEST(600 - GREATEST("totalCap" - "remaining", 0), 0),
  "totalCap" = 600,
  "updatedAt" = NOW()
WHERE "type" = 'ORDINARY';

UPDATE "TicketInventory"
SET
  "price" = 1250,
  "remaining" = GREATEST(300 - GREATEST("totalCap" - "remaining", 0), 0),
  "totalCap" = 300,
  "updatedAt" = NOW()
WHERE "type" = 'VIP';
