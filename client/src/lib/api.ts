export type MeshEntry = {
  kind: "node" | "device";
  id: string;
  deviceId?: string;
  name: string;
  meshHostname: string | null;
  ipv4: string | null;
  ipv6: string | null;
  status: string;
  lastSeenAt: string | null;
  createdAt: string;
  tunnelType?: string;
  isConnector: boolean;
};

export type MeshRoute = {
  id?: string;
  type: "cidr" | "hostname";
  network?: string;
  hostname?: string;
  comment?: string;
  created_at?: string;
};

export type SplitTunnelItem = {
  address?: string;
  host?: string;
  description?: string;
};

export type TunnelEntry = {
  id: string;
  name: string;
  status: "inactive" | "degraded" | "healthy" | "down";
  tun_type: "cfd_tunnel";
  config_src: "local" | "cloudflare";
  created_at: string;
  deleted_at: string | null;
  connections: TunnelConnection[];
  conns_active_at: string | null;
  conns_inactive_at: string | null;
  metadata?: Record<string, unknown>;
};

export type TunnelConnection = {
  id: string;
  uuid: string;
  colo_name: string;
  is_pending_reconnect: boolean;
  client_id: string;
  origin_ip: string;
  opened_at: string;
  version?: string;
};

export type TunnelIngressRule = {
  hostname?: string;
  path?: string;
  service: string;
  originRequest?: Record<string, unknown>;
};

export type SplitTunnelConfig = {
  mode: "include" | "exclude";
  include: SplitTunnelItem[];
  exclude: SplitTunnelItem[];
};

export type Settings = {
  offlineDays: number;
  dnsFilterEnabled: boolean;
  dnsFilterStatus: string;
  dnsFilterUrl: string;
  dnsFilterLastSyncedAt?: string | null;
  meshSuffix: string;
  lastDnsSyncAt?: string | null;
  lastCleanupAt?: string | null;
  accountName?: string | null;
  accountEmail?: string | null;
  demo?: boolean;
  dnsLocation?: {
    id: string;
    name?: string;
    clientDefault: boolean;
    dohSubdomain?: string;
    ipv4Destination?: string;
    ipv4DestinationBackup?: string;
    ipv6Destination?: string;
    sourceNetworks: string[];
    endpoints: { ipv4: boolean; ipv6: boolean; doh: boolean };
  } | null;
};

export type SettingsPatch = Partial<{
  offlineDays: number;
  dnsFilterEnabled: boolean;
  dnsFilterUrl: string;
  meshSuffix: string;
  dnsIpv4Enabled: boolean;
  dnsIpv6Enabled: boolean;
  dnsDohEnabled: boolean;
  dnsSourceNetwork: string;
}>;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string; message?: string };
      message = body.error || body.message || message;
    } catch {
      /* ignore */
    }
    const error = new Error(message) as Error & { status?: number };
    error.status = res.status;
    throw error;
  }

  if (res.status === 204) return undefined as T;
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return (await res.json()) as T;
  return (await res.text()) as T;
}

export const api = {
  authStatus: () => request<{ required: boolean; authenticated: boolean }>("/api/auth/status"),
  login: (password: string) =>
    request<{ required: boolean; authenticated: boolean }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ password }),
    }),
  logout: () => request<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),
  settings: () => request<Settings>("/api/settings"),
  patchSettings: (body: SettingsPatch) =>
    request<Settings>("/api/settings", { method: "PATCH", body: JSON.stringify(body) }),
  listMesh: () => request<{ entries: MeshEntry[] }>("/api/mesh"),
  createNode: (name: string) =>
    request<{ node: { id: string; name: string; created_at?: string }; notice?: string }>(
      "/api/mesh/nodes",
      {
        method: "POST",
        body: JSON.stringify({ name }),
      },
    ),
  getNodeToken: (id: string) =>
    request<{ token: string; decoded: unknown }>(`/api/mesh/nodes/${id}/token`),
  recreateNode: (id: string) =>
    request<{ node: { id: string; name: string; created_at?: string } }>(`/api/mesh/nodes/${id}/regenerate`, {
      method: "POST",
    }),
  listNodeRoutes: (id: string) =>
    request<{ routes: MeshRoute[] }>(`/api/mesh/nodes/${id}/routes`),
  createNodeRoute: (
    id: string,
    type: "cidr" | "hostname",
    value: string,
    comment: string,
  ) =>
    request<{ route: MeshRoute }>(`/api/mesh/nodes/${id}/routes`, {
      method: "POST",
      body: JSON.stringify({
        type,
        ...(type === "cidr" ? { network: value } : { hostname: value }),
        comment: comment || undefined,
      }),
    }),
  removeNodeRoute: (nodeId: string, routeId: string) =>
    request<{ ok: boolean }>(`/api/mesh/nodes/${nodeId}/routes/${routeId}`, {
      method: "DELETE",
    }),
  rename: (kind: "node" | "device", id: string, name: string) =>
    request<{ notice?: string; renamed: unknown; displaced?: unknown }>(
      `/api/mesh/${kind}/${id}`,
      { method: "PATCH", body: JSON.stringify({ name }) },
    ),
  remove: (kind: "node" | "device", id: string) =>
    request<{ ok: boolean }>(`/api/mesh/${kind}/${id}`, { method: "DELETE" }),
  splitTunnels: () => request<SplitTunnelConfig>("/api/settings/split-tunnels"),
  saveSplitTunnels: (mode: "include" | "exclude", items: SplitTunnelItem[]) =>
    request<SplitTunnelConfig>("/api/settings/split-tunnels", {
      method: "PUT",
      body: JSON.stringify({ mode, items }),
    }),
  syncDns: () =>
    request<{ dns: unknown; lastDnsSyncAt?: string }>("/api/mesh/sync-dns", {
      method: "POST",
    }),
  cleanup: () =>
    request<{
      cleanup: {
        scanned: number;
        deleted: number;
        skippedConnector: number;
        skippedRecent: number;
        deletedNames: string[];
      };
      lastCleanupAt?: string;
    }>("/api/mesh/cleanup", {
      method: "POST",
    }),
  // ── Cloudflare Tunnels ──────────────────────────────────────────────────
  listTunnels: () => request<{ tunnels: TunnelEntry[] }>("/api/tunnels"),
  createTunnel: (name: string, configSrc: "local" | "cloudflare" = "cloudflare") =>
    request<{ tunnel: TunnelEntry }>("/api/tunnels", {
      method: "POST",
      body: JSON.stringify({ name, config_src: configSrc }),
    }),
  getTunnel: (id: string) => request<TunnelEntry>(`/api/tunnels/${id}`),
  updateTunnel: (id: string, body: { name?: string; config_src?: "local" | "cloudflare" }) =>
    request<TunnelEntry>(`/api/tunnels/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteTunnel: (id: string) =>
    request<{ ok: boolean }>(`/api/tunnels/${id}`, { method: "DELETE" }),
  getTunnelToken: (id: string) =>
    request<{ token: string }>(`/api/tunnels/${id}/token`),
  getTunnelConfig: (id: string) =>
    request<{ config: { ingress: TunnelIngressRule[] } }>(`/api/tunnels/${id}/config`),
  setTunnelConfig: (id: string, config: { config: { ingress: TunnelIngressRule[] } }) =>
    request<{ config: { ingress: TunnelIngressRule[] } }>(`/api/tunnels/${id}/config`, {
      method: "PUT",
      body: JSON.stringify(config),
    }),
  getTunnelConnections: (id: string) =>
    request<TunnelConnection[]>(`/api/tunnels/${id}/connections`),

};
