import { LogOut, User } from "lucide-react";
import { LanguageSwitcher } from "../ui/LanguageSwitcher";
import { useLanguage } from "../../hooks/useLanguage";
import type { Settings } from "../../lib/api";

type HeaderProps = {
  settings: Settings | null;
  authRequired: boolean;
  onLogout?: () => void;
};

export function Header({ settings, authRequired, onLogout }: HeaderProps) {
  const { t } = useLanguage();

  return (
    <header className="header-bar">
      <div className="header-brand">
        <div>
          <h1 style={{ margin: 0, fontSize: "1.35rem", letterSpacing: "-0.02em" }}>
            {t("common.appName")}
          </h1>
          <div style={{ fontSize: "0.82rem", color: "var(--muted)", marginTop: "0.1rem" }}>
            {t("common.tagline")}
          </div>
        </div>
      </div>

      <div className="header-actions">
        {settings?.accountEmail && (
          <div
            className="chip mono"
            title={`${settings.accountName ?? ""} (${settings.accountEmail})`}
            style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", fontSize: "0.78rem" }}
          >
            <User size={12} aria-hidden />
            <span>{settings.accountEmail}</span>
          </div>
        )}

        <LanguageSwitcher />

        {authRequired && onLogout && (
          <button
            type="button"
            className="btn btn-ghost"
            style={{ padding: "0.28rem 0.6rem", fontSize: "0.8rem" }}
            onClick={onLogout}
            title={t("nav.logout")}
          >
            <LogOut size={13} aria-hidden />
            <span>{t("nav.logout")}</span>
          </button>
        )}
      </div>
    </header>
  );
}
