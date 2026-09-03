import { useEffect, useState } from "react";
import type { DataProvider, TemplateRow } from "../data/types";
import { formatMoney, parseAmountToCents } from "../money";

export function Templates({ provider }: { provider: DataProvider }) {
  const [rows, setRows] = useState<TemplateRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Partial<TemplateRow> | null>(null);

  async function reload() {
    try {
      setRows(await provider.listTemplates());
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider]);

  async function toggle(t: TemplateRow) {
    try {
      await provider.setTemplateActive(t.id, !t.active);
      await reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (error) return <div className="error">{error}</div>;
  if (!rows) return <div className="muted pad">Loading…</div>;

  return (
    <div className="templates">
      <div className="row-between">
        <h2>Recurring tasks</h2>
        <button
          className="primary"
          onClick={() => setEditing({ title: "", description: "", amountCents: 0, scheduleCron: "" })}
        >
          New task
        </button>
      </div>

      <table className="table">
        <thead>
          <tr>
            <th>Task</th>
            <th>Value</th>
            <th>Schedule</th>
            <th>Active</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.id}>
              <td>
                <div className="title">{t.title}</div>
                <div className="muted small">{t.description}</div>
              </td>
              <td>{formatMoney(t.amountCents)}</td>
              <td className="mono small">{t.scheduleCron ?? "manual"}</td>
              <td>
                <label className="switch">
                  <input type="checkbox" checked={t.active} onChange={() => void toggle(t)} />
                  <span />
                </label>
              </td>
              <td>
                <button className="link" onClick={() => setEditing(t)}>
                  Edit
                </button>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} className="muted pad">
                No recurring tasks yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {editing && (
        <TemplateEditor
          provider={provider}
          initial={editing}
          onDone={() => {
            setEditing(null);
            void reload();
          }}
          onCancel={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function TemplateEditor({
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
  const [amount, setAmount] = useState(
    initial.amountCents ? (initial.amountCents / 100).toString() : "",
  );
  const [cron, setCron] = useState(initial.scheduleCron ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    let amountCents: number;
    try {
      amountCents = parseAmountToCents(amount);
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    setBusy(true);
    try {
      await provider.saveTemplate({
        id: initial.id,
        title: title.trim(),
        description: description.trim() || null,
        amountCents,
        scheduleCron: cron.trim() || null,
      });
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal" onClick={onCancel}>
      <div className="card modal-card" onClick={(e) => e.stopPropagation()}>
        <h3>{initial.id != null ? "Edit task" : "New recurring task"}</h3>
        <label>Title</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} />
        <label>Description</label>
        <input value={description} onChange={(e) => setDescription(e.target.value)} />
        <label>Payment amount</label>
        <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="10.00" />
        <label>Schedule (cron)</label>
        <input className="mono" value={cron} onChange={(e) => setCron(e.target.value)} placeholder="0 18 * * *" />
        <div className="muted small">
          e.g. <code>0 18 * * *</code> = 6pm daily. Leave blank for manual-only.
        </div>
        {error && <div className="error">{error}</div>}
        <div className="row-end">
          <button className="link" onClick={onCancel}>
            Cancel
          </button>
          <button className="primary" disabled={busy || !title.trim()} onClick={() => void save()}>
            {busy ? "…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
