# Deployment auf dem Raspberry Pi 4

Diese Anleitung richtet den Spielserver so ein, dass er beim Booten des Pi
automatisch startet. Danach gilt: **Pi einstecken reicht** — kein manuelles
Starten mehr nötig.

Voraussetzungen: ein Raspberry Pi 4 mit Raspberry Pi OS (64-bit empfohlen),
Netzwerkverbindung und ein Terminal auf dem Pi (direkt oder per SSH).
Alle Befehle unten werden auf dem Pi eingegeben.

## 1. Node.js 22 installieren

Raspberry Pi OS bringt ein zu altes Node mit. So kommt Node 22 (LTS) drauf:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
```

Prüfen — die Ausgabe sollte mit `v22.` beginnen:

```bash
node --version
```

## 2. Git installieren und Repo klonen

```bash
sudo apt-get install -y git
git clone <REPO-URL> koks-und-nutten
cd koks-und-nutten
```

`<REPO-URL>` durch die echte URL des Repos ersetzen. Alternativ das
Projektverzeichnis vom Mac auf den Pi kopieren (ohne `node_modules/`), z. B.:

```bash
# auf dem Mac ausführen:
rsync -av --exclude node_modules --exclude dist --exclude saves \
  "Koks und Nutten/" pi@<IP-des-Pi>:koks-und-nutten/
```

## 3. Installationsskript ausführen

```bash
./deploy/install.sh
```

Das Skript (ohne `sudo` starten, es fragt selbst nach, wo es Root-Rechte
braucht):

1. prüft, dass Node 22+ installiert ist,
2. installiert die npm-Abhängigkeiten und baut Client + Server,
3. fragt nach einem **Admin-Passwort** (Enter = Default `koks-admin`),
4. installiert die systemd-Unit `/etc/systemd/system/koks.service`
   (Autostart beim Booten, automatischer Neustart bei Absturz),
5. installiert `/etc/sudoers.d/koks`, damit der Service-User **ausschließlich**
   `sudo /sbin/shutdown -h now` ausführen darf (mehr Rechte bekommt er nicht),
6. startet den Service sofort.

Am Ende zeigt das Skript die Adressen an. Du solltest sehen:
`Fertig!` mit den URLs für Spiel und Admin-Panel.

## 4. Testen

- Im Browser (Mac oder iPad im selben WLAN): `http://<IP-des-Pi>:8080`
  → Name eingeben, beitreten.
- Admin-Panel: `http://<IP-des-Pi>:8080/admin` → Passwort eingeben
  → Status (Spieler, Uptime, Ticks/s, letzter Save) erscheint.
- Kaltstart-Test: Pi vom Strom trennen, wieder einstecken, ~1 Minute warten
  → Spiel ist ohne Handgriff wieder erreichbar.
- Shutdown-Test: im Admin-Panel „Speichern & Pi herunterfahren" drücken
  → grüne LED des Pi blinkt aus, danach kann man gefahrlos den Stecker ziehen.
  Beim nächsten Booten ist der Spielstand wieder da.

## Nützliche Befehle

```bash
systemctl status koks          # Läuft der Server?
journalctl -u koks -f          # Server-Log live mitlesen (Strg+C beendet)
sudo systemctl restart koks    # Server neu starten
sudo systemctl stop koks       # Server stoppen (speichert vorher automatisch)
```

## Spielstände

- Liegen in `saves/` im Projektordner (`spielstand.json` + 5 rotierende
  Backups `spielstand.backup-1.json` … `spielstand.backup-5.json`).
- Automatisch gespeichert wird alle 5 Minuten, beim Stoppen des Service und
  über das Admin-Panel.
- Geht `spielstand.json` kaputt (z. B. Stromausfall genau beim Schreiben),
  lädt der Server automatisch das neueste lesbare Backup.

## Update einspielen

```bash
cd ~/koks-und-nutten
git pull
./deploy/install.sh    # baut neu und startet den Service
```

## Admin-Passwort später ändern

```bash
sudo nano /etc/systemd/system/koks.service   # Zeile ADMIN_PASSWORD=... anpassen
sudo systemctl daemon-reload
sudo systemctl restart koks
```

(Oder einfach `./deploy/install.sh` erneut ausführen und beim Prompt das neue
Passwort eingeben.)

## Sicherheitshinweis

Das Passwort schützt nur das Admin-Panel und geht unverschlüsselt übers LAN.
Für ein Spiel im Heimnetz ist das in Ordnung — der Server sollte aber nicht
aus dem Internet erreichbar gemacht werden (keine Portfreigabe im Router).
