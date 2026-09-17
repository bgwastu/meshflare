export function formatSeen(
  iso: string | null | undefined,
  empty = "—",
  lang = "en",
): string {
  if (!iso) return empty;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;

  const diffMs = Date.now() - t;
  const diffSec = Math.round(diffMs / 1000);
  const diffMin = Math.round(diffSec / 60);
  const diffHours = Math.round(diffMin / 60);
  const diffDays = Math.round(diffHours / 24);

  try {
    const rtf = new Intl.RelativeTimeFormat(lang, { numeric: "auto" });

    if (Math.abs(diffSec) < 60) {
      return rtf.format(-Math.max(1, diffSec), "second");
    }
    if (Math.abs(diffMin) < 60) {
      return rtf.format(-diffMin, "minute");
    }
    if (Math.abs(diffHours) < 24) {
      return rtf.format(-diffHours, "hour");
    }
    return rtf.format(-diffDays, "day");
  } catch {
    // Fallback if Intl.RelativeTimeFormat fails
    if (diffDays < 1 / 24) return "just now";
    if (diffDays < 1) return `${Math.max(1, diffHours)}h ago`;
    return `${Math.floor(diffDays)}d ago`;
  }
}

export function formatDateTime(
  iso: string | null | undefined,
  empty = "—",
  lang = "en",
): string {
  if (!iso) return empty;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;

  try {
    return new Intl.DateTimeFormat(lang, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(t));
  } catch {
    return new Date(t).toLocaleString();
  }
}
