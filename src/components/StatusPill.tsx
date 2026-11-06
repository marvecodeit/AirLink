import clsx from "clsx";
import { statusMeta, toneClasses, toneDot } from "../lib/status";
import type { ConnectionState } from "../types";

export function StatusPill({
  state,
  animate = false,
  className,
}: {
  state: ConnectionState;
  animate?: boolean;
  className?: string;
}) {
  const meta = statusMeta(state);
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium leading-none",
        toneClasses(meta.tone),
        className,
      )}
    >
      <span
        className={clsx(
          "h-1.5 w-1.5 rounded-full",
          toneDot(meta.tone),
          animate && "animate-pulse",
        )}
      />
      {meta.label}
    </span>
  );
}
