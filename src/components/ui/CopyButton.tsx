import clsx from "clsx";
import { Check, Copy } from "lucide-react";
import { useRef, useState } from "react";

interface CopyButtonProps {
  value: string;
  label?: string;
  className?: string;
  size?: "sm" | "md";
}

export function CopyButton({
  value,
  label = "Copy",
  className,
  size = "sm",
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // WKWebView can deny clipboard access in rare focus states; fall back to
      // a hidden textarea + the editing command.
      const textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
    setCopied(true);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 1_600);
  };

  const Icon = copied ? Check : Copy;

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? "Copied" : label}
      title={copied ? "Copied" : label}
      className={clsx(
        "inline-flex items-center justify-center rounded-md text-ink-tertiary transition-colors hover:bg-surface-muted hover:text-ink",
        size === "sm" ? "h-6 w-6" : "h-7 w-7",
        className,
      )}
    >
      <Icon className={clsx("h-3.5 w-3.5", copied && "text-brand")} />
    </button>
  );
}
