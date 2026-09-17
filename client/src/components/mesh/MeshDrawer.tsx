import { useState } from "react";
import { X, Server, Smartphone, Plus, Trash2, Info, Route, Terminal } from "lucide-react";
import { Drawer } from "../ui/Drawer";
import { CopyValue } from "../ui/CopyValue";
import { KindBadge, StatusChip } from "../ui/Badge";
import { Spinner } from "../ui/Spinner";
import { ConnectorCommands } from "./ConnectorCommands";
import { useLanguage } from "../../hooks/useLanguage";
import type { MeshEntry, MeshRoute } from "../../lib/api";

type MeshDrawerProps = {
  entry: MeshEntry | null;
  isOpen: boolean;
  onClose: () => void;
  routes: MeshRoute[];
  routesLoading: boolean;
  onOpenAddRoute: () => void;
  onDeleteRoute: (route: MeshRoute) => Promise<void>;
  nodeToken: string | null;
  tokenLoading: boolean;
  onRegenerateToken: () => Promise<void>;
  onOpenDelete: (entry: MeshEntry) => void;
  locked: boolean;
  onToast: (msg: string) => void;
};

export function MeshDrawer({
  entry,
  isOpen,
  onClose,
  routes,
  routesLoading,
  onOpenAddRoute,
  onDeleteRoute,
  nodeToken,
  tokenLoading,
  onRegenerateToken,
  onOpenDelete,
  locked,
  onToast,
}: MeshDrawerProps) {
  const { t, formatSeen, formatDateTime } = useLanguage();
  const [activeTab, setActiveTab] = useState<"details" | "routes" | "setup">("details");
  const [deleteRouteId, setDeleteRouteId] = useState<string | null>(null);

  if (!entry) return null;

  const isNode = entry.kind === "node";

  const handleDeleteRoute = async (route: MeshRoute) => {
    const id = route.id;
    if (!id || deleteRouteId || locked) return;
    setDeleteRouteId(id);
    try {
      await onDeleteRoute(route);
    } finally {
      setDeleteRouteId(null);
    }
  };

  return (
    <Drawer isOpen={isOpen} onClose={onClose}>
      <div className="drawer-head">
        <h3 className="drawer-title">
          {isNode ? <Server size={18} aria-hidden /> : <Smartphone size={18} aria-hidden />}
          <span className="drawer-title-text">{entry.name}</span>
        </h3>
        <button
          type="button"
          className="icon-btn drawer-close"
          onClick={onClose}
          title={t("mesh.drawer.close")}
          aria-label={t("mesh.drawer.close")}
        >
          <X size={16} aria-hidden />
        </button>
      </div>

      <div className="meta">
        <KindBadge kind={entry.kind} />
        <StatusChip status={entry.status} />
      </div>

      {isNode && (
        <div className="drawer-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "details"}
            className={`tab ${activeTab === "details" ? "active" : ""}`}
            onClick={() => setActiveTab("details")}
          >
            <Info size={13} strokeWidth={2.25} aria-hidden />
            <span>{t("mesh.drawer.tabs.details")}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "routes"}
            className={`tab ${activeTab === "routes" ? "active" : ""}`}
            onClick={() => setActiveTab("routes")}
          >
            <Route size={13} strokeWidth={2.25} aria-hidden />
            <span>{t("mesh.drawer.tabs.routes")}</span>
            {routes.length > 0 && <span className="tab-badge">{routes.length}</span>}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "setup"}
            className={`tab ${activeTab === "setup" ? "active" : ""}`}
            onClick={() => setActiveTab("setup")}
          >
            <Terminal size={13} strokeWidth={2.25} aria-hidden />
            <span>{t("mesh.drawer.tabs.setup")}</span>
          </button>
        </div>
      )}

      {/* Details Tab */}
      {(!isNode || activeTab === "details") && (
        <div>
          <div className="property-grid">
            <div>
              <span className="field-label">
                {t("mesh.drawer.properties.meshHostname")}
              </span>
              <div>
                <CopyValue value={entry.meshHostname} onCopied={() => onToast(t("common.copied"))} />
              </div>
            </div>

            <div>
              <span className="field-label">
                {t("mesh.drawer.properties.ipv4")}
              </span>
              <div>
                <CopyValue value={entry.ipv4} onCopied={() => onToast(t("common.copied"))} />
              </div>
            </div>

            {entry.ipv6 && (
              <div>
                <span className="field-label">
                  {t("mesh.drawer.properties.ipv6")}
                </span>
                <div>
                  <CopyValue value={entry.ipv6} onCopied={() => onToast(t("common.copied"))} />
                </div>
              </div>
            )}

            <div>
              <span className="field-label">
                {t("mesh.drawer.properties.lastSeen")}
              </span>
              <div>{formatSeen(entry.lastSeenAt)}</div>
            </div>

            <div>
              <span className="field-label">
                {t("mesh.drawer.properties.created")}
              </span>
              <div>{formatDateTime(entry.createdAt)}</div>
            </div>

            {entry.deviceId && (
              <div>
                <span className="field-label">
                  {t("mesh.drawer.properties.deviceId")}
                </span>
                <div>
                  <CopyValue value={entry.deviceId} onCopied={() => onToast(t("common.copied"))} />
                </div>
              </div>
            )}

            <div>
              <span className="field-label">
                {t("mesh.drawer.properties.id")}
              </span>
              <div className="mono-break" dir="ltr">
                {entry.id}
              </div>
            </div>
          </div>

          <div className="drawer-danger">
            <button
              type="button"
              className="btn btn-danger btn-block"
              onClick={() => onOpenDelete(entry)}
              disabled={locked}
            >
              <Trash2 size={13} aria-hidden />
              <span>
                {isNode ? t("mesh.modals.deleteTitleNode") : t("mesh.modals.deleteTitleDevice")}
              </span>
            </button>
          </div>
        </div>
      )}

      {/* Routes Tab */}
      {isNode && activeTab === "routes" && (
        <div>
          <div className="drawer-section-head">
            <h4>{t("mesh.drawer.routesTitle")}</h4>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={onOpenAddRoute}
              disabled={locked}
            >
              <Plus size={12} aria-hidden />
              <span>{t("mesh.drawer.addRoute")}</span>
            </button>
          </div>

          {routesLoading ? (
            <div className="drawer-loading">
              <Spinner label={t("common.loading")} />
            </div>
          ) : routes.length === 0 ? (
            <p className="hint">{t("mesh.drawer.noRoutes")}</p>
          ) : (
            <div className="drawer-list">
              {routes.map((r, i) => {
                const target = r.network || r.hostname || "—";
                const isDeleting = deleteRouteId === r.id;
                return (
                  <div
                    key={r.id ?? i}
                    className="drawer-list-item"
                  >
                    <div className="drawer-list-item-copy">
                      <span className="mono drawer-list-item-name" dir="ltr">{target}</span>
                      {r.comment && (
                        <div className="drawer-list-item-meta">
                          {r.comment}
                        </div>
                      )}
                    </div>
                    {r.id && (
                      <button
                        type="button"
                        className="icon-btn danger"
                        onClick={() => void handleDeleteRoute(r)}
                        disabled={isDeleting || locked}
                        title={t("mesh.drawer.deleteRouteConfirm")}
                      >
                        {isDeleting ? <Spinner label="" /> : <Trash2 size={13} />}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Setup Tab */}
      {isNode && activeTab === "setup" && (
        <ConnectorCommands
          token={nodeToken}
          loading={tokenLoading}
          onRegenerate={onRegenerateToken}
          locked={locked}
          onCopied={onToast}
        />
      )}
    </Drawer>
  );
}
