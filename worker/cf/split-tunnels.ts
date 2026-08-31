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
  const res = await cf.request<DevicePolicy>("GET", cf.accountPath("/devices/policies/default"));
  const policy = res.result ?? {};
  return {
    mode: policy.include !== undefined ? "include" : "exclude",
    include: policy.include ?? [],
    exclude: policy.exclude ?? [],
  };
}

export async function setDefaultSplitTunnels(
  cf: CloudflareClient,
  mode: SplitTunnelMode,
  items: SplitTunnelItem[],
): Promise<SplitTunnelItem[]> {
  const res = await cf.request<SplitTunnelItem[]>(
    "PUT",
    cf.accountPath(`/devices/policies/default/${mode}`),
    items,
  );
  return res.result ?? [];
}
