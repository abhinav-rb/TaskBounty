import { useMemo, useState } from "react";
import { currentMode, makeProvider } from "./data/provider";
import type { Session } from "./data/types";
import { Dashboard } from "./screens/Dashboard";
import { History } from "./screens/History";
import { Login } from "./screens/Login";
import { Templates } from "./screens/Templates";

type Tab = "dashboard" | "history" | "templates";

export function App() {
  const { provider, error: configError } = useMemo(() => {
    try {
      return { provider: makeProvider(), error: null as string | null };
    } catch (err) {
      return { provider: null, error: (err as Error).message };
    }
  }, []);

  const [session, setSession] = useState<Session | null>(null);
  const [tab, setTab] = useState<Tab>("dashboard");

  if (configError) {
    return (
      <div className="login">
        <div className="card login-card">
          <h1>TaskBounty</h1>
          <div className="error">{configError}</div>
          <p className="muted">
            Check your <code>.env</code> file, then restart the app.
          </p>
        </div>
      </div>
    );
  }
  if (!provider) return <div />;
  if (!session) return <Login provider={provider} onLogin={setSession} />;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">TaskBounty</div>
        <nav className="tabs">
          <button className={tab === "dashboard" ? "active" : ""} onClick={() => setTab("dashboard")}>
            Dashboard
          </button>
          <button className={tab === "history" ? "active" : ""} onClick={() => setTab("history")}>
            History
          </button>
          {session.role === "approver" && (
            <button className={tab === "templates" ? "active" : ""} onClick={() => setTab("templates")}>
              Recurring tasks
            </button>
          )}
        </nav>
        <div className="who">
          <span>
            {session.displayName ?? session.role} · {session.role}
          </span>
          <button className="link" onClick={() => setSession(null)}>
            Log out
          </button>
        </div>
      </header>

      <main className="content">
        {tab === "dashboard" && <Dashboard provider={provider} session={session} />}
        {tab === "history" && <History provider={provider} session={session} />}
        {tab === "templates" && session.role === "approver" && <Templates provider={provider} />}
      </main>

      <footer className="statusbar">
        Data mode: {currentMode()}
        {currentMode() === "mock" && " — demo data, nothing is saved to a server"}
      </footer>
    </div>
  );
}
