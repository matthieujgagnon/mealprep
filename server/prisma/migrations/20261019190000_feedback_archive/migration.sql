-- Feedback inbox Archive: handled feedback leaves the inbox without being deleted.
-- Add-only: one new nullable column on Feedback, no default. Null means "in the
-- inbox", so every existing row stays in the inbox. Archiving only sets the date and
-- "Back to inbox" sets it back to null; nothing is ever deleted by archiving.
-- It is separate from "doneAt" (Done = handled, Archive = out of sight).
ALTER TABLE "Feedback" ADD COLUMN "archivedAt" TIMESTAMP(3);
