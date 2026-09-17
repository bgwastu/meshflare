import { useState, useMemo } from "react";
import { TunnelFilters, type TunnelStatusFilter } from "./TunnelFilters";
import { TunnelsTable } from "./TunnelsTable";
import { TunnelDrawer } from "./TunnelDrawer";
import { CreateTunnelModal } from "./CreateTunnelModal";
import { RenameTunnelModal } from "./RenameTunnelModal";
import { DeleteTunnelModal } from "./DeleteTunnelModal";
import { IngressEditorModal } from "./IngressEditorModal";
import { useTunnels } from "../../hooks/useTunnels";
import { useLanguage } from "../../hooks/useLanguage";
import type { TunnelEntry, TunnelIngressRule } from "../../lib/api";

type TunnelsViewProps = {
  locked: boolean;
  onToast: (msg: string, tone?: "success" | "error" | "warn") => void;
};

export function TunnelsView({ locked, onToast }: TunnelsViewProps) {
  const { t } = useLanguage();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<TunnelStatusFilter>("all");

  // Modals & Drawer state
  const [createOpen, setCreateOpen] = useState(false);
  const [renameTunnel, setRenameTunnel] = useState<TunnelEntry | null>(null);
  const [deleteTunnelTarget, setDeleteTunnelTarget] = useState<TunnelEntry | null>(null);
  const [selectedTunnel, setSelectedTunnel] = useState<TunnelEntry | null>(null);

  // Ingress editor state
  const [ingressEditorRule, setIngressEditorRule] = useState<{
    index: number | null;
    hostname: string;
    path: string;
    service: string;
  } | null>(null);

  const {
    tunnels,
    tunnelsQuery,
    connections,
    connectionsLoading,
    config,
    configLoading,
    token,
    tokenLoading,
    createTunnel,
    renameTunnel: doRename,
    deleteTunnel: doDelete,
    updateConfig,
  } = useTunnels({
    selectedTunnelId: selectedTunnel?.id ?? null,
  });

  // Calculate status counts
  const healthyCount = tunnels.filter((t) => t.status === "healthy").length;
  const degradedCount = tunnels.filter((t) => t.status === "degraded").length;
  const downCount = tunnels.filter((t) => t.status === "down").length;
  const inactiveCount = tunnels.filter((t) => t.status === "inactive").length;

  // Filter tunnels by search and status
  const filteredTunnels = useMemo(() => {
    const q = search.trim().toLowerCase();

    return tunnels.filter((tunnel) => {
      if (statusFilter !== "all" && tunnel.status !== statusFilter) {
        return false;
      }
      if (q && !tunnel.name.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [tunnels, search, statusFilter]);

  const ingressRules: TunnelIngressRule[] = config?.ingress ?? [];

  const handleCreateTunnel = async (name: string) => {
    try {
      await createTunnel(name);
      onToast(t("toasts.tunnelCreated"), "success");
    } catch (e) {
      onToast(e instanceof Error ? e.message : t("toasts.tunnelCreateFailed"), "error");
      throw e;
    }
  };

  const handleRenameTunnel = async (id: string, name: string) => {
    try {
      await doRename({ id, name });
      onToast(t("toasts.tunnelRenamed"), "success");
    } catch (e) {
      onToast(e instanceof Error ? e.message : t("toasts.tunnelRenameFailed"), "error");
      throw e;
    }
  };

  const handleDeleteTunnel = async (id: string) => {
    try {
      await doDelete(id);
      onToast(t("toasts.tunnelDeleted"), "success");
      if (selectedTunnel?.id === id) {
        setSelectedTunnel(null);
      }
    } catch (e) {
      onToast(e instanceof Error ? e.message : t("toasts.tunnelDeleteFailed"), "error");
      throw e;
    }
  };

  const handleSaveIngressRule = async (rule: TunnelIngressRule, index: number | null) => {
    if (!selectedTunnel) return;
    const currentRules = [...ingressRules];

    if (index !== null) {
      currentRules[index] = rule;
    } else {
      // Add right before any catch-all 404 rule or at end
      const catchAllIndex = currentRules.findIndex(
        (r) => !r.hostname && (!r.path || r.path === "/*") && r.service === "http_status:404",
      );
      if (catchAllIndex !== -1) {
        currentRules.splice(catchAllIndex, 0, rule);
      } else {
        currentRules.push(rule);
      }
    }

    try {
      await updateConfig({ id: selectedTunnel.id, ingress: currentRules });
      onToast(t("toasts.ingressSaved"), "success");
    } catch (e) {
      onToast(e instanceof Error ? e.message : t("toasts.ingressSaveFailed"), "error");
      throw e;
    }
  };

  const handleDeleteIngressRule = async (index: number) => {
    if (!selectedTunnel) return;
    const currentRules = ingressRules.filter((_, i) => i !== index);

    try {
      await updateConfig({ id: selectedTunnel.id, ingress: currentRules });
      onToast(t("toasts.ingressDeleted"), "success");
    } catch (e) {
      onToast(e instanceof Error ? e.message : t("toasts.ingressDeleteFailed"), "error");
      throw e;
    }
  };

  return (
    <div className="tunnels-view">
      <TunnelFilters
        search={search}
        onSearchChange={setSearch}
        statusFilter={statusFilter}
        onStatusChange={setStatusFilter}
        totalCount={tunnels.length}
        healthyCount={healthyCount}
        degradedCount={degradedCount}
        downCount={downCount}
        inactiveCount={inactiveCount}
        onRefresh={() => void tunnelsQuery.refetch()}
        isRefreshing={tunnelsQuery.isFetching}
        onOpenCreate={() => setCreateOpen(true)}
        locked={locked}
      />

      <TunnelsTable
        tunnels={filteredTunnels}
        loading={tunnelsQuery.isFetching && tunnels.length === 0}
        onSelectTunnel={(tunnel) => setSelectedTunnel(tunnel)}
        onOpenRename={(tunnel) => setRenameTunnel(tunnel)}
        onOpenDelete={(tunnel) => setDeleteTunnelTarget(tunnel)}
        locked={locked}
      />

      <TunnelDrawer
        tunnel={selectedTunnel}
        isOpen={Boolean(selectedTunnel)}
        onClose={() => setSelectedTunnel(null)}
        connections={connections}
        connectionsLoading={connectionsLoading}
        ingressRules={ingressRules}
        ingressLoading={configLoading}
        onOpenAddIngress={() =>
          setIngressEditorRule({ index: null, hostname: "", path: "", service: "" })
        }
        onOpenEditIngress={(rule, index) =>
          setIngressEditorRule({
            index,
            hostname: rule.hostname ?? "",
            path: rule.path ?? "",
            service: rule.service,
          })
        }
        onDeleteIngress={(index) => void handleDeleteIngressRule(index)}
        token={token}
        tokenLoading={tokenLoading}
        onOpenDelete={(tunnel) => setDeleteTunnelTarget(tunnel)}
        locked={locked}
        onToast={(msg) => onToast(msg)}
      />

      <CreateTunnelModal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={handleCreateTunnel}
        locked={locked}
      />

      <RenameTunnelModal
        tunnel={renameTunnel}
        onClose={() => setRenameTunnel(null)}
        onRename={handleRenameTunnel}
        locked={locked}
      />

      <DeleteTunnelModal
        tunnel={deleteTunnelTarget}
        onClose={() => setDeleteTunnelTarget(null)}
        onDelete={handleDeleteTunnel}
        locked={locked}
      />

      <IngressEditorModal
        rule={ingressEditorRule}
        onClose={() => setIngressEditorRule(null)}
        onSave={handleSaveIngressRule}
        locked={locked}
      />
    </div>
  );
}
