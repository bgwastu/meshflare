import { NavLink } from "react-router";
import { useLanguage } from "../../hooks/useLanguage";

type NavTabsProps = {
  tunnelsCount?: number;
};

export function NavTabs({ tunnelsCount }: NavTabsProps) {
  const { t } = useLanguage();

  return (
    <nav className="tab-nav" aria-label="Main Navigation">
      <NavLink
        to="/mesh"
        className={({ isActive }) => `tab-link ${isActive ? "is-active" : ""}`}
      >
        {t("nav.mesh")}
      </NavLink>
      <NavLink
        to="/tunnels"
        className={({ isActive }) => `tab-link ${isActive ? "is-active" : ""}`}
      >
        <span>{t("nav.tunnels")}</span>
        {typeof tunnelsCount === "number" && tunnelsCount > 0 && (
          <span className="tab-badge" aria-label={`${tunnelsCount} tunnels`}>
            {tunnelsCount}
          </span>
        )}
      </NavLink>
      <NavLink
        to="/settings"
        className={({ isActive }) => `tab-link ${isActive ? "is-active" : ""}`}
      >
        {t("nav.settings")}
      </NavLink>
    </nav>
  );
}
