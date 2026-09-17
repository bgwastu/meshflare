import { Pencil, Trash2 } from "lucide-react";
import { StatusDot } from "../ui/Badge";
import { SkeletonBlock } from "../ui/Skeleton";
import { useLanguage } from "../../hooks/useLanguage";
import type { TunnelEntry } from "../../lib/api";

type TunnelsTableProps = {
  tunnels: TunnelEntry[];
  loading: boolean;
  onSelectTunnel: (tunnel: TunnelEntry) => void;
  onOpenRename: (tunnel: TunnelEntry) => void;
  onOpenDelete: (tunnel: TunnelEntry) => void;
  locked: boolean;
};

export function TunnelsTable({
  tunnels,
  loading,
  onSelectTunnel,
  onOpenRename,
  onOpenDelete,
  locked,
}: TunnelsTableProps) {
  const { t, formatDateTime } = useLanguage();

  if (loading) {
    return (
      <div className="table-wrap">
        <table className="inventory-table">
          <thead>
            <tr>
              <th>{t("tunnels.columns.name")}</th>
              <th>{t("tunnels.columns.status")}</th>
              <th>{t("tunnels.columns.connections")}</th>
              <th>{t("tunnels.columns.created")}</th>
              <th style={{ textAlign: "end" }}>{t("tunnels.columns.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {[1, 2, 3].map((i) => (
              <tr key={i}>
                <td><SkeletonBlock className="skeleton-cell" /></td>
                <td><SkeletonBlock className="skeleton-cell" style={{ width: 60 }} /></td>
                <td><SkeletonBlock className="skeleton-cell" style={{ width: 50 }} /></td>
                <td><SkeletonBlock className="skeleton-cell" style={{ width: 90 }} /></td>
                <td><SkeletonBlock className="skeleton-cell" style={{ width: 40 }} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (tunnels.length === 0) {
    return (
      <div className="empty-state" style={{ padding: "3rem 1rem", textAlign: "center", color: "var(--muted)" }}>
        <p>{t("tunnels.empty")}</p>
      </div>
    );
  }

  return (
    <div className="table-wrap">
      <table className="inventory-table">
        <thead>
          <tr>
            <th>{t("tunnels.columns.name")}</th>
            <th>{t("tunnels.columns.status")}</th>
            <th>{t("tunnels.columns.connections")}</th>
            <th>{t("tunnels.columns.created")}</th>
            <th style={{ textAlign: "end" }}>{t("tunnels.columns.actions")}</th>
          </tr>
        </thead>
        <tbody>
          {tunnels.map((tunnel) => (
            <tr
              key={tunnel.id}
              onClick={() => onSelectTunnel(tunnel)}
              style={{ cursor: "pointer" }}
            >
              <td className="name-cell">
                <StatusDot status={tunnel.status} />
                <span style={{ fontWeight: 600, color: "var(--text)" }}>{tunnel.name}</span>
              </td>
              <td>
                <span style={{ textTransform: "capitalize", fontSize: "0.82rem" }}>
                  {t(`status.${tunnel.status.toLowerCase()}`, { defaultValue: tunnel.status })}
                </span>
              </td>
              <td>
                <span className="badge" style={{ fontSize: "0.75rem" }}>
                  {tunnel.connections?.length ?? 0}
                </span>
              </td>
              <td style={{ color: "var(--muted)", whiteSpace: "nowrap" }}>
                {formatDateTime(tunnel.created_at)}
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
                    onClick={() => onOpenRename(tunnel)}
                    disabled={locked}
                    title={t("common.rename")}
                    aria-label={t("common.rename")}
                  >
                    <Pencil size={13} aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="icon-btn danger"
                    onClick={() => onOpenDelete(tunnel)}
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
