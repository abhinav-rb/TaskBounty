import {
  Check,
  LayoutDashboard,
  LogOut,
  ReceiptText,
  Repeat,
  SlidersHorizontal,
  Wallet,
} from "lucide-react";
import { useMemo, useState } from "react";
import { currentMode, makeProvider } from "./data/provider";
import type { Role, Session } from "./data/types";
import { Dashboard } from "./screens/Dashboard";
import { Ledger } from "./screens/Ledger";
import { Login } from "./screens/Login";
import { Receipts } from "./screens/Receipts";
import { Recurring } from "./screens/Recurring";
import { Settings } from "./screens/Settings";

type Screen = "dashboard" | "receipts" | "recurring" | "ledger" | "settings";

function initials(name: string | null, role: Role): string {
  if (name && name.trim()) return name.trim().slice(0, 2).toUpperCase();
  return role === "approver" ? "AP" : "DO";
}

export function App() {
  const { provider, error: configError } = useMemo(() => {
    try {
      return { provider: makeProvider(), error: null as string | null };
    } catch (err) {
      return { provider: null, error: (err as Error).message };
    }
  }, []);

  const [session, setSession] = useState<Session | null>(null);
  const [viewRole, setViewRole] = useState<Role>("doer");
  const [screen, setScreen] = useState<Screen>("dashboard");

  if (configError) {
    return (
      <div className="login-wrap">
        <div className="card elev-md login-card">
          <h4>TaskBounty</h4>
          <div className="error">{configError}</div>
          <p className="muted small">
            Check your <code>.env</code> file, then restart the app.
          </p>
        </div>
      </div>
    );
  }
  if (!provider) return <div />;
  if (!session) {
    return (
      <Login
        provider={provider}
        onLogin={(s) => {
          setSession(s);
          setViewRole(s.role);
          setScreen("dashboard");
        }}
      />
    );
  }

  const viewSession: Session = { ...session, role: viewRole };
  const isApprover = viewRole === "approver";

  function go(s: Screen) {
    if (s === "recurring" && !isApprover) return;
    setScreen(s);
  }
  function switchRole() {
    const next: Role = isApprover ? "doer" : "approver";
    setViewRole(next);
    if (screen === "recurring" && next !== "approver") setScreen("dashboard");
  }

  const navItems: { id: Screen; label: string; icon: JSX.Element; show: boolean }[] = [
    { id: "dashboard", label: "Dashboard", icon: <LayoutDashboard size={18} strokeWidth={2.75} />, show: true },
    { id: "receipts", label: "Receipts", icon: <ReceiptText size={18} strokeWidth={2.75} />, show: true },
    { id: "recurring", label: "Recurring tasks", icon: <Repeat size={18} strokeWidth={2.75} />, show: isApprover },
    { id: "ledger", label: isApprover ? "Owed & ledger" : "Balance & cash-out", icon: <Wallet size={18} strokeWidth={2.75} />, show: true },
    { id: "settings", label: "Settings", icon: <SlidersHorizontal size={18} strokeWidth={2.75} />, show: true },
  ];

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="brand-badge"><Check size={18} strokeWidth={2.75} /></span>
          <span className="brand-name">TaskBounty</span>
        </div>

        <nav className="side-nav">
          {navItems.filter((i) => i.show).map((i) => (
            <button key={i.id} className={`nav-item${screen === i.id ? " active" : ""}`} onClick={() => go(i.id)}>
              {i.icon}
              <span>{i.label}</span>
            </button>
          ))}
        </nav>

        <div className="user-patch">
          <div className="user-row">
            <span className={`avatar ${viewRole}`}>{initials(session.displayName, viewRole)}</span>
            <div className="stack">
              <strong style={{ fontSize: 13 }}>{session.displayName ?? "You"}</strong>
              <span className="muted" style={{ fontSize: 11 }}>{isApprover ? "Approver" : "Doer"}</span>
            </div>
          </div>
          <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={switchRole}>
            Switch to {isApprover ? "Doer" : "Approver"}
          </button>
          <button className="btn btn-ghost" onClick={() => setSession(null)}>
            <LogOut size={16} strokeWidth={2.75} /> Sign out
          </button>
        </div>
      </aside>

      <main className="main">
        {screen === "dashboard" && <Dashboard provider={provider} session={viewSession} />}
        {screen === "receipts" && <Receipts provider={provider} session={viewSession} />}
        {screen === "recurring" && isApprover && <Recurring provider={provider} />}
        {screen === "ledger" && <Ledger provider={provider} session={viewSession} />}
        {screen === "settings" && <Settings session={viewSession} onSignOut={() => setSession(null)} />}

        <div className="muted small" style={{ marginTop: "auto", paddingTop: 8 }}>
          Data mode: {currentMode()}{currentMode() === "mock" ? " — demo data, nothing is saved to a server" : ""}
        </div>
      </main>
    </div>
  );
}
