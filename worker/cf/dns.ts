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

/** Build unified mesh inventory (nodes + devices). */
export async function buildMeshInventory(
  cf: CloudflareClient,
  env: Env,
): Promise<MeshEntry[]> {
  const suffix = await getMeshSuffix(env);
  const [nodes, regs, appData] = await Promise.all([
    listMeshNodes(cf),
    listDeviceRegistrations(cf, "active"),
    readAppData(env.DB),
  ]);

  const connectorRegsByName = new Map<string, DeviceRegistration>();
  const regsById = new Map<string, DeviceRegistration>();
  const deviceEntries: MeshEntry[] = [];
  const nodeBindings = { ...(appData.nodeBindings ?? {}) };
  let nodeBindingsChanged = false;

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
      meshHostname: meshHostname(name, suffix),
      ipv4,
      ipv6,
      status: devicePresenceStatus(reg.last_seen_at),
      lastSeenAt: reg.last_seen_at,
      createdAt: reg.created_at,
      tunnelType: reg.tunnel_type,
      isConnector: false,
    });
  }

  const activeNodeIds = new Set(nodes.map((n: MeshNode) => n.id));
  for (const id of Object.keys(nodeBindings)) {
    if (!activeNodeIds.has(id)) {
      delete nodeBindings[id];
      nodeBindingsChanged = true;
    }
  }

  const nodeEntries: MeshEntry[] = nodes.map((node: MeshNode) => {
    const cachedBinding = nodeBindings[node.id];
    const reg = resolveNodeRegistration(node, regsById, connectorRegsByName, cachedBinding?.deviceId);
    let ipv4 = reg?.virtual_ipv4?.trim() || null;
    let ipv6 = reg?.virtual_ipv6?.trim() || null;
    let deviceId = reg?.device?.id ?? cachedBinding?.deviceId;

    if (ipv4 || ipv6) {
      if (
        nodeBindings[node.id]?.ipv4 !== ipv4 ||
        nodeBindings[node.id]?.ipv6 !== ipv6 ||
        nodeBindings[node.id]?.deviceId !== deviceId
      ) {
        nodeBindings[node.id] = { deviceId, ipv4, ipv6 };
        nodeBindingsChanged = true;
      }
    } else if (cachedBinding) {
      ipv4 = cachedBinding.ipv4 ?? null;
      ipv6 = cachedBinding.ipv6 ?? null;
      deviceId = cachedBinding.deviceId;
    }

    return {
      kind: "node" as const,
      id: node.id,
      deviceId,
      name: node.name,
      meshHostname: meshHostname(node.name, suffix),
      ipv4,
      ipv6,
      status: node.status,
      lastSeenAt: reg?.last_seen_at ?? null,
      createdAt: node.created_at,
      tunnelType: reg?.tunnel_type ?? "warp_connector",
      isConnector: true,
    };
  });
  if (nodeBindingsChanged) {
    await updateAppData(env.DB, { nodeBindings });
  }

  // Nodes take precedence over devices on equal timestamps; oldest created keeps base hostname.
  const entries = [...nodeEntries, ...deviceEntries].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "node" ? -1 : 1;
    const ta = Date.parse(a.createdAt) || 0;
    const tb = Date.parse(b.createdAt) || 0;
    if (ta !== tb) return ta - tb;
    return a.name.localeCompare(b.name);
  });

  const usedHostnames = new Set<string>();
  for (const entry of entries) {
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
  cachedDeviceId?: string,
): DeviceRegistration | undefined {
  for (const conn of node.connections ?? []) {
    const clientId = conn.client_id ?? conn.id ?? conn.uuid;
    if (!clientId) continue;
    const byConn = regsById.get(clientId);
    if (byConn) return byConn;
  }
  if (cachedDeviceId) {
    const byCached = regsById.get(cachedDeviceId);
    if (byCached) return byCached;
  }
  return connectorRegsByName.get(node.name.toLowerCase());
}

/**
 * Sync Gateway DNS overrides for *.<suffix> with dual-stack IPv4/IPv6 support.
 * Removes all meshflare-managed override rules that are no longer desired,
 * including leftovers from a previous suffix.
 */
export async function syncMeshDns(
  cf: CloudflareClient,
  env: Env,
  options?: MeshDnsOptions,
): Promise<Awaited<ReturnType<typeof syncMeshDnsRules>>["stats"]> {
  const suffix = await getMeshSuffix(env);
  const inventory = await buildMeshInventory(cf, env);
  const desired = new Map<string, string[]>();

  for (const entry of inventory) {
    const ips = [entry.ipv4, entry.ipv6].filter((ip): ip is string => Boolean(ip?.trim()));
    if (ips.length === 0) continue;
    const host = entry.meshHostname ?? meshHostname(entry.name, suffix);
    if (!desired.has(host)) desired.set(host, ips);
  }

  for (const host of options?.purgeHosts ?? []) {
    desired.delete(host);
  }
  for (const [host, ips] of options?.forceDesired ?? []) {
    desired.set(host, ips);
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
    renamed: { id?: string; kind?: "node" | "device"; from: string; to: string };
    displaced?: { id?: string; kind?: "node" | "device"; from: string; to: string };
  },
): Promise<Awaited<ReturnType<typeof syncMeshDnsRules>>["stats"]> {
  const suffix = await getMeshSuffix(env);
  const purgeHosts: string[] = [];
  const forceDesired = new Map<string, string[]>();

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
    (rename.renamed.id ? inventory.find((e) => e.id === rename.renamed.id) : undefined) ??
    inventory.find((e) => e.name.trim().toLowerCase() === rename.renamed.to.trim().toLowerCase()) ??
    inventory.find((e) => e.name.trim().toLowerCase() === rename.renamed.from.trim().toLowerCase());

  const matchIps = match ? [match.ipv4, match.ipv6].filter((ip): ip is string => Boolean(ip?.trim())) : [];
  if (matchIps.length > 0 && fromHost !== toHost) {
    forceDesired.set(toHost, matchIps);
  }

  if (rename.displaced) {
    const dFrom = meshHostname(rename.displaced.from, suffix);
    const dTo = meshHostname(rename.displaced.to, suffix);
    if (dFrom !== dTo) {
      const displacedMatch =
        (rename.displaced.id ? inventory.find((e) => e.id === rename.displaced!.id) : undefined) ??
        inventory.find((e) => e.name.trim().toLowerCase() === rename.displaced!.to.trim().toLowerCase()) ??
        inventory.find((e) => e.name.trim().toLowerCase() === rename.displaced!.from.trim().toLowerCase());
      const displacedIps = displacedMatch
        ? [displacedMatch.ipv4, displacedMatch.ipv6].filter((ip): ip is string => Boolean(ip?.trim()))
        : [];
      if (displacedIps.length > 0) {
        forceDesired.set(dTo, displacedIps);
      }
    }
  }

  return syncMeshDns(cf, env, { purgeHosts, forceDesired });
}

/** After delete: purge that machine's hostname even if CF inventory lags. */
export async function syncMeshDnsAfterDelete(
  cf: CloudflareClient,
  env: Env,
  entry: { id?: string; kind?: "node" | "device"; name: string; meshHostname?: string | null },
): Promise<Awaited<ReturnType<typeof syncMeshDnsRules>>["stats"]> {
  const suffix = await getMeshSuffix(env);
  const purgeHosts = new Set<string>();
  purgeHosts.add(meshHostname(entry.name, suffix));
  if (entry.meshHostname?.trim()) purgeHosts.add(entry.meshHostname.trim());

  if (entry.id && entry.kind === "node") {
    const appData = await readAppData(env.DB);
    if (appData.nodeBindings?.[entry.id]) {
      const nextBindings = { ...appData.nodeBindings };
      delete nextBindings[entry.id];
      await updateAppData(env.DB, { nodeBindings: nextBindings });
    }
  }

  return syncMeshDns(cf, env, { purgeHosts: [...purgeHosts] });
}
