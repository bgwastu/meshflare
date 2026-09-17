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

export function TunnelsTable({
  tunnels,
  loading,
  onSelectTunnel,
  onOpenCreate,
  hasFilters,
  onClearFilters,
}: TunnelsTableProps) {
  const { t, formatSeen } = useLanguage();

  if (loading) {
    return (
      <div className="table-wrap" aria-label="Loading tunnels">
        <table>
          <thead>
            <tr>
              {["Name", "Status", "Config", "Connections", "Created"].map((label) => (
                <th key={label}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 3 }, (_, i) => (
              <tr key={i} className="skeleton-row-tr">
                {Array.from({ length: 5 }, (_, j) => (
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

  if (tunnels.length === 0) {
    return (
      <div className="empty">
        <p className="empty-title">
          {hasFilters ? t("tunnels.empty") : "No tunnels yet."}
        </p>
        {hasFilters ? (
          <button type="button" className="btn" onClick={onClearFilters}>
            {t("common.cancel")}
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
        <thead>
          <tr>
            <th>Name</th>
            <th>Status</th>
            <th>Config</th>
            <th>Connections</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
          {tunnels.map((tunnel) => {
            const meta = tunnelStatusMeta(tunnel.status);
            return (
              <tr
                key={tunnel.id}
                style={{ cursor: "pointer" }}
                onClick={() => onSelectTunnel(tunnel)}
              >
                <td>
                  <strong className="name-cell">
                    <Globe size={16} strokeWidth={2.25} aria-hidden style={{ flexShrink: 0 }} />
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
                    {tunnel.config_src === "cloudflare" ? "Cloudflare" : "Local"}
                  </span>
                </td>
                <td>
                  <span className="badge">
                    {tunnel.connections?.length ?? 0} active
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
