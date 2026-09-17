import { Search, Plus, RefreshCw, Trash2 } from "lucide-react";
import { FacetChip } from "../ui/FilterChips";
import { Spinner } from "../ui/Spinner";
import { useLanguage } from "../../hooks/useLanguage";

type KindFilter = "all" | "node" | "device";
type ActivityFilter = "all" | "online" | "offline";

type MeshFiltersProps = {
  search: string;
  onSearchChange: (val: string) => void;
  kindFilter: KindFilter;
  onKindChange: (kind: KindFilter) => void;
  activityFilter: ActivityFilter;
  onActivityChange: (act: ActivityFilter) => void;
  totalCount: number;
  nodeCount: number;
  deviceCount: number;
  onlineCount: number;
  offlineCount: number;
  onSyncDns: () => void;
  isSyncingDns: boolean;
  onCleanup: () => void;
  isCleaning: boolean;
  onOpenCreate: () => void;
  locked: boolean;
};

export function MeshFilters({
  search,
  onSearchChange,
  kindFilter,
  onKindChange,
  activityFilter,
  onActivityChange,
  totalCount,
  nodeCount,
  deviceCount,
  onlineCount,
  offlineCount,
  onSyncDns,
  isSyncingDns,
  onCleanup,
  isCleaning,
  onOpenCreate,
  locked,
}: MeshFiltersProps) {
  const { t } = useLanguage();

  return (
    <div className="filters-bar" style={{ display: "flex", flexDirection: "column", gap: "0.85rem", marginBottom: "1rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
        {/* Search Input */}
        <div className="search-box" style={{ position: "relative", flex: "1 1 240px", maxWidth: 360 }}>
          <Search size={14} className="search-icon" style={{ position: "absolute", insetInlineStart: "0.65rem", top: "50%", transform: "translateY(-50%)", color: "var(--muted)", pointerEvents: "none" }} />
          <input
            type="text"
            className="input"
            style={{ width: "100%", paddingInlineStart: "2rem" }}
            placeholder={t("mesh.searchPlaceholder")}
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>

        {/* Global actions */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn"
            onClick={onSyncDns}
            disabled={isSyncingDns || locked}
            title={t("mesh.syncDns")}
          >
            {isSyncingDns ? (
              <Spinner label={t("mesh.syncingDns")} />
            ) : (
              <>
                <RefreshCw size={13} aria-hidden />
                <span>{t("mesh.syncDns")}</span>
              </>
            )}
          </button>

          <button
            type="button"
            className="btn"
            onClick={onCleanup}
            disabled={isCleaning || locked}
            title={t("mesh.cleanup")}
          >
            {isCleaning ? (
              <Spinner label={t("mesh.cleaning")} />
            ) : (
              <>
                <Trash2 size={13} aria-hidden />
                <span>{t("mesh.cleanup")}</span>
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
            <span>{t("mesh.addNode")}</span>
          </button>
        </div>
      </div>

      {/* Filter Facet Chips */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
          <FacetChip
            active={kindFilter === "all"}
            label={t("mesh.filterKind.all")}
            count={totalCount}
            onClick={() => onKindChange("all")}
          />
          <FacetChip
            active={kindFilter === "node"}
            label={t("mesh.filterKind.node")}
            count={nodeCount}
            tone="node"
            onClick={() => onKindChange("node")}
          />
          <FacetChip
            active={kindFilter === "device"}
            label={t("mesh.filterKind.device")}
            count={deviceCount}
            tone="device"
            onClick={() => onKindChange("device")}
          />
        </div>

        <div style={{ width: 1, height: 16, background: "var(--line)", margin: "0 0.25rem" }} />

        <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
          <FacetChip
            active={activityFilter === "all"}
            label={t("mesh.filterActivity.all")}
            onClick={() => onActivityChange("all")}
          />
          <FacetChip
            active={activityFilter === "online"}
            label={t("mesh.filterActivity.online")}
            count={onlineCount}
            onClick={() => onActivityChange("online")}
          />
          <FacetChip
            active={activityFilter === "offline"}
            label={t("mesh.filterActivity.offline")}
            count={offlineCount}
            onClick={() => onActivityChange("offline")}
          />
        </div>
      </div>
    </div>
  );
}
