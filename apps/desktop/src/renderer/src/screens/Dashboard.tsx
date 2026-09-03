import { useEffect, useState } from "react";
import type { DashboardData, DataProvider, Session } from "../data/types";
import { formatMoney } from "../money";

export function Dashboard({
  provider,
  session,
}: {
  provider: DataProvider;
  session: Session;
}) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    provider
      .getDashboard(session)
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError((e as Error).message));
    return () => {
      alive = false;
    };
  }, [provider, session]);

  if (error) return <div className="error">{error}</div>;
  if (!data) return <div className="muted pad">Loading…</div>;

  const isDoer = data.role === "doer";
  return (
    <div className="grid">
      <div className="card stat">
        <div className="stat-label">{isDoer ? "Ready to receive" : "You currently owe"}</div>
        <div className="stat-value">{formatMoney(data.balanceCents)}</div>
        <div className="muted small">
          {isDoer
            ? "Your accrued balance, ready to cash out."
            : "Outstanding balance owed to the Doer."}
        </div>
      </div>
      <div className="card stat">
        <div className="stat-label">Total transacted</div>
        <div className="stat-value">{formatMoney(data.totalTransactedCents)}</div>
        <div className="muted small">Lifetime value of all approved tasks.</div>
      </div>
    </div>
  );
}
