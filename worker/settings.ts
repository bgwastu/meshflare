import { DEFAULT_FILTER_URL, readAppData, updateAppData } from "./db/settings";
import type { AppData, Env, Settings, SettingsPatch } from "./types";

/** DNS filter states where a background operation is still running. */
export const DNS_FILTER_BUSY_STATUSES = ["pending_enable", "syncing", "pending_refresh", "pending_disable"];

export function normalizeMeshSuffix(raw: string, fallback = "mesh"): string {
  const s = raw
    .trim()
    .toLowerCase()
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

export function settingsFromData(d: AppData): Settings {
  const offlineDays = Number(d.offlineDays);
  return {
    offlineDays: Number.isFinite(offlineDays) && offlineDays > 0 ? offlineDays : 7,
    dnsFilterEnabled: Boolean(d.dnsFilterEnabled),
    dnsFilterStatus: d.dnsFilterStatus || "idle",
    dnsFilterUrl: normalizeFilterUrl(d.dnsFilterUrl || DEFAULT_FILTER_URL),
    dnsFilterLastSyncedAt: d.dnsFilterLastSyncedAt || null,
    meshSuffix: normalizeMeshSuffix(d.meshSuffix || "mesh"),
    lastDnsSyncAt: d.lastDnsSyncAt || null,
    lastCleanupAt: d.lastCleanupAt || null,
  };
}

export async function getSettings(env: Env): Promise<Settings> {
  return settingsFromData(await readAppData(env.DB));
}

/** Persist a settings patch in one write and report the state before and after. */
export async function updateSettings(
  env: Env,
  patch: SettingsPatch,
): Promise<{ before: Settings; after: Settings }> {
  const data = await readAppData(env.DB);
  const before = settingsFromData(data);

  const dnsFilterUrl = patch.dnsFilterUrl === undefined
    ? before.dnsFilterUrl
    : normalizeFilterUrl(patch.dnsFilterUrl);
  const filterActive = before.dnsFilterEnabled ||
    ["pending_enable", "syncing", "pending_refresh", "enabled"].includes(before.dnsFilterStatus);
  const dnsFilterStatus = patch.dnsFilterEnabled !== undefined
    ? patch.dnsFilterEnabled ? "pending_enable" : "pending_disable"
    : dnsFilterUrl !== before.dnsFilterUrl && filterActive
      ? "pending_refresh"
      : before.dnsFilterStatus;

  const next: Partial<AppData> = { dnsFilterUrl, dnsFilterStatus };
  if (patch.offlineDays !== undefined) {
    next.offlineDays = Math.max(1, Math.min(365, Math.floor(patch.offlineDays)));
  }
  if (patch.meshSuffix !== undefined) next.meshSuffix = normalizeMeshSuffix(patch.meshSuffix);
  if (patch.dnsFilterEnabled !== undefined) next.dnsFilterEnabled = patch.dnsFilterEnabled;

  await updateAppData(env.DB, next);
  return { before, after: settingsFromData({ ...data, ...next }) };
}

export async function markDnsSynced(env: Env): Promise<string> {
  const at = new Date().toISOString();
  await updateAppData(env.DB, { lastDnsSyncAt: at });
  return at;
}

export async function markCleanupRan(env: Env): Promise<string> {
  const at = new Date().toISOString();
  await updateAppData(env.DB, { lastCleanupAt: at });
  return at;
}
