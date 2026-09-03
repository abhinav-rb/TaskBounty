import type {
  DashboardData,
  DataProvider,
  LedgerData,
  PendingReview,
  ReceiptRow,
  Session,
  TemplateInput,
  TemplateRow,
} from "./types";

// Offline demo data (values mirror the design handoff) so the app runs and is
// fully clickable with no Supabase project. Any non-empty code logs you in.

const PEOPLE: Record<string, Session> = {
  "+10000000001": { profileId: 1, role: "doer", displayName: "Dev" },
  "+10000000002": { profileId: 2, role: "approver", displayName: "Maya" },
};

function isoDaysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString();
}
function isoHoursAgo(n: number): string {
  return new Date(Date.now() - n * 3_600_000).toISOString();
}

let balanceCents = 4600;

let templates: TemplateRow[] = [
  { id: 1, title: "Wash the car", description: "Soap, rinse, dry", amountCents: 1000, scheduleCron: "0 18 * * 0", active: true },
  { id: 2, title: "Take out trash", description: "Blue bin to the curb", amountCents: 400, scheduleCron: "0 20 * * 1,4", active: true },
  { id: 3, title: "Dishes", description: "Wash, dry, put away", amountCents: 600, scheduleCron: "0 21 * * *", active: true },
  { id: 4, title: "Vacuum living room", description: "Under the couch too", amountCents: 1200, scheduleCron: "0 11 * * 6", active: true },
  { id: 5, title: "Water the plants", description: "All rooms", amountCents: 300, scheduleCron: "0 7 * * 2,5", active: false },
];
let nextTemplateId = 6;

let pendingReviews: PendingReview[] = [
  { submissionId: 101, instanceId: 201, title: "Wash the car", amountCents: 1000, who: "Dev", submittedLabel: "2 hours ago", note: "Rinsed twice, dried the mirrors.", photoUrl: null },
  { submissionId: 102, instanceId: 202, title: "Dishes", amountCents: 600, who: "Dev", submittedLabel: "40 minutes ago", note: null, photoUrl: null },
];

const openTasks = [
  { id: 301, title: "Take out trash", dueLabel: "today, 8:00 pm", amountCents: 400, status: "assigned" },
  { id: 302, title: "Vacuum living room", dueLabel: "tomorrow, 11:00 am", amountCents: 1200, status: "assigned" },
  { id: 303, title: "Water the plants", dueLabel: "today, 7:00 am", amountCents: 300, status: "assigned" },
];

let recentActivity = [
  { id: 401, status: "approved", title: "Cleaned the garage", timeLabel: "yesterday", amountCents: 2000 },
  { id: 402, status: "approved", title: "Wash the car", timeLabel: "3 days ago", amountCents: 1000 },
  { id: 403, status: "rejected", title: "Take out trash", timeLabel: "6 days ago", amountCents: 300 },
];

const receipts: ReceiptRow[] = [
  { id: 42, ref: "R-1042", kind: "appraisal", title: "Cleaned the garage", description: "Swept + organized", amountCents: 2000, status: "approved", assignedAt: null, submittedAt: isoDaysAgo(1), decidedAt: isoDaysAgo(1), who: "Dev", note: "Took about an hour — moved the bikes out.", photoUrl: null },
  { id: 41, ref: "R-1041", kind: "assigned", title: "Wash the car", description: "Soap, rinse, dry", amountCents: 1000, status: "approved", assignedAt: isoDaysAgo(3), submittedAt: isoDaysAgo(3), decidedAt: isoDaysAgo(3), who: "Dev", note: null, photoUrl: null },
  { id: 40, ref: "R-1040", kind: "assigned", title: "Dishes", description: "Wash, dry, put away", amountCents: 600, status: "awaiting", assignedAt: isoHoursAgo(3), submittedAt: isoHoursAgo(1), decidedAt: null, who: "Dev", note: "All done and put away.", photoUrl: null },
  { id: 39, ref: "R-1039", kind: "assigned", title: "Take out trash", description: "Blue bin", amountCents: 300, status: "sent back", assignedAt: isoDaysAgo(6), submittedAt: isoDaysAgo(6), decidedAt: isoDaysAgo(6), who: "Dev", note: "Photo was too dark to tell.", photoUrl: null },
  { id: 38, ref: "R-1038", kind: "assigned", title: "Vacuum living room", description: "Under the couch too", amountCents: 1200, status: "approved", assignedAt: isoDaysAgo(9), submittedAt: isoDaysAgo(9), decidedAt: isoDaysAgo(8), who: "Dev", note: null, photoUrl: null },
];

const ledger: LedgerData = {
  balanceCents: 4600,
  approvedSinceCashout: 6,
  monthEarnedCents: 7400,
  bars: [
    { label: "W30", value: 28 }, { label: "W31", value: 52 }, { label: "W32", value: 38 },
    { label: "W33", value: 74 }, { label: "W34", value: 46 }, { label: "W35", value: 96 },
  ],
  entries: [
    { id: 6, date: isoDaysAgo(1), entry: "Cleaned the garage", type: "earning", amountCents: 600, balanceCents: 4600 },
    { id: 5, date: isoDaysAgo(3), entry: "Wash the car", type: "earning", amountCents: 1200, balanceCents: 4000 },
    { id: 4, date: isoDaysAgo(5), entry: "Dishes", type: "earning", amountCents: 600, balanceCents: 2800 },
    { id: 3, date: isoDaysAgo(7), entry: "Take out trash", type: "earning", amountCents: 400, balanceCents: 2200 },
    { id: 2, date: isoDaysAgo(9), entry: "Vacuum living room", type: "earning", amountCents: 1000, balanceCents: 1800 },
    { id: 1, date: isoDaysAgo(14), entry: "Cash-out", type: "cashout", amountCents: -800, balanceCents: 800 },
  ],
};

export function createMockProvider(): DataProvider {
  return {
    async requestLogin(phone) {
      // eslint-disable-next-line no-console
      console.info(`[mock] login code for ${phone} is 000000 (any code works)`);
    },
    async verifyLogin(phone, code) {
      if (!code.trim()) return null;
      return PEOPLE[phone.trim()] ?? null;
    },
    async getDashboard(session): Promise<DashboardData> {
      return {
        role: session.role,
        totalTransactedCents: 31200,
        approvedCount: 42,
        balanceCents,
        awaitingCount: pendingReviews.length,
        openTasksCount: openTasks.length,
        pendingReviews: pendingReviews.map((p) => ({ ...p })),
        openTasks: openTasks.map((t) => ({ ...t })),
        recentActivity: recentActivity.map((a) => ({ ...a })),
      };
    },
    async getHistory(_session, sinceDays) {
      const cutoff = Date.now() - sinceDays * 86_400_000;
      return receipts.filter((r) => new Date(r.submittedAt ?? r.assignedAt ?? new Date().toISOString()).getTime() >= cutoff);
    },
    async getLedger(_session) {
      return { ...ledger, balanceCents, entries: ledger.entries.map((e) => ({ ...e })), bars: ledger.bars.map((b) => ({ ...b })) };
    },
    async listTemplates() {
      return templates.map((t) => ({ ...t }));
    },
    async saveTemplate(input: TemplateInput) {
      if (input.id != null) {
        templates = templates.map((t) =>
          t.id === input.id ? { ...t, title: input.title, description: input.description, amountCents: input.amountCents, scheduleCron: input.scheduleCron } : t,
        );
      } else {
        templates.push({ id: nextTemplateId++, title: input.title, description: input.description, amountCents: input.amountCents, scheduleCron: input.scheduleCron, active: true });
      }
    },
    async setTemplateActive(id, active) {
      templates = templates.map((t) => (t.id === id ? { ...t, active } : t));
    },
    async approveSubmission(submissionId) {
      const item = pendingReviews.find((p) => p.submissionId === submissionId);
      if (!item) return;
      pendingReviews = pendingReviews.filter((p) => p.submissionId !== submissionId);
      balanceCents += item.amountCents;
      recentActivity = [{ id: Date.now(), status: "approved", title: item.title, timeLabel: "just now", amountCents: item.amountCents }, ...recentActivity];
    },
    async rejectSubmission(submissionId, _reason) {
      const item = pendingReviews.find((p) => p.submissionId === submissionId);
      if (!item) return;
      pendingReviews = pendingReviews.filter((p) => p.submissionId !== submissionId);
      recentActivity = [{ id: Date.now(), status: "rejected", title: item.title, timeLabel: "just now", amountCents: item.amountCents }, ...recentActivity];
    },
  };
}
