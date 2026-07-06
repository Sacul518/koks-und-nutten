import {
  MAP_HEIGHT,
  MAP_WIDTH,
  MAX_NAME_LENGTH,
  MAX_PLAYERS,
  SPRINT_MULTIPLIER,
  TICK_MS,
  WALK_SPEED,
  findNearestWalkable,
  findPath,
  generateCity,
  isWalkable,
  tileAt,
  type CityMap,
  type ClientMessage,
  type Direction,
  type PlayerSnapshot,
  type ServerMessage,
  type Vec2,
} from "@koks/shared";

const PLAYER_RADIUS = 0.3;

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
  send: (msg: ServerMessage) => void;
}

export type JoinResult = { ok: true; player: GamePlayer } | { ok: false; reason: string };

export class Game {
  readonly seed: number;
  readonly map: CityMap;
  readonly players = new Map<string, GamePlayer>();
  private nextId = 1;
  private timer: NodeJS.Timeout | null = null;

  constructor(seed: number) {
    this.seed = seed;
    this.map = generateCity(seed);
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
    const player: GamePlayer = {
      id: `p${this.nextId++}`,
      name,
      x: spawn.x + 0.5,
      y: spawn.y + 0.5,
      dir: "down",
      moving: false,
      avatar,
      sprinting: false,
      path: null,
      input: { dx: 0, dy: 0 },
      send,
    };
    this.players.set(player.id, player);
    return { ok: true, player };
  }

  leave(id: string): void {
    if (this.players.delete(id)) {
      this.broadcast({ t: "playerLeft", id });
    }
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
    }));
  }

  broadcast(msg: ServerMessage): void {
    for (const p of this.players.values()) p.send(msg);
  }

  private tick(): void {
    const dt = TICK_MS / 1000;
    for (const p of this.players.values()) this.movePlayer(p, dt);
    if (this.players.size > 0) {
      this.broadcast({ t: "snapshot", players: this.snapshot() });
    }
  }

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
      let remaining = speed * dt;
      while (remaining > 0 && p.path && p.path.length > 0) {
        const wp = p.path[0]!;
        const tx = wp.x + 0.5;
        const ty = wp.y + 0.5;
        const distX = tx - p.x;
        const distY = ty - p.y;
        const dist = Math.hypot(distX, distY);
        if (dist <= remaining) {
          p.x = tx;
          p.y = ty;
          remaining -= dist;
          p.path.shift();
          if (p.path.length === 0) p.path = null;
        } else {
          p.x += (distX / dist) * remaining;
          p.y += (distY / dist) * remaining;
          p.dir = directionOf(distX, distY, p.dir);
          remaining = 0;
        }
      }
      p.moving = p.path !== null;
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

function directionOf(dx: number, dy: number, fallback: Direction): Direction {
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? "right" : "left";
  if (dy !== 0) return dy > 0 ? "down" : "up";
  return fallback;
}
