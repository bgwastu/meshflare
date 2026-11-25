import type { RoutingConnector, RoutingProfile, RoutingRoute, SplitTunnelItem } from "./api";

export const MESH_SUBNET = "100.96.0.0/12";
export const RESOLVED_IP_V4 = "172.64.128.0/20";

/** Where a destination ends up for one device profile. */
export type Verdict =
  | { kind: "bypass"; reason: "excluded" | "not_included"; entry?: SplitTunnelItem }
  | { kind: "mesh" }
  | { kind: "route"; route: RoutingRoute; connector: RoutingConnector | null }
  | { kind: "route_blocked"; route: RoutingRoute; connector: RoutingConnector | null }
  | { kind: "warp" };

function parseV4(cidr: string): [number, number] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?:\/(\d{1,2}))?$/.exec(cidr.trim());
  if (!m) return null;
  const o = m.slice(1, 5).map(Number);
  if (o.some((x) => x > 255)) return null;
  const bits = m[5] === undefined ? 32 : Number(m[5]);
  if (bits > 32) return null;
  const ip = ((o[0] << 24) | (o[1] << 16) | (o[2] << 8) | o[3]) >>> 0;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return [(ip & mask) >>> 0, bits];
}

const inV4 = (ip: string, cidr: string) => {
  const a = parseV4(ip);
  const b = parseV4(cidr);
  if (!a || !b) return false;
  const mask = b[1] === 0 ? 0 : (0xffffffff << (32 - b[1])) >>> 0;
  return ((a[0] & mask) >>> 0) === b[0];
};

const overlapsV4 = (a: string, b: string) => inV4(a.split("/")[0], b) || inV4(b.split("/")[0], a);

/** Split-tunnel host entries: `*.x` covers subdomains, `x` covers only x. */
const hostEntryMatches = (pattern: string, host: string) =>
  pattern.startsWith("*.") ? host.endsWith(pattern.slice(1)) : pattern === host;

/**
 * Hostname routes: Gateway treats `x` (and `*.x`, stored trimmed) as x plus every
 * subdomain of it. Verified live: a route for ipify.org also captured api.ipify.org.
 */
const routeBase = (route: string) => route.replace(/^\*\./, "");
const routeMatches = (route: string, host: string) => {
  const base = routeBase(route);
  return host === base || host.endsWith(`.${base}`);
};

const isIPv4 = (v: string) => parseV4(v) !== null && !v.includes("/");

const DNS_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** Extract a complete hostname or IP from a bare destination or URL. */
export function normalizeDestination(raw: string): string | null {
  const value = raw.trim();
  if (!value || /[\s\\]/.test(value)) return null;

  const destination = value.replace(/^[a-z][a-z\d+.-]*:\/\//i, "");
  const authority = destination.split(/[/?#]/, 1)[0];
  if (/[@%]/.test(authority)) return null;
  const bareIPv6 = authority === value && /^[a-f\d.]*:[a-f\d.]*:/i.test(authority);
  const hostAndPort = bareIPv6 ? `[${authority}]` : authority;
  const parts = /^(\[[^\]]+\]|[^:[\]]+)(?::\d+)?$/.exec(hostAndPort);
  if (!parts) return null;

  try {
    const host = new URL(`http://${hostAndPort}`).hostname.replace(/\.$/, "");
    const submittedHost = parts[1].replace(/\.$/, "");
    // The URL parser accepts IPv4 shorthand and legacy bases. Require dotted decimal.
    if (isIPv4(host)) return submittedHost === host ? host : null;
    if (host.startsWith("[")) return host.slice(1, -1);

    const labels = host.split(".");
    return host.length <= 253 &&
      labels.length >= 2 &&
      labels[labels.length - 1].length >= 2 &&
      labels.every((label) => DNS_LABEL.test(label))
      ? host
      : null;
  } catch {
    return null;
  }
}

function matchEntry(items: SplitTunnelItem[], dest: string): SplitTunnelItem | undefined {
  return items.find((item) =>
    item.host
      ? !isIPv4(dest) && hostEntryMatches(item.host.toLowerCase(), dest)
      : item.address
        ? isIPv4(dest) && inV4(dest, item.address)
        : false,
  );
}

export function resolveDestination(
  input: string,
  profile: RoutingProfile,
  routes: RoutingRoute[],
  connectors: RoutingConnector[],
): Verdict | null {
  const dest = normalizeDestination(input);
  if (!dest) return null;
  const connectorOf = (r: RoutingRoute) => connectors.find((c) => c.id === r.connectorId) ?? null;
  const ip = isIPv4(dest);

  const hostRoute = ip
    ? undefined
    : routes
        .filter((r) => r.type === "hostname" && routeMatches(r.value, dest))
        .sort((a, b) => routeBase(b.value).length - routeBase(a.value).length)[0];
  const cidrRoute = ip
    ? routes
        .filter((r) => r.type === "cidr" && inV4(dest, r.value))
        .sort((a, b) => Number(b.value.split("/")[1] ?? 32) - Number(a.value.split("/")[1] ?? 32))[0]
    : undefined;

  if (profile.mode === "exclude") {
    const excluded = matchEntry(profile.exclude, dest);
    if (excluded) return { kind: "bypass", reason: "excluded", entry: excluded };
    if (hostRoute) {
      // Routed hostnames resolve to the initial resolved range, which must not be excluded.
      const blocked = profile.exclude.some((i) => i.address && overlapsV4(i.address, RESOLVED_IP_V4));
      return { kind: blocked ? "route_blocked" : "route", route: hostRoute, connector: connectorOf(hostRoute) };
    }
  } else {
    if (hostRoute) {
      const reachable = profile.include.some((i) => i.address && overlapsV4(i.address, RESOLVED_IP_V4));
      return { kind: reachable ? "route" : "route_blocked", route: hostRoute, connector: connectorOf(hostRoute) };
    }
    if (!matchEntry(profile.include, dest)) return { kind: "bypass", reason: "not_included" };
  }

  if (cidrRoute) return { kind: "route", route: cidrRoute, connector: connectorOf(cidrRoute) };
  if (ip && inV4(dest, MESH_SUBNET)) return { kind: "mesh" };
  return { kind: "warp" };
}

/** Entry text as Cloudflare stores it: CIDRs (and bare IPs) as `address`, the rest as `host`. */
export function toSplitItem(raw: string, description?: string): SplitTunnelItem | null {
  const value = raw.trim();
  if (!value) return null;
  const desc = description?.trim() || undefined;
  if (isIPv4(value)) return { address: `${value}/32`, description: desc };
  if (value.includes("/") || value.includes(":")) return { address: value, description: desc };
  return { host: value.toLowerCase(), description: desc };
}

/** Split a pasted block on newlines, commas and whitespace; drop blanks and duplicates. */
export function parseBulk(text: string): string[] {
  return [...new Set(text.split(/[\s,]+/).map((v) => v.trim()).filter(Boolean))];
}

export const splitValue = (item: SplitTunnelItem) => item.address ?? item.host ?? "";

const EMAIL = /^[^\s@"{}\\]+@[^\s@"{}\\]+\.[^\s@"{}\\]+$/;
export const isEmail = (v: string) => EMAIL.test(v);

/**
 * Emails in a match rule of the form `identity.email == "a"` or `identity.email in {"a" "b"}`.
 * Anything else (groups, OS, networks, mixed rules) returns null and is edited as raw text.
 */
export function matchToEmails(match: string | null): string[] | null {
  const m = (match ?? "").trim();
  const one = /^identity\.email\s*==\s*"([^"]+)"$/.exec(m);
  if (one) return isEmail(one[1]) ? [one[1]] : null;
  const many = /^identity\.email\s+in\s+\{((?:\s*"[^"]+"\s*)+)\}$/.exec(m);
  if (!many) return null;
  const emails = [...many[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
  return emails.every(isEmail) ? emails : null;
}

export function emailsToMatch(emails: string[]): string {
  return emails.length === 1
    ? `identity.email == "${emails[0]}"`
    : `identity.email in {${emails.map((e) => `"${e}"`).join(" ")}}`;
}
