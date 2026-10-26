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
   EMAIL_FROM="Matt Mo Cookbook <noreply@your-verified-domain>"
   APP_URL="http://localhost:5173"
   FEEDBACK_EMAIL_TO="...the address that should get an email for each feedback..."
   ```
   `GEMINI_API_KEY` is only needed for flyer-deal extraction (uploading a flyer PDF/photo on the
   Flyers tab) and receipt import (the Inventory tab) — everything else works without it. `RESEND_API_KEY` (from
   [resend.com](https://resend.com), free tier is enough for a handful of accounts) and `EMAIL_FROM`
   are only needed for "forgot password" emails, and both are needed: `EMAIL_FROM` is the address
   the emails come from, on a domain you have verified at [resend.com/domains](https://resend.com/domains).
   Resend's own test address only delivers to your own inbox, so the app doesn't use it: without
   both settings, signup/login/using the app all still work, the Forgot password page says
   "We can't send emails yet. Ask Matt for a reset link.", and an admin makes the link instead (see
   [Resetting a password](#resetting-a-password)). `APP_URL` is the address the reset link points
   back to — set it to wherever the app is actually reachable (your Render URL in production,
   `http://localhost:5173` locally).
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
  - `RESEND_API_KEY` and `EMAIL_FROM` → only needed for "forgot password" emails to work, and both
    are needed. Leave both out until you have verified a domain at Resend: until then, make reset
    links yourself (see [Resetting a password](#resetting-a-password)). When the domain is
    verified, set `EMAIL_FROM` to an address on it (for example
    `Matt Mo Cookbook <noreply@your-domain>`) next to your `RESEND_API_KEY`. No code change.
  - `APP_URL` → your Render URL once you have it (e.g. `https://mattmocookbook.onrender.com`) —
    can be added/updated after the first deploy
  - `ADMIN_EMAILS` → the email(s) of the account(s) that may open the Admin page, separated by
    commas. **Only list an email that already has an account**: signup refuses a listed email, so
    nobody else can claim it, and the server's log warns about a listed email with no account.
    Only this variable makes someone an admin; take an email out and that account loses Admin
    after the restart that follows the change.
  - `FEEDBACK_EMAIL_TO` → optional. The one address that gets a short email each time someone
    sends feedback from the app. Leave it out and no email is sent: everything still shows in
    **Admin menu → Feedback inbox**. It also needs `RESEND_API_KEY` and `EMAIL_FROM`; see
    [Feedback](#feedback) for what to set while Resend is still in testing mode.
- **Inviting people:** signup needs an invite code. Open **Admin → Invite codes** in the app to
  make one (with a note like "for Emilie", how many times it can be used and when it expires),
  send it to the person, and switch it off when you're done. **AI usage** on the same page sets
  how many flyer and receipt readings each account can do per day (10 to start) and shows
  today's use. Nothing to add in Render's settings for either.
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

### Resetting a password

While the app can't send emails (no `EMAIL_FROM` yet), a friend who forgot their password asks
you for a reset link. The link works once, expires after 1 hour, and signs them out of their other
devices when they use it. Send it only to them.

**The easy way (you are logged in as an admin):**
1. Open the app, open the round button at the top right and choose **Admin**.
2. In **Members**, press **Reset link** on their row.
3. Press **Copy** and send them the link (a text message works). Pressing **Reset link** again
   makes a new link and the first one stops working.

**If you are locked out yourself** (you forgot your password and no admin is logged in), run the
reset-link command. It prints a one-time link for any existing account:

*From Render's Shell.* Render only has the Shell tab on paid instances (not on Free):
1. In [render.com](https://dashboard.render.com), open your web service and click **Shell** in the left menu.
2. Type this, with your own email, and press Enter:
   ```
   npm run reset-link -- you@example.com
   ```
3. Copy the link it prints, open it in your browser, and choose a new password.

*From your own computer* (works on the Free plan). This uses the real database, so go slowly:
1. In the project folder, run these two once: `npm install`, then `npm run prisma:generate --workspace=server`.
2. Get two values from Render, under your service's **Environment**: `DATABASE_URL` and `APP_URL`.
   They are secrets: don't paste them in chats or commit them.
3. Type this, replacing the three parts, and press Enter (Mac or Linux; in Windows PowerShell set
   each name first, for example `$env:DATABASE_URL="..."`, then run `npm run reset-link -- you@example.com`):
   ```
   DATABASE_URL="…your DATABASE_URL…" APP_URL="https://mattmocookbook.onrender.com" npm run reset-link -- you@example.com
   ```
4. Copy the link it prints, open it, and choose a new password.

What it prints: one line saying the command was used (the time and the email, never the link), then
the link. For an email with no account it prints only `No such account.` That line shows in the
Shell window, or on your computer's screen: Render's **Logs** tab doesn't show what is run in a
Shell. A link made in Admin → Members is written to the Logs.

### Feedback
Friends tell you what's wrong, or what they'd like, from the round account button at the top
right → **Send feedback**. The last card of **Help** has the same button, and some error messages
have a **Report a problem** link. If the app itself breaks, its "Something went wrong" page has
one too. The app adds the page, the language, phone or computer and screen size, the browser, the
app version and the time; no screenshots and nothing from anyone's recipes or Inventory. Each
person can send 5 in 10 minutes and 30 a day.

**You read it all in the avatar menu → Feedback inbox** (admins only; the page is
`/admin/feedback`): newest first, who sent it, those details, and a **Done** button for each.
Press **Archive** on one you've dealt with to move it out of the **Inbox** tab into the
**Archive** tab (**Back to inbox** brings it back, and every move shows an Undo). **Archive all
done** moves every one you've ticked Done. Archiving never deletes anything, and it isn't the
same as Done: Done means handled, Archive means out of sight. Each tab shows 200 at a time; press
**Show older** for more. Nothing to set up for this.

**To also get an email for each one** (optional), add these three settings under your Render
service's **Environment**, then let it redeploy:
- `RESEND_API_KEY`: your key from [resend.com](https://resend.com) (see the local setup above).
- `EMAIL_FROM`: the address the email comes from. While Resend is in testing mode (no domain
  verified yet) Resend only sends from its own test sender address (the one named in Resend's
  docs and in the comment at the top of `server/src/lib/mailer.js`).
- `FEEDBACK_EMAIL_TO`: where it goes. While Resend is in testing mode this must be the email
  address of your Resend account, because Resend refuses every other address.

Setting `EMAIL_FROM` also switches on the "Forgot password" emails, and in testing mode Resend
refuses all but your own address. The Forgot password page still says "We can't send emails yet.
Ask Matt for a reset link." after the first refusal (for 10 minutes), so friends keep asking you
for a reset link as before; the feedback email never changes that. Once you verify a domain at
[resend.com/domains](https://resend.com/domains), put an address on it in `EMAIL_FROM`, and
`FEEDBACK_EMAIL_TO` can be any address. If the email can't be sent, the feedback is still saved
and in the inbox.

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
  inventory and grocery list — against a real Postgres; signup needs an invite code, so
  `e2e/global-setup.js` makes the tests' own code first, see `e2e/invite.js`):
  ```bash
  npm run build          # needs DATABASE_URL set, same as local dev setup above
  npx playwright install --with-deps chromium   # first time only
  npm run test:e2e
  ```
  The Planner specs count their days and weeks on the Quebec day (`e2e/quebec-day.js`,
  `e2e/spec-clock.js`) and run their browser in `America/Toronto`, so they give the same answer on a
  UTC machine at 9 p.m. Quebec time as on a laptop at noon. To check one on a particular moment, freeze the
  browser's clock to it: `E2E_NOW=2026-10-31T21:30:00-04:00 npx playwright test e2e/planner.spec.js`
  (the last evening of a month; also try a Sunday evening). A spec that needs a calendar of a given
  shape pins its own date instead.
- Both run automatically on every push and pull request via GitHub Actions
  (`.github/workflows/ci.yml`), against a fresh throwaway Postgres.

## Known gaps / next steps
- **Ingredient parsing on import is best-effort** — works well for standard formats, occasional
  manual correction may be needed for unusual phrasing.
- **Test coverage is a starting point, not exhaustive** — unit tests cover the trickiest pure
  logic, and a few E2E smoke tests cover the critical path across each major feature area, but
  most day-to-day changes are still verified by hand (Playwright against a real local Postgres)
  the same way they always have been. Worth expanding as the app gets more real users.
