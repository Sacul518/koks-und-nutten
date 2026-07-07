import {
  BAGGIES_PER_DRIED,
  BRIBE_COST_PER_PERIOD,
  BRIBE_GAIN_MULT,
  BUILDING_SPECS,
  DEALER_CAPACITY,
  DEALER_SELL_TIME_S,
  DISTRICT_GRID,
  DRY_CAPACITY,
  DRY_TIME_S,
  GROWBOX_STORE_MAX,
  GROW_TIME_S,
  HARVEST_YIELD,
  HEAT_DECAY_PER_S,
  HEAT_MAX,
  HEAT_PER_SALE,
  INTERACT_RANGE,
  KURIER_CAPACITY,
  LEDGER_HISTORY_MAX,
  LEDGER_PERIOD_S,
  MAP_HEIGHT,
  MAP_WIDTH,
  MAX_NAME_LENGTH,
  MAX_PLAYERS,
  NPC_BUY_COOLDOWN_S,
  NPC_COUNT,
  NPC_WALK_SPEED,
  PACK_QUEUE_MAX,
  PACK_TIME_S,
  RAID_CHANCE_AT_MAX_HEAT,
  RAID_CHECK_INTERVAL_S,
  RAID_VALUE_PER_BAGGIE,
  RAID_VALUE_PER_DRIED,
  RAID_VALUE_PER_HARVEST,
  SEED_PRICE,
  SELL_RANGE,
  SPRINT_MULTIPLIER,
  START_MONEY_CLEAN,
  START_MONEY_DIRTY,
  TICK_MS,
  Tile,
  WALK_SPEED,
  WORKER_SPECS,
  WORKER_WALK_SPEED,
  baggiePriceAt,
  districtIdAt,
  districtPriceFactors,
  emptyLedgerPeriod,
  findNearestWalkable,
  findPath,
  generateCity,
  isWalkable,
  tileAt,
  type BuildingKind,
  type BuildingSnapshot,
  type CityMap,
  type ClientMessage,
  type Direction,
  type Inventory,
  type LedgerPeriod,
  type NpcSnapshot,
  type PlayerSnapshot,
  type ServerMessage,
  type Vec2,
  type WorkerKind,
  type WorkerSnapshot,
} from "@koks/shared";

const PLAYER_RADIUS = 0.3;
const TICK_SAMPLE_WINDOW_MS = 5000;
/** NPCs laufen nur auf Straßen und Gehwegen. */
const isStreet = (tile: number) => tile === Tile.Road || tile === Tile.Sidewalk;

/** Persistierter Teil eines Spielers (fürs Save; Zuordnung beim Rejoin über den Namen). */
export interface SavedPlayer {
  name: string;
  x: number;
  y: number;
  dir: Direction;
  avatar: number;
  moneyClean: number;
  moneyDirty: number;
  inv: Inventory;
  /** M4: Fahndungsdruck 0..HEAT_MAX. */
  heat: number;
  /** M4: Bestechung aktiv (laufende Kosten pro Ledger-Periode). */
  bribing: boolean;
}

/** Gebäude — Laufzeit- und Save-Format sind identisch. */
export interface SavedBuilding {
  id: string;
  kind: BuildingKind;
  x: number;
  y: number;
  owner: string;
  /** Growbox: Wachstumsfortschritt 0..1, null = leer */
  plantProgress: number | null;
  /** Growbox: geerntete Einheiten im Zwischenlager (füllt der Gärtner, leert der Kurier) */
  harvestStore: number;
  /** Trockenraum: Fortschritt 0..1 je trocknender Einheit */
  drying: number[];
  /** Trockenraum: fertig getrocknete Einheiten (Ausgabe) */
  dried: number;
  /** Packtisch: wartende Einheiten */
  packQueue: number;
  /** Packtisch: Fortschritt 0..1 der aktuellen Einheit, null = nichts in Arbeit */
  packProgress: number | null;
  /** Packtisch: fertige Baggies (Ausgabe) */
  baggies: number;
}

/** Persistierter Teil eines Arbeiters (Laufzeit-Zustand wie Pfade wird neu aufgebaut). */
export interface SavedWorker {
  id: string;
  kind: WorkerKind;
  owner: string;
  x: number;
  y: number;
  dir: Direction;
  buildingId: string;
  targetBuildingId: string | null;
  district: number | null;
  carrying: number;
  paused: boolean;
}

/** Ledger im Save: laufende Periode + abgeschlossene Historie. */
export interface SavedLedger {
  elapsedS: number;
  current: LedgerPeriod;
  history: LedgerPeriod[];
}

interface Worker extends SavedWorker {
  moving: boolean;
  path: Vec2[] | null;
  /** Dealer: Zeit im aktuellen Verkaufsgespräch (läuft mit TIME_SCALE) */
  sellT: number;
  /** Cooldown bis zur nächsten Pfadsuche in Sekunden (drosselt A*) */
  repathT: number;
  /** Dealer: anvisierter Passant */
  targetNpcId: string | null;
}

/** Was ein Kurier zwischen zwei Gebäudetypen transportiert (null = ungültige Route). */
function transportGood(from: BuildingKind, to: BuildingKind): "harvest" | "dried" | null {
  if (from === "growbox" && to === "trockenraum") return "harvest";
  if (from === "trockenraum" && to === "packtisch") return "dried";
  return null;
}

export interface GamePlayer {
  id: string;
  name: string;
  x: number;
  y: number;
  dir: Direction;
  moving: boolean;
  avatar: number;
  sprinting: boolean;
  path: Vec2[] | null;
  input: { dx: number; dy: number };
  moneyClean: number;
  moneyDirty: number;
  inv: Inventory;
  /** M4: Fahndungsdruck 0..HEAT_MAX — steigt pro Verkauf, zerfällt über Zeit. */
  heat: number;
  /** M4: Bestechung aktiv (laufende Kosten pro Ledger-Periode, dämpft Heat-Zuwachs). */
  bribing: boolean;
  send: (msg: ServerMessage) => void;
}

interface Npc {
  id: string;
  x: number;
  y: number;
  dir: Direction;
  moving: boolean;
  skin: number;
  path: Vec2[] | null;
  waitTicks: number;
  cooldownS: number;
}

export type JoinResult = { ok: true; player: GamePlayer } | { ok: false; reason: string };

export class Game {
  readonly seed: number;
  readonly map: CityMap;
  readonly players = new Map<string, GamePlayer>();
  readonly buildings = new Map<string, SavedBuilding>();
  readonly workers = new Map<string, Worker>();
  private readonly npcs = new Map<string, Npc>();
  private readonly priceFactors: number[];
  private nextId = 1;
  private nextBuildingId = 1;
  private nextWorkerId = 1;
  private timer: NodeJS.Timeout | null = null;
  /** Zuletzt bekannte Zustände nicht verbundener Spieler, Schlüssel = Name (kleingeschrieben) */
  private readonly offline = new Map<string, SavedPlayer>();
  /** M4: Razzia-Check-Timer je Spieler (Name klein), läuft mit prodDt — bewusst nicht persistiert. */
  private readonly raidTimers = new Map<string, number>();
  private tickTimes: number[] = [];
  /** Dev-Zeitraffer (TIME_SCALE): beschleunigt Produktion, NPC-Cooldowns und Ledger-Perioden. */
  private readonly timeScale: number;
  /** Team-weite Buchhaltung: laufende Periode + abgeschlossene Historie. */
  private ledger: LedgerPeriod;
  private ledgerElapsedS: number;
  private ledgerHistoryArr: LedgerPeriod[];

  constructor(
    seed: number,
    savedPlayers: SavedPlayer[] = [],
    savedBuildings: SavedBuilding[] = [],
    savedWorkers: SavedWorker[] = [],
    savedLedger: SavedLedger | null = null,
    timeScale = 1,
  ) {
    this.seed = seed;
    this.map = generateCity(seed);
    this.priceFactors = districtPriceFactors(seed);
    this.timeScale = timeScale;
    for (const p of savedPlayers) this.offline.set(p.name.toLowerCase(), p);
    for (const b of savedBuildings) {
      this.buildings.set(b.id, b);
      this.blockFootprint(b);
      const num = Number(b.id.replace(/^b/, ""));
      if (Number.isFinite(num) && num >= this.nextBuildingId) this.nextBuildingId = num + 1;
    }
    for (const w of savedWorkers) {
      // Defensiv: Arbeiter ohne existierendes Gebäude nicht wiederbeleben.
      if (!this.buildings.has(w.buildingId)) continue;
      if (w.targetBuildingId !== null && !this.buildings.has(w.targetBuildingId)) continue;
      this.workers.set(w.id, { ...w, moving: false, path: null, sellT: 0, repathT: 0, targetNpcId: null });
      const num = Number(w.id.replace(/^w/, ""));
      if (Number.isFinite(num) && num >= this.nextWorkerId) this.nextWorkerId = num + 1;
    }
    this.ledger = savedLedger ? { ...savedLedger.current } : emptyLedgerPeriod(1);
    this.ledgerElapsedS = savedLedger ? savedLedger.elapsedS : 0;
    this.ledgerHistoryArr = savedLedger ? savedLedger.history.map((p) => ({ ...p })) : [];
    this.spawnNpcs();
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  join(rawName: string, send: (msg: ServerMessage) => void): JoinResult {
    const name = rawName.trim().slice(0, MAX_NAME_LENGTH);
    if (name.length === 0) {
      return { ok: false, reason: "Bitte gib einen Namen ein." };
    }
    if (this.players.size >= MAX_PLAYERS) {
      return { ok: false, reason: `Die Session ist voll (max. ${MAX_PLAYERS} Spieler).` };
    }
    for (const p of this.players.values()) {
      if (p.name.toLowerCase() === name.toLowerCase()) {
        return { ok: false, reason: "Dieser Name ist schon vergeben." };
      }
    }

    const spawn = this.spawnPoint(this.players.size);
    const usedAvatars = new Set([...this.players.values()].map((p) => p.avatar));
    let avatar = 0;
    while (usedAvatars.has(avatar) && avatar < MAX_PLAYERS - 1) avatar++;

    // Bekannter Spieler (aus dem Save)? Geld/Inventar immer übernehmen,
    // die Position nur, wenn sie noch begehbar ist (z. B. kein Gebäude darauf).
    const saved = this.offline.get(name.toLowerCase());
    const restorePos = saved && this.canStandAt(saved.x, saved.y) ? saved : null;
    this.offline.delete(name.toLowerCase());

    const player: GamePlayer = {
      id: `p${this.nextId++}`,
      name,
      x: restorePos ? restorePos.x : spawn.x + 0.5,
      y: restorePos ? restorePos.y : spawn.y + 0.5,
      dir: restorePos ? restorePos.dir : "down",
      moving: false,
      avatar: saved ? saved.avatar : avatar,
      sprinting: false,
      path: null,
      input: { dx: 0, dy: 0 },
      moneyClean: saved ? saved.moneyClean : START_MONEY_CLEAN,
      moneyDirty: saved ? saved.moneyDirty : START_MONEY_DIRTY,
      inv: saved ? { ...saved.inv } : { seeds: 0, harvest: 0, dried: 0, baggies: 0 },
      heat: saved ? saved.heat : 0,
      bribing: saved ? saved.bribing : false,
      send,
    };
    this.players.set(player.id, player);
    return { ok: true, player };
  }

  leave(id: string): void {
    const player = this.players.get(id);
    if (!player) return;
    this.offline.set(player.name.toLowerCase(), toSavedPlayer(player));
    this.players.delete(id);
    this.broadcast({ t: "playerLeft", id });
  }

  handleMessage(player: GamePlayer, msg: ClientMessage): void {
    switch (msg.t) {
      case "moveTo": {
        const goal = { x: Math.floor(msg.x), y: Math.floor(msg.y) };
        if (goal.x < 0 || goal.y < 0 || goal.x >= MAP_WIDTH || goal.y >= MAP_HEIGHT) return;
        const path = findPath(this.map, { x: player.x, y: player.y }, goal);
        if (path) {
          player.path = path;
          player.input = { dx: 0, dy: 0 };
        }
        break;
      }
      case "input":
        player.input = { dx: msg.dx, dy: msg.dy };
        if (msg.dx !== 0 || msg.dy !== 0) player.path = null;
        break;
      case "sprint":
        player.sprinting = msg.on;
        break;
      case "build":
        this.handleBuild(player, msg.kind, Math.floor(msg.x), Math.floor(msg.y));
        break;
      case "buySeeds":
        this.handleBuySeeds(player, msg.buildingId, msg.count);
        break;
      case "plant":
      case "harvest":
      case "store":
      case "pack":
      case "collect":
        this.handleBuildingAction(player, msg.t, msg.buildingId);
        break;
      case "sell":
        this.handleSell(player, msg.npcId);
        break;
      case "hire":
        this.handleHire(player, msg.kind, msg.buildingId, msg.targetBuildingId ?? null, msg.district ?? null);
        break;
      case "fire":
        this.handleFire(player, msg.workerId);
        break;
      case "bribe":
        player.bribing = msg.on;
        break;
      case "join":
        break;
    }
  }

  snapshot(): PlayerSnapshot[] {
    return [...this.players.values()].map((p) => ({
      id: p.id,
      name: p.name,
      x: Math.round(p.x * 100) / 100,
      y: Math.round(p.y * 100) / 100,
      dir: p.dir,
      moving: p.moving,
      avatar: p.avatar,
      money: { clean: p.moneyClean, dirty: p.moneyDirty },
      inv: { ...p.inv },
      heat: Math.round(p.heat * 10) / 10,
      bribing: p.bribing,
    }));
  }

  npcSnapshot(): NpcSnapshot[] {
    return [...this.npcs.values()].map((n) => ({
      id: n.id,
      x: Math.round(n.x * 100) / 100,
      y: Math.round(n.y * 100) / 100,
      dir: n.dir,
      moving: n.moving,
      skin: n.skin,
      cooldown: Math.ceil(n.cooldownS),
    }));
  }

  buildingSnapshot(): BuildingSnapshot[] {
    // Nie auf 1 aufrunden: sonst zeigt der Client "reif", während der Server
    // die Ernte noch ablehnt (Fortschritt z. B. 0,9996).
    const pct = (v: number) => (v >= 1 ? 1 : Math.min(0.999, Math.round(v * 1000) / 1000));
    return [...this.buildings.values()].map((b) => {
      const base = { id: b.id, x: b.x, y: b.y, owner: b.owner };
      switch (b.kind) {
        case "growbox":
          return {
            ...base,
            kind: "growbox" as const,
            plant: b.plantProgress === null ? null : pct(b.plantProgress),
            store: b.harvestStore,
          };
        case "trockenraum":
          return { ...base, kind: "trockenraum" as const, drying: b.drying.map(pct), dried: b.dried };
        case "packtisch":
          return {
            ...base,
            kind: "packtisch" as const,
            queue: b.packQueue,
            packing: b.packProgress === null ? null : pct(b.packProgress),
            baggies: b.baggies,
          };
      }
    });
  }

  /** Persistierbarer Spielerbestand: verbundene Spieler + zuletzt bekannte Offline-Spieler. */
  savedPlayers(): SavedPlayer[] {
    const byName = new Map(this.offline);
    for (const p of this.players.values()) {
      byName.set(p.name.toLowerCase(), toSavedPlayer(p));
    }
    return [...byName.values()];
  }

  savedBuildings(): SavedBuilding[] {
    const round = (v: number) => Math.round(v * 10000) / 10000;
    return [...this.buildings.values()].map((b) => ({
      ...b,
      plantProgress: b.plantProgress === null ? null : round(b.plantProgress),
      drying: b.drying.map(round),
      packProgress: b.packProgress === null ? null : round(b.packProgress),
    }));
  }

  savedWorkers(): SavedWorker[] {
    const round = (v: number) => Math.round(v * 100) / 100;
    return [...this.workers.values()].map((w) => ({
      id: w.id,
      kind: w.kind,
      owner: w.owner,
      x: round(w.x),
      y: round(w.y),
      dir: w.dir,
      buildingId: w.buildingId,
      targetBuildingId: w.targetBuildingId,
      district: w.district,
      carrying: w.carrying,
      paused: w.paused,
    }));
  }

  savedLedger(): SavedLedger {
    return {
      elapsedS: Math.round(this.ledgerElapsedS * 10) / 10,
      current: { ...this.ledger },
      history: this.ledgerHistoryArr.map((p) => ({ ...p })),
    };
  }

  workerSnapshot(): WorkerSnapshot[] {
    const round = (v: number) => Math.round(v * 100) / 100;
    return [...this.workers.values()].map((w) => ({
      id: w.id,
      kind: w.kind,
      owner: w.owner,
      x: round(w.x),
      y: round(w.y),
      dir: w.dir,
      moving: w.moving,
      paused: w.paused,
      carrying: w.carrying,
      buildingId: w.buildingId,
      targetBuildingId: w.targetBuildingId,
      district: w.district,
    }));
  }

  ledgerHistory(): LedgerPeriod[] {
    return this.ledgerHistoryArr.map((p) => ({ ...p }));
  }

  /** Gemessene Tickrate über die letzten Sekunden (Soll: TICK_RATE). */
  ticksPerSecond(): number {
    if (this.tickTimes.length < 2) return 0;
    const first = this.tickTimes[0]!;
    const last = this.tickTimes[this.tickTimes.length - 1]!;
    const spanSeconds = (last - first) / 1000;
    if (spanSeconds <= 0) return 0;
    return Math.round(((this.tickTimes.length - 1) / spanSeconds) * 10) / 10;
  }

  broadcast(msg: ServerMessage): void {
    for (const p of this.players.values()) p.send(msg);
  }

  // ── Bauen ──────────────────────────────────────────────────────────────────

  private handleBuild(player: GamePlayer, kind: BuildingKind, x: number, y: number): void {
    const spec = BUILDING_SPECS[kind];
    if (x < 0 || y < 0 || x + spec.w > MAP_WIDTH || y + spec.h > MAP_HEIGHT) {
      return this.fail(player, "Außerhalb der Karte.");
    }
    for (let ty = y; ty < y + spec.h; ty++) {
      for (let tx = x; tx < x + spec.w; tx++) {
        if (tileAt(this.map, tx, ty) !== Tile.Lot) {
          return this.fail(player, "Hier kann nicht gebaut werden — nur auf freiem Grundstück.");
        }
      }
    }
    const inFootprint = (ex: number, ey: number, r: number) =>
      ex + r > x && ex - r < x + spec.w && ey + r > y && ey - r < y + spec.h;
    for (const p of this.players.values()) {
      if (inFootprint(p.x, p.y, PLAYER_RADIUS)) return this.fail(player, "Da steht jemand im Weg.");
    }
    for (const n of this.npcs.values()) {
      if (inFootprint(n.x, n.y, PLAYER_RADIUS)) return this.fail(player, "Da steht jemand im Weg.");
    }
    for (const w of this.workers.values()) {
      if (inFootprint(w.x, w.y, PLAYER_RADIUS)) return this.fail(player, "Da steht jemand im Weg.");
    }
    if (player.moneyClean + player.moneyDirty < spec.cost) {
      return this.fail(player, `Zu wenig Geld (${spec.cost} € nötig).`);
    }

    this.spend(player, spec.cost);
    this.ledger.buildCost += spec.cost;
    const building: SavedBuilding = {
      id: `b${this.nextBuildingId++}`,
      kind,
      x,
      y,
      owner: player.name,
      plantProgress: null,
      harvestStore: 0,
      drying: [],
      dried: 0,
      packQueue: 0,
      packProgress: null,
      baggies: 0,
    };
    this.buildings.set(building.id, building);
    this.blockFootprint(building);

    // Laufende Wege, die durch die neue Grundfläche führen, abbrechen.
    const crosses = (path: Vec2[] | null) =>
      path !== null && path.some((wp) => wp.x >= x && wp.x < x + spec.w && wp.y >= y && wp.y < y + spec.h);
    for (const p of this.players.values()) if (crosses(p.path)) p.path = null;
    for (const n of this.npcs.values()) if (crosses(n.path)) n.path = null;
    for (const w of this.workers.values()) if (crosses(w.path)) w.path = null;
  }

  private blockFootprint(b: SavedBuilding): void {
    const spec = BUILDING_SPECS[b.kind];
    for (let ty = b.y; ty < b.y + spec.h; ty++) {
      for (let tx = b.x; tx < b.x + spec.w; tx++) {
        this.map.tiles[ty * this.map.width + tx] = Tile.Building;
      }
    }
  }

  // ── Produktions-Aktionen ───────────────────────────────────────────────────

  private handleBuySeeds(player: GamePlayer, buildingId: string, count: number): void {
    const b = this.usableBuilding(player, buildingId, "growbox");
    if (typeof b === "string") return this.fail(player, b);
    const cost = count * SEED_PRICE;
    if (player.moneyClean + player.moneyDirty < cost) {
      return this.fail(player, `Zu wenig Geld (${cost} € nötig).`);
    }
    this.spend(player, cost);
    this.ledger.seedCost += cost;
    player.inv.seeds += count;
  }

  private handleBuildingAction(
    player: GamePlayer,
    action: "plant" | "harvest" | "store" | "pack" | "collect",
    buildingId: string,
  ): void {
    const b = this.usableBuilding(player, buildingId);
    if (typeof b === "string") return this.fail(player, b);

    switch (action) {
      case "plant": {
        if (b.kind !== "growbox") return this.fail(player, "Pflanzen geht nur in der Growbox.");
        if (b.plantProgress !== null) return this.fail(player, "Hier wächst schon eine Pflanze.");
        if (player.inv.seeds < 1) return this.fail(player, "Keine Samen dabei.");
        player.inv.seeds--;
        b.plantProgress = 0;
        return;
      }
      case "harvest": {
        if (b.kind !== "growbox") return this.fail(player, "Ernten geht nur an der Growbox.");
        if (b.plantProgress === null) return this.fail(player, "Hier wächst nichts.");
        if (b.plantProgress < 1) return this.fail(player, "Die Pflanze ist noch nicht reif.");
        b.plantProgress = null;
        player.inv.harvest += HARVEST_YIELD;
        this.ledger.harvested += HARVEST_YIELD;
        return;
      }
      case "store": {
        if (b.kind !== "trockenraum") return this.fail(player, "Einlagern geht nur im Trockenraum.");
        if (player.inv.harvest < 1) return this.fail(player, "Keine Ernte dabei.");
        const free = DRY_CAPACITY - b.drying.length - b.dried;
        if (free < 1) return this.fail(player, "Der Trockenraum ist voll.");
        const n = Math.min(player.inv.harvest, free);
        player.inv.harvest -= n;
        for (let i = 0; i < n; i++) b.drying.push(0);
        return;
      }
      case "pack": {
        if (b.kind !== "packtisch") return this.fail(player, "Verpacken geht nur am Packtisch.");
        if (player.inv.dried < 1) return this.fail(player, "Kein getrocknetes Weed dabei.");
        const free = PACK_QUEUE_MAX - b.packQueue - (b.packProgress === null ? 0 : 1);
        if (free < 1) return this.fail(player, "Der Packtisch ist voll.");
        const n = Math.min(player.inv.dried, free);
        player.inv.dried -= n;
        b.packQueue += n;
        return;
      }
      case "collect": {
        if (b.kind === "growbox") {
          if (b.harvestStore < 1) return this.fail(player, "Das Ernte-Lager ist leer.");
          player.inv.harvest += b.harvestStore;
          b.harvestStore = 0;
          return;
        }
        if (b.kind === "trockenraum") {
          if (b.dried < 1) return this.fail(player, "Noch nichts fertig getrocknet.");
          player.inv.dried += b.dried;
          b.dried = 0;
          return;
        }
        if (b.kind === "packtisch") {
          if (b.baggies < 1) return this.fail(player, "Noch keine Baggies fertig.");
          player.inv.baggies += b.baggies;
          b.baggies = 0;
          return;
        }
        return this.fail(player, "Hier gibt es nichts zu entnehmen.");
      }
    }
  }

  private handleSell(player: GamePlayer, npcId: string): void {
    const npc = this.npcs.get(npcId);
    if (!npc) return this.fail(player, "Passant nicht gefunden.");
    if (Math.hypot(npc.x - player.x, npc.y - player.y) > SELL_RANGE) {
      return this.fail(player, "Zu weit weg.");
    }
    if (npc.cooldownS > 0) return this.fail(player, "Dieser Passant hat gerade erst gekauft.");
    if (player.inv.baggies < 1) return this.fail(player, "Keine Baggies dabei.");

    const price = baggiePriceAt(this.priceFactors, Math.floor(npc.x), Math.floor(npc.y));
    player.inv.baggies--;
    player.moneyDirty += price;
    npc.cooldownS = NPC_BUY_COOLDOWN_S;
    this.ledger.income += price;
    this.ledger.sales++;
    player.send({ t: "sold", price });
    this.addHeatByName(player.name, HEAT_PER_SALE * (player.bribing ? BRIBE_GAIN_MULT : 1));
  }

  // ── M3: Arbeiter anheuern/entlassen ────────────────────────────────────────

  private handleHire(
    player: GamePlayer,
    kind: WorkerKind,
    buildingId: string,
    targetBuildingId: string | null,
    district: number | null,
  ): void {
    const b = this.usableBuilding(player, buildingId);
    if (typeof b === "string") return this.fail(player, b);
    const spec = WORKER_SPECS[kind];

    let target: SavedBuilding | null = null;
    switch (kind) {
      case "gaertner": {
        if (b.kind !== "growbox") return this.fail(player, "Ein Gärtner arbeitet nur an einer Growbox.");
        for (const w of this.workers.values()) {
          if (w.kind === "gaertner" && w.buildingId === b.id) {
            return this.fail(player, "Hier arbeitet schon ein Gärtner.");
          }
        }
        break;
      }
      case "kurier": {
        if (targetBuildingId === null) return this.fail(player, "Kein Zielgebäude gewählt.");
        target = this.buildings.get(targetBuildingId) ?? null;
        if (!target) return this.fail(player, "Zielgebäude nicht gefunden.");
        if (target.owner.toLowerCase() !== player.name.toLowerCase()) {
          return this.fail(player, `Das Zielgebäude gehört ${target.owner}.`);
        }
        if (transportGood(b.kind, target.kind) === null) {
          return this.fail(player, "Ungültige Route — Kuriere fahren Growbox→Trockenraum oder Trockenraum→Packtisch.");
        }
        break;
      }
      case "dealer": {
        if (b.kind !== "packtisch") return this.fail(player, "Ein Dealer holt seine Baggies am Packtisch.");
        if (district === null) return this.fail(player, "Kein Distrikt gewählt.");
        break;
      }
    }

    // Erster Lohn wird sofort fällig — verhindert Anheuern ohne Geld.
    if (!this.chargeOwner(player.name, spec.wage)) {
      return this.fail(player, `Zu wenig Geld (erster Lohn: ${spec.wage} €).`);
    }
    this.ledger.wageCost += spec.wage;

    const spawn = findNearestWalkable(this.map, b.x, b.y);
    const worker: Worker = {
      id: `w${this.nextWorkerId++}`,
      kind,
      owner: player.name,
      x: spawn.x + 0.5,
      y: spawn.y + 0.5,
      dir: "down",
      buildingId: b.id,
      targetBuildingId: kind === "kurier" ? (target?.id ?? null) : null,
      district: kind === "dealer" ? district : null,
      carrying: 0,
      paused: false,
      moving: false,
      path: null,
      sellT: 0,
      repathT: 0,
      targetNpcId: null,
    };
    this.workers.set(worker.id, worker);
  }

  private handleFire(player: GamePlayer, workerId: string): void {
    const w = this.workers.get(workerId);
    if (!w) return this.fail(player, "Arbeiter nicht gefunden.");
    if (w.owner.toLowerCase() !== player.name.toLowerCase()) {
      return this.fail(player, `Dieser Arbeiter arbeitet für ${w.owner}.`);
    }
    // Getragene Ware verfällt — bewusst simpel gehalten.
    this.workers.delete(workerId);
  }

  /** Lohn/Samen vom Konto des Besitzers abbuchen — auch wenn er offline ist. */
  private chargeOwner(name: string, amount: number): boolean {
    const online = this.playerByName(name);
    if (online) {
      if (online.moneyClean + online.moneyDirty < amount) return false;
      this.spend(online, amount);
      return true;
    }
    const off = this.offline.get(name.toLowerCase());
    if (!off || off.moneyClean + off.moneyDirty < amount) return false;
    const fromDirty = Math.min(off.moneyDirty, amount);
    off.moneyDirty -= fromDirty;
    off.moneyClean -= amount - fromDirty;
    return true;
  }

  /** Verkaufserlös eines Dealers dem Besitzer gutschreiben (immer schmutzig). */
  private creditOwnerDirty(name: string, amount: number): void {
    const online = this.playerByName(name);
    if (online) {
      online.moneyDirty += amount;
      return;
    }
    const off = this.offline.get(name.toLowerCase());
    if (off) off.moneyDirty += amount;
  }

  private playerByName(name: string): GamePlayer | null {
    for (const p of this.players.values()) {
      if (p.name.toLowerCase() === name.toLowerCase()) return p;
    }
    return null;
  }

  /** Heat eines Spielers (online oder offline) um `amount` verändern, gedeckelt auf [0, HEAT_MAX]. */
  private addHeatByName(name: string, amount: number): void {
    const online = this.playerByName(name);
    if (online) online.heat = Math.min(HEAT_MAX, Math.max(0, online.heat + amount));
    const off = this.offline.get(name.toLowerCase());
    if (off) off.heat = Math.min(HEAT_MAX, Math.max(0, off.heat + amount));
  }

  /** Aktuellen Heat-Wert eines Spielers (online oder offline) lesen. */
  private heatByName(name: string): number {
    const online = this.playerByName(name);
    if (online) return online.heat;
    return this.offline.get(name.toLowerCase())?.heat ?? 0;
  }

  /** Bestechungsstatus eines Spielers (online oder offline) lesen. */
  private isBribing(name: string): boolean {
    const online = this.playerByName(name);
    if (online) return online.bribing;
    return this.offline.get(name.toLowerCase())?.bribing ?? false;
  }

  /** Bestechungsstatus eines Spielers (online oder offline) setzen — z. B. bei leerem Konto. */
  private setBribing(name: string, value: boolean): void {
    const online = this.playerByName(name);
    if (online) online.bribing = value;
    const off = this.offline.get(name.toLowerCase());
    if (off) off.bribing = value;
  }

  /** Alle Spielernamen (kleingeschrieben), die dem Server bekannt sind — online + offline. */
  private allPlayerNames(): Set<string> {
    const names = new Set<string>();
    for (const p of this.players.values()) names.add(p.name.toLowerCase());
    for (const name of this.offline.keys()) names.add(name);
    return names;
  }

  /** Gebäude für eine Aktion holen; String = Ablehnungsgrund. */
  private usableBuilding(player: GamePlayer, id: string, kind?: BuildingKind): SavedBuilding | string {
    const b = this.buildings.get(id);
    if (!b) return "Gebäude nicht gefunden.";
    if (kind && b.kind !== kind) return "Falsches Gebäude.";
    if (b.owner.toLowerCase() !== player.name.toLowerCase()) {
      return `Das Gebäude gehört ${b.owner}.`;
    }
    const spec = BUILDING_SPECS[b.kind];
    const dx = Math.max(b.x - player.x, 0, player.x - (b.x + spec.w));
    const dy = Math.max(b.y - player.y, 0, player.y - (b.y + spec.h));
    if (Math.hypot(dx, dy) > INTERACT_RANGE) return "Zu weit weg.";
    return b;
  }

  /** Geld abziehen — schmutziges zuerst, das saubere ist später (M5) mehr wert. */
  private spend(player: GamePlayer, amount: number): void {
    const fromDirty = Math.min(player.moneyDirty, amount);
    player.moneyDirty -= fromDirty;
    player.moneyClean -= amount - fromDirty;
  }

  private fail(player: GamePlayer, reason: string): void {
    player.send({ t: "actionError", reason });
  }

  // ── Tick ───────────────────────────────────────────────────────────────────

  private tick(): void {
    const now = Date.now();
    this.tickTimes.push(now);
    while (this.tickTimes.length > 0 && this.tickTimes[0]! < now - TICK_SAMPLE_WINDOW_MS) {
      this.tickTimes.shift();
    }

    const dt = TICK_MS / 1000;
    const prodDt = dt * this.timeScale;
    for (const p of this.players.values()) this.movePlayer(p, dt);
    for (const n of this.npcs.values()) this.tickNpc(n, dt, prodDt);
    for (const b of this.buildings.values()) this.tickBuilding(b, prodDt);
    for (const w of this.workers.values()) this.tickWorker(w, dt, prodDt);
    this.tickHeat(prodDt);
    this.tickRaids(prodDt);
    this.tickLedger(prodDt);
    if (this.players.size > 0) {
      this.broadcast({
        t: "snapshot",
        players: this.snapshot(),
        npcs: this.npcSnapshot(),
        buildings: this.buildingSnapshot(),
        workers: this.workerSnapshot(),
        ledger: { ...this.ledger, elapsedS: Math.round(this.ledgerElapsedS * 10) / 10 },
      });
    }
  }

  // ── Ledger-Perioden & Löhne ────────────────────────────────────────────────

  private tickLedger(prodDt: number): void {
    this.ledgerElapsedS += prodDt;
    if (this.ledgerElapsedS < LEDGER_PERIOD_S) return;
    this.ledgerElapsedS -= LEDGER_PERIOD_S;
    this.ledgerHistoryArr.push(this.ledger);
    if (this.ledgerHistoryArr.length > LEDGER_HISTORY_MAX) this.ledgerHistoryArr.shift();
    this.ledger = emptyLedgerPeriod(this.ledger.n + 1);
    this.chargeWages();
    this.broadcast({ t: "ledgerHistory", history: this.ledgerHistory() });
  }

  /**
   * Löhne zu Periodenbeginn (Vorkasse), schmutziges Geld zuerst — wie spend().
   * Reicht das Geld des Besitzers nicht, pausiert der Arbeiter bis zu einem
   * Periodenbeginn, an dem der Lohn wieder gezahlt werden kann.
   */
  private chargeWages(): void {
    for (const w of this.workers.values()) {
      const wage = WORKER_SPECS[w.kind].wage;
      if (this.chargeOwner(w.owner, wage)) {
        w.paused = false;
        this.ledger.wageCost += wage;
      } else {
        w.paused = true;
        w.path = null;
        w.moving = false;
      }
    }
    for (const name of this.allPlayerNames()) {
      if (!this.isBribing(name)) continue;
      if (this.chargeOwner(name, BRIBE_COST_PER_PERIOD)) {
        this.ledger.bribeCost += BRIBE_COST_PER_PERIOD;
      } else {
        this.setBribing(name, false);
      }
    }
  }

  // ── M4: Heat & Razzien ─────────────────────────────────────────────────────

  /** Passiver Heat-Abbau über Zeit, für jeden bekannten Spieler (online + offline). */
  private tickHeat(prodDt: number): void {
    for (const p of this.players.values()) p.heat = Math.max(0, p.heat - HEAT_DECAY_PER_S * prodDt);
    for (const off of this.offline.values()) off.heat = Math.max(0, off.heat - HEAT_DECAY_PER_S * prodDt);
  }

  /** Razzia-Timer je Spieler; bei Ablauf wird für diesen Spieler gewürfelt. */
  private tickRaids(prodDt: number): void {
    for (const name of this.allPlayerNames()) {
      const t = (this.raidTimers.get(name) ?? 0) + prodDt;
      if (t < RAID_CHECK_INTERVAL_S) {
        this.raidTimers.set(name, t);
        continue;
      }
      this.raidTimers.set(name, 0);
      this.tryRaid(name);
    }
  }

  /** Würfelt eine Razzia für einen Spieler aus und konfisziert ggf. gelagerte Ware. */
  private tryRaid(name: string): void {
    const heat = this.heatByName(name);
    if (heat <= 0) return;
    const owned = [...this.buildings.values()].filter((b) => b.owner.toLowerCase() === name);
    if (owned.length === 0) return;
    const chance = RAID_CHANCE_AT_MAX_HEAT * (heat / HEAT_MAX) ** 2;
    if (Math.random() >= chance) return;

    const b = owned[Math.floor(Math.random() * owned.length)]!;
    let lossValue = 0;
    switch (b.kind) {
      case "growbox":
        lossValue = b.harvestStore * RAID_VALUE_PER_HARVEST;
        b.harvestStore = 0;
        break;
      case "trockenraum":
        lossValue = b.dried * RAID_VALUE_PER_DRIED;
        b.dried = 0;
        break;
      case "packtisch":
        lossValue = b.baggies * RAID_VALUE_PER_BAGGIE;
        b.baggies = 0;
        break;
    }
    if (lossValue <= 0) return;

    this.ledger.raidLoss += lossValue;
    const online = this.playerByName(name);
    if (online) online.send({ t: "raided", buildingId: b.id, buildingKind: b.kind, lossValue });
  }

  private tickBuilding(b: SavedBuilding, dt: number): void {
    switch (b.kind) {
      case "growbox":
        if (b.plantProgress !== null && b.plantProgress < 1) {
          b.plantProgress = Math.min(1, b.plantProgress + dt / GROW_TIME_S);
        }
        break;
      case "trockenraum":
        if (b.drying.length > 0) {
          for (let i = 0; i < b.drying.length; i++) b.drying[i]! += dt / DRY_TIME_S;
          const finished = b.drying.filter((p) => p >= 1).length;
          if (finished > 0) {
            b.dried += finished;
            b.drying = b.drying.filter((p) => p < 1);
            this.ledger.dried += finished;
          }
        }
        break;
      case "packtisch":
        if (b.packProgress === null && b.packQueue > 0) {
          b.packQueue--;
          b.packProgress = 0;
        }
        if (b.packProgress !== null) {
          b.packProgress += dt / PACK_TIME_S;
          if (b.packProgress >= 1) {
            b.baggies += BAGGIES_PER_DRIED;
            b.packProgress = null;
            this.ledger.packed += BAGGIES_PER_DRIED;
          }
        }
        break;
    }
  }

  // ── Passanten-NPCs ─────────────────────────────────────────────────────────

  private spawnNpcs(): void {
    const streets: Vec2[] = [];
    for (let y = 0; y < this.map.height; y++) {
      for (let x = 0; x < this.map.width; x++) {
        if (isStreet(tileAt(this.map, x, y))) streets.push({ x, y });
      }
    }
    if (streets.length === 0) return;
    for (let i = 0; i < NPC_COUNT; i++) {
      const spot = streets[Math.floor(Math.random() * streets.length)]!;
      this.npcs.set(`n${i + 1}`, {
        id: `n${i + 1}`,
        x: spot.x + 0.5,
        y: spot.y + 0.5,
        dir: "down",
        moving: false,
        skin: i % 2,
        path: null,
        waitTicks: Math.floor(Math.random() * 30),
        cooldownS: 0,
      });
    }
  }

  private tickNpc(n: Npc, dt: number, prodDt: number): void {
    if (n.cooldownS > 0) n.cooldownS = Math.max(0, n.cooldownS - prodDt);

    if (n.path && n.path.length > 0) {
      followPath(n, NPC_WALK_SPEED, dt);
      return;
    }
    n.moving = false;
    if (n.waitTicks > 0) {
      n.waitTicks--;
      return;
    }
    // Neues Ziel in der Nähe suchen (nur Straße/Gehweg).
    for (let attempt = 0; attempt < 6; attempt++) {
      const tx = Math.floor(n.x) + Math.floor(Math.random() * 31) - 15;
      const ty = Math.floor(n.y) + Math.floor(Math.random() * 31) - 15;
      if (!isStreet(tileAt(this.map, tx, ty))) continue;
      const path = findPath(this.map, { x: n.x, y: n.y }, { x: tx, y: ty }, isStreet);
      if (path && path.length > 0) {
        n.path = path;
        return;
      }
    }
    n.waitTicks = 10 + Math.floor(Math.random() * 30);
  }

  // ── Arbeiter-Simulation ────────────────────────────────────────────────────

  private tickWorker(w: Worker, dt: number, prodDt: number): void {
    if (w.paused) {
      w.moving = false;
      return;
    }
    switch (w.kind) {
      case "gaertner":
        this.tickGaertner(w);
        break;
      case "kurier":
        this.tickKurier(w, dt);
        break;
      case "dealer":
        this.tickDealer(w, dt, prodDt);
        break;
    }
  }

  /** Gärtner steht an seiner Growbox: erntet Reifes ins Lager, pflanzt nach (kauft Samen vom Besitzer-Konto). */
  private tickGaertner(w: Worker): void {
    w.moving = false;
    const b = this.buildings.get(w.buildingId);
    if (!b || b.kind !== "growbox") return;
    if (b.plantProgress !== null && b.plantProgress >= 1) {
      if (b.harvestStore + HARVEST_YIELD <= GROWBOX_STORE_MAX) {
        b.plantProgress = null;
        b.harvestStore += HARVEST_YIELD;
        this.ledger.harvested += HARVEST_YIELD;
      }
      return;
    }
    if (b.plantProgress === null && this.chargeOwner(w.owner, SEED_PRICE)) {
      b.plantProgress = 0;
      this.ledger.seedCost += SEED_PRICE;
    }
  }

  /** Kurier pendelt zwischen Quelle und Ziel; nimmt, was da ist (max. KURIER_CAPACITY). */
  private tickKurier(w: Worker, dt: number): void {
    const from = this.buildings.get(w.buildingId);
    const to = w.targetBuildingId === null ? undefined : this.buildings.get(w.targetBuildingId);
    if (!from || !to) {
      w.moving = false;
      return;
    }
    const good = transportGood(from.kind, to.kind);
    if (!good) {
      w.moving = false;
      return;
    }

    const dest = w.carrying > 0 ? to : from;
    if (!this.atBuilding(w.x, w.y, dest)) {
      this.walkToBuilding(w, dest, dt);
      return;
    }
    w.path = null;
    w.moving = false;

    if (w.carrying === 0) {
      const avail = good === "harvest" ? from.harvestStore : from.dried;
      const take = Math.min(avail, KURIER_CAPACITY);
      if (take > 0) {
        if (good === "harvest") from.harvestStore -= take;
        else from.dried -= take;
        w.carrying = take;
      }
      return;
    }

    if (to.kind === "trockenraum") {
      const free = DRY_CAPACITY - to.drying.length - to.dried;
      const put = Math.min(w.carrying, free);
      for (let i = 0; i < put; i++) to.drying.push(0);
      w.carrying -= put;
    } else if (to.kind === "packtisch") {
      const free = PACK_QUEUE_MAX - to.packQueue - (to.packProgress === null ? 0 : 1);
      const put = Math.min(w.carrying, free);
      to.packQueue += put;
      w.carrying -= put;
    }
    // Ist das Ziel voll, bleibt der Rest getragen — der Kurier wartet hier.
  }

  /** Dealer: Baggies am Packtisch holen, im zugewiesenen Distrikt kaufbereite Passanten abklappern. */
  private tickDealer(w: Worker, dt: number, prodDt: number): void {
    const src = this.buildings.get(w.buildingId);
    if (!src || src.kind !== "packtisch" || w.district === null) {
      w.moving = false;
      return;
    }

    if (w.carrying === 0) {
      w.targetNpcId = null;
      w.sellT = 0;
      if (!this.atBuilding(w.x, w.y, src)) {
        this.walkToBuilding(w, src, dt);
        return;
      }
      w.path = null;
      w.moving = false;
      const take = Math.min(src.baggies, DEALER_CAPACITY);
      if (take > 0) {
        src.baggies -= take;
        w.carrying = take;
      }
      return;
    }

    // Anvisierten Passanten prüfen (weg, gekauft oder Distrikt verlassen → neu suchen).
    let npc = w.targetNpcId === null ? undefined : this.npcs.get(w.targetNpcId);
    if (!npc || npc.cooldownS > 0 || districtIdAt(Math.floor(npc.x), Math.floor(npc.y)) !== w.district) {
      npc = this.findReadyNpcInDistrict(w);
      w.targetNpcId = npc ? npc.id : null;
      w.sellT = 0;
    }

    if (npc) {
      if (Math.hypot(npc.x - w.x, npc.y - w.y) <= SELL_RANGE) {
        w.path = null;
        w.moving = false;
        w.sellT += prodDt;
        if (w.sellT >= DEALER_SELL_TIME_S) {
          w.sellT = 0;
          const price = baggiePriceAt(this.priceFactors, Math.floor(npc.x), Math.floor(npc.y));
          w.carrying--;
          this.creditOwnerDirty(w.owner, price);
          npc.cooldownS = NPC_BUY_COOLDOWN_S;
          this.ledger.income += price;
          this.ledger.sales++;
          this.addHeatByName(w.owner, HEAT_PER_SALE * (this.isBribing(w.owner) ? BRIBE_GAIN_MULT : 1));
          w.targetNpcId = null;
        }
        return;
      }
      // Hinterherlaufen — Pfad regelmäßig auffrischen, der Passant bewegt sich.
      w.sellT = 0;
      w.repathT -= dt;
      if (w.path === null || w.repathT <= 0) {
        w.repathT = 1;
        const path = findPath(this.map, { x: w.x, y: w.y }, { x: Math.floor(npc.x), y: Math.floor(npc.y) });
        if (path && path.length > 0) w.path = path;
      }
      if (w.path && w.path.length > 0) followPath(w, WORKER_WALK_SPEED, dt);
      else w.moving = false;
      return;
    }

    // Kein kaufbereiter Passant: im Distrikt patrouillieren.
    if (w.path && w.path.length > 0) {
      followPath(w, WORKER_WALK_SPEED, dt);
      return;
    }
    w.moving = false;
    w.repathT -= dt;
    if (w.repathT > 0) return;
    w.repathT = 1.5;
    const spot = this.randomStreetInDistrict(w.district);
    if (spot) {
      const path = findPath(this.map, { x: w.x, y: w.y }, spot);
      if (path && path.length > 0) w.path = path;
    }
  }

  private atBuilding(x: number, y: number, b: SavedBuilding): boolean {
    const spec = BUILDING_SPECS[b.kind];
    const dx = Math.max(b.x - x, 0, x - (b.x + spec.w));
    const dy = Math.max(b.y - y, 0, y - (b.y + spec.h));
    return Math.hypot(dx, dy) <= INTERACT_RANGE;
  }

  private walkToBuilding(w: Worker, b: SavedBuilding, dt: number): void {
    if (w.path && w.path.length > 0) {
      followPath(w, WORKER_WALK_SPEED, dt);
      return;
    }
    w.moving = false;
    w.repathT -= dt;
    if (w.repathT > 0) return;
    const dock = findNearestWalkable(this.map, b.x, b.y);
    const path = findPath(this.map, { x: w.x, y: w.y }, dock);
    if (path && path.length > 0) {
      w.path = path;
      followPath(w, WORKER_WALK_SPEED, dt);
    } else {
      w.repathT = 2;
    }
  }

  private findReadyNpcInDistrict(w: Worker): Npc | undefined {
    let best: Npc | undefined;
    let bestDist = Infinity;
    for (const n of this.npcs.values()) {
      if (n.cooldownS > 0) continue;
      if (districtIdAt(Math.floor(n.x), Math.floor(n.y)) !== w.district) continue;
      const d = Math.hypot(n.x - w.x, n.y - w.y);
      if (d < bestDist) {
        bestDist = d;
        best = n;
      }
    }
    return best;
  }

  private randomStreetInDistrict(district: number): Vec2 | null {
    const cellW = MAP_WIDTH / DISTRICT_GRID;
    const cellH = MAP_HEIGHT / DISTRICT_GRID;
    const gx = district % DISTRICT_GRID;
    const gy = Math.floor(district / DISTRICT_GRID);
    for (let attempt = 0; attempt < 12; attempt++) {
      const x = Math.floor(gx * cellW + Math.random() * cellW);
      const y = Math.floor(gy * cellH + Math.random() * cellH);
      if (isStreet(tileAt(this.map, x, y))) return { x, y };
    }
    return null;
  }

  // ── Bewegung ───────────────────────────────────────────────────────────────

  private movePlayer(p: GamePlayer, dt: number): void {
    const speed = WALK_SPEED * (p.sprinting ? SPRINT_MULTIPLIER : 1);
    const { dx, dy } = p.input;
    if (dx !== 0 || dy !== 0) {
      const len = Math.hypot(dx, dy);
      const step = (speed * dt) / len;
      this.moveAxis(p, dx * step, 0);
      this.moveAxis(p, 0, dy * step);
      p.dir = directionOf(dx, dy, p.dir);
      p.moving = true;
      return;
    }

    if (p.path && p.path.length > 0) {
      followPath(p, speed, dt);
      return;
    }

    p.moving = false;
  }

  private moveAxis(p: GamePlayer, dx: number, dy: number): void {
    const nx = p.x + dx;
    const ny = p.y + dy;
    if (this.canStandAt(nx, ny)) {
      p.x = nx;
      p.y = ny;
    }
  }

  private canStandAt(x: number, y: number): boolean {
    const r = PLAYER_RADIUS;
    const corners: Array<[number, number]> = [
      [x - r, y - r],
      [x + r, y - r],
      [x - r, y + r],
      [x + r, y + r],
    ];
    return corners.every(([cx, cy]) =>
      isWalkable(tileAt(this.map, Math.floor(cx), Math.floor(cy))),
    );
  }

  private spawnPoint(index: number): Vec2 {
    const cx = Math.floor(MAP_WIDTH / 2) + (index % 2) * 2;
    const cy = Math.floor(MAP_HEIGHT / 2) + Math.floor(index / 2) * 2;
    return findNearestWalkable(this.map, cx, cy);
  }
}

/** Läuft Wegpunkt-Listen ab (Spieler nach Tap, NPCs beim Umherlaufen). */
function followPath(
  e: { x: number; y: number; dir: Direction; moving: boolean; path: Vec2[] | null },
  speed: number,
  dt: number,
): void {
  let remaining = speed * dt;
  while (remaining > 0 && e.path && e.path.length > 0) {
    const wp = e.path[0]!;
    const tx = wp.x + 0.5;
    const ty = wp.y + 0.5;
    const distX = tx - e.x;
    const distY = ty - e.y;
    const dist = Math.hypot(distX, distY);
    if (dist <= remaining) {
      e.x = tx;
      e.y = ty;
      remaining -= dist;
      e.path.shift();
      if (e.path.length === 0) e.path = null;
    } else {
      e.x += (distX / dist) * remaining;
      e.y += (distY / dist) * remaining;
      e.dir = directionOf(distX, distY, e.dir);
      remaining = 0;
    }
  }
  e.moving = e.path !== null;
}

function toSavedPlayer(p: GamePlayer): SavedPlayer {
  return {
    name: p.name,
    x: Math.round(p.x * 100) / 100,
    y: Math.round(p.y * 100) / 100,
    dir: p.dir,
    avatar: p.avatar,
    moneyClean: p.moneyClean,
    moneyDirty: p.moneyDirty,
    inv: { ...p.inv },
    heat: p.heat,
    bribing: p.bribing,
  };
}

function directionOf(dx: number, dy: number, fallback: Direction): Direction {
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? "right" : "left";
  if (dy !== 0) return dy > 0 ? "down" : "up";
  return fallback;
}
