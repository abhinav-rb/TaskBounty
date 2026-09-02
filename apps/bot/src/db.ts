import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
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

const SCHEMA = `
CREATE TABLE IF NOT EXISTS profiles (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  role         TEXT NOT NULL UNIQUE,
  telegram_ref TEXT NOT NULL,
  telegram_id  INTEGER,
  username     TEXT,
  display_name TEXT,
  chat_id      INTEGER,
  created_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS task_templates (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  title         TEXT NOT NULL,
  description   TEXT,
  amount_cents  INTEGER NOT NULL,
  schedule_cron TEXT,
  assignee_id   INTEGER NOT NULL REFERENCES profiles(id),
  approver_id   INTEGER NOT NULL REFERENCES profiles(id),
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS task_instances (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  template_id      INTEGER REFERENCES task_templates(id),
  kind             TEXT NOT NULL DEFAULT 'assigned',
  title            TEXT NOT NULL,
  description      TEXT,
  amount_cents     INTEGER NOT NULL,
  assignee_id      INTEGER NOT NULL REFERENCES profiles(id),
  approver_id      INTEGER NOT NULL REFERENCES profiles(id),
  due_at           TEXT,
  status           TEXT NOT NULL DEFAULT 'assigned',
  created_at       TEXT NOT NULL,
  last_reminded_at TEXT
);

CREATE TABLE IF NOT EXISTS submissions (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  instance_id      INTEGER NOT NULL REFERENCES task_instances(id),
  telegram_file_id TEXT NOT NULL,
  photo_path       TEXT,
  note             TEXT,
  submitted_at     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reviews (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  submission_id INTEGER NOT NULL REFERENCES submissions(id),
  approver_id   INTEGER NOT NULL REFERENCES profiles(id),
  decision      TEXT NOT NULL,
  note          TEXT,
  decided_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ledger_entries (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES profiles(id),
  instance_id  INTEGER REFERENCES task_instances(id),
  amount_cents INTEGER NOT NULL,
  type         TEXT NOT NULL,
  note         TEXT,
  created_at   TEXT NOT NULL
);
`;

const now = () => new Date().toISOString();

/**
 * SQLite-backed store. This is the ONLY module that talks to the database, so
 * swapping it for a Supabase-backed store later means reimplementing this class
 * against the same method surface.
 */
export class Store {
  private db: Database.Database;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.db.exec(SCHEMA);
    this.migrate();
  }

  /** Idempotent upgrades for databases created by earlier versions. */
  private migrate(): void {
    this.ensureColumn(
      "task_instances",
      "kind",
      "TEXT NOT NULL DEFAULT 'assigned'",
    );
  }

  private ensureColumn(table: string, column: string, ddl: string): void {
    const cols = this.db
      .prepare(`PRAGMA table_info(${table})`)
      .all() as { name: string }[];
    if (!cols.some((c) => c.name === column)) {
      this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
    }
  }

  // ---- profiles ----------------------------------------------------------

  /** Ensure a profile row exists for a role, keeping its configured ref current. */
  seedProfile(role: Role, telegramRef: string): Profile {
    const existing = this.getProfileByRole(role);
    if (existing) {
      if (existing.telegram_ref !== telegramRef) {
        this.db
          .prepare(`UPDATE profiles SET telegram_ref = ? WHERE id = ?`)
          .run(telegramRef, existing.id);
      }
      return this.getProfileByRole(role)!;
    }
    this.db
      .prepare(
        `INSERT INTO profiles (role, telegram_ref, created_at) VALUES (?, ?, ?)`,
      )
      .run(role, telegramRef, now());
    return this.getProfileByRole(role)!;
  }

  getProfileByRole(role: Role): Profile | undefined {
    return this.db
      .prepare(`SELECT * FROM profiles WHERE role = ?`)
      .get(role) as Profile | undefined;
  }

  getProfileById(id: number): Profile | undefined {
    return this.db
      .prepare(`SELECT * FROM profiles WHERE id = ?`)
      .get(id) as Profile | undefined;
  }

  getProfileByChat(chatId: number): Profile | undefined {
    return this.db
      .prepare(`SELECT * FROM profiles WHERE chat_id = ?`)
      .get(chatId) as Profile | undefined;
  }

  linkProfileChat(
    id: number,
    data: {
      telegram_id: number;
      username: string | null;
      display_name: string | null;
      chat_id: number;
    },
  ): void {
    this.db
      .prepare(
        `UPDATE profiles
            SET telegram_id = ?, username = ?, display_name = ?, chat_id = ?
          WHERE id = ?`,
      )
      .run(
        data.telegram_id,
        data.username,
        data.display_name,
        data.chat_id,
        id,
      );
  }

  // ---- templates ---------------------------------------------------------

  createTemplate(t: {
    title: string;
    description: string | null;
    amount_cents: number;
    schedule_cron: string | null;
    assignee_id: number;
    approver_id: number;
  }): TaskTemplate {
    const info = this.db
      .prepare(
        `INSERT INTO task_templates
           (title, description, amount_cents, schedule_cron, assignee_id, approver_id, active, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
      )
      .run(
        t.title,
        t.description,
        t.amount_cents,
        t.schedule_cron,
        t.assignee_id,
        t.approver_id,
        now(),
      );
    return this.getTemplate(Number(info.lastInsertRowid))!;
  }

  getTemplate(id: number): TaskTemplate | undefined {
    return this.db
      .prepare(`SELECT * FROM task_templates WHERE id = ?`)
      .get(id) as TaskTemplate | undefined;
  }

  listTemplates(activeOnly = false): TaskTemplate[] {
    const sql = activeOnly
      ? `SELECT * FROM task_templates WHERE active = 1 ORDER BY id`
      : `SELECT * FROM task_templates ORDER BY id`;
    return this.db.prepare(sql).all() as TaskTemplate[];
  }

  setTemplateActive(id: number, active: boolean): void {
    this.db
      .prepare(`UPDATE task_templates SET active = ? WHERE id = ?`)
      .run(active ? 1 : 0, id);
  }

  // ---- instances ---------------------------------------------------------

  createInstance(i: {
    template_id: number | null;
    kind?: TaskKind;
    title: string;
    description: string | null;
    amount_cents: number;
    assignee_id: number;
    approver_id: number;
    due_at: string | null;
  }): TaskInstance {
    const info = this.db
      .prepare(
        `INSERT INTO task_instances
           (template_id, kind, title, description, amount_cents, assignee_id, approver_id, due_at, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'assigned', ?)`,
      )
      .run(
        i.template_id,
        i.kind ?? "assigned",
        i.title,
        i.description,
        i.amount_cents,
        i.assignee_id,
        i.approver_id,
        i.due_at,
        now(),
      );
    return this.getInstance(Number(info.lastInsertRowid))!;
  }

  getInstance(id: number): TaskInstance | undefined {
    return this.db
      .prepare(`SELECT * FROM task_instances WHERE id = ?`)
      .get(id) as TaskInstance | undefined;
  }

  setInstanceStatus(id: number, status: TaskStatus): void {
    this.db
      .prepare(`UPDATE task_instances SET status = ? WHERE id = ?`)
      .run(status, id);
  }

  setInstanceReminded(id: number, ts: string): void {
    this.db
      .prepare(`UPDATE task_instances SET last_reminded_at = ? WHERE id = ?`)
      .run(ts, id);
  }

  listInstancesForAssignee(
    assigneeId: number,
    statuses: TaskStatus[],
  ): TaskInstance[] {
    const placeholders = statuses.map(() => "?").join(", ");
    return this.db
      .prepare(
        `SELECT * FROM task_instances
          WHERE assignee_id = ? AND status IN (${placeholders})
          ORDER BY created_at`,
      )
      .all(assigneeId, ...statuses) as TaskInstance[];
  }

  listApprovedForAssigneeSince(
    assigneeId: number,
    sinceIso: string,
  ): TaskInstance[] {
    return this.db
      .prepare(
        `SELECT * FROM task_instances
          WHERE assignee_id = ? AND status = 'approved' AND created_at >= ?
          ORDER BY created_at DESC`,
      )
      .all(assigneeId, sinceIso) as TaskInstance[];
  }

  listOverdueAssigned(nowIso: string): TaskInstance[] {
    return this.db
      .prepare(
        `SELECT * FROM task_instances
          WHERE status = 'assigned' AND due_at IS NOT NULL AND due_at < ?
          ORDER BY due_at`,
      )
      .all(nowIso) as TaskInstance[];
  }

  // ---- submissions & reviews --------------------------------------------

  createSubmission(s: {
    instance_id: number;
    telegram_file_id: string;
    photo_path: string | null;
    note: string | null;
  }): Submission {
    const info = this.db
      .prepare(
        `INSERT INTO submissions (instance_id, telegram_file_id, photo_path, note, submitted_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(s.instance_id, s.telegram_file_id, s.photo_path, s.note, now());
    return this.getSubmission(Number(info.lastInsertRowid))!;
  }

  getSubmission(id: number): Submission | undefined {
    return this.db
      .prepare(`SELECT * FROM submissions WHERE id = ?`)
      .get(id) as Submission | undefined;
  }

  setSubmissionPhotoPath(id: number, path: string): void {
    this.db
      .prepare(`UPDATE submissions SET photo_path = ? WHERE id = ?`)
      .run(path, id);
  }

  createReview(r: {
    submission_id: number;
    approver_id: number;
    decision: ReviewDecision;
    note: string | null;
  }): Review {
    const info = this.db
      .prepare(
        `INSERT INTO reviews (submission_id, approver_id, decision, note, decided_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(r.submission_id, r.approver_id, r.decision, r.note, now());
    return this.db
      .prepare(`SELECT * FROM reviews WHERE id = ?`)
      .get(Number(info.lastInsertRowid)) as Review;
  }

  updateReviewNote(id: number, note: string): void {
    this.db.prepare(`UPDATE reviews SET note = ? WHERE id = ?`).run(note, id);
  }

  latestReviewForSubmission(submissionId: number): Review | undefined {
    return this.db
      .prepare(
        `SELECT * FROM reviews WHERE submission_id = ? ORDER BY id DESC LIMIT 1`,
      )
      .get(submissionId) as Review | undefined;
  }

  // ---- ledger ------------------------------------------------------------

  addLedgerEntry(e: {
    user_id: number;
    instance_id: number | null;
    amount_cents: number;
    type: LedgerType;
    note: string | null;
  }): LedgerEntry {
    const info = this.db
      .prepare(
        `INSERT INTO ledger_entries (user_id, instance_id, amount_cents, type, note, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(e.user_id, e.instance_id, e.amount_cents, e.type, e.note, now());
    return this.db
      .prepare(`SELECT * FROM ledger_entries WHERE id = ?`)
      .get(Number(info.lastInsertRowid)) as LedgerEntry;
  }

  getBalanceCents(userId: number): number {
    const row = this.db
      .prepare(
        `SELECT COALESCE(SUM(amount_cents), 0) AS bal FROM ledger_entries WHERE user_id = ?`,
      )
      .get(userId) as { bal: number };
    return row.bal;
  }

  /** Lifetime total credited (sum of earnings), across all users. */
  getTotalTransactedCents(): number {
    const row = this.db
      .prepare(
        `SELECT COALESCE(SUM(amount_cents), 0) AS total FROM ledger_entries WHERE type = 'earning'`,
      )
      .get() as { total: number };
    return row.total;
  }
}
