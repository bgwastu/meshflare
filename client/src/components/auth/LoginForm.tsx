import { useState, type FormEvent } from "react";
import { Spinner } from "../ui/Spinner";
import { LanguageSwitcher } from "../ui/LanguageSwitcher";
import { useLanguage } from "../../hooks/useLanguage";

type LoginFormProps = {
  onLogin: (password: string) => Promise<void>;
};

export function LoginForm({ onLogin }: LoginFormProps) {
  const { t } = useLanguage();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!password || busy) return;

    setBusy(true);
    setError(null);
    try {
      await onLogin(password);
    } catch {
      setError(t("auth.invalidPassword"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "1.5rem" }}>
      <div style={{ position: "absolute", top: "1.25rem", insetInlineEnd: "1.25rem" }}>
        <LanguageSwitcher />
      </div>

      <div className="modal" style={{ width: 360 }}>
        <div className="login-brand" style={{ marginBottom: "1.25rem" }}>
          <h1 style={{ margin: 0, fontSize: "1.4rem", letterSpacing: "-0.02em" }}>
            {t("common.appName")}
          </h1>
          <div style={{ fontSize: "0.82rem", color: "var(--muted)", marginTop: "0.2rem" }}>
            {t("auth.subtitle")}
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          {error && (
            <div className="error-text" role="alert" style={{ marginBottom: "0.75rem", fontSize: "0.8rem", color: "var(--danger)" }}>
              {error}
            </div>
          )}

          <div style={{ marginBottom: "1rem" }}>
            <label className="field-label" htmlFor="admin-password">
              {t("auth.passwordLabel")}
            </label>
            <input
              id="admin-password"
              type="password"
              className="input"
              style={{ width: "100%" }}
              placeholder={t("auth.passwordPlaceholder")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
              autoFocus
              required
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: "100%", justifyContent: "center" }}
            disabled={!password || busy}
          >
            {busy ? <Spinner label={t("auth.signingInBtn")} /> : t("auth.signInBtn")}
          </button>
        </form>
      </div>
    </div>
  );
}
