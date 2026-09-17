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
    <div className="login-screen">
      <div className="login-lang">
        <LanguageSwitcher />
      </div>

      <div className="login-card">
        <div className="login-brand">
          <h1>{t("common.appName")}</h1>
          <p className="hint">{t("auth.subtitle")}</p>
        </div>

        <form onSubmit={handleSubmit}>
          {error && (
            <div className="error-text" role="alert">
              {error}
            </div>
          )}

          <div className="field">
            <label htmlFor="admin-password">{t("auth.passwordLabel")}</label>
            <input
              id="admin-password"
              type="password"
              className="input"
              placeholder={t("auth.passwordPlaceholder")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
              autoFocus
              required
            />
          </div>

          <button type="submit" className="btn btn-primary" disabled={!password || busy}>
            {busy ? <Spinner label={t("auth.signingInBtn")} /> : t("auth.signInBtn")}
          </button>
        </form>
      </div>
    </div>
  );
}
