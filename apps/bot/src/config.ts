import "dotenv/config";
import { join } from "node:path";

export interface Config {
  botToken: string;
  approverRef: string;
  doerRef: string;
  currency: string;
  tz: string;
  defaultDueHours: number;
  dataDir: string;
  dbPath: string;
  /** When both are set, the bot uses Supabase (shared with the desktop app)
   *  instead of local SQLite. */
  supabaseUrl?: string;
  supabaseServiceKey?: string;
}

function required(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) {
    throw new Error(
      `Missing required environment variable ${name}. ` +
        `Copy .env.example to .env and fill it in.`,
    );
  }
  return v.trim();
}

/** Normalize a participant reference: strip a leading @ and lowercase usernames. */
export function normalizeRef(raw: string): string {
  return raw.trim().replace(/^@/, "").toLowerCase();
}

/** Does a configured reference match a Telegram user (by numeric id or username)? */
export function refMatches(
  ref: string,
  from: { id: number; username?: string },
): boolean {
  if (/^\d+$/.test(ref)) return ref === String(from.id);
  return !!from.username && ref === from.username.toLowerCase();
}

export function loadConfig(): Config {
  const dataDir = process.env.DATA_DIR?.trim() || "./data";
  const dueHours = Number(process.env.DEFAULT_DUE_HOURS ?? "12");
  return {
    botToken: required("BOT_TOKEN"),
    approverRef: normalizeRef(required("APPROVER_TELEGRAM")),
    doerRef: normalizeRef(required("DOER_TELEGRAM")),
    currency: process.env.CURRENCY?.trim() || "$",
    tz: process.env.TZ?.trim() || "UTC",
    defaultDueHours: Number.isFinite(dueHours) && dueHours > 0 ? dueHours : 12,
    dataDir,
    dbPath: join(dataDir, "taskbounty.db"),
    supabaseUrl: process.env.SUPABASE_URL?.trim() || undefined,
    supabaseServiceKey: process.env.SUPABASE_SERVICE_KEY?.trim() || undefined,
  };
}
