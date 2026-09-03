# Desktop app + Supabase setup

How to run the TaskBounty desktop app against a real (free) Supabase project.
If you just want to click around, skip all of this: `VITE_DATA_MODE=mock` runs
the app offline with demo data.

## 1. Create a free Supabase project

1. Sign up at [supabase.com](https://supabase.com) and create a new project (free tier).
2. When it's ready, open **Project Settings → API** and copy:
   - **Project URL** → `VITE_SUPABASE_URL`
   - **anon public** key → `VITE_SUPABASE_ANON_KEY`

## 2. Apply the schema

Two options:

**A. Supabase SQL Editor (simplest)** — open the SQL editor and paste, in order:
1. the contents of [`supabase/migrations/20260903000001_init.sql`](../supabase/migrations/20260903000001_init.sql)
2. (optional demo data) [`supabase/seed.sql`](../supabase/seed.sql) — edit the two phone numbers first.

**B. Supabase CLI**
```bash
supabase link --project-ref <your-ref>
supabase db push          # applies migrations/
psql "$DATABASE_URL" -f supabase/seed.sql   # optional
```

## 3. Configure the app

```bash
cd apps/desktop
cp .env.example .env
```
```
VITE_DATA_MODE=supabase
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
```
Then `npm install && npm run dev`.

## 4. Logging in

The app signs you in with your **phone number + a 6-digit code**. The code is
created by the `request_login` function and is meant to be delivered to you over
**Telegram by the bot**. Two ways to get it today:

- **After the bot is migrated to Supabase** (the next milestone): the bot watches
  the `login_codes` table and DMs you the code automatically.
- **Right now**, before that migration: read the latest code straight from the
  database (SQL editor):
  ```sql
  select code from login_codes order by id desc limit 1;
  ```
  Your phone must match a `profiles.phone` row (the seed sets two; the bot also
  upserts them from its config).

## How the pieces fit

```
Telegram bot ──writes──▶  Supabase (Postgres + Storage)  ◀──reads/writes── Desktop app
   (service role)              tasks · ledger · photos          (anon key + phone login)
```

Both sides share one datastore, so a task approved in Telegram shows up in the
app's history, and a template edited in the app changes what the bot assigns.

## Security note (please read)

This is a **V1** built for a private, two-person project, so it favors "works and
is free" over hardened multi-tenant security:

- Login is gated by a phone code, but the database policies grant the **anon key**
  broad read access (and write access to templates). Anyone who obtains your
  project URL + anon key could read your data.
- The anon key is bundled into the built app.

That's acceptable for your own private project. **Do not** reuse this project for
anything multi-user or sensitive without the V2 hardening:

- Move login to **Supabase Auth** (or mint a short-lived Supabase JWT from the bot
  after verifying the Telegram code) so `auth.uid()` is real, then rewrite the RLS
  policies to be per-user instead of `anon`-broad.
- Serve proof photos only via short-lived signed URLs (already done) and lock the
  storage bucket to authenticated reads.

## Next milestone

Migrate the **bot** from its local SQLite store to this Supabase schema (behind
the same data-layer interface it already uses), and have it deliver login codes
over Telegram. After that, bot and app are fully live on one shared datastore.
