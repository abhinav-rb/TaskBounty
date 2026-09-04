import { useEffect, useState } from "react";
import { PageHeader, statusTagClass } from "../components";
import type { DataProvider, LedgerData, Session } from "../data/types";
import { formatMoney } from "../money";

export function Ledger({ provider, session }: { provider: DataProvider; session: Session }) {
  const [data, setData] = useState<LedgerData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    provider.getLedger(session).then((d) => alive && setData(d)).catch((e) => alive && setError((e as Error).message));
    return () => { alive = false; };
  }, [provider, session]);

  const isApprover = session.role === "approver";

  return (
    <>
      <PageHeader title={isApprover ? "Owed & ledger" : "Balance & cash-out"} subtitle="Append-only entries — every number here is explainable." />
      {error && <div className="error">{error}</div>}
      {!data ? (
        <div className="muted">Loading…</div>
      ) : (
        <>
          <div className="ledger-top">
            <div className="card elev-md balance-card">
              <div className="card-kicker">{isApprover ? "You owe the Doer" : "Your balance"}</div>
              <div className="balance-number">{formatMoney(data.balanceCents)}</div>
              <div className="muted small">Across {data.approvedSinceCashout} approved tasks since the last cash-out</div>
              <button className="btn btn-primary btn-block" style={{ height: 42 }} onClick={() => setNote("Recorded — V1 tracks the number only; no money actually moves yet.")}>
                {isApprover ? "Mark as paid" : "Request cash-out"}
              </button>
              {note && <div className="muted small">{note}</div>}
            </div>

            <div className="card elev-sm chart-card">
              <div className="card-kicker">This month</div>
              <Bars data={data} />
              <div className="muted small">{formatMoney(data.monthEarnedCents)} earned in the last 6 weeks</div>
            </div>
          </div>

          <div className="section">
            <h4>Ledger</h4>
            <div className="card elev-sm" style={{ padding: "10px 20px 4px" }}>
              <table className="table">
                <thead>
                  <tr><th>Date</th><th>Entry</th><th>Type</th><th style={{ textAlign: "right" }}>Amount</th><th style={{ textAlign: "right" }}>Balance</th></tr>
                </thead>
                <tbody>
                  {data.entries.map((e) => (
                    <tr key={e.id}>
                      <td className="text-muted">{new Date(e.date).toLocaleDateString()}</td>
                      <td style={{ fontWeight: 600 }}>{e.entry}</td>
                      <td><span className={statusTagClass(e.type === "earning" ? "earning" : "cash-out")}>{e.type === "earning" ? "Earning" : "Cash-out"}</span></td>
                      <td className="ledger-amt" style={{ textAlign: "right" }}>{e.amountCents < 0 ? `−${formatMoney(-e.amountCents)}` : `+${formatMoney(e.amountCents)}`}</td>
                      <td className="ledger-bal" style={{ textAlign: "right" }}>{formatMoney(e.balanceCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="muted small">Every entry is append-only — balances are always the sum of what you see here.</div>
        </>
      )}
    </>
  );
}

function Bars({ data }: { data: LedgerData }) {
  const max = Math.max(1, ...data.bars.map((b) => b.value));
  return (
    <div className="bars">
      {data.bars.map((b) => (
        <div key={b.label} className="bar-col">
          <div className="bar" style={{ height: `${Math.max(6, Math.round((b.value / max) * 96))}px` }} />
          <span className="bar-label muted">{b.label}</span>
        </div>
      ))}
    </div>
  );
}
