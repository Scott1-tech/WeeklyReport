# Deploying FleetPulse (free, live data)

This app has two parts:

- **Frontend** — the FleetPulse dashboard (Vite + React).
- **Backend** — small serverless API functions in `api/` that read and write
  a real Postgres database (`drivers` and `trucks` tables). No spreadsheet,
  no manual sync step — every edit in the UI writes straight to the
  database, and the dashboard polls it so open tabs stay live.

Total cost: **$0**, using free tiers of Vercel (hosting) and Neon (Postgres).

## 1. Create the database (free, ~2 minutes)

The easiest path is through Vercel itself, but you can also do it directly at
neon.tech — either works, you just need a `DATABASE_URL` at the end.

**Option A — via Vercel (recommended, one less account to manage)**
1. After importing the project into Vercel (step 2 below), open the project
   → **Storage** tab → **Create Database** → **Neon** (Postgres) → follow the
   prompts (free tier).
2. Vercel automatically adds a `DATABASE_URL` environment variable to your
   project. You're done — skip to step 3.

**Option B — directly at neon.tech**
1. Go to https://neon.tech, sign up free, create a project.
2. Copy the connection string it gives you (starts with `postgres://...`,
   make sure it includes `?sslmode=require`).
3. You'll paste this into Vercel's environment variables in step 2.

No manual migration needed — the API creates the `drivers` and `trucks`
tables itself the first time it runs.

## 2. Deploy to Vercel (free, ~2 minutes)

1. Go to https://vercel.com, sign up free (GitHub login is easiest).
2. **Add New… → Project**, import this repository
   (`scott1-tech/WeeklyReport`), branch `claude/react-d3-driver-truck-dashboard-d98dqh`
   (or `main` once merged).
3. Vercel auto-detects Vite — leave the build settings as-is.
4. If you used **Option B** above, open **Environment Variables** and add:
   - `DATABASE_URL` = the connection string you copied from Neon
5. Click **Deploy**.

That's it — you'll get a live URL like `fleetpulse-weekly-report.vercel.app`.
Open it, add a driver or truck, and it's saved to the database immediately.

## 3. Using it day to day

- Open the deployed URL any time you need to update driver/truck status.
- Edit a driver or truck's **Status** and the **effective date** (hire date,
  termination date, or truck status date) — that's the only data entry
  needed. Every weekly count (active, hired, terminated, added/removed
  trucks, coverage) is recalculated automatically from those dates, for
  every week, every time the page loads.
- Leave the tab open and it refreshes itself every 30 seconds; the small
  pill in the bottom-left corner shows "Live" with a last-synced time, or
  flags a sync error if the database is unreachable.
- Multiple people can use the same URL — updates are shared through the same
  database.

## Local development

```bash
npm install

# Frontend only (fastest iteration on UI, but /api calls will fail
# unless something else is serving them — see below):
npm run dev

# Full stack locally (frontend + API together), using the Vercel CLI:
npx vercel link        # one-time, links this folder to your Vercel project
npx vercel env pull    # downloads DATABASE_URL etc. into .env.local
npx vercel dev
```

`vite.config.js` proxies `/api` to `http://localhost:3000` (where `vercel dev`
listens) so `npm run dev` and `vercel dev` can be run side by side if you
want fast UI reloads with a working API underneath.

## Troubleshooting

- **"Sync error" pill / dashboard stays empty**: check the Vercel project's
  **Functions** logs for the failing request. The most common cause is a
  missing or wrong `DATABASE_URL`.
- **Adding a driver does nothing**: open the browser console — the API
  returns a JSON `{ error: "..." }` body on failure that explains what went
  wrong (e.g. can't reach the database).
- **Want to reset all data**: connect to the database (Neon has a SQL editor
  in its dashboard) and run `TRUNCATE drivers, trucks RESTART IDENTITY;`.
