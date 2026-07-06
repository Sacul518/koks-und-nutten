import { Assets, Rectangle, Texture } from "pixi.js";
import { TILE_SIZE, type Direction } from "@koks/shared";

const SHEET_URL = "/assets/kenney-rpg-urban/tilemap_packed.png";
const SHEET_COLS = 27;

/** Tile-Position im Kenney-Sheet: [Zeile, Spalte] */
const TILE_COORDS = {
  grass0: [0, 5],
  grass1: [0, 6],
  grass2: [1, 5],
  grass3: [1, 6],
  sidewalk: [1, 13],
  brick: [0, 21],
  roof: [4, 1],
  lot: [4, 9],
  road: [17, 9],
} as const;

/** Start-Zeile der vier Spielfiguren im Sheet (je 3 Zeilen pro Figur) */
const AVATAR_ROWS = [0, 3, 6, 9] as const;

/** Blickrichtung → Spalte im Sheet */
const AVATAR_DIR_COLS: Record<Direction, number> = {
  left: 23,
  down: 24,
  up: 25,
  right: 26,
};

export type TileTextureName = keyof typeof TILE_COORDS;
export type AvatarTextures = Record<Direction, Texture>;

export interface GameTextures {
  tiles: Record<TileTextureName, Texture>;
  avatars: AvatarTextures[];
}

export async function loadTextures(): Promise<GameTextures> {
  const sheet = await Assets.load<Texture>(SHEET_URL);
  sheet.source.scaleMode = "nearest";

  const frame = (row: number, col: number): Texture =>
    new Texture({
      source: sheet.source,
      frame: new Rectangle(col * TILE_SIZE, row * TILE_SIZE, TILE_SIZE, TILE_SIZE),
    });

  const tiles = Object.fromEntries(
    Object.entries(TILE_COORDS).map(([name, [row, col]]) => [name, frame(row, col)]),
  ) as Record<TileTextureName, Texture>;

  return {
    tiles,
    avatars: AVATAR_ROWS.map(
      (row) =>
        Object.fromEntries(
          Object.entries(AVATAR_DIR_COLS).map(([dir, col]) => [dir, frame(row, col)]),
        ) as AvatarTextures,
    ),
  };
}
