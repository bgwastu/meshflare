import { useState, useMemo } from "react";
import { Search, RefreshCw, X, Loader2 } from "lucide-react";
import { FacetChip } from "../ui/FilterChips";
import { MeshTable, type SortKey } from "./MeshTable";
import { MeshDrawer } from "./MeshDrawer";
import { CreateNodeModal } from "./CreateNodeModal";
import { EditMachineModal } from "./EditMachineModal";
import { DeleteMachineModal } from "./DeleteMachineModal";
import { AddRouteModal } from "./AddRouteModal";
import { useMesh } from "../../hooks/useMesh";
import { useSettingsQuery } from "../../hooks/useSettings";
import { useLanguage } from "../../hooks/useLanguage";
import { canonicalMachineStatusKey } from "../../i18n/status";
import type { MeshEntry, MeshEntryPatch, MeshRoute } from "../../lib/api";

type KindFilter = "all" | "node" | "device";
type ActivityFilter = "all" | "online" | "offline";
type EntryRef = { kind: MeshEntry["kind"]; id: string };

type MeshViewProps = {
  locked: boolean;
  onToast: (msg: string, tone?: "success" | "error" | "warn") => void;
};

const timeOf = (iso: string | null | undefined) => Date.parse(iso ?? "") || 0;

const COMPARATORS: Record<SortKey, (a: MeshEntry, b: MeshEntry) => number> = {
  name: (a, b) => a.name.localeCompare(b.name),
  status: (a, b) => a.status.localeCompare(b.status),
  meshHostname: (a, b) => (a.meshHostname ?? "").localeCompare(b.meshHostname ?? ""),
  ipv4: (a, b) => (a.ipv4 ?? "").localeCompare(b.ipv4 ?? "", undefined, { numeric: true }),
  lastSeenAt: (a, b) => timeOf(a.lastSeenAt) - timeOf(b.lastSeenAt),
  createdAt: (a, b) => timeOf(a.createdAt) - timeOf(b.createdAt),
};

const sameEntry = (entry: MeshEntry, ref: EntryRef | null) =>
  ref !== null && entry.kind === ref.kind && entry.id === ref.id;

export function MeshView({ locked, onToast }: MeshViewProps) {
  const { t } = useLanguage();

  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // Modals & drawer hold a reference, so they always show the latest entry data.
  const [createOpen, setCreateOpen] = useState(false);
  const [editRef, setEditRef] = useState<EntryRef | null>(null);
  const [deleteRef, setDeleteRef] = useState<EntryRef | null>(null);
  const [drawerRef, setDrawerRef] = useState<EntryRef | null>(null);
  const [addRouteNodeId, setAddRouteNodeId] = useState<string | null>(null);

  const suffix = useSettingsQuery().data?.meshSuffix ?? "mesh";

  const {
    entries,
    meshQuery,
    routes,
    routesLoading,
    nodeToken,
    installLoading,
    syncDns,
    isSyncingDns,
    createNode,
    updateEntry,
    deleteEntry,
    recreateNode,
    addRoute,
    deleteRoute,
  } = useMesh({
    selectedNodeId: drawerRef?.kind === "node" ? drawerRef.id : null,
  });

  const findEntry = (ref: EntryRef | null) => entries.find((e) => sameEntry(e, ref)) ?? null;
  const drawerEntry = findEntry(drawerRef);
  const editEntry = findEntry(editRef);
  const deleteTarget = findEntry(deleteRef);

  const ready = meshQuery.isSuccess;

  const filteredEntries = useMemo(() => {
    const q = search.trim().toLowerCase();
    const compare = COMPARATORS[sortKey];
    const direction = sortDir === "asc" ? 1 : -1;

    return entries
      .filter((entry) => {
        if (kindFilter !== "all" && entry.kind !== kindFilter) return false;

        if (activityFilter !== "all") {
          const isOnline = canonicalMachineStatusKey(entry.status) === "online";
          if ((activityFilter === "online") !== isOnline) return false;
        }

        return !q || [entry.name, entry.meshHostname, entry.ipv4, entry.ipv6].some(
          (value) => value?.toLowerCase().includes(q),
        );
      })
      .sort((a, b) => compare(a, b) * direction);
  }, [entries, search, kindFilter, activityFilter, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const clearFilters = () => {
    setSearch("");
    setKindFilter("all");
    setActivityFilter("all");
  };

  /** Run an action, toast the outcome, and rethrow so modals stay open on failure. */
  const report = async <T,>(action: () => Promise<T>, successMsg: string, failMsg: string) => {
    try {
      const result = await action();
      onToast(successMsg, "success");
      return result;
    } catch (e) {
      onToast(e instanceof Error ? e.message : failMsg, "error");
      throw e;
    }
  };

  const handleSyncDns = () =>
    report(syncDns, t("toasts.dnsSynced"), t("toasts.dnsSyncFailed")).catch(() => {});

  const handleCreateNode = async (name: string) => {
    await report(() => createNode(name), t("toasts.nodeCreated"), t("toasts.nodeCreateFailed"));
  };

  const handleSaveEntry = async (entry: MeshEntry, patch: MeshEntryPatch) => {
    const res = await report(
      () => updateEntry({ kind: entry.kind, id: entry.id, patch }),
      t("toasts.machineUpdated"),
      t("toasts.machineUpdateFailed"),
    );
    if (res.notice) onToast(res.notice, "warn");
  };

  const handleDeleteMachine = async (id: string) => {
    if (!deleteRef) return;
    const ref = deleteRef;
    await report(
      () => deleteEntry({ kind: ref.kind, id }),
      t("toasts.machineDeleted"),
      t("toasts.machineDeleteFailed"),
    );
    if (drawerRef?.kind === ref.kind && drawerRef.id === id) setDrawerRef(null);
  };

  const handleRegenerateToken = async () => {
    if (drawerRef?.kind !== "node") return;
    const { node } = await report(
      () => recreateNode(drawerRef.id),
      t("toasts.tokenRegenerated"),
      t("toasts.tokenRegenerateFailed"),
    );
    // Regenerating replaces the node, so follow it to its new id.
    setDrawerRef({ kind: "node", id: node.id });
  };

  const handleDeleteRoute = async (route: MeshRoute) => {
    if (drawerRef?.kind !== "node" || !route.id) return;
    const routeId = route.id;
    await report(
      () => deleteRoute({ nodeId: drawerRef.id, routeId }),
      t("toasts.routeDeleted"),
      t("toasts.routeDeleteFailed"),
    );
  };

  const handleAddRoute = async (
    nodeId: string,
    type: "cidr" | "hostname",
    value: string,
    comment?: string,
  ) => {
    await report(
      () => addRoute({ nodeId, type, value, comment }),
      t("toasts.routeAdded"),
      t("toasts.routeAddFailed"),
    );
  };

  const hasFilters = kindFilter !== "all" || activityFilter !== "all" || Boolean(search.trim());

  return (
    <section className="panel" aria-busy={!ready}>
      <div className="panel-head">
        <h2>
          {t("nav.mesh")}{" "}
          {ready ? (
            <span className="hint">({filteredEntries.length})</span>
          ) : (
            <Loader2 size={13} strokeWidth={2.5} className="spin count-spin" aria-hidden />
          )}
        </h2>

        <div className="filters">
          <FacetChip
            label={t("mesh.columns.kind")}
            value={kindFilter}
            options={[
              { value: "all", label: t("common.all") },
              { value: "node", label: t("mesh.filterKind.node") },
              { value: "device", label: t("mesh.filterKind.device") },
            ]}
            onChange={(val) => setKindFilter(val as KindFilter)}
          />

          <FacetChip
            label={t("mesh.columns.status")}
            value={activityFilter}
            options={[
              { value: "all", label: t("common.all") },
              { value: "online", label: t("mesh.filterActivity.online") },
              { value: "offline", label: t("mesh.filterActivity.offline") },
            ]}
            onChange={(val) => setActivityFilter(val as ActivityFilter)}
          />

          <button
            type="button"
            className="btn btn-icon"
            disabled={locked || isSyncingDns}
            title={t("common.refresh")}
            aria-label={t("common.refresh")}
            onClick={() => void handleSyncDns()}
          >
            {isSyncingDns ? (
              <Loader2 size={15} strokeWidth={2.25} className="spin" aria-hidden />
            ) : (
              <RefreshCw size={15} strokeWidth={2.25} aria-hidden />
            )}
          </button>
        </div>
      </div>

      <div className="mesh-toolbar">
        <div className="search-wrap">
          <Search size={15} strokeWidth={2.25} className="search-icon" aria-hidden />
          <input
            type="search"
            placeholder={t("mesh.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label={t("mesh.searchPlaceholder")}
          />
        </div>
        <button
          type="button"
          className="btn btn-primary"
          disabled={locked}
          onClick={() => setCreateOpen(true)}
        >
          {t("mesh.addNode")}
        </button>
      </div>

      {hasFilters && ready && (
        <div className="applied-filters">
          {kindFilter !== "all" && (
            <button
              type="button"
              className="filter-chip"
              onClick={() => setKindFilter("all")}
            >
              {t("mesh.columns.kind")}: {kindFilter === "node" ? t("mesh.filterKind.node") : t("mesh.filterKind.device")}
              <X size={12} strokeWidth={2.5} aria-hidden />
            </button>
          )}

          {activityFilter !== "all" && (
            <button
              type="button"
              className="filter-chip"
              onClick={() => setActivityFilter("all")}
            >
              {t("mesh.columns.status")}: {activityFilter === "online" ? t("mesh.filterActivity.online") : t("mesh.filterActivity.offline")}
              <X size={12} strokeWidth={2.5} aria-hidden />
            </button>
          )}

          {search.trim() && (
            <button
              type="button"
              className="filter-chip"
              onClick={() => setSearch("")}
            >
              {t("common.search")}: “{search.trim()}”
              <X size={12} strokeWidth={2.5} aria-hidden />
            </button>
          )}

          <button type="button" className="filter-clear-all" onClick={clearFilters}>
            {t("common.clearFilters")}
          </button>
        </div>
      )}

      <MeshTable
        entries={filteredEntries}
        loading={!ready}
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={handleSort}
        onSelectEntry={(entry) => setDrawerRef({ kind: entry.kind, id: entry.id })}
        onOpenCreate={() => setCreateOpen(true)}
        hasFilters={hasFilters}
        onClearFilters={clearFilters}
        onToast={onToast}
      />

      <MeshDrawer
        entry={drawerEntry}
        isOpen={Boolean(drawerEntry)}
        onClose={() => setDrawerRef(null)}
        routes={routes}
        routesLoading={routesLoading}
        onOpenAddRoute={() => setAddRouteNodeId(drawerEntry?.id ?? null)}
        onDeleteRoute={handleDeleteRoute}
        nodeToken={nodeToken}
        tokenLoading={installLoading}
        onRegenerateToken={handleRegenerateToken}
        onOpenEdit={(entry) => setEditRef({ kind: entry.kind, id: entry.id })}
        onOpenDelete={(entry) => setDeleteRef({ kind: entry.kind, id: entry.id })}
        locked={locked}
        onToast={onToast}
      />

      <CreateNodeModal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={handleCreateNode}
        locked={locked}
      />

      <EditMachineModal
        entry={editEntry}
        suffix={suffix}
        onClose={() => setEditRef(null)}
        onSave={handleSaveEntry}
        locked={locked}
      />

      <DeleteMachineModal
        entry={deleteTarget}
        onClose={() => setDeleteRef(null)}
        onDelete={handleDeleteMachine}
        locked={locked}
      />

      <AddRouteModal
        nodeId={addRouteNodeId}
        isOpen={Boolean(addRouteNodeId)}
        onClose={() => setAddRouteNodeId(null)}
        onAddRoute={({ nodeId, network, comment }) => handleAddRoute(nodeId, "cidr", network, comment)}
        onAddHostnameRoute={({ nodeId, hostname, comment }) =>
          handleAddRoute(nodeId, "hostname", hostname, comment)
        }
        locked={locked}
      />
    </section>
  );
}
