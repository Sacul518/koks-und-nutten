# Polizei-Charakter (Farb-Reskin)

`police.png` ist ein eigenstaendiges Charakter-Sheet, abgeleitet aus
`../kenney-rpg-urban/tilemap_packed.png`. Basis war das dort ungenutzte
("freie") Charakter-Set ab Zeile 12 (schlichtes Outfit, Glatze), siehe
Kommentare in `client/src/render/assets.ts` (`AVATAR_ROWS`, `AVATAR_DIR_COLS`).

## Layout

Gleiches Layout wie ein Charakter-Set im Original-Sheet: **3 Zeilen x 4 Spalten
a 16x16 Pixel** (Gesamtgroesse 64x48). Die 4 Spalten entsprechen exakt der
Spalten-Reihenfolge aus `AVATAR_DIR_COLS`:

| Spalte (0-indiziert) | Blickrichtung |
|---|---|
| 0 | links (`left`) |
| 1 | unten / Front (`down`) |
| 2 | oben / Ruecken (`up`) |
| 3 | rechts (`right`) |

Die 3 Zeilen entsprechen den 3 Animations-/Pose-Varianten des Original-Sets
(im Original-Sheet Zeilen 12, 13, 14). Aktuell laedt der Code nur die jeweils
oberste Zeile eines Sets (`AVATAR_ROWS`), die beiden weiteren Zeilen liegen
aber schon im gleichen Layout bereit, falls spaeter Lauf-Frames genutzt werden.

Zum Laden wie die anderen Avatare: Sheet einbinden und mit
`frame(row, col)` auf `TILE_SIZE = 16` Rasterung zugreifen, genau wie in
`loadTextures()` in `assets.ts` (Zeile = 0, Spalten = 0..3 fuer
links/unten/oben/rechts, statt 23..26 im Original-Sheet).

## Recolor

- Hauttoene, Umriss-/Detaillinien: unveraendert vom Original uebernommen.
- Hemd-Grundfarbe (170,168,189) -> Polizeiblau (34,58,122).
- Hemd-Schattenfarbe (137,140,166) -> dunkles Navy (20,38,84).
- Hosen-Grundfarbe (96,96,90) -> fast schwarzes Navy (24,27,46).
- Hosen-Schattenfarbe (84,84,78) -> dunkelstes Navy (14,16,28).
- Auf der Front-Ansicht (Spalte 1, oberste Zeile) zwei helle Pixel
  (255,215,90) auf der Brust als Abzeichen-Andeutung ergaenzt.

Lizenz: CC0 (abgeleitet von Kenneys CC0-RPG-Urban-Pack, siehe
`../CREDITS.md`).
