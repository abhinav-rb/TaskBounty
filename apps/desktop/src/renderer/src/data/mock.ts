import type {
  DashboardData,
  DataProvider,
  ReceiptRow,
  Role,
  Session,
  TemplateInput,
  TemplateRow,
} from "./types";

// Offline demo data so the app runs and is clickable with no Supabase project.
// Any non-empty code logs you in; use one of the demo phone numbers below.

const PEOPLE: Record<string, Session> = {
  "+10000000001": { profileId: 1, role: "doer", displayName: "Doer (demo)" },
  "+10000000002": { profileId: 2, role: "approver", displayName: "Approver (demo)" },
};

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString();
}

let templates: TemplateRow[] = [
  { id: 1, title: "Wash the car", description: "Soap, rinse, dry", amountCents: 1000, scheduleCron: "0 18 * * *", active: true },
  { id: 2, title: "Make the bed", description: "Corners tucked", amountCents: 200, scheduleCron: "0 8 * * *", active: true },
  { id: 3, title: "Mow the lawn", description: "Front + back", amountCents: 1500, scheduleCron: "0 10 * * 6", active: false },
];
let nextTemplateId = 4;

const receipts: ReceiptRow[] = [
  { id: 12, kind: "appraisal", title: "Cleaned the garage", description: "Swept + organized", amountCents: 2000, status: "approved", createdAt: daysAgo(1), submittedAt: daysAgo(1), photoUrl: null },
  { id: 11, kind: "assigned", title: "Wash the car", description: "Soap, rinse, dry", amountCents: 1000, status: "approved", createdAt: daysAgo(3), submittedAt: daysAgo(3), photoUrl: null },
  { id: 9, kind: "assigned", title: "Take out trash", description: null, amountCents: 300, status: "rejected", createdAt: daysAgo(6), submittedAt: daysAgo(6), photoUrl: null },
];

// Doer balance: 1000 + 2000 earnings − 500 cash-out = 2500. Total = 3000.
const BALANCE_CENTS = 2500;
const TOTAL_TRANSACTED_CENTS = 3000;

export function createMockProvider(): DataProvider {
  return {
    async requestLogin(phone: string): Promise<void> {
      // eslint-disable-next-line no-console
      console.info(`[mock] login code for ${phone} is 000000 (any code works)`);
    },
    async verifyLogin(phone: string, code: string): Promise<Session | null> {
      if (!code.trim()) return null;
      return PEOPLE[phone.trim()] ?? null;
    },
    async getDashboard(session: Session): Promise<DashboardData> {
      const role: Role = session.role;
      return {
        role,
        totalTransactedCents: TOTAL_TRANSACTED_CENTS,
        balanceCents: BALANCE_CENTS,
      };
    },
    async getHistory(_session: Session, sinceDays: number): Promise<ReceiptRow[]> {
      const cutoff = Date.now() - sinceDays * 86_400_000;
      return receipts.filter((r) => new Date(r.createdAt).getTime() >= cutoff);
    },
    async listTemplates(): Promise<TemplateRow[]> {
      return templates.map((t) => ({ ...t }));
    },
    async saveTemplate(input: TemplateInput): Promise<void> {
      if (input.id != null) {
        templates = templates.map((t) =>
          t.id === input.id
            ? { ...t, title: input.title, description: input.description, amountCents: input.amountCents, scheduleCron: input.scheduleCron }
            : t,
        );
      } else {
        templates.push({
          id: nextTemplateId++,
          title: input.title,
          description: input.description,
          amountCents: input.amountCents,
          scheduleCron: input.scheduleCron,
          active: true,
        });
      }
    },
    async setTemplateActive(id: number, active: boolean): Promise<void> {
      templates = templates.map((t) => (t.id === id ? { ...t, active } : t));
    },
  };
}
