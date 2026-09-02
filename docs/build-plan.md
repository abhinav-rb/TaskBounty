# Build plan

Phased, so there is something demoable early and each phase has a clear "done." Rough sizing assumes one developer; treat the estimates as relative effort, not commitments.

---

## Phase 0 — Repo + design ✅ (this)
**Goal:** agree on the shape before writing code.
**Deliverables:** README, architecture, this build plan, alternatives, payment plan.
**Done when:** you have signed off on the stack and the loop.

## Phase 1 — Foundations
**Goal:** the skeleton everything hangs off.
**Deliverables:**
- Turborepo + pnpm + TypeScript monorepo (`apps/bot`, `apps/desktop`, `packages/core`, `packages/db`).
- Supabase project created; schema migration for `profiles`, `task_templates`, `task_instances`, `submissions`, `reviews`, `ledger_entries`.
- Row-Level Security policies + Storage bucket for photos.
- Two seed users (a Doer and an Approver) and one sample recurring template.
- `.env.example` documenting every required secret name.

**Done when:** migrations apply cleanly and the two seed users exist with correct RLS.

## Phase 2 — Domain + data layer
**Goal:** the rules of the game, independent of Telegram.
**Deliverables:**
- `packages/core` functions: `createInstanceFromTemplate`, `submitProof`, `approve`, `reject`, `recordCashout`, `getBalance`, `getHistory`.
- Ledger math (earnings − cash-outs) with unit tests.
- Amount/title **snapshotting** on instance creation.

**Done when:** the full loop (assign → submit → approve → balance) passes as automated tests with no bot involved.

## Phase 3 — Telegram bot
**Goal:** the loop works over real messages.
**Deliverables:**
- `grammY` bot: `/start` (link phone ↔ chat), `/tasks`, `/balance`, `/cashout`.
- Photo intake → upload to Storage → `submission`.
- Approver **Accept / Reject** inline buttons → review → ledger update → notify Doer.
- Reject path returns the task to the Doer with a reason.

**Done when:** two real Telegram accounts can run the entire loop end to end.

## Phase 4 — Scheduler
**Goal:** tasks appear on their own at set times.
**Deliverables:**
- `pg_cron` (or Actions cron) job that reads active templates and spawns due instances.
- Due-soon and overdue reminder messages (title / when / worth).

**Done when:** a template with a schedule produces a task and a reminder with no manual trigger.

## Phase 5 — Management app
**Goal:** the free desktop platform for receipts + admin.
**Deliverables:**
- Tauri app (React + Vite) with **phone-number login** (OTP via the bot).
- **Dashboard:** total transacted + balance ("ready to receive" / "owed") by role.
- **History:** ≥ 30 days of tasks with all metadata + proof photos (thumbnail → full).
- **Recurring-task editor (Approver only):** create/edit/disable templates incl. **payment amount** and schedule.

**Done when:** either user logs in by phone and sees correct figures + a month of receipts; the Approver edits an amount and the next instance reflects it while old receipts do not.

## Phase 6 — Package + deploy
**Goal:** real, installable, hosted.
**Deliverables:**
- GitHub Actions builds signed-where-possible Tauri installers for Win/macOS/Linux, published as **GitHub Releases**.
- Bot worker deployed (Fly.io/Railway/Render) with the Telegram webhook set.
- Supabase prod config + automated backups.

**Done when:** you can download the app from Releases, log in, and it talks to the live bot/DB.

## Phase 7 — Harden
**Goal:** trustworthy enough to leave running.
**Deliverables:** RLS/storage-policy audit, rate limiting on OTP + bot commands, error handling + retries, a short user guide, and a smoke-test checklist.

**Done when:** the audit checklist passes and a fresh user can onboard from the guide alone.

---

## Suggested milestones

| Milestone | Phases | You can... |
| --- | --- | --- |
| **M1 — Loop works in chat** | 1–3 | Run the whole task→proof→approve→balance loop over Telegram. |
| **M2 — Hands-off** | 4 | Tasks assign and remind themselves on schedule. |
| **M3 — Full platform** | 5 | Browse receipts and edit recurring tasks in the desktop app. |
| **M4 — Shipped** | 6–7 | Install from Releases; runs hosted and hardened. |

## Explicitly out of scope for V1

- Real money movement / payouts (that is [V2](payments-v2.md)).
- More than two people or team hierarchies.
- Editing or deleting historical receipts (they are immutable by design).
