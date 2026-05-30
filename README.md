

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
- Admin auth gating that will use Supabase sessions once the project keys are configured.
- A checkout payment adapter that can call `/api/pay` for Lenco and falls back to local simulation until the backend exists.

The dev server now proxies `/api` requests to the local Express backend so the checkout flow can hit `/api/pay` and `/api/webhook` during development.

When you’re ready, the next step is to add the server endpoints for `/api/pay` and `/api/webhook`, then connect them to the Lenco secret keys.

## Auth Architecture Snapshot

The current auth hardening blueprint now assumes:

- Supabase Auth for login
- HttpOnly cookie sessions issued by the Express backend
- Prisma + PostgreSQL as the source of truth for roles, permissions, sessions, refresh tokens, and audit logs
- Middleware-style guards on protected API routes and role-specific dashboard routes
- CSRF checks on state-changing routes
- Rate limiting on auth and payment endpoints
- Audit logging hooks for login, logout, permission denial, and session rotation

Protected route examples are implemented in the Express server for admin, scanner, finance, and organizer access, with MFA-ready checks for `SUPER_ADMIN` and `FINANCE`.
