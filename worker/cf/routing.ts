import type { CloudflareClient } from "./client";
import { listTunnels } from "./cloudflare-tunnel";
import { listMeshNodes } from "./mesh";
import type { SplitTunnelConfig, SplitTunnelItem, SplitTunnelMode } from "./split-tunnels";
import type { MeshRoute } from "../types";

// ── Device profiles ──────────────────────────────────────────────────────

type DevicePolicyRecord = {
  policy_id: string;
  name?: string;
  description?: string;
  default?: boolean;
  enabled?: boolean;
  match?: string;
  precedence?: number;
  include?: SplitTunnelItem[];
  exclude?: SplitTunnelItem[];
};

export type RoutingProfile = SplitTunnelConfig & {
  id: string;
  name: string;
  isDefault: boolean;
  enabled: boolean;
  match: string | null;
  precedence: number | null;
};

const toProfile = (p: DevicePolicyRecord): RoutingProfile => ({
  id: p.policy_id,
  name: p.name || (p.default ? "Default" : p.policy_id),
  isDefault: Boolean(p.default),
  enabled: p.enabled !== false,
  match: p.match ?? null,
  precedence: p.precedence ?? null,
  mode: p.include !== undefined ? "include" : "exclude",
  include: p.include ?? [],
  exclude: p.exclude ?? [],
});

/** Default profile first, then custom profiles in evaluation order. */
export async function listProfiles(cf: CloudflareClient): Promise<RoutingProfile[]> {
  const res = await cf.request<DevicePolicyRecord[]>("GET", cf.accountPath("/devices/policies"));
  return (res.result ?? [])
    .map(toProfile)
    .sort((a, b) =>
      a.isDefault !== b.isDefault
        ? a.isDefault ? -1 : 1
        : (a.precedence ?? Infinity) - (b.precedence ?? Infinity),
    );
}

export async function getProfile(cf: CloudflareClient, id: string): Promise<RoutingProfile | null> {
  return (await listProfiles(cf)).find((p) => p.id === id) ?? null;
}

/** The default profile lives at `/devices/policy`; custom ones under their id. */
export async function setProfileSplitTunnels(
  cf: CloudflareClient,
  profile: Pick<RoutingProfile, "id" | "isDefault">,
  mode: SplitTunnelMode,
  items: SplitTunnelItem[],
): Promise<void> {
  const base = profile.isDefault ? "/devices/policy" : `/devices/policy/${profile.id}`;
  await cf.request("PUT", cf.accountPath(`${base}/${mode}`), items);
}

export type ProfileInput = { name: string; match: string; enabled: boolean };

/**
 * New profiles copy the Default profile's split tunnels, so they start out behaving like it.
 * Cloudflare needs a unique precedence; new ones go last (lowest priority).
 */
export async function createProfile(cf: CloudflareClient, input: ProfileInput): Promise<string | null> {
  const profiles = await listProfiles(cf);
  const base = profiles.find((p) => p.isDefault);
  const last = Math.max(0, ...profiles.map((p) => p.precedence ?? 0));
  const mode = base?.mode ?? "exclude";
  const { result } = await cf.request<DevicePolicyRecord>("POST", cf.accountPath("/devices/policy"), {
    name: input.name,
    match: input.match,
    enabled: input.enabled,
    precedence: last + 10,
    [mode]: base?.[mode] ?? [],
  });
  return result?.policy_id ?? null;
}

export async function updateProfile(cf: CloudflareClient, id: string, input: ProfileInput): Promise<void> {
  await cf.request("PATCH", cf.accountPath(`/devices/policy/${id}`), input);
}

export async function deleteProfile(cf: CloudflareClient, id: string): Promise<void> {
  await cf.request("DELETE", cf.accountPath(`/devices/policy/${id}`));
}

/** Device profiles page in the Zero Trust dashboard, for settings meshflare does not cover. */
export const profilesDashUrl = (accountId: string) =>
  `https://one.dash.cloudflare.com/${accountId}/team-resources/devices/device-profiles`;

// ── Routes (CIDR + hostname, on any connector) ───────────────────────────

export type ConnectorKind = "node" | "tunnel";

export type RoutingConnector = {
  id: string;
  name: string;
  kind: ConnectorKind;
  status: string;
};

export type RoutingRoute = {
  id: string;
  type: "cidr" | "hostname";
  value: string;
  comment: string;
  connectorId: string;
  createdAt: string | null;
};

export async function listConnectors(cf: CloudflareClient): Promise<RoutingConnector[]> {
  const [nodes, tunnels] = await Promise.all([listMeshNodes(cf), listTunnels(cf)]);
  return [
    ...nodes.map((n) => ({ id: n.id, name: n.name, kind: "node" as const, status: n.status })),
    ...tunnels.map((t) => ({ id: t.id, name: t.name, kind: "tunnel" as const, status: t.status })),
  ];
}

export async function listRoutes(cf: CloudflareClient, tunnelId?: string): Promise<RoutingRoute[]> {
  const cidrQuery = new URLSearchParams({ is_deleted: "false", per_page: "1000" });
  const hostQuery = new URLSearchParams({ is_deleted: "false", per_page: "1000" });
  if (tunnelId) {
    cidrQuery.set("tunnel_id", tunnelId);
    hostQuery.set("tunnel_id", tunnelId);
  }
  const [cidr, hostname] = await Promise.all([
    cf.request<MeshRoute[]>("GET", cf.accountPath(`/teamnet/routes?${cidrQuery}`)),
    cf.request<MeshRoute[]>("GET", cf.accountPath(`/zerotrust/routes/hostname?${hostQuery}`)),
  ]);
  const rows = (items: MeshRoute[] | undefined, type: RoutingRoute["type"]) =>
    (items ?? []).flatMap((r) =>
      r.id && r.tunnel_id
        ? [{
            id: r.id,
            type,
            value: (type === "cidr" ? r.network : r.hostname) ?? "",
            comment: r.comment ?? "",
            connectorId: r.tunnel_id,
            createdAt: r.created_at ?? null,
          }]
        : [],
    );
  return [...rows(cidr.result, "cidr"), ...rows(hostname.result, "hostname")];
}

/** Bare IPs become single-host CIDRs; anything else is treated as a hostname. */
export function classifyRouteValue(raw: string): { type: RoutingRoute["type"]; value: string } {
  const value = raw.trim().toLowerCase();
  if (/^\d{1,3}(\.\d{1,3}){3}(\/\d{1,2})?$/.test(value)) {
    return { type: "cidr", value: value.includes("/") ? value : `${value}/32` };
  }
  if (value.includes(":") && /^[0-9a-f:]+(\/\d{1,3})?$/.test(value)) {
    return { type: "cidr", value: value.includes("/") ? value : `${value}/128` };
  }
  return { type: "hostname", value: value.replace(/\.$/, "") };
}

export async function createRoute(
  cf: CloudflareClient,
  connectorId: string,
  type: RoutingRoute["type"],
  value: string,
  comment?: string,
): Promise<void> {
  const extra = comment ? { comment } : {};
  if (type === "hostname") {
    await cf.request("POST", cf.accountPath("/zerotrust/routes/hostname"), {
      tunnel_id: connectorId,
      hostname: value,
      ...extra,
    });
  } else {
    await cf.request("POST", cf.accountPath("/teamnet/routes"), {
      tunnel_id: connectorId,
      network: value,
      ...extra,
    });
  }
}

export async function deleteRoute(
  cf: CloudflareClient,
  type: RoutingRoute["type"],
  id: string,
): Promise<void> {
  const path = type === "hostname" ? `/zerotrust/routes/hostname/${id}` : `/teamnet/routes/${id}`;
  await cf.request("DELETE", cf.accountPath(path));
}

export async function updateRouteComment(
  cf: CloudflareClient,
  type: RoutingRoute["type"],
  id: string,
  comment: string,
): Promise<void> {
  const path = type === "hostname" ? `/zerotrust/routes/hostname/${id}` : `/teamnet/routes/${id}`;
  await cf.request("PATCH", cf.accountPath(path), { comment });
}

// ── Audit ────────────────────────────────────────────────────────────────

export type RoutingIssue = {
  code:
    | "mesh_not_routed"
    | "mesh_bypassed"
    | "resolved_ip_bypassed"
    | "resolved_ip_not_included"
    | "route_bypassed";
  severity: "error" | "warn";
  /** Split-tunnel entry or route value the issue is about. */
  subject?: string;
  /** Which fix the server can apply automatically. */
  fix?: "ensure_mesh" | "ensure_resolved_ip";
};

export const MESH_SUBNET = "100.96.0.0/12";
export const RESOLVED_IP_V4 = "172.64.128.0/20";
export const RESOLVED_IP_V6 = "2606:4700:cf1:4000::/64";

function parseV4(cidr: string): [number, number] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?:\/(\d{1,2}))?$/.exec(cidr.trim());
  if (!m) return null;
  const octets = m.slice(1, 5).map(Number);
  if (octets.some((o) => o > 255)) return null;
  const bits = m[5] === undefined ? 32 : Number(m[5]);
  if (bits > 32) return null;
  const ip = ((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>> 0;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return [(ip & mask) >>> 0, bits];
}

/** True when two IPv4 CIDRs share any address. */
export function v4Overlaps(a: string, b: string): boolean {
  const pa = parseV4(a);
  const pb = parseV4(b);
  if (!pa || !pb) return false;
  const bits = Math.min(pa[1], pb[1]);
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return ((pa[0] & mask) >>> 0) === ((pb[0] & mask) >>> 0);
}

/** Split-tunnel host semantics: `*.x` matches subdomains of x, `x` matches only x. */
export function hostMatches(pattern: string, host: string): boolean {
  const p = pattern.toLowerCase().replace(/\.$/, "");
  const h = host.toLowerCase().replace(/\.$/, "");
  if (p.startsWith("*.")) return h.endsWith(p.slice(1));
  return p === h;
}

/** Hostname-route semantics: `x` and `*.x` both resolve x's children (wildcards are stored trimmed). */
function routeHostCovers(route: string, host: string): boolean {
  const r = route.toLowerCase().replace(/^\*\./, "");
  const h = host.toLowerCase();
  return h === r || h.endsWith(`.${r}`);
}

export function auditProfile(profile: SplitTunnelConfig, routes: RoutingRoute[]): RoutingIssue[] {
  const issues: RoutingIssue[] = [];
  const addresses = (items: SplitTunnelItem[]) => items.flatMap((i) => (i.address ? [i.address] : []));
  const hostRoutes = routes.filter((r) => r.type === "hostname");

  if (profile.mode === "include") {
    const inc = addresses(profile.include);
    if (!inc.some((a) => a === "0.0.0.0/0" || v4Overlaps(a, MESH_SUBNET))) {
      issues.push({ code: "mesh_not_routed", severity: "warn", fix: "ensure_mesh" });
    }
    if (hostRoutes.length > 0 && !inc.some((a) => v4Overlaps(a, RESOLVED_IP_V4))) {
      issues.push({ code: "resolved_ip_not_included", severity: "warn", fix: "ensure_resolved_ip" });
    }
    return issues;
  }

  for (const addr of addresses(profile.exclude)) {
    if (v4Overlaps(addr, MESH_SUBNET)) {
      issues.push({ code: "mesh_bypassed", severity: "error", subject: addr, fix: "ensure_mesh" });
    }
    if (hostRoutes.length > 0 && v4Overlaps(addr, RESOLVED_IP_V4)) {
      issues.push({ code: "resolved_ip_bypassed", severity: "error", subject: addr, fix: "ensure_resolved_ip" });
    }
  }

  // A routed hostname that is also excluded never reaches the tunnel.
  for (const item of profile.exclude) {
    if (!item.host) continue;
    const bare = item.host.replace(/^\*\./, "");
    const hit = hostRoutes.find((r) => routeHostCovers(r.value, bare) || hostMatches(item.host!, r.value));
    if (hit) issues.push({ code: "route_bypassed", severity: "warn", subject: hit.value });
  }
  return issues;
}

/** Make the profile send Mesh IPs and/or hostname-route IPs through WARP. */
export function remediate(
  profile: SplitTunnelConfig,
  fix: NonNullable<RoutingIssue["fix"]>,
): { mode: SplitTunnelMode; items: SplitTunnelItem[] } {
  const target = fix === "ensure_mesh" ? MESH_SUBNET : RESOLVED_IP_V4;
  if (profile.mode === "include") {
    if (profile.include.some((i) => i.address && v4Overlaps(i.address, target))) {
      return { mode: "include", items: profile.include };
    }
    const extra: SplitTunnelItem[] =
      fix === "ensure_mesh"
        ? [{ address: MESH_SUBNET, description: "Cloudflare Mesh" }]
        : [
            { address: RESOLVED_IP_V4, description: "Hostname routes (initial resolved IPs)" },
            { address: RESOLVED_IP_V6, description: "Hostname routes (initial resolved IPs, IPv6)" },
          ];
    return { mode: "include", items: [...profile.include, ...extra] };
  }
  return {
    mode: "exclude",
    items: profile.exclude.filter((i) => !(i.address && v4Overlaps(i.address, target))),
  };
}
