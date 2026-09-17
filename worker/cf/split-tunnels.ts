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

export function auditMeshRouting(config: SplitTunnelConfig): SplitTunnelAudit {
  const meshSubnet = "100.96.0.0/12";
  const cgnatSubnet = "100.64.0.0/10";

  if (config.mode === "include") {
    const included = config.include.some(
      (item) =>
        item.address === meshSubnet ||
        item.address === cgnatSubnet ||
        item.address === "0.0.0.0/0",
    );
    if (!included) {
      return {
        meshIpsRouted: false,
        warning:
          "Split Tunnels is in Include mode, but the Mesh IP range (100.96.0.0/12) is not included. Devices cannot reach each other by .mesh hostname until 100.96.0.0/12 is added.",
      };
    }
    return { meshIpsRouted: true };
  }

  const excluded = config.exclude.some(
    (item) => item.address === meshSubnet || item.address === cgnatSubnet,
  );
  if (excluded) {
    return {
      meshIpsRouted: false,
      warning:
        "Split Tunnels is in Exclude mode and contains 100.64.0.0/10 or 100.96.0.0/12. Traffic to .mesh IPs will bypass WARP. Remove this exclusion for .mesh connectivity.",
    };
  }

  return { meshIpsRouted: true };
}

/**
 * Automatically adjust split tunnel configuration so that Cloudflare Mesh
 * IP space (100.96.0.0/12) is routed through WARP.
 */
export function ensureMeshRouting(config: SplitTunnelConfig): SplitTunnelConfig {
  const meshSubnet = "100.96.0.0/12";
  const cgnatSubnet = "100.64.0.0/10";

  if (config.mode === "include") {
    const included = config.include.some(
      (item) =>
        item.address === meshSubnet ||
        item.address === cgnatSubnet ||
        item.address === "0.0.0.0/0",
    );
    if (!included) {
      return {
        ...config,
        include: [
          ...config.include,
          { address: meshSubnet, description: "Cloudflare Mesh (WARP Connector)" },
        ],
      };
    }
    return config;
  }

  const nextExclude = config.exclude.filter(
    (item) => item.address !== meshSubnet && item.address !== cgnatSubnet,
  );
  return {
    ...config,
    exclude: nextExclude,
  };
}
