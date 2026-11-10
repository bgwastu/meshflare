import { CopyValue } from "../ui/CopyValue";
import { CombinedStatusBadge } from "../ui/Badge";
import { SkeletonBlock } from "../ui/Skeleton";
import { useLanguage } from "../../hooks/useLanguage";
import type { MeshEntry } from "../../lib/api";

export type SortKey = "name" | "status" | "meshHostname" | "ipv4" | "lastSeenAt" | "createdAt";

type MeshTableProps = {
  entries: MeshEntry[];
  loading: boolean;
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  onSort: (key: SortKey) => void;
  onSelectEntry: (entry: MeshEntry) => void;
  onOpenCreate: () => void;
  hasFilters: boolean;
  onClearFilters: () => void;
  onToast: (msg: string) => void;
};

const COLUMN_KEYS = ["name", "status", "meshHostname", "ipv4", "lastSeenAt"] as const;

export function MeshTable({
  entries,
  loading,
  sortKey,
  sortDir,
  onSort,
  onSelectEntry,
  onOpenCreate,
  hasFilters,
  onClearFilters,
  onToast,
}: MeshTableProps) {
  const { t, formatSeen } = useLanguage();

  const columnLabels: Record<(typeof COLUMN_KEYS)[number], string> = {
    name: t("mesh.table.name"),
    status: t("mesh.table.status"),
    meshHostname: t("mesh.table.domain"),
    ipv4: t("mesh.table.ipv4"),
    lastSeenAt: t("mesh.table.lastSeen"),
  };

  if (loading) {
    return (
      <div className="table-wrap" aria-busy="true" aria-label={t("common.loading")}>
        <table>
          <thead>
            <tr>
              {COLUMN_KEYS.map((key) => (
                <th key={key}>{columnLabels[key]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 5 }, (_, i) => (
              <tr key={i} className="skeleton-row-tr">
                {COLUMN_KEYS.map((key) => (
                  <td key={key}>
                    <SkeletonBlock className="skeleton-cell" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="empty">
        <p className="empty-title">
          {hasFilters ? t("mesh.empty") : t("mesh.emptyNoEntries")}
        </p>
        {hasFilters ? (
          <button type="button" className="btn btn-sm" onClick={onClearFilters}>
            {t("common.clearFilters")}
          </button>
        ) : (
          <button type="button" className="btn btn-primary" onClick={onOpenCreate}>
            {t("mesh.addNode")}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {COLUMN_KEYS.map((key) => (
              <th
                key={key}
                className={`sortable ${sortKey === key ? "sorted" : ""}`}
                aria-sort={sortKey === key ? (sortDir === "asc" ? "ascending" : "descending") : undefined}
                onClick={() => onSort(key)}
              >
                {columnLabels[key]}
                {sortKey === key ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr
              key={`${entry.kind}-${entry.id}`}
              className="row-clickable"
              onClick={() => onSelectEntry(entry)}
            >
              <td>
                <strong className="name-cell">
                  {entry.name}
                </strong>
              </td>
              <td>
                <CombinedStatusBadge entry={entry} />
              </td>
              <td>
                <CopyValue
                  value={entry.meshHostname}
                  onCopied={() => onToast(t("common.copied"))}
                />
              </td>
              <td>
                <CopyValue
                  value={entry.ipv4}
                  onCopied={() => onToast(t("common.copied"))}
                />
              </td>
              <td className="cell-muted">
                {formatSeen(entry.lastSeenAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
