import { useEffect, useState } from "react";
import type { DataProvider, ReceiptRow, Session } from "../data/types";
import { formatMoney } from "../money";

export function History({
  provider,
  session,
}: {
  provider: DataProvider;
  session: Session;
}) {
  const [rows, setRows] = useState<ReceiptRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    provider
      .getHistory(session, 30)
      .then((r) => alive && setRows(r))
      .catch((e) => alive && setError((e as Error).message));
    return () => {
      alive = false;
    };
  }, [provider, session]);

  if (error) return <div className="error">{error}</div>;
  if (!rows) return <div className="muted pad">Loading…</div>;
  if (rows.length === 0) return <div className="muted pad">No tasks in the last 30 days.</div>;

  return (
    <div className="history">
      <h2>Last 30 days</h2>
      <table className="table">
        <thead>
          <tr>
            <th>Proof</th>
            <th>Task</th>
            <th>Value</th>
            <th>Status</th>
            <th>When</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>
                {r.photoUrl ? (
                  <img className="thumb" src={r.photoUrl} alt="proof" onClick={() => setZoom(r.photoUrl)} />
                ) : (
                  <span className="muted">—</span>
                )}
              </td>
              <td>
                <div className="title">{r.title}</div>
                <div className="muted small">
                  {r.kind}
                  {r.description ? ` · ${r.description}` : ""}
                </div>
              </td>
              <td>{formatMoney(r.amountCents)}</td>
              <td>
                <span className={`badge ${r.status}`}>{r.status}</span>
              </td>
              <td className="muted small">{new Date(r.createdAt).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {zoom && (
        <div className="lightbox" onClick={() => setZoom(null)}>
          <img src={zoom} alt="proof enlarged" />
        </div>
      )}
    </div>
  );
}
