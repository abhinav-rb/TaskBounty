import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { PageHeader } from "../components";
import type { DataProvider, TemplateRow } from "../data/types";
import { formatMoney, parseAmountToCents } from "../money";

export function Recurring({ provider }: { provider: DataProvider }) {
  const [rows, setRows] = useState<TemplateRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Partial<TemplateRow> | null>(null);

  function reload() {
    provider.listTemplates().then(setRows).catch((e) => setError((e as Error).message));
  }
  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider]);

  async function toggle(t: TemplateRow) {
    try { await provider.setTemplateActive(t.id, !t.active); reload(); }
    catch (e) { setError((e as Error).message); }
  }

  return (
    <>
      <PageHeader title="Recurring tasks" subtitle="What gets assigned, when, and what it is worth." />
      {error && <div className="error">{error}</div>}

      <div className="spread">
        <span className="muted small" style={{ maxWidth: 520 }}>
          Edits apply to future tasks only — approved receipts keep the amount they were worth at the time.
        </span>
        <button className="btn btn-primary" onClick={() => setEditing({ title: "", description: "", amountCents: 0, scheduleCron: "" })}>
          <Plus size={16} strokeWidth={2.75} /> New recurring task
        </button>
      </div>

      <div className="card elev-sm" style={{ padding: "10px 20px 4px" }}>
        <table className="table">
          <thead>
            <tr><th>Task</th><th>Worth</th><th>Schedule</th><th>State</th><th /></tr>
          </thead>
          <tbody>
            {(rows ?? []).map((t) => (
              <tr key={t.id}>
                <td style={{ paddingBlock: 14 }}>
                  <div style={{ fontWeight: 700 }}>{t.title}</div>
                  <div className="muted small">{t.description}</div>
                </td>
                <td className="ledger-amt" style={{ fontSize: 16 }}>{formatMoney(t.amountCents)}</td>
                <td className="text-muted mono" style={{ fontFamily: "ui-monospace, monospace", fontSize: 13 }}>{t.scheduleCron ?? "manual"}</td>
                <td>
                  <button
                    className={t.active ? "tag tag-accent-2" : "tag tag-neutral"}
                    title="Click to pause / resume"
                    onClick={() => void toggle(t)}
                    style={{ cursor: "pointer", border: 0 }}
                  >
                    {t.active ? "Active" : "Paused"}
                  </button>
                </td>
                <td><button className="btn btn-ghost" onClick={() => setEditing(t)}>Edit</button></td>
              </tr>
            ))}
            {rows && rows.length === 0 && (
              <tr><td colSpan={5} className="muted small" style={{ padding: "16px 0" }}>No recurring tasks yet. Create one to get started.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <Editor
          provider={provider}
          initial={editing}
          onDone={() => { setEditing(null); reload(); }}
          onCancel={() => setEditing(null)}
        />
      )}
    </>
  );
}

function Editor({
  provider,
  initial,
  onDone,
  onCancel,
}: {
  provider: DataProvider;
  initial: Partial<TemplateRow>;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initial.title ?? "");
  const [description, setDescription] = useState(initial.description ?? "");
  const [amount, setAmount] = useState(initial.amountCents ? (initial.amountCents / 100).toString() : "");
  const [cron, setCron] = useState(initial.scheduleCron ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    let amountCents: number;
    try { amountCents = parseAmountToCents(amount); }
    catch (e) { setError((e as Error).message); return; }
    setBusy(true);
    try {
      await provider.saveTemplate({ id: initial.id, title: title.trim(), description: description.trim() || null, amountCents, scheduleCron: cron.trim() || null });
      onDone();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <div className="dialog-backdrop" onClick={onCancel}>
      <div className="dialog" style={{ width: "min(520px, 100%)", padding: 30, gap: 16 }} onClick={(e) => e.stopPropagation()}>
        <div className="dialog-title">Recurring task</div>
        <div className="field">
          <label>Title</label>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} style={{ background: "var(--color-bg)" }} />
        </div>
        <div className="field">
          <label>What counts as done</label>
          <textarea className="input" value={description} onChange={(e) => setDescription(e.target.value)} style={{ background: "var(--color-bg)", borderRadius: 20 }} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div className="field">
            <label>Worth</label>
            <input className="input" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="10.00" style={{ background: "var(--color-bg)" }} />
          </div>
          <div className="field">
            <label>Doer</label>
            <input className="input" value="Dev" disabled style={{ background: "var(--color-bg)" }} />
          </div>
        </div>
        <div className="field">
          <label>Schedule (cron)</label>
          <input className="input mono" value={cron} onChange={(e) => setCron(e.target.value)} placeholder="0 18 * * 0" style={{ background: "var(--color-bg)", fontFamily: "ui-monospace, monospace" }} />
          <div className="muted small" style={{ marginTop: 6 }}>
            e.g. <code>0 18 * * 0</code> = Sundays 6pm · <code>0 21 * * *</code> = daily 9pm. Blank = manual only.
          </div>
        </div>
        {error && <div className="error">{error}</div>}
        <div className="muted small">Applies from the next run — existing receipts are unchanged.</div>
        <div className="dialog-actions">
          <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" disabled={busy || !title.trim()} onClick={() => void save()}>Save task</button>
        </div>
      </div>
    </div>
  );
}
