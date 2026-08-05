import { createD1Database } from "./db";
import { createApp } from "./app";
import type { Env } from "./types";

type CloudflareEnv = Omit<Env, "DB"> & {
  DB: D1Database;
  ASSETS: Fetcher;
};

const app = createApp();

function runtimeEnv(env: CloudflareEnv): Env {
  return { ...env, DB: createD1Database(env.DB) } as Env;
}

export default {
  async fetch(request: Request, env: CloudflareEnv, ctx: ExecutionContext): Promise<Response> {
    const response = await app.fetch(request, runtimeEnv(env), ctx);
    if (response.status !== 404 || new URL(request.url).pathname.startsWith("/api/")) {
      return response;
    }
    return env.ASSETS.fetch(request);
  },

  async scheduled(event: ScheduledEvent, env: CloudflareEnv, ctx: ExecutionContext): Promise<void> {
    const runtime = runtimeEnv(env);
    ctx.waitUntil(import("./maintenance").then(({ runMaintenance }) => runMaintenance(runtime)));
  },
};
