import { cleanupOfflineDevices } from "./cf/cleanup";
import { createCfClient } from "./cf/client";
import { syncMeshDns } from "./cf/dns";
import { getSettings, markCleanupRan, markDnsSynced, processDnsFilterTick } from "./cf/dns-filter";
import type { Env } from "./types";

export async function runMaintenance(env: Env): Promise<void> {
  if (env.DEMO_MODE === "true" || env.DEMO_MODE === "1") return;

  const cf = createCfClient(env);
  const settings = await getSettings(env);
  try {
    const dns = await syncMeshDns(cf, env);
    console.log("meshflare dns sync", dns);
  } catch (error) {
    console.error("meshflare dns sync", error);
  }

  try {
    const cleanup = await cleanupOfflineDevices(cf, settings.offlineDays);
    if (cleanup.deleted > 0) {
      console.log("meshflare offline cleanup", cleanup);
      await markCleanupRan(env);
      await syncMeshDns(cf, env);
    }
  } catch (error) {
    console.error("meshflare offline cleanup", error);
  }

  try {
    const filter = await processDnsFilterTick(cf, env);
    console.log("meshflare dns filter", filter);
  } catch (error) {
    console.error("meshflare dns filter", error);
  }
  await markDnsSynced(env);
}
