import {
  BAGGIE_PRICE_BASE,
  DISTRICT_GRID,
  DISTRICT_PRICE_MAX,
  DISTRICT_PRICE_MIN,
  MAP_HEIGHT,
  MAP_WIDTH,
} from "./constants.ts";
import { mulberry32 } from "./rng.ts";

/**
 * Einfaches deterministisches Distrikt-Raster (M2): DISTRICT_GRID × DISTRICT_GRID
 * Zellen, jede mit einem Preisfaktor aus dem Seed. Die volle Distrikt-Mechanik
 * (Nachfrageprofile, Polizei-Multiplikatoren) kommt erst in M5.
 */
export function districtPriceFactors(seed: number): number[] {
  const rand = mulberry32((seed ^ 0x5eed) >>> 0);
  return Array.from({ length: DISTRICT_GRID * DISTRICT_GRID }, () => {
    const f = DISTRICT_PRICE_MIN + rand() * (DISTRICT_PRICE_MAX - DISTRICT_PRICE_MIN);
    return Math.round(f * 100) / 100;
  });
}

/** Distrikt-Index (0 … DISTRICT_GRID²-1) für eine Tile-Position. */
export function districtIdAt(x: number, y: number): number {
  const clamp = (v: number, max: number) => Math.min(max - 1, Math.max(0, v));
  const gx = clamp(Math.floor(x / (MAP_WIDTH / DISTRICT_GRID)), DISTRICT_GRID);
  const gy = clamp(Math.floor(y / (MAP_HEIGHT / DISTRICT_GRID)), DISTRICT_GRID);
  return gy * DISTRICT_GRID + gx;
}

/** Verkaufspreis eines Baggies an dieser Position (Basispreis × Distrikt-Faktor). */
export function baggiePriceAt(factors: number[], x: number, y: number): number {
  return Math.round(BAGGIE_PRICE_BASE * factors[districtIdAt(x, y)]!);
}
