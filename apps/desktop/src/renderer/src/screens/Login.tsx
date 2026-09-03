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
      if (!s) setError("That code didn't work, or no account matches that phone.");
      else onLogin(s);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <div className="card login-card">
        <h1>TaskBounty</h1>
        <p className="muted">
          Sign in with your phone number — we'll send a code to your Telegram.
        </p>

        {stage === "phone" ? (
          <>
            <label>Phone number</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+1 555 123 4567"
              onKeyDown={(e) => e.key === "Enter" && phone.trim() && void sendCode()}
            />
            <button className="primary" disabled={busy || !phone.trim()} onClick={() => void sendCode()}>
              {busy ? "…" : "Send code"}
            </button>
          </>
        ) : (
          <>
            <label>Enter the 6-digit code</label>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="000000"
              inputMode="numeric"
              onKeyDown={(e) => e.key === "Enter" && code.trim() && void verify()}
            />
            <button className="primary" disabled={busy || !code.trim()} onClick={() => void verify()}>
              {busy ? "…" : "Verify & sign in"}
            </button>
            <button className="link" onClick={() => setStage("phone")}>
              Use a different number
            </button>
          </>
        )}

        {error && <div className="error">{error}</div>}
        {currentMode() === "mock" && (
          <div className="hint">
            Demo mode: phone <code>+10000000001</code> (Doer) or <code>+10000000002</code> (Approver),
            any code.
          </div>
        )}
      </div>
    </div>
  );
}
