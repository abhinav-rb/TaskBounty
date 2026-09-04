# TaskBounty — Telegram bot

The messaging half of TaskBounty: assign tasks, collect **photo proof**, get an
approver's **Accept/Reject**, and track a **cash-out balance** — all inside
Telegram, all free to run.

> **Storage — two backends behind one interface** ([`src/store.ts`](src/store.ts)):
> - **SQLite (default)** — local file under `DATA_DIR`, works with nothing but a
>   free bot token. Great for solo dev.
> - **Supabase** — set `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` and the bot shares
>   one cloud datastore with the **desktop app**: proof photos upload to the
>   `proofs` bucket, and the bot **delivers the app's login codes over Telegram**
>   (it watches the `login_codes` table). Run `supabase/migrations` + `seed.sql`
>   first. The service_role key is server-side only — never ship it in the app.
>
> The bot logic depends only on the `Store` interface, so switching is one env var.

## Quick start

1. **Create a bot** — message [@BotFather](https://t.me/BotFather) on Telegram,
   send `/newbot`, and copy the token it gives you.
2. **Install** (Node 20+):
   ```bash
   cd apps/bot
   npm install
   ```
3. **Configure** — copy the example env and fill it in:
   ```bash
   cp .env.example .env
   # set BOT_TOKEN, APPROVER_TELEGRAM, DOER_TELEGRAM, TZ, CURRENCY
   ```
   Not sure of a username/ID? Start the bot (below), send it `/whoami`, and it
   tells you. Approver and Doer must be **two different Telegram accounts**.
4. **Run:**
   ```bash
   npm run dev     # watch mode (auto-restarts on change)
   # or
   npm start
   ```
5. In Telegram, both people open the bot and send **`/start`** once to link.

## Try the whole loop

```
Approver:  /assignnow Wash the car | 10 | Soap, rinse, dry
Doer:      (gets the task)  →  sends a photo
Approver:  taps ✅ Accept
Doer:      /balance   →   $10.00 ready to cash out
```

Recurring tasks:

```
Approver:  /newtask Make bed | 2 | 0 8 * * * | Neat, corners tucked
           (assigns automatically at 8am daily; /assign <id> to fire one now)
```

## Commands

**Doer (User 1)** — `/tasks`, `/balance`, `/cashout [amount]`, `/receipts`,
`/appraise`, and just **send a photo** to submit proof.

**Appraisals** — the Doer can also propose a task the Approver *didn't* assign:

```
Doer:      /appraise Cleaned the garage | 20 | Swept + organized
Doer:      (sends the photo proof)
Approver:  gets an "Appraisal request" with the proposed value + Accept/Decline
           Accept → $20 credited   ·   Decline → declined (with an optional reason)
```

**Approver (User 2)** — `/newtask`, `/assignnow`, `/templates`, `/assign <id>`,
`/pause <id>`, `/resume <id>`, and **Accept/Reject** buttons on each submission.

Both — `/start`, `/help`, `/whoami`.

## Scripts

| Command | Does |
| --- | --- |
| `npm run dev` | Run in watch mode. |
| `npm start` | Run once. |
| `npm run typecheck` | Type-check with `tsc`. |
| `npm test` | Run the domain unit tests. |

## How it maps to the design

- **Tasks / submissions / reviews / ledger** follow the data model in
  [`../../docs/architecture.md`](../../docs/architecture.md).
- Recurring **templates** are separate from the **instances** the scheduler
  spawns, and each instance **snapshots** its amount — so editing a task's pay
  later never rewrites past receipts.
- The **ledger is append-only**; the balance is derived. That's the groundwork
  the [V2 payments plan](../../docs/payments-v2.md) builds on.

## Not included yet

- The desktop management app (phone login, receipts browser, recurring-task
  editor) — next milestone.
- Real payouts — money is a number in V1 (see the payments doc).
