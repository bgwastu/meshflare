import { Link, NavLink } from "react-router";
import { Server, Globe, Settings as SettingsIcon, LogOut } from "lucide-react";
import { LanguageSwitcher } from "../ui/LanguageSwitcher";
import { useLanguage } from "../../hooks/useLanguage";
import type { Settings } from "../../lib/api";

type HeaderProps = {
  settings: Settings | null;
  authRequired: boolean;
  tunnelsCount?: number;
  onLogout?: () => void;
};

export function Header({
  settings,
  authRequired,
  tunnelsCount,
  onLogout,
}: HeaderProps) {
  const { t } = useLanguage();

  const accountName = settings?.accountName || "Cloudflare account";
  const accountEmail = settings?.accountEmail;

  return (
    <header className="top">
      <div className="brand">
        <Link to="/mesh" className="brand-link" title="Mesh">
          <img
            src="/icon-192.png"
            alt=""
            className="brand-mark"
            width={32}
            height={32}
          />
          <h1>
            mesh<span>flare</span>
          </h1>
        </Link>
        <p className="account-line">
          <span className="account-name">{accountName}</span>
          {accountEmail ? (
            <span className="account-email mono">{accountEmail}</span>
          ) : null}
        </p>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
        <nav className="tabs" aria-label="Primary">
          <NavLink
            to="/mesh"
            className={({ isActive }) => `tab ${isActive ? "active" : ""}`}
          >
            <Server size={14} strokeWidth={2.25} aria-hidden />
            <span>Mesh</span>
          </NavLink>
          <NavLink
            to="/tunnels"
            className={({ isActive }) => `tab ${isActive ? "active" : ""}`}
          >
            <Globe size={14} strokeWidth={2.25} aria-hidden />
            <span>Tunnels</span>
            {typeof tunnelsCount === "number" && tunnelsCount > 0 && (
              <span className="tab-badge">{tunnelsCount}</span>
            )}
          </NavLink>
          <NavLink
            to="/settings"
            className={({ isActive }) => `tab ${isActive ? "active" : ""}`}
          >
            <SettingsIcon size={14} strokeWidth={2.25} aria-hidden />
            <span>{t("nav.settings")}</span>
          </NavLink>
        </nav>

        <LanguageSwitcher />

        {authRequired && onLogout && (
          <button
            type="button"
            className="btn btn-ghost"
            style={{ padding: "0.38rem 0.6rem", display: "inline-flex", alignItems: "center", gap: "0.3rem" }}
            onClick={onLogout}
            title={t("nav.logout")}
            aria-label={t("nav.logout")}
          >
            <LogOut size={13} aria-hidden />
            <span>{t("nav.logout")}</span>
          </button>
        )}
      </div>
    </header>
  );
}
