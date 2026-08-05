import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { CookieStore, sessionMiddleware, type Session } from "hono-sessions";
import { z } from "zod";
import { api } from "./routes/api";
import type { Env } from "./types";

type AuthSession = { authenticated: boolean };
type AppContext = {
  Bindings: Env;
  Variables: { session: Session<AuthSession> };
};

const sessionStore = new CookieStore();
const loginSchema = z.object({ password: z.string().min(1) });

export function createApp() {
  const app = new Hono<AppContext>();
  app.use("/api/*", async (c, next) => {
    const password = c.env.MESHFLARE_PASSWORD?.trim();
    if (!password) return next();
    if (password.length < 32) {
      return c.json({ error: "MESHFLARE_PASSWORD must be at least 32 characters" }, 500);
    }
    return sessionMiddleware({
      store: sessionStore,
      encryptionKey: password,
      expireAfterSeconds: 60 * 60 * 24 * 14,
      cookieOptions: {
        httpOnly: true,
        sameSite: "Lax",
        secure: true,
        path: "/",
      },
    })(c, next);
  });

  app.get("/api/auth/status", (c) => {
    const required = Boolean(c.env.MESHFLARE_PASSWORD?.trim());
    return c.json({
      required,
      authenticated: !required || c.get("session")?.get("authenticated") === true,
    });
  });

  app.post("/api/auth/login", zValidator("json", loginSchema), async (c) => {
    const expected = c.env.MESHFLARE_PASSWORD?.trim();
    if (!expected) return c.json({ required: false, authenticated: true });
    if (expected.length < 32) {
      return c.json({ error: "MESHFLARE_PASSWORD must be at least 32 characters" }, 500);
    }
    const { password } = c.req.valid("json");
    if (!(await passwordsMatch(password, expected))) {
      return c.json({ error: "Incorrect password" }, 401);
    }
    c.get("session").set("authenticated", true);
    return c.json({ required: true, authenticated: true });
  });

  app.post("/api/auth/logout", (c) => {
    c.get("session")?.forget("authenticated");
    return c.json({ ok: true });
  });

  app.use("/api/*", async (c, next) => {
    if (!c.env.MESHFLARE_PASSWORD?.trim()) return next();
    if (c.get("session")?.get("authenticated") === true) return next();
    return c.json({ error: "Authentication required" }, 401);
  });
  app.route("/api", api);
  return app;
}

async function passwordsMatch(input: string, expected: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [inputHash, expectedHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(input)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  const inputBytes = new Uint8Array(inputHash);
  const expectedBytes = new Uint8Array(expectedHash);
  let difference = 0;
  for (let i = 0; i < expectedBytes.length; i += 1) {
    difference |= inputBytes[i] ^ expectedBytes[i];
  }
  return difference === 0;
}
