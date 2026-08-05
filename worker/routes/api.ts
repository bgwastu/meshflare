import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { zValidator } from "@hono/zod-validator";
import { fetchAccountInfo } from "../cf/account";
import { cleanupOfflineDevices } from "../cf/cleanup";
import {
  listTunnels,
  createTunnel,
  getTunnel,
  updateTunnel,
  deleteTunnel,
  getTunnelToken,
  getTunnelConfig,
  setTunnelConfig,
  getTunnelConnections,
} from "../cf/cloudflare-tunnel";
import type { CloudflareConnector } from "../types";
import { createCfClient, CloudflareApiError } from "../cf/client";
import { buildMeshInventory, getDefaultGatewayDns, getDefaultGatewayDnsLocation, serializeGatewayDnsLocation, syncMeshDns, syncMeshDnsAfterDelete, syncMeshDnsAfterRename, updateDefaultGatewayDnsLocation } from "../cf/dns";
import {
  createMeshNodeHostnameRoute,
  createMeshNodeRoute,
  deleteMeshNodeHostnameRoute,
  deleteMeshNodeRoute,
  getMeshNodeToken,
  listMeshNodeHostnameRoutes,
  listMeshNodeRoutes,
  recreateMeshNode,
} from "../cf/mesh";
import {
  getSettings,
  markCleanupRan,
  markDnsSynced,
  processDnsFilterTick,
  updateSettings,
} from "../cf/dns-filter";
import {
  createNodeWithUniqueName,
  deleteMeshEntry,
  renameWithCollisionHandling,
} from "../cf/rename";
import { getDefaultSplitTunnels, setDefaultSplitTunnels } from "../cf/split-tunnels";
import type { CloudflareTunnelConnection, Env } from "../types";
import { decodeConnectorToken } from "../wg/token";
import { nameSchema, routeSchema, settingsSchema, splitTunnelsSchema, tunnelConfigSchema, tunnelSchema } from "./schemas";

type AppEnv = { Bindings: Env };

export const api = new Hono<AppEnv>();

api.use("*", async (c, next) => {
  await next();
  c.header("Cache-Control", "no-store, no-cache, must-revalidate");
});

api.onError((err, c) => {
  if (err instanceof HTTPException) {
    return err.getResponse();
  }
  if (err instanceof CloudflareApiError) {
    return c.json({ error: err.message, errors: err.errors }, err.status >= 400 ? (err.status as 400) : 502);
  }
  console.error(err);
  return c.json({ error: err instanceof Error ? err.message : "Internal error" }, 500);
});

api.get("/health", (c) => c.json({ ok: true, service: "meshflare" }));

api.get("/settings", async (c) => {
  const cf = createCfClient(c.env);
  const [settings, account, dnsLocation] = await Promise.all([
    getSettings(c.env),
    fetchAccountInfo(cf),
    getDefaultGatewayDnsLocation(cf),
  ]);
  return c.json({
    ...settings,
    accountName: account.name,
    accountEmail: account.email,
    dnsLocation: serializeGatewayDnsLocation(dnsLocation),
  });
});

api.patch("/settings", zValidator("json", settingsSchema), async (c) => {
  const body = c.req.valid("json");
  const before = await getSettings(c.env);
  const settings = await updateSettings(c.env, body);
  const dnsEndpointTouched =
    body.dnsIpv4Enabled !== undefined || body.dnsIpv6Enabled !== undefined || body.dnsDohEnabled !== undefined || body.dnsSourceNetwork !== undefined;
  let dnsLocation = null;
  if (dnsEndpointTouched) {
    const cf = createCfClient(c.env);
    dnsLocation = await updateDefaultGatewayDnsLocation(cf, {
      ipv4: body.dnsIpv4Enabled,
      ipv6: body.dnsIpv6Enabled,
      doh: body.dnsDohEnabled,
      ...(body.dnsSourceNetwork !== undefined
        ? { sourceNetworks: body.dnsSourceNetwork.trim() ? [body.dnsSourceNetwork.trim()] : [] }
        : {}),
    });
  }

  const suffixChanged =
    body.meshSuffix !== undefined && settings.meshSuffix !== before.meshSuffix;
  if (suffixChanged) {
    const cf = createCfClient(c.env);
    await syncMeshDns(cf, c.env);
    await markDnsSynced(c.env);
  }

  const filterTouched =
    body.dnsFilterEnabled !== undefined || body.dnsFilterUrl !== undefined;
  if (filterTouched) {
    const cf = createCfClient(c.env);
    const task = processDnsFilterTick(cf, c.env).catch((err) =>
      console.error("meshflare dns filter tick", err),
    );
    try {
      c.executionCtx.waitUntil(task);
    } catch {
      // Bun has no Workers execution context; keep local development fire-and-forget.
      void task;
    }
  }

  const cf = createCfClient(c.env);
  const [account, currentDnsLocation] = await Promise.all([
    fetchAccountInfo(cf),
    dnsEndpointTouched ? Promise.resolve(null) : getDefaultGatewayDnsLocation(cf),
  ]);
  return c.json({
    ...(await getSettings(c.env)),
    accountName: account.name,
    accountEmail: account.email,
    dnsLocation: dnsLocation ?? serializeGatewayDnsLocation(currentDnsLocation),
  });
});

api.get("/mesh", async (c) => {
  const cf = createCfClient(c.env);
  const entries = await buildMeshInventory(cf, c.env);
  return c.json({ entries });
});

api.post("/mesh/nodes", zValidator("json", nameSchema), async (c) => {
  const body = c.req.valid("json");
  const cf = createCfClient(c.env);
  const { node, notice } = await createNodeWithUniqueName(cf, body.name);
  const dns = await syncMeshDns(cf, c.env);
  await markDnsSynced(c.env);
  return c.json({ node, notice, dns }, 201);
});

api.patch("/mesh/:kind/:id", zValidator("json", nameSchema), async (c) => {
  const kind = c.req.param("kind");
  if (kind !== "node" && kind !== "device") {
    throw new HTTPException(400, { message: "kind must be node or device" });
  }
  const body = c.req.valid("json");

  const cf = createCfClient(c.env);
  const result = await renameWithCollisionHandling(cf, kind, c.req.param("id"), body.name);
  const dns = await syncMeshDnsAfterRename(cf, c.env, result);
  await markDnsSynced(c.env);
  return c.json({ ...result, dns });
});

api.delete("/mesh/:kind/:id", async (c) => {
  const kind = c.req.param("kind");
  if (kind !== "node" && kind !== "device") {
    throw new HTTPException(400, { message: "kind must be node or device" });
  }
  const cf = createCfClient(c.env);
  const id = c.req.param("id");
  const inventory = await buildMeshInventory(cf, c.env);
  const entry = inventory.find((e) => e.kind === kind && e.id === id);
  await deleteMeshEntry(cf, kind, id);
  const dns = entry
    ? await syncMeshDnsAfterDelete(cf, c.env, entry)
    : await syncMeshDns(cf, c.env);
  await markDnsSynced(c.env);
  return c.json({ ok: true, dns });
});

api.get("/mesh/nodes/:id/routes", async (c) => {
  const cf = createCfClient(c.env);
  const id = c.req.param("id");
  const [cidrRoutes, hostnameRoutes] = await Promise.all([
    listMeshNodeRoutes(cf, id),
    listMeshNodeHostnameRoutes(cf, id),
  ]);
  return c.json({
    routes: [
      ...cidrRoutes.map((route) => ({ ...route, type: "cidr" as const })),
      ...hostnameRoutes.map((route) => ({ ...route, type: "hostname" as const })),
    ],
  });
});

api.post("/mesh/nodes/:id/routes", zValidator("json", routeSchema), async (c) => {
  const body = c.req.valid("json");
  const type = body.type ?? "cidr";
  const value = type === "hostname" ? body.hostname?.trim() : body.network?.trim();
  const comment = body.comment?.trim();
  if (!value) throw new HTTPException(400, { message: `${type === "hostname" ? "hostname" : "network"} is required` });
  if (comment && comment.length > 100) {
    throw new HTTPException(400, { message: "comment must be 100 characters or fewer" });
  }
  const cf = createCfClient(c.env);
  const route = type === "hostname"
    ? await createMeshNodeHostnameRoute(cf, c.req.param("id"), value, comment)
    : await createMeshNodeRoute(cf, c.req.param("id"), value, comment);
  return c.json({ route: { ...route, type } }, 201);
});

api.delete("/mesh/nodes/:id/routes/:routeId", async (c) => {
  const cf = createCfClient(c.env);
  const nodeId = c.req.param("id");
  const routeId = c.req.param("routeId");
  const [cidrRoutes, hostnameRoutes] = await Promise.all([
    listMeshNodeRoutes(cf, nodeId),
    listMeshNodeHostnameRoutes(cf, nodeId),
  ]);
  if (cidrRoutes.some((route) => route.id === routeId)) {
    await deleteMeshNodeRoute(cf, routeId);
  } else if (hostnameRoutes.some((route) => route.id === routeId)) {
    await deleteMeshNodeHostnameRoute(cf, routeId);
  } else {
    throw new HTTPException(404, { message: "Route not found for this node" });
  }
  return c.json({ ok: true });
});

api.get("/settings/split-tunnels", async (c) => {
  const cf = createCfClient(c.env);
  return c.json(await getDefaultSplitTunnels(cf));
});

api.put("/settings/split-tunnels", zValidator("json", splitTunnelsSchema), async (c) => {
  const body = c.req.valid("json");
  if (body.mode !== "include" && body.mode !== "exclude") {
    throw new HTTPException(400, { message: "mode must be include or exclude" });
  }
  if (!Array.isArray(body.items)) {
    throw new HTTPException(400, { message: "items is required" });
  }
  const items = body.items.map((item) => ({
    ...(item.address?.trim() ? { address: item.address.trim() } : {}),
    ...(item.host?.trim() ? { host: item.host.trim() } : {}),
    ...(item.description?.trim() ? { description: item.description.trim() } : {}),
  }));
  if (items.some((item) => (!item.address && !item.host) || (item.address && item.host))) {
    throw new HTTPException(400, { message: "each item must contain one address or host" });
  }
  const cf = createCfClient(c.env);
  await setDefaultSplitTunnels(cf, body.mode, items);
  return c.json(await getDefaultSplitTunnels(cf));
});

api.post("/mesh/sync-dns", async (c) => {
  const cf = createCfClient(c.env);
  const dns = await syncMeshDns(cf, c.env);
  await markDnsSynced(c.env);
  return c.json({ dns, lastDnsSyncAt: new Date().toISOString() });
});

api.post("/mesh/cleanup", async (c) => {
  const cf = createCfClient(c.env);
  const settings = await getSettings(c.env);
  const cleanup = await cleanupOfflineDevices(cf, settings.offlineDays);
  const dns = await syncMeshDns(cf, c.env);
  await markCleanupRan(c.env);
  await markDnsSynced(c.env);
  return c.json({ cleanup, dns, lastCleanupAt: new Date().toISOString() });
});

api.get("/mesh/nodes/:id/token", async (c) => {
  const cf = createCfClient(c.env);
  const token = await getMeshNodeToken(cf, c.req.param("id"));
  const decoded = decodeConnectorToken(token);
  return c.json({ token, decoded });
});

api.post("/mesh/nodes/:id/regenerate", async (c) => {
  const cf = createCfClient(c.env);
  const node = await recreateMeshNode(cf, c.req.param("id"));
  return c.json({ node }, 201);
});

// ── Cloudflare Tunnel routes ──────────────────────────────────────────────

api.get("/tunnels", async (c) => {
  const cf = createCfClient(c.env);
  const tunnels = await listTunnels(cf);
  return c.json({ tunnels });
});

api.post("/tunnels", zValidator("json", tunnelSchema), async (c) => {
  const body = c.req.valid("json");
  if (!body.name?.trim()) throw new HTTPException(400, { message: "name is required" });
  const cf = createCfClient(c.env);
  const tunnel = await createTunnel(cf, body.name.trim(), body.config_src);
  return c.json({ tunnel }, 201);
});

api.get("/tunnels/:id", async (c) => {
  const cf = createCfClient(c.env);
  const tunnel = await getTunnel(cf, c.req.param("id"));
  return c.json(tunnel);
});

api.patch("/tunnels/:id", zValidator("json", tunnelSchema), async (c) => {
  const body = c.req.valid("json");
  const cf = createCfClient(c.env);
  const tunnel = await updateTunnel(cf, c.req.param("id"), body);
  return c.json(tunnel);
});

api.delete("/tunnels/:id", async (c) => {
  const cf = createCfClient(c.env);
  await deleteTunnel(cf, c.req.param("id"));
  return c.json({ ok: true });
});

api.get("/tunnels/:id/token", async (c) => {
  const cf = createCfClient(c.env);
  const token = await getTunnelToken(cf, c.req.param("id"));
  return c.json({ token });
});

api.get("/tunnels/:id/config", async (c) => {
  const cf = createCfClient(c.env);
  const config = await getTunnelConfig(cf, c.req.param("id"));
  return c.json(config);
});

api.put("/tunnels/:id/config", zValidator("json", tunnelConfigSchema), async (c) => {
  const body = c.req.valid("json");
  const cf = createCfClient(c.env);
  const config = await setTunnelConfig(cf, c.req.param("id"), body as Parameters<typeof setTunnelConfig>[2]);
  return c.json(config);
});

api.get("/tunnels/:id/connections", async (c) => {
  const cf = createCfClient(c.env);
  const raw = await getTunnelConnections(cf, c.req.param("id"));
  const flat: CloudflareTunnelConnection[] = raw.flatMap(
    (client: CloudflareConnector) =>
      (client.conns ?? []).map((conn: CloudflareTunnelConnection) => ({
        id: conn.id ?? conn.uuid,
        uuid: conn.uuid,
        colo_name: conn.colo_name,
        is_pending_reconnect: conn.is_pending_reconnect,
        client_id: client.id,
        origin_ip: conn.origin_ip,
        opened_at: conn.opened_at,
        version: client.version,
      })),
  );
  return c.json(flat);
});
