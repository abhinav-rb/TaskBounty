// Shared domain types. Pure data shapes — no runtime dependencies, so this
// module (and `domain.ts`) can be unit-tested without a database or Telegram.

export type Role = "approver" | "doer";
export type TaskStatus = "assigned" | "submitted" | "approved" | "rejected";
export type LedgerType = "earning" | "cashout";
export type ReviewDecision = "approved" | "rejected";
/** Who created the task: assigned by the approver, or appraised (proposed) by the doer. */
export type TaskKind = "assigned" | "appraisal";

export interface Profile {
  id: number;
  role: Role;
  /** Configured identifier: a lowercase username (no @) or a numeric id string. */
  telegram_ref: string;
  /** Populated when the user runs /start. */
  telegram_id: number | null;
  username: string | null;
  display_name: string | null;
  chat_id: number | null;
  created_at: string;
}

export interface TaskTemplate {
  id: number;
  title: string;
  description: string | null;
  amount_cents: number;
  /** Cron expression; null = manual-only template. */
  schedule_cron: string | null;
  assignee_id: number;
  approver_id: number;
  active: number; // 0 | 1
  created_at: string;
}

export interface TaskInstance {
  id: number;
  template_id: number | null;
  kind: TaskKind;
  // Snapshots — kept immutable so historic receipts stay accurate even if the
  // template's title/amount changes later.
  title: string;
  description: string | null;
  amount_cents: number;
  assignee_id: number;
  approver_id: number;
  due_at: string | null;
  status: TaskStatus;
  created_at: string;
  last_reminded_at: string | null;
}

export interface Submission {
  id: number;
  instance_id: number;
  telegram_file_id: string;
  photo_path: string | null;
  note: string | null;
  submitted_at: string;
}

export interface Review {
  id: number;
  submission_id: number;
  approver_id: number;
  decision: ReviewDecision;
  note: string | null;
  decided_at: string;
}

export interface LedgerEntry {
  id: number;
  user_id: number;
  instance_id: number | null;
  /** Positive for earnings, negative for cash-outs. */
  amount_cents: number;
  type: LedgerType;
  note: string | null;
  created_at: string;
}
