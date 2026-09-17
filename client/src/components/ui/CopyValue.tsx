import { copyText } from "../../lib/warp";
import { useLanguage } from "../../hooks/useLanguage";

export function CopyValue({
  value,
  onCopied,
  title,
}: {
  value: string | null | undefined;
  onCopied?: (label: string) => void;
  title?: string;
}) {
  const { t } = useLanguage();
  if (!value) return <span className="mono muted">—</span>;

  const tooltipTitle = title ?? t("common.copy");

  return (
    <button
      type="button"
      className="copy-chip mono"
      title={tooltipTitle}
      dir="ltr"
      onClick={(e) => {
        e.stopPropagation();
        void (async () => {
          try {
            await copyText(value);
            onCopied?.(value);
          } catch {
            /* Handled by caller */
          }
        })();
      }}
    >
      {value}
    </button>
  );
}
