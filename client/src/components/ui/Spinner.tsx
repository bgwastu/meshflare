import { Loader2 } from "lucide-react";

export function Spinner({ label }: { label: string }) {
  return (
    <span className="btn-spin">
      <Loader2 size={14} strokeWidth={2.5} className="spin" aria-hidden />
      {label}
    </span>
  );
}
