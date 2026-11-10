type SwitchProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Accessible name; the track itself carries no text. */
  label: string;
  disabled?: boolean;
  /** Optional captions shown on either side of the track. */
  startLabel?: string;
  endLabel?: string;
};

/**
 * The only way to render a toggle. The native checkbox stays in the DOM for
 * semantics and keyboard use but is clipped away by `.switch-input`, so it
 * can never show through the track in any state.
 */
export function Switch({ checked, onChange, label, disabled, startLabel, endLabel }: SwitchProps) {
  return (
    <label className={`switch ${checked ? "is-on" : ""}`}>
      {startLabel && <span>{startLabel}</span>}
      <input
        type="checkbox"
        role="switch"
        className="switch-input"
        aria-label={label}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="switch-track" aria-hidden>
        <span className="switch-thumb" />
      </span>
      {endLabel && <span>{endLabel}</span>}
    </label>
  );
}
