import "./style.css";
import { Application, Container } from "pixi.js";
import {
  BUILDING_SPECS,
  TILE_SIZE,
  districtPriceFactors,
  generateCity,
  type BuildingSnapshot,
  type DistrictSnapshot,
  type NpcSnapshot,
  type PlayerSnapshot,
  type WorkerSnapshot,
} from "@koks/shared";
import { Connection } from "./net/connection.ts";
import { loadTextures } from "./render/assets.ts";
import { buildWorld } from "./render/world.ts";
import { PlayerLayer } from "./render/players.ts";
import { NpcLayer } from "./render/npcs.ts";
import { BuildingLayer } from "./render/buildings.ts";
import { WorkerLayer } from "./render/workers.ts";
import { Camera } from "./render/camera.ts";
import { attachControls } from "./input/controls.ts";
import { Hud } from "./ui/hud.ts";
import { Panels } from "./ui/panels.ts";
import { BuildMode } from "./ui/buildmode.ts";
import { LedgerScreen } from "./ui/ledger.ts";
import { InventoryScreen } from "./ui/inventory.ts";
import { SettingsScreen, loadPerfMode } from "./ui/settings.ts";

const NAME_KEY = "koks-name";

const overlay = document.getElementById("join-overlay")!;
const form = document.getElementById("join-form") as HTMLFormElement;
const nameInput = document.getElementById("name-input") as HTMLInputElement;
const joinButton = document.getElementById("join-button") as HTMLButtonElement;
const errorLine = document.getElementById("join-error")!;
const hudRoot = document.getElementById("hud")!;
const playerList = document.getElementById("player-list")!;
const reconnectBanner = document.getElementById("reconnect-banner")!;

const savedName = localStorage.getItem(NAME_KEY);
if (savedName) nameInput.value = savedName;

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
      localStorage.setItem(NAME_KEY, name);
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
  let myId = welcome.id;

  const app = new Application();
  await app.init({
    resizeTo: window,
    background: 0x14161c,
    antialias: false,
    resolution: loadPerfMode() ? 1 : window.devicePixelRatio || 1,
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
  const workers = new WorkerLayer(textures);
  worldRoot.addChild(workers.container);
  const players = new PlayerLayer(textures);
  worldRoot.addChild(players.container);
  const ghostLayer = new Container();
  worldRoot.addChild(ghostLayer);
  app.stage.addChild(worldRoot);

  const camera = new Camera();
  const hud = new Hud();
  const panels = new Panels((msg) => conn.send(msg), priceFactors);
  const ledger = new LedgerScreen((msg) => conn.send(msg), priceFactors);
  const inventory = new InventoryScreen();

  const leaveGame = (message: string): void => {
    conn.disconnect();
    started = false;
    panels.close();
    buildMode.cancel();
    ledger.close();
    inventory.close();
    settings.close();
    reconnectBanner.hidden = true;
    overlay.hidden = false;
    hudRoot.hidden = true;
    errorLine.textContent = message;
    app.destroy(true, { children: true });
  };
  const settings = new SettingsScreen(() => leaveGame(""));

  let latest: {
    players: PlayerSnapshot[];
    npcs: NpcSnapshot[];
    buildings: BuildingSnapshot[];
    workers: WorkerSnapshot[];
    districts: DistrictSnapshot[];
  } = {
    players: welcome.players,
    npcs: [],
    buildings: [],
    workers: [],
    districts: [],
  };
  const me = (): PlayerSnapshot | undefined => latest.players.find((p) => p.id === myId);

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
  (document.getElementById("ledger-button") as HTMLButtonElement).onclick = () => ledger.toggle();
  (document.getElementById("inventory-button") as HTMLButtonElement).onclick = () => inventory.toggle();
  (document.getElementById("settings-button") as HTMLButtonElement).onclick = () => settings.toggle();

  conn.onSnapshot = (msg) => {
    latest = {
      players: msg.players,
      npcs: msg.npcs,
      buildings: msg.buildings,
      workers: msg.workers,
      districts: msg.districts,
    };
    const now = performance.now();
    players.applySnapshot(msg.players, now);
    npcs.applySnapshot(msg.npcs, now);
    buildings.applySnapshot(msg.buildings);
    workers.applySnapshot(msg.workers, now);
    const my = me();
    if (my) hud.update(my);
    inventory.update(my);
    panels.setDistricts(msg.districts);
    panels.refresh(msg.buildings, msg.npcs, msg.workers, my);
    ledger.update({
      ledger: msg.ledger,
      workers: msg.workers,
      buildings: msg.buildings,
      me: my,
      districts: msg.districts,
      lifetimeProfit: msg.lifetimeProfit,
    });
    buildMode.refresh();
    updatePlayerList(msg.players, myId);
  };
  conn.onActionError = (reason) => hud.toast(reason, "error");
  conn.onSold = (price) => hud.toast(`Verkauft: +${price} € (schmutzig)`, "ok");
  conn.onLedgerHistory = (history) => ledger.setHistory(history);
  conn.onRaided = (_buildingId, buildingKind, lossValue) =>
    hud.toast(`Razzia im ${BUILDING_SPECS[buildingKind].name}: ${lossValue} € Warenverlust!`, "error");
  conn.onIntercepted = (_workerId, lossValue) =>
    hud.toast(`Kurier abgefangen: ${lossValue} € Warenverlust!`, "error");
  conn.onEvent = (_kind, text) => hud.toast(text, "info");
  conn.onReconnecting = (attempt) => {
    reconnectBanner.hidden = false;
    reconnectBanner.textContent =
      attempt === 1
        ? "Verbindung unterbrochen — verbinde erneut …"
        : `Verbindung unterbrochen — verbinde erneut … (Versuch ${attempt})`;
  };
  conn.onReconnected = (w) => {
    myId = w.id;
    reconnectBanner.hidden = true;
  };
  conn.onReconnectFailed = (reason) => leaveGame(`${reason} Bitte neu beitreten.`);

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
        panels.openBuilding(b, my, latest.buildings, latest.workers);
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
    onLedgerToggle: () => ledger.toggle(),
    onInventoryToggle: () => inventory.toggle(),
    onSettingsToggle: () => settings.toggle(),
    onEscape: () => {
      buildMode.cancel();
      panels.close();
      ledger.close();
      inventory.close();
      settings.close();
    },
  });

  app.ticker.add(() => {
    const now = performance.now();
    players.update(now);
    npcs.update(now);
    workers.update(now);
    camera.follow(players.position(myId));
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
