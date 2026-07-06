import { Container, Sprite, type Renderer, type Texture } from "pixi.js";
import { TILE_SIZE, Tile, tileAt, type CityMap } from "@koks/shared";
import type { GameTextures } from "./assets.ts";

const CHUNK_TILES = 48;

/**
 * Baut die statische Stadt als wenige große Chunk-Texturen zusammen —
 * so bleibt die Sprite-Anzahl klein genug fürs iPad.
 */
export function buildWorld(map: CityMap, textures: GameTextures, renderer: Renderer): Container {
  const world = new Container();

  const grassVariants = [
    textures.tiles.grass0,
    textures.tiles.grass1,
    textures.tiles.grass2,
    textures.tiles.grass3,
  ];

  const groundTexture = (x: number, y: number): Texture => {
    const tile = tileAt(map, x, y);
    switch (tile) {
      case Tile.Road:
        return textures.tiles.road;
      case Tile.Sidewalk:
        return textures.tiles.sidewalk;
      case Tile.Park:
        return grassVariants[(x * 7 + y * 13) % 4]!;
      case Tile.Building: {
        const below = tileAt(map, x, y + 1);
        return below === Tile.Building ? textures.tiles.roof : textures.tiles.brick;
      }
      default:
        return textures.tiles.lot;
    }
  };

  for (let cy = 0; cy < map.height; cy += CHUNK_TILES) {
    for (let cx = 0; cx < map.width; cx += CHUNK_TILES) {
      const chunk = new Container();
      const w = Math.min(CHUNK_TILES, map.width - cx);
      const h = Math.min(CHUNK_TILES, map.height - cy);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const sprite = new Sprite(groundTexture(cx + x, cy + y));
          sprite.position.set(x * TILE_SIZE, y * TILE_SIZE);
          chunk.addChild(sprite);
        }
      }
      const texture = renderer.generateTexture({ target: chunk, antialias: false });
      chunk.destroy({ children: true });
      const chunkSprite = new Sprite(texture);
      chunkSprite.position.set(cx * TILE_SIZE, cy * TILE_SIZE);
      world.addChild(chunkSprite);
    }
  }

  return world;
}
