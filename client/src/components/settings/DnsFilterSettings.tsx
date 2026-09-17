import { useState, useEffect } from "react";
import { RefreshCw, RotateCcw } from "lucide-react";
import { Spinner } from "../ui/Spinner";
import { useLanguage } from "../../hooks/useLanguage";
import { dnsFilterStatusMeta } from "../../lib/warp";
import type { Settings } from "../../lib/api";

const DEFAULT_BLOCKLIST_URL =
  "https://raw.githubusercontent.com/hagezi/dns-blocklists/main/adblock/light.txt";

type DnsFilterSettingsProps = {
  settings: Settings | null;
  onToggle: (enabled: boolean) => Promise<void>;
  onSaveUrl: (url: string) => Promise<void>;
  locked: boolean;
};

export function DnsFilterSettings({
  settings,
  onToggle,
  onSaveUrl,
  locked,
}: DnsFilterSettingsProps) {
  const { t, formatSeen } = useLanguage();
  const [urlDraft, setUrlDraft] = useState(DEFAULT_BLOCKLIST_URL);
  const [busyToggle, setBusyToggle] = useState(false);
  const [busyUrl, setBusyUrl] = useState(false);

  useEffect(() => {
    if (settings?.dnsFilterUrl) {
      setUrlDraft(settings.dnsFilterUrl);
    }
  }, [settings?.dnsFilterUrl]);

  const enabled = settings?.dnsFilterEnabled ?? false;
  const status = settings?.dnsFilterStatus ?? "disabled";
  const filterMeta = dnsFilterStatusMeta(status, enabled);
  const isPending = [
    "pending_enable",
    "syncing",
    "pending_refresh",
    "pending_disable",
  ].includes(status);

  const handleToggle = async () => {
    if (busyToggle || locked || isPending) return;
    setBusyToggle(true);
    try {
      await onToggle(!enabled);
    } finally {
      setBusyToggle(false);
    }
  };

  const handleSaveUrl = async () => {
    const trimmed = urlDraft.trim();
    if (!trimmed || busyUrl || locked || trimmed === settings?.dnsFilterUrl) return;
    setBusyUrl(true);
    try {
      await onSaveUrl(trimmed);
    } finally {
      setBusyUrl(false);
    }
  };

  const handleResetDefault = () => {
    setUrlDraft(DEFAULT_BLOCKLIST_URL);
  };

  return (
    <div className="settings-block">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.35rem" }}>
        <h3 style={{ margin: 0, fontSize: "1rem" }}>{t("settings.dnsFilter.title")}</h3>
        <button
          type="button"
          className={`btn ${enabled ? "btn-danger" : "btn-primary"}`}
          style={{ padding: "0.25rem 0.65rem", fontSize: "0.78rem" }}
          onClick={() => void handleToggle()}
          disabled={busyToggle || locked || isPending}
        >
          {busyToggle || isPending ? (
            <Spinner label={t("common.loading")} />
          ) : enabled ? (
            t("status.disabled")
          ) : (
            t("status.enabled")
          )}
        </button>
      </div>

      <p className="hint" style={{ marginTop: 0, marginBottom: "0.85rem" }}>
        {t("settings.dnsFilter.description")}
      </p>

      {/* Status indicator */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.85rem" }}>
        <span className="field-label" style={{ margin: 0 }}>
          {t("settings.dnsFilter.statusLabel")}:
        </span>
        <span
          className="badge"
          data-tone={filterMeta.tone}
          style={{ textTransform: "capitalize", fontSize: "0.76rem" }}
        >
          {t(`status.${status.toLowerCase()}`, { defaultValue: filterMeta.tip })}
        </span>
      </div>

      {/* URL input */}
      <div style={{ marginBottom: "0.85rem" }}>
        <label className="field-label" htmlFor="dns-filter-url-input">
          {t("settings.dnsFilter.customUrlLabel")}
        </label>
        <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
          <input
            id="dns-filter-url-input"
            type="url"
            className="input mono"
            dir="ltr"
            style={{ flex: "1 1 240px" }}
            placeholder={t("settings.dnsFilter.customUrlPlaceholder")}
            value={urlDraft}
            onChange={(e) => setUrlDraft(e.target.value)}
            disabled={busyUrl || locked}
          />
          <button
            type="button"
            className="btn"
            onClick={() => void handleSaveUrl()}
            disabled={busyUrl || locked || !urlDraft.trim() || urlDraft.trim() === settings?.dnsFilterUrl}
          >
            {busyUrl ? <Spinner label={t("common.loading")} /> : t("common.save")}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={handleResetDefault}
            disabled={urlDraft === DEFAULT_BLOCKLIST_URL || locked}
            title={t("settings.dnsFilter.resetDefaultBtn")}
          >
            <RotateCcw size={13} />
          </button>
        </div>
      </div>

      {/* Last synced timestamp */}
      {settings?.dnsFilterLastSyncedAt && (
        <div style={{ fontSize: "0.78rem", color: "var(--muted)" }}>
          <span>{t("settings.dnsFilter.lastSyncLabel")}: </span>
          <span>{formatSeen(settings.dnsFilterLastSyncedAt)}</span>
        </div>
      )}
    </div>
  );
}
