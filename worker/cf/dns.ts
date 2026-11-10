import type { CloudflareClient } from "./client";
import { syncMeshDnsRules, type DnsSyncStats, type MeshDnsOptions } from "./gateway";
import { listDeviceRegistrations, listMeshNodes } from "./mesh";
import { assignMeshHostnames, devicePresenceStatus, isConnectorRegistration } from "./names";
import type { AppData, DeviceRegistration, Env, MeshEntry, MeshNode, NodeBinding } from "../types";
import { readAppData, updateAppData } from "../db/settings";
import { normalizeMeshSuffix } from "../settings";

export type MeshInventory = { entries: MeshEntry[]; appData: AppData; suffix: string };

/** Build unified mesh inventory (nodes + devices) with assigned mesh hostnames. */
export async function loadMeshInventory(cf: CloudflareClient, env: Env): Promise<MeshInventory> {
  const [nodes, regs, appData] = await Promise.all([
    listMeshNodes(cf),
    listDeviceRegistrations(cf, "active"),
    readAppData(env.DB),
  ]);
  const suffix = normalizeMeshSuffix(appData.meshSuffix || "mesh");

  const connectorRegsByName = new Map<string, DeviceRegistration>();
  const regsById = new Map<string, DeviceRegistration>();
  const deviceEntries: MeshEntry[] = [];

  for (const reg of regs) {
    regsById.set(reg.id, reg);
    if (reg.device?.id) regsById.set(reg.device.id, reg);

    const name = reg.device?.name?.trim() || "unnamed";
    if (isConnectorRegistration(reg)) {
      const key = name.toLowerCase();
      const prev = connectorRegsByName.get(key);
      if (!prev || newerRegistration(reg, prev)) connectorRegsByName.set(key, reg);
      continue;
    }

    deviceEntries.push({
      kind: "device",
      id: reg.id,
      deviceId: reg.device?.id ?? reg.id,
      name,
      meshHostname: null,
      meshLabel: null,
      ipv4: reg.virtual_ipv4?.trim() || null,
      ipv6: reg.virtual_ipv6?.trim() || null,
      status: devicePresenceStatus(reg.last_seen_at),
      lastSeenAt: reg.last_seen_at,
      createdAt: reg.created_at,
      tunnelType: reg.tunnel_type,
      isConnector: false,
    });
  }

  const nodeBindings: Record<string, NodeBinding> = {};
  let nodeBindingsChanged = false;
  const activeNodeIds = new Set(nodes.map((n) => n.id));
  for (const [id, binding] of Object.entries(appData.nodeBindings)) {
    if (activeNodeIds.has(id)) nodeBindings[id] = binding;
    else nodeBindingsChanged = true;
  }

  const nodeEntries: MeshEntry[] = nodes.map((node: MeshNode) => {
    const cached = nodeBindings[node.id];
    const reg = resolveNodeRegistration(node, regsById, connectorRegsByName, cached?.deviceId);
    let ipv4 = reg?.virtual_ipv4?.trim() || null;
    let ipv6 = reg?.virtual_ipv6?.trim() || null;
    let deviceId = reg?.device?.id ?? cached?.deviceId;

    if (ipv4 || ipv6) {
      if (cached?.ipv4 !== ipv4 || cached?.ipv6 !== ipv6 || cached?.deviceId !== deviceId) {
        nodeBindings[node.id] = { deviceId, ipv4, ipv6 };
        nodeBindingsChanged = true;
      }
    } else if (cached) {
      // Offline connectors keep their last known IPs so their DNS stays stable.
      ipv4 = cached.ipv4 ?? null;
      ipv6 = cached.ipv6 ?? null;
      deviceId = cached.deviceId;
    }

    return {
      kind: "node" as const,
      id: node.id,
      deviceId,
      name: node.name,
      meshHostname: null,
      meshLabel: null,
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
    appData.nodeBindings = nodeBindings;
  }

  // Nodes before devices, then oldest first: earlier entries keep the base hostname.
  const entries = [...nodeEntries, ...deviceEntries].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "node" ? -1 : 1;
    const ta = Date.parse(a.createdAt) || 0;
    const tb = Date.parse(b.createdAt) || 0;
    if (ta !== tb) return ta - tb;
    return a.name.localeCompare(b.name);
  });

  assignMeshHostnames(entries, suffix, appData.meshLabels);
  return { entries, appData, suffix };
}

export async function buildMeshInventory(cf: CloudflareClient, env: Env): Promise<MeshEntry[]> {
  return (await loadMeshInventory(cf, env)).entries;
}

/** Hostname → override IPs for every entry that has a mesh address. */
export function desiredMeshHosts(entries: MeshEntry[]): Map<string, string[]> {
  const desired = new Map<string, string[]>();
  for (const entry of entries) {
    const ips = [entry.ipv4, entry.ipv6].filter((ip): ip is string => Boolean(ip?.trim()));
    if (ips.length === 0 || !entry.meshHostname || desired.has(entry.meshHostname)) continue;
    desired.set(entry.meshHostname, ips);
  }
  return desired;
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
 *
 * Pass `inventory` when the caller already knows the post-change state (rename,
 * delete): Cloudflare listings can lag right after a write.
 */
export async function syncMeshDns(
  cf: CloudflareClient,
  env: Env,
  options?: MeshDnsOptions & { inventory?: Pick<MeshInventory, "entries" | "appData"> },
): Promise<DnsSyncStats> {
  const { entries, appData } = options?.inventory ?? (await loadMeshInventory(cf, env));
  const { stats, nextMissingSince } = await syncMeshDnsRules(cf, desiredMeshHosts(entries), appData, options);
  await updateAppData(env.DB, { dnsMissingSince: nextMissingSince });
  return stats;
}
