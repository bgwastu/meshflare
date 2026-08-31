import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { Database } from "bun:sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { schema } from "../worker/db/schema";
import { migrateLegacyJson } from "../worker/legacy";

const dbPath = process.env.DB_PATH?.trim() || `${process.env.DATA_DIR?.trim() || "./data"}/meshflare.sqlite`;
mkdirSync(dirname(dbPath), { recursive: true });
const sqlite = new Database(dbPath);
const db = drizzle(sqlite, { schema });
migrate(db, { migrationsFolder: "./drizzle" });
await migrateLegacyJson(db, process.env.DATA_DIR?.trim() || "./data");
console.log(`Migrated ${dbPath}`);
