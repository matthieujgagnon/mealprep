import { Router } from "express";
import { timingSafeEqual } from "crypto";
import { runDueImports } from "../lib/flyerImport.js";
import { refreshBaselinesIfDue } from "../lib/baselines.js";
import { fail } from "../lib/i18n.js";

export const cronRouter = Router();

function authorized(req) {
  const secret = process.env.CRON_SECRET;
  const given = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!secret || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

// POST /api/cron/flyer-import - called by the weekly GitHub Action
// (.github/workflows/flyer-import.yml) with `Authorization: Bearer
// $CRON_SECRET`. Runs the import for every account that's due and reports
// how many ran, and refreshes the Statistics Canada averages when they're
// a week old. Without CRON_SECRET set on the server, it refuses.
cronRouter.post("/flyer-import", async (req, res) => {
  if (!process.env.CRON_SECRET) return res.status(503).json(fail(req, "cronSecretMissing"));
  if (!authorized(req)) return res.status(401).json(fail(req, "notAuthorized"));
  const [imports, baselines] = await Promise.all([runDueImports(), refreshBaselinesIfDue()]);
  res.json({ ...imports, baselines });
});
