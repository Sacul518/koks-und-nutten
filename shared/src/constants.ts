import type { BuildingKind } from "./types.ts";

export const PROTOCOL_VERSION = 2;

export const TICK_RATE = 10;
export const TICK_MS = 1000 / TICK_RATE;

export const MAP_WIDTH = 192;
export const MAP_HEIGHT = 192;

export const TILE_SIZE = 16;

export const WALK_SPEED = 4.5;

export const SPRINT_MULTIPLIER = 1.6;

export const MAX_PLAYERS = 4;
export const MAX_NAME_LENGTH = 16;

export const DEFAULT_PORT = 3000;

// ── M2: Wirtschaft & Produktionskette (Balancing) ──────────────────────────

export interface BuildingSpec {
  name: string;
  /** Baupreis in € (enthält das Grundstück). */
  cost: number;
  /** Grundfläche in Tiles. */
  w: number;
  h: number;
}

/** Baupreise (enthalten das Grundstück) und Grundflächen in Tiles. */
export const BUILDING_SPECS: Record<BuildingKind, BuildingSpec> = {
  growbox: { name: "Growbox", cost: 120, w: 2, h: 2 },
  trockenraum: { name: "Trockenraum", cost: 100, w: 2, h: 2 },
  packtisch: { name: "Packtisch", cost: 80, w: 2, h: 2 },
};

/** Startgeld neuer Spieler (sauber; schmutziges Geld kommt nur aus Verkäufen). */
export const START_MONEY_CLEAN = 500;
export const START_MONEY_DIRTY = 0;

/** Preis pro Samen (Kauf an der eigenen Growbox). */
export const SEED_PRICE = 20;
/** Wachstumszeit einer Pflanze in Sekunden. */
export const GROW_TIME_S = 90;
/** Ernte-Einheiten pro fertiger Pflanze. */
export const HARVEST_YIELD = 3;
/** Trocknungszeit pro Ernte-Einheit in Sekunden (alle Einheiten parallel). */
export const DRY_TIME_S = 60;
/** Maximale Einheiten im Trockenraum (trocknend + fertig). */
export const DRY_CAPACITY = 8;
/** Verpackungszeit pro getrockneter Einheit in Sekunden (eine nach der anderen). */
export const PACK_TIME_S = 10;
/** Maximale Warteschlange am Packtisch. */
export const PACK_QUEUE_MAX = 20;
/** Baggies pro getrockneter Einheit. */
export const BAGGIES_PER_DRIED = 2;
/** Basispreis eines Baggies; wird mit dem Distrikt-Faktor multipliziert. */
export const BAGGIE_PRICE_BASE = 15;

/** Maximale Distanz (Tiles) zwischen Spieler und Gebäude für Aktionen. */
export const INTERACT_RANGE = 2.5;
/** Maximale Distanz (Tiles) zwischen Spieler und Passant für Verkäufe. */
export const SELL_RANGE = 2.5;

/** Anzahl Passanten-NPCs in der Stadt. */
export const NPC_COUNT = 24;
export const NPC_WALK_SPEED = 1.6;
/** Wartezeit eines Passanten nach einem Kauf, bis er wieder kauft (Sekunden). */
export const NPC_BUY_COOLDOWN_S = 45;

/** Distrikt-Raster: DISTRICT_GRID × DISTRICT_GRID Zellen über der Karte. */
export const DISTRICT_GRID = 4;
/** Spanne der Distrikt-Preisfaktoren (deterministisch aus dem Seed). */
export const DISTRICT_PRICE_MIN = 0.7;
export const DISTRICT_PRICE_MAX = 1.4;
