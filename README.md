

# Katina Tickets

Luxury ticket concierge and event management app built with React, TypeScript, and Vite.

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies:

```bash
npm install
```

2. Create a local env file from [.env.example](.env.example) and set the values for:
- `GEMINI_API_KEY`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_TICKETS_BUCKET` (optional, defaults to `tickets`)
- `REQUIRE_DATABASE` (`true` in production to enforce startup DB requirement)
- `TICKET_DELIVERY_PROVIDER` (optional; enables post-persistence delivery hook observability)
- `LENCO_PUBLIC_KEY`
- `LENCO_SECRET_KEY`
- `LENCO_WEBHOOK_SECRET`

3. Run the app and API together:

```bash
npm run dev
```

This starts the Vite frontend on port 3000 and the Express API on port 8787.

## Supabase + Lenco Prep

The app now includes:

- A Supabase client wrapper with a safe mock fallback while env vars are missing.
- Admin auth/session exchange integrated with backend HttpOnly cookie sessions.
- Lenco-backed payment routes on the Express API (`/api/pay`, `/api/webhook`) with reservation and ticket issuance endpoints.

The dev server now proxies `/api` requests to the local Express backend so the checkout flow can hit `/api/pay` and `/api/webhook` during development.

When you’re ready for production, the next step is to harden the deployment profile (TLS, CSP, monitoring, and CI quality gates) and run Prisma migrations against your production database.

## Supabase Setup

If you want to wire the real Supabase project now, use this sequence from the project root:

```bash
npm install
npx supabase --version
npx supabase login
npx supabase link --project-ref <your-project-ref>
```

After the project is linked, populate your local `.env` with the real Supabase URL, anon key, service role key, and the production `DATABASE_URL` for Prisma, then run:

```bash
npm run db:generate
npm run db:migrate:deploy
npm run dev
```

If you need to create or update migrations locally before pushing them to Supabase, use:

```bash
npm run db:migrate:dev
```

## Auth Checklist

Use this order for proper auth across admin and customer users:

1. Create the Supabase project and add the production site URL and redirect URLs in Supabase Auth settings.
2. Add the real env values to `.env` for `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `APP_URL`, and `APP_ORIGIN`.
	For ticket PDF persistence, also set `SUPABASE_TICKETS_BUCKET` and ensure the bucket exists in Supabase Storage.
3. Create a `SUPER_ADMIN` user for admin login and at least one `CUSTOMER` user for the customer flow.
4. Confirm the backend cookie/session exchange works for both roles.
5. Run the Prisma migrations against the target database before testing login and payments.
6. Keep `ALLOW_DEV_AUTH_BYPASS="false"` unless you intentionally want local mock login.

## Verify & Test

- `npm run lint` for TypeScript no-emit checks
- `npm run build` for frontend production build
- `npm test` for API integration tests (loads `.env.test` if present)

For isolated integration runs, copy `.env.test.example` to `.env.test` and set `TEST_DATABASE_URL` to a local disposable Postgres instance, or leave it empty to run with in-memory fallback.

## Health And Readiness

- `GET /api/health` returns service metadata, uptime, environment, and dependency health snapshot.
- `GET /api/readiness` returns `200` only when required dependencies are ready (currently database reachability if configured).
- In production, startup config validation fails fast when required runtime settings are invalid.

## Structured Logging

The API now emits JSON structured logs with consistent fields:

- `timestamp`, `level`, `event`, `service`, `environment`
- request completion logs (`http.request.completed`)
- startup validation logs (`startup.config.warning`, `startup.config.error`)
- webhook and ticket lifecycle logs (including PDF fallback and delivery readiness events)

## Auth Architecture Snapshot

The current auth hardening blueprint now assumes:

- Supabase Auth for login
- HttpOnly cookie sessions issued by the Express backend
- Prisma + PostgreSQL as the source of truth for roles, permissions, sessions, refresh tokens, and audit logs
- TOTP MFA enrollment/activation endpoints with encrypted-at-rest secrets and one-time backup recovery codes
- Middleware-style guards on protected API routes and role-specific dashboard routes
- CSRF checks on state-changing routes
- Rate limiting on auth and payment endpoints
- Audit logging hooks for login, logout, permission denial, and session rotation

Protected route examples are implemented in the Express server for admin, scanner, finance, and organizer access, with MFA-ready checks for `SUPER_ADMIN` and `FINANCE`.

## Ticket PDF Persistence

Ticket PDFs now use a storage-first flow in the API:

- `GET /api/payments/:reference/ticket-pdf` tries Supabase Storage first.
- If the stored PDF is missing, invalid, or checksum-mismatched, the API regenerates the PDF and uploads it.
- When upload succeeds, ticket rows are updated with `pdfStoragePath`, `pdfChecksum`, and `pdfGeneratedAt` metadata.
- If upload fails, the API still returns the regenerated PDF to avoid blocking customer downloads.

Ticket delivery hooks now execute only after reservation and ticket persistence are verified, preventing downstream delivery attempts before durable ticket records exist.
