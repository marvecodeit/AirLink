import clsx from "clsx";
import {
  CircleAlert,
  CircleCheck,
  Info,
  TriangleAlert,
  X,
} from "lucide-react";
import { useAppStore } from "../../stores/appStore";
import type { ToastTone } from "../../types";

const toneStyles: Record<
  ToastTone,
  { icon: typeof Info; iconClass: string; ring: string }
> = {
  success: {
    icon: CircleCheck,
    iconClass: "text-brand",
    ring: "ring-brand/12",
  },
  error: {
    icon: CircleAlert,
    iconClass: "text-danger",
    ring: "ring-danger/12",
  },
  warning: {
    icon: TriangleAlert,
    iconClass: "text-warning",
    ring: "ring-warning/14",
  },
  info: {
    icon: Info,
    iconClass: "text-info",
    ring: "ring-info/12",
  },
};

export function ToastViewport() {
  const toasts = useAppStore((state) => state.toasts);
  const dismiss = useAppStore((state) => state.dismissToast);

  return (
    <section
      className="pointer-events-none fixed bottom-5 right-5 z-[100] flex w-[340px] flex-col gap-2"
      aria-live="polite"
      aria-label="Notifications"
    >
      {toasts.map((toast) => {
        const tone = toneStyles[toast.tone];
        const Icon = tone.icon;
        return (
          <div
            key={toast.id}
            className={clsx(
              "pointer-events-auto animate-scale-in rounded-xl border border-hairline bg-surface p-3.5 shadow-float ring-1",
              tone.ring,
            )}
          >
            <div className="flex items-start gap-2.5">
              <Icon
                className={clsx("mt-0.5 h-4 w-4 shrink-0", tone.iconClass)}
              />
              <div className="min-w-0 flex-1">
                <p className="text-[12.5px] font-semibold leading-snug text-ink">
                  {toast.title}
                </p>
                {toast.description ? (
                  <p className="mt-1 text-[11.5px] leading-relaxed text-ink-secondary">
                    {toast.description}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                className="rounded-md p-1 text-ink-tertiary transition-colors hover:bg-surface-muted hover:text-ink"
                aria-label="Dismiss notification"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        );
      })}
    </section>
  );
}
