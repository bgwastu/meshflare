import { useRef, type ComponentPropsWithoutRef, type ReactNode, type RefObject } from "react";
import { Search, X } from "lucide-react";
import { useLanguage } from "../../hooks/useLanguage";

type SearchFieldProps = Omit<ComponentPropsWithoutRef<"input">, "type" | "value" | "onChange"> & {
  value: string;
  onChange: (value: string) => void;
  inputRef?: RefObject<HTMLInputElement | null>;
  emptyAdornment?: ReactNode;
};

export function SearchField({ value, onChange, inputRef, emptyAdornment, ...inputProps }: SearchFieldProps) {
  const { t } = useLanguage();
  const localRef = useRef<HTMLInputElement>(null);
  const fieldRef = inputRef ?? localRef;
  const clearLabel = t("common.clearSearch");

  return (
    <div className="search-wrap">
      <Search size={15} strokeWidth={2.25} className="search-icon" aria-hidden />
      <input
        {...inputProps}
        ref={fieldRef}
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {value ? (
        <button
          type="button"
          className="icon-btn icon-btn-sm search-clear"
          aria-label={clearLabel}
          title={clearLabel}
          disabled={inputProps.disabled || inputProps.readOnly}
          onClick={() => {
            onChange("");
            fieldRef.current?.focus();
          }}
        >
          <X size={15} aria-hidden />
        </button>
      ) : emptyAdornment}
    </div>
  );
}
