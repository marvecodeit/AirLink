import clsx from "clsx";
import type { ReactNode } from "react";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
}

interface SegmentedProps<T extends string> {
  value: T;
  options: SegmentedOption<T>[];
  onChange: (value: T) => void;
  label: string;
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: SegmentedProps<T>) {
  return (
    <fieldset className="inline-flex rounded-[10px] border border-hairline bg-surface-muted p-[3px]">
      <legend className="sr-only">{label}</legend>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={clsx(
              "inline-flex h-7 items-center gap-1.5 rounded-[7px] px-2.5 text-[12px] font-medium transition-all duration-150",
              active
                ? "bg-surface text-ink shadow-[0_1px_2px_rgba(16,35,26,0.12)]"
                : "text-ink-tertiary hover:text-ink-secondary",
            )}
          >
            {option.icon}
            {option.label}
          </button>
        );
      })}
    </fieldset>
  );
}
