# Koks und Nutten

Koop-Tycoon-/Factory-Game im Browser für bis zu 4 Spieler. Der Server läuft
später auf einem Raspberry Pi 4 im LAN, gespielt wird im Browser (primär iPad,
Touch + Tastatur). Konzept: siehe `konzept.txt`.

## Entwicklung

```bash
npm install
npm run dev
```

- Client mit Hot-Reload: http://localhost:5173
- Server (API + WebSocket): Port 3000
- Vom iPad aus: `http://<IP-des-Macs>:5173`

## Produktion (wie später auf dem Pi)

```bash
npm run build
npm start
```

Danach läuft alles unter `http://<IP>:3000` — Name eingeben, beitreten.

## Admin-Panel & Spielstände

- Admin-Panel: `http://<IP>:3000/admin` (im Dev-Modus `http://localhost:5173/admin`).
  Zeigt Spieler, Uptime, Ticks/s und den letzten Save; Buttons für „Jetzt
  speichern" und „Speichern & Pi herunterfahren".
- Passwort: Env-Variable `ADMIN_PASSWORD`, Default `koks-admin` (fürs LAN ok).
- Spielstände liegen als JSON in `saves/` (Auto-Save alle 5 Minuten, Save beim
  Beenden, 5 rotierende Backups). Der Karten-Seed steckt im Save — nach einem
  Neustart ist die Stadt identisch.
- Der Shutdown-Button fährt den Rechner nur herunter, wenn `SHUTDOWN_ENABLED=1`
  gesetzt ist (macht die systemd-Unit auf dem Pi); in der Entwicklung wird nur
  gespeichert und geloggt.

## Raspberry Pi

Autostart per systemd, Installation und Update: siehe `deploy/README.md`
(Schritt-für-Schritt-Anleitung, `deploy/install.sh` erledigt fast alles).

## Steuerung

| Eingabe | Aktion |
| --- | --- |
| Tippen auf die Karte | Figur läuft dorthin (Wegfindung) |
| Ziehen mit einem Finger | Karte verschieben |
| Pinch mit zwei Fingern | Zoomen |
| `W A S D` / Pfeiltasten | Figur direkt steuern |
| `C` | Kamera wieder an die Figur heften |

## Struktur

- `shared/` — Typen, Netzwerk-Protokoll, Stadtgenerator (läuft identisch auf
  Client und Server, es wird nur der Seed übertragen)
- `server/` — Node.js: Simulation (10 Ticks/s), WebSocket, statische Dateien
- `client/` — Vite + PixiJS: Rendering, Touch-/Tastatur-Steuerung
- Grafiken: [Kenney RPG Urban Pack](https://kenney.nl/assets/rpg-urban-pack) (CC0)
