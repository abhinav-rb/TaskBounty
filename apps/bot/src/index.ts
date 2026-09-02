import { Bot } from "grammy";
import { registerHandlers } from "./bot.js";
import { loadConfig } from "./config.js";
import { Store } from "./db.js";
import { Scheduler } from "./scheduler.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const store = new Store(config.dbPath);

  // Ensure both participant rows exist so templates/instances can reference them
  // even before each user has run /start.
  store.seedProfile("approver", config.approverRef);
  store.seedProfile("doer", config.doerRef);

  const bot = new Bot(config.botToken);
  const scheduler = new Scheduler({ store, config, api: bot.api });
  registerHandlers(bot, { store, config, scheduler });

  await bot.api.setMyCommands([
    { command: "start", description: "Link your account" },
    { command: "help", description: "Show commands" },
    { command: "whoami", description: "Show your id and role" },
    { command: "tasks", description: "List your open tasks (Doer)" },
    { command: "balance", description: "Your balance (Doer)" },
    { command: "cashout", description: "Record a cash-out (Doer)" },
    { command: "receipts", description: "Recent approved tasks (Doer)" },
    { command: "newtask", description: "New recurring task (Approver)" },
    { command: "assignnow", description: "One-off task now (Approver)" },
    { command: "templates", description: "List recurring tasks (Approver)" },
    { command: "assign", description: "Assign a template now (Approver)" },
    { command: "pause", description: "Pause a recurring task (Approver)" },
    { command: "resume", description: "Resume a recurring task (Approver)" },
  ]);

  scheduler.start();

  const stop = () => {
    console.log("\nShutting down…");
    scheduler.stop();
    void bot.stop();
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  console.log(
    `TaskBounty bot starting (tz=${config.tz}, currency=${config.currency})…`,
  );
  await bot.start({
    onStart: (me) =>
      console.log(`Bot @${me.username} is live. Press Ctrl+C to stop.`),
  });
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
