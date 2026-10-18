-- Feedback: the app's Feedback form and the Admin "Feedback inbox". Only adds a
-- table; nothing existing is changed, dropped or renamed.
--
-- A row is what a signed-in tester sent: their words, what kind it is, and what the
-- app attached by itself (page, language, phone or computer, window size, browser,
-- app version). "doneAt" is Matt's Done tick. Rows go with their user
-- (ON DELETE CASCADE).

-- CreateTable
CREATE TABLE "Feedback" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "page" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "device" TEXT NOT NULL,
    "screen" TEXT NOT NULL,
    "browser" TEXT NOT NULL,
    "appVersion" TEXT NOT NULL,
    "errorName" TEXT,
    "doneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Feedback_createdAt_idx" ON "Feedback"("createdAt");

-- CreateIndex
CREATE INDEX "Feedback_userId_createdAt_idx" ON "Feedback"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
