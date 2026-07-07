import { Container, Graphics, Sprite } from "pixi.js";
import {
  BAGGIES_PER_DRIED,
  BUILDING_SPECS,
  DRY_CAPACITY,
  DRY_TIME_S,
  GROW_TIME_S,
  HARVEST_YIELD,
  LAUNDER_SPECS,
  MAP_HEIGHT,
  MAP_WIDTH,
  PACK_TIME_S,
  TILE_SIZE,
  Tile,
  tileAt,
  type BuildingKind,
  type BuildingSnapshot,
  type CityMap,
  type ClientMessage,
} from "@koks/shared";
import type { GameTextures } from "../render/assets.ts";

export interface BuildModeDeps {
  map: CityMap;
  textures: GameTextures;
  /** Layer, in den der Bau-Geist gezeichnet wird (über den Gebäuden). */
  ghostLayer: Container;
  send: (msg: ClientMessage) => void;
  getBuildings: () => BuildingSnapshot[];
  getPlayerTile: () => { x: number; y: number } | null;
}

/** Kurzbeschreibung fürs Baumenü — reines Zahlenwerk aus den Konstanten. */
const BUILDING_INFO: Record<BuildingKind, string> = {
  growbox: `1 Samen → ${GROW_TIME_S} s → ${HARVEST_YIELD} Ernte`,
  trockenraum: `Ernte → ${DRY_TIME_S} s → getrocknet · Kapazität ${DRY_CAPACITY}`,
  packtisch: `1 getrocknet → ${PACK_TIME_S} s → ${BAGGIES_PER_DRIED} Baggies`,
  waschsalon: `Wäscht Geld: ${LAUNDER_SPECS.waschsalon.ratePerS} €/s · ${Math.round(LAUNDER_SPECS.waschsalon.feePct * 100)} % Gebühr · max. ${LAUNDER_SPECS.waschsalon.queueMax} € Warteschlange`,
  bar: `Wäscht Geld: ${LAUNDER_SPECS.bar.ratePerS} €/s · ${Math.round(LAUNDER_SPECS.bar.feePct * 100)} % Gebühr · max. ${LAUNDER_SPECS.bar.queueMax} € Warteschlange`,
};

/**
 * Baumodus: B/Button öffnet das Menü, Auswahl aktiviert den Geist.
 * Tippen setzt den Geist (grün/rot), Bauen/Abbrechen sind explizite Buttons.
 */
export class BuildMode {
  private selected: BuildingKind | null = null;
  private ghost: Container | null = null;
  private ghostRect = new Graphics();
  private pos: { x: number; y: number } | null = null;
  private valid = false;

  private readonly menu = document.getElementById("build-menu")!;
  private readonly bar = document.getElementById("build-bar")!;
  private readonly barInfo = document.getElementById("build-bar-info")!;
  private readonly confirmBtn = document.getElementById("build-confirm") as HTMLButtonElement;

  constructor(private readonly deps: BuildModeDeps) {
    // replaceChildren/onclick statt append/addEventListener: bei Rejoin keine Duplikate
    const options = document.getElementById("build-options")!;
    options.replaceChildren();
    for (const [kind, spec] of Object.entries(BUILDING_SPECS) as [BuildingKind, (typeof BUILDING_SPECS)["growbox"]][]) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "action-btn build-option";
      btn.innerHTML = `<strong>${spec.name}</strong> · ${spec.cost} € · ${spec.w}×${spec.h}<br><small>${BUILDING_INFO[kind]}</small>`;
      btn.onclick = () => this.select(kind);
      options.appendChild(btn);
    }
    (document.getElementById("build-menu-close") as HTMLButtonElement).onclick = () => this.closeMenu();
    (document.getElementById("build-cancel") as HTMLButtonElement).onclick = () => this.cancel();
    this.confirmBtn.onclick = () => this.confirm();
    this.menu.hidden = true;
    this.bar.hidden = true;
  }

  isPlacing(): boolean {
    return this.selected !== null;
  }

  toggleMenu(): void {
    if (this.selected !== null) {
      this.cancel();
      return;
    }
    if (this.menu.hidden) this.openMenu();
    else this.closeMenu();
  }

  openMenu(): void {
    this.menu.hidden = false;
  }

  closeMenu(): void {
    this.menu.hidden = true;
  }

  /** Escape/Abbrechen: Menü und Geist schließen. */
  cancel(): void {
    this.closeMenu();
    this.selected = null;
    this.pos = null;
    if (this.ghost) {
      this.ghost.destroy({ children: true });
      this.ghost = null;
    }
    this.bar.hidden = true;
  }

  /** Tap im Baumodus: Geist auf das angetippte Tile setzen. */
  placeAt(tileX: number, tileY: number): void {
    if (this.selected === null) return;
    const spec = BUILDING_SPECS[this.selected];
    this.pos = {
      x: Math.max(0, Math.min(MAP_WIDTH - spec.w, tileX)),
      y: Math.max(0, Math.min(MAP_HEIGHT - spec.h, tileY)),
    };
    this.refresh();
  }

  /** Nach jedem Snapshot aufrufen — Gebäude anderer Spieler können Flächen belegen. */
  refresh(): void {
    if (this.selected === null || this.pos === null || !this.ghost) return;
    const spec = BUILDING_SPECS[this.selected];
    this.valid = this.checkFree(this.pos.x, this.pos.y, spec.w, spec.h);
    this.ghost.position.set(this.pos.x * TILE_SIZE, this.pos.y * TILE_SIZE);
    this.ghost.visible = true;
    this.ghostRect.clear();
    this.ghostRect
      .rect(0, 0, spec.w * TILE_SIZE, spec.h * TILE_SIZE)
      .fill({ color: this.valid ? 0x2ecc71 : 0xe74c3c, alpha: 0.35 })
      .stroke({ color: this.valid ? 0x2ecc71 : 0xe74c3c, width: 1 });
    this.confirmBtn.disabled = !this.valid;
    this.barInfo.textContent = this.valid
      ? `${spec.name} hier bauen? (${spec.cost} €)`
      : `${spec.name}: Fläche nicht frei — freies Grundstück antippen`;
  }

  private select(kind: BuildingKind): void {
    this.closeMenu();
    this.selected = kind;
    this.buildGhost(kind);
    const p = this.deps.getPlayerTile();
    const spec = BUILDING_SPECS[kind];
    this.pos = p
      ? {
          x: Math.max(0, Math.min(MAP_WIDTH - spec.w, p.x - 1)),
          y: Math.max(0, Math.min(MAP_HEIGHT - spec.h, p.y - spec.h - 1)),
        }
      : { x: Math.floor(MAP_WIDTH / 2), y: Math.floor(MAP_HEIGHT / 2) };
    this.bar.hidden = false;
    this.refresh();
  }

  private confirm(): void {
    if (this.selected === null || this.pos === null || !this.valid) return;
    this.deps.send({ t: "build", kind: this.selected, x: this.pos.x, y: this.pos.y });
    this.cancel();
  }

  private buildGhost(kind: BuildingKind): void {
    if (this.ghost) this.ghost.destroy({ children: true });
    const tex = this.deps.textures.building;
    const ghost = new Container();
    const put = (texture: Sprite["texture"], tx: number, ty: number) => {
      const s = new Sprite(texture);
      s.position.set(tx * TILE_SIZE, ty * TILE_SIZE);
      s.alpha = 0.8;
      ghost.addChild(s);
    };
    switch (kind) {
      case "growbox":
        put(tex.bed[0], 0, 0);
        put(tex.bed[1], 1, 0);
        put(tex.bed[2], 0, 1);
        put(tex.bed[3], 1, 1);
        break;
      case "trockenraum":
        for (let ty = 0; ty < 2; ty++) for (let tx = 0; tx < 2; tx++) put(tex.floor, tx, ty);
        put(tex.lineEmpty[0], 0, 0.35);
        put(tex.lineEmpty[1], 1, 0.35);
        break;
      case "packtisch":
      case "waschsalon":
      case "bar":
        for (let ty = 0; ty < 2; ty++) for (let tx = 0; tx < 2; tx++) put(tex.floor, tx, ty);
        put(tex.counter[0], 0, 0.7);
        put(tex.counter[1], 1, 0.7);
        break;
    }
    this.ghostRect = new Graphics();
    ghost.addChild(this.ghostRect);
    ghost.visible = false;
    this.deps.ghostLayer.addChild(ghost);
    this.ghost = ghost;
  }

  /** Gleiche Prüfung wie der Server: alle Tiles freies Grundstück, kein Gebäude darauf. */
  private checkFree(x: number, y: number, w: number, h: number): boolean {
    for (let ty = y; ty < y + h; ty++) {
      for (let tx = x; tx < x + w; tx++) {
        if (tileAt(this.deps.map, tx, ty) !== Tile.Lot) return false;
      }
    }
    for (const b of this.deps.getBuildings()) {
      const spec = BUILDING_SPECS[b.kind];
      if (x < b.x + spec.w && x + w > b.x && y < b.y + spec.h && y + h > b.y) return false;
    }
    return true;
  }
}
