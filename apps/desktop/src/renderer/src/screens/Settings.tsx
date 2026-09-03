import { PageHeader } from "../components";
import type { Session } from "../data/types";

export function Settings({ session, onSignOut }: { session: Session; onSignOut: () => void }) {
  const isApprover = session.role === "approver";
  const name = session.displayName ?? "You";
  const inits = name.trim().slice(0, 2).toUpperCase();

  return (
    <>
      <PageHeader title="Settings" subtitle="Your profile, reminders and this device." />
      <div className="settings-grid">
        <div className="card elev-sm settings-card">
          <h4>Profile</h4>
          <div className="user-row">
            <span className={`avatar lg ${isApprover ? "approver" : "doer"}`}>{inits}</span>
            <div className="stack">
              <strong style={{ fontSize: 16 }}>{name}</strong>
              <span className="muted small">+1 415 555 0132</span>
            </div>
          </div>
          <div className="field">
            <label>Display name</label>
            <input className="input" defaultValue={name} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className="tag tag-accent-2">Telegram linked</span>
            <span className="muted small">@{name.toLowerCase().replace(/\s+/g, "")}</span>
          </div>
        </div>

        <div className="card elev-sm settings-card">
          <h4>Reminders</h4>
          <div className="field">
            <label>Nudge me before a task is due</label>
            <div className="seg">
              <label className="seg-opt"><input type="radio" name="nudge" /> 30 min</label>
              <label className="seg-opt"><input type="radio" name="nudge" defaultChecked /> 1 hour</label>
              <label className="seg-opt"><input type="radio" name="nudge" /> 3 hours</label>
            </div>
          </div>
          <div className="field">
            <label>Quiet hours</label>
            <input className="input" defaultValue="10:00 pm — 7:00 am" />
          </div>
          <label className="radio">
            <input type="checkbox" /> <span className="dot" /> Also send a daily summary at 9pm
          </label>
        </div>

        <div className="card elev-sm settings-card">
          <h4>Account</h4>
          <div className="muted small">Signed in on this device since 12 Aug. Receipts stay available for 30 days.</div>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn btn-secondary">Export receipts (CSV)</button>
            <button className="btn btn-secondary" onClick={onSignOut}>Sign out</button>
          </div>
        </div>
      </div>
    </>
  );
}
