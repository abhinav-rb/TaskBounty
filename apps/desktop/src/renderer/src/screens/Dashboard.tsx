import { Camera, Check, X } from "lucide-react";
import { useEffect, useState } from "react";
import { PageHeader, statusTagClass } from "../components";
import type { DashboardData, DataProvider, PendingReview, Session } from "../data/types";
import { formatMoney } from "../money";

const SUBTITLE: Record<string, string> = {
  approver: "The loop at a glance — what is owed, what is waiting.",
  doer: "The loop at a glance — what you're owed, what's next.",
};

export function Dashboard({ provider, session }: { provider: DataProvider; session: Session }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<PendingReview | null>(null);
  const [busy, setBusy] = useState(false);

  function reload() {
    provider.getDashboard(session).then(setData).catch((e) => setError((e as Error).message));
  }
  useEffect(() => {
    let alive = true;
    provider.getDashboard(session).then((d) => alive && setData(d)).catch((e) => alive && setError((e as Error).message));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, session]);

  async function approve(p: PendingReview) {
    setBusy(true);
    try { await provider.approveSubmission(p.submissionId); reload(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function confirmReject(reason: string) {
    if (!rejecting) return;
    setBusy(true);
    try { await provider.rejectSubmission(rejecting.submissionId, reason); setRejecting(null); reload(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  const isApprover = session.role === "approver";

  return (
    <>
      <PageHeader title="Dashboard" subtitle={SUBTITLE[session.role] ?? ""} />
      {error && <div className="error">{error}</div>}
      {!data ? (
        <div className="muted">Loading…</div>
      ) : (
        <>
          <div className="stat-row">
            <div className="card elev-sm stat-card tinted">
              <div className="card-kicker">{isApprover ? "Owed to the Doer" : "Ready to receive"}</div>
              <div className="stat-value">{formatMoney(data.balanceCents)}</div>
              <div className="stat-meta muted">{isApprover ? "Balance the Doer can cash out" : "Cash out any time from the bot"}</div>
            </div>
            <div className="card elev-sm stat-card sage">
              <div className="card-kicker">Total transacted</div>
              <div className="stat-value">{formatMoney(data.totalTransactedCents)}</div>
              <div className="stat-meta muted">{data.approvedCount} approved tasks</div>
            </div>
            <div className="card elev-sm stat-card sage">
              <div className="card-kicker">{isApprover ? "Awaiting review" : "Open tasks"}</div>
              <div className="stat-value">{isApprover ? data.awaitingCount : data.openTasksCount}</div>
              <div className="stat-meta muted">
                {isApprover
                  ? data.awaitingCount ? "Waiting on your sign-off" : "Nothing waiting on you"
                  : data.openTasksCount ? "Send a photo to submit proof" : "You're all caught up"}
              </div>
            </div>
          </div>

          {isApprover && (
            <div className="section">
              <div className="section-head">
                <h4>Needs your review</h4>
                <span className="muted small">Approving credits the Doer's balance instantly</span>
              </div>
              {data.pendingReviews.length === 0 ? (
                <div className="card elev-sm empty-card">
                  <h4>Queue clear</h4>
                  <div className="muted small">Nothing waiting on you. New submissions arrive here and in Telegram.</div>
                </div>
              ) : (
                data.pendingReviews.map((p) => (
                  <div key={p.submissionId} className="card elev-sm review-card">
                    <div className="review-photo washed">
                      {p.photoUrl ? <img src={p.photoUrl} alt="proof" /> : <div className="photo-fallback"><Camera size={22} strokeWidth={2.75} /></div>}
                    </div>
                    <div className="review-mid">
                      <div className="spread">
                        <span style={{ fontFamily: "var(--font-heading)", fontSize: 19 }}>{p.title}</span>
                        <span className="tag tag-accent">{formatMoney(p.amountCents)}</span>
                      </div>
                      <div className="muted small">Submitted {p.submittedLabel} · by {p.who}</div>
                      {p.note && <div className="small" style={{ fontStyle: "italic" }}>“{p.note}”</div>}
                    </div>
                    <div className="review-actions">
                      <button className="btn btn-primary" style={{ minWidth: 132 }} disabled={busy} onClick={() => void approve(p)}>
                        <Check size={16} strokeWidth={2.75} /> Approve
                      </button>
                      <button className="btn btn-secondary" disabled={busy} onClick={() => setRejecting(p)}>
                        <X size={16} strokeWidth={2.75} /> Send back
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {!isApprover && (
            <div className="section">
              <div className="section-head">
                <h4>Your open tasks</h4>
                <span className="muted small">Send a photo to <strong>@taskbounty_bot</strong> to submit proof</span>
              </div>
              <div className="card elev-sm task-list">
                {data.openTasks.length === 0 ? (
                  <div className="muted small" style={{ padding: "16px 0" }}>No open tasks right now. 🎉</div>
                ) : (
                  data.openTasks.map((t) => (
                    <div key={t.id} className="task-row">
                      <span className="task-icon"><Camera size={18} strokeWidth={2.75} /></span>
                      <div className="task-main">
                        <div className="task-title">{t.title}</div>
                        <div className="muted small">Due {t.dueLabel}</div>
                      </div>
                      <span className="tag tag-neutral">{formatMoney(t.amountCents)}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          <div className="section">
            <h4>Recent activity</h4>
            <div className="card elev-sm activity-list">
              {data.recentActivity.length === 0 ? (
                <div className="muted small" style={{ padding: "14px 0" }}>Nothing yet.</div>
              ) : (
                data.recentActivity.map((a) => (
                  <div key={a.id} className="activity-row">
                    <span className={statusTagClass(a.status)}>{a.status}</span>
                    <span className="activity-title">{a.title}</span>
                    <span className="muted small">{a.timeLabel}</span>
                    <span className="activity-amount">{formatMoney(a.amountCents)}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}

      {rejecting && <RejectDialog review={rejecting} busy={busy} onCancel={() => setRejecting(null)} onConfirm={confirmReject} />}
    </>
  );
}

function RejectDialog({
  review,
  busy,
  onCancel,
  onConfirm,
}: {
  review: PendingReview;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <div className="dialog-backdrop" onClick={onCancel}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-title">Send “{review.title}” back</div>
        <div className="dialog-body">The Doer gets your reason in Telegram and can redo the task.</div>
        <div className="field">
          <label>Reason</label>
          <textarea className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Photo was too dark to tell — please retake in good light." />
        </div>
        <div className="dialog-actions">
          <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" disabled={busy} onClick={() => onConfirm(reason.trim())}>Send back</button>
        </div>
      </div>
    </div>
  );
}
