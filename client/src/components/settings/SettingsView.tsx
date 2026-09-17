import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Pencil, Trash2 } from "lucide-react";
import { Modal } from "../ui/Modal";
import { Spinner } from "../ui/Spinner";
import { CopyValue } from "../ui/CopyValue";
import { SkeletonBlock } from "../ui/Skeleton";
import { useSettings } from "../../hooks/useSettings";
import { useLanguage } from "../../hooks/useLanguage";
import { dnsFilterStatusMeta } from "../../lib/warp";
import { api, type SplitTunnelItem } from "../../lib/api";

type SettingsViewProps = {
  locked: boolean;
  onToast: (msg: string, tone?: "success" | "error" | "warn") => void;
};

export function SettingsView({ locked, onToast }: SettingsViewProps) {
  const { t, formatSeen } = useLanguage();
  const queryClient = useQueryClient();

  const {
    settings,
    isSettingsLoading,
    patchSettings,
    splitTunnels,
    splitTunnelsLoading,
    saveSplitTunnels,
    maintenanceHealth,
    repairMaintenance,
    isRepairingMaintenance,
  } = useSettings();

  const [meshSuffixDraft, setMeshSuffixDraft] = useState("mesh");
  const [offlineDays, setOfflineDays] = useState(7);
  const [filterUrlDraft, setFilterUrlDraft] = useState(
    "https://raw.githubusercontent.com/hagezi/dns-blocklists/main/adblock/light.txt",
  );
  const [busy, setBusy] = useState<string | null>(null);

  // Split tunnels state
  const [splitEditor, setSplitEditor] = useState<{
    index: number | null;
    value: string;
    description: string;
  } | null>(null);
  const [splitBusy, setSplitBusy] = useState(false);

  useEffect(() => {
    if (settings) {
      setOfflineDays(settings.offlineDays);
      setMeshSuffixDraft(settings.meshSuffix);
      setFilterUrlDraft(settings.dnsFilterUrl);
    }
  }, [settings]);

  const ready = !isSettingsLoading && settings !== null;

  const filterMeta = dnsFilterStatusMeta(
    settings?.dnsFilterStatus ?? "idle",
    settings?.dnsFilterEnabled ?? false,
  );
  const filterOperationPending = [
    "pending_enable",
    "syncing",
    "pending_refresh",
    "pending_disable",
  ].includes(settings?.dnsFilterStatus ?? "");
  const dnsLocation = settings?.dnsLocation;

  const handleSaveDomain = async () => {
    const trimmed = meshSuffixDraft.trim().replace(/^\.+/, "");
    if (!trimmed || trimmed === settings?.meshSuffix || busy || locked) return;
    setBusy("domain");
    try {
      await patchSettings({ meshSuffix: meshSuffixDraft });
      onToast(t("toasts.settingsSaved"), "success");
    } catch (e) {
      onToast(e instanceof Error ? e.message : t("toasts.settingsSaveFailed"), "error");
    } finally {
      setBusy(null);
    }
  };

  const handleSaveOfflineDays = async () => {
    if (offlineDays === settings?.offlineDays || busy || locked) return;
    setBusy("settings");
    try {
      await patchSettings({ offlineDays });
      onToast(t("toasts.settingsSaved"), "success");
    } catch (e) {
      onToast(e instanceof Error ? e.message : t("toasts.settingsSaveFailed"), "error");
    } finally {
      setBusy(null);
    }
  };

  const handleSaveFilterUrl = async () => {
    const trimmed = filterUrlDraft.trim();
    if (!trimmed || trimmed === settings?.dnsFilterUrl || busy || locked) return;
    setBusy("filter-url");
    try {
      await patchSettings({ dnsFilterUrl: filterUrlDraft });
      onToast(t("toasts.settingsSaved"), "success");
    } catch (e) {
      onToast(e instanceof Error ? e.message : t("toasts.settingsSaveFailed"), "error");
    } finally {
      setBusy(null);
    }
  };

  const handleToggleFilter = async () => {
    if (busy || locked || filterOperationPending) return;
    setBusy("dns-filter");
    try {
      await patchSettings({ dnsFilterEnabled: !settings?.dnsFilterEnabled });
      onToast(t("toasts.settingsSaved"), "success");
    } catch (e) {
      onToast(e instanceof Error ? e.message : t("toasts.settingsSaveFailed"), "error");
    } finally {
      setBusy(null);
    }
  };

  const handleSyncDns = async () => {
    setBusy("sync");
    try {
      await api.syncDns();
      await queryClient.invalidateQueries({ queryKey: ["settings"] });
      onToast(t("toasts.dnsSynced"), "success");
    } catch (e) {
      onToast(e instanceof Error ? e.message : t("toasts.dnsSyncFailed"), "error");
    } finally {
      setBusy(null);
    }
  };

  const handleRunCleanup = async () => {
    setBusy("cleanup");
    try {
      await api.cleanup();
      await queryClient.invalidateQueries({ queryKey: ["settings"] });
      onToast(t("toasts.cleanupFinished"), "success");
    } catch (e) {
      onToast(e instanceof Error ? e.message : t("toasts.cleanupFailed"), "error");
    } finally {
      setBusy(null);
    }
  };

  const handleRepair = async () => {
    try {
      const res = await repairMaintenance();
      if (res.ok) {
        onToast(t("toasts.maintenanceRepaired"), "success");
      } else {
        onToast(t("toasts.maintenanceRepairFailed"), "error");
      }
    } catch (e) {
      onToast(e instanceof Error ? e.message : t("toasts.maintenanceRepairFailed"), "error");
    }
  };

  const handleSwitchSplitMode = async (newMode: "include" | "exclude") => {
    if (!splitTunnels || locked || splitBusy) return;
    setSplitBusy(true);
    try {
      await saveSplitTunnels({ mode: newMode, items: splitTunnels[newMode] });
      onToast(t("toasts.settingsSaved"), "success");
    } catch (e) {
      onToast(e instanceof Error ? e.message : t("toasts.settingsSaveFailed"), "error");
    } finally {
      setSplitBusy(false);
    }
  };

  const handleSaveSplitItem = async () => {
    if (!splitEditor || !splitTunnels) return;
    const value = splitEditor.value.trim();
    if (!value) return;

    const item: SplitTunnelItem = value.includes("/")
      ? { address: value, description: splitEditor.description.trim() || undefined }
      : { host: value, description: splitEditor.description.trim() || undefined };

    const activeItems = splitTunnels[splitTunnels.mode];
    const items =
      splitEditor.index === null
        ? [...activeItems, item]
        : activeItems.map((cur, idx) => (idx === splitEditor.index ? item : cur));

    setSplitBusy(true);
    try {
      await saveSplitTunnels({ mode: splitTunnels.mode, items });
      setSplitEditor(null);
      onToast(t("toasts.settingsSaved"), "success");
    } catch (e) {
      onToast(e instanceof Error ? e.message : t("toasts.settingsSaveFailed"), "error");
    } finally {
      setSplitBusy(false);
    }
  };

  const handleDeleteSplitItem = async (index: number) => {
    if (!splitTunnels || locked || splitBusy) return;
    const items = splitTunnels[splitTunnels.mode].filter((_, i) => i !== index);
    setSplitBusy(true);
    try {
      await saveSplitTunnels({ mode: splitTunnels.mode, items });
      onToast(t("toasts.settingsSaved"), "success");
    } catch (e) {
      onToast(e instanceof Error ? e.message : t("toasts.settingsSaveFailed"), "error");
    } finally {
      setSplitBusy(false);
    }
  };

  return (
    <section className="settings-panel" aria-busy={!ready}>
      <header className="settings-intro">
        <h2>{t("settings.title")}</h2>
        <p className="hint">{t("settings.subtitle")}</p>
      </header>

      {!ready ? (
        <div className="skeleton-stack">
          <SkeletonBlock className="skeleton-label" />
          <SkeletonBlock className="skeleton-input" />
          <SkeletonBlock className="skeleton-btn" />
          <SkeletonBlock className="skeleton-row" />
        </div>
      ) : (
        <div className="settings-grid">
          <div className="settings-block">
            <h3>{t("settings.meshDns.title")}</h3>
            <p className="hint">{t("settings.meshDns.description")}</p>
            <div className="field">
              <label htmlFor="mesh-suffix">{t("settings.meshDns.suffixLabel")}</label>
              <div className="suffix-input">
                <span className="suffix-dot">.</span>
                <input
                  id="mesh-suffix"
                  type="text"
                  value={meshSuffixDraft}
                  disabled={locked}
                  onChange={(e) => setMeshSuffixDraft(e.target.value)}
                />
              </div>
            </div>
            <button
              type="button"
              className="btn btn-primary"
              disabled={
                locked ||
                !meshSuffixDraft.trim() ||
                meshSuffixDraft.trim().replace(/^\.+/, "") === settings.meshSuffix
              }
              onClick={handleSaveDomain}
            >
              {busy === "domain" ? (
                <Spinner label={t("settings.meshDns.savingBtn")} />
              ) : (
                t("settings.meshDns.saveBtn")
              )}
            </button>
            {["local", "internal", "lan", "home.arpa", "corp", "private", "test", "arpa"].includes(
              meshSuffixDraft.trim().toLowerCase().replace(/^\.+/, ""),
            ) && (
              <p className="hint hint-warn">
                {t("settings.meshDns.warpFallbackWarning", {
                  suffix: meshSuffixDraft.trim().replace(/^\.+/, ""),
                })}
              </p>
            )}
          </div>

          <div className="settings-block">
            <h3>{t("settings.cleanup.title")}</h3>
            <p className="hint">{t("settings.cleanup.description")}</p>
            <div className="field">
              <label htmlFor="offline-days">{t("settings.cleanup.daysLabel")}</label>
              <input
                id="offline-days"
                type="number"
                min={1}
                max={365}
                value={offlineDays}
                disabled={locked}
                onChange={(e) => setOfflineDays(Number(e.target.value))}
              />
            </div>
            <button
              type="button"
              className="btn"
              disabled={locked || offlineDays === settings.offlineDays}
              onClick={handleSaveOfflineDays}
            >
              {busy === "settings" ? <Spinner label={t("common.saving")} /> : t("common.save")}
            </button>
          </div>

          <div className="settings-block">
            <div className="settings-block-head">
              <h3>{t("settings.dnsFilter.title")}</h3>
              <label
                className={`mode-switch ${settings.dnsFilterEnabled ? "is-on" : ""}`}
              >
                <input
                  type="checkbox"
                  role="switch"
                  aria-label={t("settings.dnsFilter.toggleLabel")}
                  checked={settings.dnsFilterEnabled}
                  disabled={locked || filterOperationPending || busy === "dns-filter"}
                  onChange={() => void handleToggleFilter()}
                />
                <span className="switch-track" aria-hidden>
                  <span />
                </span>
              </label>
            </div>
            <p className="hint">
              {t("settings.dnsFilter.description")}
              {filterMeta.tone === "ok" && settings.dnsFilterLastSyncedAt
                ? ` ${t("settings.dnsFilter.lastRefresh", {
                    when: formatSeen(settings.dnsFilterLastSyncedAt),
                  })}`
                : null}
              {filterOperationPending || busy === "dns-filter"
                ? ` ${t(`status.${settings.dnsFilterStatus}`, {
                    defaultValue: filterMeta.tip,
                  })}`
                : null}
            </p>
            <div className="field">
              <label htmlFor="filter-url">{t("settings.dnsFilter.customUrlLabel")}</label>
              <input
                id="filter-url"
                type="url"
                value={filterUrlDraft}
                disabled={locked || filterOperationPending}
                onChange={(e) => setFilterUrlDraft(e.target.value)}
              />
            </div>
            <div className="row-actions">
              <button
                type="button"
                className="btn"
                disabled={
                  locked ||
                  !filterUrlDraft.trim() ||
                  filterUrlDraft.trim() === settings.dnsFilterUrl
                }
                onClick={handleSaveFilterUrl}
              >
                {busy === "filter-url" ? <Spinner label={t("common.saving")} /> : t("common.save")}
              </button>
            </div>
          </div>

          <div className="settings-block maintenance-block">
            <h3>{t("settings.maintenance.title")}</h3>
            {maintenanceHealth && !maintenanceHealth.ok && (
              <div className="health-alert" role="alert">
                <div className="health-alert-copy">
                  <strong>{t("settings.maintenance.outOfSync")}</strong>
                  <p className="hint">
                    {!maintenanceHealth.dnsFilter.inSync && (
                      <span>
                        {t("settings.maintenance.filterDetail", {
                          detail: maintenanceHealth.dnsFilter.detail,
                        })}{" "}
                      </span>
                    )}
                    {maintenanceHealth.mesh && !maintenanceHealth.mesh.inSync && (
                      <span>
                        {t("settings.maintenance.meshDetail", {
                          detail: maintenanceHealth.mesh.detail,
                        })}{" "}
                      </span>
                    )}
                    {t("settings.maintenance.degradedNotice")}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-repair"
                  disabled={isRepairingMaintenance || locked}
                  onClick={handleRepair}
                >
                  {isRepairingMaintenance ? (
                    <Spinner label={t("settings.maintenance.repairingBtn")} />
                  ) : (
                    t("settings.maintenance.repairBtn")
                  )}
                </button>
              </div>
            )}
            <div className="maint-row">
              <div>
                <strong>{t("mesh.syncDns")}</strong>
                <p className="hint">
                  {t("settings.maintenance.lastRun", {
                    when: formatSeen(settings.lastDnsSyncAt, "never"),
                  })}
                </p>
              </div>
              <button type="button" className="btn" disabled={locked} onClick={handleSyncDns}>
                {busy === "sync" ? (
                  <Spinner label={t("status.syncing")} />
                ) : (
                  t("settings.maintenance.runNow")
                )}
              </button>
            </div>
            <div className="maint-row">
              <div>
                <strong>{t("mesh.cleanup")}</strong>
                <p className="hint">
                  {t("settings.maintenance.lastRun", {
                    when: formatSeen(settings.lastCleanupAt, "never"),
                  })}
                </p>
              </div>
              <button type="button" className="btn" disabled={locked} onClick={handleRunCleanup}>
                {busy === "cleanup" ? (
                  <Spinner label={t("settings.cleanup.runningBtn")} />
                ) : (
                  t("settings.maintenance.runNow")
                )}
              </button>
            </div>
          </div>

          <div className="settings-block dns-endpoints-block">
            <h3>{t("settings.gateway.title")}</h3>
            <p className="hint">{t("settings.gateway.description")}</p>
            {!dnsLocation ? (
              <p className="hint dns-endpoint-warning">{t("settings.gateway.noLocation")}</p>
            ) : (
              <div className="dns-endpoint-list">
                {[
                  {
                    key: "ipv4" as const,
                    label: t("settings.gateway.ipv4Dest"),
                    value: [dnsLocation.ipv4Destination, dnsLocation.ipv4DestinationBackup]
                      .filter(Boolean)
                      .join(" · "),
                  },
                  {
                    key: "ipv6" as const,
                    label: t("settings.gateway.ipv6Dest"),
                    value: dnsLocation.ipv6Destination ?? "",
                  },
                  {
                    key: "doh" as const,
                    label: t("settings.gateway.dohSubdomain"),
                    value: dnsLocation.dohSubdomain
                      ? `https://${dnsLocation.dohSubdomain}.cloudflare-gateway.com/dns-query`
                      : "",
                  },
                ].map((endpoint) => {
                  const enabled = dnsLocation.endpoints[endpoint.key];
                  return (
                    <div className="dns-endpoint-row" key={endpoint.key}>
                      <div className="dns-endpoint-head">
                        <strong>{endpoint.label}</strong>
                        <span className={`badge ${enabled ? "cloudflare" : "local"}`}>
                          {enabled ? t("status.enabled") : t("status.disabled")}
                        </span>
                      </div>
                      {enabled && endpoint.value ? (
                        <p className="dns-endpoint-value">
                          <CopyValue
                            value={endpoint.value}
                            onCopied={() => onToast(t("common.copied"))}
                          />
                        </p>
                      ) : (
                        <p className="hint">{t("status.disabled")}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div
            className="settings-block settings-block-wide split-tunnels-block"
            aria-busy={splitTunnelsLoading || splitBusy}
          >
            <div className="split-head">
              <div>
                <h3>{t("settings.splitTunnels.title")}</h3>
                <p className="hint">{t("settings.splitTunnels.description")}</p>
              </div>
              {splitTunnels && (
                <label className={`mode-switch ${splitTunnels.mode}`}>
                  <span>{t("settings.splitTunnels.modeExclude")}</span>
                  <input
                    type="checkbox"
                    role="switch"
                    aria-label={t("settings.splitTunnels.modeSwitchLabel")}
                    checked={splitTunnels.mode === "include"}
                    disabled={locked || splitBusy}
                    onChange={(e) => {
                      const next = e.target.checked ? "include" : "exclude";
                      void handleSwitchSplitMode(next);
                    }}
                  />
                  <span className="switch-track" aria-hidden>
                    <span />
                  </span>
                  <span>{t("settings.splitTunnels.modeInclude")}</span>
                </label>
              )}
            </div>
            <p className="hint split-mode-copy">
              {splitTunnels?.mode === "include"
                ? t("settings.splitTunnels.modeIncludeHint")
                : t("settings.splitTunnels.modeExcludeHint")}
            </p>
            {splitTunnels?.audit && !splitTunnels.audit.meshIpsRouted && (
              <div className="health-alert" role="alert">
                <div className="health-alert-copy">
                  <strong>{t("settings.splitTunnels.meshRoutingWarning")}</strong>
                  <p className="hint">{splitTunnels.audit.warning}</p>
                </div>
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  disabled={locked || splitBusy}
                  onClick={async () => {
                    setSplitBusy(true);
                    try {
                      const updated = await api.ensureMeshRouting();
                      queryClient.setQueryData(["split-tunnels"], updated);
                      onToast(t("settings.splitTunnels.meshRoutingFixed"), "success");
                    } catch (e) {
                      onToast(e instanceof Error ? e.message : String(e), "error");
                    } finally {
                      setSplitBusy(false);
                    }
                  }}
                >
                  {splitBusy ? (
                    <Spinner label={t("settings.splitTunnels.fixingRoutingBtn")} />
                  ) : (
                    t("settings.splitTunnels.fixRoutingBtn")
                  )}
                </button>
              </div>
            )}

            {splitTunnelsLoading ? (
              <div className="split-list" aria-label={t("settings.splitTunnels.title")}>
                {Array.from({ length: 3 }, (_, index) => (
                  <div className="route-row" key={index}>
                    <div className="skeleton-stack">
                      <SkeletonBlock className="skeleton-route-primary" />
                      <SkeletonBlock className="skeleton-route-secondary" />
                    </div>
                    <SkeletonBlock className="skeleton-route-action" />
                  </div>
                ))}
              </div>
            ) : splitTunnels ? (
              <>
                <div className="split-list">
                  {splitTunnels[splitTunnels.mode].map((item, index) => (
                    <div className="route-row" key={`${item.address ?? item.host}-${index}`}>
                      <div>
                        <span className="mono">{item.address ?? item.host}</span>
                        {item.description && <span className="hint">{item.description}</span>}
                      </div>
                      <div className="row-actions split-item-actions">
                        <button
                          type="button"
                          className="btn btn-icon"
                          title={t("settings.splitTunnels.editEntry")}
                          aria-label={`${t("settings.splitTunnels.editEntry")}: ${item.address ?? item.host}`}
                          disabled={locked || splitBusy}
                          onClick={() =>
                            setSplitEditor({
                              index,
                              value: item.address ?? item.host ?? "",
                              description: item.description ?? "",
                            })
                          }
                        >
                          <Pencil size={14} strokeWidth={2.25} aria-hidden />
                        </button>
                        <button
                          type="button"
                          className="btn btn-icon btn-danger"
                          title={t("settings.splitTunnels.deleteEntry")}
                          aria-label={`${t("settings.splitTunnels.deleteEntry")}: ${item.address ?? item.host}`}
                          disabled={locked || splitBusy}
                          onClick={() => void handleDeleteSplitItem(index)}
                        >
                          <Trash2 size={14} strokeWidth={2.25} aria-hidden />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  className="btn btn-primary split-add-button"
                  disabled={locked || splitBusy}
                  onClick={() => setSplitEditor({ index: null, value: "", description: "" })}
                >
                  {t("settings.splitTunnels.addEntryBtn")}
                </button>
              </>
            ) : null}
          </div>
        </div>
      )}

      {splitEditor && splitTunnels && (
        <Modal
          isOpen={Boolean(splitEditor)}
          onClose={() => setSplitEditor(null)}
          title={
            splitEditor.index === null
              ? t("settings.splitTunnels.modalTitleAdd")
              : t("settings.splitTunnels.modalTitleEdit")
          }
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleSaveSplitItem();
            }}
          >
            <div className="field">
              <label htmlFor="split-value">{t("settings.splitTunnels.addressHostLabel")}</label>
              <input
                id="split-value"
                type="text"
                value={splitEditor.value}
                placeholder={t("settings.splitTunnels.addressHostPlaceholder")}
                disabled={splitBusy}
                autoFocus
                onChange={(e) => setSplitEditor({ ...splitEditor, value: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="split-description">{t("settings.splitTunnels.descriptionLabel")}</label>
              <input
                id="split-description"
                type="text"
                value={splitEditor.description}
                placeholder={t("settings.splitTunnels.descriptionPlaceholder")}
                disabled={splitBusy}
                onChange={(e) => setSplitEditor({ ...splitEditor, description: e.target.value })}
              />
            </div>
            <div className="row-actions modal-actions">
              <button
                type="button"
                className="btn"
                disabled={splitBusy}
                onClick={() => setSplitEditor(null)}
              >
                {t("common.cancel")}
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={splitBusy || !splitEditor.value.trim()}
              >
                {splitBusy ? (
                  <Spinner label={t("settings.splitTunnels.savingBtn")} />
                ) : (
                  t("common.save")
                )}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}
