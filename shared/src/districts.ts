import {
  BAGGIE_PRICE_BASE,
  DISTRICT_GRID,
  DISTRICT_POLICE_MAX,
  DISTRICT_POLICE_MIN,
  DISTRICT_PRICE_MAX,
  DISTRICT_PRICE_MIN,
  MAP_HEIGHT,
  MAP_WIDTH,
  RIVAL_PRICE_FLOOR,
  RIVAL_STRENGTH_MAX,
  RIVAL_STRENGTH_MIN,
} from "./constants.ts";
import { mulberry32 } from "./rng.ts";

/** Deterministisches Distrikt-Raster: DISTRICT_GRID × DISTRICT_GRID Zellen, jede mit einem Preisfaktor aus dem Seed. */
export function districtPriceFactors(seed: number): number[] {
  const rand = mulberry32((seed ^ 0x5eed) >>> 0);
  return Array.from({ length: DISTRICT_GRID * DISTRICT_GRID }, () => {
    const f = DISTRICT_PRICE_MIN + rand() * (DISTRICT_PRICE_MAX - DISTRICT_PRICE_MIN);
    return Math.round(f * 100) / 100;
  });
}

/** M5: Polizei-Multiplikator je Distrikt (wirkt auf den Heat-Zuwachs bei Verkäufen dort). */
export function districtPoliceMultipliers(seed: number): number[] {
  const rand = mulberry32((seed ^ 0x9012) >>> 0);
  return Array.from({ length: DISTRICT_GRID * DISTRICT_GRID }, () => {
    const f = DISTRICT_POLICE_MIN + rand() * (DISTRICT_POLICE_MAX - DISTRICT_POLICE_MIN);
    return Math.round(f * 100) / 100;
  });
}

/** M5: Rivalen-Grundstärke je Distrikt — bestimmt, wie oft und wie viel Rivalen dort "verkaufen". */
export function districtRivalStrength(seed: number): number[] {
  const rand = mulberry32((seed ^ 0x21341) >>> 0);
  return Array.from({ length: DISTRICT_GRID * DISTRICT_GRID }, () => {
    const f = RIVAL_STRENGTH_MIN + rand() * (RIVAL_STRENGTH_MAX - RIVAL_STRENGTH_MIN);
    return Math.round(f * 100) / 100;
  });
}

/** M5: Preisfaktor aus der Revierkontrolle (0 = Rivalen dominieren, 1 = Spieler dominieren). */
export function controlPriceMultiplier(control: number): number {
  return RIVAL_PRICE_FLOOR + control * (1 - RIVAL_PRICE_FLOOR);
}

/** Distrikt-Index (0 … DISTRICT_GRID²-1) für eine Tile-Position. */
export function districtIdAt(x: number, y: number): number {
  const clamp = (v: number, max: number) => Math.min(max - 1, Math.max(0, v));
  const gx = clamp(Math.floor(x / (MAP_WIDTH / DISTRICT_GRID)), DISTRICT_GRID);
  const gy = clamp(Math.floor(y / (MAP_HEIGHT / DISTRICT_GRID)), DISTRICT_GRID);
  return gy * DISTRICT_GRID + gx;
}

/** Verkaufspreis eines Baggies an dieser Position (Basispreis × Distrikt-Faktor), ohne Revierkontrolle. */
export function baggiePriceAt(factors: number[], x: number, y: number): number {
  return Math.round(BAGGIE_PRICE_BASE * factors[districtIdAt(x, y)]!);
}

/**
 * M6: Verkaufspreis aus einem bereits aufgelösten Preisfaktor (z. B. dem `priceFactor` aus einem
 * `DistrictSnapshot`, der schon Random-Event-Effekte enthält) plus Revierkontrolle und Basispreis
 * der jeweiligen Droge. Die eigentliche Rechenlogik hinter `baggiePriceWithControl`.
 */
export function priceFromFactor(priceFactor: number, control: number, base: number = BAGGIE_PRICE_BASE): number {
  return Math.round(base * priceFactor * controlPriceMultiplier(control));
}

/** M5: Verkaufspreis inkl. Revierkontrolle (Rivalen drücken den Preis, wo sie stark sind). */
export function baggiePriceWithControl(
  factors: number[],
  control: number,
  x: number,
  y: number,
  base: number = BAGGIE_PRICE_BASE,
): number {
  return priceFromFactor(factors[districtIdAt(x, y)]!, control, base);
}
