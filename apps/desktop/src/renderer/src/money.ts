/** Format integer cents for display, e.g. 1050 -> "$10.50", -500 -> "-$5.00". */
export function formatMoney(cents: number, currency = "$"): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${currency}${(abs / 100).toFixed(2)}`;
}

/** Parse a human-typed amount into integer cents. Throws on bad input. */
export function parseAmountToCents(input: string): number {
  const cleaned = input.trim().replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) {
    throw new Error(`Invalid amount "${input}". Use a number like 10 or 12.50`);
  }
  const [whole, frac = ""] = cleaned.split(".");
  return Number(whole) * 100 + Number(frac.padEnd(2, "0"));
}
