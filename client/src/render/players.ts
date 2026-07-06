import { Container, Sprite, Text } from "pixi.js";
import { TICK_MS, TILE_SIZE, type PlayerSnapshot } from "@koks/shared";
import type { AvatarTextures, GameTextures } from "./assets.ts";

interface RenderedPlayer {
  root: Container;
  sprite: Sprite;
  avatarSet: AvatarTextures;
  prevX: number;
  prevY: number;
  targetX: number;
  targetY: number;
  snapshotTime: number;
}

export class PlayerLayer {
  readonly container = new Container();
  private readonly players = new Map<string, RenderedPlayer>();

  constructor(private readonly textures: GameTextures) {
    this.container.sortableChildren = true;
  }

  applySnapshot(snapshot: PlayerSnapshot[], now: number): void {
    const seen = new Set<string>();
    for (const p of snapshot) {
      seen.add(p.id);
      const worldX = p.x * TILE_SIZE;
      const worldY = p.y * TILE_SIZE;
      let rp = this.players.get(p.id);
      if (!rp) {
        rp = this.createPlayer(p, worldX, worldY);
        this.players.set(p.id, rp);
      }
      rp.prevX = rp.root.x;
      rp.prevY = rp.root.y;
      rp.targetX = worldX;
      rp.targetY = worldY;
      rp.snapshotTime = now;
      rp.sprite.texture = rp.avatarSet[p.dir];
    }
    for (const id of this.players.keys()) {
      if (!seen.has(id)) this.remove(id);
    }
  }

  update(now: number): void {
    for (const rp of this.players.values()) {
      const t = Math.min(1, (now - rp.snapshotTime) / TICK_MS);
      rp.root.x = rp.prevX + (rp.targetX - rp.prevX) * t;
      rp.root.y = rp.prevY + (rp.targetY - rp.prevY) * t;
      rp.root.zIndex = rp.root.y;
    }
  }

  remove(id: string): void {
    const rp = this.players.get(id);
    if (rp) {
      rp.root.destroy({ children: true });
      this.players.delete(id);
    }
  }

  position(id: string): { x: number; y: number } | null {
    const rp = this.players.get(id);
    return rp ? { x: rp.root.x, y: rp.root.y } : null;
  }

  private createPlayer(p: PlayerSnapshot, x: number, y: number): RenderedPlayer {
    const root = new Container();
    root.position.set(x, y);

    const avatarSet = this.textures.avatars[p.avatar % this.textures.avatars.length]!;
    const sprite = new Sprite(avatarSet[p.dir]);
    sprite.anchor.set(0.5, 0.75);
    root.addChild(sprite);

    const label = new Text({
      text: p.name,
      style: {
        fontFamily: "sans-serif",
        fontSize: 5,
        fill: 0xffffff,
        stroke: { color: 0x14161c, width: 2 },
      },
    });
    label.anchor.set(0.5, 1);
    label.position.set(0, -TILE_SIZE * 0.85);
    root.addChild(label);

    this.container.addChild(root);
    return {
      root,
      sprite,
      avatarSet,
      prevX: x,
      prevY: y,
      targetX: x,
      targetY: y,
      snapshotTime: 0,
    };
  }
}
