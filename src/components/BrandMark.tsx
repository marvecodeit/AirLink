import clsx from "clsx";

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <img
        src="/app-icon.png"
        alt=""
        aria-hidden
        className="h-8 w-8 rounded-[9px] shadow-[0_2px_6px_rgba(14,80,36,0.24)] ring-1 ring-black/5 dark:ring-white/10"
      />
      {!compact ? (
        <div className="min-w-0">
          <p className="truncate text-[14px] font-semibold leading-tight tracking-[-0.015em] text-ink">
            AirLink
          </p>
          <p className="mt-0.5 truncate text-[9px] font-medium uppercase leading-tight tracking-[0.14em] text-ink-tertiary">
            marvecodeit
          </p>
        </div>
      ) : null}
    </div>
  );
}

export function SignalBars({
  bars,
  className,
}: {
  bars: number | null;
  className?: string;
}) {
  const active = bars ?? 0;
  return (
    <div
      className={clsx("flex items-end gap-[2px]", className)}
      aria-label={`Signal strength ${active} of 4`}
      role="img"
    >
      {[3, 5, 7, 9].map((height, index) => (
        <span
          key={height}
          style={{ height }}
          className={clsx(
            "w-[3px] rounded-full transition-colors",
            index < active ? "bg-brand" : "bg-hairline-strong",
          )}
        />
      ))}
    </div>
  );
}
