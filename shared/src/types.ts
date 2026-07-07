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
  /** M4: Fahndungsdruck 0..HEAT_MAX — steigt pro Verkauf, zerfällt über Zeit. */
  heat: number;
  /** M4: Bestechung aktiv (kostet pro Periode, dämpft den Heat-Zuwachs). */
  bribing: boolean;
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
  | (BuildingBase & { kind: "growbox"; plant: number | null; store: number })
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

// ── M3: Arbeiter & Ledger ───────────────────────────────────────────────────

export type WorkerKind = "gaertner" | "kurier" | "dealer";

export function isWorkerKind(v: unknown): v is WorkerKind {
  return v === "gaertner" || v === "kurier" || v === "dealer";
}

export interface WorkerSnapshot {
  id: string;
  kind: WorkerKind;
  /** Spielername des Arbeitgebers — er zahlt Lohn und kann entlassen. */
  owner: string;
  x: number;
  y: number;
  dir: Direction;
  moving: boolean;
  /** true = Lohn konnte nicht gezahlt werden, Arbeiter tut nichts. */
  paused: boolean;
  /** Getragene Einheiten (Kurier: Ware, Dealer: Baggies). */
  carrying: number;
  /** Zugewiesenes Gebäude (Gärtner: Growbox, Kurier: Quelle, Dealer: Baggie-Quelle). */
  buildingId: string;
  /** Nur Kurier: Zielgebäude. */
  targetBuildingId: string | null;
  /** Nur Dealer: Verkaufs-Distrikt (Index wie districtIdAt). */
  district: number | null;
}

/** Buchhaltung einer Periode — Beträge in €, Produktionszahlen in Stück. */
export interface LedgerPeriod {
  /** Laufende Nummer der Periode (1, 2, …). */
  n: number;
  /** Einnahmen aus Verkäufen (Spieler + Dealer). */
  income: number;
  seedCost: number;
  wageCost: number;
  buildCost: number;
  /** Verkaufte Baggies. */
  sales: number;
  /** Geerntete Einheiten. */
  harvested: number;
  /** Fertig getrocknete Einheiten. */
  dried: number;
  /** Fertig verpackte Baggies. */
  packed: number;
  /** M4: Warenverlust durch Razzien (€). */
  raidLoss: number;
  /** M4: Bestechungsgelder (€). */
  bribeCost: number;
}

/** Laufende Periode im Snapshot: zusätzlich der Zeitfortschritt. */
export interface LedgerLive extends LedgerPeriod {
  elapsedS: number;
}

export function emptyLedgerPeriod(n: number): LedgerPeriod {
  return {
    n,
    income: 0,
    seedCost: 0,
    wageCost: 0,
    buildCost: 0,
    sales: 0,
    harvested: 0,
    dried: 0,
    packed: 0,
    raidLoss: 0,
    bribeCost: 0,
  };
}

export function ledgerExpenses(p: LedgerPeriod): number {
  return p.seedCost + p.wageCost + p.buildCost + p.raidLoss + p.bribeCost;
}

export function ledgerProfit(p: LedgerPeriod): number {
  return p.income - ledgerExpenses(p);
}
