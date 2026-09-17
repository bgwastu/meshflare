import { useState } from "react";
import { X, Trash2, Copy, Check, Info, Activity, Network, Terminal } from "lucide-react";
import { Drawer } from "../ui/Drawer";
import { CopyValue } from "../ui/CopyValue";
import { StatusDot } from "../ui/Badge";
import { Spinner } from "../ui/Spinner";
import { IngressRulesTable } from "./IngressRulesTable";
import { useLanguage } from "../../hooks/useLanguage";
import { tunnelStatusLabel } from "../../i18n/status";
import { copyText } from "../../lib/warp";
import type {
  TunnelEntry,
  TunnelConnection,
  TunnelIngressRule,
} from "../../lib/api";

type TunnelDrawerProps = {
  tunnel: TunnelEntry | null;
  isOpen: boolean;
  onClose: () => void;
  connections: TunnelConnection[];
  connectionsLoading: boolean;
  ingressRules: TunnelIngressRule[];
  ingressLoading: boolean;
  onOpenAddIngress: () => void;
  onOpenEditIngress: (rule: TunnelIngressRule, index: number) => void;
  onDeleteIngress: (index: number) => void;
  token: string | null;
  tokenLoading: boolean;
  onOpenDelete: (tunnel: TunnelEntry) => void;
  locked: boolean;
  onToast: (msg: string) => void;
};

export function TunnelDrawer({
  tunnel,
  isOpen,
  onClose,
  connections,
  connectionsLoading,
  ingressRules,
  ingressLoading,
  onOpenAddIngress,
  onOpenEditIngress,
  onDeleteIngress,
  token,
  tokenLoading,
  onOpenDelete,
  locked,
  onToast,
}: TunnelDrawerProps) {
  const { t, formatSeen, formatDateTime } = useLanguage();
  const [activeTab, setActiveTab] = useState<"overview" | "connections" | "ingress" | "setup">("overview");
  const [copiedCmd, setCopiedCmd] = useState(false);

  if (!tunnel) return null;

  const runCommand = token ? `cloudflared tunnel run --token ${token}` : "";

  const handleCopyCmd = async () => {
    if (!runCommand) return;
    try {
      await copyText(runCommand);
      setCopiedCmd(true);
      onToast(t("common.copied"));
      setTimeout(() => setCopiedCmd(false), 2000);
    } catch {
      /* handled */
    }
  };

  return (
    <Drawer isOpen={isOpen} onClose={onClose}>
      <div className="drawer-head">
        <h3 className="drawer-title">
          <StatusDot status={tunnel.status} />
          <span className="drawer-title-text">{tunnel.name}</span>
        </h3>
        <button
          type="button"
          className="icon-btn drawer-close"
          onClick={onClose}
          title={t("tunnels.drawer.close")}
          aria-label={t("tunnels.drawer.close")}
        >
          <X size={16} aria-hidden />
        </button>
      </div>

      <div className="drawer-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "overview"}
          className={`tab ${activeTab === "overview" ? "active" : ""}`}
          onClick={() => setActiveTab("overview")}
        >
          <Info size={13} strokeWidth={2.25} aria-hidden />
          <span>{t("tunnels.drawer.tabs.overview")}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "connections"}
          className={`tab ${activeTab === "connections" ? "active" : ""}`}
          onClick={() => setActiveTab("connections")}
        >
          <Activity size={13} strokeWidth={2.25} aria-hidden />
          <span>{t("tunnels.drawer.tabs.connections")}</span>
          {connections.length > 0 && <span className="tab-badge">{connections.length}</span>}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "ingress"}
          className={`tab ${activeTab === "ingress" ? "active" : ""}`}
          onClick={() => setActiveTab("ingress")}
        >
          <Network size={13} strokeWidth={2.25} aria-hidden />
          <span>{t("tunnels.drawer.tabs.ingress")}</span>
          {ingressRules.length > 0 && <span className="tab-badge">{ingressRules.length}</span>}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "setup"}
          className={`tab ${activeTab === "setup" ? "active" : ""}`}
          onClick={() => setActiveTab("setup")}
        >
          <Terminal size={13} strokeWidth={2.25} aria-hidden />
          <span>{t("tunnels.drawer.tabs.setup")}</span>
        </button>
      </div>

      {/* Overview Tab */}
      {activeTab === "overview" && (
        <div>
          <div className="property-grid">
            <div>
              <span className="field-label">
                {t("tunnels.drawer.properties.id")}
              </span>
              <div className="mono-break" dir="ltr">
                {tunnel.id}
              </div>
            </div>

            <div>
              <span className="field-label">
                {t("tunnels.drawer.properties.status")}
              </span>
              <div className="name-cell">
                <StatusDot status={tunnel.status} />
                <span>{tunnelStatusLabel(t, tunnel.status)}</span>
              </div>
            </div>

            <div>
              <span className="field-label">
                {t("tunnels.drawer.properties.created")}
              </span>
              <div>{formatDateTime(tunnel.created_at)}</div>
            </div>

            <div>
              <span className="field-label">
                {t("tunnels.drawer.properties.connectionsCount")}
              </span>
              <div>{connections.length}</div>
            </div>

            <div>
              <span className="field-label">
                {t("tunnels.drawer.properties.rulesCount")}
              </span>
              <div>{ingressRules.length}</div>
            </div>
          </div>

          <div className="drawer-danger">
            <button
              type="button"
              className="btn btn-danger btn-block"
              onClick={() => onOpenDelete(tunnel)}
              disabled={locked}
            >
              <Trash2 size={13} aria-hidden />
              <span>{t("tunnels.modals.deleteTitle")}</span>
            </button>
          </div>
        </div>
      )}

      {/* Connections Tab */}
      {activeTab === "connections" && (
        <div>
          <h4 className="drawer-section-title">
            {t("tunnels.drawer.connectionsTitle")}
          </h4>

          {connectionsLoading ? (
            <div className="drawer-loading">
              <Spinner label={t("common.loading")} />
            </div>
          ) : connections.length === 0 ? (
            <p className="hint">{t("tunnels.drawer.noConnections")}</p>
          ) : (
            <div className="drawer-list">
              {connections.map((conn) => (
                <div key={conn.id} className="drawer-list-item">
                  <div className="drawer-list-item-copy">
                    <div className="drawer-list-item-head">
                      <span className="mono drawer-list-item-name" dir="ltr">
                        {conn.colo_name}
                      </span>
                      <span className="drawer-list-item-meta">
                        {formatSeen(conn.opened_at)}
                      </span>
                    </div>
                    <div className="drawer-list-item-meta mono" dir="ltr">
                      {conn.origin_ip} · {conn.version ?? "cloudflared"}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Ingress Tab */}
      {activeTab === "ingress" && (
        <IngressRulesTable
          rules={ingressRules}
          onOpenAdd={onOpenAddIngress}
          onOpenEdit={onOpenEditIngress}
          onDelete={onDeleteIngress}
          locked={locked}
        />
      )}

      {/* Setup Tab */}
      {activeTab === "setup" && (
        <div className="connector-setup-box">
          <h4>{t("tunnels.drawer.setupTitle")}</h4>
          <p className="hint">{t("tunnels.drawer.setupDesc")}</p>

          {tokenLoading ? (
            <Spinner label={t("common.loading")} />
          ) : token ? (
            <>
              <div className="cmd-block-wrap">
                <pre className="cmd-block mono" dir="ltr">
                  {runCommand}
                </pre>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => void handleCopyCmd()}
                  title={t("common.copy")}
                  aria-label={t("common.copy")}
                >
                  {copiedCmd ? (
                    <Check size={14} style={{ color: "var(--ok)" }} aria-hidden />
                  ) : (
                    <Copy size={14} aria-hidden />
                  )}
                </button>
              </div>

              <div className="setup-token-label">{t("tunnels.drawer.tokenLabel")}</div>
              <div className="setup-token-value">
                <CopyValue value={token} onCopied={() => onToast(t("common.copied"))} />
              </div>
            </>
          ) : null}
        </div>
      )}
    </Drawer>
  );
}
