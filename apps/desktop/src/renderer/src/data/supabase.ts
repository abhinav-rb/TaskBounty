import { createClient } from "@supabase/supabase-js";
import type {
  DashboardData,
  DataProvider,
  ReceiptRow,
  Session,
  TemplateInput,
  TemplateRow,
} from "./types";

interface RawSubmission {
  id: number;
  storage_path: string | null;
  submitted_at: string;
}
interface RawInstance {
  id: number;
  kind: "assigned" | "appraisal";
  title: string;
  description: string | null;
  amount_cents: number;
  status: string;
  created_at: string;
  submissions: RawSubmission[] | null;
}

export function createSupabaseProvider(url: string, anonKey: string): DataProvider {
  const sb = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const sum = (rows: { amount_cents: number }[] | null): number =>
    (rows ?? []).reduce((s, r) => s + r.amount_cents, 0);

  return {
    async requestLogin(phone: string): Promise<void> {
      const { error } = await sb.rpc("request_login", { p_phone: phone });
      if (error) throw error;
    },

    async verifyLogin(phone: string, code: string): Promise<Session | null> {
      const { data, error } = await sb.rpc("verify_login", {
        p_phone: phone,
        p_code: code,
      });
      if (error) throw error;
      const row = (data as { profile_id: number; role: Session["role"]; display_name: string | null }[] | null)?.[0];
      if (!row) return null;
      return { profileId: row.profile_id, role: row.role, displayName: row.display_name };
    },

    async getDashboard(session: Session): Promise<DashboardData> {
      const earnings = await sb
        .from("ledger_entries")
        .select("amount_cents")
        .eq("type", "earning");
      if (earnings.error) throw earnings.error;

      const doer = await sb.from("profiles").select("id").eq("role", "doer").maybeSingle();
      if (doer.error) throw doer.error;

      let balanceCents = 0;
      if (doer.data) {
        const led = await sb
          .from("ledger_entries")
          .select("amount_cents")
          .eq("user_id", doer.data.id);
        if (led.error) throw led.error;
        balanceCents = sum(led.data);
      }

      return {
        role: session.role,
        totalTransactedCents: sum(earnings.data),
        balanceCents,
      };
    },

    async getHistory(_session: Session, sinceDays: number): Promise<ReceiptRow[]> {
      const since = new Date(Date.now() - sinceDays * 86_400_000).toISOString();
      const { data, error } = await sb
        .from("task_instances")
        .select(
          "id,kind,title,description,amount_cents,status,created_at,submissions(id,storage_path,submitted_at)",
        )
        .gte("created_at", since)
        .in("status", ["approved", "rejected"])
        .order("created_at", { ascending: false });
      if (error) throw error;

      const rows: ReceiptRow[] = [];
      for (const inst of (data ?? []) as unknown as RawInstance[]) {
        const subs = inst.submissions ?? [];
        const latest = subs.length
          ? subs.reduce((a, b) => (a.id > b.id ? a : b))
          : null;
        let photoUrl: string | null = null;
        if (latest?.storage_path) {
          const signed = await sb.storage
            .from("proofs")
            .createSignedUrl(latest.storage_path, 3600);
          photoUrl = signed.data?.signedUrl ?? null;
        }
        rows.push({
          id: inst.id,
          kind: inst.kind,
          title: inst.title,
          description: inst.description,
          amountCents: inst.amount_cents,
          status: inst.status,
          createdAt: inst.created_at,
          submittedAt: latest?.submitted_at ?? null,
          photoUrl,
        });
      }
      return rows;
    },

    async listTemplates(): Promise<TemplateRow[]> {
      const { data, error } = await sb
        .from("task_templates")
        .select("id,title,description,amount_cents,schedule_cron,active")
        .order("id");
      if (error) throw error;
      return (data ?? []).map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description,
        amountCents: t.amount_cents,
        scheduleCron: t.schedule_cron,
        active: t.active,
      }));
    },

    async saveTemplate(input: TemplateInput): Promise<void> {
      if (input.id != null) {
        const { error } = await sb
          .from("task_templates")
          .update({
            title: input.title,
            description: input.description,
            amount_cents: input.amountCents,
            schedule_cron: input.scheduleCron,
          })
          .eq("id", input.id);
        if (error) throw error;
        return;
      }
      const doer = await sb.from("profiles").select("id").eq("role", "doer").maybeSingle();
      const appr = await sb.from("profiles").select("id").eq("role", "approver").maybeSingle();
      if (doer.error) throw doer.error;
      if (appr.error) throw appr.error;
      if (!doer.data || !appr.data) {
        throw new Error("Set up Doer and Approver profiles first (run the seed or start the bot).");
      }
      const { error } = await sb.from("task_templates").insert({
        title: input.title,
        description: input.description,
        amount_cents: input.amountCents,
        schedule_cron: input.scheduleCron,
        assignee_id: doer.data.id,
        approver_id: appr.data.id,
        active: true,
      });
      if (error) throw error;
    },

    async setTemplateActive(id: number, active: boolean): Promise<void> {
      const { error } = await sb.from("task_templates").update({ active }).eq("id", id);
      if (error) throw error;
    },
  };
}
