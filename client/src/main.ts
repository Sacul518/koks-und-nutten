import "./style.css";
import { Application, Container } from "pixi.js";
import { TILE_SIZE, generateCity, type PlayerSnapshot } from "@koks/shared";
import { Connection } from "./net/connection.ts";
import { loadTextures } from "./render/assets.ts";
import { buildWorld } from "./render/world.ts";
import { PlayerLayer } from "./render/players.ts";
import { Camera } from "./render/camera.ts";
import { attachControls } from "./input/controls.ts";

const overlay = document.getElementById("join-overlay")!;
const form = document.getElementById("join-form") as HTMLFormElement;
const nameInput = document.getElementById("name-input") as HTMLInputElement;
const joinButton = document.getElementById("join-button") as HTMLButtonElement;
const errorLine = document.getElementById("join-error")!;
const hud = document.getElementById("hud")!;
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
      hud.hidden = false;
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

  const worldRoot = new Container();
  worldRoot.addChild(buildWorld(map, textures, app.renderer));
  const players = new PlayerLayer(textures);
  worldRoot.addChild(players.container);
  app.stage.addChild(worldRoot);

  const camera = new Camera();

  conn.onSnapshot = (msg) => {
    players.applySnapshot(msg.players, performance.now());
    updatePlayerList(msg.players, welcome.id);
  };
  conn.onDisconnect = () => {
    started = false;
    overlay.hidden = false;
    hud.hidden = true;
    errorLine.textContent = "Verbindung zum Server verloren. Bitte neu beitreten.";
    app.destroy(true, { children: true });
  };

  attachControls(app.canvas, {
    onTap: (screenX, screenY) => {
      const world = camera.screenToWorld(screenX, screenY, app.screen.width, app.screen.height);
      conn.send({ t: "moveTo", x: world.x / TILE_SIZE, y: world.y / TILE_SIZE });
    },
    onPan: (dx, dy) => camera.panBy(dx, dy),
    onZoom: (factor, cx, cy) => camera.zoomAt(factor, cx, cy, app.screen.width, app.screen.height),
    onDirChange: (dx, dy) => conn.send({ t: "input", dx, dy }),
    onSprintChange: (on) => conn.send({ t: "sprint", on }),
    onRecenter: () => camera.recenter(),
  });

  app.ticker.add(() => {
    players.update(performance.now());
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
