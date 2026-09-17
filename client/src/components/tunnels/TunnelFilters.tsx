import { Search, Plus, RefreshCw } from "lucide-react";
import { FacetChip } from "../ui/FilterChips";
import { Spinner } from "../ui/Spinner";
import { useLanguage } from "../../hooks/useLanguage";

export type TunnelStatusFilter = "all" | "healthy" | "degraded" | "down" | "inactive";

type TunnelFiltersProps = {
  search: string;
  onSearchChange: (val: string) => void;
  statusFilter: TunnelStatusFilter;
  onStatusChange: (status: TunnelStatusFilter) => void;
  totalCount: number;
  healthyCount: number;
  degradedCount: number;
  downCount: number;
  inactiveCount: number;
  onRefresh: () => void;
  isRefreshing: boolean;
  onOpenCreate: () => void;
  locked: boolean;
};

export function TunnelFilters({
  search,
  onSearchChange,
  statusFilter,
  onStatusChange,
  totalCount,
  healthyCount,
  degradedCount,
  downCount,
  inactiveCount,
  onRefresh,
  isRefreshing,
  onOpenCreate,
  locked,
}: TunnelFiltersProps) {
  const { t } = useLanguage();

  return (
    <div className="filters-bar" style={{ display: "flex", flexDirection: "column", gap: "0.85rem", marginBottom: "1rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
        <div className="search-box" style={{ position: "relative", flex: "1 1 240px", maxWidth: 360 }}>
          <Search
            size={14}
            className="search-icon"
            style={{ position: "absolute", insetInlineStart: "0.65rem", top: "50%", transform: "translateY(-50%)", color: "var(--muted)", pointerEvents: "none" }}
          />
          <input
            type="text"
            className="input"
            style={{ width: "100%", paddingInlineStart: "2rem" }}
            placeholder={t("tunnels.searchPlaceholder")}
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <button
            type="button"
            className="btn"
            onClick={onRefresh}
            disabled={isRefreshing || locked}
            title={t("common.refresh")}
          >
            {isRefreshing ? (
              <Spinner label={t("common.loading")} />
            ) : (
              <>
                <RefreshCw size={13} aria-hidden />
                <span>{t("common.refresh")}</span>
              </>
            )}
          </button>

          <button
            type="button"
            className="btn btn-primary"
            onClick={onOpenCreate}
            disabled={locked}
          >
            <Plus size={14} aria-hidden />
            <span>{t("tunnels.createTunnel")}</span>
          </button>
        </div>
      </div>

      {/* Status facet chips */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", flexWrap: "wrap" }}>
        <FacetChip
          active={statusFilter === "all"}
          label={t("tunnels.filterStatus.all")}
          count={totalCount}
          onClick={() => onStatusChange("all")}
        />
        <FacetChip
          active={statusFilter === "healthy"}
          label={t("tunnels.filterStatus.healthy")}
          count={healthyCount}
          onClick={() => onStatusChange("healthy")}
        />
        <FacetChip
          active={statusFilter === "degraded"}
          label={t("tunnels.filterStatus.degraded")}
          count={degradedCount}
          onClick={() => onStatusChange("degraded")}
        />
        <FacetChip
          active={statusFilter === "down"}
          label={t("tunnels.filterStatus.down")}
          count={downCount}
          onClick={() => onStatusChange("down")}
        />
        <FacetChip
          active={statusFilter === "inactive"}
          label={t("tunnels.filterStatus.inactive")}
          count={inactiveCount}
          onClick={() => onStatusChange("inactive")}
        />
      </div>
    </div>
  );
}
