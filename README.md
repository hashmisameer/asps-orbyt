# ORBYT

**Operations · Resources · Business · Yield** — an ERP for manufacturers.

This is Phase 1: the foundation. It has sign-in, the company/unit/financial-year setup,
roles and users, module on/off switches, an audit log, and the ORBYT screen frame
(top bar, menu, tabs, status bar). Business screens (Order entry first) come next.

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
3. Install, create the tables and the first admin user:
   ```bash
   npm run install:all
   npm run db:migrate
   npm run db:seed
   ```
4. Start both parts (two terminals):
   ```bash
   npm run dev:backend    # API on http://localhost:4000
   npm run dev:frontend   # app on http://localhost:5173
   ```
5. Open http://localhost:5173 and sign in with `admin` and the password you set.

## API (Phase 1)

| Method | Path | What it does |
|---|---|---|
| GET | `/api/health` | API and database check |
| GET | `/api/companies/public` | Company name for the login screen |
| POST | `/api/auth/login` | Sign in, returns a token and the session |
| GET | `/api/auth/me` | Current user, company, unit, FY, modules |
| POST | `/api/auth/logout` | Sign out (recorded in the audit log) |

An account locks for 15 minutes after 5 wrong passwords.

## Database changes

Add a new numbered file in `backend/src/db/migrations/` (for example `002_masters.sql`)
and run `npm run db:migrate`. Never edit a migration that has already run.
