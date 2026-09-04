// The bot's data-access contract. Two implementations satisfy it:
//   - SqliteStore   (db.ts)           — local, free, zero external accounts
//   - SupabaseStore (supabase-store.ts) — shared cloud DB, so the desktop app
//                                          sees the same data
// The bot logic depends only on this interface, so switching backends is an
// env-var change (see config.ts / index.ts).

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

export interface Store {
  // profiles
  seedProfile(role: Role, telegramRef: string): Promise<Profile>;
  getProfileByRole(role: Role): Promise<Profile | undefined>;
  getProfileById(id: number): Promise<Profile | undefined>;
  getProfileByChat(chatId: number): Promise<Profile | undefined>;
  getProfileByPhone(phone: string): Promise<Profile | undefined>;
  linkProfileChat(
    id: number,
    data: { telegram_id: number; username: string | null; display_name: string | null; chat_id: number },
  ): Promise<void>;

  // templates
  createTemplate(t: {
    title: string; description: string | null; amount_cents: number;
    schedule_cron: string | null; assignee_id: number; approver_id: number;
  }): Promise<TaskTemplate>;
  getTemplate(id: number): Promise<TaskTemplate | undefined>;
  listTemplates(activeOnly?: boolean): Promise<TaskTemplate[]>;
  setTemplateActive(id: number, active: boolean): Promise<void>;

  // instances
  createInstance(i: {
    template_id: number | null; kind?: TaskKind; title: string; description: string | null;
    amount_cents: number; assignee_id: number; approver_id: number; due_at: string | null;
  }): Promise<TaskInstance>;
  getInstance(id: number): Promise<TaskInstance | undefined>;
  setInstanceStatus(id: number, status: TaskStatus): Promise<void>;
  setInstanceReminded(id: number, ts: string): Promise<void>;
  listInstancesForAssignee(assigneeId: number, statuses: TaskStatus[]): Promise<TaskInstance[]>;
  listApprovedForAssigneeSince(assigneeId: number, sinceIso: string): Promise<TaskInstance[]>;
  listOverdueAssigned(nowIso: string): Promise<TaskInstance[]>;

  // submissions & reviews
  createSubmission(s: {
    instance_id: number; telegram_file_id: string; photo_path: string | null; note: string | null;
  }): Promise<Submission>;
  getSubmission(id: number): Promise<Submission | undefined>;
  setSubmissionPhotoPath(id: number, path: string): Promise<void>;
  /** Persist proof-photo bytes and return the stored path/key. SqliteStore
   *  writes to local disk; SupabaseStore uploads to the 'proofs' bucket. */
  uploadProof(submissionId: number, bytes: Uint8Array): Promise<string>;
  createReview(r: {
    submission_id: number; approver_id: number; decision: ReviewDecision; note: string | null;
  }): Promise<Review>;
  updateReviewNote(id: number, note: string): Promise<void>;

  // ledger
  addLedgerEntry(e: {
    user_id: number; instance_id: number | null; amount_cents: number; type: LedgerType; note: string | null;
  }): Promise<LedgerEntry>;
  getBalanceCents(userId: number): Promise<number>;
  getTotalTransactedCents(): Promise<number>;
}
