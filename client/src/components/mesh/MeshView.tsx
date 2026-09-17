import { useState, useMemo } from "react";
import { useSearchParams } from "react-router";
import { MeshFilters } from "./MeshFilters";
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
  const [searchParams, setSearchParams] = useSearchParams();

  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
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
    cleanup,
    isCleaning,
    createNode,
    renameMachine,
    deleteMachine,
    recreateNode,
    addRoute,
    deleteRoute,
  } = useMesh({
    selectedNodeId: drawerEntry?.id ?? null,
  });

  // Calculate counts
  const nodeCount = entries.filter((e) => e.kind === "node").length;
  const deviceCount = entries.filter((e) => e.kind === "device").length;
  const onlineCount = entries.filter(
    (e) => e.status.toLowerCase() === "online" || e.status.toLowerCase() === "healthy",
  ).length;
  const offlineCount = entries.filter(
    (e) => e.status.toLowerCase() === "offline" || e.status.toLowerCase() === "down" || e.status.toLowerCase() === "inactive",
  ).length;

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
          case "kind":
            cmp = a.kind.localeCompare(b.kind);
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
          case "status":
            cmp = a.status.localeCompare(b.status);
            break;
          case "createdAt":
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

  const handleCleanup = async () => {
    try {
      await cleanup();
      onToast(t("toasts.cleanupFinished"), "success");
    } catch (e) {
      onToast(e instanceof Error ? e.message : t("toasts.cleanupFailed"), "error");
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

  return (
    <div className="mesh-view">
      <MeshFilters
        search={search}
        onSearchChange={setSearch}
        kindFilter={kindFilter}
        onKindChange={setKindFilter}
        activityFilter={activityFilter}
        onActivityChange={setActivityFilter}
        totalCount={entries.length}
        nodeCount={nodeCount}
        deviceCount={deviceCount}
        onlineCount={onlineCount}
        offlineCount={offlineCount}
        onSyncDns={() => void handleSyncDns()}
        isSyncingDns={isSyncingDns}
        onCleanup={() => void handleCleanup()}
        isCleaning={isCleaning}
        onOpenCreate={() => setCreateOpen(true)}
        locked={locked}
      />

      <MeshTable
        entries={filteredEntries}
        loading={meshQuery.isFetching && entries.length === 0}
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={handleSort}
        onSelectEntry={(entry) => setDrawerEntry(entry)}
        onOpenRename={(entry) => setRenameEntry(entry)}
        onOpenDelete={(entry) => setDeleteEntry(entry)}
        locked={locked}
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
    </div>
  );
}
