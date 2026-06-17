// Hand-authored placeholder map for Phase 0–1. No binary assets: the world is a
// grid of characters that the WorldScene turns into floor/wall tiles. A real
// Tiled-authored office map replaces this in a later phase.
//
//   '#' = wall (solid),  '.' = floor (walkable)

export const TILE_SIZE = 48;

const RAW_MAP = [
  "########################",
  "#......................#",
  "#......................#",
  "#....####.......####...#",
  "#....#..#.......#..#...#",
  "#....#..#.......#..#...#",
  "#....####.......####...#",
  "#......................#",
  "#..........##..........#",
  "#..........##..........#",
  "#......................#",
  "#....####.......####...#",
  "#....#..#.......#..#...#",
  "#....#..#.......#..#...#",
  "#....####.......####...#",
  "#......................#",
  "#......................#",
  "########################",
];

export type TileKind = "floor" | "wall";

export const MAP: TileKind[][] = RAW_MAP.map((row) =>
  [...row].map((ch) => (ch === "#" ? "wall" : "floor")),
);

export const MAP_COLS = MAP[0].length;
export const MAP_ROWS = MAP.length;
export const WORLD_WIDTH = MAP_COLS * TILE_SIZE;
export const WORLD_HEIGHT = MAP_ROWS * TILE_SIZE;

/** Neutral open-floor spawn (center band, row 10) — clear of the stage/meeting zones. */
export const SPAWN = {
  x: 11 * TILE_SIZE + TILE_SIZE / 2,
  y: 10 * TILE_SIZE + TILE_SIZE / 2,
};
