import { eq } from "drizzle-orm";
import { settings } from "./schema";
import type { AppData, AppDatabase, SettingsPatch } from "../types";

export const DEFAULT_APP_DATA: AppData = {
  offlineDays: 7,
  dnsFilterEnabled: false,
  dnsFilterStatus: "idle",
  dnsFilterUrl: "https://raw.githubusercontent.com/hagezi/dns-blocklists/main/adblock/light.txt",
  dnsFilterLastSyncedAt: null,
  dnsFilterCursor: 0,
  meshSuffix: "mesh",
  lastDnsSyncAt: null,
  lastCleanupAt: null,
  dnsMissingSince: {},
};

function rowToData(row: typeof settings.$inferSelect): AppData {
  let dnsMissingSince: Record<string, string> = {};
  try {
    dnsMissingSince = JSON.parse(row.dnsMissingSinceJson) as Record<string, string>;
  } catch {
    dnsMissingSince = {};
  }

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
    dnsMissingSince,
  };
}

export async function ensureSettings(db: AppDatabase): Promise<void> {
  await db.insert(settings).values({
    id: 1,
    offlineDays: DEFAULT_APP_DATA.offlineDays,
    dnsFilterEnabled: DEFAULT_APP_DATA.dnsFilterEnabled,
    dnsFilterStatus: DEFAULT_APP_DATA.dnsFilterStatus,
    dnsFilterUrl: DEFAULT_APP_DATA.dnsFilterUrl,
    dnsFilterCursor: DEFAULT_APP_DATA.dnsFilterCursor,
    meshSuffix: DEFAULT_APP_DATA.meshSuffix,
    dnsMissingSinceJson: "{}",
  }).onConflictDoNothing();
}

export async function readAppData(db: AppDatabase): Promise<AppData> {
  await ensureSettings(db);
  const row = await db.select().from(settings).where(eq(settings.id, 1)).get();
  return row ? rowToData(row) : DEFAULT_APP_DATA;
}

export async function updateAppData(
  db: AppDatabase,
  patch: Partial<AppData>,
): Promise<AppData> {
  await ensureSettings(db);
  const values: Partial<typeof settings.$inferInsert> = {};
  if (patch.offlineDays !== undefined) values.offlineDays = patch.offlineDays;
  if (patch.dnsFilterEnabled !== undefined) values.dnsFilterEnabled = patch.dnsFilterEnabled;
  if (patch.dnsFilterStatus !== undefined) values.dnsFilterStatus = patch.dnsFilterStatus;
  if (patch.dnsFilterUrl !== undefined) values.dnsFilterUrl = patch.dnsFilterUrl;
  if (patch.dnsFilterLastSyncedAt !== undefined) values.dnsFilterLastSyncedAt = patch.dnsFilterLastSyncedAt;
  if (patch.dnsFilterCursor !== undefined) values.dnsFilterCursor = patch.dnsFilterCursor;
  if (patch.meshSuffix !== undefined) values.meshSuffix = patch.meshSuffix;
  if (patch.lastDnsSyncAt !== undefined) values.lastDnsSyncAt = patch.lastDnsSyncAt;
  if (patch.lastCleanupAt !== undefined) values.lastCleanupAt = patch.lastCleanupAt;
  if (patch.dnsMissingSince !== undefined) values.dnsMissingSinceJson = JSON.stringify(patch.dnsMissingSince);
  if (Object.keys(values).length > 0) {
    await db.update(settings).set(values).where(eq(settings.id, 1));
  }
  return readAppData(db);
}

export async function patchSettings(
  db: AppDatabase,
  patch: SettingsPatch,
): Promise<AppData> {
  const current = await readAppData(db);
  return updateAppData(db, {
    offlineDays: patch.offlineDays === undefined
      ? current.offlineDays
      : Math.max(1, Math.min(365, Math.floor(patch.offlineDays))),
    meshSuffix: patch.meshSuffix ?? current.meshSuffix,
    dnsFilterUrl: patch.dnsFilterUrl ?? current.dnsFilterUrl,
    dnsFilterEnabled: patch.dnsFilterEnabled ?? current.dnsFilterEnabled,
  });
}
