import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { memberRows } from "../lib/admin.js";

// Admin only. index.js mounts this router behind requireAuth and requireAdmin,
// so every route here (and any added later) refuses non-admins with 403
// before it runs.
export const adminRouter = Router();

// GET /api/admin/members - every account's email, signup date and last
// active (see memberRows in lib/admin.js). No other personal data.
adminRouter.get("/members", async (req, res) => {
  const users = await prisma.user.findMany({
    select: {
      email: true,
      createdAt: true,
      lastActiveAt: true,
      sessions: { select: { createdAt: true }, orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  res.json({ members: memberRows(users) });
});
