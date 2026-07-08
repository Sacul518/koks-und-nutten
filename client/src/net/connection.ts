import {
  PROTOCOL_VERSION,
  type BuildingKind,
  type ClientMessage,
  type EventKind,
  type LedgerPeriod,
  type PlayerSnapshot,
  type ServerMessage,
} from "@koks/shared";

export interface JoinSuccess {
  id: string;
  seed: number;
  players: PlayerSnapshot[];
}

const RECONNECT_BASE_DELAY_MS = 1000;
const RECONNECT_MAX_DELAY_MS = 10_000;
/** Nach so viel Zeit ohne Erfolg wird aufgegeben (deckt z. B. das 60s-Heartbeat-Fenster ab, bis der Server die alte Session räumt). */
const RECONNECT_GIVE_UP_AFTER_MS = 120_000;

export class Connection {
  private socket: WebSocket | null = null;
  private name = "";
  private reconnecting = false;
  private reconnectAttempt = 0;
  private reconnectStartedAt = 0;
  private reconnectTimer: number | null = null;
  private manuallyClosed = false;

  onSnapshot: ((msg: Extract<ServerMessage, { t: "snapshot" }>) => void) | null = null;
  onPlayerLeft: ((id: string) => void) | null = null;
  onActionError: ((reason: string) => void) | null = null;
  onSold: ((price: number) => void) | null = null;
  onLedgerHistory: ((history: LedgerPeriod[]) => void) | null = null;
  onRaided: ((buildingId: string, buildingKind: BuildingKind, lossValue: number) => void) | null = null;
  onIntercepted: ((workerId: string, lossValue: number) => void) | null = null;
  onEvent: ((kind: EventKind, text: string) => void) | null = null;
  /** Verbindung verloren, Client versucht im Hintergrund automatisch erneut beizutreten (Spielwelt bleibt bestehen). */
  onReconnecting: ((attempt: number) => void) | null = null;
  /** Automatischer Reconnect erfolgreich — neue Session-ID, Rest der Welt läuft unverändert weiter. */
  onReconnected: ((welcome: JoinSuccess) => void) | null = null;
  /** Automatischer Reconnect endgültig aufgegeben — zurück zum manuellen Join-Screen. */
  onReconnectFailed: ((reason: string) => void) | null = null;

  join(name: string): Promise<JoinSuccess> {
    this.name = name;
    this.manuallyClosed = false;
    return this.connect(name);
  }

  /** Sauber trennen (z. B. "Spiel verlassen" im Settings-Menü) — danach kein automatischer Reconnect mehr. */
  disconnect(): void {
    this.manuallyClosed = true;
    this.reconnecting = false;
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.socket?.close();
  }

  private connect(name: string): Promise<JoinSuccess> {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const socket = new WebSocket(`${proto}://${location.host}/ws`);
    this.socket = socket;

    return new Promise((resolve, reject) => {
      let joined = false;
      socket.onopen = () => {
        this.send({ t: "join", v: PROTOCOL_VERSION, name });
      };
      socket.onmessage = (event) => {
        const msg = JSON.parse(event.data as string) as ServerMessage;
        switch (msg.t) {
          case "welcome":
            joined = true;
            this.reconnecting = false;
            this.reconnectAttempt = 0;
            resolve({ id: msg.id, seed: msg.seed, players: msg.players });
            break;
          case "joinError":
            reject(new Error(msg.reason));
            socket.close();
            break;
          case "snapshot":
            this.onSnapshot?.(msg);
            break;
          case "playerLeft":
            this.onPlayerLeft?.(msg.id);
            break;
          case "actionError":
            this.onActionError?.(msg.reason);
            break;
          case "sold":
            this.onSold?.(msg.price);
            break;
          case "ledgerHistory":
            this.onLedgerHistory?.(msg.history);
            break;
          case "raided":
            this.onRaided?.(msg.buildingId, msg.buildingKind, msg.lossValue);
            break;
          case "intercepted":
            this.onIntercepted?.(msg.workerId, msg.lossValue);
            break;
          case "event":
            this.onEvent?.(msg.kind, msg.text);
            break;
        }
      };
      socket.onerror = () => {
        if (!joined) reject(new Error("Verbindung zum Server fehlgeschlagen."));
      };
      socket.onclose = () => {
        if (!joined) {
          reject(new Error("Verbindung zum Server fehlgeschlagen."));
          return;
        }
        if (this.manuallyClosed) return;
        this.beginReconnect();
      };
    });
  }

  private beginReconnect(): void {
    if (this.reconnecting) return;
    this.reconnecting = true;
    this.reconnectAttempt = 0;
    this.reconnectStartedAt = Date.now();
    this.attemptReconnect();
  }

  private attemptReconnect(): void {
    if (!this.reconnecting) return;
    this.reconnectAttempt++;
    this.onReconnecting?.(this.reconnectAttempt);
    this.connect(this.name)
      .then((welcome) => {
        if (!this.reconnecting) return; // in der Zwischenzeit manuell getrennt
        this.reconnecting = false;
        this.onReconnected?.(welcome);
      })
      .catch(() => {
        if (!this.reconnecting) return;
        if (Date.now() - this.reconnectStartedAt >= RECONNECT_GIVE_UP_AFTER_MS) {
          this.reconnecting = false;
          this.onReconnectFailed?.("Verbindung zum Server konnte nicht wiederhergestellt werden.");
          return;
        }
        const delay = Math.min(RECONNECT_MAX_DELAY_MS, RECONNECT_BASE_DELAY_MS * 2 ** (this.reconnectAttempt - 1));
        this.reconnectTimer = window.setTimeout(() => this.attemptReconnect(), delay);
      });
  }

  send(msg: ClientMessage): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(msg));
    }
  }
}
