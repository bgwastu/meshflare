import { existsSync, mkdirSync, readFileSync, renameSync } from "node:fs";
import { dirname } from "node:path";
import { Database } from "bun:sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { schema } from "../worker/db/schema";
import { readAppData, updateAppData } from "../worker/db/settings";

const dbPath = process.env.DB_PATH?.trim() || `${process.env.DATA_DIR?.trim() || "./data"}/meshflare.sqlite`;
mkdirSync(dirname(dbPath), { recursive: true });
const sqlite = new Database(dbPath);
const db = drizzle(sqlite, { schema });
migrate(db, { migrationsFolder: "./drizzle" });

const legacyPath = `${process.env.DATA_DIR?.trim() || "./data"}/db.json`;
if (existsSync(legacyPath) && !existsSync(`${legacyPath}.migrated`)) {
  const legacy = JSON.parse(readFileSync(legacyPath, "utf8")) as Partial<Awaited<ReturnType<typeof readAppData>>>;
  const current = await readAppData(db);
  await updateAppData(db, {
    ...current,
    ...legacy,
    dnsMissingSince: legacy.dnsMissingSince ?? current.dnsMissingSince,
  });
  renameSync(legacyPath, `${legacyPath}.migrated`);
}
console.log(`Migrated ${dbPath}`);
