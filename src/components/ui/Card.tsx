import type { CSSProperties, ReactNode } from "react";

type Variant = "default" | "elevated" | "glass" | "navy" | "sky" | "flat" | "outline";

const VARIANTS: Record<Variant, CSSProperties> = {
  default: { background: "var(--color-surface)", border: "1px solid var(--color-border)", boxShadow: "var(--shadow-sm)" },
  elevated: { background: "var(--color-surface)", border: "none", boxShadow: "var(--shadow-lg)" },
  glass: {
    background: "var(--color-glass-bg)",
    backdropFilter: "blur(20px) saturate(180%)",
    WebkitBackdropFilter: "blur(20px) saturate(180%)",
    border: "1px solid var(--color-glass-border)",
    boxShadow: "var(--shadow-md)",
  },
  navy: {
    background: "linear-gradient(145deg, var(--color-navy-800) 0%, var(--color-navy-900) 100%)",
    border: "1px solid rgba(255,255,255,0.1)",
    boxShadow: "var(--shadow-navy-lg)",
    color: "#fff",
  },
  sky: {
    background: "linear-gradient(145deg, var(--color-sky-400) 0%, var(--color-sky-500) 100%)",
    border: "1px solid rgba(255,255,255,0.2)",
    boxShadow: "var(--shadow-sky-md)",
    color: "#fff",
  },
  flat: { background: "var(--color-bg-secondary)", border: "none", boxShadow: "none" },
  outline: { background: "transparent", border: "1.5px solid var(--color-border)", boxShadow: "none" },
};

export function Card({
  variant = "default",
  padding = 24,
  children,
  style,
  tourEl,
}: {
  variant?: Variant;
  padding?: number | string;
  children?: ReactNode;
  style?: CSSProperties;
  tourEl?: string;
}) {
  return (
    <div
      data-tour-el={tourEl}
      style={{
        borderRadius: "var(--radius-card)",
        padding,
        ...VARIANTS[variant],
        ...style,
      }}
    >
      {children}
    </div>
  );
}
