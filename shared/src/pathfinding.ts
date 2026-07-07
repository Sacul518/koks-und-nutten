import { tileAt, type CityMap } from "./citygen.ts";
import { isWalkable, type Vec2 } from "./types.ts";

const MAX_EXPANDED_NODES = 30000;

/**
 * A* auf dem Tile-Raster (4 Richtungen). Liefert die Tile-Liste vom Start
 * (exklusive) bis zum Ziel (inklusive) oder null, wenn kein Weg existiert.
 * Über `walkable` lässt sich einschränken, welche Tiles betreten werden
 * (z. B. nur Straßen/Gehwege für Passanten-NPCs).
 */
export function findPath(
  map: CityMap,
  start: Vec2,
  goal: Vec2,
  walkable: (tile: number) => boolean = isWalkable,
): Vec2[] | null {
  const sx = Math.floor(start.x);
  const sy = Math.floor(start.y);
  const gx = Math.floor(goal.x);
  const gy = Math.floor(goal.y);
  if (!walkable(tileAt(map, gx, gy))) return null;
  if (sx === gx && sy === gy) return [];

  const w = map.width;
  const idx = (x: number, y: number) => y * w + x;
  const gScore = new Map<number, number>();
  const cameFrom = new Map<number, number>();
  const heuristic = (x: number, y: number) => Math.abs(x - gx) + Math.abs(y - gy);

  // Binärer Min-Heap über fScore
  const heap: number[] = [];
  const fScore = new Map<number, number>();
  const push = (node: number) => {
    heap.push(node);
    let i = heap.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (fScore.get(heap[parent]!)! <= fScore.get(heap[i]!)!) break;
      [heap[parent], heap[i]] = [heap[i]!, heap[parent]!];
      i = parent;
    }
  };
  const pop = (): number => {
    const top = heap[0]!;
    const last = heap.pop()!;
    if (heap.length > 0) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = 2 * i + 2;
        let smallest = i;
        if (l < heap.length && fScore.get(heap[l]!)! < fScore.get(heap[smallest]!)!) smallest = l;
        if (r < heap.length && fScore.get(heap[r]!)! < fScore.get(heap[smallest]!)!) smallest = r;
        if (smallest === i) break;
        [heap[smallest], heap[i]] = [heap[i]!, heap[smallest]!];
        i = smallest;
      }
    }
    return top;
  };

  const startIdx = idx(sx, sy);
  gScore.set(startIdx, 0);
  fScore.set(startIdx, heuristic(sx, sy));
  push(startIdx);

  let expanded = 0;
  while (heap.length > 0 && expanded < MAX_EXPANDED_NODES) {
    const current = pop();
    expanded++;
    const cx = current % w;
    const cy = Math.floor(current / w);
    if (cx === gx && cy === gy) {
      const path: Vec2[] = [];
      let node = current;
      while (node !== startIdx) {
        path.push({ x: node % w, y: Math.floor(node / w) });
        node = cameFrom.get(node)!;
      }
      path.reverse();
      return path;
    }
    const g = gScore.get(current)!;
    const neighbors = [
      [cx - 1, cy],
      [cx + 1, cy],
      [cx, cy - 1],
      [cx, cy + 1],
    ] as const;
    for (const [nx, ny] of neighbors) {
      if (!walkable(tileAt(map, nx, ny))) continue;
      const nIdx = idx(nx, ny);
      const tentative = g + 1;
      if (tentative < (gScore.get(nIdx) ?? Infinity)) {
        gScore.set(nIdx, tentative);
        fScore.set(nIdx, tentative + heuristic(nx, ny));
        cameFrom.set(nIdx, current);
        push(nIdx);
      }
    }
  }
  return null;
}
