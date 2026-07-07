import "./admin.css";

interface AdminStatus {
  players: string[];
  uptimeSeconds: number;
  ticksPerSecond: number;
  targetTickRate: number;
  lastSaveAt: string | null;
  seed: number;
  shutdownEnabled: boolean;
}

const loginForm = document.getElementById("login-form") as HTMLFormElement;
const passwordInput = document.getElementById("password-input") as HTMLInputElement;
const loginButton = document.getElementById("login-button") as HTMLButtonElement;
const loginError = document.getElementById("login-error")!;
const dashboard = document.getElementById("dashboard")!;
const connection = document.getElementById("connection")!;
const connectionText = document.getElementById("connection-text")!;
const saveButton = document.getElementById("save-button") as HTMLButtonElement;
const shutdownButton = document.getElementById("shutdown-button") as HTMLButtonElement;
const actionMessage = document.getElementById("action-message")!;

const stat = {
  players: document.getElementById("stat-players")!,
  uptime: document.getElementById("stat-uptime")!,
  ticks: document.getElementById("stat-ticks")!,
  save: document.getElementById("stat-save")!,
  seed: document.getElementById("stat-seed")!,
  shutdown: document.getElementById("stat-shutdown")!,
};

let password = sessionStorage.getItem("koks-admin-password") ?? "";
let pollTimer: number | null = null;

async function api<T>(pathname: string, method: "GET" | "POST" = "GET"): Promise<T> {
  const res = await fetch(pathname, { method, headers: { "x-admin-password": password } });
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const error = (data as { error?: string } | null)?.error;
    throw new Error(error ?? `Server-Fehler (HTTP ${res.status})`);
  }
  return data as T;
}

loginForm.addEventListener("submit", (e) => {
  e.preventDefault();
  password = passwordInput.value;
  loginError.textContent = "";
  loginButton.disabled = true;
  refreshStatus()
    .then(() => {
      sessionStorage.setItem("koks-admin-password", password);
      showDashboard();
    })
    .catch((err: Error) => {
      loginError.textContent = err.message;
    })
    .finally(() => {
      loginButton.disabled = false;
    });
});

saveButton.addEventListener("click", () => {
  runAction(saveButton, async () => {
    const result = await api<{ savedAt: string }>("/api/admin/save", "POST");
    return `Gespeichert um ${formatTime(result.savedAt)}.`;
  });
});

shutdownButton.addEventListener("click", () => {
  if (!confirm("Spielstand speichern und den Pi herunterfahren?")) return;
  runAction(shutdownButton, async () => {
    const result = await api<{ savedAt: string; shutdown: boolean }>("/api/admin/shutdown", "POST");
    return result.shutdown
      ? `Gespeichert um ${formatTime(result.savedAt)} — der Pi fährt jetzt herunter.`
      : `Gespeichert um ${formatTime(result.savedAt)} — Shutdown ist auf diesem Server deaktiviert (Dev-Modus).`;
  });
});

function runAction(button: HTMLButtonElement, action: () => Promise<string>): void {
  button.disabled = true;
  actionMessage.classList.remove("error");
  actionMessage.textContent = "…";
  action()
    .then((message) => {
      actionMessage.textContent = message;
      return refreshStatus();
    })
    .catch((err: Error) => {
      actionMessage.classList.add("error");
      actionMessage.textContent = err.message;
    })
    .finally(() => {
      button.disabled = false;
    });
}

function showDashboard(): void {
  loginForm.hidden = true;
  dashboard.hidden = false;
  connection.hidden = false;
  if (pollTimer === null) {
    pollTimer = window.setInterval(() => {
      refreshStatus().catch(() => {
        // Server weg (z. B. nach Shutdown) — Anzeige behalten, nächster Poll versucht es erneut.
        setConnected(false);
      });
    }, 2000);
  }
}

function setConnected(connected: boolean): void {
  connection.classList.toggle("is-connected", connected);
  connection.classList.toggle("is-disconnected", !connected);
  connectionText.textContent = connected ? "Verbunden" : "Getrennt";
}

async function refreshStatus(): Promise<void> {
  const status = await api<AdminStatus>("/api/admin/status");
  setConnected(true);
  stat.players.textContent =
    status.players.length > 0 ? status.players.map(escapeText).join(", ") : "niemand verbunden";
  stat.uptime.textContent = formatDuration(status.uptimeSeconds);
  stat.ticks.textContent = `${status.ticksPerSecond} / ${status.targetTickRate}`;
  stat.save.textContent = status.lastSaveAt ? formatTime(status.lastSaveAt) : "noch nie";
  stat.seed.textContent = String(status.seed);
  stat.shutdown.textContent = status.shutdownEnabled ? "aktiv (Pi)" : "deaktiviert (Dev)";
}

function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h} h ${m} min`;
  if (m > 0) return `${m} min ${s} s`;
  return `${s} s`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("de-DE");
}

function escapeText(s: string): string {
  // textContent escapet selbst; hier nur Trennzeichen-Kollisionen im Namen entschärfen.
  return s.replaceAll(",", "");
}

// Passwort aus einer früheren Sitzung? Direkt versuchen.
if (password) {
  refreshStatus()
    .then(showDashboard)
    .catch(() => {
      password = "";
      sessionStorage.removeItem("koks-admin-password");
    });
}
