import { Globe } from "lucide-react";
import { SkeletonBlock } from "../ui/Skeleton";
import { useLanguage } from "../../hooks/useLanguage";
import { tunnelStatusLabel } from "../../i18n/status";
import { tunnelStatusMeta } from "../../lib/warp";
import type { TunnelEntry } from "../../lib/api";

type TunnelsTableProps = {
  tunnels: TunnelEntry[];
  loading: boolean;
  onSelectTunnel: (tunnel: TunnelEntry) => void;
  onOpenCreate: () => void;
  hasFilters: boolean;
  onClearFilters: () => void;
};

const COLUMN_KEYS = ["name", "status", "config", "connections", "created"] as const;

export function TunnelsTable({
  tunnels,
  loading,
  onSelectTunnel,
  onOpenCreate,
  hasFilters,
  onClearFilters,
}: TunnelsTableProps) {
  const { t, formatSeen } = useLanguage();

  const head = (
    <thead>
      <tr>
        {COLUMN_KEYS.map((key) => (
          <th key={key}>{t(`tunnels.table.${key}`)}</th>
        ))}
      </tr>
    </thead>
  );

  if (loading) {
    return (
      <div className="table-wrap" aria-busy="true" aria-label={t("common.loading")}>
        <table>
          {head}
          <tbody>
            {Array.from({ length: 3 }, (_, i) => (
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

  if (tunnels.length === 0) {
    return (
      <div className="empty">
        <p className="empty-title">
          {hasFilters ? t("tunnels.empty") : t("tunnels.emptyNoTunnels")}
        </p>
        {hasFilters ? (
          <button type="button" className="btn btn-sm" onClick={onClearFilters}>
            {t("common.clearFilters")}
          </button>
        ) : (
          <button type="button" className="btn btn-primary" onClick={onOpenCreate}>
            {t("tunnels.createTunnel")}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="table-wrap">
      <table>
        {head}
        <tbody>
          {tunnels.map((tunnel) => {
            const meta = tunnelStatusMeta(tunnel.status);
            return (
              <tr
                key={tunnel.id}
                className="row-clickable"
                onClick={() => onSelectTunnel(tunnel)}
              >
                <td>
                  <strong className="name-cell">
                    <Globe size={16} strokeWidth={2.25} aria-hidden />
                    {tunnel.name}
                  </strong>
                </td>
                <td>
                  <span className="status-pill" data-tone={meta.tone}>
                    <span
                      className="status-dot"
                      data-tone={meta.tone}
                      aria-hidden="true"
                    />
                    <span>{tunnelStatusLabel(t, tunnel.status)}</span>
                  </span>
                </td>
                <td>
                  <span className={`badge ${tunnel.config_src}`}>
                    {t(`tunnels.config.${tunnel.config_src}`)}
                  </span>
                </td>
                <td>
                  <span className="badge">
                    {t("tunnels.activeConnections", { count: tunnel.connections?.length ?? 0 })}
                  </span>
                </td>
                <td>{formatSeen(tunnel.created_at)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
