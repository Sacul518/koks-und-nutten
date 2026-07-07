import {
  isBuildingKind,
  type BuildingKind,
  type BuildingSnapshot,
  type NpcSnapshot,
  type PlayerSnapshot,
} from "./types.ts";

export type ClientMessage =
  | { t: "join"; v: number; name: string }
  | { t: "moveTo"; x: number; y: number }
  | { t: "input"; dx: -1 | 0 | 1; dy: -1 | 0 | 1 }
  | { t: "sprint"; on: boolean }
  // M2: Bauen, Produktion, Verkauf
  | { t: "build"; kind: BuildingKind; x: number; y: number }
  | { t: "buySeeds"; buildingId: string; count: number }
  | { t: "plant"; buildingId: string }
  | { t: "harvest"; buildingId: string }
  | { t: "store"; buildingId: string }
  | { t: "pack"; buildingId: string }
  | { t: "collect"; buildingId: string }
  | { t: "sell"; npcId: string };

export type ServerMessage =
  | { t: "welcome"; id: string; seed: number; players: PlayerSnapshot[] }
  | { t: "joinError"; reason: string }
  | { t: "snapshot"; players: PlayerSnapshot[]; npcs: NpcSnapshot[]; buildings: BuildingSnapshot[] }
  | { t: "playerLeft"; id: string }
  /** Abgelehnte Aktion (nur an den auslösenden Spieler) */
  | { t: "actionError"; reason: string }
  /** Erfolgreicher Baggie-Verkauf (nur an den Verkäufer) */
  | { t: "sold"; price: number };

export function parseClientMessage(raw: unknown): ClientMessage | null {
  if (typeof raw !== "string") return null;
  let msg: unknown;
  try {
    msg = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof msg !== "object" || msg === null || !("t" in msg)) return null;
  const m = msg as Record<string, unknown>;
  switch (m.t) {
    case "join":
      if (typeof m.name === "string" && typeof m.v === "number") {
        return { t: "join", v: m.v, name: m.name };
      }
      return null;
    case "moveTo":
      if (typeof m.x === "number" && typeof m.y === "number") {
        return { t: "moveTo", x: m.x, y: m.y };
      }
      return null;
    case "input": {
      const ok = (n: unknown): n is -1 | 0 | 1 => n === -1 || n === 0 || n === 1;
      if (ok(m.dx) && ok(m.dy)) return { t: "input", dx: m.dx, dy: m.dy };
      return null;
    }
    case "sprint":
      if (typeof m.on === "boolean") return { t: "sprint", on: m.on };
      return null;
    case "build":
      if (isBuildingKind(m.kind) && typeof m.x === "number" && typeof m.y === "number") {
        return { t: "build", kind: m.kind, x: m.x, y: m.y };
      }
      return null;
    case "buySeeds":
      if (
        typeof m.buildingId === "string" &&
        typeof m.count === "number" &&
        Number.isInteger(m.count) &&
        m.count >= 1 &&
        m.count <= 99
      ) {
        return { t: "buySeeds", buildingId: m.buildingId, count: m.count };
      }
      return null;
    case "plant":
    case "harvest":
    case "store":
    case "pack":
    case "collect":
      if (typeof m.buildingId === "string") {
        return { t: m.t, buildingId: m.buildingId };
      }
      return null;
    case "sell":
      if (typeof m.npcId === "string") return { t: "sell", npcId: m.npcId };
      return null;
    default:
      return null;
  }
}
