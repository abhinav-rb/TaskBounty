import { Bot } from "grammy";
import { join } from "node:path";
import { registerHandlers } from "./bot.js";
import { loadConfig } from "./config.js";
import { SqliteStore } from "./db.js";
import { LoginCodePoller } from "./login-poller.js";
import { Scheduler } from "./scheduler.js";
import type { Store } from "./store.js";
import { SupabaseStore } from "./supabase-store.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const useSupabase = Boolean(config.supabaseUrl && config.supabaseServiceKey);

  const store: Store = useSupabase
    ? new SupabaseStore(config.supabaseUrl!, config.supabaseServiceKey!)
    : new SqliteStore(config.dbPath, join(config.dataDir, "photos"));

  // Ensure both participant rows exist so templates/instances can reference them
  // even before each user has run /start.
  await store.seedProfile("approver", config.approverRef);
  await store.seedProfile("doer", config.doerRef);

  const bot = new Bot(config.botToken);
  const scheduler = new Scheduler({ store, config, api: bot.api });
  registerHandlers(bot, { store, config, scheduler });

  // In Supabase mode, deliver desktop-app login codes over Telegram.
  let poller: LoginCodePoller | undefined;
  if (useSupabase) {
    poller = new LoginCodePoller(config.supabaseUrl!, config.supabaseServiceKey!, store, bot.api);
    poller.start();
  }

  await bot.api.setMyCommands([
    { command: "start", description: "Link your account" },
    { command: "help", description: "Show commands" },
    { command: "whoami", description: "Show your id and role" },
    { command: "tasks", description: "List your open tasks (Doer)" },
    { command: "balance", description: "Your balance (Doer)" },
    { command: "cashout", description: "Record a cash-out (Doer)" },
    { command: "receipts", description: "Recent approved tasks (Doer)" },
    { command: "appraise", description: "Propose a task you did (Doer)" },
    { command: "newtask", description: "New recurring task (Approver)" },
    { command: "assignnow", description: "One-off task now (Approver)" },
    { command: "templates", description: "List recurring tasks (Approver)" },
    { command: "assign", description: "Assign a template now (Approver)" },
    { command: "pause", description: "Pause a recurring task (Approver)" },
    { command: "resume", description: "Resume a recurring task (Approver)" },
  ]);

  await scheduler.start();

  const stop = () => {
    console.log("\nShutting down…");
    scheduler.stop();
    poller?.stop();
    void bot.stop();
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  console.log(
    `TaskBounty bot starting (store=${useSupabase ? "supabase" : "sqlite"}, tz=${config.tz}, currency=${config.currency})…`,
  );
  await bot.start({
    onStart: (me) => console.log(`Bot @${me.username} is live. Press Ctrl+C to stop.`),
  });
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
