import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";

export type FacetOption = { value: string; label: string };

/** Dropdown chip that shows the active value; clicking opens the option menu. */
export function FacetChip({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: FacetOption[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const active = value !== "all";
  const current = options.find((opt) => opt.value === value)?.label ?? "All";

  return (
    <div className="facet-wrap">
      <button
        type="button"
        className={`facet-chip${active ? " active" : ""}`}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className="facet-label">{label}</span>
        <span className="facet-value">{current}</span>
        <ChevronDown
          size={12}
          strokeWidth={2.5}
          className={`facet-caret${open ? " open" : ""}`}
          aria-hidden
        />
      </button>
      {open && (
        <>
          <div className="facet-backdrop" onClick={() => setOpen(false)} />
          <div className="facet-menu" role="menu" aria-label={`Filter by ${label}`}>
            {options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                role="menuitemradio"
                aria-checked={value === opt.value}
                className={`facet-option${value === opt.value ? " selected" : ""}`}
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
              >
                {opt.label}
                {value === opt.value && <Check size={13} strokeWidth={2.5} aria-hidden />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
