import type { CloudflareClient } from "./client";
import type { Settings } from "../types";

export type AccountInfo = {
  name: string;
  email: string | null;
};

type AccountMember = {
  email?: string;
  status?: string;
  roles?: Array<{ name?: string }>;
  user?: { email?: string };
};

/**
 * Prefer account name for the product subtitle; include an email when available.
 * Account API tokens cannot call GET /user (9109), so we fall back to env and
 * account members.
 */
export async function fetchAccountInfo(
  cf: CloudflareClient,
  fallbackEmail?: string | null,
): Promise<AccountInfo> {
  const [account, user] = await Promise.all([
    cf.request<{ id: string; name: string }>("GET", `/accounts/${cf.accountId}`),
    // Account-scoped tokens lack user-level auth.
    cf.request<{ email?: string }>("GET", "/user").catch(() => null),
  ]);

  let email: string | null = user?.result?.email?.trim() || null;

  if (!email && fallbackEmail?.trim()) {
    email = fallbackEmail.trim();
  }

  if (!email) {
    try {
      const members = await cf.request<AccountMember[]>(
        "GET",
        cf.accountPath("/members?per_page=50&status=accepted"),
      );
      const list = members.result ?? [];
      const preferred =
        list.find((m) =>
          (m.roles ?? []).some((r) => /super administrator|administrator/i.test(r.name ?? "")),
        ) ?? list[0];
      email =
        preferred?.user?.email?.trim() ||
        preferred?.email?.trim() ||
        null;
    } catch {
      /* Account Settings Read may be missing */
    }
  }

  return {
    name: account.result?.name?.trim() || cf.accountId,
    email,
  };
}

export type GatewayLocation = {
  id?: string;
  name?: string;
  client_default?: boolean;
  doh_subdomain?: string;
  endpoints?: {
    ipv4?: { enabled?: boolean };
    ipv6?: { enabled?: boolean };
    doh?: { enabled?: boolean; require_token?: boolean };
    dot?: { enabled?: boolean; require_token?: boolean };
  };
  ip?: string;
  ipv4_destination?: string;
  ipv4_destination_backup?: string;
  networks?: Array<{ network?: string }>;
};

export async function getDefaultGatewayDnsLocation(
  cf: CloudflareClient,
): Promise<GatewayLocation | null> {
  const res = await cf.request<GatewayLocation[]>("GET", cf.accountPath("/gateway/locations"));
  return res.result?.find((item) => item.client_default) ?? null;
}

export function serializeGatewayDnsLocation(
  location: GatewayLocation | null,
): Settings["dnsLocation"] {
  if (!location?.id) return null;
  return {
    id: location.id,
    name: location.name,
    clientDefault: Boolean(location.client_default),
    dohSubdomain: location.doh_subdomain,
    ipv4Destination: location.ipv4_destination,
    ipv4DestinationBackup: location.ipv4_destination_backup,
    ipv6Destination: location.ip,
    sourceNetworks: (location.networks ?? [])
      .map((item) => item.network)
      .filter((network): network is string => Boolean(network)),
    endpoints: {
      ipv4: Boolean(location.endpoints?.ipv4?.enabled),
      ipv6: Boolean(location.endpoints?.ipv6?.enabled),
      doh: Boolean(location.endpoints?.doh?.enabled),
    },
  };
}

export type AccountOverview = {
  accountName: string | null;
  accountEmail: string | null;
  dnsLocation: Settings["dnsLocation"];
};

const OVERVIEW_TTL_MS = 5 * 60_000;
const OVERVIEW_FAILURE_TTL_MS = 30_000;
// Resolved values only: Workers must not await I/O promises across requests.
const overviewCache = new Map<string, { expiresAt: number; value: AccountOverview }>();

/**
 * Account name/email and the default Gateway DNS location for the settings page.
 * Both change rarely, so they are cached per isolate; a failing lookup degrades
 * to null instead of failing the whole settings response.
 */
export async function getAccountOverview(
  cf: CloudflareClient,
  options?: { fresh?: boolean },
): Promise<AccountOverview> {
  const cached = overviewCache.get(cf.accountId);
  if (cached && !options?.fresh && cached.expiresAt > Date.now()) return cached.value;

  let failed = false;
  const tolerate = (label: string) => (error: unknown) => {
    failed = true;
    console.warn(`meshflare ${label}`, error);
    return null;
  };
  const [account, location] = await Promise.all([
    fetchAccountInfo(cf).catch(tolerate("account info")),
    getDefaultGatewayDnsLocation(cf).catch(tolerate("gateway location")),
  ]);
  const value: AccountOverview = {
    accountName: account?.name ?? null,
    accountEmail: account?.email ?? null,
    dnsLocation: serializeGatewayDnsLocation(location),
  };
  overviewCache.set(cf.accountId, {
    expiresAt: Date.now() + (failed ? OVERVIEW_FAILURE_TTL_MS : OVERVIEW_TTL_MS),
    value,
  });
  return value;
}
