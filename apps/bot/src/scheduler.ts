import type { Api } from "grammy";
import cron from "node-cron";
import type { ScheduledTask } from "node-cron";
import type { Config } from "./config.js";
import type { Store } from "./db.js";
import { formatMoney } from "./domain.js";
import { assignFromTemplate, sendToProfile } from "./notify.js";
import type { TaskTemplate } from "./types.js";

interface Deps {
  store: Store;
  config: Config;
  api: Api;
}

/**
 * Owns all time-based behavior:
 *  - one cron job per active recurring template (assigns the task on schedule)
 *  - a periodic sweep that nudges the Doer about overdue tasks
 */
export class Scheduler {
  private jobs = new Map<number, ScheduledTask>();
  private reminderJob?: ScheduledTask;

  constructor(private deps: Deps) {}

  start(): void {
    for (const t of this.deps.store.listTemplates(true)) {
      this.registerTemplateJob(t);
    }
    // Every 30 minutes, remind about overdue tasks.
    this.reminderJob = cron.schedule(
      "*/30 * * * *",
      () => {
        void this.sendReminders();
      },
      { timezone: this.deps.config.tz },
    );
  }

  registerTemplateJob(t: TaskTemplate): void {
    if (!t.schedule_cron || !cron.validate(t.schedule_cron)) return;
    this.unregisterTemplateJob(t.id);
    const job = cron.schedule(
      t.schedule_cron,
      () => {
        void this.fireTemplate(t.id);
      },
      { timezone: this.deps.config.tz },
    );
    this.jobs.set(t.id, job);
  }

  unregisterTemplateJob(id: number): void {
    const job = this.jobs.get(id);
    if (job) {
      job.stop();
      this.jobs.delete(id);
    }
  }

  /** Create + announce one instance from a template. Used by cron and by /assign. */
  async fireTemplate(id: number): Promise<boolean> {
    const t = this.deps.store.getTemplate(id);
    if (!t) return false;
    try {
      await assignFromTemplate(this.deps.api, this.deps.store, this.deps.config, t);
      return true;
    } catch (err) {
      console.error(`[scheduler] failed to fire template #${id}:`, err);
      return false;
    }
  }

  async sendReminders(): Promise<void> {
    const nowMs = Date.now();
    const overdue = this.deps.store.listOverdueAssigned(new Date(nowMs).toISOString());
    for (const inst of overdue) {
      const last = inst.last_reminded_at ? new Date(inst.last_reminded_at).getTime() : 0;
      // At most one reminder per task every 6 hours.
      if (nowMs - last < 6 * 3600 * 1000) continue;
      const text =
        `⏰ Reminder: "${inst.title}" is overdue ` +
        `(worth ${formatMoney(inst.amount_cents, this.deps.config.currency)}).\n` +
        `Send a photo here to submit it.`;
      const delivered = await sendToProfile(
        this.deps.api,
        this.deps.store,
        inst.assignee_id,
        text,
      ).catch((err) => {
        console.error("[scheduler] reminder failed:", err);
        return false;
      });
      if (delivered) this.deps.store.setInstanceReminded(inst.id, new Date().toISOString());
    }
  }

  stop(): void {
    for (const job of this.jobs.values()) job.stop();
    this.jobs.clear();
    this.reminderJob?.stop();
  }
}
