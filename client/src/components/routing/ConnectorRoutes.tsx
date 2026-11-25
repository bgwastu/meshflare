import { useState } from "react";
import { Link } from "react-router";
import { Plus, Trash2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Spinner } from "../ui/Spinner";
import { AddRoutesModal } from "./RoutingModals";
import { useRouting } from "../../hooks/useRouting";
import { useLanguage } from "../../hooks/useLanguage";
import { api, type RoutingRoute } from "../../lib/api";

/** Routes pointing at one tunnel, for its drawer. Edits go through the shared routing hook. */
export function ConnectorRoutes({
  connectorId,
  connectorName,
  locked,
  onToast,
}: {
  connectorId: string;
  connectorName: string;
  locked: boolean;
  onToast: (msg: string, tone?: "success" | "error" | "warn") => void;
}) {
  const { t } = useLanguage();
  const { createRoutes, deleteRoute } = useRouting();
  const [adding, setAdding] = useState(false);
  const [armed, setArmed] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const routesQuery = useQuery({
    queryKey: ["tunnel-routes", connectorId],
    queryFn: () => api.listTunnelRoutes(connectorId),
  });
  const routes = routesQuery.data?.routes ?? [];

  const remove = async (route: RoutingRoute) => {
    if (armed !== route.id) {
      setArmed(route.id);
      window.setTimeout(() => setArmed((cur) => (cur === route.id ? null : cur)), 3000);
      return;
    }
    setArmed(null);
    setDeleting(route.id);
    try {
      await deleteRoute(route);
      onToast(t("routing.removed"), "success");
    } catch (e) {
      onToast(e instanceof Error ? e.message : t("toasts.settingsSaveFailed"), "error");
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div>
      <div className="drawer-section-head">
        <h4>{t("routing.tunnel.routesTitle")}</h4>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => setAdding(true)}
          disabled={locked}
        >
          <Plus size={12} aria-hidden />
          <span>{t("routing.routes.add")}</span>
        </button>
      </div>
      <p className="hint drawer-hint">
        {t("routing.tunnel.routesHint")} <Link to="/routing">{t("settings.splitTunnels.movedLink")}</Link>
      </p>

      {routesQuery.isPending ? (
        <div className="drawer-loading">
          <Spinner label={t("common.loading")} />
        </div>
      ) : routesQuery.isError ? (
        <p className="hint hint-error">{routesQuery.error.message}</p>
      ) : routes.length === 0 ? (
        <p className="hint">{t("routing.tunnel.noRoutes")}</p>
      ) : (
        <div className="drawer-list">
          {routes.map((r) => (
            <div key={r.id} className="drawer-list-item">
              <div className="drawer-list-item-copy">
                <span className="mono drawer-list-item-name" dir="ltr">{r.value}</span>
                {r.comment && <div className="drawer-list-item-meta">{r.comment}</div>}
              </div>
              {deleting === r.id ? (
                <Spinner label="" />
              ) : armed === r.id ? (
                <button type="button" className="btn btn-sm btn-danger" onClick={() => void remove(r)} autoFocus>
                  {t("routing.confirmDelete")}
                </button>
              ) : (
                <button
                  type="button"
                  className="icon-btn danger"
                  onClick={() => void remove(r)}
                  disabled={locked}
                  title={t("common.delete")}
                  aria-label={`${t("common.delete")}: ${r.value}`}
                >
                  <Trash2 size={13} aria-hidden />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <AddRoutesModal
        isOpen={adding}
        connectors={[{ id: connectorId, name: connectorName, kind: "tunnel", status: "healthy" }]}
        fixedConnectorId={connectorId}
        onClose={() => setAdding(false)}
        onSubmit={async (v) => {
          try {
            const res = await createRoutes(v);
            onToast(
              res.failed.length
                ? t("routing.routes.partial", {
                    created: res.created,
                    failed: res.failed.map((f) => `${f.value}: ${f.error}`).join("; "),
                  })
                : t("routing.routes.created", { count: res.created }),
              res.failed.length ? "warn" : "success",
            );
            return true;
          } catch (e) {
            onToast(e instanceof Error ? e.message : t("toasts.settingsSaveFailed"), "error");
            return false;
          }
        }}
      />
    </div>
  );
}
