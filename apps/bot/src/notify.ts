import type { Api } from "grammy";
import type { Config } from "./config.js";
import type { Store } from "./db.js";
import { formatMoney } from "./domain.js";
import type { TaskInstance, TaskTemplate } from "./types.js";

/** Human-readable local timestamp in the configured timezone. */
export function fmtDate(iso: string, tz: string): string {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: tz,
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/** Send a plain message to a profile by id. Returns false if they haven't /start-ed. */
export async function sendToProfile(
  api: Api,
  store: Store,
  profileId: number,
  text: string,
): Promise<boolean> {
  const p = store.getProfileById(profileId);
  if (!p?.chat_id) return false;
  await api.sendMessage(p.chat_id, text);
  return true;
}

/** Tell the assignee about a freshly created task instance. */
export async function announceAssignment(
  api: Api,
  store: Store,
  config: Config,
  inst: TaskInstance,
): Promise<void> {
  const lines = ["📋 New task assigned!", "", `#${inst.id} — ${inst.title}`];
  if (inst.description) lines.push(inst.description);
  lines.push(`💰 Worth ${formatMoney(inst.amount_cents, config.currency)}`);
  if (inst.due_at) lines.push(`⏰ Due ${fmtDate(inst.due_at, config.tz)}`);
  lines.push("", "When it's done, send a photo here as proof.");
  await sendToProfile(api, store, inst.assignee_id, lines.join("\n"));
}

/** Due timestamp N hours from now, per config. */
export function dueFromNow(config: Config): string {
  return new Date(Date.now() + config.defaultDueHours * 3600 * 1000).toISOString();
}

/** Create an instance from a template (snapshotting title/amount) and announce it. */
export async function assignFromTemplate(
  api: Api,
  store: Store,
  config: Config,
  tmpl: TaskTemplate,
): Promise<TaskInstance> {
  const inst = store.createInstance({
    template_id: tmpl.id,
    title: tmpl.title,
    description: tmpl.description,
    amount_cents: tmpl.amount_cents,
    assignee_id: tmpl.assignee_id,
    approver_id: tmpl.approver_id,
    due_at: dueFromNow(config),
  });
  await announceAssignment(api, store, config, inst);
  return inst;
}
