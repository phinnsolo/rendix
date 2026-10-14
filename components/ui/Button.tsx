import type { ButtonHTMLAttributes, ComponentType, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "soft" | "ghost" | "danger" | "danger-ghost";
export type ButtonSize = "sm" | "md" | "lg";

interface ClassOptions {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  iconOnly?: boolean;
  className?: string;
}

/** Clases de botón: sirve también para estilizar <Link> como botón. */
export function buttonClass({ variant = "primary", size = "md", block, iconOnly, className }: ClassOptions = {}) {
  return [
    "btn",
    variant !== "primary" && `btn-${variant}`,
    size !== "md" && `btn-${size}`,
    block && "btn-block",
    iconOnly && "btn-icon",
    className,
  ]
    .filter(Boolean)
    .join(" ");
}

type IconType = ComponentType<{ className?: string; "aria-hidden"?: boolean }>;

interface Props extends ButtonHTMLAttributes<HTMLButtonElement>, Omit<ClassOptions, "className"> {
  loading?: boolean;
  icon?: IconType;
  iconRight?: IconType;
  children?: ReactNode;
}

export default function Button({
  variant,
  size,
  block,
  iconOnly,
  loading = false,
  icon: Icon,
  iconRight: IconRight,
  className,
  children,
  type = "button",
  disabled,
  ...rest
}: Props) {
  return (
    <button
      type={type}
      className={buttonClass({ variant, size, block, iconOnly, className })}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <span className="spinner" aria-hidden /> : Icon && <Icon className="icon" aria-hidden />}
      {children}
      {IconRight && !loading && <IconRight className="icon" aria-hidden />}
    </button>
  );
}
