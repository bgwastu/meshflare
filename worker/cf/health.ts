import type { CloudflareClient } from "./client";
import { buildMeshInventory, syncMeshDns } from "./dns";
import { meshHostname } from "./names";
import {
  FILTER_LIST_PREFIX,
  FILTER_RULE_NAME,
  getSettings,
  processDnsFilterTick,
} from "./dns-filter";
import { listGatewayLists, listGatewayRules } from "./gateway";
import { updateAppData } from "../db/settings";
import type { Env } from "../types";

export type MaintenanceHealth = {
  ok: boolean;
  dnsFilter: {
    configured: boolean;
    enabled: boolean;
    status: string;
    remoteListChunks: number;
    remoteRule: boolean;
    inSync: boolean;
    detail: string;
  };
  mesh: {
    activeRules: number;
    desiredRules: number;
    inSync: boolean;
    detail: string;
  };
};

/**
 * Compare both DNS filter and Mesh DNS state with what actually exists in Cloudflare Gateway.
 */
export async function checkMaintenanceHealth(cf: CloudflareClient, env: Env): Promise<MaintenanceHealth> {
  const settings = await getSettings(env);
  const [rules, lists, inventory] = await Promise.all([
    listGatewayRules(cf),
    listGatewayLists(cf),
    buildMeshInventory(cf, env),
  ]);

  const filter = settings.dnsFilterEnabled
    ? settings.dnsFilterStatus === "enabled" || settings.dnsFilterStatus === "idle"
    : !settings.dnsFilterEnabled;

  const remoteRule = rules.some((r) => r.name === FILTER_RULE_NAME);
  const remoteChunks = lists.filter((l) => l.name.startsWith(FILTER_LIST_PREFIX)).length;

  let inSync = true;
  let detail = "In sync";

  if (settings.dnsFilterEnabled) {
    if (settings.dnsFilterStatus === "error") {
      inSync = false;
      detail = "Last sync failed — run repair";
    } else if (!remoteRule && settings.dnsFilterStatus !== "pending_enable" && settings.dnsFilterStatus !== "syncing") {
      inSync = false;
      detail = "Block rule missing remotely (manually deleted?)";
    } else if (remoteChunks === 0 && settings.dnsFilterStatus !== "pending_enable" && settings.dnsFilterStatus !== "syncing") {
      inSync = false;
      detail = "Domain lists missing remotely (manually deleted?)";
    }
  } else if (remoteRule || remoteChunks > 0) {
    inSync = false;
    detail = "Disabled locally but filter artifacts still exist remotely";
  }

  const meshRules = rules.filter(
    (r) => r.action === "override" && r.filters?.includes("dns") && r.name?.startsWith("meshflare DNS"),
  );

  const desiredHosts = new Map<string, string[]>();
  for (const entry of inventory) {
    const ips = [entry.ipv4, entry.ipv6].filter((ip): ip is string => Boolean(ip?.trim()));
    if (ips.length === 0) continue;
    const host = entry.meshHostname ?? meshHostname(entry.name, settings.meshSuffix);
    if (!desiredHosts.has(host)) desiredHosts.set(host, ips);
  }

  const remoteRulesByHost = new Map<string, string[]>();
  for (const rule of meshRules) {
    const prefix = "meshflare DNS: ";
    let host: string | null = null;
    if (rule.name?.startsWith(prefix)) {
      host = rule.name.slice(prefix.length).trim();
    } else {
      const m = rule.traffic?.match(/(?:dns\.fqdn\s*==|any\(dns\.domains\[\*\]\s*==)\s*"([^"]+)"/);
      host = m?.[1] ?? null;
    }
    if (host) {
      remoteRulesByHost.set(host, (rule.rule_settings?.override_ips ?? []).slice().sort());
    }
  }

  let missingCount = 0;
  let staleIpCount = 0;
  for (const [host, ips] of desiredHosts) {
    const remoteIps = remoteRulesByHost.get(host);
    if (!remoteIps) {
      missingCount += 1;
    } else {
      const targetIps = ips.slice().sort();
      const match =
        remoteIps.length === targetIps.length &&
        remoteIps.every((ip, idx) => ip === targetIps[idx]);
      if (!match) staleIpCount += 1;
    }
  }

  const orphanCount = Math.max(0, meshRules.length - (desiredHosts.size - missingCount));
  const meshInSync = missingCount === 0 && staleIpCount === 0 && orphanCount === 0;

  let meshDetail = `In sync (${meshRules.length} rule${meshRules.length === 1 ? "" : "s"})`;
  if (!meshInSync) {
    const issues: string[] = [];
    if (missingCount > 0) issues.push(`${missingCount} missing`);
    if (staleIpCount > 0) issues.push(`${staleIpCount} outdated IP${staleIpCount === 1 ? "" : "s"}`);
    if (orphanCount > 0) issues.push(`${orphanCount} orphaned`);
    meshDetail = `Divergence: ${issues.join(", ")} (${meshRules.length} remote vs ${desiredHosts.size} desired)`;
  }

  return {
    ok: inSync && meshInSync,
    dnsFilter: {
      configured: true,
      enabled: settings.dnsFilterEnabled,
      status: settings.dnsFilterStatus,
      remoteListChunks: remoteChunks,
      remoteRule,
      inSync,
      detail: filter && inSync ? "In sync" : detail,
    },
    mesh: {
      activeRules: meshRules.length,
      desiredRules: desiredHosts.size,
      inSync: meshInSync,
      detail: meshDetail,
    },
  };
}

/**
 * Repair out-of-sync state by forcing filter state machine to rebuild and resyncing Mesh DNS.
 */
export async function repairMaintenance(cf: CloudflareClient, env: Env): Promise<MaintenanceHealth> {
  const settings = await getSettings(env);
  const nextStatus = settings.dnsFilterEnabled ? "pending_enable" : "pending_disable";
  await processDnsFilterTick(cf, env).catch(() => undefined);
  await updateAppData(env.DB, { dnsFilterStatus: nextStatus });
  await syncMeshDns(cf, env, { purgeAllUnmatched: true }).catch(() => undefined);
  return checkMaintenanceHealth(cf, env);
}
