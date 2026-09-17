import { useState } from "react";
import { CheckCircle2, AlertTriangle, Wrench } from "lucide-react";
import { Spinner } from "../ui/Spinner";
import { useLanguage } from "../../hooks/useLanguage";
import type { MaintenanceHealth } from "../../lib/api";

type MaintenanceSettingsProps = {
  health: MaintenanceHealth | null;
  loading: boolean;
  onRepair: () => Promise<void>;
  locked: boolean;
};

export function MaintenanceSettings({
  health,
  loading,
  onRepair,
  locked,
}: MaintenanceSettingsProps) {
  const { t } = useLanguage();
  const [busy, setBusy] = useState(false);

  const handleRepair = async () => {
    if (busy || locked) return;
    setBusy(true);
    try {
      await onRepair();
    } finally {
      setBusy(false);
    }
  };

  const isHealthy = health?.ok ?? true;

  return (
    <div className="settings-block">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.35rem" }}>
        <h3 style={{ margin: 0, fontSize: "1rem" }}>
          {t("settings.maintenance.title")}
        </h3>
        {!isHealthy && (
          <button
            type="button"
            className="btn btn-primary"
            style={{ padding: "0.25rem 0.65rem", fontSize: "0.78rem" }}
            onClick={() => void handleRepair()}
            disabled={busy || locked}
          >
            {busy ? (
              <Spinner label={t("settings.maintenance.repairingBtn")} />
            ) : (
              <>
                <Wrench size={12} aria-hidden />
                <span>{t("settings.maintenance.repairBtn")}</span>
              </>
            )}
          </button>
        )}
      </div>

      <p className="hint" style={{ marginTop: 0, marginBottom: "0.85rem" }}>
        {t("settings.maintenance.description")}
      </p>

      {loading && !health ? (
        <Spinner label={t("common.loading")} />
      ) : isHealthy ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            padding: "0.55rem 0.75rem",
            background: "color-mix(in srgb, var(--ok) 8%, transparent)",
            border: "1px solid var(--ok)",
            borderRadius: "var(--radius)",
            fontSize: "0.82rem",
          }}
        >
          <CheckCircle2 size={16} style={{ color: "var(--ok)", flexShrink: 0 }} />
          <span>{t("settings.maintenance.healthyNotice")}</span>
        </div>
      ) : (
        <div
          style={{
            padding: "0.65rem 0.85rem",
            background: "color-mix(in srgb, var(--warn) 12%, transparent)",
            border: "1px solid var(--warn)",
            borderRadius: "var(--radius)",
            fontSize: "0.82rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", fontWeight: 600, marginBottom: "0.25rem" }}>
            <AlertTriangle size={15} style={{ color: "var(--warn)", flexShrink: 0 }} />
            <span>{t("settings.maintenance.degradedNotice")}</span>
          </div>

          <div style={{ fontSize: "0.78rem", color: "var(--muted)", paddingInlineStart: "1.45rem" }}>
            {health?.dnsFilter && !health.dnsFilter.inSync && (
              <div>Filter: {health.dnsFilter.detail}</div>
            )}
            {health?.mesh && !health.mesh.inSync && (
              <div>Mesh: {health.mesh.detail}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
