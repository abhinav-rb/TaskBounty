import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Store } from "./store.js";
import type {
  LedgerEntry,
  LedgerType,
  Profile,
  Review,
  ReviewDecision,
  Role,
  Submission,
  TaskInstance,
  TaskKind,
  TaskStatus,
  TaskTemplate,
} from "./types.js";

// The Supabase `profiles` table uses phone / telegram_username / telegram_chat_id
// (no telegram_ref — role matching is env-driven, so it isn't needed in the DB).
function mapProfile(r: Record<string, unknown> | null): Profile | undefined {
  if (!r) return undefined;
  return {
    id: r.id as number,
    role: r.role as Role,
    telegram_ref: "",
    telegram_id: (r.telegram_id as number | null) ?? null,
    username: (r.telegram_username as string | null) ?? null,
    display_name: (r.display_name as string | null) ?? null,
    chat_id: (r.telegram_chat_id as number | null) ?? null,
    created_at: r.created_at as string,
  };
}
function mapTemplate(r: Record<string, unknown>): TaskTemplate {
  return {
    id: r.id as number,
    title: r.title as string,
    description: (r.description as string | null) ?? null,
    amount_cents: r.amount_cents as number,
    schedule_cron: (r.schedule_cron as string | null) ?? null,
    assignee_id: r.assignee_id as number,
    approver_id: r.approver_id as number,
    active: r.active ? 1 : 0,
    created_at: r.created_at as string,
  };
}
function mapSubmission(r: Record<string, unknown>): Submission {
  return {
    id: r.id as number,
    instance_id: r.instance_id as number,
    telegram_file_id: (r.telegram_file_id as string | null) ?? "",
    photo_path: (r.storage_path as string | null) ?? null,
    note: (r.note as string | null) ?? null,
    submitted_at: r.submitted_at as string,
  };
}

export class SupabaseStore implements Store {
  private sb: SupabaseClient;
  constructor(url: string, serviceKey: string) {
    this.sb = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  }

  // ---- profiles ----------------------------------------------------------

  async seedProfile(role: Role, _telegramRef: string): Promise<Profile> {
    const existing = await this.getProfileByRole(role);
    if (existing) return existing;
    await this.sb.from("profiles").insert({ role });
    return (await this.getProfileByRole(role))!;
  }
  async getProfileByRole(role: Role): Promise<Profile | undefined> {
    const { data } = await this.sb.from("profiles").select("*").eq("role", role).maybeSingle();
    return mapProfile(data);
  }
  async getProfileById(id: number): Promise<Profile | undefined> {
    const { data } = await this.sb.from("profiles").select("*").eq("id", id).maybeSingle();
    return mapProfile(data);
  }
  async getProfileByChat(chatId: number): Promise<Profile | undefined> {
    const { data } = await this.sb.from("profiles").select("*").eq("telegram_chat_id", chatId).maybeSingle();
    return mapProfile(data);
  }
  async getProfileByPhone(phone: string): Promise<Profile | undefined> {
    const { data } = await this.sb.from("profiles").select("*").eq("phone", phone).maybeSingle();
    return mapProfile(data);
  }
  async linkProfileChat(
    id: number,
    data: { telegram_id: number; username: string | null; display_name: string | null; chat_id: number },
  ): Promise<void> {
    await this.sb.from("profiles").update({
      telegram_id: data.telegram_id,
      telegram_username: data.username,
      display_name: data.display_name,
      telegram_chat_id: data.chat_id,
    }).eq("id", id);
  }

  // ---- templates ---------------------------------------------------------

  async createTemplate(t: {
    title: string; description: string | null; amount_cents: number;
    schedule_cron: string | null; assignee_id: number; approver_id: number;
  }): Promise<TaskTemplate> {
    const { data, error } = await this.sb.from("task_templates").insert({
      title: t.title, description: t.description, amount_cents: t.amount_cents,
      schedule_cron: t.schedule_cron, assignee_id: t.assignee_id, approver_id: t.approver_id, active: true,
    }).select().single();
    if (error) throw error;
    return mapTemplate(data as Record<string, unknown>);
  }
  async getTemplate(id: number): Promise<TaskTemplate | undefined> {
    const { data } = await this.sb.from("task_templates").select("*").eq("id", id).maybeSingle();
    return data ? mapTemplate(data as Record<string, unknown>) : undefined;
  }
  async listTemplates(activeOnly = false): Promise<TaskTemplate[]> {
    let q = this.sb.from("task_templates").select("*").order("id");
    if (activeOnly) q = q.eq("active", true);
    const { data, error } = await q;
    if (error) throw error;
    return ((data ?? []) as Record<string, unknown>[]).map(mapTemplate);
  }
  async setTemplateActive(id: number, active: boolean): Promise<void> {
    await this.sb.from("task_templates").update({ active }).eq("id", id);
  }

  // ---- instances ---------------------------------------------------------

  async createInstance(i: {
    template_id: number | null; kind?: TaskKind; title: string; description: string | null;
    amount_cents: number; assignee_id: number; approver_id: number; due_at: string | null;
  }): Promise<TaskInstance> {
    const { data, error } = await this.sb.from("task_instances").insert({
      template_id: i.template_id, kind: i.kind ?? "assigned", title: i.title, description: i.description,
      amount_cents: i.amount_cents, assignee_id: i.assignee_id, approver_id: i.approver_id, due_at: i.due_at, status: "assigned",
    }).select().single();
    if (error) throw error;
    return data as unknown as TaskInstance;
  }
  async getInstance(id: number): Promise<TaskInstance | undefined> {
    const { data } = await this.sb.from("task_instances").select("*").eq("id", id).maybeSingle();
    return (data as unknown as TaskInstance) ?? undefined;
  }
  async setInstanceStatus(id: number, status: TaskStatus): Promise<void> {
    await this.sb.from("task_instances").update({ status }).eq("id", id);
  }
  async setInstanceReminded(id: number, ts: string): Promise<void> {
    await this.sb.from("task_instances").update({ last_reminded_at: ts }).eq("id", id);
  }
  async listInstancesForAssignee(assigneeId: number, statuses: TaskStatus[]): Promise<TaskInstance[]> {
    const { data, error } = await this.sb.from("task_instances").select("*").eq("assignee_id", assigneeId).in("status", statuses).order("created_at");
    if (error) throw error;
    return (data ?? []) as unknown as TaskInstance[];
  }
  async listApprovedForAssigneeSince(assigneeId: number, sinceIso: string): Promise<TaskInstance[]> {
    const { data, error } = await this.sb.from("task_instances").select("*").eq("assignee_id", assigneeId).eq("status", "approved").gte("created_at", sinceIso).order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as unknown as TaskInstance[];
  }
  async listOverdueAssigned(nowIso: string): Promise<TaskInstance[]> {
    const { data, error } = await this.sb.from("task_instances").select("*").eq("status", "assigned").not("due_at", "is", null).lt("due_at", nowIso).order("due_at");
    if (error) throw error;
    return (data ?? []) as unknown as TaskInstance[];
  }

  // ---- submissions & reviews --------------------------------------------

  async createSubmission(s: {
    instance_id: number; telegram_file_id: string; photo_path: string | null; note: string | null;
  }): Promise<Submission> {
    const { data, error } = await this.sb.from("submissions").insert({
      instance_id: s.instance_id, telegram_file_id: s.telegram_file_id, storage_path: s.photo_path, note: s.note,
    }).select().single();
    if (error) throw error;
    return mapSubmission(data as Record<string, unknown>);
  }
  async getSubmission(id: number): Promise<Submission | undefined> {
    const { data } = await this.sb.from("submissions").select("*").eq("id", id).maybeSingle();
    return data ? mapSubmission(data as Record<string, unknown>) : undefined;
  }
  async setSubmissionPhotoPath(id: number, path: string): Promise<void> {
    await this.sb.from("submissions").update({ storage_path: path }).eq("id", id);
  }
  async uploadProof(submissionId: number, bytes: Uint8Array): Promise<string> {
    const key = `submission-${submissionId}.jpg`;
    const { error } = await this.sb.storage.from("proofs").upload(key, bytes, { contentType: "image/jpeg", upsert: true });
    if (error) throw error;
    return key;
  }
  async createReview(r: {
    submission_id: number; approver_id: number; decision: ReviewDecision; note: string | null;
  }): Promise<Review> {
    const { data, error } = await this.sb.from("reviews").insert({
      submission_id: r.submission_id, approver_id: r.approver_id, decision: r.decision, note: r.note,
    }).select().single();
    if (error) throw error;
    return data as unknown as Review;
  }
  async updateReviewNote(id: number, note: string): Promise<void> {
    await this.sb.from("reviews").update({ note }).eq("id", id);
  }

  // ---- ledger ------------------------------------------------------------

  async addLedgerEntry(e: {
    user_id: number; instance_id: number | null; amount_cents: number; type: LedgerType; note: string | null;
  }): Promise<LedgerEntry> {
    const { data, error } = await this.sb.from("ledger_entries").insert({
      user_id: e.user_id, instance_id: e.instance_id, amount_cents: e.amount_cents, type: e.type, note: e.note,
    }).select().single();
    if (error) throw error;
    return data as unknown as LedgerEntry;
  }
  async getBalanceCents(userId: number): Promise<number> {
    const { data, error } = await this.sb.from("ledger_entries").select("amount_cents").eq("user_id", userId);
    if (error) throw error;
    return ((data ?? []) as { amount_cents: number }[]).reduce((s, r) => s + r.amount_cents, 0);
  }
  async getTotalTransactedCents(): Promise<number> {
    const { data, error } = await this.sb.from("ledger_entries").select("amount_cents").eq("type", "earning");
    if (error) throw error;
    return ((data ?? []) as { amount_cents: number }[]).reduce((s, r) => s + r.amount_cents, 0);
  }
}
