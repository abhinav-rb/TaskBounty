import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  DashboardData,
  DataProvider,
  LedgerData,
  LedgerRow,
  PendingReview,
  ReceiptRow,
  Session,
  TemplateInput,
  TemplateRow,
} from "./types";

interface RawSubmission { id: number; storage_path: string | null; submitted_at: string; note: string | null; }
interface RawInstance {
  id: number; kind: "assigned" | "appraisal"; title: string; description: string | null;
  amount_cents: number; status: string; created_at: string; assignee_id: number;
  submissions: RawSubmission[] | null;
}

function relLabel(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  const days = Math.round(hrs / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

const displayStatus = (s: string): string =>
  s === "submitted" ? "awaiting" : s === "rejected" ? "sent back" : s;

export function createSupabaseProvider(url: string, anonKey: string): DataProvider {
  const sb: SupabaseClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const sum = (rows: { amount_cents: number }[] | null): number =>
    (rows ?? []).reduce((s, r) => s + r.amount_cents, 0);

  async function signedUrl(path: string | null): Promise<string | null> {
    if (!path) return null;
    const { data } = await sb.storage.from("proofs").createSignedUrl(path, 3600);
    return data?.signedUrl ?? null;
  }

  async function doerId(): Promise<number | null> {
    const { data } = await sb.from("profiles").select("id").eq("role", "doer").maybeSingle();
    return data?.id ?? null;
  }

  async function countBy(status: string, assignee?: number): Promise<number> {
    let q = sb.from("task_instances").select("id", { count: "exact", head: true }).eq("status", status);
    if (assignee != null) q = q.eq("assignee_id", assignee);
    const { count } = await q;
    return count ?? 0;
  }

  return {
    async requestLogin(phone) {
      const { error } = await sb.rpc("request_login", { p_phone: phone });
      if (error) throw error;
    },

    async verifyLogin(phone, code) {
      const { data, error } = await sb.rpc("verify_login", { p_phone: phone, p_code: code });
      if (error) throw error;
      const row = (data as { profile_id: number; role: Session["role"]; display_name: string | null }[] | null)?.[0];
      return row ? { profileId: row.profile_id, role: row.role, displayName: row.display_name } : null;
    },

    async getDashboard(session): Promise<DashboardData> {
      const earnings = await sb.from("ledger_entries").select("amount_cents").eq("type", "earning");
      if (earnings.error) throw earnings.error;
      const approved = await sb.from("task_instances").select("id", { count: "exact", head: true }).eq("status", "approved");

      const doer = await doerId();
      let balanceCents = 0;
      if (doer != null) {
        const led = await sb.from("ledger_entries").select("amount_cents").eq("user_id", doer);
        if (led.error) throw led.error;
        balanceCents = sum(led.data);
      }

      const awaitingCount = await countBy("submitted");
      const openTasksCount = doer != null ? await countBy("assigned", doer) : 0;
      const doerName = (await sb.from("profiles").select("display_name").eq("role", "doer").maybeSingle()).data?.display_name ?? "Doer";

      // Pending reviews (submitted instances + latest submission)
      const pend = await sb
        .from("task_instances")
        .select("id,title,amount_cents,submissions(id,storage_path,submitted_at,note)")
        .eq("status", "submitted")
        .order("created_at", { ascending: true });
      const pendingReviews: PendingReview[] = [];
      for (const inst of (pend.data ?? []) as unknown as RawInstance[]) {
        const subs = inst.submissions ?? [];
        const latest = subs.length ? subs.reduce((a, b) => (a.id > b.id ? a : b)) : null;
        pendingReviews.push({
          submissionId: latest?.id ?? 0,
          instanceId: inst.id,
          title: inst.title,
          amountCents: inst.amount_cents,
          who: doerName,
          submittedLabel: latest ? relLabel(latest.submitted_at) : "",
          note: latest?.note ?? null,
          photoUrl: await signedUrl(latest?.storage_path ?? null),
        });
      }

      const open = doer != null
        ? (await sb.from("task_instances").select("id,title,amount_cents,due_at,status").eq("assignee_id", doer).eq("status", "assigned").order("due_at")).data ?? []
        : [];
      const openTasks = (open as { id: number; title: string; amount_cents: number; due_at: string | null; status: string }[]).map((t) => ({
        id: t.id, title: t.title, amountCents: t.amount_cents, status: t.status,
        dueLabel: t.due_at ? new Date(t.due_at).toLocaleString() : "no due date",
      }));

      const recent = await sb
        .from("task_instances")
        .select("id,title,amount_cents,status,created_at")
        .in("status", ["approved", "rejected", "submitted"])
        .order("created_at", { ascending: false })
        .limit(6);
      const recentActivity = ((recent.data ?? []) as { id: number; title: string; amount_cents: number; status: string; created_at: string }[]).map((r) => ({
        id: r.id, status: displayStatus(r.status), title: r.title, amountCents: r.amount_cents, timeLabel: relLabel(r.created_at),
      }));

      return {
        role: session.role,
        totalTransactedCents: sum(earnings.data),
        approvedCount: approved.count ?? 0,
        balanceCents,
        awaitingCount,
        openTasksCount,
        pendingReviews,
        openTasks,
        recentActivity,
      };
    },

    async getHistory(_session, sinceDays) {
      const since = new Date(Date.now() - sinceDays * 86_400_000).toISOString();
      const { data, error } = await sb
        .from("task_instances")
        .select("id,kind,title,description,amount_cents,status,created_at,assignee_id,submissions(id,storage_path,submitted_at,note)")
        .gte("created_at", since)
        .in("status", ["approved", "rejected", "submitted"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      const doerName = (await sb.from("profiles").select("display_name").eq("role", "doer").maybeSingle()).data?.display_name ?? "Doer";

      const rows: ReceiptRow[] = [];
      for (const inst of (data ?? []) as unknown as RawInstance[]) {
        const subs = inst.submissions ?? [];
        const latest = subs.length ? subs.reduce((a, b) => (a.id > b.id ? a : b)) : null;
        rows.push({
          id: inst.id,
          ref: `R-${1000 + inst.id}`,
          kind: inst.kind,
          title: inst.title,
          description: inst.description,
          amountCents: inst.amount_cents,
          status: displayStatus(inst.status),
          assignedAt: inst.created_at,
          submittedAt: latest?.submitted_at ?? null,
          decidedAt: null,
          who: doerName,
          note: latest?.note ?? null,
          photoUrl: await signedUrl(latest?.storage_path ?? null),
        });
      }
      return rows;
    },

    async getLedger(_session): Promise<LedgerData> {
      const doer = await doerId();
      if (doer == null) return { balanceCents: 0, approvedSinceCashout: 0, monthEarnedCents: 0, bars: [], entries: [] };
      const { data, error } = await sb
        .from("ledger_entries")
        .select("id,amount_cents,type,note,created_at")
        .eq("user_id", doer)
        .order("created_at", { ascending: true });
      if (error) throw error;
      const raw = (data ?? []) as { id: number; amount_cents: number; type: "earning" | "cashout"; note: string | null; created_at: string }[];

      let running = 0;
      const asc: LedgerRow[] = raw.map((e) => {
        running += e.amount_cents;
        return { id: e.id, date: e.created_at, entry: e.note ?? (e.type === "cashout" ? "Cash-out" : "Earning"), type: e.type, amountCents: e.amount_cents, balanceCents: running };
      });
      const balanceCents = running;

      // Last 6 ISO weeks of earnings.
      const weekMs = 7 * 86_400_000;
      const bars = Array.from({ length: 6 }, (_, i) => {
        const start = Date.now() - (5 - i) * weekMs;
        const end = start + weekMs;
        const value = raw
          .filter((e) => e.type === "earning" && new Date(e.created_at).getTime() >= start && new Date(e.created_at).getTime() < end)
          .reduce((s, e) => s + e.amount_cents, 0);
        return { label: `W${i + 30}`, value };
      });
      const monthEarnedCents = raw
        .filter((e) => e.type === "earning" && Date.now() - new Date(e.created_at).getTime() < 30 * 86_400_000)
        .reduce((s, e) => s + e.amount_cents, 0);

      return { balanceCents, approvedSinceCashout: asc.filter((e) => e.type === "earning").length, monthEarnedCents, bars, entries: asc.reverse() };
    },

    async listTemplates() {
      const { data, error } = await sb
        .from("task_templates")
        .select("id,title,description,amount_cents,schedule_cron,active")
        .order("id");
      if (error) throw error;
      return (data ?? []).map((t) => ({
        id: t.id, title: t.title, description: t.description, amountCents: t.amount_cents, scheduleCron: t.schedule_cron, active: t.active,
      }));
    },

    async saveTemplate(input: TemplateInput) {
      if (input.id != null) {
        const { error } = await sb.from("task_templates").update({
          title: input.title, description: input.description, amount_cents: input.amountCents, schedule_cron: input.scheduleCron,
        }).eq("id", input.id);
        if (error) throw error;
        return;
      }
      const doer = await sb.from("profiles").select("id").eq("role", "doer").maybeSingle();
      const appr = await sb.from("profiles").select("id").eq("role", "approver").maybeSingle();
      if (!doer.data || !appr.data) throw new Error("Set up Doer and Approver profiles first (run the seed or start the bot).");
      const { error } = await sb.from("task_templates").insert({
        title: input.title, description: input.description, amount_cents: input.amountCents, schedule_cron: input.scheduleCron,
        assignee_id: doer.data.id, approver_id: appr.data.id, active: true,
      });
      if (error) throw error;
    },

    async setTemplateActive(id, active) {
      const { error } = await sb.from("task_templates").update({ active }).eq("id", id);
      if (error) throw error;
    },

    async approveSubmission(submissionId) {
      const sub = (await sb.from("submissions").select("id,instance_id").eq("id", submissionId).maybeSingle()).data as { id: number; instance_id: number } | null;
      if (!sub) throw new Error("Submission not found.");
      const inst = (await sb.from("task_instances").select("id,amount_cents,assignee_id").eq("id", sub.instance_id).maybeSingle()).data as { id: number; amount_cents: number; assignee_id: number } | null;
      if (!inst) throw new Error("Task not found.");
      const appr = await sb.from("profiles").select("id").eq("role", "approver").maybeSingle();
      await sb.from("reviews").insert({ submission_id: sub.id, approver_id: appr.data?.id, decision: "approved", note: null });
      await sb.from("task_instances").update({ status: "approved" }).eq("id", inst.id);
      const { error } = await sb.from("ledger_entries").insert({ user_id: inst.assignee_id, instance_id: inst.id, amount_cents: inst.amount_cents, type: "earning", note: `Task #${inst.id}` });
      if (error) throw error;
    },

    async rejectSubmission(submissionId, reason) {
      const sub = (await sb.from("submissions").select("id,instance_id").eq("id", submissionId).maybeSingle()).data as { id: number; instance_id: number } | null;
      if (!sub) throw new Error("Submission not found.");
      const inst = (await sb.from("task_instances").select("id,kind").eq("id", sub.instance_id).maybeSingle()).data as { id: number; kind: string } | null;
      if (!inst) throw new Error("Task not found.");
      const appr = await sb.from("profiles").select("id").eq("role", "approver").maybeSingle();
      await sb.from("reviews").insert({ submission_id: sub.id, approver_id: appr.data?.id, decision: "rejected", note: reason || null });
      const next = inst.kind === "appraisal" ? "rejected" : "assigned";
      const { error } = await sb.from("task_instances").update({ status: next }).eq("id", inst.id);
      if (error) throw error;
    },
  };
}
