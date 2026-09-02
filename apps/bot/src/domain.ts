// Pure domain logic. No I/O, no database, no Telegram — everything here is a
// plain function so it can be unit-tested in isolation (see test/domain.test.ts).

import type { LedgerType, ReviewDecision, TaskStatus } from "./types.js";

/** Sum a set of ledger amounts (in cents). Balance = earnings + (negative) cash-outs. */
export function computeBalanceCents(
  entries: ReadonlyArray<{ amount_cents: number }>,
): number {
  return entries.reduce((sum, e) => sum + e.amount_cents, 0);
}

/**
 * Parse a human-typed money amount into integer cents.
 * Accepts: "10", "12.5", "12.50", "$12.50", " 1,000.00 ".
 * Rejects anything else (throws with a friendly message).
 */
export function parseAmountToCents(input: string): number {
  const cleaned = input.trim().replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) {
    throw new Error(`Invalid amount "${input}". Use a number like 10 or 12.50`);
  }
  const [whole, frac = ""] = cleaned.split(".");
  return Number(whole) * 100 + Number(frac.padEnd(2, "0"));
}

/** Format integer cents for display, e.g. 1050 -> "$10.50", -500 -> "-$5.00". */
export function formatMoney(cents: number, currency = "$"): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${currency}${(abs / 100).toFixed(2)}`;
}

/** A task can be submitted (photo proof) only while it is assigned. */
export function canSubmit(status: TaskStatus): boolean {
  return status === "assigned";
}

/** A submission can be reviewed only while its task is awaiting review. */
export function canReview(status: TaskStatus): boolean {
  return status === "submitted";
}

/** Resulting task status after an approver decision. */
export function statusAfterReview(decision: ReviewDecision): TaskStatus {
  return decision === "approved" ? "approved" : "assigned";
}

/** The ledger effect of a review: only approvals move money. */
export function ledgerEffectOfReview(
  decision: ReviewDecision,
  amountCents: number,
): { type: LedgerType; amount_cents: number } | null {
  if (decision !== "approved") return null;
  return { type: "earning", amount_cents: amountCents };
}
