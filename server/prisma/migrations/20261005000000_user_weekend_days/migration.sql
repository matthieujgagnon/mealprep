-- Which days of the week the Planner groups as the weekend, per account
-- (0 = Monday ... 6 = Sunday). Saturday and Sunday until the user changes it.
ALTER TABLE "User" ADD COLUMN "weekendDays" INTEGER[] NOT NULL DEFAULT ARRAY[5, 6]::INTEGER[];
