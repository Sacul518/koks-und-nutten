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

/** Getragene Items (Stückzahlen) — Spieler transportieren alles selbst. */
export interface Inventory {
  seeds: number;
  harvest: number;
  dried: number;
  baggies: number;
}

/** Geld von Anfang an getrennt: Verkaufserlöse = schmutzig, Startgeld = sauber. */
export interface Money {
  clean: number;
  dirty: number;
}

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
  money: Money;
  inv: Inventory;
}

// ── M2: Gebäude & Passanten ─────────────────────────────────────────────────

export type BuildingKind = "growbox" | "trockenraum" | "packtisch";

export function isBuildingKind(v: unknown): v is BuildingKind {
  return v === "growbox" || v === "trockenraum" || v === "packtisch";
}

interface BuildingBase {
  id: string;
  x: number;
  y: number;
  /** Spielername des Erbauers — nur er kann das Gebäude bedienen. */
  owner: string;
}

export type BuildingSnapshot =
  | (BuildingBase & { kind: "growbox"; plant: number | null })
  | (BuildingBase & { kind: "trockenraum"; drying: number[]; dried: number })
  | (BuildingBase & { kind: "packtisch"; queue: number; packing: number | null; baggies: number });

export interface NpcSnapshot {
  id: string;
  x: number;
  y: number;
  dir: Direction;
  moving: boolean;
  /** Index des Passanten-Sprites (0-1) */
  skin: number;
  /** Restliche Wartezeit in Sekunden, 0 = kaufbereit */
  cooldown: number;
}
