import { createServer } from "node:http";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { WebSocketServer, type WebSocket } from "ws";
import {
  DEFAULT_PORT,
  PROTOCOL_VERSION,
  parseClientMessage,
  type ServerMessage,
} from "@koks/shared";
import { Game, type GamePlayer } from "./game/Game.ts";
import { AUTOSAVE_INTERVAL_MS, SaveManager } from "./persistence/SaveManager.ts";
import { createAdminRouter } from "./admin/router.ts";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(dirname, "../../client/dist");

const port = Number(process.env.PORT ?? DEFAULT_PORT);
// Default fürs LAN — auf dem Pi setzt die systemd-Unit ein eigenes Passwort.
const adminPassword = process.env.ADMIN_PASSWORD ?? "koks-admin";
const shutdownEnabled = process.env.SHUTDOWN_ENABLED === "1";

const saves = new SaveManager(process.env.SAVE_DIR ?? path.resolve(dirname, "../../saves"));
const loadedSave = saves.load();
// Der Seed aus dem Save gewinnt, damit die Karte nach einem Neustart identisch ist.
const seed = loadedSave?.seed ?? Number(process.env.SEED ?? Math.floor(Math.random() * 2 ** 31));

const game = new Game(seed, loadedSave?.players ?? []);
if (loadedSave) {
  console.log(`[save] Spielstand geladen (Seed ${loadedSave.seed}, gespeichert ${loadedSave.savedAt})`);
}
game.start();

const saveNow = () => {
  const save = saves.save({ seed: game.seed, players: game.savedPlayers() });
  console.log(`[save] Spielstand gespeichert (${save.savedAt})`);
  return save;
};
const autosave = setInterval(saveNow, AUTOSAVE_INTERVAL_MS);

const app = express();
app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    players: game.snapshot().map((p) => p.name),
    seed: game.seed,
  });
});
app.use("/api/admin", createAdminRouter({ game, saves, saveNow, password: adminPassword, shutdownEnabled }));
if (existsSync(clientDist)) {
  app.get("/admin", (_req, res) => {
    res.sendFile(path.join(clientDist, "admin.html"));
  });
  app.use(express.static(clientDist));
} else {
  app.get("/", (_req, res) => {
    res
      .status(503)
      .send("Client-Build fehlt. Erst `npm run build` ausführen (oder im Dev-Modus Vite auf Port 5173 nutzen).");
  });
}

const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

interface Connection {
  socket: WebSocket;
  player: GamePlayer | null;
}

wss.on("connection", (socket) => {
  const conn: Connection = { socket, player: null };
  const send = (msg: ServerMessage) => {
    if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(msg));
  };

  const joinTimeout = setTimeout(() => {
    if (!conn.player) socket.close(4000, "Kein Join empfangen");
  }, 10_000);

  socket.on("message", (data) => {
    const msg = parseClientMessage(data.toString());
    if (!msg) return;

    if (!conn.player) {
      if (msg.t !== "join") return;
      if (msg.v !== PROTOCOL_VERSION) {
        send({ t: "joinError", reason: "Client-Version passt nicht zum Server. Seite neu laden." });
        return;
      }
      const result = game.join(msg.name, send);
      if (!result.ok) {
        send({ t: "joinError", reason: result.reason });
        return;
      }
      conn.player = result.player;
      clearTimeout(joinTimeout);
      send({ t: "welcome", id: conn.player.id, seed: game.seed, players: game.snapshot() });
      console.log(`[join] ${conn.player.name} (${conn.player.id}), Spieler: ${game.players.size}`);
      return;
    }

    game.handleMessage(conn.player, msg);
  });

  socket.on("close", () => {
    clearTimeout(joinTimeout);
    if (conn.player) {
      console.log(`[leave] ${conn.player.name} (${conn.player.id})`);
      game.leave(conn.player.id);
    }
  });

  socket.on("error", () => socket.close());
});

const heartbeat = setInterval(() => {
  for (const client of wss.clients) {
    const conn = client as WebSocket & { isAlive?: boolean };
    if (conn.isAlive === false) {
      client.terminate();
      continue;
    }
    conn.isAlive = false;
    client.ping();
  }
}, 30_000);

wss.on("connection", (socket) => {
  const conn = socket as WebSocket & { isAlive?: boolean };
  conn.isAlive = true;
  socket.on("pong", () => {
    conn.isAlive = true;
  });
});

httpServer.listen(port, () => {
  console.log(`Koks und Nutten Server läuft auf Port ${port} (Seed ${seed})`);
  console.log(`[admin] Panel: http://localhost:${port}/admin`);
  if (!process.env.ADMIN_PASSWORD) {
    console.log(`[admin] ADMIN_PASSWORD nicht gesetzt, Default wird genutzt: "${adminPassword}"`);
  }
  if (!shutdownEnabled) {
    console.log("[admin] SHUTDOWN_ENABLED nicht gesetzt — Shutdown-Button speichert nur (Dev-Modus).");
  }
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    console.log(`\n${signal} empfangen, Server stoppt …`);
    clearInterval(heartbeat);
    clearInterval(autosave);
    game.stop();
    try {
      saveNow();
    } catch (err) {
      console.error(`[save] Speichern beim Stopp fehlgeschlagen: ${(err as Error).message}`);
    }
    wss.close();
    httpServer.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  });
}
