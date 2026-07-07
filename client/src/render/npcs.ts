import { Container, Sprite } from "pixi.js";
import { TICK_MS, TILE_SIZE, type NpcSnapshot } from "@koks/shared";
import type { AvatarTextures, GameTextures } from "./assets.ts";

interface RenderedNpc {
  root: Container;
  sprite: Sprite;
  avatarSet: AvatarTextures;
  prevX: number;
  prevY: number;
  targetX: number;
  targetY: number;
  snapshotTime: number;
}

/** Passanten: wie Spieler interpoliert, halbtransparent während des Kauf-Cooldowns. */
export class NpcLayer {
  readonly container = new Container();
  private readonly npcs = new Map<string, RenderedNpc>();

  constructor(private readonly textures: GameTextures) {
    this.container.sortableChildren = true;
  }

  applySnapshot(snapshot: NpcSnapshot[], now: number): void {
    const seen = new Set<string>();
    for (const n of snapshot) {
      seen.add(n.id);
      const worldX = n.x * TILE_SIZE;
      const worldY = n.y * TILE_SIZE;
      let rn = this.npcs.get(n.id);
      if (!rn) {
        rn = this.createNpc(n, worldX, worldY);
        this.npcs.set(n.id, rn);
      }
      rn.prevX = rn.root.x;
      rn.prevY = rn.root.y;
      rn.targetX = worldX;
      rn.targetY = worldY;
      rn.snapshotTime = now;
      rn.sprite.texture = rn.avatarSet[n.dir];
      rn.sprite.alpha = n.cooldown > 0 ? 0.5 : 1;
    }
    for (const id of this.npcs.keys()) {
      if (!seen.has(id)) {
        this.npcs.get(id)!.root.destroy({ children: true });
        this.npcs.delete(id);
      }
    }
  }

  update(now: number): void {
    for (const rn of this.npcs.values()) {
      const t = Math.min(1, (now - rn.snapshotTime) / TICK_MS);
      rn.root.x = rn.prevX + (rn.targetX - rn.prevX) * t;
      rn.root.y = rn.prevY + (rn.targetY - rn.prevY) * t;
      rn.root.zIndex = rn.root.y;
    }
  }

  private createNpc(n: NpcSnapshot, x: number, y: number): RenderedNpc {
    const root = new Container();
    root.position.set(x, y);
    const avatarSet = this.textures.npcs[n.skin % this.textures.npcs.length]!;
    const sprite = new Sprite(avatarSet[n.dir]);
    sprite.anchor.set(0.5, 0.75);
    root.addChild(sprite);
    this.container.addChild(root);
    return { root, sprite, avatarSet, prevX: x, prevY: y, targetX: x, targetY: y, snapshotTime: 0 };
  }
}
