import type { TFunction } from "i18next";

/** Mesh "up" synonyms from Cloudflare / device APIs. */
const MESH_ONLINE = new Set([
  "healthy",
  "up",
  "online",
  "active",
  "connected",
  "registered",
]);

const MESH_OFFLINE = new Set(["offline", "inactive", "disconnected"]);

const KNOWN_STATUS_KEYS = new Set([
  "healthy",
  "degraded",
  "down",
  "inactive",
  "online",
  "offline",
  "registered",
  "active",
  "connected",
  "disconnected",
  "pending",
  "unknown",
  "enabled",
  "disabled",
  "syncing",
  "pending_enable",
  "pending_refresh",
  "pending_disable",
  "error",
]);

/**
 * Map raw machine status strings onto one i18n key so nodes (`healthy`)
 * and devices (`online`) do not show different words for the same state.
 */
export function canonicalMachineStatusKey(raw: string): string {
  const s = raw.trim().toLowerCase() || "unknown";
  if (MESH_ONLINE.has(s)) return "online";
  if (MESH_OFFLINE.has(s)) return "offline";
  if (s === "down") return "down";
  if (s.includes("pending") || s.includes("sync")) return "pending";
  if (KNOWN_STATUS_KEYS.has(s)) return s;
  return "unknown";
}

export function translateStatusKey(t: TFunction, key: string): string {
  const normalized = key.trim().toLowerCase() || "unknown";
  const safe = KNOWN_STATUS_KEYS.has(normalized) ? normalized : "unknown";
  return t(`status.${safe}`, { defaultValue: safe });
}

export function machineStatusLabel(t: TFunction, raw: string): string {
  return translateStatusKey(t, canonicalMachineStatusKey(raw));
}

/** e.g. "Status: Online" / "Status: Sehat" depending on locale + key. */
export function machineStatusTip(t: TFunction, raw: string): string {
  const status = machineStatusLabel(t, raw);
  return t("status.labeled", {
    status,
    defaultValue: `Status: ${status}`,
  });
}

export function tunnelStatusLabel(t: TFunction, raw: string): string {
  const s = raw.trim().toLowerCase() || "unknown";
  const safe = KNOWN_STATUS_KEYS.has(s) ? s : "unknown";
  return translateStatusKey(t, safe);
}

export function tunnelStatusTip(t: TFunction, raw: string): string {
  const status = tunnelStatusLabel(t, raw);
  return t("status.labeled", {
    status,
    defaultValue: `Status: ${status}`,
  });
}
