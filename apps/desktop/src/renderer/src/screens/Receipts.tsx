import { Camera, ChevronRight, LayoutGrid, List, Search, X } from "lucide-react";
import { useEffect, useState } from "react";
import { PageHeader, statusTagClass } from "../components";
import type { DataProvider, ReceiptRow, Session } from "../data/types";
import { formatMoney } from "../money";

const FILTERS = ["all", "approved", "awaiting", "sent back"] as const;
type Filter = (typeof FILTERS)[number];

function fmt(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString() : "—";
}

export function Receipts({ provider, session }: { provider: DataProvider; session: Session }) {
  const [rows, setRows] = useState<ReceiptRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [detail, setDetail] = useState<ReceiptRow | null>(null);
  const [zoom, setZoom] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    provider.getHistory(session, 30).then((r) => alive && setRows(r)).catch((e) => alive && setError((e as Error).message));
    return () => { alive = false; };
  }, [provider, session]);

  const shown = (rows ?? []).filter(
    (r) => (filter === "all" || r.status === filter) && r.title.toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <>
      <PageHeader title="Receipts" subtitle="Every task and its photo proof for the last 30 days." />
      {error && <div className="error">{error}</div>}

      <div className="filter-bar">
        <div className="search">
          <Search className="search-icon" size={16} strokeWidth={2.75} />
          <input className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search receipts" />
        </div>
        {FILTERS.map((f) => (
          <button key={f} className={f === filter ? "tag tag-accent filter-pill" : "tag tag-neutral filter-pill"} onClick={() => setFilter(f)} style={{ textTransform: "capitalize" }}>
            {f}
          </button>
        ))}
        <div className="view-toggle">
          <button className={`view-opt${view === "grid" ? " active" : ""}`} onClick={() => setView("grid")}>
            <LayoutGrid size={15} strokeWidth={2.75} /> Photos
          </button>
          <button className={`view-opt${view === "list" ? " active" : ""}`} onClick={() => setView("list")}>
            <List size={15} strokeWidth={2.75} /> Table
          </button>
        </div>
      </div>

      {!rows ? (
        <div className="muted">Loading…</div>
      ) : shown.length === 0 ? (
        <div className="card elev-sm empty-card"><h4>Nothing here</h4><div className="muted small">No receipts match your filter.</div></div>
      ) : view === "grid" ? (
        <div className="photo-grid">
          {shown.map((r) => (
            <div key={r.id} className="card elev-sm receipt-card" onClick={() => setDetail(r)}>
              <div className="receipt-photo washed">
                {r.photoUrl ? <img src={r.photoUrl} alt="proof" /> : <div className="photo-fallback"><Camera size={24} strokeWidth={2.75} /></div>}
              </div>
              <div className="spread">
                <span className="receipt-title">{r.title}</span>
                <span className="receipt-amount">{formatMoney(r.amountCents)}</span>
              </div>
              <div className="spread">
                <span className="muted small">{fmt(r.submittedAt)}</span>
                <span className={statusTagClass(r.status)} style={{ textTransform: "capitalize" }}>{r.status}</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card elev-sm" style={{ padding: "10px 20px 4px" }}>
          <table className="table">
            <thead>
              <tr><th>Proof</th><th>Task</th><th>Amount</th><th>Submitted</th><th>Decided</th><th>Status</th><th /></tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} className="clickable" onClick={() => setDetail(r)}>
                  <td>
                    <div className="proof-tile">
                      {r.photoUrl ? <img src={r.photoUrl} alt="proof" /> : <Camera size={18} strokeWidth={2.75} />}
                    </div>
                  </td>
                  <td style={{ fontWeight: 600 }}>{r.title}</td>
                  <td className="ledger-amt">{formatMoney(r.amountCents)}</td>
                  <td className="text-muted">{fmt(r.submittedAt)}</td>
                  <td className="text-muted">{fmt(r.decidedAt)}</td>
                  <td><span className={statusTagClass(r.status)} style={{ textTransform: "capitalize" }}>{r.status}</span></td>
                  <td><ChevronRight className="chev" size={16} strokeWidth={2.75} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="muted small">Showing the last 30 days · photos are stored privately and expire after 90 days.</div>

      {detail && (
        <div className="dialog-backdrop" onClick={() => setDetail(null)}>
          <div className="dialog detail-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="detail-photo washed" onClick={() => detail.photoUrl && setZoom(detail.photoUrl)} style={{ cursor: detail.photoUrl ? "zoom-in" : "default" }}>
              {detail.photoUrl ? <img src={detail.photoUrl} alt="proof" /> : <div className="photo-fallback" style={{ height: "100%" }}><Camera size={40} strokeWidth={2.75} /></div>}
            </div>
            <div className="detail-right">
              <div className="spread" style={{ alignItems: "flex-start" }}>
                <div>
                  <div className="card-kicker">Receipt {detail.ref}</div>
                  <h3 style={{ margin: "4px 0 0", fontSize: 26 }}>{detail.title}</h3>
                </div>
                <button className="btn btn-icon btn-secondary" onClick={() => setDetail(null)}><X size={16} strokeWidth={2.75} /></button>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <span className="tag tag-accent">{formatMoney(detail.amountCents)}</span>
                <span className={statusTagClass(detail.status)} style={{ textTransform: "capitalize" }}>{detail.status}</span>
                <span className="tag tag-neutral" style={{ textTransform: "capitalize" }}>{detail.kind}</span>
              </div>
              <div className="meta-list">
                <div className="meta-row"><span className="text-muted">Assigned</span><span>{fmt(detail.assignedAt)}</span></div>
                <div className="meta-row"><span className="text-muted">Submitted</span><span>{fmt(detail.submittedAt)}</span></div>
                <div className="meta-row"><span className="text-muted">Decided</span><span>{fmt(detail.decidedAt)}</span></div>
                <div className="meta-row"><span className="text-muted">Doer</span><span>{detail.who}</span></div>
              </div>
              {detail.note && <div className="note-block">“{detail.note}”</div>}
            </div>
          </div>
        </div>
      )}

      {zoom && (
        <div className="lightbox" onClick={() => setZoom(null)}>
          <img src={zoom} alt="proof enlarged" />
        </div>
      )}
    </>
  );
}
