#!/usr/bin/env bash
# Richtet "Koks und Nutten" auf dem Raspberry Pi als systemd-Service ein.
#
# Aufruf aus dem Repo (OHNE sudo — das Skript fragt selbst, wo es Root braucht):
#   ./deploy/install.sh
#
# Das Skript kann gefahrlos mehrfach laufen (z. B. nach einem `git pull`).
set -euo pipefail

if [[ $EUID -eq 0 ]]; then
  echo "Bitte NICHT mit sudo starten — das Skript nutzt sudo selbst, wo nötig." >&2
  exit 1
fi

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVICE_USER="$USER"

echo "==> Node.js prüfen"
if ! command -v node >/dev/null; then
  echo "Node.js wurde nicht gefunden. Bitte zuerst Node 22 installieren (siehe deploy/README.md)." >&2
  exit 1
fi
NODE_BIN="$(command -v node)"
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if (( NODE_MAJOR < 22 )); then
  echo "Node $NODE_MAJOR gefunden, benötigt wird mindestens Node 22 (siehe deploy/README.md)." >&2
  exit 1
fi
echo "    OK: $("$NODE_BIN" --version) in $NODE_BIN"

echo "==> Abhängigkeiten installieren"
cd "$REPO_DIR"
npm install

echo "==> Client und Server bauen"
npm run build

read -r -p "Admin-Passwort fürs Admin-Panel (nur Buchstaben/Zahlen) [koks-admin]: " ADMIN_PASSWORD
ADMIN_PASSWORD="${ADMIN_PASSWORD:-koks-admin}"

echo "==> systemd-Service installieren (fragt ggf. nach deinem Passwort für sudo)"
sed -e "s|__USER__|$SERVICE_USER|g" \
    -e "s|__DIR__|$REPO_DIR|g" \
    -e "s|__NODE__|$NODE_BIN|g" \
    -e "s|__ADMIN_PASSWORD__|$ADMIN_PASSWORD|g" \
    "$REPO_DIR/deploy/koks.service" | sudo tee /etc/systemd/system/koks.service >/dev/null

echo "==> sudoers-Eintrag installieren (erlaubt dem Service NUR '/sbin/shutdown -h now')"
TMP_SUDOERS="$(mktemp)"
sed "s|__USER__|$SERVICE_USER|g" "$REPO_DIR/deploy/sudoers-koks" >"$TMP_SUDOERS"
if ! sudo visudo -c -f "$TMP_SUDOERS" >/dev/null; then
  echo "sudoers-Datei ist ungültig, Abbruch (nichts wurde installiert)." >&2
  rm -f "$TMP_SUDOERS"
  exit 1
fi
sudo install -m 440 -o root -g root "$TMP_SUDOERS" /etc/sudoers.d/koks
rm -f "$TMP_SUDOERS"

echo "==> Service aktivieren und starten"
sudo systemctl daemon-reload
sudo systemctl enable --now koks.service

IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
IP="${IP:-<IP-des-Pi>}"
echo
echo "Fertig!"
echo "  Spiel:       http://$IP:3000"
echo "  Admin-Panel: http://$IP:3000/admin"
echo "  Status:      systemctl status koks"
echo "  Logs:        journalctl -u koks -f"
