import type { CloudflareClient } from "./client";

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

type GatewayList = {
  id: string;
  name: string;
};

type GatewayRuleFilters = "dns" | "http" | "network" | "resolve";

export async function listGatewayRules(
  cf: CloudflareClient,
): Promise<GatewayRule[]> {
  const all: GatewayRule[] = [];
  let page = 1;
  for (;;) {
    const res = await cf.request<GatewayRule[]>(
      "GET",
      cf.accountPath(`/gateway/rules?per_page=100&page=${page}`),
    );
    const batch = res.result ?? [];
    all.push(...batch);
    if (batch.length < 100) break;
    page += 1;
    if (page > 50) break;
  }
  return all;
}

export async function listGatewayLists(
  cf: CloudflareClient,
): Promise<GatewayList[]> {
  const all: GatewayList[] = [];
  let page = 1;
  for (;;) {
    const res = await cf.request<GatewayList[]>(
      "GET",
      cf.accountPath(`/gateway/lists?per_page=100&page=${page}`),
    );
    const batch = res.result ?? [];
    all.push(...batch);
    if (batch.length < 100) break;
    page += 1;
    if (page > 50) break;
  }
  return all;
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

function parseManagedHostKey(rule: GatewayRule): string | null {
  const m = rule.traffic?.match(/dns\.fqdn\s*==\s*"([^"]+)"/);
  if (m?.[1]) return m[1];
  const prefix = `${MESH_RULE_PREFIX}: `;
  if (rule.name?.startsWith(prefix)) {
    return rule.name.slice(prefix.length).trim() || null;
  }
  return null;
}

function isManagedMeshRule(rule: GatewayRule): boolean {
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
  purgeHosts?: string[];
  forceDesired?: Map<string, string[]>;
  purgeAllUnmatched?: boolean;
};

export async function syncMeshDnsRules(
  cf: CloudflareClient,
  desired: Map<string, string[]>,
  appData: { dnsMissingSince: Record<string, string> },
  options?: MeshDnsOptions,
): Promise<{ stats: DnsSyncStats; nextMissingSince: Record<string, string> }> {
  const rules = await listGatewayRules(cf);
  const managed = new Map<string, GatewayRule>();
  for (const rule of rules) {
    if (!isManagedMeshRule(rule)) continue;
    const fqdn = parseManagedHostKey(rule);
    if (fqdn) managed.set(fqdn, rule);
  }

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
    const currentIps = (existing?.rule_settings?.override_ips ?? []).slice().sort();
    const targetIps = ips.slice().sort();
    const ipsMatch =
      currentIps.length === targetIps.length &&
      currentIps.every((ip, idx) => ip === targetIps[idx]);

    if (existing && ipsMatch) {
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
            traffic: `dns.fqdn == "${host}"`,
            rule_settings: { override_ips: ips },
            precedence: 100,
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
