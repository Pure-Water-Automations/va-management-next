import type { CSSProperties, ReactNode } from "react";

type Variant =
  | "default"
  | "primary"
  | "sky"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "solid";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, CSSProperties> = {
  default: { background: "var(--color-neutral-100)", color: "var(--color-neutral-700)", border: "1px solid var(--color-neutral-200)" },
  primary: { background: "var(--color-navy-50)", color: "var(--color-navy-800)", border: "1px solid var(--color-navy-100)" },
  sky: { background: "var(--color-sky-50)", color: "var(--color-sky-700)", border: "1px solid var(--color-sky-100)" },
  success: { background: "var(--color-success-light)", color: "var(--color-success-dark)", border: "1px solid rgba(48,201,122,0.22)" },
  warning: { background: "var(--color-warning-light)", color: "var(--color-warning-dark)", border: "1px solid rgba(255,179,64,0.28)" },
  danger: { background: "var(--color-error-light)", color: "var(--color-error-dark)", border: "1px solid rgba(240,76,76,0.22)" },
  info: { background: "var(--color-info-light)", color: "var(--color-info-dark)", border: "1px solid rgba(77,196,232,0.25)" },
  solid: { background: "var(--color-navy-900)", color: "#fff", border: "none" },
};

const SIZES: Record<Size, CSSProperties> = {
  sm: { fontSize: "var(--text-xs)", padding: "0 var(--space-2)", height: 18, gap: "var(--space-1)" },
  md: { fontSize: "var(--text-sm)", padding: "0 var(--space-2-5)", height: 22, gap: "var(--space-1-5)" },
  lg: { fontSize: "var(--text-base)", padding: "0 var(--space-3)", height: 28, gap: "var(--space-2)" },
};

const DOT_COLORS: Record<Variant, string> = {
  default: "var(--color-neutral-400)",
  primary: "var(--color-navy-700)",
  sky: "var(--color-sky-500)",
  success: "var(--color-success)",
  warning: "var(--color-warning)",
  danger: "var(--color-error)",
  info: "var(--color-sky-500)",
  solid: "rgba(255,255,255,0.8)",
};

export function Badge({
  variant = "default",
  size = "md",
  dot = false,
  children,
  style,
}: {
  variant?: Variant;
  size?: Size;
  dot?: boolean;
  children?: ReactNode;
  style?: CSSProperties;
}) {
  const dotSize = size === "sm" ? 5 : size === "lg" ? 8 : 6;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "var(--radius-badge)",
        fontFamily: "var(--font-sans)",
        fontWeight: "var(--weight-medium)",
        letterSpacing: "0.01em",
        whiteSpace: "nowrap",
        lineHeight: 1,
        ...SIZES[size],
        ...VARIANTS[variant],
        ...style,
      }}
    >
      {dot && (
        <span
          style={{
            width: dotSize,
            height: dotSize,
            flexShrink: 0,
            borderRadius: "50%",
            background: DOT_COLORS[variant],
            display: "inline-block",
          }}
        />
      )}
      {children}
    </span>
  );
}
