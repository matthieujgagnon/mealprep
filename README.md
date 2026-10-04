# The Matt Mo Cookbook

## Stack
- **Frontend:** React + Vite, plain CSS, @dnd-kit for drag-and-drop
- **Backend:** Node + Express
- **DB:** Postgres via Prisma (hosted on Neon — see deployment below)

New to the code? [docs/how-it-works.md](docs/how-it-works.md) maps the stack, folders, data sources and quality gates.

## Local development

1. Create a free Postgres database at [neon.tech](https://neon.tech) and copy its connection string.
2. Put it in `server/.env`:
   ```
   DATABASE_URL="postgresql://...your Neon connection string..."
   PORT=4000
   GEMINI_API_KEY="...your Gemini API key..."
   RESEND_API_KEY="...your Resend API key..."
   APP_URL="http://localhost:5173"
   ```
   `GEMINI_API_KEY` is only needed for flyer-deal extraction (uploading a flyer PDF/photo on the
   Flyers tab) and receipt import (the Inventory tab) — everything else works without it. `RESEND_API_KEY` (from
   [resend.com](https://resend.com), free tier is enough for a handful of accounts) is only needed
   for "forgot password" emails — without it, signup/login/using the app all still work, people
   just can't reset a forgotten password themselves. `APP_URL` is the address the reset link in
   that email points back to — set it to wherever the app is actually reachable (your Render URL
   in production, `http://localhost:5173` locally).
3. Install and set up (applies the existing migration history to your database):
   ```bash
   npm install
   cd server && npx prisma migrate dev && cd ..
   ```
4. Run it (two terminals):
   ```bash
   npm run dev:server     # http://localhost:4000
   npm run dev:client     # http://localhost:5173
   ```

## Deploying it online (so it works on your phone anywhere)

This puts your code on GitHub, your database on Neon (already set up above), and your
running app on Render — all free tiers.

### 1. Push the code to GitHub
- Create a new repo at [github.com/new](https://github.com/new) (private or public, your choice)
- In the project folder:
  ```bash
  git init
  git add .
  git commit -m "Initial commit"
  git branch -M main
  git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
  git push -u origin main
  ```

### 2. Deploy on Render
- Go to [render.com](https://render.com), sign up (GitHub login is easiest), click **New +** → **Web Service**
- Connect your GitHub repo
- Settings:
  - **Build Command:** `cd client && npm install && npm run build && cd ../server && npm install && npx prisma generate && npx prisma migrate deploy`
  - **Start Command:** `npm run start`
  - **Instance Type:** Free
- Under **Environment Variables**, add:
  - `DATABASE_URL` → your Neon connection string (same one from local dev)
  - `GEMINI_API_KEY` → only needed for flyer-deal extraction and receipt import
  - `RESEND_API_KEY` → only needed for "forgot password" emails to work
  - `APP_URL` → your Render URL once you have it (e.g. `https://mattmocookbook.onrender.com`) —
    can be added/updated after the first deploy
- Click **Create Web Service**

Every table that needs "no duplicates per account" enforces it with a real database
constraint, applied via `server/prisma/migrations/` — the same migration history `npm test`'s
CI run applies to a fresh database on every push.

Render will build and deploy — takes a few minutes the first time. You'll get a URL like
`https://mattmocookbook.onrender.com`. That's it — open that URL on your phone's browser
and bookmark it (or "Add to Home Screen" for an app-like icon).

**Free tier note:** the app "falls asleep" after 15 minutes of no traffic and takes
20–50 seconds to wake back up on the next visit. Upgrading to a paid instance (~$7/month)
removes this delay if it ever becomes annoying.

### Weekly database backup
A GitHub Action (`.github/workflows/db-backup.yml`) copies the Neon database every Sunday at
3 a.m. Montreal time, encrypts it, and keeps the encrypted file for 30 days. It needs two
repository secrets, `BACKUP_DATABASE_URL` and `BACKUP_PASSPHRASE`; how to add them, and how to
download, decrypt and restore a backup, is in [docs/backup-and-restore.md](docs/backup-and-restore.md).

### Weekly flyer import
The Flyers tab imports this week's flyers on its own every Thursday: every priced item from
the stores picked under **Flyers → Settings** (Metro, IGA, Maxi, Super C and Provigo by default),
read from Flipp (each item's own page, for its unit, size and regular price). Each week's prices are kept, which is what the
6-month price history on each deal is built from. **Import now** runs it any time.

The app checks hourly while it's awake. Because a free Render service sleeps, a GitHub Action
(`.github/workflows/flyer-import.yml`) wakes it on Thursday and Friday mornings. To turn that on:
1. Make up a long random password, e.g. from `openssl rand -hex 32`.
2. On Render, add the environment variable `CRON_SECRET` with that value.
3. On GitHub, under the repo's **Settings → Secrets and variables → Actions**, add two
   repository secrets: `CRON_SECRET` (the same value) and `APP_URL` (your Render URL).
4. Optional: run it once by hand from the **Actions** tab (**Weekly flyer import → Run workflow**).

Flipp has no official API; the import reads the same data Flipp's own website loads, so it can
break if Flipp changes it. When that happens the Flyers tab says so under the Import now button,
and last week's deals stay until an import works.

### Quebec average prices
Until an item has its own price history, deals are compared with Quebec's average price for the
same product from Statistics Canada (table 18-10-0245-01, monthly retail prices from checkout
data): "23% under QC avg", and a Quebec-average box in each deal's detail. The app refreshes those
averages about once a week through Statistics Canada's public Web Data Service - no key needed,
on the same hourly check and weekly wake-up as the flyer import.

### Updating the live site after future code changes
```bash
git add .
git commit -m "describe what changed"
git push
```
Render automatically redeploys on every push to `main`.

## Running tests
- **Unit tests** (mostly pure logic — date math, quantity/price parsing, the Flipp
  reader, the recipe-import SSRF guard; the flyer-import test also uses the database when one
  is reachable, and skips itself otherwise):
  ```bash
  npm test
  ```
- **End-to-end tests** (a handful of real browser smoke tests — signup, add a recipe, use the
  inventory and grocery list — against a real Postgres):
  ```bash
  npm run build          # needs DATABASE_URL set, same as local dev setup above
  npx playwright install --with-deps chromium   # first time only
  npm run test:e2e
  ```
- Both run automatically on every push and pull request via GitHub Actions
  (`.github/workflows/ci.yml`), against a fresh throwaway Postgres.

## Known gaps / next steps
- **Ingredient parsing on import is best-effort** — works well for standard formats, occasional
  manual correction may be needed for unusual phrasing.
- **Test coverage is a starting point, not exhaustive** — unit tests cover the trickiest pure
  logic, and a few E2E smoke tests cover the critical path across each major feature area, but
  most day-to-day changes are still verified by hand (Playwright against a real local Postgres)
  the same way they always have been. Worth expanding as the app gets more real users.
