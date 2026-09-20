import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary";

const base =
  "inline-flex h-12 items-center justify-center gap-2 px-6 font-display text-lg font-bold uppercase tracking-wide transition-colors disabled:cursor-not-allowed disabled:opacity-50";

const variants: Record<Variant, string> = {
  // El amarillo se reserva para la acción principal.
  primary: "bg-brand text-black hover:bg-brand-strong",
  secondary:
    "border border-asphalt-600 bg-transparent text-white hover:border-asphalt-400 hover:bg-asphalt-800",
};

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  pending?: boolean;
};

export function Button({
  variant = "primary",
  pending = false,
  disabled,
  className = "",
  children,
  ...rest
}: Props) {
  return (
    <button
      {...rest}
      disabled={disabled || pending}
      aria-busy={pending}
      className={`${base} ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
}
