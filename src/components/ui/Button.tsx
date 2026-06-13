"use client";

import type { CSSProperties, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "outline" | "danger" | "text";
type Size = "xs" | "sm" | "md" | "lg";

const SIZES: Record<Size, CSSProperties> = {
  xs: { height: 28, padding: "0 var(--space-3)", fontSize: "var(--text-xs)", gap: "var(--space-1)" },
  sm: { height: 34, padding: "0 var(--space-4)", fontSize: "var(--text-sm)", gap: "var(--space-1-5)" },
  md: { height: 42, padding: "0 var(--space-5)", fontSize: "var(--text-base)", gap: "var(--space-2)" },
  lg: { height: 52, padding: "0 var(--space-7)", fontSize: "var(--text-md)", gap: "var(--space-2-5)" },
};

const VARIANTS: Record<Variant, CSSProperties> = {
  primary: {
    background: "linear-gradient(180deg, var(--color-navy-800) 0%, var(--color-navy-900) 100%)",
    color: "#fff",
    border: "1px solid rgba(255,255,255,0.08)",
    boxShadow: "var(--shadow-navy-sm)",
  },
  secondary: {
    background: "linear-gradient(180deg, var(--color-sky-400) 0%, var(--color-sky-500) 100%)",
    color: "#fff",
    border: "1px solid rgba(255,255,255,0.15)",
    boxShadow: "var(--shadow-sky-sm)",
  },
  ghost: {
    background: "rgba(255,255,255,0)",
    color: "var(--color-navy-900)",
    border: "1px solid var(--color-border)",
    boxShadow: "var(--shadow-xs)",
  },
  outline: {
    background: "transparent",
    color: "var(--color-navy-900)",
    border: "1.5px solid var(--color-navy-900)",
  },
  danger: {
    background: "linear-gradient(180deg, #f26060 0%, var(--color-error) 100%)",
    color: "#fff",
    border: "none",
    boxShadow: "0 4px 12px rgba(240,76,76,0.25)",
  },
  text: { background: "transparent", color: "var(--color-navy-800)", border: "none" },
};

export type ButtonProps = {
  variant?: Variant;
  size?: Size;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  icon?: ReactNode;
  type?: "button" | "submit" | "reset";
  onClick?: () => void;
  href?: string;
  children?: ReactNode;
  style?: CSSProperties;
};

export function Button({
  variant = "primary",
  size = "md",
  disabled = false,
  loading = false,
  fullWidth = false,
  icon,
  type = "button",
  onClick,
  href,
  children,
  style,
}: ButtonProps) {
  const base: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "var(--radius-button)",
    fontFamily: "var(--font-sans)",
    fontWeight: "var(--weight-medium)",
    letterSpacing: "-0.01em",
    cursor: disabled || loading ? "not-allowed" : "pointer",
    whiteSpace: "nowrap",
    userSelect: "none",
    transition: "transform var(--duration-base) var(--ease-spring), box-shadow var(--duration-base) var(--ease-out)",
    width: fullWidth ? "100%" : undefined,
    opacity: disabled ? 0.45 : 1,
    flexShrink: 0,
    ...SIZES[size],
    ...VARIANTS[variant],
    ...style,
  };

  const content = (
    <>
      {icon ? <span style={{ display: "flex", alignItems: "center" }}>{icon}</span> : null}
      {children}
    </>
  );

  if (href) {
    return (
      <a href={href} style={base}>
        {content}
      </a>
    );
  }
  return (
    <button type={type} disabled={disabled || loading} onClick={onClick} style={base}>
      {content}
    </button>
  );
}
