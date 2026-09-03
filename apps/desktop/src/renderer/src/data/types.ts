export type Role = "approver" | "doer";

export interface Session {
  profileId: number;
  role: Role;
  displayName: string | null;
}

export interface DashboardData {
  role: Role;
  /** Lifetime total credited across everyone (sum of earnings). */
  totalTransactedCents: number;
  /**
   * The Doer's current balance. Shown as "ready to receive" to the Doer and as
   * "you owe" to the Approver — same number, mirrored perspective.
   */
  balanceCents: number;
}

export interface ReceiptRow {
  id: number;
  kind: "assigned" | "appraisal";
  title: string;
  description: string | null;
  amountCents: number;
  status: string;
  createdAt: string;
  submittedAt: string | null;
  /** Signed URL to the proof photo, if any. */
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

/** Everything the UI needs, so screens never touch Supabase (or mocks) directly. */
export interface DataProvider {
  requestLogin(phone: string): Promise<void>;
  verifyLogin(phone: string, code: string): Promise<Session | null>;
  getDashboard(session: Session): Promise<DashboardData>;
  getHistory(session: Session, sinceDays: number): Promise<ReceiptRow[]>;
  listTemplates(): Promise<TemplateRow[]>;
  saveTemplate(input: TemplateInput): Promise<void>;
  setTemplateActive(id: number, active: boolean): Promise<void>;
}
