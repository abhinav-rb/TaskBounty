export type Role = "approver" | "doer";

export interface Session {
  profileId: number;
  role: Role;
  displayName: string | null;
}

export interface PendingReview {
  submissionId: number;
  instanceId: number;
  title: string;
  amountCents: number;
  who: string;
  submittedLabel: string;
  note: string | null;
  photoUrl: string | null;
}

export interface OpenTask {
  id: number;
  title: string;
  dueLabel: string;
  amountCents: number;
  status: string;
}

export interface ActivityRow {
  id: number;
  status: string; // approved | rejected | submitted | assigned
  title: string;
  timeLabel: string;
  amountCents: number;
}

export interface DashboardData {
  role: Role;
  totalTransactedCents: number;
  approvedCount: number;
  balanceCents: number;
  awaitingCount: number;
  openTasksCount: number;
  pendingReviews: PendingReview[];
  openTasks: OpenTask[];
  recentActivity: ActivityRow[];
}

export interface ReceiptRow {
  id: number;
  ref: string;
  kind: "assigned" | "appraisal";
  title: string;
  description: string | null;
  amountCents: number;
  status: string;
  assignedAt: string | null;
  submittedAt: string | null;
  decidedAt: string | null;
  who: string;
  note: string | null;
  photoUrl: string | null;
}

export interface TemplateRow {
  id: number;
  title: string;
  description: string | null;
  amountCents: number;
  scheduleCron: string | null;
  active: boolean;
}

export interface TemplateInput {
  id?: number;
  title: string;
  description: string | null;
  amountCents: number;
  scheduleCron: string | null;
}

export interface LedgerRow {
  id: number;
  date: string;
  entry: string;
  type: "earning" | "cashout";
  amountCents: number;
  balanceCents: number;
}

export interface LedgerData {
  balanceCents: number;
  approvedSinceCashout: number;
  monthEarnedCents: number;
  bars: { label: string; value: number }[];
  entries: LedgerRow[];
}

/** Everything the UI needs, so screens never touch Supabase (or mocks) directly. */
export interface DataProvider {
  requestLogin(phone: string): Promise<void>;
  verifyLogin(phone: string, code: string): Promise<Session | null>;
  getDashboard(session: Session): Promise<DashboardData>;
  getHistory(session: Session, sinceDays: number): Promise<ReceiptRow[]>;
  getLedger(session: Session): Promise<LedgerData>;
  listTemplates(): Promise<TemplateRow[]>;
  saveTemplate(input: TemplateInput): Promise<void>;
  setTemplateActive(id: number, active: boolean): Promise<void>;
  approveSubmission(submissionId: number): Promise<void>;
  rejectSubmission(submissionId: number, reason: string): Promise<void>;
}
