import type { Container } from "pixi.js";
import { MAP_HEIGHT, MAP_WIDTH, TILE_SIZE } from "@koks/shared";

const MIN_SCALE = 1.25;
const MAX_SCALE = 6;

export class Camera {
  /** Kameramittelpunkt in Welt-Pixeln */
  x = (MAP_WIDTH * TILE_SIZE) / 2;
  y = (MAP_HEIGHT * TILE_SIZE) / 2;
  scale = 2.5;
  following = true;

  follow(target: { x: number; y: number } | null): void {
    if (!this.following || !target) return;
    // sanft nachziehen, damit die Kamera nicht ruckt
    this.x += (target.x - this.x) * 0.15;
    this.y += (target.y - this.y) * 0.15;
  }

  recenter(): void {
    this.following = true;
  }

  panBy(screenDx: number, screenDy: number): void {
    this.following = false;
    this.x -= screenDx / this.scale;
    this.y -= screenDy / this.scale;
    this.clamp();
  }

  zoomAt(factor: number, screenX: number, screenY: number, screenW: number, screenH: number): void {
    const worldX = this.x + (screenX - screenW / 2) / this.scale;
    const worldY = this.y + (screenY - screenH / 2) / this.scale;
    this.scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, this.scale * factor));
    this.x = worldX - (screenX - screenW / 2) / this.scale;
    this.y = worldY - (screenY - screenH / 2) / this.scale;
    this.clamp();
  }

  screenToWorld(screenX: number, screenY: number, screenW: number, screenH: number): { x: number; y: number } {
    return {
      x: this.x + (screenX - screenW / 2) / this.scale,
      y: this.y + (screenY - screenH / 2) / this.scale,
    };
  }

  apply(world: Container, screenW: number, screenH: number): void {
    this.clamp();
    world.scale.set(this.scale);
    world.position.set(screenW / 2 - this.x * this.scale, screenH / 2 - this.y * this.scale);
  }

  private clamp(): void {
    const margin = TILE_SIZE * 4;
    this.x = Math.min(MAP_WIDTH * TILE_SIZE + margin, Math.max(-margin, this.x));
    this.y = Math.min(MAP_HEIGHT * TILE_SIZE + margin, Math.max(-margin, this.y));
  }
}
