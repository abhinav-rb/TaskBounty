import { Bot, InlineKeyboard } from "grammy";
import type { Context } from "grammy";
import cron from "node-cron";
import { join } from "node:path";
import type { Config } from "./config.js";
import { refMatches } from "./config.js";
import type { Store } from "./db.js";
import {
  canReview,
  canSubmit,
  formatMoney,
  parseAmountToCents,
  statusAfterReview,
} from "./domain.js";
import {
  announceAssignment,
  assignFromTemplate,
  dueFromNow,
  fmtDate,
  sendToProfile,
} from "./notify.js";
import { downloadPhoto } from "./photos.js";
import type { Scheduler } from "./scheduler.js";
import type { Profile, Role, TaskInstance, TaskKind } from "./types.js";

interface Deps {
  store: Store;
  config: Config;
  scheduler: Scheduler;
}

function helpFor(role: Role | undefined): string {
  const doer = [
    "🧑‍🔧 Doer commands:",
    "/tasks — list your open tasks",
    "/balance — how much you've earned",
    "/cashout [amount] — record a cash-out",
    "/receipts — approved tasks (last 30 days)",
    "/appraise Title | amount | desc — propose a task you did",
    "",
    "📸 To submit a finished task, just send a photo here.",
  ].join("\n");
  const approver = [
    "🧑‍⚖️ Approver commands:",
    "/newtask Title | amount | cron | description — recurring task",
    "/assignnow Title | amount | description — one-off task now",
    "/templates — list recurring tasks",
    "/assign <id> — assign a template right now",
    "/pause <id> · /resume <id> — toggle a recurring task",
    "",
    "When the Doer submits a photo, you'll get Accept / Reject buttons.",
  ].join("\n");
  if (role === "doer") return doer;
  if (role === "approver") return approver;
  return "Send /start to link your account. Then /help shows what you can do.";
}

export function registerHandlers(
  bot: Bot,
  { store, config, scheduler }: Deps,
): void {
  // In-memory, per-process state (fine for a single bot instance):
  //  - a photo waiting for the Doer to pick which task it belongs to
  //  - a rejection waiting for the Approver to (optionally) type a reason
  const pendingPhoto = new Map<number, { fileId: string; note: string | null }>();
  const pendingReject = new Map<
    number,
    { reviewId: number; assigneeId: number; title: string; kind: TaskKind }
  >();
  // A doer-initiated appraisal awaiting its photo.
  const pendingAppraisal = new Map<
    number,
    { title: string; description: string | null; amount_cents: number }
  >();

  const senderOf = (ctx: Context): Profile | undefined =>
    ctx.chat ? store.getProfileByChat(ctx.chat.id) : undefined;

  async function requireDoer(ctx: Context): Promise<Profile | undefined> {
    const p = senderOf(ctx);
    if (!p) {
      await ctx.reply("Please send /start first.");
      return undefined;
    }
    if (p.role !== "doer") {
      await ctx.reply("That's a Doer command.");
      return undefined;
    }
    return p;
  }

  async function requireApprover(ctx: Context): Promise<Profile | undefined> {
    const p = senderOf(ctx);
    if (!p) {
      await ctx.reply("Please send /start first.");
      return undefined;
    }
    if (p.role !== "approver") {
      await ctx.reply("That's an Approver command.");
      return undefined;
    }
    return p;
  }

  /** Record a submission, flip the task to 'submitted', and ping the Approver. */
  async function doSubmit(
    ctx: Context,
    doer: Profile,
    inst: TaskInstance,
    fileId: string,
    note: string | null,
  ): Promise<void> {
    const sub = store.createSubmission({
      instance_id: inst.id,
      telegram_file_id: fileId,
      photo_path: null,
      note,
    });
    store.setInstanceStatus(inst.id, "submitted");

    // Best-effort local copy of the photo.
    const dest = join(config.dataDir, "photos", `submission-${sub.id}.jpg`);
    void downloadPhoto(bot.api, config.botToken, fileId, dest)
      .then(() => store.setSubmissionPhotoPath(sub.id, dest))
      .catch((err) => console.error("[photo] download failed:", err));

    await ctx.reply(
      `✅ Submitted "${inst.title}" for review. You'll hear back once it's approved.`,
    );

    const approver = store.getProfileByRole("approver");
    if (!approver?.chat_id) {
      await ctx.reply(
        "(Heads up: the Approver hasn't started the bot yet, so they can't review this. Ask them to send /start.)",
      );
      return;
    }
    const isAppraisal = inst.kind === "appraisal";
    const caption = [
      isAppraisal
        ? "💡 Appraisal request (proposed by the Doer)"
        : "🆕 Submission for review",
      "",
      `#${inst.id} — ${inst.title}`,
      `From: ${doer.display_name ?? (doer.username ? "@" + doer.username : "Doer")}`,
      `When: ${fmtDate(sub.submitted_at, config.tz)}`,
      `${isAppraisal ? "Proposed value" : "Worth"}: ${formatMoney(inst.amount_cents, config.currency)}`,
      note ? `Note: ${note}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    const kb = new InlineKeyboard()
      .text("✅ Accept", `approve:${sub.id}`)
      .text("❌ Reject", `reject:${sub.id}`);
    await bot.api.sendPhoto(approver.chat_id, fileId, {
      caption,
      reply_markup: kb,
    });
  }

  async function clearButtons(ctx: Context, suffix: string): Promise<void> {
    const orig = ctx.callbackQuery?.message?.caption ?? "";
    try {
      await ctx.editMessageCaption({ caption: `${orig}\n\n${suffix}` });
    } catch {
      /* message may be too old to edit — ignore */
    }
    try {
      await ctx.editMessageReplyMarkup();
    } catch {
      /* ignore */
    }
  }

  // ---- commands ----------------------------------------------------------

  bot.command("start", async (ctx) => {
    const from = ctx.from;
    if (!from || !ctx.chat) return;
    let role: Role | undefined;
    if (refMatches(config.approverRef, from)) role = "approver";
    else if (refMatches(config.doerRef, from)) role = "doer";

    if (!role) {
      await ctx.reply(
        `Hi! You're not on this bot's participant list yet.\n` +
          `Your Telegram ID: ${from.id}` +
          (from.username ? `\nUsername: @${from.username}` : "") +
          `\n\nAsk the admin to add you (APPROVER_TELEGRAM / DOER_TELEGRAM).`,
      );
      return;
    }

    const profile = store.getProfileByRole(role);
    if (!profile) {
      await ctx.reply("Setup error: profile not initialized. Contact the admin.");
      return;
    }
    store.linkProfileChat(profile.id, {
      telegram_id: from.id,
      username: from.username ?? null,
      display_name:
        [from.first_name, from.last_name].filter(Boolean).join(" ") || null,
      chat_id: ctx.chat.id,
    });
    await ctx.reply(
      `Welcome to TaskBounty! You're set up as the ` +
        `${role === "approver" ? "Approver (User 2)" : "Doer (User 1)"}.\n\n` +
        helpFor(role),
    );
  });

  bot.command("whoami", async (ctx) => {
    const from = ctx.from;
    if (!from) return;
    const sender = senderOf(ctx);
    const role =
      sender?.role ??
      (refMatches(config.approverRef, from)
        ? "approver"
        : refMatches(config.doerRef, from)
          ? "doer"
          : "not linked");
    await ctx.reply(
      `Telegram ID: ${from.id}\n` +
        `Username: ${from.username ? "@" + from.username : "(none)"}\n` +
        `Role: ${role}`,
    );
  });

  bot.command("help", async (ctx) => {
    await ctx.reply(helpFor(senderOf(ctx)?.role));
  });

  bot.command("tasks", async (ctx) => {
    const doer = await requireDoer(ctx);
    if (!doer) return;
    const open = store.listInstancesForAssignee(doer.id, ["assigned", "submitted"]);
    if (open.length === 0) {
      await ctx.reply("No open tasks right now. 🎉");
      return;
    }
    const lines = open.map((t) => {
      const status = t.status === "submitted" ? "⏳ awaiting approval" : "📋 to do";
      const due = t.due_at ? ` · due ${fmtDate(t.due_at, config.tz)}` : "";
      return `#${t.id} ${t.title} — ${formatMoney(t.amount_cents, config.currency)} · ${status}${due}`;
    });
    await ctx.reply(
      "Your tasks:\n" +
        lines.join("\n") +
        "\n\nSend a photo to submit a task you've finished.",
    );
  });

  bot.command("balance", async (ctx) => {
    const doer = await requireDoer(ctx);
    if (!doer) return;
    const bal = store.getBalanceCents(doer.id);
    const pending = store.listInstancesForAssignee(doer.id, ["submitted"]).length;
    await ctx.reply(
      `💰 Balance ready to cash out: ${formatMoney(bal, config.currency)}` +
        (pending ? `\n⏳ ${pending} task(s) awaiting approval.` : "") +
        `\n\nUse /cashout to record a cash-out.`,
    );
  });

  bot.command("cashout", async (ctx) => {
    const doer = await requireDoer(ctx);
    if (!doer) return;
    const bal = store.getBalanceCents(doer.id);
    if (bal <= 0) {
      await ctx.reply("Nothing to cash out yet.");
      return;
    }
    const arg = ctx.match.trim();
    let amount = bal;
    if (arg) {
      try {
        amount = parseAmountToCents(arg);
      } catch (err) {
        await ctx.reply((err as Error).message);
        return;
      }
    }
    if (amount <= 0) {
      await ctx.reply("Amount must be positive.");
      return;
    }
    if (amount > bal) {
      await ctx.reply(
        `That's more than your balance (${formatMoney(bal, config.currency)}).`,
      );
      return;
    }
    store.addLedgerEntry({
      user_id: doer.id,
      instance_id: null,
      amount_cents: -amount,
      type: "cashout",
      note: "Cash-out (recorded — no real payment in V1)",
    });
    const newBal = store.getBalanceCents(doer.id);
    await ctx.reply(
      `🧾 Recorded a cash-out of ${formatMoney(amount, config.currency)}.\n` +
        `New balance: ${formatMoney(newBal, config.currency)}\n\n` +
        `(V1 tracks the number only — no money actually moves yet.)`,
    );
  });

  bot.command("receipts", async (ctx) => {
    const doer = await requireDoer(ctx);
    if (!doer) return;
    const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    const rows = store.listApprovedForAssigneeSince(doer.id, since);
    if (rows.length === 0) {
      await ctx.reply("No approved tasks in the last 30 days yet.");
      return;
    }
    const lines = rows.map(
      (t) =>
        `#${t.id} ${t.title} — ${formatMoney(t.amount_cents, config.currency)} · ${fmtDate(t.created_at, config.tz)}`,
    );
    await ctx.reply("🧾 Approved in the last 30 days:\n" + lines.join("\n"));
  });

  bot.command("newtask", async (ctx) => {
    const approver = await requireApprover(ctx);
    if (!approver) return;
    const parts = ctx.match.split("|").map((s) => s.trim());
    if (parts.length < 3 || !parts[0]) {
      await ctx.reply(
        "Format:\n/newtask Title | amount | cron | description(optional)\n\n" +
          "Example:\n/newtask Wash car | 10 | 0 18 * * * | Rinse, soap, dry\n\n" +
          '(cron is "min hour day month weekday" — "0 18 * * *" = 6pm daily)',
      );
      return;
    }
    const title = parts[0];
    const amountStr = parts[1] ?? "";
    const cronExpr = parts[2] ?? "";
    const description = parts[3] || null;

    let amount_cents: number;
    try {
      amount_cents = parseAmountToCents(amountStr);
    } catch (err) {
      await ctx.reply((err as Error).message);
      return;
    }
    if (!cron.validate(cronExpr)) {
      await ctx.reply(
        `"${cronExpr}" isn't a valid cron expression. Example: 0 18 * * * (6pm daily).`,
      );
      return;
    }
    const doer = store.getProfileByRole("doer");
    if (!doer) {
      await ctx.reply("Setup error: no Doer configured.");
      return;
    }
    const tmpl = store.createTemplate({
      title,
      description,
      amount_cents,
      schedule_cron: cronExpr,
      assignee_id: doer.id,
      approver_id: approver.id,
    });
    scheduler.registerTemplateJob(tmpl);
    await ctx.reply(
      `✅ Recurring task #${tmpl.id} created: "${tmpl.title}" — ` +
        `${formatMoney(amount_cents, config.currency)} on schedule "${cronExpr}".\n` +
        `Use /assign ${tmpl.id} to send one now, or /templates to manage.`,
    );
  });

  bot.command("assignnow", async (ctx) => {
    const approver = await requireApprover(ctx);
    if (!approver) return;
    const parts = ctx.match.split("|").map((s) => s.trim());
    if (parts.length < 2 || !parts[0]) {
      await ctx.reply(
        "Format:\n/assignnow Title | amount | description(optional)\n\n" +
          "Example:\n/assignnow Take out trash | 3 | Blue bin, curb by 8pm",
      );
      return;
    }
    const title = parts[0];
    const amountStr = parts[1] ?? "";
    const description = parts[2] || null;
    let amount_cents: number;
    try {
      amount_cents = parseAmountToCents(amountStr);
    } catch (err) {
      await ctx.reply((err as Error).message);
      return;
    }
    const doer = store.getProfileByRole("doer");
    if (!doer) {
      await ctx.reply("Setup error: no Doer configured.");
      return;
    }
    const inst = store.createInstance({
      template_id: null,
      title,
      description,
      amount_cents,
      assignee_id: doer.id,
      approver_id: approver.id,
      due_at: dueFromNow(config),
    });
    await announceAssignment(bot.api, store, config, inst);
    await ctx.reply(
      `✅ Assigned task #${inst.id}: "${title}" — ${formatMoney(amount_cents, config.currency)}.`,
    );
  });

  bot.command("templates", async (ctx) => {
    const approver = await requireApprover(ctx);
    if (!approver) return;
    const list = store.listTemplates();
    if (list.length === 0) {
      await ctx.reply("No recurring tasks yet. Create one with /newtask.");
      return;
    }
    const lines = list.map(
      (t) =>
        `#${t.id} ${t.title} — ${formatMoney(t.amount_cents, config.currency)} · ` +
        `"${t.schedule_cron ?? "manual"}" · ${t.active ? "active" : "paused"}`,
    );
    await ctx.reply(
      "Recurring tasks:\n" +
        lines.join("\n") +
        "\n\n/assign <id> · /pause <id> · /resume <id>",
    );
  });

  bot.command("assign", async (ctx) => {
    const approver = await requireApprover(ctx);
    if (!approver) return;
    const id = Number(ctx.match.trim());
    if (!Number.isInteger(id)) {
      await ctx.reply("Usage: /assign <template id>");
      return;
    }
    const tmpl = store.getTemplate(id);
    if (!tmpl) {
      await ctx.reply(`No template #${id}. See /templates.`);
      return;
    }
    const inst = await assignFromTemplate(bot.api, store, config, tmpl);
    await ctx.reply(`✅ Assigned "${tmpl.title}" (task #${inst.id}).`);
  });

  bot.command("pause", async (ctx) => {
    const approver = await requireApprover(ctx);
    if (!approver) return;
    const id = Number(ctx.match.trim());
    if (!store.getTemplate(id)) {
      await ctx.reply(`No template #${id}.`);
      return;
    }
    store.setTemplateActive(id, false);
    scheduler.unregisterTemplateJob(id);
    await ctx.reply(`⏸️ Paused template #${id}.`);
  });

  bot.command("resume", async (ctx) => {
    const approver = await requireApprover(ctx);
    if (!approver) return;
    const id = Number(ctx.match.trim());
    const tmpl = store.getTemplate(id);
    if (!tmpl) {
      await ctx.reply(`No template #${id}.`);
      return;
    }
    store.setTemplateActive(id, true);
    scheduler.registerTemplateJob({ ...tmpl, active: 1 });
    await ctx.reply(`▶️ Resumed template #${id}.`);
  });

  // ---- appraisal (doer proposes a task) ----------------------------------

  bot.command("appraise", async (ctx) => {
    const doer = await requireDoer(ctx);
    if (!doer) return;
    const parts = ctx.match.split("|").map((s) => s.trim());
    if (parts.length < 2 || !parts[0]) {
      await ctx.reply(
        "Propose a task you've done for the Approver to value.\n\n" +
          "Format:\n/appraise Title | amount | description(optional)\n\n" +
          "Example:\n/appraise Cleaned the garage | 20 | Swept + organized\n\n" +
          "Then send the photo proof and I'll forward it for approval.",
      );
      return;
    }
    const title = parts[0];
    const amountStr = parts[1] ?? "";
    const description = parts[2] || null;
    let amount_cents: number;
    try {
      amount_cents = parseAmountToCents(amountStr);
    } catch (err) {
      await ctx.reply((err as Error).message);
      return;
    }
    if (ctx.chat) {
      pendingAppraisal.set(ctx.chat.id, { title, description, amount_cents });
    }
    await ctx.reply(
      `Got it: "${title}" for ${formatMoney(amount_cents, config.currency)}.\n` +
        `📸 Now send the photo proof for this appraisal.`,
    );
  });

  // ---- photo submissions -------------------------------------------------

  bot.on("message:photo", async (ctx) => {
    const doer = senderOf(ctx);
    if (!doer) {
      await ctx.reply("Please send /start first.");
      return;
    }
    if (doer.role !== "doer") {
      await ctx.reply("Only the Doer submits task photos.");
      return;
    }
    const sizes = ctx.message.photo;
    const largest = sizes[sizes.length - 1];
    if (!largest) return;
    const fileId = largest.file_id;
    const note = ctx.message.caption ?? null;

    // If the Doer just ran /appraise, this photo completes that request.
    const appraisal = ctx.chat ? pendingAppraisal.get(ctx.chat.id) : undefined;
    if (appraisal) {
      if (ctx.chat) pendingAppraisal.delete(ctx.chat.id);
      const approver = store.getProfileByRole("approver");
      if (!approver) {
        await ctx.reply("Setup error: no Approver configured.");
        return;
      }
      const inst = store.createInstance({
        template_id: null,
        kind: "appraisal",
        title: appraisal.title,
        description: appraisal.description,
        amount_cents: appraisal.amount_cents,
        assignee_id: doer.id,
        approver_id: approver.id,
        due_at: null,
      });
      await doSubmit(ctx, doer, inst, fileId, note);
      return;
    }

    const open = store.listInstancesForAssignee(doer.id, ["assigned"]);
    if (open.length === 0) {
      await ctx.reply("You have no open tasks to submit right now. Check /tasks.");
      return;
    }
    if (open.length === 1) {
      const only = open[0];
      if (only) await doSubmit(ctx, doer, only, fileId, note);
      return;
    }
    if (!ctx.chat) return;
    pendingPhoto.set(ctx.chat.id, { fileId, note });
    const kb = new InlineKeyboard();
    for (const t of open) kb.text(`#${t.id} ${t.title}`, `submitfor:${t.id}`).row();
    await ctx.reply("Which task is this photo for?", { reply_markup: kb });
  });

  // ---- inline button callbacks ------------------------------------------

  bot.on("callback_query:data", async (ctx) => {
    const [action, arg] = ctx.callbackQuery.data.split(":");
    const sender = senderOf(ctx);

    if (action === "submitfor") {
      if (!sender || sender.role !== "doer") {
        await ctx.answerCallbackQuery("Only the Doer can do that.");
        return;
      }
      const pending = ctx.chat ? pendingPhoto.get(ctx.chat.id) : undefined;
      if (!pending) {
        await ctx.answerCallbackQuery("That photo expired — please send it again.");
        return;
      }
      const inst = store.getInstance(Number(arg));
      if (!inst || inst.assignee_id !== sender.id || !canSubmit(inst.status)) {
        await ctx.answerCallbackQuery("That task isn't open.");
        return;
      }
      if (ctx.chat) pendingPhoto.delete(ctx.chat.id);
      await ctx.answerCallbackQuery();
      try {
        await ctx.editMessageReplyMarkup();
      } catch {
        /* ignore */
      }
      await doSubmit(ctx, sender, inst, pending.fileId, pending.note);
      return;
    }

    if (action === "approve" || action === "reject") {
      const sub = store.getSubmission(Number(arg));
      if (!sub) {
        await ctx.answerCallbackQuery("That submission no longer exists.");
        return;
      }
      const inst = store.getInstance(sub.instance_id);
      if (!inst) {
        await ctx.answerCallbackQuery("Task not found.");
        return;
      }
      if (!sender || sender.role !== "approver") {
        await ctx.answerCallbackQuery("Only the Approver can decide.");
        return;
      }
      if (!canReview(inst.status)) {
        await ctx.answerCallbackQuery("This task was already handled.");
        return;
      }
      const isAppraisal = inst.kind === "appraisal";

      if (action === "approve") {
        store.createReview({
          submission_id: sub.id,
          approver_id: sender.id,
          decision: "approved",
          note: null,
        });
        store.setInstanceStatus(inst.id, statusAfterReview("approved", inst.kind));
        store.addLedgerEntry({
          user_id: inst.assignee_id,
          instance_id: inst.id,
          amount_cents: inst.amount_cents,
          type: "earning",
          note: `${isAppraisal ? "Appraisal" : "Task"} #${inst.id}: ${inst.title}`,
        });
        const bal = store.getBalanceCents(inst.assignee_id);
        await ctx.answerCallbackQuery("Approved ✅");
        await clearButtons(ctx, isAppraisal ? "💡 Appraisal approved" : "✅ Approved");
        await sendToProfile(
          bot.api,
          store,
          inst.assignee_id,
          `${isAppraisal ? "💡 Appraisal approved" : "✅ Approved"}: "${inst.title}"\n` +
            `+${formatMoney(inst.amount_cents, config.currency)} added.\n` +
            `Balance: ${formatMoney(bal, config.currency)}`,
        );
      } else {
        const review = store.createReview({
          submission_id: sub.id,
          approver_id: sender.id,
          decision: "rejected",
          note: null,
        });
        store.setInstanceStatus(inst.id, statusAfterReview("rejected", inst.kind));
        await ctx.answerCallbackQuery(isAppraisal ? "Declined 🚫" : "Sent back ↩️");
        await clearButtons(
          ctx,
          isAppraisal ? "🚫 Declined" : "❌ Rejected — sent back to the Doer",
        );
        await sendToProfile(
          bot.api,
          store,
          inst.assignee_id,
          isAppraisal
            ? `🚫 Your appraisal "${inst.title}" was declined.`
            : `↩️ "${inst.title}" was sent back. Please redo it and send a new photo.`,
        );
        if (ctx.chat) {
          pendingReject.set(ctx.chat.id, {
            reviewId: review.id,
            assigneeId: inst.assignee_id,
            title: inst.title,
            kind: inst.kind,
          });
          await ctx.reply("If you want, reply with a reason and I'll pass it to the Doer.");
        }
      }
      return;
    }

    await ctx.answerCallbackQuery();
  });

  // ---- free text ---------------------------------------------------------

  bot.on("message:text", async (ctx) => {
    if (ctx.message.text.startsWith("/")) return; // unmatched command
    const sender = senderOf(ctx);
    if (!sender) {
      await ctx.reply("Please send /start to begin.");
      return;
    }
    const pend = ctx.chat ? pendingReject.get(ctx.chat.id) : undefined;
    if (sender.role === "approver" && pend && ctx.chat) {
      pendingReject.delete(ctx.chat.id);
      store.updateReviewNote(pend.reviewId, ctx.message.text);
      await sendToProfile(
        bot.api,
        store,
        pend.assigneeId,
        `📝 Reason "${pend.title}" was ${pend.kind === "appraisal" ? "declined" : "sent back"}: ${ctx.message.text}`,
      );
      await ctx.reply("Passed your reason along. 👍");
      return;
    }
    await ctx.reply("Not sure what you mean. Send /help to see what I can do.");
  });

  bot.catch((err) => {
    console.error("[bot] error while handling update:", err.error);
  });
}
