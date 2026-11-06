import clsx from "clsx";

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}

export function Toggle({ checked, onChange, label, disabled }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={clsx(
        "relative inline-flex h-[24px] w-[42px] shrink-0 items-center rounded-full border transition-colors duration-200 disabled:opacity-40",
        checked
          ? "border-brand/30 bg-brand"
          : "border-hairline-strong bg-surface-muted",
      )}
    >
      <span
        className={clsx(
          "pointer-events-none block h-[18px] w-[18px] rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.24)] transition-transform duration-200",
          checked ? "translate-x-[20px]" : "translate-x-[3px]",
        )}
      />
    </button>
  );
}
