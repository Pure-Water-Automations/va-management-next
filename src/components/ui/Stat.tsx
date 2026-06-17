import type { CSSProperties, ReactNode } from "react";

type Variant = "default" | "navy" | "sky";
type Trend = "up" | "down" | "neutral";

const TREND_COLORS: Record<Trend, string> = {
  up: "var(--color-success)",
  down: "var(--color-error)",
  neutral: "var(--color-text-secondary)",
};
const TREND_BG: Record<Trend, string> = {
  up: "var(--color-success-light)",
  down: "var(--color-error-light)",
  neutral: "var(--color-neutral-100)",
};

export function Stat({
  label,
  value,
  unit,
  change,
  changeLabel,
  trend = "neutral",
  icon,
  variant = "default",
  style,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  change?: string;
  changeLabel?: string;
  trend?: Trend;
  icon?: ReactNode;
  variant?: Variant;
  style?: CSSProperties;
}) {
  const isDark = variant === "navy" || variant === "sky";
  const surface: CSSProperties =
    variant === "navy"
      ? {
          background: "linear-gradient(145deg, var(--color-navy-800) 0%, var(--color-navy-900) 100%)",
          border: "1px solid rgba(255,255,255,0.1)",
          boxShadow: "var(--shadow-navy-md)",
        }
      : variant === "sky"
        ? {
            background: "linear-gradient(145deg, var(--color-sky-400) 0%, var(--color-sky-500) 100%)",
            border: "1px solid rgba(255,255,255,0.2)",
            boxShadow: "var(--shadow-sky-md)",
          }
        : {
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            boxShadow: "var(--shadow-sm)",
          };

  return (
    <div
      style={{
        borderRadius: "var(--radius-2xl)",
        padding: "var(--space-6)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-3)",
        ...surface,
        ...style,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span
          style={{
            fontSize: "var(--text-sm)",
            fontWeight: "var(--weight-medium)",
            color: isDark ? "rgba(255,255,255,0.7)" : "var(--color-text-secondary)",
          }}
        >
          {label}
        </span>
        {icon && (
          <span
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 36,
              height: 36,
              borderRadius: "var(--radius-md)",
              background: isDark ? "rgba(255,255,255,0.14)" : "var(--color-sky-50)",
              color: isDark ? "rgba(255,255,255,0.9)" : "var(--color-sky-500)",
              flexShrink: 0,
            }}
          >
            {icon}
          </span>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "baseline", gap: "var(--space-1-5)" }}>
        <span
          style={{
            fontSize: "var(--text-4xl)",
            fontFamily: "var(--font-display)",
            fontWeight: "var(--weight-bold)",
            letterSpacing: "var(--tracking-tight)",
            lineHeight: 1,
            color: isDark ? "#fff" : "var(--color-text-primary)",
          }}
        >
          {value}
        </span>
        {unit && (
          <span
            style={{
              fontSize: "var(--text-lg)",
              fontWeight: "var(--weight-medium)",
              color: isDark ? "rgba(255,255,255,0.55)" : "var(--color-text-secondary)",
            }}
          >
            {unit}
          </span>
        )}
      </div>

      {(change !== undefined || changeLabel) && (
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
          {change !== undefined && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 3,
                background: isDark ? "rgba(255,255,255,0.15)" : TREND_BG[trend],
                color: isDark ? "rgba(255,255,255,0.9)" : TREND_COLORS[trend],
                padding: "2px 8px",
                borderRadius: "var(--radius-full)",
                fontSize: "var(--text-xs)",
                fontWeight: "var(--weight-semibold)",
              }}
            >
              {change}
            </span>
          )}
          {changeLabel && (
            <span
              style={{
                fontSize: "var(--text-xs)",
                color: isDark ? "rgba(255,255,255,0.45)" : "var(--color-text-tertiary)",
              }}
            >
              {changeLabel}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
