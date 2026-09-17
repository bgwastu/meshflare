import { ShieldAlert, ExternalLink } from "lucide-react";
import { useLanguage } from "../../hooks/useLanguage";

export function DemoBanner({ show }: { show?: boolean }) {
  const { t } = useLanguage();
  if (!show) return null;

  return (
    <div className="demo-banner" role="status">
      <ShieldAlert size={13} style={{ color: "var(--accent)", flexShrink: 0 }} aria-hidden />
      <span>{t("common.demoBanner")}</span>
      <span className="demo-banner-divider" aria-hidden>·</span>
      <a
        href="https://github.com/bgwastu/meshflare#cloudflare"
        target="_blank"
        rel="noopener noreferrer"
        className="demo-banner-link"
      >
        <span>{t("common.deployYourOwn")}</span>
        <ExternalLink size={11} aria-hidden />
      </a>
    </div>
  );
}
