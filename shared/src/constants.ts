import type { BuildingKind, WorkerKind } from "./types.ts";

export const PROTOCOL_VERSION = 3;

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

/** Anzahl Passanten-NPCs in der Stadt (M3: 24 → 32, damit Dealer genug Kundschaft finden). */
export const NPC_COUNT = 32;
export const NPC_WALK_SPEED = 1.6;
/** Wartezeit eines Passanten nach einem Kauf, bis er wieder kauft (M3: 45 → 30 s). */
export const NPC_BUY_COOLDOWN_S = 30;

/** Distrikt-Raster: DISTRICT_GRID × DISTRICT_GRID Zellen über der Karte. */
export const DISTRICT_GRID = 4;
/** Spanne der Distrikt-Preisfaktoren (deterministisch aus dem Seed). */
export const DISTRICT_PRICE_MIN = 0.7;
export const DISTRICT_PRICE_MAX = 1.4;

// ── M3: Arbeiter & Ledger (Balancing) ───────────────────────────────────────

export interface WorkerSpec {
  name: string;
  /** Lohn in € pro Ledger-Periode; wird zu Periodenbeginn abgezogen. */
  wage: number;
}

export const WORKER_SPECS: Record<WorkerKind, WorkerSpec> = {
  gaertner: { name: "Gärtner", wage: 10 },
  kurier: { name: "Kurier", wage: 6 },
  dealer: { name: "Dealer", wage: 12 },
};

/** Länge einer Ledger-/Lohn-Periode in Sekunden (TIME_SCALE beschleunigt sie mit). */
export const LEDGER_PERIOD_S = 60;
/** So viele abgeschlossene Perioden behalten Save und Graph. */
export const LEDGER_HISTORY_MAX = 60;

/** Laufgeschwindigkeit der Arbeiter (Tiles/s) — zwischen Passant (1,6) und Spieler (4,5). */
export const WORKER_WALK_SPEED = 3.5;
/** Traglast des Kuriers je Fahrt (Einheiten). */
export const KURIER_CAPACITY = 6;
/** Baggies, die ein Dealer maximal einsteckt. */
export const DEALER_CAPACITY = 10;
/** Zeit pro Dealer-Verkauf in Sekunden (läuft mit TIME_SCALE). */
export const DEALER_SELL_TIME_S = 6;
/** Ernte-Zwischenlager der Growbox — ist es voll, wartet der Gärtner mit dem Ernten. */
export const GROWBOX_STORE_MAX = 12;

// ── M4: Heat & Polizei (Balancing) ──────────────────────────────────────────

/** Heat-Zuwachs pro verkauftem Baggie (Spieler-Verkauf und Dealer gleichermaßen). */
export const HEAT_PER_SALE = 4;
/** Heat-Abbau pro Sekunde (läuft mit TIME_SCALE, wie Produktion). */
export const HEAT_DECAY_PER_S = 0.3;
/** Obergrenze des Heat-Werts je Spieler. */
export const HEAT_MAX = 100;

/** Abstand zwischen Razzia-Würfen je Spieler in Sekunden (läuft mit TIME_SCALE). */
export const RAID_CHECK_INTERVAL_S = 20;
/** Razzia-Wahrscheinlichkeit je Wurf bei Heat = HEAT_MAX; skaliert quadratisch mit Heat/HEAT_MAX. */
export const RAID_CHANCE_AT_MAX_HEAT = 0.4;
/** Geldwert eines beschlagnahmten Baggies (entspricht dem Basisverkaufspreis). */
export const RAID_VALUE_PER_BAGGIE = BAGGIE_PRICE_BASE;
/** Geldwert einer beschlagnahmten getrockneten Einheit (grobe Schätzung, < 2 Baggies). */
export const RAID_VALUE_PER_DRIED = 15;
/** Geldwert einer beschlagnahmten Ernte-Einheit (grobe Schätzung, roher Rohstoff). */
export const RAID_VALUE_PER_HARVEST = 5;

/** Bestechung: laufende Kosten pro Ledger-Periode, solange aktiv. */
export const BRIBE_COST_PER_PERIOD = 15;
/** Bestechung: Faktor auf den Heat-Zuwachs pro Verkauf, solange aktiv (dämpft, ersetzt nicht). */
export const BRIBE_GAIN_MULT = 0.4;
