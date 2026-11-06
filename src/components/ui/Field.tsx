import clsx from "clsx";
import type {
  InputHTMLAttributes,
  LabelHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from "react";

export function Label({
  className,
  ...props
}: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: callers pair this component with an input via htmlFor.
    <label
      className={clsx(
        "mb-1.5 block text-[12px] font-medium text-ink-secondary",
        className,
      )}
      {...props}
    />
  );
}

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={clsx(
        "h-9 w-full rounded-[9px] border border-hairline-strong bg-surface px-3 text-[13px] text-ink shadow-[inset_0_1px_1px_rgba(16,35,26,0.02)] outline-none transition-colors placeholder:text-ink-tertiary focus:border-brand/60 focus:ring-2 focus:ring-brand/12",
        className,
      )}
      {...props}
    />
  );
}

export function Select({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={clsx(
        "h-9 w-full appearance-none rounded-[9px] border border-hairline-strong bg-surface px-3 pr-8 text-[13px] text-ink outline-none transition-colors focus:border-brand/60 focus:ring-2 focus:ring-brand/12",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export function Hint({ children }: { children: ReactNode }) {
  return (
    <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-tertiary">
      {children}
    </p>
  );
}

export function SettingsRow({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        "flex items-start justify-between gap-6 py-4 first:pt-0 last:pb-0",
        className,
      )}
    >
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-ink">{title}</p>
        {description ? (
          <p className="mt-1 max-w-[440px] text-[11.5px] leading-relaxed text-ink-tertiary">
            {description}
          </p>
        ) : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
