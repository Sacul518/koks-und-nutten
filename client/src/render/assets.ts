import { Assets, Rectangle, Texture } from "pixi.js";
import { TILE_SIZE, type Direction } from "@koks/shared";

const SHEET_URL = "/assets/kenney-rpg-urban/tilemap_packed.png";

// Roguelike-Packs: 16×16-Tiles im 17px-Raster (1px Abstand zwischen den Tiles).
const RL_SHEET_URL = "/assets/kenney-roguelike-rpg-pack/Spritesheet/roguelikeSheet_transparent.png";
const INDOOR_SHEET_URL = "/assets/kenney-roguelike-indoors/Tilesheets/roguelikeIndoor_transparent.png";
const RL_GRID = 17;

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
/** Start-Zeilen der Passanten-Figuren (die zwei restlichen Sets im Sheet) */
const NPC_ROWS = [12, 15] as const;

/** Blickrichtung → Spalte im Sheet */
const AVATAR_DIR_COLS: Record<Direction, number> = {
  left: 23,
  down: 24,
  up: 25,
  right: 26,
};

export type TileTextureName = keyof typeof TILE_COORDS;
/** Je Blickrichtung 3 Frames: [Stand, Schritt A, Schritt B] — echter Lauf-Zyklus aus dem Kenney-Sheet. */
export type AvatarFrames = [Texture, Texture, Texture];
export type AvatarTextures = Record<Direction, AvatarFrames>;

/** Aus Kenney-Tiles zusammengesetzte Gebäude-Bausteine (je 16×16). */
export interface BuildingTextures {
  /** Holzboden (Trockenraum, Packtisch) */
  floor: Texture;
  /** Erdbeet 2×2 (Growbox): TL, TR, BL, BR */
  bed: [Texture, Texture, Texture, Texture];
  /** Wachstumsstufen der Pflanze: Keimling → klein → buschig → reif */
  plantStages: [Texture, Texture, Texture, Texture];
  /** Wäscheleine leer (links, rechts) */
  lineEmpty: [Texture, Texture];
  /** Wäscheleine behängt (links, rechts) */
  lineFull: [Texture, Texture];
  /** Theke (Packtisch/Waschsalon/Bar/Labor) */
  counter: [Texture, Texture];
  /** Warenkiste — unterscheidet den Packtisch */
  produceCrate: Texture;
  /** Waschmaschine — unterscheidet den Waschsalon */
  washer: Texture;
  /** Flaschenregal — unterscheidet die Bar */
  bottleShelf: Texture;
  /** Herd/Kochplatte — unterscheidet das Labor */
  stove: Texture;
}

export interface GameTextures {
  tiles: Record<TileTextureName, Texture>;
  avatars: AvatarTextures[];
  npcs: AvatarTextures[];
  building: BuildingTextures;
}

export async function loadTextures(): Promise<GameTextures> {
  const [sheet, rlSheet, indoorSheet] = await Promise.all([
    Assets.load<Texture>(SHEET_URL),
    Assets.load<Texture>(RL_SHEET_URL),
    Assets.load<Texture>(INDOOR_SHEET_URL),
  ]);
  for (const s of [sheet, rlSheet, indoorSheet]) s.source.scaleMode = "nearest";

  const frame = (row: number, col: number): Texture =>
    new Texture({
      source: sheet.source,
      frame: new Rectangle(col * TILE_SIZE, row * TILE_SIZE, TILE_SIZE, TILE_SIZE),
    });
  const frame17 = (source: Texture, row: number, col: number): Texture =>
    new Texture({
      source: source.source,
      frame: new Rectangle(col * RL_GRID, row * RL_GRID, TILE_SIZE, TILE_SIZE),
    });
  const rl = (row: number, col: number) => frame17(rlSheet, row, col);
  const indoor = (row: number, col: number) => frame17(indoorSheet, row, col);

  const tiles = Object.fromEntries(
    Object.entries(TILE_COORDS).map(([name, [row, col]]) => [name, frame(row, col)]),
  ) as Record<TileTextureName, Texture>;

  // Jedes Figuren-Set belegt 3 Zeilen im Sheet: Zeile+0 = Stand, +1/+2 = alternierende Schrittposen.
  const avatarSet = (row: number): AvatarTextures =>
    Object.fromEntries(
      Object.entries(AVATAR_DIR_COLS).map(([dir, col]) => [
        dir,
        [frame(row, col), frame(row + 1, col), frame(row + 2, col)] as AvatarFrames,
      ]),
    ) as AvatarTextures;

  return {
    tiles,
    avatars: AVATAR_ROWS.map(avatarSet),
    npcs: NPC_ROWS.map(avatarSet),
    building: {
      floor: indoor(1, 24),
      bed: [rl(9, 5), rl(9, 6), rl(10, 5), rl(10, 6)],
      plantStages: [rl(10, 28), rl(9, 25), rl(9, 26), rl(9, 24)],
      lineEmpty: [indoor(1, 16), indoor(1, 18)],
      lineFull: [indoor(2, 16), indoor(2, 18)],
      counter: [indoor(12, 4), indoor(12, 5)],
      produceCrate: frame(10, 6),
      washer: frame(12, 9),
      bottleShelf: frame(11, 6),
      stove: indoor(14, 14),
    },
  };
}
