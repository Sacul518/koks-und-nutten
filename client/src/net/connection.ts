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

export class Connection {
  private socket: WebSocket | null = null;
  onSnapshot: ((msg: Extract<ServerMessage, { t: "snapshot" }>) => void) | null = null;
  onPlayerLeft: ((id: string) => void) | null = null;
  onDisconnect: (() => void) | null = null;
  onActionError: ((reason: string) => void) | null = null;
  onSold: ((price: number) => void) | null = null;
  onLedgerHistory: ((history: LedgerPeriod[]) => void) | null = null;
  onRaided: ((buildingId: string, buildingKind: BuildingKind, lossValue: number) => void) | null = null;
  onIntercepted: ((workerId: string, lossValue: number) => void) | null = null;
  onEvent: ((kind: EventKind, text: string) => void) | null = null;

  join(name: string): Promise<JoinSuccess> {
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
        if (!joined) reject(new Error("Verbindung zum Server fehlgeschlagen."));
        else this.onDisconnect?.();
      };
    });
  }

  send(msg: ClientMessage): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(msg));
    }
  }
}
