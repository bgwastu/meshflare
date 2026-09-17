import { useState, useMemo } from "react";
import { Search, RefreshCw, X, Loader2 } from "lucide-react";
import { FacetChip } from "../ui/FilterChips";
import { MeshTable, type SortKey } from "./MeshTable";
import { MeshDrawer } from "./MeshDrawer";
import { CreateNodeModal } from "./CreateNodeModal";
import { RenameMachineModal } from "./RenameMachineModal";
import { DeleteMachineModal } from "./DeleteMachineModal";
import { AddRouteModal } from "./AddRouteModal";
import { useMesh } from "../../hooks/useMesh";
import { useLanguage } from "../../hooks/useLanguage";
import type { MeshEntry, MeshRoute } from "../../lib/api";

type KindFilter = "all" | "node" | "device";
type ActivityFilter = "all" | "online" | "offline";

type MeshViewProps = {
  locked: boolean;
  onToast: (msg: string, tone?: "success" | "error" | "warn") => void;
};

export function MeshView({ locked, onToast }: MeshViewProps) {
  const { t } = useLanguage();

  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("createdAt" as any);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // Modals & Drawer state
  const [createOpen, setCreateOpen] = useState(false);
  const [renameEntry, setRenameEntry] = useState<MeshEntry | null>(null);
  const [deleteEntry, setDeleteEntry] = useState<MeshEntry | null>(null);
  const [addRouteNodeId, setAddRouteNodeId] = useState<string | null>(null);
  const [drawerEntry, setDrawerEntry] = useState<MeshEntry | null>(null);

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
    renameMachine,
    deleteMachine,
    recreateNode,
    addRoute,
    deleteRoute,
  } = useMesh({
    selectedNodeId: drawerEntry?.id ?? null,
  });

  const ready = meshQuery.isSuccess;

  // Filter and sort entries
  const filteredEntries = useMemo(() => {
    const q = search.trim().toLowerCase();

    return entries
      .filter((entry) => {
        if (kindFilter !== "all" && entry.kind !== kindFilter) return false;

        const isOnline =
          entry.status.toLowerCase() === "online" || entry.status.toLowerCase() === "healthy";
        if (activityFilter === "online" && !isOnline) return false;
        if (activityFilter === "offline" && isOnline) return false;

        if (q) {
          const matchName = entry.name.toLowerCase().includes(q);
          const matchHost = entry.meshHostname?.toLowerCase().includes(q);
          const matchIp4 = entry.ipv4?.toLowerCase().includes(q);
          const matchIp6 = entry.ipv6?.toLowerCase().includes(q);
          if (!matchName && !matchHost && !matchIp4 && !matchIp6) return false;
        }

        return true;
      })
      .sort((a, b) => {
        let cmp = 0;
        switch (sortKey) {
          case "name":
            cmp = a.name.localeCompare(b.name);
            break;
          case "meshHostname":
            cmp = (a.meshHostname ?? "").localeCompare(b.meshHostname ?? "");
            break;
          case "ipv4":
            cmp = (a.ipv4 ?? "").localeCompare(b.ipv4 ?? "");
            break;
          case "lastSeenAt":
            cmp = (Date.parse(a.lastSeenAt ?? "") || 0) - (Date.parse(b.lastSeenAt ?? "") || 0);
            break;
          default:
            cmp = (Date.parse(a.createdAt) || 0) - (Date.parse(b.createdAt) || 0);
            break;
        }
        return sortDir === "asc" ? cmp : -cmp;
      });
  }, [entries, search, kindFilter, activityFilter, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const handleSyncDns = async () => {
    try {
      await syncDns();
      onToast(t("toasts.dnsSynced"), "success");
    } catch (e) {
      onToast(e instanceof Error ? e.message : t("toasts.dnsSyncFailed"), "error");
    }
  };

  const handleCreateNode = async (name: string) => {
    try {
      await createNode(name);
      onToast(t("toasts.nodeCreated"), "success");
    } catch (e) {
      onToast(e instanceof Error ? e.message : t("toasts.nodeCreateFailed"), "error");
      throw e;
    }
  };

  const handleRenameMachine = async (id: string, name: string) => {
    if (!renameEntry) return;
    try {
      await renameMachine({ kind: renameEntry.kind, id, name });
      onToast(t("toasts.machineRenamed"), "success");
    } catch (e) {
      onToast(e instanceof Error ? e.message : t("toasts.machineRenameFailed"), "error");
      throw e;
    }
  };

  const handleDeleteMachine = async (id: string) => {
    if (!deleteEntry) return;
    try {
      await deleteMachine({ kind: deleteEntry.kind, id });
      onToast(t("toasts.machineDeleted"), "success");
      if (drawerEntry?.id === id) {
        setDrawerEntry(null);
      }
    } catch (e) {
      onToast(e instanceof Error ? e.message : t("toasts.machineDeleteFailed"), "error");
      throw e;
    }
  };

  const handleRegenerateToken = async () => {
    if (!drawerEntry) return;
    try {
      await recreateNode(drawerEntry.id);
      onToast(t("toasts.tokenRegenerated"), "success");
    } catch (e) {
      onToast(e instanceof Error ? e.message : t("toasts.tokenRegenerateFailed"), "error");
      throw e;
    }
  };

  const handleDeleteRoute = async (route: MeshRoute) => {
    if (!drawerEntry || !route.id) return;
    try {
      await deleteRoute({ nodeId: drawerEntry.id, routeId: route.id });
      onToast(t("toasts.routeDeleted"), "success");
    } catch (e) {
      onToast(e instanceof Error ? e.message : t("toasts.routeDeleteFailed"), "error");
      throw e;
    }
  };

  const hasFilters = kindFilter !== "all" || activityFilter !== "all" || Boolean(search.trim());

  return (
    <section className="panel" aria-busy={!ready}>
      <div className="panel-head">
        <h2>
          Mesh{" "}
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
          <Search size={15} strokeWidth={2.25} aria-hidden />
          <input
            type="search"
            placeholder={t("mesh.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
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

          <button
            type="button"
            className="btn filter-clear-all"
            onClick={() => {
              setSearch("");
              setKindFilter("all");
              setActivityFilter("all");
            }}
          >
            {t("common.cancel")}
          </button>
        </div>
      )}

      <MeshTable
        entries={filteredEntries}
        loading={!ready}
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={handleSort}
        onSelectEntry={(entry) => setDrawerEntry(entry)}
        onOpenCreate={() => setCreateOpen(true)}
        hasFilters={hasFilters}
        onClearFilters={() => {
          setSearch("");
          setKindFilter("all");
          setActivityFilter("all");
        }}
        onToast={(msg) => onToast(msg)}
      />

      <MeshDrawer
        entry={drawerEntry}
        isOpen={Boolean(drawerEntry)}
        onClose={() => setDrawerEntry(null)}
        routes={routes}
        routesLoading={routesLoading}
        onOpenAddRoute={() => setAddRouteNodeId(drawerEntry?.id ?? null)}
        onDeleteRoute={handleDeleteRoute}
        nodeToken={nodeToken}
        tokenLoading={installLoading}
        onRegenerateToken={handleRegenerateToken}
        onOpenDelete={(entry) => setDeleteEntry(entry)}
        locked={locked}
        onToast={(msg) => onToast(msg)}
      />

      <CreateNodeModal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={handleCreateNode}
        locked={locked}
      />

      <RenameMachineModal
        entry={renameEntry}
        onClose={() => setRenameEntry(null)}
        onRename={handleRenameMachine}
        locked={locked}
      />

      <DeleteMachineModal
        entry={deleteEntry}
        onClose={() => setDeleteEntry(null)}
        onDelete={handleDeleteMachine}
        locked={locked}
      />

      <AddRouteModal
        nodeId={addRouteNodeId}
        isOpen={Boolean(addRouteNodeId)}
        onClose={() => setAddRouteNodeId(null)}
        onAddRoute={async ({ nodeId, network, comment }) => {
          try {
            await addRoute({ nodeId, type: "cidr", value: network, comment });
            onToast(t("toasts.routeAdded"), "success");
          } catch (e) {
            onToast(e instanceof Error ? e.message : t("toasts.routeAddFailed"), "error");
            throw e;
          }
        }}
        onAddHostnameRoute={async ({ nodeId, hostname, comment }) => {
          try {
            await addRoute({ nodeId, type: "hostname", value: hostname, comment });
            onToast(t("toasts.routeAdded"), "success");
          } catch (e) {
            onToast(e instanceof Error ? e.message : t("toasts.routeAddFailed"), "error");
            throw e;
          }
        }}
        locked={locked}
      />
    </section>
  );
}
