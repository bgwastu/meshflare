import { Link, NavLink } from "react-router";
import { Server, Globe, Split, Settings as SettingsIcon, LogOut } from "lucide-react";
import { LanguageSwitcher } from "../ui/LanguageSwitcher";
import { useLanguage } from "../../hooks/useLanguage";

type HeaderProps = {
  authRequired: boolean;
  onLogout?: () => void;
};

export function Header({
  authRequired,
  onLogout,
}: HeaderProps) {
  const { t } = useLanguage();

  return (
    <header className="top">
      <div className="brand">
        <Link to="/mesh" className="brand-link" title={t("nav.mesh")}>
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
      </div>

      <div className="header-actions">
        <nav className="tabs" aria-label={t("nav.primary")}>
          <NavLink
            to="/mesh"
            className={({ isActive }) => `tab ${isActive ? "active" : ""}`}
          >
            <Server size={14} strokeWidth={2.25} aria-hidden />
            <span>{t("nav.mesh")}</span>
          </NavLink>
          <NavLink
            to="/tunnels"
            className={({ isActive }) => `tab ${isActive ? "active" : ""}`}
          >
            <Globe size={14} strokeWidth={2.25} aria-hidden />
            <span>{t("nav.tunnels")}</span>
          </NavLink>
          <NavLink
            to="/routing"
            className={({ isActive }) => `tab ${isActive ? "active" : ""}`}
          >
            <Split size={14} strokeWidth={2.25} aria-hidden />
            <span>{t("nav.routing")}</span>
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
