import { Container, Sprite, Text } from "pixi.js";
import { TICK_MS, TILE_SIZE, WORKER_SPECS, type WorkerKind, type WorkerSnapshot } from "@koks/shared";
import type { AvatarTextures, GameTextures } from "./assets.ts";

/** Einfärbung + Sprite-Set je Beruf (Figuren-Zeilen 12/15 teilen sie sich mit den Passanten). */
const WORKER_LOOK: Record<WorkerKind, { tint: number; skin: number }> = {
  gaertner: { tint: 0x7ee08a, skin: 0 },
  kurier: { tint: 0x8ab4ff, skin: 1 },
  dealer: { tint: 0xf0b060, skin: 0 },
};

interface RenderedWorker {
  root: Container;
  sprite: Sprite;
  label: Text;
  avatarSet: AvatarTextures;
  prevX: number;
  prevY: number;
  targetX: number;
  targetY: number;
  snapshotTime: number;
}

/** Arbeiter: wie NPCs interpoliert, per Tint + Berufs-Label unterscheidbar, halbtransparent wenn pausiert. */
export class WorkerLayer {
  readonly container = new Container();
  private readonly workers = new Map<string, RenderedWorker>();

  constructor(private readonly textures: GameTextures) {
    this.container.sortableChildren = true;
  }

  applySnapshot(snapshot: WorkerSnapshot[], now: number): void {
    const seen = new Set<string>();
    for (const w of snapshot) {
      seen.add(w.id);
      const worldX = w.x * TILE_SIZE;
      const worldY = w.y * TILE_SIZE;
      let rw = this.workers.get(w.id);
      if (!rw) {
        rw = this.createWorker(w, worldX, worldY);
        this.workers.set(w.id, rw);
      }
      rw.prevX = rw.root.x;
      rw.prevY = rw.root.y;
      rw.targetX = worldX;
      rw.targetY = worldY;
      rw.snapshotTime = now;
      rw.sprite.texture = rw.avatarSet[w.dir];
      rw.root.alpha = w.paused ? 0.45 : 1;
      rw.label.text = w.paused ? `${WORKER_SPECS[w.kind].name} · Pause` : WORKER_SPECS[w.kind].name;
    }
    for (const id of this.workers.keys()) {
      if (!seen.has(id)) {
        this.workers.get(id)!.root.destroy({ children: true });
        this.workers.delete(id);
      }
    }
  }

  update(now: number): void {
    for (const rw of this.workers.values()) {
      const t = Math.min(1, (now - rw.snapshotTime) / TICK_MS);
      rw.root.x = rw.prevX + (rw.targetX - rw.prevX) * t;
      rw.root.y = rw.prevY + (rw.targetY - rw.prevY) * t;
      rw.root.zIndex = rw.root.y;
    }
  }

  private createWorker(w: WorkerSnapshot, x: number, y: number): RenderedWorker {
    const root = new Container();
    root.position.set(x, y);
    const look = WORKER_LOOK[w.kind];
    const avatarSet = this.textures.npcs[look.skin % this.textures.npcs.length]!;
    const sprite = new Sprite(avatarSet[w.dir]);
    sprite.anchor.set(0.5, 0.75);
    sprite.tint = look.tint;
    root.addChild(sprite);

    const label = new Text({
      text: WORKER_SPECS[w.kind].name,
      style: {
        fontFamily: "sans-serif",
        fontSize: 5,
        fill: look.tint,
        stroke: { color: 0x14161c, width: 2 },
      },
    });
    label.anchor.set(0.5, 1);
    label.position.set(0, -TILE_SIZE * 0.85);
    root.addChild(label);

    this.container.addChild(root);
    return { root, sprite, label, avatarSet, prevX: x, prevY: y, targetX: x, targetY: y, snapshotTime: 0 };
  }
}
