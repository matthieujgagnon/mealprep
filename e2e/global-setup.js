import { PrismaClient } from "@prisma/client";
import { E2E_INVITE } from "./invite.js";

// Runs once before the browser tests: makes (or resets) the invite code every
// test account signs up with (e2e/invite.js).
export default async function globalSetup() {
  const prisma = new PrismaClient();
  try {
    const fresh = { note: "browser tests", maxUses: 1_000_000, usedCount: 0, expiresAt: null, active: true };
    await prisma.inviteCode.upsert({ where: { code: E2E_INVITE }, update: fresh, create: { code: E2E_INVITE, ...fresh } });
  } finally {
    await prisma.$disconnect();
  }
}
