import { existsSync, readFileSync, renameSync } from "node:fs";
import { readAppData, updateAppData } from "./db/settings";
import type { AppDatabase } from "./types";

/**
 * One-time migration from the pre-SQLite `data/db.json` store into the
 * settings table. Idempotent: the JSON file is renamed aside once imported.
 */
export async function migrateLegacyJson(db: AppDatabase, dataDir: string): Promise<void> {
  const legacyPath = `${dataDir}/db.json`;
  if (!existsSync(legacyPath) || existsSync(`${legacyPath}.migrated`)) return;

  const legacy = JSON.parse(readFileSync(legacyPath, "utf8")) as Partial<
    Awaited<ReturnType<typeof readAppData>>
  >;
  const current = await readAppData(db);
  await updateAppData(db, {
    ...current,
    ...legacy,
    dnsMissingSince: legacy.dnsMissingSince ?? current.dnsMissingSince,
  });
  renameSync(legacyPath, `${legacyPath}.migrated`);
}
