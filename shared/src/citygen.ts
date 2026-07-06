import { MAP_HEIGHT, MAP_WIDTH } from "./constants.ts";
import { mulberry32 } from "./rng.ts";
import { Tile, isWalkable } from "./types.ts";

export interface CityMap {
  width: number;
  height: number;
  tiles: Uint8Array;
}

export function tileAt(map: CityMap, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return Tile.Building;
  return map.tiles[y * map.width + x]!;
}

/**
 * Erzeugt die Stadt deterministisch aus dem Seed: Straßenraster (2 Tiles breit),
 * Gehwege entlang der Straßen, Blöcke mit Gebäuden, ab und zu ein Park.
 */
export function generateCity(seed: number): CityMap {
  const width = MAP_WIDTH;
  const height = MAP_HEIGHT;
  const tiles = new Uint8Array(width * height).fill(Tile.Lot);
  const rand = mulberry32(seed);
  const set = (x: number, y: number, t: number) => {
    if (x >= 0 && y >= 0 && x < width && y < height) tiles[y * width + x] = t;
  };
  const get = (x: number, y: number): number =>
    x < 0 || y < 0 || x >= width || y >= height ? Tile.Building : tiles[y * width + x]!;

  const roadPositions = (limit: number): number[] => {
    const positions: number[] = [0];
    let p = 0;
    while (p + 12 < limit - 2) {
      p += 10 + Math.floor(rand() * 9);
      positions.push(p);
    }
    positions.push(limit - 2);
    return positions;
  };

  const vRoads = roadPositions(width);
  const hRoads = roadPositions(height);

  for (const rx of vRoads) {
    for (let y = 0; y < height; y++) {
      set(rx, y, Tile.Road);
      set(rx + 1, y, Tile.Road);
    }
  }
  for (const ry of hRoads) {
    for (let x = 0; x < width; x++) {
      set(x, ry, Tile.Road);
      set(x, ry + 1, Tile.Road);
    }
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (get(x, y) !== Tile.Lot) continue;
      const nearRoad =
        get(x - 1, y) === Tile.Road ||
        get(x + 1, y) === Tile.Road ||
        get(x, y - 1) === Tile.Road ||
        get(x, y + 1) === Tile.Road;
      if (nearRoad) set(x, y, Tile.Sidewalk);
    }
  }

  for (let bi = 0; bi < vRoads.length - 1; bi++) {
    for (let bj = 0; bj < hRoads.length - 1; bj++) {
      const x0 = vRoads[bi]! + 3;
      const x1 = vRoads[bi + 1]! - 2;
      const y0 = hRoads[bj]! + 3;
      const y1 = hRoads[bj + 1]! - 2;
      const bw = x1 - x0;
      const bh = y1 - y0;
      if (bw < 3 || bh < 3) continue;

      if (rand() < 0.12) {
        for (let y = y0; y < y1; y++) {
          for (let x = x0; x < x1; x++) set(x, y, Tile.Park);
        }
        continue;
      }

      const attempts = Math.ceil((bw * bh) / 12);
      for (let a = 0; a < attempts; a++) {
        const w = 3 + Math.floor(rand() * 5);
        const h = 3 + Math.floor(rand() * 4);
        const px = x0 + Math.floor(rand() * Math.max(1, bw - w + 1));
        const py = y0 + Math.floor(rand() * Math.max(1, bh - h + 1));
        if (px + w > x1 || py + h > y1) continue;

        let free = true;
        for (let y = py - 1; y < py + h + 1 && free; y++) {
          for (let x = px - 1; x < px + w + 1 && free; x++) {
            if (get(x, y) === Tile.Building) free = false;
          }
        }
        if (!free) continue;

        for (let y = py; y < py + h; y++) {
          for (let x = px; x < px + w; x++) set(x, y, Tile.Building);
        }
      }
    }
  }

  return { width, height, tiles };
}

/** Sucht ausgehend von (x, y) spiralförmig das nächste begehbare Tile. */
export function findNearestWalkable(map: CityMap, x: number, y: number): { x: number; y: number } {
  if (isWalkable(tileAt(map, x, y))) return { x, y };
  for (let r = 1; r < Math.max(map.width, map.height); r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (isWalkable(tileAt(map, nx, ny))) return { x: nx, y: ny };
      }
    }
  }
  return { x, y };
}
