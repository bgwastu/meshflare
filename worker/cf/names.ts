/** Slugify a mesh name for DNS labels (name.mesh). */
export function slugifyName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 58)
    .replace(/^-+|-+$/g, "");
  return slug || "unnamed";
}

export function meshHostname(name: string, suffix = "mesh"): string {
  return `${slugifyName(name)}.${suffix}`;
}

const MESH_LABEL_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** A single DNS label: lowercase letters, digits and inner hyphens, max 63 chars. */
export function isValidMeshLabel(label: string): boolean {
  return MESH_LABEL_RE.test(label);
}

/** Trim/lowercase a user-provided label; empty means "use the default". */
export function normalizeMeshLabel(raw: string | null | undefined): string | null {
  const label = raw?.trim().toLowerCase().replace(/\.+$/, "") ?? "";
  return label || null;
}

export function meshLabelKey(kind: "node" | "device", id: string): string {
  return `${kind}:${id}`;
}

/**
 * Assign unique hostnames in place. Custom labels claim their hostname first
 * (in entry order); derived names then take `slug`, `slug-2`, `slug-3`, ….
 */
export function assignMeshHostnames<
  T extends { kind: "node" | "device"; id: string; name: string; meshHostname: string | null; meshLabel: string | null },
>(entries: T[], suffix: string, labels: Record<string, string>): T[] {
  const used = new Set<string>();
  const derived: T[] = [];

  for (const entry of entries) {
    const label = labels[meshLabelKey(entry.kind, entry.id)];
    const hostname = label && isValidMeshLabel(label) ? `${label}.${suffix}` : null;
    if (hostname && !used.has(hostname)) {
      used.add(hostname);
      entry.meshLabel = label;
      entry.meshHostname = hostname;
    } else {
      derived.push(entry);
    }
  }

  for (const entry of derived) {
    const slug = slugifyName(entry.name);
    let hostname = `${slug}.${suffix}`;
    for (let n = 2; used.has(hostname); n += 1) hostname = `${slug}-${n}.${suffix}`;
    used.add(hostname);
    entry.meshLabel = null;
    entry.meshHostname = hostname;
  }

  return entries;
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

const RESERVED_FALLBACK_SUFFIXES = new Set([
  "local",
  "internal",
  "lan",
  "home.arpa",
  "corp",
  "private",
  "test",
  "arpa",
]);

/** Cloudflare WARP client bypasses Gateway for Local Domain Fallback suffixes by default. */
export function isReservedFallbackSuffix(suffix: string): boolean {
  return RESERVED_FALLBACK_SUFFIXES.has(suffix.trim().toLowerCase());
}
