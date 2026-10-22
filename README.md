# ORBYT

**Operations · Resources · Business · Yield** — an ERP for manufacturers.

Built so far:

- **Phase 1 – foundation:** sign-in, company / unit / financial year, roles and users,
  module on/off switches, audit log, and the ORBYT frame (top bar, menu, tabs, status bar).
- **Phase 2 – Order entry:** Menu → Order → Order entry. An order has a header (brand, product
  category, style, allowed deviation) and many lines. Each line gets its own order no.
  (`ORD/26-27/NWA/0001`, running per brand per financial year), dispatch mode, buyer PO,
  colour, optional size range with size-wise qty, total qty, ex-factory and FOB dates.
  After saving, only buyer PO no., size range and quantities can change.

## What's inside

```
backend/    Node + Express API, PostgreSQL
  src/config/        settings from .env
  src/db/            connection, migrations (SQL files), seed
  src/middleware/    login check, error handling
  src/modules/       one folder per area (auth, companies, ...)
frontend/   React + Vite
  src/pages/         Login, Home
  src/layout/        AppShell (top bar, menu, tabs, status bar), menu list
```

Every business table has a `company_id`, so one ORBYT install can serve many companies
without their data mixing.

## Run it on your computer

You need **Node.js 20+** and **PostgreSQL 14+**.

1. Create the database (in `psql` or pgAdmin):
   ```sql
   CREATE ROLE orbyt LOGIN PASSWORD 'orbyt_password';
   CREATE DATABASE orbyt OWNER orbyt;
   ```
2. Set up the backend settings:
   ```bash
   cp backend/.env.example backend/.env
   ```
   Open `backend/.env` and set `JWT_SECRET` to a long random string and
   `SEED_ADMIN_PASSWORD` to the first admin password.
3. Install, create the tables, the first admin user and the sample order masters:
   ```bash
   npm install
   npm run install:all
   npm run db:migrate
   npm run db:seed
   npm run db:seed:orders   # sample brands, categories, styles, colours, size ranges
   ```
4. Start ORBYT (API and app together, in one terminal):
   ```bash
   npm run dev
   ```
   The API runs on http://localhost:4000 and the app on http://localhost:5173
   (or the next free port – the terminal shows the address).
5. Open the app address and sign in with `admin` and the password you set.

## API

| Method | Path | What it does |
|---|---|---|
| GET | `/api/health` | API and database check |
| GET | `/api/companies/public` | Company name for the login screen |
| POST | `/api/auth/login` | Sign in, returns a token and the session |
| GET | `/api/auth/me` | Current user, company, unit, FY, modules |
| POST | `/api/auth/logout` | Sign out (recorded in the audit log) |
| GET | `/api/orders/lookups` | Brands, categories, styles, colours, size ranges |
| GET | `/api/orders/next-numbers?brandId=&count=` | Preview of the next order numbers |
| GET | `/api/orders` | Latest 50 orders |
| POST | `/api/orders` | Create an order with its lines |
| GET | `/api/orders/:id` | One order with lines and sizes |
| POST | `/api/orders/:id/lines` | Add lines to a saved order |
| PATCH | `/api/orders/:id/lines/:lineId` | Change buyer PO, size range or quantities |

An account locks for 15 minutes after 5 wrong passwords.

## Database changes

Add a new numbered file in `backend/src/db/migrations/` (for example `002_masters.sql`)
and run `npm run db:migrate`. Never edit a migration that has already run.
