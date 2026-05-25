<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

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

3. Run the app:

```bash
npm run dev
```

## Supabase + Lenco Prep

The app now includes:

- A Supabase client wrapper with a safe mock fallback while env vars are missing.
- Admin auth gating that will use Supabase sessions once the project keys are configured.
- A checkout payment adapter that can call `/api/pay` for Lenco and falls back to local simulation until the backend exists.

When you’re ready, the next step is to add the server endpoints for `/api/pay` and `/api/webhook`, then connect them to the Lenco secret keys.
