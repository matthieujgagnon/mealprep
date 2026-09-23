# The Matt Mo Cookbook

## Stack
- **Frontend:** React + Vite, plain CSS, @dnd-kit for drag-and-drop
- **Backend:** Node + Express
- **DB:** Postgres via Prisma (hosted on Neon — see deployment below)

## Local development

1. Create a free Postgres database at [neon.tech](https://neon.tech) and copy its connection string.
2. Put it in `server/.env`:
   ```
   DATABASE_URL="postgresql://...your Neon connection string..."
   PORT=4000
   GEMINI_API_KEY="...your Gemini API key..."
   ```
   `GEMINI_API_KEY` is only needed for flyer-deal extraction (uploading a flyer PDF/photo on the
   Flyers tab) — everything else works without it.
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
  - `GEMINI_API_KEY` → only needed for flyer-deal extraction
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

### Updating the live site after future code changes
```bash
git add .
git commit -m "describe what changed"
git push
```
Render automatically redeploys on every push to `main`.

## Running tests
- **Unit tests** (pure logic — date math, quantity/price parsing, the Le Rabais scraper, the
  recipe-import SSRF guard — no database needed):
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
