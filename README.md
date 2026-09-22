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
3. Install and set up:
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
  - **Build Command:** `npm install && npm run build`
  - **Start Command:** `npm run start`
  - **Instance Type:** Free
- Under **Environment Variables**, add:
  - `DATABASE_URL` → your Neon connection string (same one from local dev)
- Click **Create Web Service**

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
- **Deploys via `prisma db push`, not real migrations** — no migration history or rollback path,
  which is also why several tables enforce "one row per user per key" in application code
  instead of a real database unique constraint. See the schema's own comments for specifics.
