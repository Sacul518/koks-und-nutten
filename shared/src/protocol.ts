import type { PlayerSnapshot } from "./types.ts";

export type ClientMessage =
  | { t: "join"; v: number; name: string }
  | { t: "moveTo"; x: number; y: number }
  | { t: "input"; dx: -1 | 0 | 1; dy: -1 | 0 | 1 };

export type ServerMessage =
  | { t: "welcome"; id: string; seed: number; players: PlayerSnapshot[] }
  | { t: "joinError"; reason: string }
  | { t: "snapshot"; players: PlayerSnapshot[] }
  | { t: "playerLeft"; id: string };

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
    default:
      return null;
  }
}
