import type { CSSProperties } from "react";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

/** Deterministic gradient per name so avatars are visually distinct but stable. */
function gradientFor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  const h2 = (h + 40) % 360;
  return `linear-gradient(150deg, hsl(${h} 70% 62%), hsl(${h2} 64% 42%))`;
}

export function Avatar({
  name,
  size = 34,
  style,
  ring = false,
}: {
  name: string;
  size?: number;
  style?: CSSProperties;
  ring?: boolean;
}) {
  return (
    <span
      className="avatar"
      title={name}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.4),
        background: gradientFor(name),
        boxShadow: ring ? "0 0 0 2px var(--color-surface)" : undefined,
        ...style,
      }}
    >
      {initials(name)}
    </span>
  );
}
