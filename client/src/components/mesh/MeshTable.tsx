import { Pencil, Trash2, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { CopyValue } from "../ui/CopyValue";
import { KindBadge, MachineKindStatus } from "../ui/Badge";
import { SkeletonBlock } from "../ui/Skeleton";
import { useLanguage } from "../../hooks/useLanguage";
import type { MeshEntry } from "../../lib/api";

export type SortKey =
  | "name"
  | "kind"
  | "meshHostname"
  | "ipv4"
  | "lastSeenAt"
  | "status"
  | "createdAt";

type MeshTableProps = {
  entries: MeshEntry[];
  loading: boolean;
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  onSort: (key: SortKey) => void;
  onSelectEntry: (entry: MeshEntry) => void;
  onOpenRename: (entry: MeshEntry) => void;
  onOpenDelete: (entry: MeshEntry) => void;
  locked: boolean;
  onToast: (msg: string) => void;
};

export function MeshTable({
  entries,
  loading,
  sortKey,
  sortDir,
  onSort,
  onSelectEntry,
  onOpenRename,
  onOpenDelete,
  locked,
  onToast,
}: MeshTableProps) {
  const { t, formatSeen } = useLanguage();

  const renderSortIcon = (key: SortKey) => {
    if (sortKey !== key) {
      return <ArrowUpDown size={11} style={{ opacity: 0.3 }} aria-hidden />;
    }
    return sortDir === "asc" ? (
      <ArrowUp size={11} style={{ color: "var(--accent)" }} aria-hidden />
    ) : (
      <ArrowDown size={11} style={{ color: "var(--accent)" }} aria-hidden />
    );
  };

  if (loading) {
    return (
      <div className="table-wrap">
        <table className="inventory-table">
          <thead>
            <tr>
              <th>{t("mesh.columns.machine")}</th>
              <th>{t("mesh.columns.kind")}</th>
              <th>{t("mesh.columns.meshDns")}</th>
              <th>{t("mesh.columns.ipv4")}</th>
              <th>{t("mesh.columns.lastSeen")}</th>
              <th>{t("mesh.columns.status")}</th>
              <th style={{ textAlign: "end" }}>{t("mesh.columns.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {[1, 2, 3, 4, 5].map((i) => (
              <tr key={i}>
                <td><SkeletonBlock className="skeleton-cell" /></td>
                <td><SkeletonBlock className="skeleton-cell" style={{ width: 45 }} /></td>
                <td><SkeletonBlock className="skeleton-cell" style={{ width: 120 }} /></td>
                <td><SkeletonBlock className="skeleton-cell" style={{ width: 90 }} /></td>
                <td><SkeletonBlock className="skeleton-cell" style={{ width: 60 }} /></td>
                <td><SkeletonBlock className="skeleton-cell" style={{ width: 60 }} /></td>
                <td><SkeletonBlock className="skeleton-cell" style={{ width: 40 }} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="empty-state" style={{ padding: "3rem 1rem", textAlign: "center", color: "var(--muted)" }}>
        <p>{t("mesh.empty")}</p>
      </div>
    );
  }

  return (
    <div className="table-wrap">
      <table className="inventory-table">
        <thead>
          <tr>
            <th onClick={() => onSort("name")} style={{ cursor: "pointer" }}>
              <div style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                <span>{t("mesh.columns.machine")}</span>
                {renderSortIcon("name")}
              </div>
            </th>
            <th onClick={() => onSort("kind")} style={{ cursor: "pointer" }}>
              <div style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                <span>{t("mesh.columns.kind")}</span>
                {renderSortIcon("kind")}
              </div>
            </th>
            <th onClick={() => onSort("meshHostname")} style={{ cursor: "pointer" }}>
              <div style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                <span>{t("mesh.columns.meshDns")}</span>
                {renderSortIcon("meshHostname")}
              </div>
            </th>
            <th onClick={() => onSort("ipv4")} style={{ cursor: "pointer" }}>
              <div style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                <span>{t("mesh.columns.ipv4")}</span>
                {renderSortIcon("ipv4")}
              </div>
            </th>
            <th onClick={() => onSort("lastSeenAt")} style={{ cursor: "pointer" }}>
              <div style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                <span>{t("mesh.columns.lastSeen")}</span>
                {renderSortIcon("lastSeenAt")}
              </div>
            </th>
            <th onClick={() => onSort("status")} style={{ cursor: "pointer" }}>
              <div style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                <span>{t("mesh.columns.status")}</span>
                {renderSortIcon("status")}
              </div>
            </th>
            <th style={{ textAlign: "end" }}>{t("mesh.columns.actions")}</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr
              key={entry.id}
              onClick={() => onSelectEntry(entry)}
              style={{ cursor: "pointer" }}
            >
              <td className="name-cell">
                <span style={{ fontWeight: 600, color: "var(--text)" }}>{entry.name}</span>
              </td>
              <td>
                <KindBadge kind={entry.kind} />
              </td>
              <td className="host-cell">
                <CopyValue
                  value={entry.meshHostname}
                  onCopied={() => onToast(t("common.copied"))}
                />
              </td>
              <td className="ip-cell">
                <CopyValue
                  value={entry.ipv4}
                  onCopied={() => onToast(t("common.copied"))}
                />
              </td>
              <td style={{ color: "var(--muted)", whiteSpace: "nowrap" }}>
                {formatSeen(entry.lastSeenAt)}
              </td>
              <td>
                <MachineKindStatus entry={entry} />
              </td>
              <td style={{ textAlign: "end" }}>
                <div
                  className="row-actions"
                  style={{ justifyContent: "flex-end" }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => onOpenRename(entry)}
                    disabled={locked}
                    title={t("common.rename")}
                    aria-label={t("common.rename")}
                  >
                    <Pencil size={13} aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="icon-btn danger"
                    onClick={() => onOpenDelete(entry)}
                    disabled={locked}
                    title={t("common.delete")}
                    aria-label={t("common.delete")}
                  >
                    <Trash2 size={13} aria-hidden />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
