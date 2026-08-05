import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const sourcePath = "wrangler.jsonc";
const generatedPath = ".wrangler-build.jsonc";
const config = JSON.parse(readFileSync(sourcePath, "utf8"));
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
const databaseId = process.env.MESHFLARE_D1_DATABASE_ID?.trim();

if (accountId) config.vars.CLOUDFLARE_ACCOUNT_ID = accountId;
if (databaseId) config.d1_databases[0].database_id = databaseId;

if (config.d1_databases[0].database_id.startsWith("REPLACE_WITH_")) {
  throw new Error("Set MESHFLARE_D1_DATABASE_ID in the Workers Builds configuration");
}
if (config.vars.CLOUDFLARE_ACCOUNT_ID.startsWith("REPLACE_WITH_")) {
  throw new Error("Set CLOUDFLARE_ACCOUNT_ID in the Workers Builds configuration");
}

writeFileSync(generatedPath, `${JSON.stringify(config, null, 2)}\n`);

function run(args) {
  const result = spawnSync("node_modules/.bin/wrangler", args, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Wrangler exited with status ${result.status}`);
}

try {
  run(["d1", "migrations", "apply", "DB", "--remote", "-c", generatedPath]);
  run(["deploy", "-c", generatedPath]);
} finally {
  unlinkSync(generatedPath);
}
