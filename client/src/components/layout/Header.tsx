import { Link, NavLink } from "react-router";
import { Server, Globe, Settings as SettingsIcon, LogOut } from "lucide-react";
import { LanguageSwitcher } from "../ui/LanguageSwitcher";
import { SkeletonBlock } from "../ui/Skeleton";
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
  onLogout,
}: HeaderProps) {
  const { t } = useLanguage();

  const accountName = settings?.accountName;
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
        <div className="account-line" aria-busy={!settings}>
          {settings ? (
            <>
              <span className="account-name">{accountName || t("settings.account.notConfigured")}</span>
              {accountEmail ? (
                <span className="account-email mono">{accountEmail}</span>
              ) : null}
            </>
          ) : (
            <>
              <SkeletonBlock className="skeleton-account-name" />
              <SkeletonBlock className="skeleton-account-email" />
            </>
          )}
        </div>
      </div>

      <div className="header-actions">
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
            className="btn btn-ghost btn-logout"
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
