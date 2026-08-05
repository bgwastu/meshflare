import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import {
  DEMO_READ_ONLY,
  buildDemoEntries,
  buildDemoRoutes,
  buildDemoSettings,
  buildDemoTunnelConfig,
  buildDemoTunnels,
  isDemoMode,
} from "../demo/fixtures";

type DemoEnv = { DEMO_MODE?: string | boolean };

/** Standalone demo API — no Cloudflare credentials required. */
export const demoApi = new Hono<{ Bindings: DemoEnv }>();

demoApi.onError((err, c) => {
  if (err instanceof HTTPException) return err.getResponse();
  console.error(err);
  return c.json({ error: err instanceof Error ? err.message : "Internal error" }, 500);
});

demoApi.get("/health", (c) =>
  c.json({ ok: true, service: "meshflare", demo: true }),
);

demoApi.get("/auth/status", (c) =>
  c.json({ required: false, authenticated: true }),
);

demoApi.post("/auth/login", (c) =>
  c.json({ required: false, authenticated: true }),
);

demoApi.post("/auth/logout", (c) => c.json({ ok: true }));

demoApi.get("/settings", (c) => c.json(buildDemoSettings()));

demoApi.get("/mesh", (c) => c.json({ entries: buildDemoEntries(), demo: true }));

demoApi.get("/mesh/nodes/:id/routes", (c) =>
  c.json({ routes: buildDemoRoutes(c.req.param("id")) }),
);

demoApi.get("/mesh/nodes/:id/token", (c) =>
  c.json({ token: "demo-connector-token", decoded: { demo: true } }),
);

demoApi.get("/settings/split-tunnels", (c) =>
  c.json({
    mode: "include" as const,
    include: [
      { address: "100.96.0.0/12", description: "Cloudflare Mesh IPv4" },
      { address: "2606:4700:cf1:1000::/64", description: "Cloudflare Mesh IPv6" },
      { host: "wiki.internal.local", description: "Private application" },
    ],
    exclude: [
      { address: "192.168.0.0/16", description: "Local network" },
      { address: "10.0.0.0/8", description: "Private network" },
    ],
  }),
);

demoApi.get("/tunnels", (c) => c.json({ tunnels: buildDemoTunnels() }));

demoApi.get("/tunnels/:id", (c) => {
  const tunnels = buildDemoTunnels();
  const tunnel = tunnels.find((t) => t.id === c.req.param("id"));
  if (!tunnel) throw new HTTPException(404, { message: "Tunnel not found" });
  return c.json(tunnel);
});

demoApi.get("/tunnels/:id/token", (c) =>
  c.json({ token: "demo-tunnel-token" }),
);

demoApi.get("/tunnels/:id/config", (c) =>
  c.json(buildDemoTunnelConfig(c.req.param("id"))),
);

demoApi.get("/tunnels/:id/connections", (c) => {
  const tunnels = buildDemoTunnels();
  const tunnel = tunnels.find((t) => t.id === c.req.param("id"));
  return c.json(tunnel?.connections ?? []);
});

demoApi.post("/tunnels", (c) => {
  throw new HTTPException(403, { message: DEMO_READ_ONLY });
});

demoApi.patch("/tunnels/:id", (c) => {
  throw new HTTPException(403, { message: DEMO_READ_ONLY });
});

demoApi.delete("/tunnels/:id", (c) => {
  throw new HTTPException(403, { message: DEMO_READ_ONLY });
});

demoApi.put("/tunnels/:id/config", (c) => {
  throw new HTTPException(403, { message: DEMO_READ_ONLY });
});

demoApi.all("/*", (c) => {
  if (c.req.method === "GET" || c.req.method === "HEAD") {
    throw new HTTPException(404, { message: "Not found" });
  }
  throw new HTTPException(403, { message: DEMO_READ_ONLY });
});

export { isDemoMode };
