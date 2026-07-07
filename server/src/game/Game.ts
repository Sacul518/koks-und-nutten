import {
  BAGGIES_PER_DRIED,
  BUILDING_SPECS,
  DRY_CAPACITY,
  DRY_TIME_S,
  GROW_TIME_S,
  HARVEST_YIELD,
  INTERACT_RANGE,
  MAP_HEIGHT,
  MAP_WIDTH,
  MAX_NAME_LENGTH,
  MAX_PLAYERS,
  NPC_BUY_COOLDOWN_S,
  NPC_COUNT,
  NPC_WALK_SPEED,
  PACK_QUEUE_MAX,
  PACK_TIME_S,
  SEED_PRICE,
  SELL_RANGE,
  SPRINT_MULTIPLIER,
  START_MONEY_CLEAN,
  START_MONEY_DIRTY,
  TICK_MS,
  Tile,
  WALK_SPEED,
  baggiePriceAt,
  districtPriceFactors,
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
  type NpcSnapshot,
  type PlayerSnapshot,
  type ServerMessage,
  type Vec2,
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
  private readonly npcs = new Map<string, Npc>();
  private readonly priceFactors: number[];
  private nextId = 1;
  private nextBuildingId = 1;
  private timer: NodeJS.Timeout | null = null;
  /** Zuletzt bekannte Zustände nicht verbundener Spieler, Schlüssel = Name (kleingeschrieben) */
  private readonly offline = new Map<string, SavedPlayer>();
  private tickTimes: number[] = [];
  /** Dev-Zeitraffer (TIME_SCALE): beschleunigt nur Produktion und NPC-Cooldowns. */
  private readonly timeScale: number;

  constructor(seed: number, savedPlayers: SavedPlayer[] = [], savedBuildings: SavedBuilding[] = [], timeScale = 1) {
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
          return { ...base, kind: "growbox" as const, plant: b.plantProgress === null ? null : pct(b.plantProgress) };
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
    if (player.moneyClean + player.moneyDirty < spec.cost) {
      return this.fail(player, `Zu wenig Geld (${spec.cost} € nötig).`);
    }

    this.spend(player, spec.cost);
    const building: SavedBuilding = {
      id: `b${this.nextBuildingId++}`,
      kind,
      x,
      y,
      owner: player.name,
      plantProgress: null,
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
    player.send({ t: "sold", price });
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
    if (this.players.size > 0) {
      this.broadcast({
        t: "snapshot",
        players: this.snapshot(),
        npcs: this.npcSnapshot(),
        buildings: this.buildingSnapshot(),
      });
    }
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
  };
}

function directionOf(dx: number, dy: number, fallback: Direction): Direction {
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? "right" : "left";
  if (dy !== 0) return dy > 0 ? "down" : "up";
  return fallback;
}
