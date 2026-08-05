import { CloudflareApiError, type CloudflareClient } from "./client";
import type { Env, Settings, SettingsPatch } from "../types";
import { dnsFilterDomains } from "../db/schema";
import { patchSettings as patchStoredSettings, readAppData, updateAppData } from "../db/settings";

const DEFAULT_FILTER_URL = "https://raw.githubusercontent.com/hagezi/dns-blocklists/main/adblock/light.txt";
const FILTER_LIST_PREFIX = "meshflare-dns-filter";
const FILTER_RULE_NAME = "meshflare DNS filter";
const LIST_CHUNK = 1000;
const CHUNKS_PER_TICK = 3;
const FILTER_REFRESH_MS = 6 * 60 * 60 * 1000;

type GatewayList = {
  id: string;
  name: string;
};

type GatewayRule = {
  id: string;
  name: string;
};

function normalizeDomain(line: string): string | null {
  let s = line.trim().toLowerCase();
  if (!s || s.startsWith("#") || s.startsWith("!") || s.startsWith("//")) return null;
  if (s.includes("://")) {
    try {
      s = new URL(s).hostname;
    } catch {
      return null;
    }
  }
  s = s.replace(/^\|\|/, "").replace(/\^.*$/, "").replace(/^\*\./, "");
  s = s.split(/\s+/).pop() ?? s;
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(s)) {
    return null;
  }
  return s;
}

export function normalizeMeshSuffix(raw: string, fallback = "mesh"): string {
  const s = raw
    .trim()
    .toLowerCase()
    .replace(/^\.+/, "")
    .replace(/[^a-z0-9.-]+/g, "")
    .replace(/\.+/g, ".")
    .replace(/^\.+|\.+$/g, "");
  if (!s || s.length > 63 || !/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/.test(s)) {
    return fallback;
  }
  return s;
}

export function normalizeFilterUrl(raw: string, fallback = DEFAULT_FILTER_URL): string {
  const trimmed = raw.trim();
  if (!trimmed) return fallback;
  try {
    const u = new URL(trimmed);
    if (u.protocol !== "http:" && u.protocol !== "https:") return fallback;
    return u.toString();
  } catch {
    return fallback;
  }
}

export async function getMeshSuffix(env: Env): Promise<string> {
  const data = await readAppData(env.DB);
  return normalizeMeshSuffix(data.meshSuffix || "mesh");
}

export async function getSettings(env: Env): Promise<Settings> {
  const d = await readAppData(env.DB);
  const offlineDays = Number(d.offlineDays);
  return {
    offlineDays: Number.isFinite(offlineDays) && offlineDays > 0 ? offlineDays : 7,
    dnsFilterEnabled: Boolean(d.dnsFilterEnabled),
    dnsFilterStatus: d.dnsFilterStatus || "idle",
    dnsFilterUrl: normalizeFilterUrl(d.dnsFilterUrl || DEFAULT_FILTER_URL),
    dnsFilterLastSyncedAt: d.dnsFilterLastSyncedAt || null,
    meshSuffix: await getMeshSuffix(env),
    lastDnsSyncAt: d.lastDnsSyncAt || null,
    lastCleanupAt: d.lastCleanupAt || null,
  };
}

export async function updateSettings(env: Env, patch: SettingsPatch): Promise<Settings> {
  const current = await getSettings(env);
  const nextUrl = patch.dnsFilterUrl === undefined
    ? current.dnsFilterUrl
    : normalizeFilterUrl(patch.dnsFilterUrl);
  const filterUrlChanged = nextUrl !== current.dnsFilterUrl;
  const filterStatus = patch.dnsFilterEnabled !== undefined
    ? patch.dnsFilterEnabled ? "pending_enable" : "pending_disable"
    : filterUrlChanged && (current.dnsFilterEnabled ||
      ["pending_enable", "syncing", "pending_refresh", "enabled"].includes(current.dnsFilterStatus))
      ? "pending_refresh"
      : current.dnsFilterStatus;

  await patchStoredSettings(env.DB, {
    ...patch,
    dnsFilterUrl: nextUrl,
    meshSuffix: patch.meshSuffix === undefined ? current.meshSuffix : normalizeMeshSuffix(patch.meshSuffix),
  });
  await updateAppData(env.DB, { dnsFilterStatus: filterStatus });

  if (filterUrlChanged) {
    await clearFilterDomains(env);
  }

  return getSettings(env);
}

export async function markDnsSynced(env: Env): Promise<void> {
  await updateAppData(env.DB, { lastDnsSyncAt: new Date().toISOString() });
}

export async function markCleanupRan(env: Env): Promise<void> {
  await updateAppData(env.DB, { lastCleanupAt: new Date().toISOString() });
}

async function clearFilterDomains(env: Env): Promise<void> {
  await env.DB.delete(dnsFilterDomains);
}

async function listGatewayLists(cf: CloudflareClient): Promise<GatewayList[]> {
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

async function listGatewayRules(cf: CloudflareClient): Promise<GatewayRule[]> {
  const res = await cf.request<GatewayRule[]>("GET", cf.accountPath("/gateway/rules"));
  return res.result ?? [];
}

function managedLists(lists: GatewayList[], prefix: string): GatewayList[] {
  return lists.filter((l) => l.name.startsWith(prefix));
}

async function downloadFilterDomains(url: string): Promise<string[]> {
  const res = await fetch(url, {
    headers: { "User-Agent": "meshflare/0.1" },
  });
  if (!res.ok) throw new Error(`Failed to download DNS filter list: HTTP ${res.status}`);
  const text = await res.text();
  const seen = new Set<string>();
  const domains: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const d = normalizeDomain(line);
    if (!d || seen.has(d)) continue;
    seen.add(d);
    domains.push(d);
  }
  return domains;
}

async function upsertBlockRule(
  cf: CloudflareClient,
  env: Env,
  lists: GatewayList[],
): Promise<void> {
  const expression = lists
    .map((l) => `any(dns.domains[*] in $${l.id})`)
    .join(" or ");
  if (!expression) return;

  const rules = await listGatewayRules(cf);
  const existing = rules.find((r) => r.name === FILTER_RULE_NAME);
  const body = {
    name: FILTER_RULE_NAME,
    description: "meshflare DNS filter block rule",
    enabled: true,
    action: "block",
    filters: ["dns"],
    traffic: expression,
    rule_settings: {
      block_page_enabled: false,
      block_reason: "Blocked by meshflare DNS filter",
    },
  };

  if (existing) {
    await cf.request("PUT", cf.accountPath(`/gateway/rules/${existing.id}`), body);
  } else {
    await cf.request("POST", cf.accountPath("/gateway/rules"), body);
  }
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function deleteFilterArtifacts(cf: CloudflareClient, env: Env): Promise<void> {
  const ruleNames = new Set([FILTER_RULE_NAME, "meshflare OISD Small"]);
  const rules = await listGatewayRules(cf);
  for (const rule of rules) {
    if (ruleNames.has(rule.name)) {
      await cf.request("DELETE", cf.accountPath(`/gateway/rules/${rule.id}`));
    }
  }

  // Gateway still reports lists "in use" briefly after the rule delete.
  await sleep(2000);

  const lists = await listGatewayLists(cf);
  const prefixes = [FILTER_LIST_PREFIX, "meshflare-oisd"];
  const managed = lists.filter((list) => prefixes.some((p) => list.name.startsWith(p)));
  const deleteList = async (list: GatewayList): Promise<void> => {
    for (let attempt = 0; attempt < 6; attempt++) {
      try {
        await cf.request("DELETE", cf.accountPath(`/gateway/lists/${list.id}`));
        return;
      } catch (e) {
        if (e instanceof CloudflareApiError && e.status === 404) return;
        const busy =
          e instanceof CloudflareApiError &&
          /in use|gateway policies/i.test(e.message);
        if (!busy || attempt === 5) throw e;
        await sleep(1000 * (attempt + 1));
      }
    }
  };

  // Delete in bounded parallel batches so large filters finish before waitUntil expires.
  for (let i = 0; i < managed.length; i += 8) {
    await Promise.all(managed.slice(i, i + 8).map(deleteList));
  }
}

/**
 * Progressive DNS-filter enable/disable/refresh from any domain-list URL.
 * URL changes while active force a full teardown + rebuild (no leftover lists).
 */
async function processDnsFilterTickInternal(
  cf: CloudflareClient,
  env: Env,
): Promise<string> {
  const settings = await getSettings(env);
  let status = settings.dnsFilterStatus;

  if (status === "error") {
    status = settings.dnsFilterEnabled ? "pending_enable" : "pending_disable";
    await updateAppData(env.DB, { dnsFilterStatus: status });
  }

  if (status === "enabled" && settings.dnsFilterEnabled) {
    const last = settings.dnsFilterLastSyncedAt
      ? Date.parse(settings.dnsFilterLastSyncedAt)
      : 0;
    if (!last || Date.now() - last >= FILTER_REFRESH_MS) {
      await updateAppData(env.DB, { dnsFilterStatus: "pending_refresh" });
      status = "pending_refresh";
    }
  }

  if (status === "pending_refresh") {
    await deleteFilterArtifacts(cf, env);
    await clearFilterDomains(env);
    await updateAppData(env.DB, { dnsFilterCursor: 0, dnsFilterStatus: "pending_enable" });
    return "dns_filter_refresh_started";
  }

  if (status === "pending_disable" || (status === "idle" && !settings.dnsFilterEnabled)) {
    if (status === "pending_disable") {
      await deleteFilterArtifacts(cf, env);
      await clearFilterDomains(env);
      await updateAppData(env.DB, {
        dnsFilterStatus: "idle",
        dnsFilterEnabled: false,
        dnsFilterCursor: 0,
        dnsFilterLastSyncedAt: null,
      });
      return "dns_filter_disabled";
    }
    return "dns_filter_idle";
  }

  if (status === "pending_enable" || status === "syncing") {
    // Re-fetch the source per tick so D1 does not need to store tens of
    // thousands of domains just to resume Gateway list creation.
    const domains = await downloadFilterDomains(settings.dnsFilterUrl);

    const cursor = (await readAppData(env.DB)).dnsFilterCursor || 0;
    const existing = managedLists(await listGatewayLists(cf), FILTER_LIST_PREFIX);
    const existingChunkIndexes = new Set(
      existing.map((l) => {
        const m = l.name.match(/chunk-(\d+)$/);
        return m ? Number(m[1]) : -1;
      }),
    );

    let nextCursor = cursor;
    let created = 0;

    for (let i = 0; i < CHUNKS_PER_TICK; i++) {
      const start = nextCursor;
      if (start >= domains.length) break;
      const chunkIndex = Math.floor(start / LIST_CHUNK) + 1;
      const slice = domains.slice(start, start + LIST_CHUNK);
      if (!existingChunkIndexes.has(chunkIndex)) {
        await cf.request("POST", cf.accountPath("/gateway/lists"), {
          name: `${FILTER_LIST_PREFIX}-chunk-${chunkIndex}`,
          description: `meshflare DNS filter (${settings.dnsFilterUrl})`,
          type: "DOMAIN",
          items: slice.map((value) => ({ value })),
        });
        created += 1;
      }
      nextCursor = start + slice.length;
    }

    await updateAppData(env.DB, { dnsFilterCursor: nextCursor, dnsFilterStatus: "syncing" });

    if (nextCursor >= domains.length) {
      const lists = managedLists(await listGatewayLists(cf), FILTER_LIST_PREFIX);
      await upsertBlockRule(cf, env, lists);
      await updateAppData(env.DB, {
        dnsFilterStatus: "enabled",
        dnsFilterEnabled: true,
        dnsFilterLastSyncedAt: new Date().toISOString(),
      });
      return `dns_filter_enabled chunks=${lists.length} created_this_tick=${created}`;
    }

    return `dns_filter_syncing ${nextCursor}/${domains.length} created_this_tick=${created}`;
  }

  return `dns_filter_${status}`;
}

export async function processDnsFilterTick(
  cf: CloudflareClient,
  env: Env,
): Promise<string> {
  try {
    return await processDnsFilterTickInternal(cf, env);
  } catch (error) {
    await updateAppData(env.DB, { dnsFilterStatus: "error" }).catch(() => undefined);
    throw error;
  }
}
