export function dnsFilterStatusMeta(status: string, enabled: boolean): {
  tone: "off" | "ok" | "sync" | "warn" | "danger";
  tip: string;
} {
  switch (status) {
    case "enabled":
      return { tone: "ok", tip: "Enabled" };
    case "pending_enable":
      return { tone: "sync", tip: "Enabling…" };
    case "pending_refresh":
      return { tone: "sync", tip: "Refreshing lists…" };
    case "syncing":
      return { tone: "sync", tip: "Uploading lists…" };
    case "pending_disable":
      return { tone: "warn", tip: "Disabling…" };
    case "error":
      return { tone: "danger", tip: "Sync error" };
    default:
      if (enabled) return { tone: "ok", tip: "Enabled" };
      return { tone: "off", tip: "Disabled" };
  }
}

export function isNodeInitial(status: string): boolean {
  return status.trim().toLowerCase() === "inactive";
}

/** Colored status pill for machine inventory rows. */
export function machineStatusMeta(status: string): {
  tone: "off" | "ok" | "sync" | "warn" | "danger";
  label: string;
} {
  const label = status.trim() || "unknown";
  const s = label.toLowerCase();
  if (s === "healthy" || s === "up" || s === "online") return { tone: "ok", label };
  if (s === "registered" || s === "active" || s === "connected") return { tone: "ok", label };
  if (s === "down" || s === "disconnected") return { tone: "danger", label };
  if (s.includes("pending") || s.includes("connect") || s.includes("sync")) {
    return { tone: "sync", label };
  }
  // inactive, offline, unknown — neutral, not alarming
  return { tone: "off", label };
}

/** Colored status pill for tunnel inventory rows. */
export function tunnelStatusMeta(status: string): {
  tone: "off" | "ok" | "sync" | "warn" | "danger";
  label: string;
} {
  const s = status.trim().toLowerCase();
  if (s === "healthy") return { tone: "ok", label: "Healthy" };
  if (s === "degraded") return { tone: "warn", label: "Degraded" };
  if (s === "down") return { tone: "danger", label: "Down" };
  if (s === "inactive") return { tone: "off", label: "Inactive" };
  return { tone: "off", label: status };
}

/** Debian/Ubuntu one-liner: install cloudflare-warp + enroll connector + connect. */
export type InstallPlatform = "debian" | "rhel" | "docker";

/** One-liner installer for WARP Connector / Cloudflare Mesh node. */
export function warpConnectorInstallCommand(token: string, platform: InstallPlatform = "debian"): string {
  if (platform === "docker") {
    return [
      `docker run -d --name cloudflare-warp \\`,
      `  --restart always \\`,
      `  --cap-add NET_ADMIN \\`,
      `  --device /dev/net/tun \\`,
      `  -e WARP_CONNECTOR_TOKEN="${token}" \\`,
      `  cloudflare/warp-connector:latest`,
    ].join("\n");
  }
  if (platform === "rhel") {
    return [
      `sudo dnf install -y epel-release &&`,
      `curl -fsSl https://pkg.cloudflareclient.com/cloudflare-warp-ascii.repo | sudo tee /etc/yum.repos.d/cloudflare-warp.repo &&`,
      `sudo dnf install -y cloudflare-warp &&`,
      `printf 'net.ipv4.ip_forward = 1\\nnet.ipv6.conf.all.forwarding = 1\\nnet.ipv6.conf.all.accept_ra = 2\\n' | sudo tee /etc/sysctl.d/99-zzz-cloudflare-warp-connector.conf && sudo sysctl --system &&`,
      `sudo warp-cli --accept-tos connector new ${token} && sudo warp-cli --accept-tos connect`,
    ].join("\n");
  }
  return [
    `curl -fsSL https://pkg.cloudflareclient.com/pubkey.gpg | sudo gpg --yes --dearmor -o /usr/share/keyrings/cloudflare-warp-archive-keyring.gpg &&`,
    `echo "deb [signed-by=/usr/share/keyrings/cloudflare-warp-archive-keyring.gpg] https://pkg.cloudflareclient.com/ $(. /etc/os-release && echo "$VERSION_CODENAME") main" | sudo tee /etc/apt/sources.list.d/cloudflare-client.list &&`,
    `sudo apt-get update -qq && sudo apt-get install -y -qq cloudflare-warp &&`,
    `printf 'net.ipv4.ip_forward = 1\\nnet.ipv6.conf.all.forwarding = 1\\nnet.ipv6.conf.all.accept_ra = 2\\n' | sudo tee /etc/sysctl.d/99-zzz-cloudflare-warp-connector.conf && sudo sysctl --system &&`,
    `sudo warp-cli --accept-tos connector new ${token} && sudo warp-cli --accept-tos connect`,
  ].join("\n");
}

export async function copyText(text: string): Promise<void> {
  try {
    if (navigator.clipboard?.writeText && document.hasFocus()) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch {
    /* fall through */
  }

  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.top = "0";
  ta.style.left = "0";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  const ok = document.execCommand("copy");
  document.body.removeChild(ta);
  if (!ok) throw new Error("Could not copy to clipboard");
}
