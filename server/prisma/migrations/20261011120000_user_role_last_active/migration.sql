-- Admin: a role and a "last active" date on each account. Only adds fields;
-- nothing is dropped or renamed.
--
-- role: "member" or "admin". It records what the server last worked out from
-- the ADMIN_EMAILS environment variable and never makes anyone an admin on its
-- own: only ADMIN_EMAILS does, checked on every /api/admin call
-- (server/src/lib/admin.js).
ALTER TABLE "User" ADD COLUMN "role" TEXT NOT NULL DEFAULT 'member';

-- lastActiveAt: when the account last used the app, written at most every
-- 15 minutes. Empty until the account's next visit.
ALTER TABLE "User" ADD COLUMN "lastActiveAt" TIMESTAMP(3);
