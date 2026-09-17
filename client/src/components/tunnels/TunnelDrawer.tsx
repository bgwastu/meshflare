import { useState } from "react";
import { X, Trash2, Copy, Check } from "lucide-react";
import { Drawer } from "../ui/Drawer";
import { CopyValue } from "../ui/CopyValue";
import { StatusDot } from "../ui/Badge";
import { Spinner } from "../ui/Spinner";
import { IngressRulesTable } from "./IngressRulesTable";
import { useLanguage } from "../../hooks/useLanguage";
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
        <h3 className="drawer-title" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <StatusDot status={tunnel.status} />
          <span style={{ wordBreak: "break-all" }}>{tunnel.name}</span>
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

      <div className="tab-nav" style={{ marginBottom: "1rem", marginTop: "0.5rem" }}>
        <button
          type="button"
          className={`tab-link ${activeTab === "overview" ? "is-active" : ""}`}
          onClick={() => setActiveTab("overview")}
        >
          {t("tunnels.drawer.tabs.overview")}
        </button>
        <button
          type="button"
          className={`tab-link ${activeTab === "connections" ? "is-active" : ""}`}
          onClick={() => setActiveTab("connections")}
        >
          {t("tunnels.drawer.tabs.connections")}
          {connections.length > 0 && <span className="tab-badge">{connections.length}</span>}
        </button>
        <button
          type="button"
          className={`tab-link ${activeTab === "ingress" ? "is-active" : ""}`}
          onClick={() => setActiveTab("ingress")}
        >
          {t("tunnels.drawer.tabs.ingress")}
          {ingressRules.length > 0 && <span className="tab-badge">{ingressRules.length}</span>}
        </button>
        <button
          type="button"
          className={`tab-link ${activeTab === "setup" ? "is-active" : ""}`}
          onClick={() => setActiveTab("setup")}
        >
          {t("tunnels.drawer.tabs.setup")}
        </button>
      </div>

      {/* Overview Tab */}
      {activeTab === "overview" && (
        <div>
          <div className="property-grid" style={{ display: "grid", gap: "0.85rem", fontSize: "0.85rem" }}>
            <div>
              <span className="field-label" style={{ color: "var(--muted)", fontSize: "0.75rem" }}>
                {t("tunnels.drawer.properties.id")}
              </span>
              <div style={{ wordBreak: "break-all", fontFamily: "var(--mono)", fontSize: "0.78rem" }} dir="ltr">
                {tunnel.id}
              </div>
            </div>

            <div>
              <span className="field-label" style={{ color: "var(--muted)", fontSize: "0.75rem" }}>
                {t("tunnels.drawer.properties.status")}
              </span>
              <div style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
                <StatusDot status={tunnel.status} />
                <span style={{ textTransform: "capitalize" }}>
                  {t(`status.${tunnel.status.toLowerCase()}`, { defaultValue: tunnel.status })}
                </span>
              </div>
            </div>

            <div>
              <span className="field-label" style={{ color: "var(--muted)", fontSize: "0.75rem" }}>
                {t("tunnels.drawer.properties.created")}
              </span>
              <div>{formatDateTime(tunnel.created_at)}</div>
            </div>

            <div>
              <span className="field-label" style={{ color: "var(--muted)", fontSize: "0.75rem" }}>
                {t("tunnels.drawer.properties.connectionsCount")}
              </span>
              <div>{connections.length}</div>
            </div>

            <div>
              <span className="field-label" style={{ color: "var(--muted)", fontSize: "0.75rem" }}>
                {t("tunnels.drawer.properties.rulesCount")}
              </span>
              <div>{ingressRules.length}</div>
            </div>
          </div>

          <div style={{ marginTop: "1.75rem", paddingTop: "1rem", borderTop: "1px solid var(--line)" }}>
            <button
              type="button"
              className="btn btn-danger"
              style={{ width: "100%", justifyContent: "center" }}
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
          <h4 style={{ margin: "0 0 0.75rem", fontSize: "0.95rem" }}>
            {t("tunnels.drawer.connectionsTitle")}
          </h4>

          {connectionsLoading ? (
            <div style={{ padding: "1rem 0" }}>
              <Spinner label={t("common.loading")} />
            </div>
          ) : connections.length === 0 ? (
            <p className="hint">{t("tunnels.drawer.noConnections")}</p>
          ) : (
            <div style={{ display: "grid", gap: "0.5rem" }}>
              {connections.map((conn) => (
                <div
                  key={conn.id}
                  style={{
                    padding: "0.6rem 0.75rem",
                    background: "var(--bg0)",
                    border: "1px solid var(--line)",
                    borderRadius: "var(--radius)",
                    fontSize: "0.8rem",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.25rem" }}>
                    <span style={{ fontWeight: 700 }} className="mono" dir="ltr">
                      {conn.colo_name}
                    </span>
                    <span style={{ color: "var(--muted)", fontSize: "0.75rem" }}>
                      {formatSeen(conn.opened_at)}
                    </span>
                  </div>
                  <div style={{ color: "var(--muted)", fontSize: "0.75rem" }} className="mono" dir="ltr">
                    {conn.origin_ip} · {conn.version ?? "cloudflared"}
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
        <div>
          <h4 style={{ margin: "0 0 0.35rem", fontSize: "0.95rem" }}>
            {t("tunnels.drawer.setupTitle")}
          </h4>
          <p className="hint" style={{ marginTop: 0, marginBottom: "0.85rem" }}>
            {t("tunnels.drawer.setupDesc")}
          </p>

          {tokenLoading ? (
            <div style={{ padding: "1rem 0" }}>
              <Spinner label={t("common.loading")} />
            </div>
          ) : token ? (
            <>
              <div style={{ position: "relative", marginBottom: "1rem" }}>
                <pre className="cmd-block mono" dir="ltr" style={{ margin: 0, paddingRight: "3rem" }}>
                  {runCommand}
                </pre>
                <button
                  type="button"
                  className="icon-btn"
                  style={{ position: "absolute", top: "0.45rem", right: "0.45rem" }}
                  onClick={() => void handleCopyCmd()}
                  title={t("common.copy")}
                >
                  {copiedCmd ? <Check size={14} style={{ color: "var(--ok)" }} /> : <Copy size={14} />}
                </button>
              </div>

              <div>
                <div style={{ fontSize: "0.78rem", color: "var(--muted)", marginBottom: "0.3rem" }}>
                  {t("tunnels.drawer.tokenLabel")}
                </div>
                <CopyValue value={token} onCopied={() => onToast(t("common.copied"))} />
              </div>
            </>
          ) : null}
        </div>
      )}
    </Drawer>
  );
}
