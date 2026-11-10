import { eq } from "drizzle-orm";
import { settings } from "./schema";
import type { AppData, AppDatabase } from "../types";

export const DEFAULT_FILTER_URL =
  "https://raw.githubusercontent.com/hagezi/dns-blocklists/main/adblock/light.txt";

const DEFAULT_APP_DATA: AppData = {
  offlineDays: 7,
  dnsFilterEnabled: false,
  dnsFilterStatus: "idle",
  dnsFilterUrl: DEFAULT_FILTER_URL,
  dnsFilterLastSyncedAt: null,
  dnsFilterCursor: 0,
  meshSuffix: "mesh",
  lastDnsSyncAt: null,
  lastCleanupAt: null,
  dnsMissingSince: {},
  nodeBindings: {},
  meshLabels: {},
};

type Row = typeof settings.$inferSelect;

function parseJsonObject<T extends object>(raw: string | null | undefined): T {
  try {
    const value: unknown = JSON.parse(raw || "{}");
    return (value && typeof value === "object" && !Array.isArray(value) ? value : {}) as T;
  } catch {
    return {} as T;
  }
}

function rowToData(row: Row): AppData {
  return {
    offlineDays: row.offlineDays,
    dnsFilterEnabled: row.dnsFilterEnabled,
    dnsFilterStatus: row.dnsFilterStatus,
    dnsFilterUrl: row.dnsFilterUrl,
    dnsFilterLastSyncedAt: row.dnsFilterLastSyncedAt,
    dnsFilterCursor: row.dnsFilterCursor,
    meshSuffix: row.meshSuffix,
    lastDnsSyncAt: row.lastDnsSyncAt,
    lastCleanupAt: row.lastCleanupAt,
    dnsMissingSince: parseJsonObject(row.dnsMissingSinceJson),
    nodeBindings: parseJsonObject(row.nodeBindingsJson),
    meshLabels: parseJsonObject(row.meshLabelsJson),
  };
}

/** AppData keys stored as JSON text, mapped to their column. */
const JSON_COLUMNS = {
  dnsMissingSince: "dnsMissingSinceJson",
  nodeBindings: "nodeBindingsJson",
  meshLabels: "meshLabelsJson",
} as const satisfies Partial<Record<keyof AppData, keyof Row>>;

let settingsEnsured = false;

async function ensureSettings(db: AppDatabase): Promise<void> {
  if (settingsEnsured) return;
  await db
    .insert(settings)
    .values({
      id: 1,
      offlineDays: DEFAULT_APP_DATA.offlineDays,
      dnsFilterEnabled: DEFAULT_APP_DATA.dnsFilterEnabled,
      dnsFilterStatus: DEFAULT_APP_DATA.dnsFilterStatus,
      dnsFilterUrl: DEFAULT_APP_DATA.dnsFilterUrl,
      dnsFilterCursor: DEFAULT_APP_DATA.dnsFilterCursor,
      meshSuffix: DEFAULT_APP_DATA.meshSuffix,
    })
    .onConflictDoNothing();
  settingsEnsured = true;
}

export async function readAppData(db: AppDatabase): Promise<AppData> {
  await ensureSettings(db);
  const row = await db.select().from(settings).where(eq(settings.id, 1)).get();
  return row ? rowToData(row) : { ...DEFAULT_APP_DATA };
}

export async function updateAppData(db: AppDatabase, patch: Partial<AppData>): Promise<void> {
  const values: Partial<typeof settings.$inferInsert> = {};
  for (const [key, value] of Object.entries(patch) as Array<[keyof AppData, unknown]>) {
    if (value === undefined || !(key in DEFAULT_APP_DATA)) continue;
    const jsonColumn = JSON_COLUMNS[key as keyof typeof JSON_COLUMNS];
    if (jsonColumn) {
      values[jsonColumn] = JSON.stringify(value);
    } else {
      (values as Record<string, unknown>)[key] = value;
    }
  }
  if (Object.keys(values).length === 0) return;
  await ensureSettings(db);
  await db.update(settings).set(values).where(eq(settings.id, 1));
}
