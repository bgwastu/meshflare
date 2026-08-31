import { Loader2 } from "lucide-react";
import { copyText } from "./warp";

export function formatSeen(iso: string | null | undefined, empty = "—"): string {
  if (!iso) return empty;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const days = (Date.now() - t) / 86_400_000;
  if (days < 1 / 24) return "just now";
  if (days < 1) return `${Math.max(1, Math.round(days * 24))}h ago`;
  return `${Math.floor(days)}d ago`;
}

export function Spinner({ label }: { label: string }) {
  return (
    <span className="btn-spin">
      <Loader2 size={14} strokeWidth={2.5} className="spin" aria-hidden />
      {label}
    </span>
  );
}

export function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden />;
}

export function CopyValue({
  value,
  onCopied,
}: {
  value: string | null;
  onCopied: (label: string) => void;
}) {
  if (!value) return <span className="mono muted">—</span>;
  return (
    <button
      type="button"
      className="copy-chip mono"
      title="Click to copy"
      onClick={(e) => {
        e.stopPropagation();
        void (async () => {
          try {
            await copyText(value);
            onCopied(value);
          } catch {
            /* toast handled by caller if needed */
          }
        })();
      }}
    >
      {value}
    </button>
  );
}
