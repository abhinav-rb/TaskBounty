import { Check } from "lucide-react";
import { useState } from "react";
import { currentMode } from "../data/provider";
import type { DataProvider, Session } from "../data/types";

export function Login({
  provider,
  onLogin,
}: {
  provider: DataProvider;
  onLogin: (s: Session) => void;
}) {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<"phone" | "code">("phone");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode() {
    setError(null);
    setBusy(true);
    try {
      await provider.requestLogin(phone.trim());
      setStage("code");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    setError(null);
    setBusy(true);
    try {
      const s = await provider.verifyLogin(phone.trim(), code.trim());
      if (!s) setError("That code didn't work, or it's expired. Send a new one and try again.");
      else onLogin(s);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-col">
        <div className="login-brand">
          <span className="brand-badge"><Check size={26} strokeWidth={2.75} /></span>
          <div className="stack">
            <span style={{ fontFamily: "var(--font-heading)", fontSize: 26 }}>TaskBounty</span>
            <span className="muted" style={{ fontSize: 13 }}>Tasks, proof, payouts</span>
          </div>
        </div>

        <div className="card elev-md login-card">
          {stage === "phone" ? (
            <>
              <div>
                <h4 style={{ margin: 0 }}>Sign in</h4>
                <div className="muted" style={{ fontSize: 13 }}>
                  We send a 6-digit code to your Telegram — no SMS, no password.
                </div>
              </div>
              <div className="field">
                <label>Phone number</label>
                <input
                  className="input"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+1 415 555 0132"
                  style={{ background: "var(--color-bg)" }}
                  onKeyDown={(e) => e.key === "Enter" && phone.trim() && void sendCode()}
                />
              </div>
              <button className="btn btn-primary btn-block" style={{ height: 44, fontSize: 15 }} disabled={busy || !phone.trim()} onClick={() => void sendCode()}>
                {busy ? "…" : "Send code via Telegram"}
              </button>
            </>
          ) : (
            <>
              <div>
                <h4 style={{ margin: 0 }}>Enter your code</h4>
                <div className="muted" style={{ fontSize: 13 }}>
                  Sent to <strong>@taskbounty_bot</strong> · {phone}
                </div>
              </div>
              <input
                className="input code-input"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="000000"
                inputMode="numeric"
                onKeyDown={(e) => e.key === "Enter" && code.trim() && void verify()}
              />
              <div style={{ display: "flex", gap: 10 }}>
                <button className="btn btn-primary" style={{ flex: 1, height: 44 }} disabled={busy || !code.trim()} onClick={() => void verify()}>
                  {busy ? "…" : "Open TaskBounty"}
                </button>
                <button className="btn btn-secondary" onClick={() => setStage("phone")}>Back</button>
              </div>
            </>
          )}

          {error && <div className="error">{error}</div>}
          {currentMode() === "mock" && (
            <div className="hint">
              Demo mode — phone <code>+10000000001</code> (Doer) or <code>+10000000002</code> (Approver), any code.
            </div>
          )}
        </div>

        <div className="muted" style={{ fontSize: 12 }}>
          Trouble signing in? Send <strong>/start</strong> to the bot to relink this number.
        </div>
      </div>
    </div>
  );
}
