import { execFile } from "node:child_process";
import express, { type Router } from "express";
import { TICK_RATE } from "@koks/shared";
import type { Game } from "../game/Game.ts";
import type { SaveGame, SaveManager } from "../persistence/SaveManager.ts";

export interface AdminDeps {
  game: Game;
  saves: SaveManager;
  /** Speichert den Spielstand und gibt das geschriebene Save zurück. */
  saveNow: () => SaveGame;
  password: string;
  /** Nur wenn true (SHUTDOWN_ENABLED=1, z. B. in der systemd-Unit) wird wirklich heruntergefahren. */
  shutdownEnabled: boolean;
}

/** Admin-API unter /api/admin — Passwort kommt im Header `x-admin-password`. */
export function createAdminRouter(deps: AdminDeps): Router {
  const router = express.Router();

  router.use((req, res, next) => {
    if (req.get("x-admin-password") !== deps.password) {
      res.status(401).json({ ok: false, error: "Falsches Admin-Passwort." });
      return;
    }
    next();
  });

  router.get("/status", (_req, res) => {
    res.json({
      ok: true,
      players: deps.game.snapshot().map((p) => p.name),
      uptimeSeconds: Math.round(process.uptime()),
      ticksPerSecond: deps.game.ticksPerSecond(),
      targetTickRate: TICK_RATE,
      lastSaveAt: deps.saves.lastSaveAt?.toISOString() ?? null,
      seed: deps.game.seed,
      shutdownEnabled: deps.shutdownEnabled,
    });
  });

  router.post("/save", (_req, res) => {
    const save = deps.saveNow();
    res.json({ ok: true, savedAt: save.savedAt });
  });

  router.post("/shutdown", (_req, res) => {
    const save = deps.saveNow();
    res.json({ ok: true, savedAt: save.savedAt, shutdown: deps.shutdownEnabled });

    if (!deps.shutdownEnabled) {
      console.log(
        "[admin] Shutdown angefordert — SHUTDOWN_ENABLED ist nicht gesetzt, es wurde nur gespeichert (Dev-Modus).",
      );
      return;
    }

    console.log("[admin] Spielstand gespeichert, Pi fährt in 1 s herunter …");
    // Kurz warten, damit die HTTP-Antwort das Admin-Panel noch erreicht.
    setTimeout(() => {
      execFile("sudo", ["/sbin/shutdown", "-h", "now"], (err) => {
        if (err) console.error(`[admin] Shutdown fehlgeschlagen: ${err.message}`);
      });
    }, 1000).unref();
  });

  return router;
}
