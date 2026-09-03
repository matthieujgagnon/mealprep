```markdown
# The Matt Mo Cookbook

A personal meal prep planner, recipe manager, and grocery list organizer built for mobile use in the kitchen and grocery store.

**Live Demo:** [mealprep-client-sigma.vercel.app](https://mealprep-client-sigma.vercel.app)

## Tech Stack

* **Frontend:** React, Vite, CSS, `@dnd-kit`
* **Backend:** Node.js, Express
* **Database:** PostgreSQL via Prisma (Neon)
* **Hosting:** Vercel (Client) + Render (API)

## Local Setup

1. **Install dependencies:**
   ```bash
   npm install

```

2. **Configure environment:**
Add a `server/.env` file:
```env
DATABASE_URL="your-neon-postgres-connection-string"
PORT=4000

```


3. **Run migrations:**
```bash
cd server && npx prisma migrate dev && cd ..

```


4. **Start the app:**
```bash
npm run dev:server   # http://localhost:4000
npm run dev:client   # http://localhost:5173

```



## Notes & Roadmap

* **Flyer Deals:** `server/src/routes/deals.js` currently uses mock flyer data modeled after Reebee/Flipp until a live feed is wired up.
* **Auth:** Open access by design for personal use; auth will be added later if needed.
* **Ingredient Parsing:** Best-effort parsing on import; occasional manual formatting required for non-standard units.

```

```
