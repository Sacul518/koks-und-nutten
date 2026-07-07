import "./style.css";
import { Application, Container } from "pixi.js";
import {
  BUILDING_SPECS,
  TILE_SIZE,
  districtPriceFactors,
  generateCity,
  type BuildingSnapshot,
  type NpcSnapshot,
  type PlayerSnapshot,
} from "@koks/shared";
import { Connection } from "./net/connection.ts";
import { loadTextures } from "./render/assets.ts";
import { buildWorld } from "./render/world.ts";
import { PlayerLayer } from "./render/players.ts";
import { NpcLayer } from "./render/npcs.ts";
import { BuildingLayer } from "./render/buildings.ts";
import { Camera } from "./render/camera.ts";
import { attachControls } from "./input/controls.ts";
import { Hud } from "./ui/hud.ts";
import { Panels } from "./ui/panels.ts";
import { BuildMode } from "./ui/buildmode.ts";

const overlay = document.getElementById("join-overlay")!;
const form = document.getElementById("join-form") as HTMLFormElement;
const nameInput = document.getElementById("name-input") as HTMLInputElement;
const joinButton = document.getElementById("join-button") as HTMLButtonElement;
const errorLine = document.getElementById("join-error")!;
const hudRoot = document.getElementById("hud")!;
const playerList = document.getElementById("player-list")!;

let started = false;

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const name = nameInput.value.trim();
  if (!name || started) return;
  errorLine.textContent = "";
  joinButton.disabled = true;
  startGame(name)
    .then(() => {
      started = true;
      overlay.hidden = true;
      hudRoot.hidden = false;
    })
    .catch((err: Error) => {
      errorLine.textContent = err.message;
    })
    .finally(() => {
      joinButton.disabled = false;
    });
});

async function startGame(name: string): Promise<void> {
  const conn = new Connection();
  const welcome = await conn.join(name);

  const app = new Application();
  await app.init({
    resizeTo: window,
    background: 0x14161c,
    antialias: false,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
  });
  document.getElementById("game")!.appendChild(app.canvas);

  const textures = await loadTextures();
  const map = generateCity(welcome.seed);
  const priceFactors = districtPriceFactors(welcome.seed);

  const worldRoot = new Container();
  worldRoot.addChild(buildWorld(map, textures, app.renderer));
  const buildings = new BuildingLayer(textures);
  worldRoot.addChild(buildings.container);
  const npcs = new NpcLayer(textures);
  worldRoot.addChild(npcs.container);
  const players = new PlayerLayer(textures);
  worldRoot.addChild(players.container);
  const ghostLayer = new Container();
  worldRoot.addChild(ghostLayer);
  app.stage.addChild(worldRoot);

  const camera = new Camera();
  const hud = new Hud();
  const panels = new Panels((msg) => conn.send(msg), priceFactors);

  let latest: { players: PlayerSnapshot[]; npcs: NpcSnapshot[]; buildings: BuildingSnapshot[] } = {
    players: welcome.players,
    npcs: [],
    buildings: [],
  };
  const me = (): PlayerSnapshot | undefined => latest.players.find((p) => p.id === welcome.id);

  const buildMode = new BuildMode({
    map,
    textures,
    ghostLayer,
    send: (msg) => conn.send(msg),
    getBuildings: () => latest.buildings,
    getPlayerTile: () => {
      const p = me();
      return p ? { x: Math.floor(p.x), y: Math.floor(p.y) } : null;
    },
  });
  (document.getElementById("build-button") as HTMLButtonElement).onclick = () => buildMode.toggleMenu();

  conn.onSnapshot = (msg) => {
    latest = { players: msg.players, npcs: msg.npcs, buildings: msg.buildings };
    const now = performance.now();
    players.applySnapshot(msg.players, now);
    npcs.applySnapshot(msg.npcs, now);
    buildings.applySnapshot(msg.buildings);
    const my = me();
    if (my) hud.update(my);
    panels.refresh(msg.buildings, msg.npcs, my);
    buildMode.refresh();
    updatePlayerList(msg.players, welcome.id);
  };
  conn.onActionError = (reason) => hud.toast(reason, "error");
  conn.onSold = (price) => hud.toast(`Verkauft: +${price} € (schmutzig)`, "ok");
  conn.onDisconnect = () => {
    started = false;
    panels.close();
    buildMode.cancel();
    overlay.hidden = false;
    hudRoot.hidden = true;
    errorLine.textContent = "Verbindung zum Server verloren. Bitte neu beitreten.";
    app.destroy(true, { children: true });
  };

  const npcAt = (tx: number, ty: number): NpcSnapshot | null => {
    let best: NpcSnapshot | null = null;
    let bestDist = 0.8;
    for (const n of latest.npcs) {
      const d = Math.hypot(n.x - tx, n.y - ty);
      if (d < bestDist) {
        best = n;
        bestDist = d;
      }
    }
    return best;
  };
  const buildingAt = (tx: number, ty: number): BuildingSnapshot | null => {
    for (const b of latest.buildings) {
      const spec = BUILDING_SPECS[b.kind];
      if (tx >= b.x && tx < b.x + spec.w && ty >= b.y && ty < b.y + spec.h) return b;
    }
    return null;
  };

  attachControls(app.canvas, {
    onTap: (screenX, screenY) => {
      const world = camera.screenToWorld(screenX, screenY, app.screen.width, app.screen.height);
      const tx = world.x / TILE_SIZE;
      const ty = world.y / TILE_SIZE;
      if (buildMode.isPlacing()) {
        buildMode.placeAt(Math.floor(tx), Math.floor(ty));
        return;
      }
      buildMode.closeMenu();
      const my = me();
      const npc = npcAt(tx, ty);
      if (npc && my) {
        panels.openNpc(npc, my);
        return;
      }
      const b = buildingAt(Math.floor(tx), Math.floor(ty));
      if (b && my) {
        panels.openBuilding(b, my);
        return;
      }
      panels.close();
      conn.send({ t: "moveTo", x: tx, y: ty });
    },
    onPan: (dx, dy) => camera.panBy(dx, dy),
    onZoom: (factor, cx, cy) => camera.zoomAt(factor, cx, cy, app.screen.width, app.screen.height),
    onDirChange: (dx, dy) => conn.send({ t: "input", dx, dy }),
    onSprintChange: (on) => conn.send({ t: "sprint", on }),
    onRecenter: () => camera.recenter(),
    onBuildToggle: () => buildMode.toggleMenu(),
    onEscape: () => {
      buildMode.cancel();
      panels.close();
    },
  });

  app.ticker.add(() => {
    const now = performance.now();
    players.update(now);
    npcs.update(now);
    camera.follow(players.position(welcome.id));
    camera.apply(worldRoot, app.screen.width, app.screen.height);
  });
}

function updatePlayerList(players: PlayerSnapshot[], myId: string): void {
  playerList.innerHTML = players
    .map((p) => `${p.id === myId ? "▶ " : ""}${escapeHtml(p.name)}`)
    .join("<br>");
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
