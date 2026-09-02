import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canReview,
  canSubmit,
  computeBalanceCents,
  formatMoney,
  ledgerEffectOfReview,
  parseAmountToCents,
  statusAfterReview,
} from "../src/domain.js";

test("parseAmountToCents accepts common money formats", () => {
  assert.equal(parseAmountToCents("10"), 1000);
  assert.equal(parseAmountToCents("12.5"), 1250);
  assert.equal(parseAmountToCents("12.50"), 1250);
  assert.equal(parseAmountToCents("$12.50"), 1250);
  assert.equal(parseAmountToCents(" 1,000.00 "), 100000);
  assert.equal(parseAmountToCents("0.99"), 99);
});

test("parseAmountToCents rejects bad input", () => {
  assert.throws(() => parseAmountToCents("abc"));
  assert.throws(() => parseAmountToCents("10.999"));
  assert.throws(() => parseAmountToCents("-5"));
  assert.throws(() => parseAmountToCents(""));
});

test("computeBalanceCents sums earnings and cash-outs", () => {
  assert.equal(computeBalanceCents([]), 0);
  assert.equal(
    computeBalanceCents([
      { amount_cents: 1000 },
      { amount_cents: 500 },
      { amount_cents: -300 },
    ]),
    1200,
  );
});

test("formatMoney renders signed values", () => {
  assert.equal(formatMoney(1050), "$10.50");
  assert.equal(formatMoney(0), "$0.00");
  assert.equal(formatMoney(-500), "-$5.00");
  assert.equal(formatMoney(1000, "€"), "€10.00");
});

test("status transition helpers", () => {
  assert.equal(canSubmit("assigned"), true);
  assert.equal(canSubmit("submitted"), false);
  assert.equal(canReview("submitted"), true);
  assert.equal(canReview("assigned"), false);
  // Assigned tasks: approve -> approved, reject -> back to assigned (redo).
  assert.equal(statusAfterReview("approved", "assigned"), "approved");
  assert.equal(statusAfterReview("rejected", "assigned"), "assigned");
  // Appraisals: approve -> approved, reject -> rejected (terminal, no redo).
  assert.equal(statusAfterReview("approved", "appraisal"), "approved");
  assert.equal(statusAfterReview("rejected", "appraisal"), "rejected");
});

test("only approvals move money", () => {
  assert.deepEqual(ledgerEffectOfReview("approved", 1000), {
    type: "earning",
    amount_cents: 1000,
  });
  assert.equal(ledgerEffectOfReview("rejected", 1000), null);
});
