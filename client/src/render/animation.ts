import type { Texture } from "pixi.js";
import type { AvatarFrames } from "./assets.ts";

/** Dauer eines Schritt-Frames in ms — ergibt ein zügiges, aber nicht hektisches Lauftempo. */
const STEP_MS = 160;

/** Stand-Frame, solange sich die Figur nicht bewegt; sonst alternierender 2-Schritt-Zyklus. */
export function walkFrame(frames: AvatarFrames, moving: boolean, now: number, offsetMs = 0): Texture {
  if (!moving) return frames[0];
  return Math.floor((now + offsetMs) / STEP_MS) % 2 === 0 ? frames[1] : frames[2];
}
