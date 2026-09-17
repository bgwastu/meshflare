import { CopyValue } from "../ui/CopyValue";
import { MachineKindStatus } from "../ui/Badge";
import { SkeletonBlock } from "../ui/Skeleton";
import { useLanguage } from "../../hooks/useLanguage";
import type { MeshEntry } from "../../lib/api";

export type SortKey = "name" | "meshHostname" | "ipv4" | "lastSeenAt";

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

  if (loading) {
    return (
      <div className="table-wrap" aria-label="Loading mesh entries">
        <table>
          <thead>
            <tr>
              {["Name", "Domain", "IPv4", "Last seen"].map((label) => (
                <th key={label}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 5 }, (_, i) => (
              <tr key={i} className="skeleton-row-tr">
                {Array.from({ length: 4 }, (_, j) => (
                  <td key={j}>
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
          {hasFilters ? t("mesh.empty") : "No mesh entries yet."}
        </p>
        {hasFilters ? (
          <button type="button" className="btn" onClick={onClearFilters}>
            {t("common.cancel")}
          </button>
        ) : (
          <button type="button" className="btn btn-primary" onClick={onOpenCreate}>
            {t("mesh.addNode")}
          </button>
        )}
      </div>
    );
  }

  const columns: [SortKey, string][] = [
    ["name", t("mesh.sort.name")],
    ["meshHostname", "Domain"],
    ["ipv4", "IPv4"],
    ["lastSeenAt", t("mesh.sort.lastSeenAt")],
  ];

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {columns.map(([key, label]) => (
              <th
                key={key}
                className={`sortable ${sortKey === key ? "sorted" : ""}`}
                onClick={() => onSort(key)}
              >
                {label}
                {sortKey === key ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr
              key={`${entry.kind}-${entry.id}`}
              style={{ cursor: "pointer" }}
              onClick={() => onSelectEntry(entry)}
            >
              <td>
                <strong className="name-cell">
                  <MachineKindStatus entry={entry} />
                  {entry.name}
                </strong>
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
              <td style={{ color: "var(--muted)", whiteSpace: "nowrap" }}>
                {formatSeen(entry.lastSeenAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
