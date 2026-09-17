import { CopyValue } from "../ui/CopyValue";
import { useLanguage } from "../../hooks/useLanguage";
import type { Settings } from "../../lib/api";

type GatewaySettingsProps = {
  settings: Settings | null;
  onToast: (msg: string) => void;
};

export function GatewaySettings({ settings, onToast }: GatewaySettingsProps) {
  const { t } = useLanguage();
  const loc = settings?.dnsLocation;

  if (!loc) return null;

  return (
    <div className="settings-block">
      <h3 style={{ margin: "0 0 0.35rem", fontSize: "1rem" }}>
        {t("settings.gateway.title")}
      </h3>
      <p className="hint" style={{ marginTop: 0, marginBottom: "0.85rem" }}>
        {t("settings.gateway.description")}
      </p>

      <div className="property-grid" style={{ display: "grid", gap: "0.85rem", fontSize: "0.85rem" }}>
        {loc.name && (
          <div>
            <span className="field-label" style={{ color: "var(--muted)", fontSize: "0.75rem" }}>
              {t("settings.gateway.defaultLocation")}
            </span>
            <div style={{ fontWeight: 600 }}>{loc.name}</div>
          </div>
        )}

        {loc.dohSubdomain && (
          <div>
            <span className="field-label" style={{ color: "var(--muted)", fontSize: "0.75rem" }}>
              {t("settings.gateway.dohSubdomain")}
            </span>
            <div className="mono" dir="ltr">
              <CopyValue
                value={`https://${loc.dohSubdomain}.cloudflare-gateway.com/dns-query`}
                onCopied={() => onToast(t("common.copied"))}
              />
            </div>
          </div>
        )}

        {loc.ipv4Destination && (
          <div>
            <span className="field-label" style={{ color: "var(--muted)", fontSize: "0.75rem" }}>
              {t("settings.gateway.ipv4Dest")}
            </span>
            <div className="mono" dir="ltr">
              <CopyValue
                value={loc.ipv4Destination}
                onCopied={() => onToast(t("common.copied"))}
              />
            </div>
          </div>
        )}

        {loc.ipv4DestinationBackup && (
          <div>
            <span className="field-label" style={{ color: "var(--muted)", fontSize: "0.75rem" }}>
              {t("settings.gateway.ipv4Backup")}
            </span>
            <div className="mono" dir="ltr">
              <CopyValue
                value={loc.ipv4DestinationBackup}
                onCopied={() => onToast(t("common.copied"))}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
