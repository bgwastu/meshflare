import type { CloudflareClient } from "./client";
import { getMeshSuffix } from "./dns-filter";
import { listDeviceRegistrations, listMeshNodes } from "./mesh";
import {
  devicePresenceStatus,
  isConnectorRegistration,
  meshHostname,
  slugifyName,
} from "./names";
import type { DeviceRegistration, Env, MeshEntry, MeshNode, Settings } from "../types";
import { readAppData, updateAppData } from "../db/settings";

const MESH_RULE_PREFIX = "meshflare DNS";

const DNS_MISSING_GRACE_MS = 5 * 60_000;

type GatewayRule = {
  id: string;
  name: string;
  description?: string;
  traffic?: string;
  action?: string;
  enabled?: boolean;
  filters?: string[];
  rule_settings?: { override_ips?: string[] };
};

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

/** Return the account's default Zero Trust DNS location endpoints. */
export async function getDefaultGatewayDns(cf: CloudflareClient): Promise<string[]> {
  const location = await getDefaultGatewayDnsLocation(cf);
  if (!location) {
    throw new Error("Cloudflare Zero Trust has no default DNS location");
  }

  const dns: string[] = [];
  if (location.endpoints?.ipv6?.enabled && location.ip) {
    dns.push(location.ip);
  }
  if (location.endpoints?.ipv4?.enabled) {
    for (const address of [location.ipv4_destination, location.ipv4_destination_backup]) {
      if (address && !dns.includes(address)) dns.push(address);
    }
  }
  if (dns.length === 0) {
    throw new Error("Cloudflare Zero Trust default DNS location has no enabled DNS endpoints");
  }
  return dns;
}

function parseFqdnFromTraffic(traffic: string | undefined): string | null {
  if (!traffic) return null;
  const m = traffic.match(/dns\.fqdn\s*==\s*"([^"]+)"/);
  return m?.[1] ?? null;
}

function managedHostKey(rule: GatewayRule, rulePrefix: string): string | null {
  const fromTraffic = parseFqdnFromTraffic(rule.traffic);
  if (fromTraffic) return fromTraffic;
  const prefix = `${rulePrefix}: `;
  if (rule.name?.startsWith(prefix)) return rule.name.slice(prefix.length).trim() || null;
  return null;
}

export async function listGatewayRules(cf: CloudflareClient): Promise<GatewayRule[]> {
  const res = await cf.request<GatewayRule[]>("GET", cf.accountPath("/gateway/rules"));
  return res.result ?? [];
}

export async function upsertMeshDnsRule(
  cf: CloudflareClient,
  env: Env,
  hostname: string,
  ipv4: string,
  existing?: GatewayRule,
): Promise<void> {
  const name = `${MESH_RULE_PREFIX}: ${hostname}`;
  const body = {
    name,
    description: `meshflare auto-sync: ${hostname} → ${ipv4}`,
    enabled: true,
    action: "override",
    filters: ["dns"],
    traffic: `dns.fqdn == "${hostname}"`,
    rule_settings: { override_ips: [ipv4] },
  };

  if (existing) {
    await cf.request("PUT", cf.accountPath(`/gateway/rules/${existing.id}`), body);
  } else {
    await cf.request("POST", cf.accountPath("/gateway/rules"), body);
  }
}

export async function deleteGatewayRule(
  cf: CloudflareClient,
  ruleId: string,
): Promise<void> {
  await cf.request("DELETE", cf.accountPath(`/gateway/rules/${ruleId}`));
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

export type DnsSyncStats = {
  created: number;
  updated: number;
  deleted: number;
  skipped: number;
  desired: number;
};

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
  options?: { purgeHosts?: string[]; forceDesired?: Map<string, string> },
): Promise<DnsSyncStats> {
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

  const rules = await listGatewayRules(cf);
  const managed = new Map<string, GatewayRule>();
  for (const rule of rules) {
    if (rule.action !== "override") continue;
    if (!rule.filters?.includes("dns")) continue;
    if (!rule.name?.startsWith(MESH_RULE_PREFIX)) continue;
    const fqdn = managedHostKey(rule, MESH_RULE_PREFIX);
    if (!fqdn) continue;
    managed.set(fqdn, rule);
  }

  let created = 0;
  let updated = 0;
  let deleted = 0;
  let skipped = 0;
  const now = Date.now();
  const purgeHosts = new Set(options?.purgeHosts ?? []);
  const appData = await readAppData(env.DB);
  const missingSince = { ...(appData.dnsMissingSince ?? {}) };
  const nextMissingSince: Record<string, string> = {};

  for (const [host, ipv4] of desired) {
    delete missingSince[host];
    const existing = managed.get(host);
    const current = existing?.rule_settings?.override_ips?.[0];
    if (existing && current === ipv4) {
      skipped += 1;
      managed.delete(host);
      continue;
    }
    await upsertMeshDnsRule(cf, env, host, ipv4, existing);
    if (existing) {
      updated += 1;
      managed.delete(host);
    } else created += 1;
  }

  for (const [host, rule] of managed) {
    if (!purgeHosts.has(host)) {
      const startedAt = Date.parse(missingSince[host] ?? "");
      if (!Number.isFinite(startedAt) || now - startedAt < DNS_MISSING_GRACE_MS) {
        nextMissingSince[host] = missingSince[host] ?? new Date(now).toISOString();
        continue;
      }
    }
    await deleteGatewayRule(cf, rule.id);
    deleted += 1;
  }

  await updateAppData(env.DB, { dnsMissingSince: nextMissingSince });

  return {
    created,
    updated,
    deleted,
    skipped,
    desired: desired.size,
  };
}

/** After rename: drop old hostnames, then full sync so new .mesh overrides apply. */
export async function syncMeshDnsAfterRename(
  cf: CloudflareClient,
  env: Env,
  rename: {
    renamed: { from: string; to: string };
    displaced?: { from: string; to: string };
  },
): Promise<DnsSyncStats> {
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
): Promise<DnsSyncStats> {
  const suffix = await getMeshSuffix(env);
  const purgeHosts = new Set<string>();
  purgeHosts.add(meshHostname(entry.name, suffix));
  if (entry.meshHostname?.trim()) purgeHosts.add(entry.meshHostname.trim());
  return syncMeshDns(cf, env, { purgeHosts: [...purgeHosts] });
}

export { slugifyName, meshHostname };
