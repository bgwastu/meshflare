import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { Modal } from "../ui/Modal";
import { Spinner } from "../ui/Spinner";
import { Switch } from "../ui/Switch";
import { CopyValue } from "../ui/CopyValue";
import { SkeletonBlock } from "../ui/Skeleton";
import { isDnsFilterBusy, useSettings } from "../../hooks/useSettings";
import { useLanguage } from "../../hooks/useLanguage";
import { dnsFilterStatusMeta } from "../../lib/warp";
import type { SplitTunnelItem } from "../../lib/api";

type SettingsViewProps = {
  locked: boolean;
  onToast: (msg: string, tone?: "success" | "error" | "warn") => void;
};

type BusyKey = "domain" | "offline-days" | "filter-url" | "dns-filter" | "sync" | "cleanup" | "split";

/** Suffixes in WARP's default Local Domain Fallback list; Gateway never sees them. */
const FALLBACK_SUFFIXES = new Set(["local", "internal", "lan", "home.arpa", "corp", "private", "test", "arpa"]);

const cleanSuffix = (raw: string) => raw.trim().toLowerCase().replace(/^\.+/, "");

export function SettingsView({ locked, onToast }: SettingsViewProps) {
  const { t, formatSeen } = useLanguage();

  const {
    settingsQuery,
    settings,
    patchSettings,
    splitTunnels,
    splitTunnelsLoading,
    splitTunnelsError,
    refetchSplitTunnels,
    saveSplitTunnels,
    ensureMeshRouting,
    maintenanceHealth,
    repairMaintenance,
    isRepairingMaintenance,
    syncDns,
    cleanup,
  } = useSettings();

  // Drafts stay null until the user edits a field, so background refetches
  // (e.g. DNS filter polling) never overwrite what is being typed.
  const [suffixDraft, setSuffixDraft] = useState<string | null>(null);
  const [offlineDaysDraft, setOfflineDaysDraft] = useState<string | null>(null);
  const [filterUrlDraft, setFilterUrlDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState<BusyKey | null>(null);
  const [splitEditor, setSplitEditor] = useState<{
    index: number | null;
    value: string;
    description: string;
  } | null>(null);

  /** Run one action at a time and report the outcome as a toast. */
  const run = async (
    key: BusyKey,
    action: () => Promise<unknown>,
    successMsg = t("toasts.settingsSaved"),
    failMsg = t("toasts.settingsSaveFailed"),
  ): Promise<boolean> => {
    if (busy || locked) return false;
    setBusy(key);
    try {
      await action();
      onToast(successMsg, "success");
      return true;
    } catch (e) {
      onToast(e instanceof Error ? e.message : failMsg, "error");
      return false;
    } finally {
      setBusy(null);
    }
  };

  if (!settings) {
    return (
      <section className="settings-panel" aria-busy={settingsQuery.isPending}>
        <header className="settings-intro">
          <h2>{t("settings.title")}</h2>
          <p className="hint">{t("settings.subtitle")}</p>
        </header>
        {settingsQuery.isError && !settingsQuery.isFetching ? (
          <div className="health-alert" role="alert">
            <div className="health-alert-copy">
              <strong>{t("settings.loadFailed")}</strong>
              <p className="hint">{settingsQuery.error.message}</p>
            </div>
            <button type="button" className="btn" onClick={() => void settingsQuery.refetch()}>
              {t("common.retry")}
            </button>
          </div>
        ) : (
          <div className="skeleton-stack">
            <SkeletonBlock className="skeleton-label" />
            <SkeletonBlock className="skeleton-input" />
            <SkeletonBlock className="skeleton-btn" />
            <SkeletonBlock className="skeleton-row" />
          </div>
        )}
      </section>
    );
  }

  const suffixValue = suffixDraft ?? settings.meshSuffix;
  const suffix = cleanSuffix(suffixValue);
  const offlineDaysValue = offlineDaysDraft ?? String(settings.offlineDays);
  const offlineDays = Number(offlineDaysValue);
  const offlineDaysValid = Number.isInteger(offlineDays) && offlineDays >= 1 && offlineDays <= 365;
  const filterUrlValue = filterUrlDraft ?? settings.dnsFilterUrl;
  const filterUrl = filterUrlValue.trim();

  const filterMeta = dnsFilterStatusMeta(settings.dnsFilterStatus, settings.dnsFilterEnabled);
  const filterOperationPending = isDnsFilterBusy(settings);
  const dnsLocation = settings.dnsLocation;
  const splitBusy = busy === "split";

  const handleSaveDomain = async () => {
    if (!suffix || suffix === settings.meshSuffix) return;
    if (await run("domain", () => patchSettings({ meshSuffix: suffix }))) setSuffixDraft(null);
  };

  const handleSaveOfflineDays = async () => {
    if (!offlineDaysValid || offlineDays === settings.offlineDays) return;
    if (await run("offline-days", () => patchSettings({ offlineDays }))) setOfflineDaysDraft(null);
  };

  const handleSaveFilterUrl = async () => {
    if (!filterUrl || filterUrl === settings.dnsFilterUrl) return;
    if (await run("filter-url", () => patchSettings({ dnsFilterUrl: filterUrl }))) {
      setFilterUrlDraft(null);
    }
  };

  const handleToggleFilter = (enabled: boolean) => {
    if (filterOperationPending) return;
    void run("dns-filter", () => patchSettings({ dnsFilterEnabled: enabled }));
  };

  const handleSyncDns = () =>
    void run("sync", syncDns, t("toasts.dnsSynced"), t("toasts.dnsSyncFailed"));

  const handleRunCleanup = () =>
    void run("cleanup", cleanup, t("toasts.cleanupFinished"), t("toasts.cleanupFailed"));

  const handleRepair = async () => {
    try {
      const res = await repairMaintenance();
      onToast(
        res.ok ? t("toasts.maintenanceRepaired") : t("toasts.maintenanceRepairFailed"),
        res.ok ? "success" : "error",
      );
    } catch (e) {
      onToast(e instanceof Error ? e.message : t("toasts.maintenanceRepairFailed"), "error");
    }
  };

  const saveSplitItems = (mode: "include" | "exclude", items: SplitTunnelItem[]) =>
    run("split", () => saveSplitTunnels({ mode, items }));

  const handleSwitchSplitMode = (mode: "include" | "exclude") => {
    if (splitTunnels) void saveSplitItems(mode, splitTunnels[mode]);
  };

  const handleSaveSplitItem = async () => {
    if (!splitEditor || !splitTunnels) return;
    const value = splitEditor.value.trim();
    if (!value) return;

    const description = splitEditor.description.trim() || undefined;
    const item: SplitTunnelItem = value.includes("/")
      ? { address: value, description }
      : { host: value, description };

    const activeItems = splitTunnels[splitTunnels.mode];
    const items = splitEditor.index === null
      ? [...activeItems, item]
      : activeItems.map((cur, idx) => (idx === splitEditor.index ? item : cur));

    if (await saveSplitItems(splitTunnels.mode, items)) setSplitEditor(null);
  };

  const handleDeleteSplitItem = (index: number) => {
    if (!splitTunnels) return;
    void saveSplitItems(
      splitTunnels.mode,
      splitTunnels[splitTunnels.mode].filter((_, i) => i !== index),
    );
  };

  const handleEnsureMeshRouting = () =>
    void run("split", ensureMeshRouting, t("settings.splitTunnels.meshRoutingFixed"));

  return (
    <section className="settings-panel">
      <header className="settings-intro">
        <h2>{t("settings.title")}</h2>
        <p className="hint">{t("settings.subtitle")}</p>
      </header>

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
                value={suffixValue}
                placeholder={t("settings.meshDns.suffixPlaceholder")}
                disabled={locked || busy === "domain"}
                onChange={(e) => setSuffixDraft(e.target.value)}
              />
            </div>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            disabled={locked || Boolean(busy) || !suffix || suffix === settings.meshSuffix}
            onClick={() => void handleSaveDomain()}
          >
            {busy === "domain" ? (
              <Spinner label={t("settings.meshDns.savingBtn")} />
            ) : (
              t("settings.meshDns.saveBtn")
            )}
          </button>
          {FALLBACK_SUFFIXES.has(suffix) && (
            <p className="hint hint-warn">
              {t("settings.meshDns.warpFallbackWarning", { suffix })}
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
              value={offlineDaysValue}
              disabled={locked || busy === "offline-days"}
              onChange={(e) => setOfflineDaysDraft(e.target.value)}
            />
          </div>
          <button
            type="button"
            className="btn"
            disabled={
              locked || Boolean(busy) || !offlineDaysValid || offlineDays === settings.offlineDays
            }
            onClick={() => void handleSaveOfflineDays()}
          >
            {busy === "offline-days" ? <Spinner label={t("common.saving")} /> : t("common.save")}
          </button>
        </div>

        <div className="settings-block">
          <div className="settings-block-head">
            <h3>{t("settings.dnsFilter.title")}</h3>
            <Switch
              checked={settings.dnsFilterEnabled}
              label={t("settings.dnsFilter.toggleLabel")}
              disabled={locked || filterOperationPending || Boolean(busy)}
              onChange={handleToggleFilter}
            />
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
              value={filterUrlValue}
              placeholder={t("settings.dnsFilter.customUrlPlaceholder")}
              disabled={locked || filterOperationPending || busy === "filter-url"}
              onChange={(e) => setFilterUrlDraft(e.target.value)}
            />
          </div>
          <div className="row-actions">
            <button
              type="button"
              className="btn"
              disabled={
                locked ||
                Boolean(busy) ||
                filterOperationPending ||
                !filterUrl ||
                filterUrl === settings.dnsFilterUrl
              }
              onClick={() => void handleSaveFilterUrl()}
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
                onClick={() => void handleRepair()}
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
            <button
              type="button"
              className="btn"
              disabled={locked || Boolean(busy)}
              onClick={handleSyncDns}
            >
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
            <button
              type="button"
              className="btn"
              disabled={locked || Boolean(busy)}
              onClick={handleRunCleanup}
            >
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
              <Switch
                checked={splitTunnels.mode === "include"}
                label={t("settings.splitTunnels.modeSwitchLabel")}
                startLabel={t("settings.splitTunnels.modeExclude")}
                endLabel={t("settings.splitTunnels.modeInclude")}
                disabled={locked || splitBusy}
                onChange={(on) => handleSwitchSplitMode(on ? "include" : "exclude")}
              />
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
                onClick={handleEnsureMeshRouting}
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
          ) : splitTunnelsError && !splitTunnels ? (
            <div className="health-alert" role="alert">
              <div className="health-alert-copy">
                <strong>{t("settings.splitTunnels.loadFailed")}</strong>
                <p className="hint">{splitTunnelsError}</p>
              </div>
              <button type="button" className="btn" onClick={() => void refetchSplitTunnels()}>
                {t("common.retry")}
              </button>
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
                        onClick={() => handleDeleteSplitItem(index)}
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
