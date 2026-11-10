import type { CloudflareClient } from "./client";
import { desiredMeshHosts, loadMeshInventory, syncMeshDns } from "./dns";
import { FILTER_LIST_PREFIX, FILTER_RULE_NAME, processDnsFilterTick } from "./dns-filter";
import { listGatewayLists, listGatewayRules, managedMeshRulesByHost, sameIps } from "./gateway";
import { updateAppData } from "../db/settings";
import { getSettings, settingsFromData } from "../settings";
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
  const [rules, lists, { entries: inventory, appData }] = await Promise.all([
    listGatewayRules(cf),
    listGatewayLists(cf),
    loadMeshInventory(cf, env),
  ]);
  const settings = settingsFromData(appData);

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

  const remoteRules = managedMeshRulesByHost(rules);
  const desiredHosts = desiredMeshHosts(inventory);

  let missingCount = 0;
  let staleIpCount = 0;
  for (const [host, ips] of desiredHosts) {
    const remote = remoteRules.get(host);
    if (!remote) missingCount += 1;
    else if (!sameIps(remote.rule_settings?.override_ips ?? [], ips)) staleIpCount += 1;
  }
  let orphanCount = 0;
  for (const host of remoteRules.keys()) {
    if (!desiredHosts.has(host)) orphanCount += 1;
  }
  const meshRuleCount = remoteRules.size;
  const meshInSync = missingCount === 0 && staleIpCount === 0 && orphanCount === 0;

  let meshDetail = `In sync (${meshRuleCount} rule${meshRuleCount === 1 ? "" : "s"})`;
  if (!meshInSync) {
    const issues: string[] = [];
    if (missingCount > 0) issues.push(`${missingCount} missing`);
    if (staleIpCount > 0) issues.push(`${staleIpCount} outdated IP${staleIpCount === 1 ? "" : "s"}`);
    if (orphanCount > 0) issues.push(`${orphanCount} orphaned`);
    meshDetail = `Divergence: ${issues.join(", ")} (${meshRuleCount} remote vs ${desiredHosts.size} desired)`;
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
      activeRules: meshRuleCount,
      desiredRules: desiredHosts.size,
      inSync: meshInSync,
      detail: meshDetail,
    },
  };
}

/**
 * Repair out-of-sync state: rebuild the DNS filter from scratch (a plain re-enable
 * would resume at the stored cursor and never recreate missing lists) and force
 * a full Mesh DNS resync.
 */
export async function repairMaintenance(cf: CloudflareClient, env: Env): Promise<MaintenanceHealth> {
  const settings = await getSettings(env);
  await updateAppData(env.DB, {
    dnsFilterStatus: settings.dnsFilterEnabled ? "pending_refresh" : "pending_disable",
  });
  await processDnsFilterTick(cf, env).catch(() => undefined);
  await syncMeshDns(cf, env, { purgeAllUnmatched: true }).catch(() => undefined);
  return checkMaintenanceHealth(cf, env);
}
