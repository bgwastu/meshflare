#!/usr/bin/env bun
/**
 * Local development: Vite UI (HMR) + Bun API (--hot).
 *
 * PORT       → UI/HMR port you open (default 5173)
 * API_PORT   → API port (default 8787); auto-picks a free port if busy
 *              unless API_PORT was set explicitly
 */

const uiPort = process.env.PORT?.trim() || "5173";
const preferredApiPort = process.env.API_PORT?.trim() || "8787";
const apiPortExplicit = Boolean(process.env.API_PORT?.trim());

async function canListen(port) {
  try {
    const server = Bun.serve({
      port: Number(port),
      hostname: "127.0.0.1",
      fetch() {
        return new Response("ok");
      },
    });
    server.stop(true);
    return true;
  } catch {
    return false;
  }
}

async function allocatePort() {
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch() {
      return new Response("ok");
    },
  });
  const port = String(server.port);
  server.stop(true);
  return port;
}

async function resolveApiPort() {
  if (await canListen(preferredApiPort)) return preferredApiPort;
  if (apiPortExplicit) {
    console.error(
      `API_PORT ${preferredApiPort} is already in use. Free it or pick another API_PORT.`,
    );
    process.exit(1);
  }
  const fallback = await allocatePort();
  console.warn(
    `API port ${preferredApiPort} is busy; using ${fallback} instead.`,
  );
  return fallback;
}

const apiPort = await resolveApiPort();

if (uiPort === apiPort) {
  console.error(
    `PORT (${uiPort}) and API_PORT (${apiPort}) must differ. Set API_PORT to another port.`,
  );
  process.exit(1);
}

if (!(await canListen(uiPort))) {
  console.error(
    `PORT ${uiPort} is already in use. Free it or pick another PORT.`,
  );
  process.exit(1);
}

const children = [];

function spawn(label, cmd, env = process.env) {
  const child = Bun.spawn(cmd, {
    stdout: "inherit",
    stderr: "inherit",
    stdin: "inherit",
    env,
  });
  children.push({ label, child });
  return child;
}

function shutdown(code = 0) {
  for (const { child } of children) {
    try {
      child.kill();
    } catch {
      /* already exited */
    }
  }
  process.exit(code);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

console.log("meshflare dev");
console.log(`  UI/HMR → http://127.0.0.1:${uiPort}  ← open this`);
console.log(`  API    → http://127.0.0.1:${apiPort}  (proxied as /api)`);
console.log("");

spawn(
  "api",
  ["bun", "run", "--hot", "server/selfhost.ts"],
  { ...process.env, PORT: apiPort },
);
spawn(
  "vite",
  ["bunx", "vite", "--host", "127.0.0.1", "--port", uiPort],
  { ...process.env, API_PORT: apiPort, PORT: uiPort },
);

const exits = await Promise.all(children.map(({ child }) => child.exited));
const failed = exits.find((code) => code !== 0 && code !== null);
shutdown(failed ?? 0);
