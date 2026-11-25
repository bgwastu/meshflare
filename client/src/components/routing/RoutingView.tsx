import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { ExternalLink, Pencil, Plus, Trash2 } from "lucide-react";
import { SearchField } from "../ui/SearchField";
import { Modal } from "../ui/Modal";
import { Spinner } from "../ui/Spinner";
import { Switch } from "../ui/Switch";
import { SkeletonBlock } from "../ui/Skeleton";
import { AddRoutesModal, AddSplitModal, EditEntryModal, ProfileModal } from "./RoutingModals";
import { useRouting } from "../../hooks/useRouting";
import { useLanguage } from "../../hooks/useLanguage";
import { tunnelStatusMeta } from "../../lib/warp";
import { resolveDestination, splitValue, toSplitItem, type Verdict } from "../../lib/routing";
import type {
  RoutingConnector,
  ProfileInput,
  RoutingIssue,
  RoutingRoute,
  SplitTunnelItem,
} from "../../lib/api";

type Props = {
  locked: boolean;
  onToast: (msg: string, tone?: "success" | "error" | "warn") => void;
};

const MESH_INCLUDE_ITEM: SplitTunnelItem = { address: "100.96.0.0/12", description: "Cloudflare Mesh" };

const errorMessage = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

export function RoutingView({ locked, onToast }: Props) {
  const { t, formatSeen } = useLanguage();
  const {
    query,
    snapshot,
    saveSplit,
    fixProfile,
    createProfile,
    updateProfile,
    deleteProfile,
    createRoutes,
    deleteRoute,
    updateComment,
    busy,
  } = useRouting();
  const [params, setParams] = useSearchParams();

  const profiles = snapshot?.profiles ?? [];
  const profile = profiles.find((p) => p.id === params.get("profile")) ?? profiles[0] ?? null;
  const routes = snapshot?.routes ?? [];
  const connectors = snapshot?.connectors ?? [];

  const [check, setCheck] = useState("");
  const [exitFilter, setExitFilter] = useState<string | null>(null);
  const [addSplitOpen, setAddSplitOpen] = useState(false);
  const [addRoutesOpen, setAddRoutesOpen] = useState(false);
  const [pendingMode, setPendingMode] = useState<"include" | "exclude" | null>(null);
  const [editSplit, setEditSplit] = useState<{ index: number; item: SplitTunnelItem } | null>(null);
  const [editRoute, setEditRoute] = useState<RoutingRoute | null>(null);
  const [armed, setArmed] = useState<string | null>(null);
  const [profileModal, setProfileModal] = useState<"new" | "edit" | null>(null);
  const [deleteProfileOpen, setDeleteProfileOpen] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const checkRef = useRef<HTMLInputElement>(null);

  // "/" jumps to the destination check, like most search-first tools.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.key !== "/" || el?.closest("input, textarea, select, [contenteditable]")) return;
      e.preventDefault();
      checkRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // A second click within 3s confirms a delete.
  useEffect(() => {
    if (!armed) return;
    const id = window.setTimeout(() => setArmed(null), 3000);
    return () => window.clearTimeout(id);
  }, [armed]);

  const verdict = useMemo(
    () => (profile && check.trim() ? resolveDestination(check, profile, routes, connectors) : null),
    [check, profile, routes, connectors],
  );

  const connectorById = useMemo(() => new Map(connectors.map((c) => [c.id, c])), [connectors]);

  const sortedRoutes = useMemo(() => {
    const name = (r: RoutingRoute) => connectorById.get(r.connectorId)?.name ?? r.connectorId;
    return [...routes]
      .filter((r) => !exitFilter || r.connectorId === exitFilter)
      .sort((a, b) => name(a).localeCompare(name(b)) || a.value.localeCompare(b.value));
  }, [routes, exitFilter, connectorById]);

  const exitCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of routes) counts.set(r.connectorId, (counts.get(r.connectorId) ?? 0) + 1);
    return [...counts.entries()]
      .map(([id, count]) => ({ connector: connectorById.get(id), id, count }))
      .sort((a, b) => b.count - a.count);
  }, [routes, connectorById]);

  // A Mesh node exit has to resolve the name itself; its DNS is Gateway, which refuses
  // names routed to it, so without a hosts entry the name breaks for every device.
  const nodeHostnameRoutes = useMemo(
    () => routes.filter((r) => r.type === "hostname" && connectorById.get(r.connectorId)?.kind === "node"),
    [routes, connectorById],
  );

  if (query.isPending) {
    return (
      <section className="routing" aria-busy="true">
        <RoutingIntro />
        <div className="skeleton-stack">
          <SkeletonBlock className="skeleton-input" />
          <SkeletonBlock className="skeleton-row" />
          <SkeletonBlock className="skeleton-row" />
          <SkeletonBlock className="skeleton-row" />
        </div>
      </section>
    );
  }

  if (!snapshot || !profile) {
    return (
      <section className="routing">
        <RoutingIntro />
        <div className="health-alert" role="alert">
          <div className="health-alert-copy">
            <strong>{t("routing.loadFailed")}</strong>
            <p className="hint">{query.error?.message ?? t("routing.noProfiles")}</p>
          </div>
          <button type="button" className="btn" onClick={() => void query.refetch()}>
            {t("common.retry")}
          </button>
        </div>
      </section>
    );
  }

  const list = profile[profile.mode];
  const highlightSplit = verdict?.kind === "bypass" ? verdict.entry : undefined;
  const highlightRoute = verdict?.kind === "route" || verdict?.kind === "route_blocked" ? verdict.route.id : null;

  const saveList = async (mode: "include" | "exclude", items: SplitTunnelItem[], okMsg?: string) => {
    if (locked) return false;
    try {
      await saveSplit({ profileId: profile.id, mode, items });
      onToast(okMsg ?? t("routing.saved"), "success");
      return true;
    } catch (e) {
      onToast(errorMessage(e, t("toasts.settingsSaveFailed")), "error");
      return false;
    }
  };

  const handleAddSplit = (items: SplitTunnelItem[]) => {
    const existing = new Set(list.map(splitValue));
    const fresh = items.filter((i) => !existing.has(splitValue(i)));
    if (!fresh.length) {
      onToast(t("routing.split.allExist"), "warn");
      return Promise.resolve(true);
    }
    return saveList(profile.mode, [...list, ...fresh]);
  };

  const handleDeleteSplit = async (index: number) => {
    const key = `split:${index}`;
    if (armed !== key) return setArmed(key);
    setArmed(null);
    setDeleting(key);
    await saveList(profile.mode, list.filter((_, i) => i !== index), t("routing.removed"));
    setDeleting(null);
  };

  const handleConfirmMode = async () => {
    if (!pendingMode) return;
    const mode = pendingMode;
    setPendingMode(null);
    const items = profile[mode];
    // Cloudflare drops back to Exclude when an Include list is empty.
    await saveList(mode, mode === "include" && items.length === 0 ? [MESH_INCLUDE_ITEM] : items);
  };

  const handleFix = async (issue: RoutingIssue) => {
    if (!issue.fix || locked) return;
    try {
      await fixProfile({ profileId: profile.id, fix: issue.fix });
      onToast(t("routing.fixed"), "success");
    } catch (e) {
      onToast(errorMessage(e, t("toasts.settingsSaveFailed")), "error");
    }
  };

  const handleAddRoutes = async (v: { connectorId: string; values: string[]; comment?: string }) => {
    try {
      const res = await createRoutes(v);
      if (res.failed.length) {
        onToast(
          t("routing.routes.partial", {
            created: res.created,
            failed: res.failed.map((f) => `${f.value}: ${f.error}`).join("; "),
          }),
          "warn",
        );
      } else {
        onToast(t("routing.routes.created", { count: res.created }), "success");
      }
      return true;
    } catch (e) {
      onToast(errorMessage(e, t("toasts.settingsSaveFailed")), "error");
      return false;
    }
  };

  const handleDeleteRoute = async (route: RoutingRoute) => {
    const key = `route:${route.id}`;
    if (armed !== key) return setArmed(key);
    setArmed(null);
    setDeleting(key);
    try {
      await deleteRoute(route);
      onToast(t("routing.removed"), "success");
    } catch (e) {
      onToast(errorMessage(e, t("toasts.settingsSaveFailed")), "error");
    } finally {
      setDeleting(null);
    }
  };

  const handleSaveProfile = async (input: ProfileInput) => {
    if (locked) return false;
    try {
      if (profileModal === "edit") {
        await updateProfile({ id: profile.id, input });
        onToast(t("routing.profiles.saved"), "success");
      } else {
        const { id } = await createProfile(input);
        if (id) selectProfile(id);
        onToast(t("routing.profiles.created"), "success");
      }
      return true;
    } catch (e) {
      onToast(errorMessage(e, t("toasts.settingsSaveFailed")), "error");
      return false;
    }
  };

  const handleDeleteProfile = async () => {
    if (locked || busy || profile.isDefault) return;
    try {
      await deleteProfile(profile.id);
      setDeleteProfileOpen(false);
      selectProfile(profiles[0]?.id ?? "");
      onToast(t("routing.profiles.deleted"), "success");
    } catch (e) {
      onToast(errorMessage(e, t("toasts.settingsSaveFailed")), "error");
    }
  };

  const selectProfile = (id: string) => {
    const next = new URLSearchParams(params);
    if (id === profiles[0]?.id) next.delete("profile");
    else next.set("profile", id);
    setParams(next, { replace: true });
    setArmed(null);
  };

  return (
    <section className="routing" aria-busy={busy}>
      <RoutingIntro />

      <form className="route-check" onSubmit={(e) => e.preventDefault()} role="search">
        <label htmlFor="route-check-input" className="field-label">
          {t("routing.check.label")}
        </label>
        <SearchField
          inputRef={checkRef}
          id="route-check-input"
          className="mono"
          dir="ltr"
          autoComplete="off"
          spellCheck={false}
          placeholder={t("routing.check.placeholder")}
          value={check}
          onChange={setCheck}
          emptyAdornment={<kbd className="kbd" aria-hidden>/</kbd>}
        />
        <VerdictLine verdict={verdict} />
        {verdict && <span className="hint">{t("routing.check.against", { profile: profile.name })}</span>}
      </form>

      {/* ── Routes: every device, whatever its profile ────────────────────────── */}
      <div className="routing-section">
        <div className="routing-section-head">
          <div>
            <h3>
              {t("routing.routes.title")}
              <span className="count tnum">{routes.length}</span>
            </h3>
            <p className="hint">{t("routing.routes.hint")}</p>
          </div>
          <div className="routing-section-actions">
            <button
              type="button"
              className="btn btn-sm btn-primary"
              disabled={locked || busy || connectors.length === 0}
              onClick={() => setAddRoutesOpen(true)}
            >
              <Plus size={13} aria-hidden />
              <span>{t("routing.routes.add")}</span>
            </button>
          </div>
        </div>

        {nodeHostnameRoutes.length > 0 && (
          <div className="health-alert is-warn" role="alert">
            <div className="health-alert-copy">
              <strong>{t("routing.routes.nodeHostnameTitle")}</strong>
              <p className="hint">
                {t("routing.routes.nodeHostnameBody", {
                  hosts: nodeHostnameRoutes.map((r) => r.value).join(", "),
                })}
              </p>
            </div>
          </div>
        )}

        {exitCounts.length > 1 && (
          <div className="filters exit-filters" role="group" aria-label={t("routing.routes.exit")}>
            <button
              type="button"
              className={`facet-chip ${exitFilter === null ? "active" : ""}`}
              aria-pressed={exitFilter === null}
              onClick={() => setExitFilter(null)}
            >
              {t("common.all")} <span className="tnum facet-count">{routes.length}</span>
            </button>
            {exitCounts.map(({ id, connector, count }) => (
              <button
                key={id}
                type="button"
                className={`facet-chip ${exitFilter === id ? "active" : ""}`}
                aria-pressed={exitFilter === id}
                onClick={() => setExitFilter(exitFilter === id ? null : id)}
              >
                {connector?.name ?? t("routing.unknownExit")} <span className="tnum facet-count">{count}</span>
              </button>
            ))}
          </div>
        )}

        {routes.length === 0 ? (
          <p className="routing-empty">{t("routing.routes.empty")}</p>
        ) : (
          <div className="table-wrap">
            <table className="table-dense">
              <thead>
                <tr>
                  <th>{t("routing.destination")}</th>
                  <th>{t("routing.routes.exit")}</th>
                  <th className="col-grow">{t("mesh.drawer.colComment")}</th>
                  <th className="col-num">{t("routing.routes.added")}</th>
                  <th className="col-actions">
                    <span className="sr-only">{t("common.actions")}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedRoutes.map((route) => {
                  const key = `route:${route.id}`;
                  return (
                    <tr key={route.id} data-highlight={route.id === highlightRoute || undefined}>
                      <td className="mono" dir="ltr">
                        {route.value}
                        {route.type === "cidr" && <span className="type-tag">{t("routing.routes.cidrTag")}</span>}
                      </td>
                      <td>
                        <ExitCell connector={connectorById.get(route.connectorId)} />
                      </td>
                      <td className="cell-muted col-grow">{route.comment || "—"}</td>
                      <td className="cell-muted col-num">{formatSeen(route.createdAt)}</td>
                      <td className="col-actions">
                        <div className="row-tools">
                          <button
                            type="button"
                            className="icon-btn icon-btn-sm"
                            title={t("routing.routes.editComment")}
                            aria-label={`${t("routing.routes.editComment")}: ${route.value}`}
                            disabled={locked || busy}
                            onClick={() => setEditRoute(route)}
                          >
                            <Pencil size={12} aria-hidden />
                          </button>
                          <DeleteButton
                            armed={armed === key}
                            busy={deleting === key}
                            disabled={locked || busy}
                            label={`${t("common.delete")}: ${route.value}`}
                            onClick={() => void handleDeleteRoute(route)}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Device profiles: the tabs switch only what is inside this box ── */}
      <div className="routing-section profile-panel">
        <div className="routing-section-head profile-panel-head">
          <h3>{t("routing.profiles.title")}</h3>
          <div className="routing-section-actions">
            {snapshot.profilesDashUrl && (
              <a className="btn btn-sm btn-ghost" href={snapshot.profilesDashUrl} target="_blank" rel="noreferrer">
                <ExternalLink size={13} aria-hidden />
                <span>{t("routing.profiles.openDash")}</span>
              </a>
            )}
            <button
              type="button"
              className="btn btn-sm"
              disabled={locked || busy}
              onClick={() => setProfileModal("new")}
            >
              <Plus size={13} aria-hidden />
              <span>{t("routing.profiles.new")}</span>
            </button>
          </div>
        </div>
        <div className="profile-tabs-row">
          <div className="routing-profiles" role="tablist" aria-label={t("routing.profilesLabel")}>
            {profiles.map((p) => (
              <button
                key={p.id}
                type="button"
                role="tab"
                aria-selected={p.id === profile.id}
                className={`profile-tab ${p.id === profile.id ? "active" : ""}`}
                onClick={() => selectProfile(p.id)}
              >
                <span className="profile-tab-name">
                  {p.name}
                  {!p.enabled && <span className="type-tag">{t("routing.profiles.offTag")}</span>}
                  {p.issues.length > 0 && (
                    <span
                      className="status-dot"
                      data-tone={p.issues.some((i) => i.severity === "error") ? "danger" : "warn"}
                      aria-label={t("routing.issuesCount", { count: p.issues.length })}
                    />
                  )}
                </span>
              </button>
            ))}
          </div>
          {!profile.isDefault && (
            <div className="profile-tools">
              <button
                type="button"
                className="icon-btn icon-btn-sm"
                title={t("routing.profiles.editTitle")}
                aria-label={`${t("routing.profiles.editTitle")}: ${profile.name}`}
                disabled={locked || busy}
                onClick={() => setProfileModal("edit")}
              >
                <Pencil size={12} aria-hidden />
              </button>
              <button
                type="button"
                className="icon-btn icon-btn-sm danger"
                title={t("routing.profiles.deleteTitle")}
                aria-label={`${t("routing.profiles.deleteTitle")}: ${profile.name}`}
                disabled={locked || busy}
                onClick={() => setDeleteProfileOpen(true)}
              >
                <Trash2 size={12} aria-hidden />
              </button>
            </div>
          )}
        </div>

        {profile.issues.map((issue, i) => (
          <div
            key={`${issue.code}-${issue.subject ?? i}`}
            className={`health-alert ${issue.severity === "warn" ? "is-warn" : ""}`}
            role="alert"
          >
            <div className="health-alert-copy">
              <strong>{t(`routing.issues.${issue.code}.title`)}</strong>
              <p className="hint">{t(`routing.issues.${issue.code}.body`, { subject: issue.subject ?? "" })}</p>
            </div>
            {issue.fix && (
              <button
                type="button"
                className="btn btn-sm"
                disabled={locked || busy}
                onClick={() => void handleFix(issue)}
              >
                {t("routing.fix")}
              </button>
            )}
          </div>
        ))}

        <div className="profile-panel-body">
          <div className="routing-section-head">
            <div>
              <h3>
                {profile.mode === "exclude" ? t("routing.split.titleExclude") : t("routing.split.titleInclude")}
                <span className="count tnum">{list.length}</span>
              </h3>
              <p className="hint">
                {profile.mode === "exclude" ? t("routing.split.hintExclude") : t("routing.split.hintInclude")}
              </p>
            </div>
            <div className="routing-section-actions">
              <Switch
                checked={profile.mode === "include"}
                label={t("settings.splitTunnels.modeSwitchLabel")}
                startLabel={t("settings.splitTunnels.modeExclude")}
                endLabel={t("settings.splitTunnels.modeInclude")}
                disabled={locked || busy}
                onChange={(on) => setPendingMode(on ? "include" : "exclude")}
              />
              <button
                type="button"
                className="btn btn-sm"
                disabled={locked || busy}
                onClick={() => setAddSplitOpen(true)}
              >
                <Plus size={13} aria-hidden />
                <span>{t("routing.add")}</span>
              </button>
            </div>
          </div>

          {list.length === 0 ? (
            <p className="routing-empty">{t("routing.split.empty")}</p>
          ) : (
            <div className="table-wrap">
              <table className="table-dense">
                <thead>
                  <tr>
                    <th>{t("routing.destination")}</th>
                    <th className="col-grow">{t("settings.splitTunnels.colDescription")}</th>
                    <th className="col-actions">
                      <span className="sr-only">{t("common.actions")}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((item, index) => {
                    const key = `split:${index}`;
                    return (
                      <tr key={`${splitValue(item)}-${index}`} data-highlight={item === highlightSplit || undefined}>
                        <td className="mono" dir="ltr">
                          {splitValue(item)}
                        </td>
                        <td className="cell-muted col-grow">{item.description || "—"}</td>
                        <td className="col-actions">
                          <div className="row-tools">
                            <button
                              type="button"
                              className="icon-btn icon-btn-sm"
                              title={t("common.edit")}
                              aria-label={`${t("common.edit")}: ${splitValue(item)}`}
                              disabled={locked || busy}
                              onClick={() => setEditSplit({ index, item })}
                            >
                              <Pencil size={12} aria-hidden />
                            </button>
                            <DeleteButton
                              armed={armed === key}
                              busy={deleting === key}
                              disabled={locked || busy}
                              label={`${t("common.delete")}: ${splitValue(item)}`}
                              onClick={() => void handleDeleteSplit(index)}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <AddSplitModal
        key={`split-${profile.id}-${profile.mode}`}
        isOpen={addSplitOpen}
        mode={profile.mode}
        profileName={profile.name}
        onClose={() => setAddSplitOpen(false)}
        onSubmit={handleAddSplit}
      />

      {profileModal && (
        <ProfileModal
          key={profileModal === "edit" ? `edit-${profile.id}` : "new"}
          isOpen
          profile={profileModal === "edit" ? profile : undefined}
          dashUrl={snapshot.profilesDashUrl}
          onClose={() => setProfileModal(null)}
          onSubmit={handleSaveProfile}
        />
      )}

      <Modal
        isOpen={deleteProfileOpen}
        onClose={() => !busy && setDeleteProfileOpen(false)}
        title={t("routing.profiles.deleteConfirmTitle", { name: profile.name })}
      >
        <div>
          <p className="hint">{t("routing.profiles.deleteConfirmBody")}</p>
          <div className="row-actions modal-actions">
            <button type="button" className="btn" disabled={busy} onClick={() => setDeleteProfileOpen(false)}>
              {t("common.cancel")}
            </button>
            <button type="button" className="btn btn-danger" disabled={busy} onClick={() => void handleDeleteProfile()}>
              {t("routing.profiles.deleteTitle")}
            </button>
          </div>
        </div>
      </Modal>

      <AddRoutesModal
        isOpen={addRoutesOpen}
        connectors={connectors}
        defaultConnectorId={exitFilter ?? undefined}
        onClose={() => setAddRoutesOpen(false)}
        onSubmit={handleAddRoutes}
      />

      {editSplit && (
        <EditEntryModal
          key={`edit-split-${editSplit.index}`}
          isOpen
          title={t("settings.splitTunnels.modalTitleEdit")}
          value={splitValue(editSplit.item)}
          valueEditable
          description={editSplit.item.description ?? ""}
          descriptionLabel={t("settings.splitTunnels.descriptionLabel")}
          onClose={() => setEditSplit(null)}
          onSubmit={(value, description) => {
            const next = toSplitItem(value, description);
            if (!next) return Promise.resolve(false);
            return saveList(
              profile.mode,
              list.map((cur, i) => (i === editSplit.index ? next : cur)),
            );
          }}
        />
      )}

      {editRoute && (
        <EditEntryModal
          key={`edit-route-${editRoute.id}`}
          isOpen
          title={t("routing.routes.editComment")}
          value={editRoute.value}
          valueEditable={false}
          description={editRoute.comment}
          descriptionLabel={t("mesh.drawer.colComment")}
          onClose={() => setEditRoute(null)}
          onSubmit={async (_, comment) => {
            try {
              await updateComment({ route: editRoute, comment });
              onToast(t("routing.saved"), "success");
              return true;
            } catch (e) {
              onToast(errorMessage(e, t("toasts.settingsSaveFailed")), "error");
              return false;
            }
          }}
        />
      )}

      <Modal
        isOpen={pendingMode !== null}
        onClose={() => setPendingMode(null)}
        title={t("settings.splitTunnels.switchTitle")}
      >
        <div>
          <p className="hint">
            {t("routing.switchWarning", {
              profile: profile.name,
              mode: t(
                pendingMode === "include"
                  ? "settings.splitTunnels.modeInclude"
                  : "settings.splitTunnels.modeExclude",
              ),
            })}
          </p>
          <div className="row-actions modal-actions">
            <button type="button" className="btn" onClick={() => setPendingMode(null)}>
              {t("common.cancel")}
            </button>
            <button type="button" className="btn btn-danger" onClick={() => void handleConfirmMode()}>
              {t("settings.splitTunnels.switchConfirmBtn")}
            </button>
          </div>
        </div>
      </Modal>
    </section>
  );
}

function RoutingIntro() {
  const { t } = useLanguage();
  return (
    <header className="settings-intro">
      <h2>{t("routing.title")}</h2>
    </header>
  );
}

function ExitCell({ connector }: { connector: RoutingConnector | undefined }) {
  const { t } = useLanguage();
  if (!connector) return <span className="cell-muted">{t("routing.unknownExit")}</span>;
  return (
    <span className="exit-cell">
      <span className="status-dot" data-tone={tunnelStatusMeta(connector.status).tone} aria-hidden />
      <span>{connector.name}</span>
      <span className="cell-muted">{t(`routing.kind.${connector.kind}`)}</span>
    </span>
  );
}

function DeleteButton({
  armed,
  busy,
  disabled,
  label,
  onClick,
}: {
  armed: boolean;
  busy: boolean;
  disabled: boolean;
  label: string;
  onClick: () => void;
}) {
  const { t } = useLanguage();
  if (busy) return <Spinner label="" />;
  return armed ? (
    <button type="button" className="btn btn-sm btn-danger btn-confirm" onClick={onClick} autoFocus>
      {t("routing.confirmDelete")}
    </button>
  ) : (
    <button
      type="button"
      className="icon-btn icon-btn-sm danger"
      title={t("common.delete")}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      <Trash2 size={12} aria-hidden />
    </button>
  );
}

function VerdictLine({ verdict }: { verdict: Verdict | null }) {
  const { t } = useLanguage();
  if (!verdict) return <p className="hint verdict-idle">{t("routing.check.idle")}</p>;

  const map: Record<Verdict["kind"], { tone: string; text: string; detail?: string }> = {
    bypass: {
      tone: "off",
      text: t("routing.check.bypass"),
      detail:
        verdict.kind === "bypass" && verdict.entry
          ? t("routing.check.matchedEntry", { entry: splitValue(verdict.entry) })
          : t("routing.check.notIncluded"),
    },
    mesh: { tone: "ok", text: t("routing.check.mesh") },
    warp: { tone: "ok", text: t("routing.check.warp") },
    route: {
      tone: "accent",
      text: t("routing.check.route", {
        exit: verdict.kind === "route" ? (verdict.connector?.name ?? t("routing.unknownExit")) : "",
      }),
      detail: verdict.kind === "route" ? t("routing.check.matchedRoute", { route: verdict.route.value }) : undefined,
    },
    route_blocked: {
      tone: "danger",
      text: t("routing.check.blocked", {
        exit: verdict.kind === "route_blocked" ? (verdict.connector?.name ?? t("routing.unknownExit")) : "",
      }),
      detail: t("routing.check.blockedDetail"),
    },
  };
  const v = map[verdict.kind];
  return (
    <p className="verdict" data-tone={v.tone} aria-live="polite">
      <span className="status-dot" data-tone={v.tone} aria-hidden />
      <strong>{v.text}</strong>
      {v.detail && <span className="cell-muted">{v.detail}</span>}
    </p>
  );
}
