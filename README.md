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
