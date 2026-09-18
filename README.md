<div align="center">

<img src="public/icon-512.png" alt="meshflare" width="128">

# meshflare

**Cloudflare Mesh and Tunnel manager**

A self-hostable control plane for Cloudflare Zero Trust — manage mesh nodes, device registrations, Cloudflare Tunnels, split tunnels, and DNS filtering from one dashboard.

<a href="https://deploy.workers.cloudflare.com/?url=https://github.com/bgwastu/meshflare"><img src="https://deploy.workers.cloudflare.com/button" alt="Deploy to Cloudflare Workers" height="20"></a>
<a href="https://github.com/bgwastu/meshflare/pkgs/container/meshflare"><img src="https://img.shields.io/badge/Docker-ghcr.io%2Fbgwastu%2Fmeshflare-2496ed?logo=docker&logoColor=white" alt="Docker"></a>
<a href="https://bun.sh"><img src="https://img.shields.io/badge/Bun-f9f9f9?logo=bun&logoColor=black&labelColor=f9f9f9" alt="Bun"></a>

**Demo:** [meshflare-demo.wastu.workers.dev](https://meshflare-demo.wastu.workers.dev) (read-only)

</div>

---

## Features

- Mesh node and device management
- Cloudflare Tunnel and ingress management
- Automatic Mesh DNS names
- CIDR and hostname routes
- WARP split-tunnel management
- DNS filtering
- Offline-device cleanup
- WARP connector setup commands

## Screenshots

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/demo-mesh-dark.png">
    <img alt="meshflare Mesh nodes" src="docs/screenshots/demo-mesh-light.png" width="800">
  </picture>
</p>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/demo-tunnels-dark.png">
    <img alt="meshflare Cloudflare Tunnels" src="docs/screenshots/demo-tunnels-light.png" width="800">
  </picture>
</p>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/demo-settings-dark.png">
    <img alt="meshflare settings" src="docs/screenshots/demo-settings-light.png" width="800">
  </picture>
</p>

## Cloudflare

The Deploy button creates an independent Worker and D1 database in your Cloudflare account.

Required:

- Cloudflare account ID
- Scoped Cloudflare account API token

Required token permissions:

- Zero Trust Read
- Zero Trust Write
- Secure DNS Locations Write
- Cloudflare Tunnel permissions, if managing Tunnels

For automatic production deployments, connect the repository to the Worker with
**Workers & Pages > Settings > Builds**:

```text
Build:   bun install --frozen-lockfile && bun run build
Deploy:  bun run deploy
Branch:  main
```

Build variables:

```text
CLOUDFLARE_ACCOUNT_ID
MESHFLARE_D1_DATABASE_ID
```

Runtime secrets:

```text
CLOUDFLARE_API_TOKEN
MESHFLARE_PASSWORD   # optional, 32+ characters
```

## Self-Hosted

Self-hosted mode uses Bun and SQLite.

```bash
cp .env.example .env
bun install
bun run db:migrate
bun run dev
```

Open **http://127.0.0.1:$PORT** (default `5173`) for the Vite UI with HMR.
The API listens on `API_PORT` (default `8787`, or a free port if that is busy) and is proxied as `/api`.

```bash
PORT=8000 bun run dev          # UI at :8000, API at :8787 (or free)
API_PORT=4000 bun run dev      # UI at :5173, API at :4000
```

- `bun run start` / Docker — single server; `PORT` is that server (default `3000`)
- `bun run dev:api` — API only (serves built `dist/` if present; uses `PORT`)
- `bun run dev:client` — Vite UI only (proxies `/api` to `API_PORT`, default `8787`)

Docker:

```bash
docker run --rm -p 3000:3000 \
  -v meshflare-data:/data \
  -e CLOUDFLARE_ACCOUNT_ID=... \
  -e CLOUDFLARE_API_TOKEN=... \
  -e MESHFLARE_PASSWORD=... \
  ghcr.io/bgwastu/meshflare:latest
```

## Configuration

| Variable | Description |
|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID |
| `CLOUDFLARE_API_TOKEN` | Cloudflare account API token |
| `MESHFLARE_PASSWORD` | Optional dashboard password, minimum 32 characters |
| `DATA_DIR` | SQLite directory; default `./data` or `/data` in Docker |
| `PORT` | UI port in `bun run dev` (default `5173`); server port for `bun run start` (default `3000`) |
| `API_PORT` | API port during `bun run dev` only (default `8787`); Vite proxies `/api` here |
| `DEMO_MODE` | Enables read-only demo fixtures |

Mesh suffix, offline cleanup days, and DNS filter settings are managed from the
Settings page and stored in the app database. They do not need environment
variables.
