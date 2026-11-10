import type { CloudflareClient } from "./client";

export const MESH_RULE_PREFIX = "meshflare DNS";

const DNS_MISSING_GRACE_MS = 5 * 60_000;

export type GatewayRule = {
  id: string;
  name: string;
  description?: string;
  traffic?: string;
  action?: string;
  enabled?: boolean;
  filters?: string[];
  rule_settings?: { override_ips?: string[] };
  precedence?: number;
};

type GatewayList = {
  id: string;
  name: string;
};

type GatewayRuleFilters = "dns" | "http" | "network" | "resolve";

async function listAllPages<T>(cf: CloudflareClient, path: string): Promise<T[]> {
  const PER_PAGE = 100;
  const all: T[] = [];
  for (let page = 1; page <= 50; page += 1) {
    const res = await cf.request<T[]>("GET", cf.accountPath(`${path}?per_page=${PER_PAGE}&page=${page}`));
    const batch = res.result ?? [];
    all.push(...batch);
    if (batch.length < PER_PAGE) break;
  }
  return all;
}

export function listGatewayRules(cf: CloudflareClient): Promise<GatewayRule[]> {
  return listAllPages<GatewayRule>(cf, "/gateway/rules");
}

export function listGatewayLists(cf: CloudflareClient): Promise<GatewayList[]> {
  return listAllPages<GatewayList>(cf, "/gateway/lists");
}

export async function upsertGatewayRule(
  cf: CloudflareClient,
  rule: {
    name: string;
    description?: string;
    enabled: boolean;
    action: string;
    filters: GatewayRuleFilters[];
    traffic: string;
    rule_settings?: Record<string, unknown>;
    precedence?: number;
  },
  existing?: GatewayRule,
): Promise<void> {
  const body = {
    name: rule.name,
    description: rule.description,
    enabled: rule.enabled === true,
    action: rule.action,
    filters: rule.filters,
    traffic: rule.traffic,
    rule_settings: rule.rule_settings,
    ...(rule.precedence !== undefined ? { precedence: rule.precedence } : {}),
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

export async function deleteGatewayList(
  cf: CloudflareClient,
  listId: string,
): Promise<void> {
  await cf.request("DELETE", cf.accountPath(`/gateway/lists/${listId}`));
}

export async function createGatewayDomainList(
  cf: CloudflareClient,
  name: string,
  description: string,
  domains: string[],
): Promise<void> {
  await cf.request("POST", cf.accountPath("/gateway/lists"), {
    name,
    description,
    type: "DOMAIN",
    items: domains.map((value) => ({ value })),
  });
}

export function parseManagedHostKey(rule: GatewayRule): string | null {
  const prefix = `${MESH_RULE_PREFIX}: `;
  if (rule.name?.startsWith(prefix)) {
    return rule.name.slice(prefix.length).trim() || null;
  }
  const m = rule.traffic?.match(/(?:dns\.fqdn\s*==|any\(dns\.domains\[\*\]\s*==)\s*"([^"]+)"/);
  return m?.[1] || null;
}

export function isManagedMeshRule(rule: GatewayRule): boolean {
  return Boolean(
    rule.action === "override" &&
      rule.filters?.includes("dns") &&
      rule.name?.startsWith(MESH_RULE_PREFIX),
  );
}

export type DnsSyncStats = {
  created: number;
  updated: number;
  deleted: number;
  skipped: number;
  desired: number;
};

export type MeshDnsOptions = {
  /** Managed hosts to delete right away instead of after the missing-grace period. */
  purgeHosts?: Iterable<string>;
  /** Delete every unmatched managed rule immediately (e.g. after a suffix change). */
  purgeAllUnmatched?: boolean;
};

export function sameIps(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sortedB = b.slice().sort();
  return a.slice().sort().every((ip, idx) => ip === sortedB[idx]);
}

export function meshRuleTraffic(host: string): string {
  return `any(dns.domains[*] == "${host}")`;
}

/** Managed mesh override rules keyed by the host they resolve. */
export function managedMeshRulesByHost(rules: GatewayRule[]): Map<string, GatewayRule> {
  const managed = new Map<string, GatewayRule>();
  for (const rule of rules) {
    if (!isManagedMeshRule(rule)) continue;
    const host = parseManagedHostKey(rule);
    if (host) managed.set(host, rule);
  }
  return managed;
}

export async function syncMeshDnsRules(
  cf: CloudflareClient,
  desired: Map<string, string[]>,
  appData: { dnsMissingSince: Record<string, string> },
  options?: MeshDnsOptions,
): Promise<{ stats: DnsSyncStats; nextMissingSince: Record<string, string> }> {
  const managed = managedMeshRulesByHost(await listGatewayRules(cf));

  let created = 0;
  let updated = 0;
  let deleted = 0;
  let skipped = 0;
  const now = Date.now();
  const purgeHosts = new Set(options?.purgeHosts ?? []);
  const missingSince = { ...(appData.dnsMissingSince ?? {}) };
  const nextMissingSince: Record<string, string> = {};

  const toUpsert: Array<{ host: string; ips: string[]; existing?: GatewayRule }> = [];
  const toDelete: GatewayRule[] = [];

  for (const [host, ips] of desired) {
    delete missingSince[host];
    const existing = managed.get(host);
    const ipsMatch = sameIps(existing?.rule_settings?.override_ips ?? [], ips);
    const trafficMatch = existing?.traffic === meshRuleTraffic(host);

    if (existing && ipsMatch && trafficMatch) {
      skipped += 1;
      managed.delete(host);
      continue;
    }

    toUpsert.push({ host, ips, existing });
    if (existing) {
      updated += 1;
      managed.delete(host);
    } else {
      created += 1;
    }
  }

  for (const [host, rule] of managed) {
    if (!options?.purgeAllUnmatched && !purgeHosts.has(host)) {
      const startedAt = Date.parse(missingSince[host] ?? "");
      if (!Number.isFinite(startedAt) || now - startedAt < DNS_MISSING_GRACE_MS) {
        nextMissingSince[host] = missingSince[host] ?? new Date(now).toISOString();
        continue;
      }
    }
    toDelete.push(rule);
    deleted += 1;
  }

  const BATCH_SIZE = 6;
  for (let i = 0; i < toUpsert.length; i += BATCH_SIZE) {
    await Promise.all(
      toUpsert.slice(i, i + BATCH_SIZE).map(({ host, ips, existing }) =>
        upsertGatewayRule(
          cf,
          {
            name: `${MESH_RULE_PREFIX}: ${host}`,
            description: `meshflare auto-sync: ${host} → ${ips.join(", ")}`,
            enabled: true,
            action: "override",
            filters: ["dns"],
            traffic: meshRuleTraffic(host),
            rule_settings: { override_ips: ips },
            ...(existing?.precedence !== undefined ? { precedence: existing.precedence } : {}),
          },
          existing,
        ),
      ),
    );
  }

  for (let i = 0; i < toDelete.length; i += BATCH_SIZE) {
    await Promise.all(
      toDelete.slice(i, i + BATCH_SIZE).map((rule) => deleteGatewayRule(cf, rule.id)),
    );
  }

  return {
    stats: { created, updated, deleted, skipped, desired: desired.size },
    nextMissingSince,
  };
}
