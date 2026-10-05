-- The Planner's weekend menu: whether the weekend block is shown at all, and
-- whether it also takes in the evening (supper) before its first day. Both on
-- until the user changes them; the days themselves are User.weekendDays.
ALTER TABLE "User" ADD COLUMN "weekendOn" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN "weekendEve" BOOLEAN NOT NULL DEFAULT true;
