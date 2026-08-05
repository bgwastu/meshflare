import { mkdirSync, existsSync, readFileSync, renameSync } from "node:fs";
import { Database } from "bun:sqlite";
import { serveStatic } from "hono/bun";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { Cron } from "croner";
import { createApp } from "../worker/app";
import { demoApi } from "../worker/demo/api";
import { Hono } from "hono";
import { runMaintenance } from "../worker/maintenance";
import type { Env } from "../worker/types";
import { schema } from "../worker/db/schema";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { readAppData, updateAppData } from "../worker/db/settings";

const dataDir = process.env.DATA_DIR?.trim() || "./data";
mkdirSync(dataDir, { recursive: true });
const sqlite = new Database(`${dataDir}/meshflare.sqlite`);
const db = drizzle(sqlite, { schema });
migrate(db, { migrationsFolder: "./drizzle" });
const legacyPath = `${dataDir}/db.json`;
if (existsSync(legacyPath) && !existsSync(`${legacyPath}.migrated`)) {
  const legacy = JSON.parse(readFileSync(legacyPath, "utf8")) as Partial<Awaited<ReturnType<typeof readAppData>>>;
  const current = await readAppData(db);
  await updateAppData(db, { ...current, ...legacy, dnsMissingSince: legacy.dnsMissingSince ?? current.dnsMissingSince });
  renameSync(legacyPath, `${legacyPath}.migrated`);
}

const env = {
  DB: db,
  DATA_DIR: dataDir,
  PORT: process.env.PORT?.trim() || "3000",
  DEMO_MODE: process.env.DEMO_MODE?.trim(),
  CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID?.trim() || "demo",
  CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN,
  MESHFLARE_PASSWORD: process.env.MESHFLARE_PASSWORD,
} satisfies Env;

const app = new Hono<{ Bindings: Env }>();
if (env.DEMO_MODE === "true" || env.DEMO_MODE === "1") {
  app.route("/api", demoApi as unknown as typeof app);
} else {
  app.route("/", createApp());
}
app.use("/*", serveStatic({ root: "./dist" }));
app.get("*", serveStatic({ path: "./dist/index.html" }));

const port = Number(env.PORT) || 3000;
Bun.serve({
  port,
  fetch: (request) => app.fetch(request, env),
});

if (env.DEMO_MODE !== "true" && env.DEMO_MODE !== "1") {
  const run = () => runMaintenance(env).catch((error) => console.error("meshflare maintenance", error));
  const cron = new Cron("*/15 * * * *", run);
  void cron;
}

console.log(`meshflare listening on :${port}`);
