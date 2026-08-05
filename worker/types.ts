import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import type { schema } from "./db/schema";

export type AppData = {
  offlineDays: number;
  dnsFilterEnabled: boolean;
  dnsFilterStatus: string;
  dnsFilterUrl: string;
  dnsFilterLastSyncedAt: string | null;
  dnsFilterCursor: number;
  meshSuffix: string;
  lastDnsSyncAt: string | null;
  lastCleanupAt: string | null;
  dnsMissingSince: Record<string, string>;
};

export type SettingsPatch = Partial<{
  offlineDays: number;
  dnsFilterEnabled: boolean;
  dnsFilterUrl: string;
  meshSuffix: string;
}>;

export type AppDatabase = BaseSQLiteDatabase<"sync" | "async", unknown, typeof schema>;

export type Env = {
  DB: AppDatabase;
  CLOUDFLARE_ACCOUNT_ID: string;
  CLOUDFLARE_API_TOKEN?: string;
  MESH_DNS_SUFFIX: string;
  DEFAULT_OFFLINE_DAYS: string;
  DNS_FILTER_LIST_PREFIX: string;
  DNS_FILTER_RULE_NAME: string;
  MESH_RULE_PREFIX: string;
  MESHFLARE_PASSWORD?: string;
  DATA_DIR: string;
  PORT: string;
  /** When true/1, serve fixture inventory and reject writes. */
  DEMO_MODE?: string;
};

export type MeshNode = {
  id: string;
  name: string;
  status: string;
  created_at: string;
  tun_type?: string;
  connections?: Array<{
    client_id?: string;
    uuid?: string;
    id?: string;
    opened_at?: string;
    origin_ip?: string;
    colo_name?: string;
  }>;
};

export type MeshRoute = {
  id?: string;
  type?: "cidr" | "hostname";
  network?: string;
  hostname?: string;
  comment?: string;
  created_at?: string;
  deleted_at?: string | null;
  tunnel_id?: string;
  tun_type?: string;
};

export type DeviceRegistration = {
  id: string;
  created_at: string;
  last_seen_at: string | null;
  updated_at?: string;
  tunnel_type?: string;
  virtual_ipv4?: string | null;
  virtual_ipv6?: string | null;
  device: {
    id: string;
    name: string;
    client_version?: string;
  };
  user?: {
    email?: string;
    id?: string;
    name?: string;
  };
};

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

export type RenameResult = {
  renamed: { id: string; kind: "node" | "device"; from: string; to: string };
  displaced?: { id: string; kind: "node" | "device"; from: string; to: string };
  notice?: string;
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
  /** Present when DEMO_MODE is on. */
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
    endpoints: {
      ipv4: boolean;
      ipv6: boolean;
      doh: boolean;
    };
  } | null;
};

export type CloudflareTunnel = {
  id: string;
  account_tag: string;
  name: string;
  status: "inactive" | "degraded" | "healthy" | "down";
  tun_type: "cfd_tunnel";
  config_src: "local" | "cloudflare";
  created_at: string;
  deleted_at: string | null;
  connections: CloudflareTunnelConnection[];
  conns_active_at: string | null;
  conns_inactive_at: string | null;
  remote_config?: boolean;
  metadata?: Record<string, unknown>;
};

export type CloudflareTunnelConnection = {
  id: string;
  uuid: string;
  colo_name: string;
  is_pending_reconnect: boolean;
  client_id: string;
  origin_ip: string;
  opened_at: string;
  version?: string;
};

export type CloudflareConnector = {
  id: string;
  version: string;
  arch?: string;
  features?: string[];
  conns: CloudflareTunnelConnection[];
};

export type TunnelIngressRule = {
  hostname?: string;
  path?: string;
  service: string;
  originRequest?: Record<string, unknown>;
};

export type TunnelConfig = {
  config: {
    ingress: TunnelIngressRule[];
    originRequest?: Record<string, unknown>;
    warp_routing?: { enabled: boolean };
  };
  source: "local" | "cloudflare";
  created_at?: string;
};

export type CfApiResult<T> = {
  success: boolean;
  errors: Array<{ code: number; message: string }>;
  messages: unknown[];
  result: T;
  result_info?: {
    cursor?: string;
    count?: number;
    page?: number;
    per_page?: number;
    total_count?: number;
  };
};
