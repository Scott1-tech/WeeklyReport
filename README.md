# FleetPulse — Weekly Driver & Truck Report

A live dashboard for tracking driver and truck status across carriers.
Update a driver or truck's status and effective date, and every weekly
report (active/hired/terminated drivers, added/removed trucks, coverage
gaps) recalculates automatically from those dates.

- **Frontend**: Vite + React + Tailwind + D3 (`src/`)
- **Backend**: serverless API functions backed by Postgres (`api/`)
- **Data**: two tables, `drivers` and `trucks` — no spreadsheet involved

## Quick start

```bash
npm install
npm run dev
```

The dashboard itself runs with `npm run dev`, but it needs the API (and a
database) to show real data — see **[DEPLOY.md](./DEPLOY.md)** for the full
setup, including how to get a free live database and put this app on a free
public URL in about 5 minutes.

## Project layout

```
src/
  components/FleetPulseDashboard.jsx   the dashboard UI (charts, tables, forms)
  components/SyncStatusBanner.jsx      small "Live / syncing / error" indicator
  hooks/useFleetData.js                fetches + writes driver/truck data
  lib/rowShape.js                      translates DB rows <-> dashboard's row shape
  lib/dates.js                         date helpers (keeps "today" always current)
  App.jsx                              wires the hook into the dashboard
api/
  _db.js                               Postgres connection + schema bootstrap
  drivers/index.js, drivers/[id].js    driver CRUD
  trucks/index.js, trucks/[id].js      truck CRUD
```
