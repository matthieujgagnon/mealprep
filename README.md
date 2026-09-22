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
  - **Build Command:** `cd client && npm install && npm run build && cd ../server && npm install && npx prisma generate && npx prisma db push`
  - **Start Command:** `npm run start`
  - **Instance Type:** Free
- Under **Environment Variables**, add:
  - `DATABASE_URL` → your Neon connection string (same one from local dev)
  - `GEMINI_API_KEY` → only needed for flyer-deal extraction
- Click **Create Web Service**

**One-time step to switch this to real migrations:** this repo now has a real migration
history (`server/prisma/migrations/`) instead of relying on `prisma db push`, but your
already-deployed database doesn't know that yet — it was built up entirely via `db push`,
so simply switching the Build Command to `prisma migrate deploy` would fail (it would try
to re-create tables that already exist). To switch over without touching any data:
1. From your machine, with your production `DATABASE_URL` (from Render's Environment tab)
   set locally, run:
   ```bash
   cd server
   DATABASE_URL="<your production connection string>" npx prisma migrate resolve --applied 20260922004115_init
   ```
   This only marks that migration as already-applied — it doesn't run any SQL, so it's safe
   and doesn't touch your existing data.
2. Change Render's **Build Command** to:
   ```
   cd client && npm install && npm run build && cd ../server && npm install && npx prisma generate && npx prisma migrate deploy
   ```
3. Push/redeploy. That next build will apply the one real pending migration (adding a few
   database-level "no duplicates" constraints) and you're fully on migrations from then on.

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

## Known gaps / next steps
- **Ingredient parsing on import is best-effort** — works well for standard formats, occasional
  manual correction may be needed for unusual phrasing.
- **No automated tests or CI** — every change in this repo's history has been verified by hand
  (Playwright against a real local Postgres). Fine for a single-developer personal project;
  worth adding before the app has more than one contributor.
- **Production is still deployed via `prisma db push`** — the repo has a real migration
  history now (see the "One-time step" above), but production hasn't been switched over to
  it yet. Once it is, every table that needs "no duplicates per account" enforces it with a
  real database constraint instead of just application code.
