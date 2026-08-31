import type { CloudflareClient } from "./client";
import { getMeshSuffix } from "./dns-filter";
import { syncMeshDnsRules, type MeshDnsOptions } from "./gateway";
import { listDeviceRegistrations, listMeshNodes } from "./mesh";
import { devicePresenceStatus, isConnectorRegistration, meshHostname } from "./names";
import type { DeviceRegistration, Env, MeshEntry, MeshNode, Settings } from "../types";
import { readAppData, updateAppData } from "../db/settings";

export type GatewayLocation = {
  id?: string;
  name?: string;
  client_default?: boolean;
  doh_subdomain?: string;
  endpoints?: {
    ipv4?: { enabled?: boolean };
    ipv6?: { enabled?: boolean };
    doh?: { enabled?: boolean; require_token?: boolean };
    dot?: { enabled?: boolean; require_token?: boolean };
  };
  ip?: string;
  ipv4_destination?: string;
  ipv4_destination_backup?: string;
  networks?: Array<{ network?: string }>;
};

export type GatewayDnsEndpointUpdate = {
  ipv4?: boolean;
  ipv6?: boolean;
  doh?: boolean;
  sourceNetworks?: string[];
};

export async function getDefaultGatewayDnsLocation(
  cf: CloudflareClient,
): Promise<GatewayLocation | null> {
  const res = await cf.request<GatewayLocation[]>("GET", cf.accountPath("/gateway/locations"));
  return res.result?.find((item) => item.client_default) ?? null;
}

export function serializeGatewayDnsLocation(
  location: GatewayLocation | null,
): Settings["dnsLocation"] {
  if (!location?.id) return null;
  return {
    id: location.id,
    name: location.name,
    clientDefault: Boolean(location.client_default),
    dohSubdomain: location.doh_subdomain,
    ipv4Destination: location.ipv4_destination,
    ipv4DestinationBackup: location.ipv4_destination_backup,
    ipv6Destination: location.ip,
    sourceNetworks: (location.networks ?? [])
      .map((item) => item.network)
      .filter((network): network is string => Boolean(network)),
    endpoints: {
      ipv4: Boolean(location.endpoints?.ipv4?.enabled),
      ipv6: Boolean(location.endpoints?.ipv6?.enabled),
      doh: Boolean(location.endpoints?.doh?.enabled),
    },
  };
}

export async function updateDefaultGatewayDnsLocation(
  cf: CloudflareClient,
  update: GatewayDnsEndpointUpdate,
): Promise<NonNullable<Settings["dnsLocation"]>> {
  const location = await getDefaultGatewayDnsLocation(cf);
  if (!location?.id) throw new Error("Cloudflare Zero Trust has no default DNS location");
  const endpoints = location.endpoints ?? {};
  const enableIpv4ForNetwork = Boolean(update.sourceNetworks?.length) && update.ipv4 === undefined;
  const res = await cf.request<GatewayLocation>(
    "PUT",
    cf.accountPath(`/gateway/locations/${location.id}`),
    {
      name: location.name,
      client_default: location.client_default,
      endpoints: {
        ...endpoints,
        ...(update.ipv4 === undefined && !enableIpv4ForNetwork
          ? {}
          : { ipv4: { ...endpoints.ipv4, enabled: update.ipv4 ?? true } }),
        ...(update.ipv6 === undefined ? {} : { ipv6: { ...endpoints.ipv6, enabled: update.ipv6 } }),
        ...(update.doh === undefined ? {} : { doh: { ...endpoints.doh, enabled: update.doh } }),
      },
      ...(update.sourceNetworks
        ? { networks: update.sourceNetworks.map((network) => ({ network })) }
        : {}),
    },
  );
  const updated = serializeGatewayDnsLocation(res.result);
  if (!updated) throw new Error("Cloudflare Zero Trust returned an invalid DNS location");
  return updated;
}

/** Build unified mesh inventory (nodes + devices). */
export async function buildMeshInventory(
  cf: CloudflareClient,
  env: Env,
): Promise<MeshEntry[]> {
  const suffix = await getMeshSuffix(env);
  const [nodes, regs] = await Promise.all([
    listMeshNodes(cf),
    listDeviceRegistrations(cf, "active"),
  ]);

  const connectorRegsByName = new Map<string, DeviceRegistration>();
  const regsById = new Map<string, DeviceRegistration>();
  const deviceEntries: MeshEntry[] = [];

  for (const reg of regs) {
    regsById.set(reg.id, reg);
    if (reg.device?.id) regsById.set(reg.device.id, reg);

    const name = reg.device?.name?.trim() || "unnamed";
    const ipv4 = reg.virtual_ipv4?.trim() || null;
    const ipv6 = reg.virtual_ipv6?.trim() || null;
    const connector = isConnectorRegistration(reg);

    if (connector) {
      const key = name.toLowerCase();
      const prev = connectorRegsByName.get(key);
      if (!prev || newerRegistration(reg, prev)) {
        connectorRegsByName.set(key, reg);
      }
      continue;
    }

    deviceEntries.push({
      kind: "device",
      id: reg.id,
      deviceId: reg.device?.id ?? reg.id,
      name,
      meshHostname: ipv4 ? meshHostname(name, suffix) : null,
      ipv4,
      ipv6,
      status: devicePresenceStatus(reg.last_seen_at),
      lastSeenAt: reg.last_seen_at,
      createdAt: reg.created_at,
      tunnelType: reg.tunnel_type,
      isConnector: false,
    });
  }

  const nodeEntries: MeshEntry[] = nodes.map((node: MeshNode) => {
    const reg = resolveNodeRegistration(node, regsById, connectorRegsByName);
    const ipv4 = reg?.virtual_ipv4?.trim() || null;
    const ipv6 = reg?.virtual_ipv6?.trim() || null;
    return {
      kind: "node" as const,
      id: node.id,
      deviceId: reg?.device?.id,
      name: node.name,
      meshHostname: ipv4 ? meshHostname(node.name, suffix) : null,
      ipv4,
      ipv6,
      status: node.status,
      lastSeenAt: reg?.last_seen_at ?? null,
      createdAt: node.created_at,
      tunnelType: reg?.tunnel_type ?? "warp_connector",
      isConnector: true,
    };
  });

  const entries = [...nodeEntries, ...deviceEntries].sort((a, b) => {
    const tb = Date.parse(b.createdAt) || 0;
    const ta = Date.parse(a.createdAt) || 0;
    if (tb !== ta) return tb - ta;
    return a.name.localeCompare(b.name);
  });

  const usedHostnames = new Set<string>();
  for (const entry of entries) {
    if (!entry.ipv4) continue;
    const base = meshHostname(entry.name, suffix);
    let hostname = base;
    let counter = 2;
    while (usedHostnames.has(hostname)) {
      hostname = `${base.replace(`.${suffix}`, "")}-${counter}.${suffix}`;
      counter += 1;
    }
    usedHostnames.add(hostname);
    entry.meshHostname = hostname;
  }

  return entries;
}

function newerRegistration(a: DeviceRegistration, b: DeviceRegistration): boolean {
  const ta = Date.parse(a.last_seen_at ?? a.created_at) || 0;
  const tb = Date.parse(b.last_seen_at ?? b.created_at) || 0;
  return ta >= tb;
}

/**
 * WireGuard/connector enrollments often keep a host/docker name that does not
 * match the mesh node name. Prefer the active tunnel connection's client_id.
 */
function resolveNodeRegistration(
  node: MeshNode,
  regsById: Map<string, DeviceRegistration>,
  connectorRegsByName: Map<string, DeviceRegistration>,
): DeviceRegistration | undefined {
  for (const conn of node.connections ?? []) {
    const clientId = conn.client_id ?? conn.id ?? conn.uuid;
    if (!clientId) continue;
    const byConn = regsById.get(clientId);
    if (byConn) return byConn;
  }
  return connectorRegsByName.get(node.name.toLowerCase());
}

/**
 * Sync Gateway DNS overrides for *.<suffix> — only when an IP is known.
 * Removes all meshflare-managed override rules that are no longer desired,
 * including leftovers from a previous suffix.
 *
 * `purgeHosts` forces removal of specific hostnames even if inventory still
 * briefly reports the old name (e.g. right after a device rename).
 * `forceDesired` injects host→IP mappings that must exist after rename.
 */
export async function syncMeshDns(
  cf: CloudflareClient,
  env: Env,
  options?: MeshDnsOptions,
): Promise<Awaited<ReturnType<typeof syncMeshDnsRules>>["stats"]> {
  const suffix = await getMeshSuffix(env);
  const inventory = await buildMeshInventory(cf, env);
  const desired = new Map<string, string>();

  for (const entry of inventory) {
    if (!entry.ipv4) continue;
    const host = entry.meshHostname ?? meshHostname(entry.name, suffix);
    if (!desired.has(host)) desired.set(host, entry.ipv4);
  }

  for (const host of options?.purgeHosts ?? []) {
    desired.delete(host);
  }
  for (const [host, ipv4] of options?.forceDesired ?? []) {
    desired.set(host, ipv4);
  }

  const appData = await readAppData(env.DB);
  const { stats, nextMissingSince } = await syncMeshDnsRules(cf, desired, appData, options);
  await updateAppData(env.DB, { dnsMissingSince: nextMissingSince });
  return stats;
}

/** After rename: drop old hostnames, then full sync so new .mesh overrides apply. */
export async function syncMeshDnsAfterRename(
  cf: CloudflareClient,
  env: Env,
  rename: {
    renamed: { from: string; to: string };
    displaced?: { from: string; to: string };
  },
): Promise<Awaited<ReturnType<typeof syncMeshDnsRules>>["stats"]> {
  const suffix = await getMeshSuffix(env);
  const purgeHosts: string[] = [];
  const forceDesired = new Map<string, string>();

  const fromHost = meshHostname(rename.renamed.from, suffix);
  const toHost = meshHostname(rename.renamed.to, suffix);
  if (fromHost !== toHost) purgeHosts.push(fromHost);

  if (rename.displaced) {
    const dFrom = meshHostname(rename.displaced.from, suffix);
    const dTo = meshHostname(rename.displaced.to, suffix);
    if (dFrom !== dTo) purgeHosts.push(dFrom);
  }

  const inventory = await buildMeshInventory(cf, env);
  const match =
    inventory.find((e) => e.name.trim().toLowerCase() === rename.renamed.to.trim().toLowerCase()) ??
    inventory.find((e) => e.name.trim().toLowerCase() === rename.renamed.from.trim().toLowerCase());

  if (match?.ipv4 && fromHost !== toHost) {
    forceDesired.set(match.meshHostname ?? toHost, match.ipv4);
  }

  if (rename.displaced) {
    const dFrom = meshHostname(rename.displaced.from, suffix);
    const dTo = meshHostname(rename.displaced.to, suffix);
    if (dFrom !== dTo) {
      const displacedMatch =
        inventory.find(
          (e) => e.name.trim().toLowerCase() === rename.displaced!.to.trim().toLowerCase(),
        ) ??
        inventory.find(
          (e) => e.name.trim().toLowerCase() === rename.displaced!.from.trim().toLowerCase(),
        );
      if (displacedMatch?.ipv4) {
        forceDesired.set(displacedMatch.meshHostname ?? dTo, displacedMatch.ipv4);
      }
    }
  }

  return syncMeshDns(cf, env, { purgeHosts, forceDesired });
}

/** After delete: purge that machine's hostname even if CF inventory lags. */
export async function syncMeshDnsAfterDelete(
  cf: CloudflareClient,
  env: Env,
  entry: { name: string; meshHostname?: string | null },
): Promise<Awaited<ReturnType<typeof syncMeshDnsRules>>["stats"]> {
  const suffix = await getMeshSuffix(env);
  const purgeHosts = new Set<string>();
  purgeHosts.add(meshHostname(entry.name, suffix));
  if (entry.meshHostname?.trim()) purgeHosts.add(entry.meshHostname.trim());
  return syncMeshDns(cf, env, { purgeHosts: [...purgeHosts] });
}
