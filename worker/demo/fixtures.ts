import type { CloudflareTunnel, MeshEntry, MeshRoute, TunnelConfig, Settings } from "../types";

function hoursAgo(h: number, now = Date.now()): string {
  return new Date(now - h * 3_600_000).toISOString();
}

function daysAgo(d: number, now = Date.now()): string {
  return new Date(now - d * 86_400_000).toISOString();
}

/** Build demo inventory at request time (Workers can freeze Date during module init). */
export function buildDemoEntries(now = Date.now()): MeshEntry[] {
  return [
    {
      kind: "node",
      id: "demo-node-edge-1",
      name: "edge-1",
      meshHostname: "edge-1.mesh",
      ipv4: "100.96.0.10",
      ipv6: "2606:4700:cf1:1000::a",
      status: "healthy",
      lastSeenAt: hoursAgo(0.1, now),
      createdAt: daysAgo(40, now),
      tunnelType: "warp_connector",
      isConnector: true,
    },
    {
      kind: "node",
      id: "demo-node-lab",
      name: "lab-gw",
      meshHostname: "lab-gw.mesh",
      ipv4: "100.96.0.20",
      ipv6: "2606:4700:cf1:1000::14",
      status: "healthy",
      lastSeenAt: hoursAgo(2, now),
      createdAt: daysAgo(28, now),
      tunnelType: "warp_connector",
      isConnector: true,
    },
    {
      kind: "node",
      id: "demo-node-spare",
      name: "spare-node",
      meshHostname: null,
      ipv4: null,
      ipv6: null,
       status: "inactive",
      lastSeenAt: null,
      createdAt: daysAgo(3, now),
      tunnelType: "warp_connector",
      isConnector: true,
    },
    {
      kind: "device",
      id: "demo-dev-laptop",
      deviceId: "demo-dev-laptop-device",
      name: "bagas-laptop",
      meshHostname: "bagas-laptop.mesh",
      ipv4: "100.96.0.40",
      ipv6: "2606:4700:cf1:1000::28",
      status: "online",
      lastSeenAt: hoursAgo(0.2, now),
      createdAt: daysAgo(14, now),
      tunnelType: "wireguard",
      isConnector: false,
    },
    {
      kind: "device",
      id: "demo-dev-phone",
      deviceId: "demo-dev-phone-device",
      name: "pixel-9",
      meshHostname: "pixel-9.mesh",
      ipv4: "100.96.0.41",
      ipv6: "2606:4700:cf1:1000::29",
      status: "online",
      lastSeenAt: hoursAgo(0.05, now),
      createdAt: daysAgo(10, now),
      tunnelType: "masque",
      isConnector: false,
    },
    {
      kind: "device",
      id: "demo-dev-tablet",
      deviceId: "demo-dev-tablet-device",
      name: "ipad-mini",
      meshHostname: "ipad-mini.mesh",
      ipv4: "100.96.0.42",
      ipv6: null,
      status: "offline",
      lastSeenAt: daysAgo(2, now),
      createdAt: daysAgo(21, now),
      tunnelType: "wireguard",
      isConnector: false,
    },
    {
      kind: "device",
      id: "demo-dev-stale",
      deviceId: "demo-dev-stale-device",
      name: "old-chromebook",
      meshHostname: "old-chromebook.mesh",
      ipv4: "100.96.0.50",
      ipv6: null,
      status: "offline",
      lastSeenAt: daysAgo(12, now),
      createdAt: daysAgo(60, now),
      tunnelType: "wireguard",
      isConnector: false,
    },
  ];
}

export function buildDemoRoutes(nodeId: string, now = Date.now()): MeshRoute[] {
  if (nodeId === "demo-node-edge-1") {
    return [
      {
        id: "demo-route-office",
        type: "cidr",
        network: "10.10.0.0/24",
        comment: "Office LAN",
        tunnel_id: nodeId,
        tun_type: "warp_connector",
        created_at: daysAgo(20, now),
      },
      {
        id: "demo-route-services",
        network: "fd00:10:10::/64",
        comment: "Internal services",
        tunnel_id: nodeId,
        tun_type: "warp_connector",
        created_at: daysAgo(12, now),
      },
    ];
  }
  if (nodeId === "demo-node-lab") {
    return [
      {
        id: "demo-route-lab",
        network: "192.168.50.0/24",
        comment: "Lab subnet",
        tunnel_id: nodeId,
        tun_type: "warp_connector",
        created_at: daysAgo(8, now),
      },
    ];
  }
  return [];
}

export function buildDemoSettings(now = Date.now()): Settings & { demo: true } {
  return {
    demo: true,
    offlineDays: 7,
    dnsFilterEnabled: true,
    dnsFilterStatus: "enabled",
    dnsFilterUrl: "https://raw.githubusercontent.com/hagezi/dns-blocklists/main/adblock/light.txt",
    dnsFilterLastSyncedAt: hoursAgo(3, now),
    meshSuffix: "mesh",
    lastDnsSyncAt: hoursAgo(0.5, now),
    lastCleanupAt: daysAgo(1, now),
    accountName: "Demo Org",
    accountEmail: "demo@meshflare.example",
    dnsLocation: {
      id: "demo-dns-location",
      name: "Default",
      clientDefault: true,
      dohSubdomain: "demo-location",
      ipv4Destination: "172.64.36.1",
      ipv4DestinationBackup: "172.64.36.2",
      ipv6Destination: "2a06:98c1:54::24:8c7c",
      sourceNetworks: [],
      endpoints: { ipv4: false, ipv6: false, doh: true },
    },
  };
}

export function isDemoMode(env: { DEMO_MODE?: string | boolean }): boolean {
  const v = env.DEMO_MODE;
  if (typeof v === "boolean") return v;
  const s = String(v ?? "")
    .trim()
    .toLowerCase();
  return s === "1" || s === "true" || s === "yes";
}

export function buildDemoTunnels(now = Date.now()): CloudflareTunnel[] {
  return [
    {
      id: "demo-tunnel-web",
      account_tag: "demo-account",
      name: "web-services",
      status: "healthy",
      tun_type: "cfd_tunnel",
      config_src: "cloudflare",
      created_at: daysAgo(30, now),
      deleted_at: null,
      conns_active_at: hoursAgo(0.05, now),
      conns_inactive_at: null,
      connections: [
        {
          id: "conn-1",
          uuid: "conn-1-uuid",
          colo_name: "CGK",
          is_pending_reconnect: false,
          client_id: "client-1",
          origin_ip: "203.0.113.42",
          opened_at: hoursAgo(0.05, now),
          version: "2025.10.0",
        },
      ],
      metadata: { environment: "production" },
    },
    {
      id: "demo-tunnel-api",
      account_tag: "demo-account",
      name: "api-backend",
      status: "healthy",
      tun_type: "cfd_tunnel",
      config_src: "cloudflare",
      created_at: daysAgo(20, now),
      deleted_at: null,
      conns_active_at: hoursAgo(1, now),
      conns_inactive_at: null,
      connections: [
        {
          id: "conn-2",
          uuid: "conn-2-uuid",
          colo_name: "NRT",
          is_pending_reconnect: false,
          client_id: "client-2",
          origin_ip: "198.51.100.10",
          opened_at: hoursAgo(1, now),
          version: "2025.10.0",
        },
      ],
    },
    {
      id: "demo-tunnel-dev",
      account_tag: "demo-account",
      name: "dev-server",
      status: "inactive",
      tun_type: "cfd_tunnel",
      config_src: "local",
      created_at: daysAgo(5, now),
      deleted_at: null,
      conns_active_at: null,
      conns_inactive_at: null,
      connections: [],
    },
  ];
}

export function buildDemoTunnelConfig(tunnelId: string): TunnelConfig {
  if (tunnelId === "demo-tunnel-web") {
    return {
      config: {
        ingress: [
          { hostname: "app.example.com", service: "http://localhost:3000" },
          { hostname: "blog.example.com", service: "http://localhost:8080" },
          { service: "http_status:404" },
        ],
        warp_routing: { enabled: false },
      },
      source: "cloudflare",
    };
  }
  if (tunnelId === "demo-tunnel-api") {
    return {
      config: {
        ingress: [
          { hostname: "api.example.com", service: "http://localhost:4000", path: "/v1" },
          { hostname: "api.example.com", service: "http://localhost:4001", path: "/v2" },
          { service: "http_status:404" },
        ],
      },
      source: "cloudflare",
    };
  }
  return {
    config: { ingress: [{ service: "http_status:404" }] },
    source: "local",
  };
}

export const DEMO_READ_ONLY =
  "Demo is read-only. Deploy your own meshflare instance to manage mesh entries and routes.";
