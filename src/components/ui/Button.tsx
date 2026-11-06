import clsx from "clsx";
import { LoaderCircle } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "soft" | "danger";
type Size = "sm" | "md" | "lg" | "icon";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
  trailingIcon?: ReactNode;
}

const variants: Record<Variant, string> = {
  primary:
    "bg-brand text-white shadow-[0_1px_2px_rgba(10,50,24,0.18)] hover:bg-brand-dark dark:text-[#052312] dark:hover:bg-[#55d481]",
  secondary:
    "border border-hairline-strong bg-surface text-ink hover:bg-surface-muted",
  ghost: "text-ink-secondary hover:bg-surface-muted hover:text-ink",
  soft: "bg-brand-soft text-brand-ink hover:bg-brand-soft/75",
  danger:
    "border border-danger/20 bg-danger-soft text-danger hover:bg-danger-soft/75",
};

const sizes: Record<Size, string> = {
  sm: "h-8 gap-1.5 rounded-lg px-2.5 text-[12px] font-medium",
  md: "h-9 gap-2 rounded-[10px] px-3.5 text-[13px] font-medium",
  lg: "h-10 gap-2 rounded-[11px] px-4 text-[13px] font-medium",
  icon: "h-8 w-8 justify-center rounded-lg",
};

export function Button({
  variant = "secondary",
  size = "md",
  loading = false,
  icon,
  trailingIcon,
  className,
  children,
  disabled,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={clsx(
        "inline-flex select-none items-center justify-center whitespace-nowrap transition-[background-color,color,box-shadow,border-color,transform] duration-150 active:scale-[0.985] disabled:pointer-events-none disabled:opacity-45",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {loading ? (
        <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
      ) : (
        icon
      )}
      {children}
      {trailingIcon}
    </button>
  );
}
