import { Container, Sprite, Text } from "pixi.js";
import { BUILDING_SPECS, TILE_SIZE, type BuildingSnapshot } from "@koks/shared";
import type { GameTextures } from "./assets.ts";

interface RenderedBuilding {
  root: Container;
  /** Growbox: Pflanzen-Sprite (Textur wechselt mit der Wachstumsstufe) */
  plant: Sprite | null;
  /** Trockenraum: die zwei Leinen-Sprites (leer/behängt) */
  line: [Sprite, Sprite] | null;
  label: Text;
}

/** Zeichnet die Gebäude aus dem Server-Snapshot (2×2 Tiles + Status-Text). */
export class BuildingLayer {
  readonly container = new Container();
  private readonly buildings = new Map<string, RenderedBuilding>();

  constructor(private readonly textures: GameTextures) {}

  applySnapshot(snapshot: BuildingSnapshot[]): void {
    const seen = new Set<string>();
    for (const b of snapshot) {
      seen.add(b.id);
      let rb = this.buildings.get(b.id);
      if (!rb) {
        rb = this.createBuilding(b);
        this.buildings.set(b.id, rb);
      }
      this.updateBuilding(rb, b);
    }
    for (const id of this.buildings.keys()) {
      if (!seen.has(id)) {
        this.buildings.get(id)!.root.destroy({ children: true });
        this.buildings.delete(id);
      }
    }
  }

  private createBuilding(b: BuildingSnapshot): RenderedBuilding {
    const tex = this.textures.building;
    const root = new Container();
    root.position.set(b.x * TILE_SIZE, b.y * TILE_SIZE);

    const put = (texture: Sprite["texture"], tx: number, ty: number): Sprite => {
      const s = new Sprite(texture);
      s.position.set(tx * TILE_SIZE, ty * TILE_SIZE);
      root.addChild(s);
      return s;
    };

    let plant: Sprite | null = null;
    let line: [Sprite, Sprite] | null = null;

    switch (b.kind) {
      case "growbox": {
        put(tex.bed[0], 0, 0);
        put(tex.bed[1], 1, 0);
        put(tex.bed[2], 0, 1);
        put(tex.bed[3], 1, 1);
        plant = new Sprite(tex.plantStages[0]);
        plant.anchor.set(0.5, 0.7);
        plant.scale.set(1.5);
        plant.position.set(TILE_SIZE, TILE_SIZE);
        plant.visible = false;
        root.addChild(plant);
        break;
      }
      case "trockenraum": {
        for (let ty = 0; ty < 2; ty++) for (let tx = 0; tx < 2; tx++) put(tex.floor, tx, ty);
        line = [put(tex.lineEmpty[0], 0, 0.35), put(tex.lineEmpty[1], 1, 0.35)];
        break;
      }
      case "packtisch":
      case "waschsalon":
      case "bar":
      case "labor": {
        for (let ty = 0; ty < 2; ty++) for (let tx = 0; tx < 2; tx++) put(tex.floor, tx, ty);
        put(tex.counter[0], 0, 0.7);
        put(tex.counter[1], 1, 0.7);
        // Ein Requisit je Gebäudeart, damit die vier sonst identischen Theken-Bauten optisch unterscheidbar sind.
        const prop = {
          packtisch: tex.produceCrate,
          waschsalon: tex.washer,
          bar: tex.bottleShelf,
          labor: tex.stove,
        }[b.kind];
        put(prop, 0.5, 0.05);
        break;
      }
    }

    const label = new Text({
      text: "",
      style: {
        fontFamily: "sans-serif",
        fontSize: 5,
        fill: 0xffffff,
        stroke: { color: 0x14161c, width: 2 },
      },
    });
    label.anchor.set(0.5, 1);
    label.position.set(TILE_SIZE, -1);
    root.addChild(label);

    this.container.addChild(root);
    return { root, plant, line, label };
  }

  private updateBuilding(rb: RenderedBuilding, b: BuildingSnapshot): void {
    const tex = this.textures.building;
    switch (b.kind) {
      case "growbox": {
        if (b.plant === null) {
          rb.plant!.visible = false;
          rb.label.text = "Growbox · leer";
        } else {
          const stage = b.plant >= 1 ? 3 : Math.floor(b.plant * 3);
          rb.plant!.visible = true;
          rb.plant!.texture = tex.plantStages[stage]!;
          rb.label.text = b.plant >= 1 ? "Growbox · REIF" : `Growbox · ${Math.round(b.plant * 100)} %`;
        }
        break;
      }
      case "trockenraum": {
        const busy = b.drying.length > 0 || b.dried > 0;
        rb.line![0].texture = busy ? tex.lineFull[0] : tex.lineEmpty[0];
        rb.line![1].texture = busy ? tex.lineFull[1] : tex.lineEmpty[1];
        rb.label.text =
          b.drying.length === 0 && b.dried === 0
            ? "Trockenraum · leer"
            : `Trockenraum · ${b.drying.length} trocknet · ${b.dried} fertig`;
        break;
      }
      case "packtisch": {
        const inWork = b.queue + (b.packing === null ? 0 : 1);
        rb.label.text =
          inWork === 0 && b.baggies === 0
            ? "Packtisch · leer"
            : `Packtisch · ${inWork} offen · ${b.baggies} Baggies`;
        break;
      }
      case "waschsalon":
      case "bar": {
        const name = BUILDING_SPECS[b.kind].name;
        rb.label.text = b.queued === 0 ? `${name} · leer` : `${name} · ${b.queued} € wartend`;
        break;
      }
      case "labor": {
        rb.label.text =
          b.cook === null
            ? `Labor · ${b.store} Meth`
            : b.cook >= 1
              ? "Labor · Charge fertig!"
              : `Labor · kocht ${Math.round(b.cook * 100)} %`;
        break;
      }
    }
  }
}
