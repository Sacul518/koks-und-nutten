# Asset-Credits

Alle Grafik-Assets in diesem Verzeichnis stammen von [Kenney](https://www.kenney.nl) und
stehen unter **CC0 1.0 Universal** (Public Domain, https://creativecommons.org/publicdomain/zero/1.0/).
Namensnennung ist nicht verpflichtend, wird von Kenney aber gerne gesehen.

| Ordner | Pack | Quelle | Lizenz |
|---|---|---|---|
| `kenney-rpg-urban/` | RPG Urban Pack | https://kenney.nl/assets/rpg-urban-pack | CC0 |
| `kenney-roguelike-rpg-pack/` | Roguelike/RPG Pack | https://kenney.nl/assets/roguelike-rpg-pack | CC0 |
| `kenney-roguelike-indoors/` | Roguelike Indoors | https://kenney.nl/assets/roguelike-indoors | CC0 |
| `kenney-roguelike-characters/` | Roguelike Characters | https://kenney.nl/assets/roguelike-characters | CC0 |
| `kenney-ui-pack/` | UI Pack | https://kenney.nl/assets/ui-pack | CC0 |
| `kenney-game-icons/` | Game Icons | https://kenney.nl/assets/game-icons | CC0 |
| `kenney-fonts/` | Kenney Fonts | https://kenney.nl/assets/kenney-fonts | CC0 |

Autor für alle Packs: **Kenney (www.kenney.nl)**.

## Details

### kenney-rpg-urban/ (bereits vorhanden)
- `tilemap_packed.png` — 432×288px, Tile-Größe 16×16, kein Rand. 27 Spalten × 18 Zeilen.
  Enthält Boden/Straßen/Gebäude-Tiles sowie 6 Spielfigur-Sets (siehe Bericht).

### kenney-roguelike-rpg-pack/
- `Spritesheet/roguelikeSheet_transparent.png` — 968×526px, Tile 16×16 + 1px Rand
  (Raster-Schrittweite 17px), 57 Spalten × 31 Zeilen. Großes Sortiment: Böden, Wasser,
  Zäune, Gartenbeete/Blumenfelder, Bäume/Büsche, Möbel (Betten, Tische, Stühle, Regale,
  Kommoden, Truhen), Waffen-/Werkzeug-Wandhalterungen, Kerzen/Kronleuchter, Spiegel,
  Wände/Dächer, dekorative Zäune/Pfosten.
- `Spritesheet/roguelikeSheet_magenta.png` — gleiche Tiles, Magenta statt Transparenz
  als Hintergrund (Alternative falls Alpha-Handling Probleme macht).

### kenney-roguelike-indoors/
- `Tilesheets/roguelikeIndoor_transparent.png` — 458×305px, Tile 16×16 + 1px Rand,
  27 Spalten × 18 Zeilen. Fokus auf Innenausstattung: Regale/Bücherregale, Tische,
  Betten, Kommoden/Schränke, Truhen, Leitern, Vorhänge/Banner, Kerzen/Laternen,
  Boden-Fliesenmuster (schachbrett/gitter), Türen, Fenster.

### kenney-roguelike-characters/
- `Spritesheet/roguelikeChar_transparent.png` — modularer Charakter-Baukasten
  (Frontalansicht, KEINE 4-Richtungs-Walkcycles): Körper/Hautfarben, Frisuren/Hüte,
  Rüstungsteile, Waffen, Schilde als einzelne Layer-Teile plus einige fertig
  komponierte Beispiel-Portraits ganz links. Tile 16×16 + 1px Rand.

### kenney-ui-pack/
- `PNG/Grey/`, `PNG/Extra/` (+ zusätzlich Blue/Green/Red/Yellow als weitere Farbthemen
  mitkopiert) — Buttons, Panels, Checkboxen, Slider, Eingabefelder, Pfeile, Icons.
  Je Farbe in `Default` (1×) und `Double` (2×) Auflösung.

### kenney-game-icons/
- `PNG/White/` und `PNG/Black/`, je `1x` und `2x` — 105 generische UI-Icons (Pfeile,
  Zahnrad, Schloss/Unlocked, Warnung, Stern, Share, Signal, Play/Pause etc.).
  Einfarbig (weiß bzw. schwarz), gut per CSS/Tint einfärgbar.

### kenney-fonts/
- `Fonts/` — 12 TTF-Fonts, u. a. **Kenney Pixel** (reiner Pixel-Font, gut für
  UI/HUD-Text) und **Kenney Mini**/**Kenney Mini Square** (sehr kompakt, gut für
  kleine Labels). Lizenz CC0 (bei Fonts unüblich, aber von Kenney bestätigt).

### icons/ (selbst erstellt)
- `samen.png`, `pflanze.png`, `ernte.png`, `weed.png`, `baggie.png`,
  `geld-sauber.png`, `geld-schmutzig.png`, `heat.png`, `meth.png`, `arbeiter.png`
  — je 16×16px, transparenter Hintergrund. Prozedural per Python-Skript
  (reine Stdlib, kein PIL) im Kenney-16×16-Stil erzeugt (kräftige Flächenfarben,
  1px dunkle Umrandung). Keine Kenney-Bilddaten kopiert, nur der Stil ist
  angelehnt. Lizenz **CC0** (eigenes Werk, wie der Rest des Projekts).

### police/ (selbst erstellt, Farb-Reskin)
- `police.png` — 64×48px (3 Zeilen × 4 Spalten à 16×16), gleiches Layout wie
  ein Charakter-Set in `kenney-rpg-urban/tilemap_packed.png`. Basis war das dort
  ungenutzte Charakter-Set ab Zeile 12; Hemd/Hose per Farb-Remapping auf
  Polizeiblau umgefärbt, Hauttöne/Outline unverändert aus dem Original
  übernommen, Abzeichen-Andeutung ergänzt. Details in `police/README.md`.
  Lizenz **CC0** (abgeleitetes Werk von Kenneys CC0-Originalmaterial).
