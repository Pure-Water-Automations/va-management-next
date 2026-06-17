// Pure proximity math shared by the A/V layer. Kept dependency-free so it can
// be unit-tested without LiveKit or a browser.

/** How close (in world pixels) two avatars must be to see/hear each other. */
export const PROXIMITY_RADIUS = 160;

export type Point = { x: number; y: number };

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function withinRadius(d: number, radius: number = PROXIMITY_RADIUS): boolean {
  return d <= radius;
}

/** Linear audio falloff: 1.0 when touching, 0 at/beyond the radius. */
export function proximityVolume(d: number, radius: number = PROXIMITY_RADIUS): number {
  if (d <= 0) return 1;
  if (d >= radius) return 0;
  return 1 - d / radius;
}
