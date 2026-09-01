import type { CloudflareClient } from "./client";
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
};

/**
 * Compare the DNS filter state stored in the app database with what actually
 * exists in Cloudflare Gateway. Divergence happens when someone edits the
 * remote list/rule manually, or when a previous sync partially failed.
 */
export async function checkMaintenanceHealth(cf: CloudflareClient, env: Env): Promise<MaintenanceHealth> {
  const settings = await getSettings(env);
  const [rules, lists] = await Promise.all([listGatewayRules(cf), listGatewayLists(cf)]);

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

  return {
    ok: inSync,
    dnsFilter: {
      configured: true,
      enabled: settings.dnsFilterEnabled,
      status: settings.dnsFilterStatus,
      remoteListChunks: remoteChunks,
      remoteRule,
      inSync,
      detail: filter && inSync ? "In sync" : detail,
    },
  };
}

/**
 * Repair out-of-sync DNS filter state by forcing the filter state machine to
 * rebuild. Deletes leftover remote artifacts first, then re-enables from the
 * stored URL.
 */
export async function repairMaintenance(cf: CloudflareClient, env: Env): Promise<MaintenanceHealth> {
  const settings = await getSettings(env);
  const nextStatus = settings.dnsFilterEnabled ? "pending_enable" : "pending_disable";
  await processDnsFilterTick(cf, env).catch(() => undefined);
  // Force the state machine to start fresh on the next tick.
  await updateAppData(env.DB, { dnsFilterStatus: nextStatus });
  return checkMaintenanceHealth(cf, env);
}
