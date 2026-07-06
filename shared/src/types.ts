export const Tile = {
  Road: 0,
  Sidewalk: 1,
  Lot: 2,
  Building: 3,
  Park: 4,
} as const;

export type TileId = (typeof Tile)[keyof typeof Tile];

export function isWalkable(tile: number): boolean {
  return tile !== Tile.Building;
}

export interface Vec2 {
  x: number;
  y: number;
}

export type Direction = "up" | "down" | "left" | "right";

export interface PlayerSnapshot {
  id: string;
  name: string;
  /** Position in Tile-Einheiten (Gleitkomma, Tile-Mitte = x.5) */
  x: number;
  y: number;
  dir: Direction;
  moving: boolean;
  /** Index der Spielfigur (0-3), vom Server vergeben */
  avatar: number;
}
