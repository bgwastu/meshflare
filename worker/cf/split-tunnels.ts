import type { CloudflareClient } from "./client";

export type SplitTunnelItem = {
  address?: string;
  host?: string;
  description?: string;
};

export type SplitTunnelMode = "include" | "exclude";

type DevicePolicy = {
  include?: SplitTunnelItem[];
  exclude?: SplitTunnelItem[];
};

export type SplitTunnelConfig = {
  mode: SplitTunnelMode;
  include: SplitTunnelItem[];
  exclude: SplitTunnelItem[];
};

export async function getDefaultSplitTunnels(
  cf: CloudflareClient,
): Promise<SplitTunnelConfig> {
  const [policy, include, exclude] = await Promise.all([
    cf.request<DevicePolicy>("GET", cf.accountPath("/devices/policy")),
    cf.request<SplitTunnelItem[]>("GET", cf.accountPath("/devices/policy/include")),
    cf.request<SplitTunnelItem[]>("GET", cf.accountPath("/devices/policy/exclude")),
  ]);
  return {
    mode: policy.result.include !== undefined ? "include" : "exclude",
    include: include.result ?? [],
    exclude: exclude.result ?? [],
  };
}

export async function setDefaultSplitTunnels(
  cf: CloudflareClient,
  mode: SplitTunnelMode,
  items: SplitTunnelItem[],
): Promise<SplitTunnelItem[]> {
  const res = await cf.request<SplitTunnelItem[]>(
    "PUT",
    cf.accountPath(`/devices/policy/${mode}`),
    items,
  );
  return res.result ?? [];
}

export type SplitTunnelAudit = {
  meshIpsRouted: boolean;
  warning?: string;
};

const MESH_SUBNET = "100.96.0.0/12";
const CGNAT_SUBNET = "100.64.0.0/10";

/** Include mode: an entry that sends Mesh IPs through WARP. */
const routesMesh = (item: SplitTunnelItem) =>
  item.address === MESH_SUBNET || item.address === CGNAT_SUBNET || item.address === "0.0.0.0/0";

/** Exclude mode: an entry that makes Mesh IPs bypass WARP. */
const bypassesMesh = (item: SplitTunnelItem) =>
  item.address === MESH_SUBNET || item.address === CGNAT_SUBNET;

export function auditMeshRouting(config: SplitTunnelConfig): SplitTunnelAudit {
  if (config.mode === "include") {
    return config.include.some(routesMesh)
      ? { meshIpsRouted: true }
      : {
          meshIpsRouted: false,
          warning:
            `Split Tunnels is in Include mode, but the Mesh IP range (${MESH_SUBNET}) is not included. Devices cannot reach each other by .mesh hostname until ${MESH_SUBNET} is added.`,
        };
  }
  return config.exclude.some(bypassesMesh)
    ? {
        meshIpsRouted: false,
        warning:
          `Split Tunnels is in Exclude mode and contains ${CGNAT_SUBNET} or ${MESH_SUBNET}. Traffic to .mesh IPs will bypass WARP. Remove this exclusion for .mesh connectivity.`,
      }
    : { meshIpsRouted: true };
}

/**
 * Automatically adjust split tunnel configuration so that Cloudflare Mesh
 * IP space (100.96.0.0/12) is routed through WARP.
 */
export function ensureMeshRouting(config: SplitTunnelConfig): SplitTunnelConfig {
  if (config.mode === "include") {
    if (config.include.some(routesMesh)) return config;
    return {
      ...config,
      include: [...config.include, { address: MESH_SUBNET, description: "Cloudflare Mesh (WARP Connector)" }],
    };
  }
  return { ...config, exclude: config.exclude.filter((item) => !bypassesMesh(item)) };
}
