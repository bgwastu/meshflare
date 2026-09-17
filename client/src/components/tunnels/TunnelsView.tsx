import { useState, useMemo } from "react";
import { Search, RefreshCw, X, Loader2 } from "lucide-react";
import { FacetChip } from "../ui/FilterChips";
import { TunnelsTable } from "./TunnelsTable";
import { TunnelDrawer } from "./TunnelDrawer";
import { CreateTunnelModal } from "./CreateTunnelModal";
import { RenameTunnelModal } from "./RenameTunnelModal";
import { DeleteTunnelModal } from "./DeleteTunnelModal";
import { IngressEditorModal } from "./IngressEditorModal";
import { useTunnels } from "../../hooks/useTunnels";
import { useLanguage } from "../../hooks/useLanguage";
import type { TunnelEntry, TunnelIngressRule } from "../../lib/api";

type TunnelStatusFilter = "all" | "healthy" | "degraded" | "down" | "inactive";

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

  const ready = tunnelsQuery.isSuccess;

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

  const hasFilters = statusFilter !== "all" || Boolean(search.trim());

  return (
    <section className="panel" aria-busy={!ready}>
      <div className="panel-head">
        <h2>
          Tunnels{" "}
          {ready ? (
            <span className="hint">({filteredTunnels.length})</span>
          ) : (
            <Loader2 size={13} strokeWidth={2.5} className="spin count-spin" aria-hidden />
          )}
        </h2>

        <div className="filters">
          <FacetChip
            label={t("tunnels.columns.status")}
            value={statusFilter}
            options={[
              { value: "all", label: t("common.all") },
              { value: "healthy", label: t("tunnels.filterStatus.healthy") },
              { value: "degraded", label: t("tunnels.filterStatus.degraded") },
              { value: "down", label: t("tunnels.filterStatus.down") },
              { value: "inactive", label: t("tunnels.filterStatus.inactive") },
            ]}
            onChange={(val) => setStatusFilter(val as TunnelStatusFilter)}
          />

          <button
            type="button"
            className="btn btn-icon"
            disabled={locked || tunnelsQuery.isFetching}
            title={t("common.refresh")}
            aria-label={t("common.refresh")}
            onClick={() => void tunnelsQuery.refetch()}
          >
            {tunnelsQuery.isFetching ? (
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
            placeholder={t("tunnels.searchPlaceholder")}
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
          {t("tunnels.createTunnel")}
        </button>
      </div>

      {hasFilters && ready && (
        <div className="applied-filters">
          {statusFilter !== "all" && (
            <button
              type="button"
              className="filter-chip"
              onClick={() => setStatusFilter("all")}
            >
              {t("tunnels.columns.status")}: {statusFilter}
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
              setStatusFilter("all");
              setSearch("");
            }}
          >
            {t("common.cancel")}
          </button>
        </div>
      )}

      <TunnelsTable
        tunnels={filteredTunnels}
        loading={!ready}
        onSelectTunnel={(tunnel) => setSelectedTunnel(tunnel)}
        onOpenCreate={() => setCreateOpen(true)}
        hasFilters={hasFilters}
        onClearFilters={() => {
          setStatusFilter("all");
          setSearch("");
        }}
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
    </section>
  );
}
