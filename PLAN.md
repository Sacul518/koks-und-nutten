# Plan: "Koks und Nutten" — Koop-Tycoon-Spiel auf dem Raspberry Pi

## Kontext

Greenfield-Projekt (Ordner enthält nur `konzept.txt`). Ziel: ein Browser-basiertes
Koop-Tycoon-/Factory-Spiel im Drogenimperium-Setting für bis zu 4 Spieler.
Server läuft auf einem Raspberry Pi 4 im LAN, Clients sind iPads (Safari, Touch +
Tastatur, **keine Maus**). Autostart, Admin-Panel (Save + sicherer Shutdown) und
Auto-Save sind laut Konzept Grundvoraussetzung, kein Nice-to-have.

**Entschieden mit Lucas:**
- **TypeScript** (geteilte Typen für Netzwerk-Nachrichten zwischen Client & Server)
- **Top-Down-Perspektive** (gerades Quadrat-Raster, Perspektiv-Sprites à la Stardew)
- **Alle vier Zusatzsysteme in v1**: Heat/Fahndung, Reviere, Geldwäsche, Random Events
- **Grafik sofort mit freien Asset-Packs** (Kenney.nl, CC0)

### Design-Leitlinie (wichtig, von Lucas vorgegeben)
Das Spiel ist für **Analytiker/Optimierer, nicht für Story-Fans**. Alle Systeme
sind Zahlenwerk, keine Erzählung:
- Heat ist ein **Kostenfaktor auf der Abrechnung** (Razzia-Verluste, Bestechungs-
  Ausgaben), keine dramatische Entscheidung und keine Dialoge.
- Rivalen sind **wirtschaftliche Konkurrenten** (drücken Preise, fangen Lieferungen
  ab), keine Story-Figuren.
- Random Events sind **Markt-/Wirtschaftsereignisse** (Ticker-Meldung + Effekt in
  den Zahlen), keine Zwischensequenzen.
- Zentrales UI-Element dafür: ein **Ledger/Statistik-Screen** (Einnahmen, Ausgaben,
  Verluste, Produktion über Zeit — wie Factorio-Produktionsgraphen).

---

## Architektur

### Projektstruktur (npm workspaces, Monorepo)

```
Koks und Nutten/
├── package.json          # Workspaces: shared, server, client
├── shared/src/
│   ├── protocol.ts       # WebSocket-Nachrichten (discriminated unions)
│   ├── types.ts          # Spielzustand-Typen (Player, Building, District, …)
│   └── constants.ts      # Tickrate, Kartengröße, Preise, Balancing-Werte
├── server/src/
│   ├── index.ts          # Express: statische Client-Dateien + Admin-API + ws
│   ├── game/             # Simulation: Tick-Loop, Welt, Wirtschaft, Heat, Rivalen
│   ├── persistence/      # Save/Load: atomar, versioniert, rotierende Backups
│   └── admin/            # Admin-Endpunkte: Status, Save, Shutdown
├── client/               # Vite (Multi-Page: index.html + admin.html) + PixiJS v8
│   ├── src/net/          # WebSocket-Client, Reconnect
│   ├── src/render/       # Pixi-Szene, Kamera, Tilemap, Y-Sortierung für Tiefe
│   ├── src/input/        # Touch (Tap-to-Move, Pinch-Zoom) + Tastatur (WASD, Hotkeys)
│   ├── src/ui/           # HUD, Baumenü, Inventar, Ledger, Settings
│   └── public/assets/    # Kenney-Packs (CC0)
└── deploy/
    ├── koks.service      # systemd-Unit (Autostart, Restart=on-failure)
    ├── sudoers-koks      # erlaubt NUR /sbin/shutdown ohne Passwort
    └── install.sh + README.md  # Pi-Einrichtung Schritt für Schritt
```

### Technik-Entscheidungen
- **Node.js 22 LTS**, Express 5, `ws` für WebSockets, kein Framework-Overkill.
- **Server-autoritativ**: Clients senden nur Befehle (bewegen, bauen, kaufen,
  verkaufen); der Server validiert, simuliert (10 Ticks/s) und broadcastet den
  Zustand (~10 Hz Snapshots der dynamischen Entities — bei 4 Spielern im LAN
  völlig ausreichend, Optimierung erst bei Bedarf).
- **Keine Datenbank**: Spielstand als JSON. Atomar schreiben (tmp-Datei + rename),
  `saveVersion`-Feld für spätere Migrationen, 5 rotierende Backups.
  Auto-Save alle 5 min + bei SIGTERM + manuell übers Admin-Panel.
- **Sicherer Shutdown**: Admin-Endpunkt speichert erst, antwortet, ruft dann
  `sudo /sbin/shutdown -h now`. Ein sudoers-Drop-in erlaubt dem Service-User
  ausschließlich diesen einen Befehl.
- **Karte**: großes, festes Stadtraster (z. B. 200×200 Tiles), **deterministisch
  aus einem Seed generiert** (Straßennetz, Baugrundstücke, Distrikte). Seed liegt
  im Save. Spart Handarbeit in einem Karten-Editor und macht Distrikte/Reviere
  zu Daten statt zu Grafik.
- **Admin-Panel**: eigene Seite `/admin` (zweiter Vite-Entry-Point), simples
  Passwort aus Server-Config, zeigt verbundene Spieler, Uptime, Tick-Gesundheit,
  letzter Save; Buttons: „Jetzt speichern" und „Speichern & Pi herunterfahren".

### Input-Konzept iPad (Touch + Tastatur, keine Maus)
- **Bewegung**: Tap auf begehbares Tile → Spielfigur läuft hin (A* auf dem Raster).
  Zusätzlich WASD/Pfeiltasten für Tastatur-Nutzer.
- **Kamera**: folgt der Figur; Zwei-Finger-Drag löst sie, Pinch zoomt,
  Taste `C` oder Button zentriert wieder.
- **Interaktion**: Tap auf Objekt/NPC öffnet dessen Panel (Gebäude-UI, Verkauf).
- **Bauen**: Taste `B` oder Hotbar-Button → Baumenü; Geist-Vorschau folgt dem
  Finger; **explizites Bestätigen/Abbrechen** (gegen Verklicken auf Touch).
- **Hotbar**: Tasten 1–9 und parallel Touch-Buttons am unteren Rand.
- Safari-Details: `touch-action: none` auf dem Canvas, Viewport-Meta gegen
  Doppeltipp-Zoom, Homescreen-Vollbild-Metatags.

### Assets
Kenney.nl, CC0 (rechtlich unbedenklich). Kandidaten: **RPG Urban Pack**
(16×16-Stadt: Straßen, Gebäude), **Roguelike/RPG Pack** (Charaktere, Interieur).
Erster Schritt in M0: 2–3 Packs laden, Testszene bauen, Lucas wählt den Stil.

---

## Meilensteine

Jeder Meilenstein endet mit etwas, das man **auf dem iPad wirklich ausprobieren
kann** — das ist zugleich die Verifikation.

### M0 — Gerüst: Zwei Spieler laufen durch die Stadt
- Monorepo aufsetzen (workspaces, tsconfig, Vite, PixiJS), `git init`.
- Join-Flow: IP im Browser aufrufen → Name eingeben → Session beitreten.
- Tick-Loop, Stadtgenerator v0 (Straßen + Blöcke), Kamera, Tap-to-Move + WASD,
  Spieler sehen sich gegenseitig. Kenney-Assets einbinden, Stil-Auswahl mit Lucas.
- ✅ **Test**: Mac-Browser + iPad im selben WLAN, beide laufen sichtbar herum.

### M1 — Pi-Betrieb: Autostart, Admin-Panel, Saves (früh, weil Grundvoraussetzung)
- Persistence-Modul (atomar, versioniert, Backups), Auto-Save, Save bei SIGTERM.
- Admin-Panel mit Status, Save-Button, „Speichern & Herunterfahren".
- systemd-Unit, sudoers-Drop-in, `install.sh`, Schritt-für-Schritt-README für den Pi.
- ✅ **Test**: Pi einstecken → Server läuft; spielen; Shutdown-Button → Save
  geschrieben, Pi fährt sauber runter; neu booten → Zustand ist wieder da.

### M2 — Erste Produktionskette: Weed, manuell
- Baumodus (Grundstück kaufen, Gebäude platzieren): Growbox, Trockenraum,
  Packtisch. Kette: Samen → Pflanze (wächst über Zeit) → Ernte → Trocknen →
  Baggies. Inventar + HUD (Geld, Taschen-Inhalt).
- Straßen-NPCs als Käufer: Tap → Verkauf, Preis je nach Distrikt.
- Geld von Anfang an als **schmutzig/sauber** im Datenmodell (verhindert späteren
  Umbau), Mechanik-Unterschied kommt erst in M5.
- ✅ **Test**: Zwei Spieler verdienen gemeinsam ihr erstes Geld.

### M3 — Automatisierung + Ledger (Herzstück für die Zielgruppe)
- Anheuerbare Arbeiter mit Lohn als laufende Kosten: **Gärtner** (pflanzt/erntet),
  **Kurier** (transportiert zwischen Gebäuden), **Dealer** (verkauft selbstständig
  in einem Distrikt).
- **Ledger-Screen v1**: Einnahmen/Ausgaben/Gewinn pro Periode, Produktionszahlen,
  einfache Verlaufsgraphen.
- ✅ **Test**: Kette läuft ohne Eingreifen; Ledger weist Gewinn korrekt aus.

### M4 — Heat & Polizei als Kostenfunktion
- Heat-Wert steigt pro Verkauf (abhängig von Droge, Menge, Distrikt), zerfällt
  über Zeit. Hoher Heat → Razzia-Wahrscheinlichkeit (Warenverlust in Gebäuden).
  Bestechung = laufende Ausgabe, die Heat-Zuwachs dämpft.
- **Alles erscheint im Ledger**: „Verluste durch Razzien", „Bestechungsgelder" —
  Heat ist ein Optimierungsproblem, kein Story-Moment.
- ✅ **Test**: Aggressives Verkaufen wird messbar teurer als kluges Verkaufen.

### M5 — Reviere, Rivalen, Geldwäsche
- Distrikte mit Nachfrageprofil, Preis- und Polizei-Multiplikatoren.
- Rivalen-Gangs als Wirtschafts-Akteure: verkaufen selbst (drücken Preise, wo sie
  stark sind), Abfangrisiko für Kuriere in Fremdrevieren. Revierkontrolle
  verschiebt sich über **Verkaufsanteile**, nicht über Missionen.
- Geldwäsche-Fronts (Waschsalon, Bar): wandeln schmutziges in sauberes Geld mit
  begrenztem Durchsatz — Wäsche-Kapazität als Engpass in der Kette. Bestimmte
  Ausgaben (Grundstücke, Fronts) verlangen sauberes Geld.
- ✅ **Test**: Revierkarte reagiert auf Verkaufsverhalten; Wäsche-Engpass spürbar.

### M6 — Progression, zweite Droge, Random Events
- Freischalt-System (mehr Sorten über Zeit): zweite Kette **Meth** (Labor, teurere
  Inputs, mehr Heat, höhere Marge).
- Random Events als Marktereignisse: Preisschwankung pro Distrikt, abgefangene
  Lieferung, Polizei-Schwerpunktaktion — Ticker-Meldung + Zahleneffekt, sonst nichts.
- ✅ **Test**: Kompletter Loop über eine längere Session, Events sichtbar im Ledger.

### M7 — Politur
- Menüs vervollständigen (Settings, übersichtliches Inventar), Balancing-Pass,
  Performance-Check auf iPad 9 (Safari), Reconnect-Robustheit, Rivalen-Feinschliff.

---

## Verifikation (durchgängig)
- Nach jedem Meilenstein: `npm run build` (beide Pakete) + manueller Test mit
  **zwei Clients** (Mac-Browser + iPad über LAN-IP).
- Ab M1 zusätzlich regelmäßig auf dem echten Pi testen (Deploy-Skript),
  inklusive Kaltstart-Test (Strom rein → spielbar ohne Handgriff).
- Save-Robustheit: Server hart killen (`kill -9`) → letzter Auto-Save lädt sauber.
- Touch-UX auf dem iPad bei jedem Meilenstein kurz gegenprüfen (kein Zoom-Hijack,
  keine Miss-Taps beim Bauen).

## Startpunkt der Umsetzung
M0, Schritt 1: Monorepo-Gerüst + Join-Flow + leere Welt mit Kamera. Kenney-Packs
herunterladen und Testszene für die Stil-Entscheidung bauen.
