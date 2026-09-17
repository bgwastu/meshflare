import { DomainSettings } from "./DomainSettings";
import { CleanupSettings } from "./CleanupSettings";
import { SplitTunnelsSettings } from "./SplitTunnelsSettings";
import { DnsFilterSettings } from "./DnsFilterSettings";
import { GatewaySettings } from "./GatewaySettings";
import { MaintenanceSettings } from "./MaintenanceSettings";
import { useSettings } from "../../hooks/useSettings";
import { useLanguage } from "../../hooks/useLanguage";

type SettingsViewProps = {
  locked: boolean;
  onToast: (msg: string, tone?: "success" | "error" | "warn") => void;
};

export function SettingsView({ locked, onToast }: SettingsViewProps) {
  const { t } = useLanguage();

  const {
    settings,
    patchSettings,
    splitTunnels,
    splitTunnelsLoading,
    saveSplitTunnels,
    maintenanceHealth,
    maintenanceLoading,
    repairMaintenance,
  } = useSettings();

  const handleSaveDomainSuffix = async (suffix: string) => {
    try {
      await patchSettings({ meshSuffix: suffix });
      onToast(t("toasts.settingsSaved"), "success");
    } catch (e) {
      onToast(e instanceof Error ? e.message : t("toasts.settingsSaveFailed"), "error");
      throw e;
    }
  };

  const handleSaveCleanupDays = async (days: number) => {
    try {
      await patchSettings({ offlineDays: days });
      onToast(t("toasts.settingsSaved"), "success");
    } catch (e) {
      onToast(e instanceof Error ? e.message : t("toasts.settingsSaveFailed"), "error");
      throw e;
    }
  };

  const handleRunCleanup = async () => {
    try {
      await patchSettings({ offlineDays: settings?.offlineDays });
      onToast(t("toasts.cleanupFinished"), "success");
    } catch (e) {
      onToast(e instanceof Error ? e.message : t("toasts.cleanupFailed"), "error");
      throw e;
    }
  };

  const handleToggleDnsFilter = async (enabled: boolean) => {
    try {
      await patchSettings({ dnsFilterEnabled: enabled });
      onToast(t("toasts.settingsSaved"), "success");
    } catch (e) {
      onToast(e instanceof Error ? e.message : t("toasts.settingsSaveFailed"), "error");
      throw e;
    }
  };

  const handleSaveDnsFilterUrl = async (url: string) => {
    try {
      await patchSettings({ dnsFilterUrl: url });
      onToast(t("toasts.settingsSaved"), "success");
    } catch (e) {
      onToast(e instanceof Error ? e.message : t("toasts.settingsSaveFailed"), "error");
      throw e;
    }
  };

  const handleRepairMaintenance = async () => {
    try {
      const res = await repairMaintenance();
      if (res.ok) {
        onToast(t("toasts.maintenanceRepaired"), "success");
      } else {
        onToast(t("toasts.maintenanceRepairFailed"), "error");
      }
    } catch (e) {
      onToast(e instanceof Error ? e.message : t("toasts.maintenanceRepairFailed"), "error");
      throw e;
    }
  };

  return (
    <div className="settings-view" style={{ display: "grid", gap: "1.25rem" }}>
      <DomainSettings
        settings={settings}
        onSave={handleSaveDomainSuffix}
        locked={locked}
      />

      <CleanupSettings
        settings={settings}
        onSaveDays={handleSaveCleanupDays}
        onRunCleanup={handleRunCleanup}
        locked={locked}
      />

      <SplitTunnelsSettings
        config={splitTunnels}
        loading={splitTunnelsLoading}
        onSave={async (mode, items) => {
          try {
            await saveSplitTunnels({ mode, items });
            onToast(t("toasts.settingsSaved"), "success");
          } catch (e) {
            onToast(e instanceof Error ? e.message : t("toasts.settingsSaveFailed"), "error");
            throw e;
          }
        }}
        locked={locked}
      />

      <DnsFilterSettings
        settings={settings}
        onToggle={handleToggleDnsFilter}
        onSaveUrl={handleSaveDnsFilterUrl}
        locked={locked}
      />

      <GatewaySettings
        settings={settings}
        onToast={(msg) => onToast(msg)}
      />

      <MaintenanceSettings
        health={maintenanceHealth}
        loading={maintenanceLoading}
        onRepair={handleRepairMaintenance}
        locked={locked}
      />
    </div>
  );
}
