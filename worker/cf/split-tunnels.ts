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
