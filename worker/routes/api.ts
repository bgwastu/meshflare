import { Hono, type Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { getAccountOverview } from "../cf/account";
import { cleanupOfflineDevices } from "../cf/cleanup";
import { CloudflareApiError, createCfClient, type CloudflareClient } from "../cf/client";
import {
  createTunnel,
  deleteTunnel,
  getTunnel,
  getTunnelConfig,
  getTunnelConnections,
  getTunnelToken,
  listTunnels,
  setTunnelConfig,
  updateTunnel,
} from "../cf/cloudflare-tunnel";
import { processDnsFilterTick } from "../cf/dns-filter";
import { buildMeshInventory, syncMeshDns } from "../cf/dns";
import { regenerateMeshNode, removeMeshEntry, updateMeshEntry } from "../cf/entries";
import { checkMaintenanceHealth, repairMaintenance } from "../cf/health";
import {
  createMeshNodeHostnameRoute,
  createMeshNodeRoute,
  deleteMeshNodeHostnameRoute,
  deleteMeshNodeRoute,
  getMeshNodeToken,
  listMeshNodeHostnameRoutes,
  listMeshNodeRoutes,
} from "../cf/mesh";
import { createNodeWithUniqueName } from "../cf/rename";
import {
  auditMeshRouting,
  ensureMeshRouting,
  getDefaultSplitTunnels,
  setDefaultSplitTunnels,
} from "../cf/split-tunnels";
import { getSettings, markCleanupRan, markDnsSynced, updateSettings } from "../settings";
import type { CloudflareConnector, Env, Settings, TunnelConfig } from "../types";
import { decodeConnectorToken } from "../wg/token";
import {
  createTunnelSchema,
  meshEntryParamSchema,
  meshEntrySchema,
  nameSchema,
  routeSchema,
  settingsSchema,
  splitTunnelsSchema,
  tunnelConfigSchema,
  tunnelSchema,
} from "./schemas";
import { validate } from "./validate";

type AppEnv = { Bindings: Env; Variables: { cf: CloudflareClient } };

export const api = new Hono<AppEnv>();

api.use("*", async (c, next) => {
  await next();
  c.header("Cache-Control", "no-store, no-cache, must-revalidate");
});

api.onError((err, c) => {
  if (err instanceof HTTPException) {
    // getResponse() is plain text; the client expects `{ error }` JSON.
    return err.res ?? c.json({ error: err.message }, err.status);
  }
  if (err instanceof CloudflareApiError) {
    return c.json({ error: err.message, errors: err.errors }, err.status >= 400 ? (err.status as 400) : 502);
  }
  console.error(err);
  return c.json({ error: err instanceof Error ? err.message : "Internal error" }, 500);
});

api.get("/health", (c) => c.json({ ok: true, service: "meshflare" }));

// Every route below talks to Cloudflare.
api.use("*", async (c, next) => {
  c.set("cf", createCfClient(c.env));
  await next();
});

/** Run background work past the response (Workers) or fire-and-forget (Bun). */
function runInBackground(c: Context<AppEnv>, task: Promise<unknown>): void {
  try {
    c.executionCtx.waitUntil(task);
  } catch {
    // Bun has no Workers execution context.
    void task;
  }
}

async function withAccountOverview(c: Context<AppEnv>, settings: Settings) {
  return { ...settings, ...(await getAccountOverview(c.var.cf)) };
}

async function splitTunnelsResponse(cf: CloudflareClient) {
  const config = await getDefaultSplitTunnels(cf);
  return { ...config, audit: auditMeshRouting(config) };
}

// ── Settings & maintenance ───────────────────────────────────────────────

api.get("/settings", async (c) => c.json(await withAccountOverview(c, await getSettings(c.env))));

api.patch("/settings", validate("json", settingsSchema), async (c) => {
  const body = c.req.valid("json");
  const { before, after } = await updateSettings(c.env, body);

  if (after.meshSuffix !== before.meshSuffix) {
    await syncMeshDns(c.var.cf, c.env, { purgeAllUnmatched: true });
    after.lastDnsSyncAt = await markDnsSynced(c.env);
  }

  if (body.dnsFilterEnabled !== undefined || body.dnsFilterUrl !== undefined) {
    runInBackground(
      c,
      processDnsFilterTick(c.var.cf, c.env).catch((err) => console.error("meshflare dns filter tick", err)),
    );
  }

  return c.json(await withAccountOverview(c, after));
});

api.get("/maintenance/health", async (c) => c.json(await checkMaintenanceHealth(c.var.cf, c.env)));

api.post("/maintenance/repair", async (c) => c.json(await repairMaintenance(c.var.cf, c.env)));

api.get("/settings/split-tunnels", async (c) => c.json(await splitTunnelsResponse(c.var.cf)));

api.put("/settings/split-tunnels", validate("json", splitTunnelsSchema), async (c) => {
  const { mode, items } = c.req.valid("json");
  await setDefaultSplitTunnels(c.var.cf, mode, items);
  return c.json(await splitTunnelsResponse(c.var.cf));
});

api.post("/settings/split-tunnels/ensure-mesh", async (c) => {
  const remediated = ensureMeshRouting(await getDefaultSplitTunnels(c.var.cf));
  await setDefaultSplitTunnels(c.var.cf, remediated.mode, remediated[remediated.mode]);
  return c.json(await splitTunnelsResponse(c.var.cf));
});

// ── Mesh ─────────────────────────────────────────────────────────────────

api.get("/mesh", async (c) => c.json({ entries: await buildMeshInventory(c.var.cf, c.env) }));

api.post("/mesh/sync-dns", async (c) => {
  const dns = await syncMeshDns(c.var.cf, c.env);
  return c.json({ dns, lastDnsSyncAt: await markDnsSynced(c.env) });
});

api.post("/mesh/cleanup", async (c) => {
  const { offlineDays } = await getSettings(c.env);
  const cleanup = await cleanupOfflineDevices(c.var.cf, offlineDays);
  const dns = await syncMeshDns(c.var.cf, c.env);
  await markDnsSynced(c.env);
  return c.json({ cleanup, dns, lastCleanupAt: await markCleanupRan(c.env) });
});

api.post("/mesh/nodes", validate("json", nameSchema), async (c) => {
  const { node, notice } = await createNodeWithUniqueName(c.var.cf, c.req.valid("json").name);
  const dns = await syncMeshDns(c.var.cf, c.env);
  await markDnsSynced(c.env);
  return c.json({ node, notice, dns }, 201);
});

api.patch(
  "/mesh/:kind/:id",
  validate("param", meshEntryParamSchema),
  validate("json", meshEntrySchema),
  async (c) => {
    const { kind, id } = c.req.valid("param");
    return c.json(await updateMeshEntry(c.var.cf, c.env, kind, id, c.req.valid("json")));
  },
);

api.delete("/mesh/:kind/:id", validate("param", meshEntryParamSchema), async (c) => {
  const { kind, id } = c.req.valid("param");
  return c.json({ ok: true, dns: await removeMeshEntry(c.var.cf, c.env, kind, id) });
});

api.get("/mesh/nodes/:id/token", async (c) => {
  const token = await getMeshNodeToken(c.var.cf, c.req.param("id"));
  return c.json({ token, decoded: decodeConnectorToken(token) });
});

api.post("/mesh/nodes/:id/regenerate", async (c) =>
  c.json(await regenerateMeshNode(c.var.cf, c.env, c.req.param("id")), 201),
);

api.get("/mesh/nodes/:id/routes", async (c) => {
  const id = c.req.param("id");
  const [cidrRoutes, hostnameRoutes] = await Promise.all([
    listMeshNodeRoutes(c.var.cf, id),
    listMeshNodeHostnameRoutes(c.var.cf, id),
  ]);
  return c.json({
    routes: [
      ...cidrRoutes.map((route) => ({ ...route, type: "cidr" as const })),
      ...hostnameRoutes.map((route) => ({ ...route, type: "hostname" as const })),
    ],
  });
});

api.post("/mesh/nodes/:id/routes", validate("json", routeSchema), async (c) => {
  const body = c.req.valid("json");
  const id = c.req.param("id");
  const comment = body.comment || undefined;
  const route = body.type === "hostname"
    ? await createMeshNodeHostnameRoute(c.var.cf, id, body.hostname!, comment)
    : await createMeshNodeRoute(c.var.cf, id, body.network!, comment);
  return c.json({ route: { ...route, type: body.type } }, 201);
});

api.delete("/mesh/nodes/:id/routes/:routeId", async (c) => {
  const nodeId = c.req.param("id");
  const routeId = c.req.param("routeId");
  const [cidrRoutes, hostnameRoutes] = await Promise.all([
    listMeshNodeRoutes(c.var.cf, nodeId),
    listMeshNodeHostnameRoutes(c.var.cf, nodeId),
  ]);
  if (cidrRoutes.some((route) => route.id === routeId)) {
    await deleteMeshNodeRoute(c.var.cf, routeId);
  } else if (hostnameRoutes.some((route) => route.id === routeId)) {
    await deleteMeshNodeHostnameRoute(c.var.cf, routeId);
  } else {
    throw new HTTPException(404, { message: "Route not found for this node" });
  }
  return c.json({ ok: true });
});

// ── Cloudflare Tunnels ───────────────────────────────────────────────────

api.get("/tunnels", async (c) => c.json({ tunnels: await listTunnels(c.var.cf) }));

api.post("/tunnels", validate("json", createTunnelSchema), async (c) => {
  const body = c.req.valid("json");
  return c.json({ tunnel: await createTunnel(c.var.cf, body.name, body.config_src) }, 201);
});

api.get("/tunnels/:id", async (c) => c.json(await getTunnel(c.var.cf, c.req.param("id"))));

api.patch("/tunnels/:id", validate("json", tunnelSchema), async (c) =>
  c.json(await updateTunnel(c.var.cf, c.req.param("id"), c.req.valid("json"))),
);

api.delete("/tunnels/:id", async (c) => {
  await deleteTunnel(c.var.cf, c.req.param("id"));
  return c.json({ ok: true });
});

api.get("/tunnels/:id/token", async (c) =>
  c.json({ token: await getTunnelToken(c.var.cf, c.req.param("id")) }),
);

api.get("/tunnels/:id/config", async (c) => c.json(await getTunnelConfig(c.var.cf, c.req.param("id"))));

api.put("/tunnels/:id/config", validate("json", tunnelConfigSchema), async (c) =>
  c.json(await setTunnelConfig(c.var.cf, c.req.param("id"), c.req.valid("json") as TunnelConfig)),
);

api.get("/tunnels/:id/connections", async (c) => {
  const clients = await getTunnelConnections(c.var.cf, c.req.param("id"));
  return c.json(
    clients.flatMap((client: CloudflareConnector) =>
      (client.conns ?? []).map((conn) => ({
        id: conn.id ?? conn.uuid,
        uuid: conn.uuid,
        colo_name: conn.colo_name,
        is_pending_reconnect: conn.is_pending_reconnect,
        client_id: client.id,
        origin_ip: conn.origin_ip,
        opened_at: conn.opened_at,
        version: client.version,
      })),
    ),
  );
});
