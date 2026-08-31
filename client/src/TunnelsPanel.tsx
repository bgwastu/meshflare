import { useState, useEffect, useMemo, useTransition } from "react";
import {
  Globe,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import {
  api,
  type TunnelEntry,
  type TunnelConnection,
  type TunnelIngressRule,
} from "./lib/api";
import { copyText, tunnelStatusMeta } from "./lib/warp";
import { ToastStack, useToasts } from "./lib/toasts";
import { CopyValue, formatSeen, Spinner, SkeletonBlock } from "./lib/ui";
import { FacetChip } from "./lib/FilterChips";

type Busy = null | "refresh" | "create" | "delete" | "config" | "token";
type StatusFilter = "all" | "healthy" | "degraded" | "down" | "inactive";

function StatusDot({ status }: { status: string }) {
  const meta = tunnelStatusMeta(status);
  return (
    <span
      className="status-dot"
      style={{ position: "relative", top: 1 }}
      data-tone={meta.tone}
      data-tip={meta.label}
      tabIndex={0}
      aria-label={meta.label}
    />
  );
}

type TunnelsPanelProps = {
  demo?: boolean;
  locked: boolean;
};

export function TunnelsPanel({ demo, locked: parentLocked }: TunnelsPanelProps) {
  const { toasts, push, dismiss } = useToasts();
  const [, startTransition] = useTransition();
  const [tunnels, setTunnels] = useState<TunnelEntry[]>([]);
  const [search, setSearch] = useState("");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [selected, setSelected] = useState<TunnelEntry | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [renameValue, setRenameValue] = useState("");
  const [creating, setCreating] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [tokenLoading, setTokenLoading] = useState(false);
  const [config, setConfig] = useState<{ ingress: TunnelIngressRule[] } | null>(null);
  const [configLoading, setConfigLoading] = useState(false);
  const [configBusy, setConfigBusy] = useState(false);
  const [connections, setConnections] = useState<TunnelConnection[]>([]);
  const [connectionsLoading, setConnectionsLoading] = useState(false);
  const [ingressEditor, setIngressEditor] = useState<{
    index: number | null;
    hostname: string;
    path: string;
    service: string;
  } | null>(null);

  const q = search.trim().toLowerCase();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const filteredTunnels = useMemo(() => {
    const status = statusFilter === "all" ? null : statusFilter;
    return tunnels.filter(
      (t) =>
        (status === null || t.status === status) &&
        (!q ||
          t.name.toLowerCase().includes(q) ||
          t.id.toLowerCase().includes(q) ||
          t.status.toLowerCase().includes(q) ||
          t.config_src.toLowerCase().includes(q)),
    );
  }, [tunnels, q, statusFilter]);

  const locked = parentLocked || busy !== null || creating || Boolean(demo);

  async function refresh() {
    const r = await api.listTunnels();
    setTunnels(r.tunnels);
    setReady(true);
    return r.tunnels;
  }

  useEffect(() => {
    startTransition(() => {
      void refresh().catch((e: unknown) => {
        setReady(true);
        push(e instanceof Error ? e.message : String(e), "error");
      });
    });
  }, []);

  useEffect(() => {
    if (!selected) { setConnections([]); setConnectionsLoading(false); return; }
    let cancelled = false;
    setConnectionsLoading(true);
    void api.getTunnelConnections(selected.id)
      .then((conns) => { if (!cancelled) setConnections(conns); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setConnectionsLoading(false); });
    return () => { cancelled = true; };
  }, [selected?.id]);

  useEffect(() => {
    if (!selected) { setConfig(null); setConfigLoading(false); return; }
    let cancelled = false;
    setConfigLoading(true);
    void api.getTunnelConfig(selected.id)
      .then((c) => { if (!cancelled) setConfig(c.config ?? { ingress: [] }); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setConfigLoading(false); });
    return () => { cancelled = true; };
  }, [selected?.id]);

  useEffect(() => {
    if (!selected) { setToken(null); setTokenLoading(false); return; }
    let cancelled = false;
    setTokenLoading(true);
    void api.getTunnelToken(selected.id)
      .then((r) => { if (!cancelled) setToken(r.token); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setTokenLoading(false); });
    return () => { cancelled = true; };
  }, [selected?.id]);

  async function run<T = void>(key: Busy, action: () => Promise<T>): Promise<T | null> {
    setBusy(key);
    try {
      const result = await action();
      await refresh();
      return result;
    } catch (e) {
      push(e instanceof Error ? e.message : String(e), "error");
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function createTunnel() {
    const name = newName.trim();
    if (!name || creating) return;
    setCreating(true);
    try {
      const r = await api.createTunnel(name);
      setNewName("");
      setCreateOpen(false);
      await refresh();
      push(`Created tunnel "${r.tunnel.name}".`, "success");
    } catch (e) {
      push(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setCreating(false);
    }
  }

  function openTunnel(t: TunnelEntry) {
    setSelected(t);
    setRenameValue(t.name);
    requestAnimationFrame(() => setDrawerOpen(true));
  }

  function closeDrawer() {
    setDrawerOpen(false);
  }

  function onDrawerTransitionEnd(e: React.TransitionEvent<HTMLDivElement>) {
    if (e.propertyName !== "opacity" || drawerOpen) return;
    setSelected(null);
  }

  async function saveIngressWith(ingress: TunnelIngressRule[]) {
    if (!selected || configBusy) return;
    const clean = ingress.filter((r) => r.service.trim());
    if (clean.length === 0 || !clean[clean.length - 1].service.startsWith("http_status:")) {
      clean.push({ service: "http_status:404" });
    }
    setConfigBusy(true);
    try {
      await api.setTunnelConfig(selected.id, { config: { ingress: clean } });
      setConfig({ ingress: clean });
      push("Tunnel config updated.", "success");
    } catch (e) {
      push(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setConfigBusy(false);
    }
  }

  const ingressList = config?.ingress ?? [];

  return (
    <>
      <div className="panel-head">
        <h2>
          Tunnels{" "}
          {ready ? (
            <span className="hint">({filteredTunnels.length})</span>
          ) : (
            <Loader2 size={13} strokeWidth={2.5} className="spin count-spin" aria-hidden />
          )}
        </h2>
        <div className="filters">
          <button
            type="button"
            className="btn btn-icon"
            disabled={locked}
            title="Refresh"
            aria-label="Refresh"
            onClick={() => void run("refresh", refresh)}
          >
            {busy === "refresh" ? (
              <Loader2 size={15} strokeWidth={2.25} className="spin" aria-hidden />
            ) : (
              <RefreshCw size={15} strokeWidth={2.25} aria-hidden />
            )}
          </button>
        </div>
      </div>

      <div className="mesh-toolbar">
        <div className="search-wrap">
          <Search size={15} strokeWidth={2.25} aria-hidden />
          <input
            type="search"
            placeholder="Search tunnels…"
            value={search}
            disabled={!ready}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button
          className="btn btn-primary"
          disabled={!ready || creating || Boolean(demo)}
          onClick={() => setCreateOpen(true)}
        >
          Create tunnel
        </button>
      </div>

      <div className="filters">
        <FacetChip
          label="Status"
          value={statusFilter}
          options={[
            { value: "all", label: "All" },
            { value: "healthy", label: "Healthy" },
            { value: "degraded", label: "Degraded" },
            { value: "down", label: "Down" },
            { value: "inactive", label: "Inactive" },
          ]}
          onChange={(value) => setStatusFilter(value as StatusFilter)}
        />
      </div>

      {(statusFilter !== "all" || q) && ready && (
        <div className="applied-filters">
          {statusFilter !== "all" && (
            <button
              type="button"
              className="filter-chip"
              aria-label={`Remove filter Status: ${statusFilter}`}
              onClick={() => setStatusFilter("all")}
            >
              Status: {statusFilter[0].toUpperCase() + statusFilter.slice(1)}
              <X size={12} strokeWidth={2.5} aria-hidden />
            </button>
          )}
          {q && (
            <button
              type="button"
              className="filter-chip"
              aria-label="Remove search"
              onClick={() => setSearch("")}
            >
              Search: “{search.trim()}”
              <X size={12} strokeWidth={2.5} aria-hidden />
            </button>
          )}
          <button
            type="button"
            className="btn filter-clear-all"
            onClick={() => {
              setStatusFilter("all");
              setSearch("");
            }}
          >
            Clear all
          </button>
        </div>
      )}

      {!ready ? (
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
                    <td key={j}><div className="skeleton skeleton-cell" aria-hidden /></td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : filteredTunnels.length === 0 ? (
        <div className="empty">
          <p className="empty-title">
            {q || statusFilter !== "all"
              ? "No tunnels match your filters."
              : "No tunnels yet."}
          </p>
          {q || statusFilter !== "all" ? (
            <button
              type="button"
              className="btn"
              onClick={() => {
                setStatusFilter("all");
                setSearch("");
              }}
            >
              Clear all filters
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              disabled={Boolean(demo)}
              onClick={() => setCreateOpen(true)}
            >
              Create tunnel
            </button>
          )}
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {["Name", "Status", "Config", "Connections", "Created"].map((label) => (
                  <th key={label}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredTunnels.map((t) => {
                const meta = tunnelStatusMeta(t.status);
                return (
                  <tr
                    key={t.id}
                    style={{ cursor: "pointer" }}
                    onClick={() => openTunnel(t)}
                  >
                    <td>
                      <strong className="name-cell">
                        <Globe size={16} strokeWidth={2.25} aria-hidden style={{ flexShrink: 0 }} />
                        {t.name}
                      </strong>
                    </td>
                    <td>
                      <span className="status-label">
                        <StatusDot status={t.status} />
                        {meta.label}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${t.config_src}`}>
                        {t.config_src === "cloudflare" ? "Remote" : "Local"}
                      </span>
                    </td>
                    <td>
                      {t.connections.length > 0
                        ? `${t.connections.length} (${t.connections[0].colo_name})`
                        : "—"}
                    </td>
                    <td>{formatSeen(t.created_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {createOpen && (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => !creating && setCreateOpen(false)}
        >
          <form
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-tunnel-title"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              void createTunnel();
            }}
          >
            <h3 id="create-tunnel-title">Create tunnel</h3>
            <div className="field">
              <label htmlFor="new-tunnel">Tunnel name</label>
              <input
                id="new-tunnel"
                type="text"
                value={newName}
                placeholder="New tunnel name"
                disabled={creating || Boolean(demo)}
                autoFocus={!demo}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>
            {demo && (
              <p className="hint">Demo is read-only. Deploy your own instance to create tunnels.</p>
            )}
            <div className="row-actions modal-actions">
              <button type="button" className="btn" disabled={creating} onClick={() => setCreateOpen(false)}>
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={creating || Boolean(demo) || !newName.trim()}
              >
                {creating ? <Spinner label="Creating…" /> : "Create tunnel"}
              </button>
            </div>
          </form>
        </div>
      )}

      {selected && (
        <div
          className={`drawer-backdrop${drawerOpen ? " is-open" : ""}`}
          onClick={closeDrawer}
          onTransitionEnd={onDrawerTransitionEnd}
        >
          <aside className="drawer" onClick={(ev) => ev.stopPropagation()}>
            <div className="drawer-head">
              <h3 className="drawer-title">
                <Globe size={18} strokeWidth={2.25} aria-hidden />
                {selected.name}
              </h3>
              <button
                type="button"
                className="btn btn-icon drawer-close"
                title="Close"
                aria-label="Close"
                disabled={locked}
                onClick={closeDrawer}
              >
                <X size={16} strokeWidth={2.25} aria-hidden />
              </button>
            </div>
            <div className="meta">
              <span className="mono">{selected.id}</span>
              <span className={`badge ${selected.config_src}`}>
                {selected.config_src === "cloudflare" ? "Managed remotely (Cloudflare)" : "Managed locally (YAML)"}
              </span>
            </div>

            <div className="field">
              <label htmlFor="tunnel-rename">Name</label>
              <input
                id="tunnel-rename"
                type="text"
                value={renameValue}
                disabled={locked}
                onChange={(e) => setRenameValue(e.target.value)}
              />
            </div>
            <div className="row-actions" style={{ marginBottom: "1rem" }}>
              <button
                className="btn btn-primary"
                disabled={locked || !renameValue.trim() || renameValue.trim() === selected.name}
                onClick={() =>
                  void run("config", async () => {
                    const updated = await api.updateTunnel(selected.id, { name: renameValue.trim() });
                    setSelected(updated);
                    setRenameValue(updated.name);
                    push(`Renamed to "${updated.name}".`, "success");
                  })
                }
              >
                {busy === "config" ? <Spinner label="Saving…" /> : "Save name"}
              </button>
            </div>

            <div className="field">
              <label>Status</label>
              <span className="status-label" style={{ fontSize: "0.9rem" }}>
                <StatusDot status={selected.status} />
                {tunnelStatusMeta(selected.status).label}
              </span>
            </div>
            <div className="field" style={{ marginBottom: "0.25rem" }}>
              <label>Token</label>
              {tokenLoading ? (
                <SkeletonBlock className="skeleton-token" />
              ) : token ? (
                <button
                  type="button"
                  className="copy-chip mono"
                  style={{ fontSize: "0.78rem", wordBreak: "break-all", textAlign: "left" }}
                  onClick={() => { void copyText(token); push("Token copied.", "success"); }}
                  title="Click to copy"
                >
                  {token}
                </button>
              ) : (
                <span className="mono muted" style={{ fontSize: "0.8rem" }}>—</span>
              )}
              <p className="hint">Run: <code>cloudflared tunnel run --token &lt;token&gt;</code></p>
            </div>

            {/* Connections */}
            <div className="route-box">
              <div className="route-heading">
                <div>
                  <strong>Connections</strong>
                  <p className="hint">Active cloudflared instances connected to this tunnel.</p>
                </div>
              </div>
              {connectionsLoading ? (
                <div className="route-list" aria-label="Loading connections">
                  {Array.from({ length: 2 }, (_, index) => (
                    <div className="route-row" key={index}>
                      <div className="skeleton-stack">
                        <SkeletonBlock className="skeleton-route-primary" />
                        <SkeletonBlock className="skeleton-route-secondary" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : connections.length === 0 ? (
                <p className="hint">No active connections.</p>
              ) : (
                <div className="route-list">
                  {connections.map((conn) => (
                    <div className="route-row" key={conn.id ?? conn.uuid}>
                      <div>
                        <span className="mono">{conn.colo_name}</span>
                        <span className="hint">
                          {conn.origin_ip} · {conn.version ?? "—"} · opened {formatSeen(conn.opened_at)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Ingress rules */}
            <div className="route-box">
              <div className="route-heading">
                <div>
                  <strong>Ingress rules</strong>
                  <p className="hint">Public hostname → local service mappings.</p>
                </div>
              </div>
              {selected.config_src === "local" && (
                <p className="hint" style={{ color: "var(--warn)", marginBottom: "0.5rem" }}>
                  Tunnel is locally managed — ingress rules are read-only. Set <code>config_src</code> to <code>cloudflare</code> to edit via UI.
                </p>
              )}
              {configLoading ? (
                <div className="route-list" aria-label="Loading ingress rules">
                  {Array.from({ length: 2 }, (_, index) => (
                    <div className="route-row" key={index}>
                      <div className="skeleton-stack">
                        <SkeletonBlock className="skeleton-route-primary" />
                        <SkeletonBlock className="skeleton-route-secondary" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : ingressList.length === 0 || (ingressList.length === 1 && ingressList[0].service === "http_status:404") ? (
                <p className="hint">No ingress rules configured.</p>
              ) : (
                <div className="route-list">
                  {ingressList.map((rule, idx) => (
                    <div className="route-row" key={idx}>
                      <div>
                        {rule.hostname ? (
                          <>
                            <span className="mono">
                              {rule.hostname}{rule.path ?? ""} → {rule.service}
                            </span>
                            <span className="hint">Public hostname</span>
                          </>
                        ) : (
                          <>
                            <span className="mono">{rule.service}</span>
                            <span className="hint">Default (catch-all)</span>
                          </>
                        )}
                      </div>
                      {selected.config_src !== "local" && (
                      <div className="row-actions split-item-actions">
                        <button
                          type="button"
                          className="btn btn-icon"
                          title="Edit"
                          aria-label={`Edit rule ${idx}`}
                          disabled={locked || configBusy || Boolean(demo)}
                          onClick={() =>
                            setIngressEditor({
                              index: idx,
                              hostname: rule.hostname ?? "",
                              path: rule.path ?? "",
                              service: rule.service,
                            })
                          }
                        >
                          <Pencil size={14} strokeWidth={2.25} aria-hidden />
                        </button>
                        <button
                          type="button"
                          className="btn btn-icon btn-danger"
                          title="Remove"
                          aria-label={`Remove rule ${idx}`}
                          disabled={locked || configBusy || Boolean(demo)}
                          onClick={() => {
                            const updated = ingressList.filter((_, i) => i !== idx);
                            if (updated.length === 0 || !updated[updated.length - 1].service.startsWith("http_status:")) {
                              updated.push({ service: "http_status:404" });
                            }
                            setConfig({ ingress: updated });
                            void saveIngressWith(updated);
                          }}
                        >
                          <Trash2 size={14} strokeWidth={2.25} aria-hidden />
                        </button>
                      </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {selected.config_src !== "local" && (
              <button
                type="button"
                className="btn btn-primary route-add-button"
                disabled={locked || configBusy || configLoading || Boolean(demo)}
                onClick={() =>
                  setIngressEditor({ index: null, hostname: "", path: "", service: "" })
                }
              >
                <Plus size={14} strokeWidth={2.25} aria-hidden />
                Add rule
              </button>
              )}
            </div>

            {ingressEditor && (
              <div
                className="modal-backdrop"
                role="presentation"
                onClick={() => !configBusy && setIngressEditor(null)}
              >
                <form
                  className="modal"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="ingress-editor-title"
                  onClick={(e) => e.stopPropagation()}
                  onSubmit={(e) => {
                    e.preventDefault();
                    const service = ingressEditor.service.trim();
                    if (!service || configBusy) return;
                    const rule: TunnelIngressRule = { service };
                    if (ingressEditor.hostname.trim()) rule.hostname = ingressEditor.hostname.trim();
                    if (ingressEditor.path.trim()) rule.path = ingressEditor.path.trim();
                    const current = [...ingressList];
                    if (ingressEditor.index === null) {
                      current.splice(current.length - 1, 0, rule);
                    } else {
                      current[ingressEditor.index] = rule;
                    }
                    setIngressEditor(null);
                    void saveIngressWith(current);
                  }}
                >
                  <h3 id="ingress-editor-title">
                    {ingressEditor.index === null ? "Add ingress rule" : "Edit ingress rule"}
                  </h3>
                  <div className="field">
                    <label htmlFor="ingress-hostname">Hostname (optional)</label>
                    <input
                      id="ingress-hostname"
                      type="text"
                      value={ingressEditor.hostname}
                      placeholder="app.example.com"
                      disabled={configBusy}
                      onChange={(e) =>
                        setIngressEditor({ ...ingressEditor, hostname: e.target.value })
                      }
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="ingress-path">Path (optional)</label>
                    <input
                      id="ingress-path"
                      type="text"
                      value={ingressEditor.path}
                      placeholder="/api"
                      disabled={configBusy}
                      onChange={(e) =>
                        setIngressEditor({ ...ingressEditor, path: e.target.value })
                      }
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="ingress-service">Service</label>
                    <input
                      id="ingress-service"
                      type="text"
                      value={ingressEditor.service}
                      placeholder="http://localhost:8080"
                      disabled={configBusy}
                      autoFocus
                      onChange={(e) =>
                        setIngressEditor({ ...ingressEditor, service: e.target.value })
                      }
                    />
                    <p className="hint">e.g. http://localhost:8080, https://10.0.0.1:443, or http_status:404</p>
                  </div>
                  <div className="row-actions modal-actions">
                    <button
                      type="button"
                      className="btn"
                      disabled={configBusy}
                      onClick={() => setIngressEditor(null)}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={configBusy || !ingressEditor.service.trim()}
                    >
                      {configBusy ? <Spinner label="Saving…" /> : "Save rule"}
                    </button>
                  </div>
                </form>
              </div>
            )}

            <div className="row-actions drawer-danger-actions" style={{ marginTop: "1.5rem" }}>
              {!demo && (
                <button
                  className="btn btn-danger"
                  disabled={locked}
                  onClick={() => {
                    if (!confirm(`Delete tunnel "${selected.name}"?`)) return;
                    void run("delete", async () => {
                      await api.deleteTunnel(selected.id);
                      push(`Deleted tunnel "${selected.name}".`, "success");
                      closeDrawer();
                    });
                  }}
                >
                  {busy === "delete" ? <Spinner label="Deleting…" /> : "Delete tunnel"}
                </button>
              )}
            </div>
          </aside>
        </div>
      )}

      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </>
  );
}
