/** Slugify a mesh name for DNS labels (name.mesh). */
function slugifyName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
  return slug || "unnamed";
}

export function meshHostname(name: string, suffix = "mesh"): string {
  return `${slugifyName(name)}.${suffix}`;
}

/** Pick next free name: base, base-2, base-3, ... */
export function nextSuffixedName(desired: string, taken: Set<string>): string {
  const base = desired.trim();
  if (!taken.has(base.toLowerCase())) return base;

  let n = 2;
  while (n < 10_000) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
    n += 1;
  }
  throw new Error(`Could not find free suffix for name "${desired}"`);
}

export function daysSince(iso: string | null | undefined, now = Date.now()): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return (now - t) / 86_400_000;
}

/** Devices lack a live CF status string — treat recent last_seen as online. */
const DEVICE_ONLINE_WITHIN_MS = 15 * 60_000;

export function devicePresenceStatus(
  lastSeenAt: string | null | undefined,
  now = Date.now(),
): "online" | "offline" {
  if (!lastSeenAt) return "offline";
  const t = Date.parse(lastSeenAt);
  if (Number.isNaN(t)) return "offline";
  return now - t <= DEVICE_ONLINE_WITHIN_MS ? "online" : "offline";
}

export function isConnectorRegistration(reg: {
  user?: { email?: string };
}): boolean {
  const email = reg.user?.email?.toLowerCase() ?? "";
  return email.includes("warp_connector@");
}
