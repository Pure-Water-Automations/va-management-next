// Avatar color palette, shared by client (picker + tinting) and server (which
// validates the chosen color). Pure + DOM-free so the server can import it.

export const AVATAR_COLORS = [
  "#2dd4bf", // teal
  "#8b5cf6", // violet
  "#f59e0b", // amber
  "#ef4444", // red
  "#3b82f6", // blue
  "#22c55e", // green
] as const;

export const DEFAULT_AVATAR_COLOR = AVATAR_COLORS[0];

export function isValidColor(color: unknown): color is string {
  return typeof color === "string" && (AVATAR_COLORS as readonly string[]).includes(color);
}

/** Normalize to a valid palette color, falling back to the default. */
export function normalizeColor(color: unknown): string {
  return isValidColor(color) ? color : DEFAULT_AVATAR_COLOR;
}

/** "#rrggbb" → 0xrrggbb for Phaser tinting. */
export function colorToTint(color: string): number {
  return parseInt(color.replace("#", ""), 16);
}
