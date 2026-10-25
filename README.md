# ONLINE PRO TRADER — starter project

A mobile-responsive React/Vite crypto terminal prototype with:
- Public Binance spot price and candle data
- BTC/ETH public futures funding/open-interest snapshots when available
- Chart with timeframe selector and volume
- Order-book depth snapshot, recent trades, approximate trade-flow, large-print list, volume buckets
- Decision panel with a transparent heuristic
- Position risk calculator
- Sign-up/login UI, pending approval/access-expiry UI, admin dashboard UI

## Important implementation/security status

This is a **starter prototype**, not yet a production-secure membership service. Supabase authentication and the user profile table are scaffolded, but the admin approval writes are intentionally not enabled by the included RLS policy. Do not deploy publicly and promise secure admin approvals until you implement a trusted Supabase Edge Function (or backend) that verifies the admin identity server-side and updates profiles. Never put a Supabase `service_role` key in the browser.

Several requested institutional tools need specialized feeds and are not fully replicated by public endpoints:
- Gamma/zero-gamma/max-pain: options chain/open-interest source required.
- Historical liquidity heatmap: capture/store order-book updates over time.
- Full footprint: aggregate historical trades into price/time buckets.
- Cross-exchange liquidation map: specialized derivatives feed.
- True L3: exchange must expose order-by-order events.
The prototype labels unavailable feeds instead of fabricating values.

## Run locally

Requires Node.js 20+ and npm:
```bash
npm install
cp .env.example .env
npm run dev
```
Open the local address Vite prints.

## Configure authentication (Supabase)

1. Create a project at https://supabase.com.
2. In the Supabase SQL Editor, run `supabase/schema.sql`.
3. Copy Project URL and the **anon/public** key from project API settings to `.env`.
4. Set `VITE_ADMIN_EMAIL` to the exact email you intend to use for admin.
5. Create an account with that email. In Supabase Auth, confirm it if email confirmation is enabled.
6. Run `npm run dev` again after changing `.env`.

### Before production: implement secure admin API

The admin panel's approve/revoke button calls `profiles.update`, which the included RLS blocks by design. Implement a Supabase Edge Function (or private backend) which:
- validates the caller's access token,
- checks the caller's user ID against a server-side admin user ID stored as a secret,
- accepts a target user ID, approved flag and duration,
- sets expires_at server-side,
- rejects all other callers.
Then change `updateUser` in `src/main.jsx` to call that function, and add an admin-only list-users endpoint; normal users should not be able to list all profiles. Do not use an email check in browser code as the only security boundary.

## Build
```bash
npm run build
```

## Disclaimer
Educational market analytics only. No trading execution. Public data availability and API limits may vary. Signals are not guarantees or financial advice.
