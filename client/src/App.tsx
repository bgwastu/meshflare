import { useEffect, useMemo, useState, useTransition, type FormEvent, type TransitionEvent } from "react";
import {
  Globe,
  Loader2,
  Pencil,
  RefreshCw,
  Search,
  Server,
  Settings as SettingsIcon,
  SlidersHorizontal,
  Smartphone,
  Trash2,
  X,
} from "lucide-react";
import { Link, NavLink, useLocation, useSearchParams } from "react-router";
import {
  api,
  type MeshEntry,
  type MeshRoute,
  type Settings,
  type SplitTunnelConfig,
} from "./lib/api";
import { ToastStack, useToasts } from "./lib/toasts";
import { TunnelsPanel } from "./TunnelsPanel";
import {
  copyText,
  dnsFilterStatusMeta,
  machineStatusMeta,
  isNodeInitial,
  warpConnectorInstallCommand,
} from "./lib/warp";

type Tab = "mesh" | "tunnels" | "settings";
type KindFilter = "all" | "node" | "device";
type ActivityFilter = "online" | "offline" | "all";
type SortKey = "name" | "kind" | "meshHostname" | "ipv4" | "lastSeenAt" | "status" | "createdAt";
type Busy =
  | null
  | "sync"
  | "cleanup"
  | "refresh"
  | "settings"
  | "dns-filter"
  | "rename"
  | "regenerate"
  | "delete"
  | "domain"
  | "filter-url"
  | "dns-endpoint";

const SORT_KEYS: SortKey[] = [
  "name",
  "kind",
  "meshHostname",
  "ipv4",
  "lastSeenAt",
  "status",
  "createdAt",
];

function parseKind(value: string | null): KindFilter {
  return value === "node" || value === "device" ? value : "all";
}

function parseActivity(value: string | null): ActivityFilter {
  if (value === "offline" || value === "all") return value;
  return "online";
}

function parseSort(value: string | null): SortKey {
  return value && SORT_KEYS.includes(value as SortKey) ? (value as SortKey) : "createdAt";
}

function formatSeen(iso: string | null | undefined, empty = "—"): string {
  if (!iso) return empty;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const days = (Date.now() - t) / 86_400_000;
  if (days < 1 / 24) return "just now";
  if (days < 1) return `${Math.max(1, Math.round(days * 24))}h ago`;
  return `${Math.floor(days)}d ago`;
}

function sortValue(entry: MeshEntry, key: SortKey): string | number {
  switch (key) {
    case "name":
      return entry.name.toLowerCase();
    case "kind":
      return entry.kind;
    case "meshHostname":
      return entry.meshHostname?.toLowerCase() ?? "";
    case "ipv4":
      return entry.ipv4 ?? "";
    case "lastSeenAt":
      return Date.parse(entry.lastSeenAt ?? "") || 0;
    case "status":
      return entry.status.toLowerCase();
    case "createdAt":
      return Date.parse(entry.createdAt) || 0;
  }
}

function KindBadge({ kind }: { kind: "node" | "device" }) {
  const Icon = kind === "node" ? Server : Smartphone;
  return (
    <span className={`badge ${kind}`}>
      <Icon size={12} strokeWidth={2.25} aria-hidden />
      {kind}
    </span>
  );
}

function MachineKindStatus({ entry, size = 14 }: { entry: MeshEntry; size?: number }) {
  const meta = machineStatusMeta(entry.status);
  const Icon = entry.kind === "node" ? Server : Smartphone;
  const kind = entry.kind === "node" ? "Node" : "Device";
  return (
    <span
      className={`machine-kind-status ${entry.kind}`}
      data-tone={meta.tone}
      data-tip={`${kind} · ${meta.label}`}
      tabIndex={0}
      aria-label={`${kind}, ${meta.label}`}
    >
      <Icon size={size} strokeWidth={2.25} aria-hidden />
    </span>
  );
}

function Spinner({ label }: { label: string }) {
  return (
    <span className="btn-spin">
      <Loader2 size={14} strokeWidth={2.5} className="spin" aria-hidden />
      {label}
    </span>
  );
}

function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden />;
}

function CopyValue({
  value,
  onCopied,
}: {
  value: string | null;
  onCopied: (label: string) => void;
}) {
  if (!value) return <span className="mono muted">—</span>;
  return (
    <button
      type="button"
      className="copy-chip mono"
      title="Click to copy"
      onClick={(e) => {
        e.stopPropagation();
        void (async () => {
          try {
            await copyText(value);
            onCopied(value);
          } catch {
            /* toast handled by caller if needed */
          }
        })();
      }}
    >
      {value}
    </button>
  );
}

export function App() {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: Tab = location.pathname.startsWith("/settings") ? "settings" : location.pathname.startsWith("/tunnels") ? "tunnels" : "mesh";

  const kindFilter = parseKind(searchParams.get("kind"));
  const activityParam = searchParams.get("activity");
  const activityFilter = kindFilter === "all" || activityParam ? parseActivity(activityParam) : "all";
  const search = searchParams.get("q") ?? "";
  const sortKey = parseSort(searchParams.get("sort"));
  const sortDir = searchParams.get("dir") === "asc" ? "asc" : "desc";
  const selectedId = searchParams.get("id");

  const [entries, setEntries] = useState<MeshEntry[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [drawerEntry, setDrawerEntry] = useState<MeshEntry | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [renameValue, setRenameValue] = useState("");
  const [offlineDays, setOfflineDays] = useState(7);
  const [meshSuffixDraft, setMeshSuffixDraft] = useState("mesh");
  const [filterUrlDraft, setFilterUrlDraft] = useState("https://small.oisd.nl/");
  const [dnsSourceNetworkDraft, setDnsSourceNetworkDraft] = useState("");
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState<Busy>(null);
  const [ready, setReady] = useState(false);
  const [authRequired, setAuthRequired] = useState(false);
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [installCmd, setInstallCmd] = useState<string | null>(null);
  const [installLoading, setInstallLoading] = useState(false);
  const [routes, setRoutes] = useState<MeshRoute[]>([]);
  const [routesLoading, setRoutesLoading] = useState(false);
  const [routeNetwork, setRouteNetwork] = useState("");
  const [routeType, setRouteType] = useState<"cidr" | "hostname" | null>(null);
  const [routeComment, setRouteComment] = useState("");
  const [splitTunnels, setSplitTunnels] = useState<SplitTunnelConfig | null>(null);
  const [splitTunnelsLoading, setSplitTunnelsLoading] = useState(false);
  const [splitTunnelsError, setSplitTunnelsError] = useState<string | null>(null);
  const [splitEditor, setSplitEditor] = useState<{ index: number | null; value: string; description: string } | null>(null);
  const [splitBusy, setSplitBusy] = useState(false);
  const [routeBusy, setRouteBusy] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const { toasts, push, dismiss } = useToasts();

  const locked = busy !== null || creating || Boolean(settings?.demo);
  const selected =
    selectedId && drawerEntry?.id === selectedId
      ? drawerEntry
      : selectedId
        ? (entries.find((e) => e.id === selectedId) ?? drawerEntry)
        : drawerEntry;

  function patchParams(mutate: (next: URLSearchParams) => void) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        mutate(next);
        return next;
      },
      { replace: true },
    );
  }

  function openEntry(entry: MeshEntry) {
    setDrawerEntry(entry);
    setRenameValue(entry.name);
    patchParams((next) => {
      next.set("id", entry.id);
    });
    requestAnimationFrame(() => setDrawerOpen(true));
  }

  function closeDrawer() {
    setDrawerOpen(false);
    if (selectedId) {
      patchParams((next) => {
        next.delete("id");
      });
    }
  }

  function onDrawerTransitionEnd(e: TransitionEvent<HTMLDivElement>) {
    if (e.propertyName !== "opacity" || drawerOpen) return;
    setDrawerEntry(null);
  }

  async function refresh() {
    const auth = await api.authStatus();
    if (auth.required && !auth.authenticated) {
      setAuthRequired(true);
      setReady(true);
      return [];
    }
    setAuthRequired(false);
    const [mesh, s] = await Promise.all([api.listMesh(), api.settings()]);
    setEntries(mesh.entries);
    setSettings(s);
    setOfflineDays(s.offlineDays);
    setMeshSuffixDraft(s.meshSuffix);
    setFilterUrlDraft(s.dnsFilterUrl);
    setDnsSourceNetworkDraft(s.dnsLocation?.sourceNetworks[0] ?? "");
    setReady(true);
    return mesh.entries;
  }

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthBusy(true);
    setAuthError(null);
    try {
      await api.login(password);
      setPassword("");
      await refresh();
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : String(error));
    } finally {
      setAuthBusy(false);
    }
  }

  useEffect(() => {
    startTransition(() => {
      void refresh().catch((e: unknown) => {
        setReady(true);
        push(e instanceof Error ? e.message : String(e), "error");
      });
    });
  }, []);

  // DNS filter enable/disable runs in the background — poll while in flight.
  useEffect(() => {
    const status = settings?.dnsFilterStatus;
    if (
      !status ||
      !["pending_enable", "syncing", "pending_refresh", "pending_disable"].includes(status)
    ) {
      return;
    }
    const tick = () => {
      void api
        .settings()
        .then((s) => setSettings(s))
        .catch(() => {
          /* ignore transient poll errors */
        });
    };
    tick();
    const id = window.setInterval(tick, 1500);
    return () => window.clearInterval(id);
  }, [settings?.dnsFilterStatus]);

  useEffect(() => {
    if (!selectedId) {
      if (drawerOpen) setDrawerOpen(false);
      return;
    }
    const found = entries.find((e) => e.id === selectedId);
    if (!found) return;
    setDrawerEntry((prev) => (prev?.id === found.id ? prev : found));
    setRenameValue(found.name);
    requestAnimationFrame(() => setDrawerOpen(true));
  }, [selectedId, entries]);

  useEffect(() => {
    if (tab !== "settings" || splitTunnels || splitTunnelsLoading || splitTunnelsError) return;
    setSplitTunnelsLoading(true);
    setSplitTunnelsError(null);
    void api
      .splitTunnels()
      .then(setSplitTunnels)
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : String(e);
        setSplitTunnelsError(message);
        push(message, "error");
      })
      .finally(() => setSplitTunnelsLoading(false));
  }, [tab, splitTunnels, splitTunnelsLoading]);

  useEffect(() => {
    if (!selected || selected.kind !== "node" || !isNodeInitial(selected.status)) {
      setRoutes([]);
      setRoutesLoading(false);
      return;
    }

    let cancelled = false;
    setRoutesLoading(true);
    void api
      .listNodeRoutes(selected.id)
      .then((r) => {
        if (!cancelled) setRoutes(r.routes);
      })
      .catch((e: unknown) => {
        if (!cancelled) push(e instanceof Error ? e.message : String(e), "error");
      })
      .finally(() => {
        if (!cancelled) setRoutesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selected?.id, selected?.kind]);

  useEffect(() => {
    if (!selected || selected.kind !== "node") {
      setInstallCmd(null);
      return;
    }

    let cancelled = false;
    setInstallLoading(true);
    void api
      .getNodeToken(selected.id)
      .then((r) => {
        if (!cancelled) setInstallCmd(warpConnectorInstallCommand(r.token));
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setInstallCmd(null);
          push(e instanceof Error ? e.message : String(e), "error");
        }
      })
      .finally(() => {
        if (!cancelled) setInstallLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selected?.id, selected?.kind, selected?.status]);

  async function regenerateNodeCode(): Promise<string | null> {
    if (!drawerEntry || drawerEntry.kind !== "node") return null;
    const result = await api.recreateNode(drawerEntry.id);
    return result.node.id;
  }

  const visibleEntries = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = entries.filter((e) => {
      const online = machineStatusMeta(e.status).tone === "ok";
      if (activityFilter === "online" && !online) return false;
      if (activityFilter === "offline" && (online || isNodeInitial(e.status))) return false;
      if (kindFilter !== "all" && e.kind !== kindFilter) return false;
      if (!q) return true;
      return (
        e.name.toLowerCase().includes(q) ||
        (e.meshHostname?.toLowerCase().includes(q) ?? false) ||
        (e.ipv4?.includes(q) ?? false) ||
        e.status.toLowerCase().includes(q)
      );
    });
    return [...filtered].sort((a, b) => {
      const va = sortValue(a, sortKey);
      const vb = sortValue(b, sortKey);
      let cmp = 0;
      if (typeof va === "number" && typeof vb === "number") cmp = va - vb;
      else cmp = String(va).localeCompare(String(vb));
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [entries, activityFilter, kindFilter, sortKey, sortDir, search]);

  function toggleSort(key: SortKey) {
    patchParams((next) => {
      if (sortKey === key) {
        next.set("dir", sortDir === "asc" ? "desc" : "asc");
      } else {
        next.set("sort", key);
        next.set(
          "dir",
          key === "name" || key === "kind" || key === "status" ? "asc" : "desc",
        );
      }
      if (next.get("sort") === "createdAt") next.delete("sort");
      if (next.get("dir") === "desc" && (next.get("sort") ?? "createdAt") === "createdAt") {
        next.delete("dir");
      }
    });
  }

  async function run<T = void>(key: Exclude<Busy, null>, action: () => Promise<T>): Promise<T | null> {
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

  async function saveSplitTunnels(
    mode: "include" | "exclude",
    items: SplitTunnelConfig["include"],
    message: string,
  ) {
    setSplitBusy(true);
    try {
      const saved = await api.saveSplitTunnels(mode, items);
      setSplitTunnels(saved);
      push(message, "success");
      return true;
    } catch (e) {
      push(e instanceof Error ? e.message : String(e), "error");
      return false;
    } finally {
      setSplitBusy(false);
    }
  }

  async function createNode() {
    const name = newName.trim();
    if (!name || creating) return;
    setCreating(true);
    try {
      const r = await api.createNode(name);
      setNewName("");
      const list = await refresh();
      const created =
        list.find((e) => e.kind === "node" && e.id === r.node.id) ??
        ({
          kind: "node",
          id: r.node.id,
          name: r.node.name,
          meshHostname: null,
          ipv4: null,
          ipv6: null,
           status: "inactive",
          lastSeenAt: null,
          createdAt: r.node.created_at ?? new Date().toISOString(),
          tunnelType: "warp_connector",
          isConnector: true,
        } satisfies MeshEntry);

      setCreateOpen(false);
      openEntry(created);
      push(r.notice ?? `Created node "${r.node.name}".`, r.notice ? "info" : "success");
    } catch (e) {
      push(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setCreating(false);
    }
  }

  const filterMeta = dnsFilterStatusMeta(settings?.dnsFilterStatus ?? "idle", settings?.dnsFilterEnabled ?? false);
  const dnsLocation = settings?.dnsLocation;
  const settingsReady = ready && settings !== null;
  const accountLine = settings?.accountName
    ? settings.accountEmail
      ? `${settings.accountName} · ${settings.accountEmail}`
      : settings.accountName
    : ready
      ? "Cloudflare account"
      : "Loading…";

  if (authRequired) {
    return (
      <main className="app login-screen">
        <section className="settings-block login-card">
          <div className="brand login-brand">
            <img src="/icon-192.png" alt="" className="brand-mark" width={40} height={40} />
            <h1>mesh<span>flare</span></h1>
          </div>
          <h2>Dashboard login</h2>
          <p className="hint">Enter the password configured for this meshflare instance.</p>
          <form onSubmit={(event) => void login(event)}>
            <div className="field">
              <label htmlFor="meshflare-password">Password</label>
              <input
                id="meshflare-password"
                type="password"
                autoComplete="current-password"
                value={password}
                autoFocus
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
            {authError ? <p className="error-text">{authError}</p> : null}
            <button className="btn btn-primary" type="submit" disabled={authBusy || !password}>
              {authBusy ? <Spinner label="Signing in…" /> : "Sign in"}
            </button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <div className="app">
      {settings?.demo ? (
        <div className="demo-banner" role="status">
          Demo mode — read-only sample data.{" "}
          <a href="https://github.com/bgwastu/meshflare" target="_blank" rel="noreferrer">
            Get the code on GitHub
          </a>{" "}
          to deploy your own instance.
        </div>
      ) : null}
      <header className="top">
        <div className="brand">
          <Link to="/mesh" className="brand-link" title="Mesh">
            <img src="/icon-192.png" alt="" className="brand-mark" width={32} height={32} />
            <h1>
              mesh<span>flare</span>
            </h1>
          </Link>
          <p className="account-line">{accountLine}</p>
        </div>
        <nav className="tabs" aria-label="Primary">
          <NavLink
            to="/mesh"
            className={({ isActive }) => `tab ${isActive ? "active" : ""}`}
          >
            <Server size={14} strokeWidth={2.25} aria-hidden />
            Mesh
          </NavLink>
          <NavLink
            to="/tunnels"
            className={({ isActive }) => `tab ${isActive ? "active" : ""}`}
          >
            <Globe size={14} strokeWidth={2.25} aria-hidden />
            Tunnels
          </NavLink>
          <NavLink
            to="/settings"
            className={({ isActive }) => `tab ${isActive ? "active" : ""}`}
          >
            <SettingsIcon size={14} strokeWidth={2.25} aria-hidden />
            Settings
          </NavLink>
        </nav>
      </header>

      {tab === "mesh" && (
        <section className="panel" aria-busy={!ready}>
            <div className="panel-head">
              <h2>
                Mesh{" "}
                <span className="hint">({ready ? visibleEntries.length : "…"})</span>
              </h2>
              <div className="filters">
                <div className="filters-desktop">
                  {([
                    ["all", "All"],
                    ["online", "Online"],
                    ["offline", "Offline"],
                    ["node", "Nodes"],
                    ["device", "Devices"],
                  ] as const).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      className={`btn ${
                        (value === "node" || value === "device" ? kindFilter === value : kindFilter === "all" && activityFilter === value)
                          ? "btn-active"
                          : ""
                      }`}
                      disabled={!ready}
                      onClick={() => {
                        setFilterOpen(false);
                        patchParams((next) => {
                          if (value === "node" || value === "device") {
                            next.set("kind", value);
                            next.delete("activity");
                          } else {
                            next.delete("kind");
                            if (value === "online") next.delete("activity");
                            else next.set("activity", value);
                          }
                        });
                      }}
                    >
                      {value === "node" ? (
                        <span className="filter-label"><Server size={13} strokeWidth={2.25} aria-hidden />{label}</span>
                      ) : value === "device" ? (
                        <span className="filter-label"><Smartphone size={13} strokeWidth={2.25} aria-hidden />{label}</span>
                      ) : label}
                    </button>
                  ))}
                </div>
                <div className="filters-mobile">
                  <button
                    type="button"
                    className="btn filter-toggle"
                    aria-expanded={filterOpen}
                    onClick={() => setFilterOpen((open) => !open)}
                  >
                    <SlidersHorizontal size={14} strokeWidth={2.25} aria-hidden />
                    Filter
                  </button>
                  {filterOpen && (
                    <div className="filter-menu">
                      {([
                        ["all", "All"],
                        ["online", "Online"],
                        ["offline", "Offline"],
                        ["node", "Nodes"],
                        ["device", "Devices"],
                      ] as const).map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          className={`btn ${
                            (value === "node" || value === "device" ? kindFilter === value : kindFilter === "all" && activityFilter === value)
                              ? "btn-active"
                              : ""
                          }`}
                          onClick={() => {
                            setFilterOpen(false);
                            patchParams((next) => {
                              if (value === "node" || value === "device") {
                                next.set("kind", value);
                                next.delete("activity");
                              } else {
                                next.delete("kind");
                                if (value === "online") next.delete("activity");
                                else next.set("activity", value);
                              }
                            });
                          }}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  className="btn btn-icon"
                  disabled={locked}
                  title="Refresh"
                  aria-label="Refresh"
                  onClick={() =>
                    void run("refresh", async () => {
                      push("Refreshed.", "success");
                    })
                  }
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
                  placeholder="Search mesh entries…"
                  value={search}
                  onChange={(e) => {
                    const value = e.target.value;
                    patchParams((next) => {
                      if (value) next.set("q", value);
                      else next.delete("q");
                    });
                  }}
                  disabled={!ready}
                />
              </div>
              <button
                className="btn btn-primary"
                disabled={!ready || creating}
                onClick={() => setCreateOpen(true)}
              >
                Create node
              </button>
            </div>

            {!ready ? (
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
            ) : visibleEntries.length === 0 ? (
              <div className="empty">
                {search.trim() || activityFilter !== "online" || kindFilter !== "all"
                  ? "No mesh entries match this filter."
                  : "No mesh entries yet."}
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      {(
                          [
                            ["name", "Name"],
                            ["meshHostname", "Domain"],
                            ["ipv4", "IPv4"],
                            ["lastSeenAt", "Last seen"],
                          ] as const
                      ).map(([key, label]) => (
                        <th
                          key={key}
                          className={`sortable ${sortKey === key ? "sorted" : ""}`}
                          onClick={() => toggleSort(key)}
                        >
                          {label}
                          {sortKey === key ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleEntries.map((e) => (
                      <tr
                        key={`${e.kind}-${e.id}`}
                        style={{ cursor: "pointer" }}
                        onClick={() => openEntry(e)}
                      >
                        <td>
                          <strong className="name-cell">
                            <MachineKindStatus entry={e} />
                            {e.name}
                          </strong>
                        </td>
                        <td>
                          <CopyValue
                            value={e.meshHostname}
                            onCopied={(v) => push(`Copied ${v}`, "success")}
                          />
                        </td>
                        <td>
                          <CopyValue
                            value={e.ipv4}
                            onCopied={(v) => push(`Copied ${v}`, "success")}
                          />
                        </td>
                        <td>{formatSeen(e.lastSeenAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
      )}

      {tab === "tunnels" && (
        <section className="panel">
          <TunnelsPanel demo={settings?.demo} locked={locked} />
        </section>
      )}

      {tab === "settings" && (
        <section className="settings-panel" aria-busy={!settingsReady}>
          {!settingsReady ? (
            <div className="skeleton-stack">
              <SkeletonBlock className="skeleton-label" />
              <SkeletonBlock className="skeleton-input" />
              <SkeletonBlock className="skeleton-btn" />
              <SkeletonBlock className="skeleton-row" />
            </div>
          ) : (
            <div className="settings-grid">
              <div className="settings-block">
                <h3>Mesh domain</h3>
                <p className="hint">Hostname suffix for machine DNS overrides.</p>
                <div className="field">
                  <label htmlFor="mesh-suffix">Domain</label>
                  <div className="suffix-input">
                    <span className="suffix-dot">.</span>
                    <input
                      id="mesh-suffix"
                      type="text"
                      value={meshSuffixDraft}
                      disabled={locked}
                      onChange={(e) => setMeshSuffixDraft(e.target.value)}
                    />
                  </div>
                </div>
                <button
                  className="btn btn-primary"
                  disabled={
                    locked ||
                    !meshSuffixDraft.trim() ||
                    meshSuffixDraft.trim().replace(/^\.+/, "") === settings.meshSuffix
                  }
                  onClick={() =>
                    void run("domain", async () => {
                      await api.patchSettings({ meshSuffix: meshSuffixDraft });
                      push(`Mesh domain set to .${meshSuffixDraft.replace(/^\.+/, "")}.`, "success");
                    })
                  }
                >
                  {busy === "domain" ? <Spinner label="Saving…" /> : "Save domain"}
                </button>
              </div>

              <div className="settings-block">
                <h3>Auto-delete</h3>
                <p className="hint">Remove devices offline longer than this threshold. Nodes are never auto-deleted.</p>
                <div className="field">
                  <label htmlFor="offline-days">Days offline</label>
                  <input
                    id="offline-days"
                    type="number"
                    min={1}
                    max={365}
                    value={offlineDays}
                    disabled={locked}
                    onChange={(e) => setOfflineDays(Number(e.target.value))}
                  />
                </div>
                <button
                  className="btn"
                  disabled={locked || offlineDays === settings.offlineDays}
                  onClick={() =>
                    void run("settings", async () => {
                      await api.patchSettings({ offlineDays });
                      push(`Offline threshold set to ${offlineDays} days.`, "success");
                    })
                  }
                >
                  {busy === "settings" ? <Spinner label="Saving…" /> : "Save threshold"}
                </button>
              </div>

              <div className="settings-block">
                <h3>DNS filtering</h3>
                <div className="status-label" style={{ marginBottom: "0.35rem" }}>
                  Status
                  <span
                    className="status-dot"
                    data-tone={filterMeta.tone}
                    data-tip={filterMeta.tip}
                    tabIndex={0}
                    aria-label={filterMeta.tip}
                  />
                  <span className="hint">{filterMeta.tip}</span>
                </div>
                <p className="hint">
                  Account-wide Gateway block list from any domain-list URL.
                  {filterMeta.tone === "ok" && settings.dnsFilterLastSyncedAt
                    ? ` Last refresh ${formatSeen(settings.dnsFilterLastSyncedAt)}.`
                    : null}
                </p>
                <div className="field">
                  <label htmlFor="filter-url">List URL</label>
                  <input
                    id="filter-url"
                    type="url"
                    value={filterUrlDraft}
                    disabled={locked}
                    onChange={(e) => setFilterUrlDraft(e.target.value)}
                  />
                </div>
                <div className="row-actions">
                  <button
                    className="btn"
                    disabled={
                      locked ||
                      !filterUrlDraft.trim() ||
                      filterUrlDraft.trim() === settings.dnsFilterUrl
                    }
                    onClick={() =>
                      void run("filter-url", async () => {
                        await api.patchSettings({ dnsFilterUrl: filterUrlDraft });
                        push(
                          settings.dnsFilterEnabled
                            ? "Filter URL updated; rebuilding lists."
                            : "Filter URL saved.",
                          "success",
                        );
                      })
                    }
                  >
                    {busy === "filter-url" ? <Spinner label="Saving…" /> : "Save URL"}
                  </button>
                  <button
                    className="btn btn-primary"
                    disabled={locked}
                    onClick={() =>
                      void run("dns-filter", async () => {
                        const next = !settings.dnsFilterEnabled;
                        await api.patchSettings({ dnsFilterEnabled: next });
                        push(next ? "DNS filter enable queued." : "DNS filter disable queued.", "success");
                      })
                    }
                  >
                    {busy === "dns-filter" ? (
                      <Spinner label={settings.dnsFilterEnabled ? "Disabling…" : "Enabling…"} />
                    ) : settings.dnsFilterEnabled ? (
                      "Disable"
                    ) : (
                      "Enable"
                    )}
                  </button>
                </div>
              </div>

              <div className="settings-block dns-endpoints-block">
                <h3>Zero Trust DNS endpoints</h3>
                <p className="hint">
                   Control which Gateway resolver endpoints are available to WARP connectors.
                </p>
                {!dnsLocation ? (
                  <p className="hint dns-endpoint-warning">No default Gateway DNS location found.</p>
                ) : (
                  <>
                    <div className="field dns-source-network-field">
                      <label htmlFor="dns-source-network">Shared IPv4 source network</label>
                      <input
                        id="dns-source-network"
                        type="text"
                        placeholder="203.0.113.42/32"
                        value={dnsSourceNetworkDraft}
                        disabled={locked}
                        onChange={(e) => setDnsSourceNetworkDraft(e.target.value)}
                      />
                      <p className="hint">
                        Required by Cloudflare before enabling the shared IPv4 endpoint. Use the public egress IP/CIDR, not a Mesh IP.
                      </p>
                      <button
                        className="btn"
                        disabled={locked || dnsSourceNetworkDraft.trim() === (dnsLocation.sourceNetworks[0] ?? "")}
                        onClick={() =>
                          void run("dns-endpoint", async () => {
                            await api.patchSettings({ dnsSourceNetwork: dnsSourceNetworkDraft });
                            push(
                              dnsLocation.endpoints.ipv4
                                ? "DNS source network saved."
                                : "DNS source network saved and IPv4 endpoint enabled.",
                              "success",
                            );
                          })
                        }
                      >
                        {busy === "dns-endpoint" ? (
                          <Spinner label="Saving…" />
                        ) : dnsLocation.endpoints.ipv4 ? (
                          "Save source network"
                        ) : (
                          "Save and enable IPv4"
                        )}
                      </button>
                    </div>
                    <div className="dns-endpoint-list">
                    {(
                      [
                        {
                          key: "ipv4" as const,
                          label: "IPv4 endpoint",
                          value: [dnsLocation.ipv4Destination, dnsLocation.ipv4DestinationBackup]
                            .filter(Boolean)
                            .join(" · "),
                        },
                        {
                          key: "ipv6" as const,
                          label: "IPv6 endpoint",
                          value: dnsLocation.ipv6Destination ?? "",
                        },
                        {
                          key: "doh" as const,
                          label: "DoH endpoint",
                          value: dnsLocation.dohSubdomain
                            ? `https://${dnsLocation.dohSubdomain}.cloudflare-gateway.com/dns-query`
                            : "",
                        },
                      ]
                    ).map((endpoint) => {
                      const enabled = dnsLocation.endpoints[endpoint.key];
                      return (
                        <div className="dns-endpoint-row" key={endpoint.key}>
                          <div className="dns-endpoint-head">
                            <strong>{endpoint.label}</strong>
                            <label className={`mode-switch ${enabled ? "include" : ""}`}>
                              <span className="sr-only">{endpoint.label}</span>
                              <input
                                type="checkbox"
                                checked={enabled}
                                disabled={locked || busy === "dns-endpoint" || !endpoint.value}
                                onChange={() =>
                                  void run("dns-endpoint", async () => {
                                    await api.patchSettings({
                                      [`dns${endpoint.key === "ipv4" ? "Ipv4" : endpoint.key === "ipv6" ? "Ipv6" : "Doh"}Enabled`]: !enabled,
                                    });
                                    push(
                                      `${endpoint.label} ${enabled ? "disabled" : "enabled"}.`,
                                      "success",
                                    );
                                  })
                                }
                              />
                              <span className="switch-track" aria-hidden>
                                <span />
                              </span>
                              <span>{enabled ? "On" : "Off"}</span>
                            </label>
                          </div>
                          {enabled && endpoint.value ? (
                            <p className="dns-endpoint-value mono">{endpoint.value}</p>
                          ) : (
                            <p className="hint">Disabled</p>
                          )}
                        </div>
                      );
                    })}
                    </div>
                  </>
                )}
              </div>


              <div className="settings-block maintenance-block">
                <h3>Maintenance</h3>
                <div className="maint-row">
                  <div>
                    <strong>Sync DNS</strong>
                    <p className="hint">Last run {formatSeen(settings.lastDnsSyncAt, "never")}.</p>
                  </div>
                  <button
                    className="btn"
                    disabled={locked}
                    onClick={() =>
                      void run("sync", async () => {
                        await api.syncDns();
                        push("DNS sync complete.", "success");
                      })
                    }
                  >
                    {busy === "sync" ? <Spinner label="Syncing…" /> : "Run now"}
                  </button>
                </div>
                <div className="maint-row">
                  <div>
                    <strong>Cleanup</strong>
                    <p className="hint">Last run {formatSeen(settings.lastCleanupAt, "never")}.</p>
                  </div>
                  <button
                    className="btn"
                    disabled={locked}
                    onClick={() => {
                      if (
                        !confirm(
                          `Delete devices offline longer than ${offlineDays} day${offlineDays === 1 ? "" : "s"}? Nodes are never deleted.`,
                        )
                      ) {
                        return;
                      }
                      void run("cleanup", async () => {
                        const r = await api.cleanup();
                        const c = r.cleanup;
                        if (c.deleted === 0) {
                          push(
                            `Cleanup done — no devices offline longer than ${offlineDays} days (${c.scanned} scanned).`,
                            "success",
                          );
                        } else {
                          const names = c.deletedNames.slice(0, 3).join(", ");
                          const more =
                            c.deletedNames.length > 3
                              ? ` +${c.deletedNames.length - 3} more`
                              : "";
                          push(
                            `Cleanup deleted ${c.deleted} device${c.deleted === 1 ? "" : "s"}: ${names}${more}.`,
                            "success",
                          );
                        }
                      });
                    }}
                  >
                    {busy === "cleanup" ? <Spinner label="Cleaning…" /> : "Run now"}
                  </button>
                </div>
              </div>

              <div className="settings-block settings-block-wide split-tunnels-block" aria-busy={splitTunnelsLoading || splitBusy}>
                <div className="split-head">
                  <div>
                    <h3>WARP split tunnels</h3>
                    <p className="hint">Manage routes on the default WARP device profile.</p>
                  </div>
                  {splitTunnels && (
                    <label className={`mode-switch ${splitTunnels.mode}`}>
                      <span>Exclude</span>
                      <input
                        type="checkbox"
                        role="switch"
                        aria-label="Split tunnel mode"
                        checked={splitTunnels.mode === "include"}
                        disabled={locked || splitBusy}
                        onChange={(e) => {
                          const mode = e.target.checked ? "include" : "exclude";
                          if (!confirm(`Switch to ${mode} mode? Cloudflare will apply the saved ${mode} list.`)) return;
                          void saveSplitTunnels(mode, splitTunnels[mode], `Switched to ${mode} mode.`);
                        }}
                      />
                      <span className="switch-track" aria-hidden><span /></span>
                      <span>Include</span>
                    </label>
                  )}
                </div>
                <p className="hint split-mode-copy">
                  {splitTunnels?.mode === "include"
                    ? "Only listed traffic is sent through WARP."
                    : "All traffic is sent through WARP except listed traffic."}
                </p>
                {splitTunnelsLoading ? (
                  <div className="split-list" aria-label="Loading split tunnels">
                    {Array.from({ length: 3 }, (_, index) => (
                      <div className="route-row" key={index}>
                        <div className="skeleton-stack">
                          <SkeletonBlock className="skeleton-route-primary" />
                          <SkeletonBlock className="skeleton-route-secondary" />
                        </div>
                        <SkeletonBlock className="skeleton-route-action" />
                      </div>
                    ))}
                  </div>
                ) : splitTunnelsError ? (
                  <div className="load-error">
                    <span className="hint">Could not load split tunnels.</span>
                    <button type="button" className="btn" onClick={() => setSplitTunnelsError(null)}>Retry</button>
                  </div>
                ) : splitTunnels ? (
                  <>
                    <div className="split-list">
                      {splitTunnels[splitTunnels.mode].map((item, index) => (
                        <div className="route-row" key={`${item.address ?? item.host}-${index}`}>
                          <div>
                            <span className="mono">{item.address ?? item.host}</span>
                            {item.description && <span className="hint">{item.description}</span>}
                          </div>
                          <div className="row-actions split-item-actions">
                            <button
                              type="button"
                              className="btn btn-icon"
                              title="Edit"
                              aria-label={`Edit ${item.address ?? item.host}`}
                              disabled={locked || splitBusy}
                              onClick={() => setSplitEditor({ index, value: item.address ?? item.host ?? "", description: item.description ?? "" })}
                            >
                              <Pencil size={14} strokeWidth={2.25} aria-hidden />
                            </button>
                            <button
                              type="button"
                              className="btn btn-icon btn-danger"
                              title="Remove"
                              aria-label={`Remove ${item.address ?? item.host}`}
                              disabled={locked || splitBusy}
                              onClick={() => {
                                if (!confirm(`Remove ${item.address ?? item.host}?`)) return;
                                void saveSplitTunnels(
                                  splitTunnels.mode,
                                  splitTunnels[splitTunnels.mode].filter((_, itemIndex) => itemIndex !== index),
                                  "Split tunnel item removed.",
                                );
                              }}
                            >
                              <Trash2 size={14} strokeWidth={2.25} aria-hidden />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      className="btn btn-primary split-add-button"
                      disabled={locked || splitBusy}
                      onClick={() => setSplitEditor({ index: null, value: "", description: "" })}
                    >
                      + Add
                    </button>
                  </>
                ) : null}
              </div>
            </div>
          )}
        </section>
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
            aria-labelledby="create-node-title"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              void createNode();
            }}
          >
            <h3 id="create-node-title">Create node</h3>
            <div className="field">
              <label htmlFor="new-node">Node name</label>
              <input
                id="new-node"
                type="text"
                value={newName}
                placeholder="New node name"
                disabled={creating || Boolean(settings?.demo)}
                autoFocus={!settings?.demo}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>
            {settings?.demo && (
              <p className="hint">The demo is read-only. Deploy your own instance to create nodes.</p>
            )}
            <div className="row-actions modal-actions">
              <button type="button" className="btn" disabled={creating} onClick={() => setCreateOpen(false)}>
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={creating || Boolean(settings?.demo) || !newName.trim()}
              >
                {creating ? <Spinner label="Creating…" /> : "Create node"}
              </button>
            </div>
          </form>
        </div>
      )}

      {splitEditor && splitTunnels && (
        <div className="modal-backdrop" role="presentation" onClick={() => !splitBusy && setSplitEditor(null)}>
          <form
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="split-editor-title"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              const value = splitEditor.value.trim();
              if (!value || splitBusy) return;
              const item = value.includes("/")
                ? { address: value, description: splitEditor.description.trim() || undefined }
                : { host: value, description: splitEditor.description.trim() || undefined };
              const activeItems = splitTunnels[splitTunnels.mode];
              const items = splitEditor.index === null
                ? [...activeItems, item]
                : activeItems.map((current, index) => index === splitEditor.index ? item : current);
              void saveSplitTunnels(
                splitTunnels.mode,
                items,
                splitEditor.index === null ? "Split tunnel item added." : "Split tunnel item updated.",
              ).then((saved) => {
                if (saved) setSplitEditor(null);
              });
            }}
          >
            <h3 id="split-editor-title">{splitEditor.index === null ? "Add split tunnel item" : "Edit split tunnel item"}</h3>
            <div className="field">
              <label htmlFor="split-value">CIDR or hostname</label>
              <input
                id="split-value"
                type="text"
                value={splitEditor.value}
                placeholder="10.0.0.0/24 or internal.example.com"
                disabled={splitBusy}
                autoFocus
                onChange={(e) => setSplitEditor({ ...splitEditor, value: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="split-description">Description (optional)</label>
              <input
                id="split-description"
                type="text"
                value={splitEditor.description}
                disabled={splitBusy}
                onChange={(e) => setSplitEditor({ ...splitEditor, description: e.target.value })}
              />
            </div>
            <div className="row-actions modal-actions">
              <button type="button" className="btn" disabled={splitBusy} onClick={() => setSplitEditor(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={splitBusy || !splitEditor.value.trim()}>
                {splitBusy ? <Spinner label="Saving…" /> : splitEditor.index === null ? "Add item" : "Save changes"}
              </button>
            </div>
          </form>
        </div>
      )}

      {drawerEntry && (
        <div
          className={`drawer-backdrop${drawerOpen ? " is-open" : ""}`}
          onClick={closeDrawer}
          onTransitionEnd={onDrawerTransitionEnd}
        >
          <aside className="drawer" onClick={(ev) => ev.stopPropagation()}>
            <div className="drawer-head">
              <h3 className="drawer-title">
                <MachineKindStatus entry={drawerEntry} size={18} />
                {drawerEntry.name}
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
               <span className="mono">{drawerEntry.id}</span>
            </div>

            <div className="field">
              <label htmlFor="rename">Name (also drives .{settings?.meshSuffix ?? "mesh"})</label>
              <input
                id="rename"
                type="text"
                value={renameValue}
                disabled={locked}
                onChange={(e) => setRenameValue(e.target.value)}
              />
            </div>
            <div className="row-actions" style={{ marginBottom: "1rem" }}>
              <button
                className="btn btn-primary"
                disabled={locked || !renameValue.trim()}
                onClick={() =>
                  void run("rename", async () => {
                    const r = await api.rename(drawerEntry.kind, drawerEntry.id, renameValue.trim());
                    push(
                      r.notice ?? `Renamed to "${renameValue.trim()}". DNS updated.`,
                      r.notice ? "info" : "success",
                    );
                    closeDrawer();
                  })
                }
              >
                {busy === "rename" ? <Spinner label="Saving…" /> : "Save name"}
              </button>
            </div>

            <p className="hint drawer-meta-lines">
              Hostname:{" "}
              <CopyValue
                value={drawerEntry.meshHostname}
                onCopied={(v) => push(`Copied ${v}`, "success")}
              />
              <br />
              IPv4:{" "}
              <CopyValue
                value={drawerEntry.ipv4}
                onCopied={(v) => push(`Copied ${v}`, "success")}
              />
              <br />
              IPv6:{" "}
              <CopyValue
                value={drawerEntry.ipv6}
                onCopied={(v) => push(`Copied ${v}`, "success")}
              />
            </p>

            {drawerEntry.kind === "node" && (
              <div className="route-box" aria-busy={routesLoading}>
                <div className="route-heading">
                  <div>
                    <strong>Routes</strong>
                    <p className="hint">Private networks and hostnames routed through this node.</p>
                  </div>
                </div>
                {routesLoading ? (
                  <div className="route-list" aria-label="Loading routes">
                    {Array.from({ length: 2 }, (_, index) => (
                      <div className="route-row" key={index}>
                        <div className="skeleton-stack">
                          <SkeletonBlock className="skeleton-route-primary" />
                          <SkeletonBlock className="skeleton-route-secondary" />
                        </div>
                        <SkeletonBlock className="skeleton-route-action" />
                      </div>
                    ))}
                  </div>
                ) : routes.length === 0 ? (
                  <p className="hint">No routes configured.</p>
                ) : (
                  <div className="route-list">
                    {routes.map((route) => (
                      <div className="route-row" key={route.id ?? route.network}>
                        <div>
                          <span className="mono">{route.network ?? route.hostname ?? "—"}</span>
                          <span className="hint">{route.type === "hostname" ? "Private hostname" : "Private CIDR"}</span>
                          {route.comment && <span className="hint">{route.comment}</span>}
                        </div>
                        {route.id && (
                          <button
                            type="button"
                            className="btn btn-danger"
                            disabled={Boolean(routeBusy) || Boolean(settings?.demo)}
                            onClick={() => {
                              if (!confirm(`Delete route ${route.network ?? route.hostname ?? route.id}?`)) return;
                              setRouteBusy(route.id ?? null);
                              void api
                                .removeNodeRoute(drawerEntry.id, route.id!)
                                .then(() => {
                                  setRoutes((current) => current.filter((item) => item.id !== route.id));
                                  push(`Deleted route ${route.network ?? route.hostname ?? ""}.`, "success");
                                })
                                .catch((e: unknown) =>
                                  push(e instanceof Error ? e.message : String(e), "error"),
                                )
                                .finally(() => setRouteBusy(null));
                            }}
                          >
                            {routeBusy === route.id ? <Spinner label="Deleting…" /> : "Delete"}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {!routeType && (
                  <button
                    type="button"
                    className="btn btn-primary route-add-button"
                    disabled={Boolean(routeBusy) || Boolean(settings?.demo)}
                    onClick={() => setRouteType("cidr")}
                  >
                    + New route
                  </button>
                )}
                {routeType && <form
                  className="route-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const network = routeNetwork.trim();
                    if (!network || routeBusy) return;
                    setRouteBusy("create");
                    void api
                      .createNodeRoute(drawerEntry.id, routeType, network, routeComment.trim())
                      .then((r) => {
                        setRoutes((current) => [...current, r.route]);
                        setRouteNetwork("");
                        setRouteComment("");
                        setRouteType(null);
                        push(`Added route ${network}.`, "success");
                      })
                      .catch((error: unknown) =>
                        push(error instanceof Error ? error.message : String(error), "error"),
                      )
                      .finally(() => setRouteBusy(null));
                  }}
                >
                  <div className="route-choice">
                    <button type="button" className={`route-option ${routeType === "cidr" ? "active" : ""}`} onClick={() => setRouteType("cidr")}>
                      <strong>Private CIDR</strong>
                      <span>Route traffic for a private network range through this node.</span>
                    </button>
                    <button type="button" className={`route-option ${routeType === "hostname" ? "active" : ""}`} onClick={() => setRouteType("hostname")}>
                      <strong>Private hostname</strong>
                      <span>Map a private hostname to this node so devices can resolve it.</span>
                    </button>
                  </div>
                  <div className="field">
                    <label htmlFor="route-network">{routeType === "hostname" ? "Hostname" : "CIDR"}</label>
                    <input
                      id="route-network"
                      type="text"
                      value={routeNetwork}
                      placeholder={routeType === "hostname" ? "wiki.internal.local" : "10.0.0.0/24"}
                      disabled={Boolean(routeBusy) || Boolean(settings?.demo)}
                      onChange={(e) => setRouteNetwork(e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="route-comment">Description (optional)</label>
                    <input
                      id="route-comment"
                      type="text"
                      maxLength={100}
                      value={routeComment}
                      disabled={Boolean(routeBusy) || Boolean(settings?.demo)}
                      onChange={(e) => setRouteComment(e.target.value)}
                    />
                  </div>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={Boolean(routeBusy) || Boolean(settings?.demo) || !routeNetwork.trim()}
                  >
                    {routeBusy === "create" ? <Spinner label="Adding…" /> : "Add route"}
                  </button>
                  <button type="button" className="btn" disabled={Boolean(routeBusy)} onClick={() => setRouteType(null)}>Cancel</button>
                </form>}
              </div>
            )}

            {drawerEntry.kind === "node" && isNodeInitial(drawerEntry.status) && (
              <div className="install-box">
                <div className="row-actions">
                  <strong style={{ fontSize: "0.85rem" }}>Install &amp; connect (warp-cli)</strong>
                  <button
                    className="btn"
                    disabled={!installCmd || installLoading || locked}
                    onClick={() =>
                      void (async () => {
                        if (!installCmd) return;
                        try {
                          await copyText(installCmd);
                          push("Install command copied.", "success");
                        } catch (e) {
                          push(
                            e instanceof Error ? e.message : "Could not copy",
                            "error",
                          );
                        }
                      })()
                    }
                  >
                    Copy
                  </button>
                </div>
                <p className="hint" style={{ marginTop: "0.4rem" }}>
                  Run on the host that should join this mesh node (Debian/Ubuntu).
                </p>
                <pre>
                  {installLoading ? (
                    <span className="btn-spin">
                      <Loader2 size={14} strokeWidth={2.5} className="spin" aria-hidden />
                      Loading token…
                    </span>
                  ) : (
                    (installCmd ?? "—")
                    )}
                  </pre>
              </div>
            )}

            <div className="row-actions drawer-danger-actions" style={{ marginTop: "1.5rem" }}>
              <button
                className="btn btn-danger"
                disabled={locked}
                onClick={() => {
                  const label = drawerEntry.kind === "node" ? "node" : "device";
                  if (!confirm(`Delete ${label} "${drawerEntry.name}"?`)) return;
                  void run("delete", async () => {
                    await api.remove(drawerEntry.kind, drawerEntry.id);
                    push(`Deleted ${label} "${drawerEntry.name}". DNS updated.`, "success");
                    closeDrawer();
                  });
                }}
              >
                {busy === "delete" ? <Spinner label="Deleting…" /> : `Delete ${drawerEntry.kind}`}
              </button>
              {drawerEntry.kind === "node" && (
                <button
                  className="btn"
                  disabled={locked}
                  onClick={() => {
                    if (!confirm("Regenerate this node? The current node and its install code will be deleted and replaced.")) return;
                    void run("regenerate", regenerateNodeCode).then(async (replacementId) => {
                      if (!replacementId) return;
                      try {
                        const replacement = (await api.listMesh()).entries.find((entry) => entry.id === replacementId);
                        if (!replacement) throw new Error("Regenerated node was not found after refresh");
                        openEntry(replacement);
                        push("Node regenerated. Open the new inactive node to get its install code.", "success");
                      } catch (error) {
                        push(error instanceof Error ? error.message : String(error), "error");
                      }
                    });
                  }}
                >
                  {busy === "regenerate" ? <Spinner label="Regenerating…" /> : "Regenerate"}
                </button>
              )}
            </div>
          </aside>
        </div>
      )}

      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
