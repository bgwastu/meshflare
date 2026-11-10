// Mirrors worker/cf/names.ts so the UI can preview and validate labels.

/** Default hostname label derived from a machine name. */
export function slugifyName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 58)
    .replace(/^-+|-+$/g, "");
  return slug || "unnamed";
}

/** Trim/lowercase a user-entered label; empty means "use the default". */
export function normalizeMeshLabel(raw: string): string | null {
  const label = raw.trim().toLowerCase().replace(/\.+$/, "");
  return label || null;
}

const MESH_LABEL_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** A single DNS label: lowercase letters, digits and inner hyphens, max 63 chars. */
export const isValidMeshLabel = (label: string) => MESH_LABEL_RE.test(label);
