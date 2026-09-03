# TaskBounty — desktop app

The management platform: a downloadable **Electron** app where either person logs
in **by phone number** to see balances, browse a month of receipts (with proof
photos), and — for the Approver — edit the recurring tasks and their pay.

> **Runs offline out of the box.** With `VITE_DATA_MODE=mock` (the default) the
> app launches with demo data and needs no accounts — great for clicking around.
> Point it at a Supabase project to use real, shared data. See
> [`../../docs/desktop-supabase-setup.md`](../../docs/desktop-supabase-setup.md).

## Quick start (demo mode)

```bash
cd apps/desktop
npm install
cp .env.example .env      # leave VITE_DATA_MODE=mock
npm run dev
```

Log in with `+10000000001` (Doer) or `+10000000002` (Approver) and any code.

## Real data (Supabase mode)

Set in `.env`:

```
VITE_DATA_MODE=supabase
VITE_SUPABASE_URL=...        # Project Settings → API → Project URL
VITE_SUPABASE_ANON_KEY=...   # Project Settings → API → anon public key
```

Then run the migration + seed from [`../../supabase`](../../supabase) and
`npm run dev`. Full walkthrough in the setup doc linked above.

## Screens

- **Dashboard** — total transacted, and your balance: *ready to receive* (Doer) or *owed* (Approver).
- **History** — every task from the last 30 days with status, value, and the proof photo (click to enlarge).
- **Recurring tasks** *(Approver only)* — create/edit/pause templates, including the **payment amount** and schedule.

## Scripts

| Command | Does |
| --- | --- |
| `npm run dev` | Launch in development (hot reload). |
| `npm run build` | Type-check + build main, preload, and renderer. |
| `npm run typecheck` | Type-check only. |
| `npm run dist` | Build installers with electron-builder. |

## Architecture

The UI never talks to Supabase directly — every screen goes through a
`DataProvider` ([`src/renderer/src/data/types.ts`](src/renderer/src/data/types.ts))
with two implementations: `mock` (in-memory demo) and `supabase` (real). Swapping
or extending the backend is a one-file change.

## Status / not done yet

- Login delivers its code over Telegram **once the bot is migrated to Supabase**
  (next milestone). Until then, use mock mode, or seed a code row manually.
- V1 auth is deliberately simple (a phone gate + broad anon access on your own
  private project) — see the security note in the setup doc for the V2 plan.
