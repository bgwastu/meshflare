type FacetChipProps = {
  active: boolean;
  label: string;
  count?: number;
  tone?: "node" | "device";
  onClick: () => void;
};

export function FacetChip({
  active,
  label,
  count,
  tone,
  onClick,
}: FacetChipProps) {
  return (
    <button
      type="button"
      className={`facet-chip ${active ? "is-active" : ""}`}
      onClick={onClick}
      aria-pressed={active}
    >
      {tone && <span className={`facet-dot ${tone}`} aria-hidden />}
      <span>{label}</span>
      {typeof count === "number" && (
        <span className="facet-chip-count" aria-label={`${count} items`}>
          {count}
        </span>
      )}
    </button>
  );
}
