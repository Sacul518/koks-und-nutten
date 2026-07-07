import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { START_MONEY_CLEAN, START_MONEY_DIRTY, isBuildingKind, type Inventory } from "@koks/shared";
import type { SavedBuilding, SavedPlayer } from "../game/Game.ts";

/** Bei Format-Änderungen hochzählen und in migrate() einen Schritt ergänzen. */
export const SAVE_VERSION = 2;

export const AUTOSAVE_INTERVAL_MS = 5 * 60_000;

const BACKUP_COUNT = 5;

export interface SaveGame {
  saveVersion: number;
  /** ISO-Zeitstempel des Speicherzeitpunkts */
  savedAt: string;
  seed: number;
  players: SavedPlayer[];
  buildings: SavedBuilding[];
}

/**
 * Schreibt und liest den Spielstand als JSON in `dir`.
 * Schreiben ist atomar (tmp-Datei + rename), vor jedem Überschreiben wandert
 * der alte Stand in rotierende Backups (backup-1 = neuestes, backup-5 fliegt raus).
 */
export class SaveManager {
  readonly file: string;
  lastSaveAt: Date | null = null;

  constructor(readonly dir: string) {
    this.file = path.join(dir, "spielstand.json");
  }

  /** Lädt den aktuellen Spielstand, bei Lesefehlern der Reihe nach die Backups. */
  load(): SaveGame | null {
    const candidates = [this.file];
    for (let n = 1; n <= BACKUP_COUNT; n++) candidates.push(this.backupFile(n));

    for (const file of candidates) {
      if (!existsSync(file)) continue;
      try {
        const save = validateSave(JSON.parse(readFileSync(file, "utf8")));
        if (file !== this.file) {
          console.warn(`[save] ${path.basename(this.file)} unbrauchbar, Backup geladen: ${path.basename(file)}`);
        }
        this.lastSaveAt = new Date(save.savedAt);
        return save;
      } catch (err) {
        console.warn(`[save] ${path.basename(file)} nicht ladbar: ${(err as Error).message}`);
      }
    }
    return null;
  }

  save(data: Omit<SaveGame, "saveVersion" | "savedAt">): SaveGame {
    mkdirSync(this.dir, { recursive: true });
    const full: SaveGame = {
      saveVersion: SAVE_VERSION,
      savedAt: new Date().toISOString(),
      ...data,
    };
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(full, null, 2));
    this.rotateBackups();
    renameSync(tmp, this.file);
    this.lastSaveAt = new Date(full.savedAt);
    return full;
  }

  private backupFile(n: number): string {
    return path.join(this.dir, `spielstand.backup-${n}.json`);
  }

  private rotateBackups(): void {
    if (!existsSync(this.file)) return;
    const oldest = this.backupFile(BACKUP_COUNT);
    if (existsSync(oldest)) unlinkSync(oldest);
    for (let n = BACKUP_COUNT - 1; n >= 1; n--) {
      if (existsSync(this.backupFile(n))) renameSync(this.backupFile(n), this.backupFile(n + 1));
    }
    renameSync(this.file, this.backupFile(1));
  }
}

function validateSave(data: unknown): SaveGame {
  if (typeof data !== "object" || data === null) throw new Error("kein Objekt");
  let d = data as Record<string, unknown>;
  if (typeof d.saveVersion !== "number") throw new Error("saveVersion fehlt");
  if (d.saveVersion > SAVE_VERSION) {
    throw new Error(`saveVersion ${d.saveVersion} ist neuer als der Server (${SAVE_VERSION})`);
  }
  if (d.saveVersion < SAVE_VERSION) d = migrate(d);
  if (typeof d.seed !== "number") throw new Error("seed fehlt");
  if (typeof d.savedAt !== "string") throw new Error("savedAt fehlt");
  const players = Array.isArray(d.players) ? d.players.filter(isSavedPlayer) : [];
  const buildings = Array.isArray(d.buildings) ? d.buildings.filter(isSavedBuilding) : [];
  return {
    saveVersion: SAVE_VERSION,
    savedAt: d.savedAt,
    seed: d.seed,
    players,
    buildings,
  };
}

/** Migrationskette: hebt ältere Spielstände Schritt für Schritt auf SAVE_VERSION. */
function migrate(d: Record<string, unknown>): Record<string, unknown> {
  const from = d.saveVersion;
  if (d.saveVersion === 1) {
    // v1 → v2: Geld + Inventar pro Spieler (Startwerte), leere Gebäudeliste.
    d.players = (Array.isArray(d.players) ? d.players : []).map((p) => ({
      moneyClean: START_MONEY_CLEAN,
      moneyDirty: START_MONEY_DIRTY,
      inv: { seeds: 0, harvest: 0, dried: 0, baggies: 0 },
      ...(p as Record<string, unknown>),
    }));
    d.buildings = [];
    d.saveVersion = 2;
  }
  console.log(`[save] Spielstand von v${String(from)} auf v${String(d.saveVersion)} migriert`);
  return d;
}

function isSavedPlayer(p: unknown): p is SavedPlayer {
  if (typeof p !== "object" || p === null) return false;
  const d = p as Record<string, unknown>;
  return (
    typeof d.name === "string" &&
    typeof d.x === "number" &&
    typeof d.y === "number" &&
    typeof d.avatar === "number" &&
    (d.dir === "up" || d.dir === "down" || d.dir === "left" || d.dir === "right") &&
    typeof d.moneyClean === "number" &&
    typeof d.moneyDirty === "number" &&
    isInventory(d.inv)
  );
}

function isInventory(inv: unknown): inv is Inventory {
  if (typeof inv !== "object" || inv === null) return false;
  const d = inv as Record<string, unknown>;
  return (
    typeof d.seeds === "number" &&
    typeof d.harvest === "number" &&
    typeof d.dried === "number" &&
    typeof d.baggies === "number"
  );
}

function isSavedBuilding(b: unknown): b is SavedBuilding {
  if (typeof b !== "object" || b === null) return false;
  const d = b as Record<string, unknown>;
  return (
    typeof d.id === "string" &&
    isBuildingKind(d.kind) &&
    typeof d.x === "number" &&
    typeof d.y === "number" &&
    typeof d.owner === "string" &&
    (d.plantProgress === null || typeof d.plantProgress === "number") &&
    Array.isArray(d.drying) &&
    d.drying.every((v) => typeof v === "number") &&
    typeof d.dried === "number" &&
    typeof d.packQueue === "number" &&
    (d.packProgress === null || typeof d.packProgress === "number") &&
    typeof d.baggies === "number"
  );
}
