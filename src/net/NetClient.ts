/**
 * WebSocket connection to the game server: lobby (create / join a room with a
 * code) and relay of in-game messages to the other player.
 */
export type GameMode = 'coop' | 'versus' | 'race';
export interface RoomSettings {
  difficulty: number;
  mode: GameMode;
  /** versus: which side plays the creature */
  monster: 'host' | 'guest';
  /** 1 = the hospital, 2 = the sewers, 4 = the forest, 5 = Site B (co-op only) */
  chapter: 1 | 2 | 4 | 5;
}

export type LobbyEvent =
  | { t: 'hello'; username: string }
  | ({ t: 'created'; code: string } & RoomSettings)
  | ({ t: 'joined'; code: string; host: string } & RoomSettings)
  | { t: 'peer-joined'; username: string }
  | { t: 'peer-left' }
  | { t: 'room-closed' }
  | ({ t: 'settings' } & RoomSettings)
  | ({ t: 'start'; seed?: number } & RoomSettings)
  | { t: 'error'; error: string }
  | { t: 'disconnected' };

export class NetClient {
  private ws: WebSocket | null = null;
  private lobbyListeners = new Set<(e: LobbyEvent) => void>();
  private relayHandler: ((d: unknown) => void) | null = null;
  public connected = false;

  constructor(private token: string) {}

  public connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(`${proto}://${location.host}/ws?token=${encodeURIComponent(this.token)}`);
      this.ws = ws;
      ws.binaryType = 'arraybuffer';
      let opened = false;
      ws.onopen = () => {
        opened = true;
        this.connected = true;
        resolve();
      };
      ws.onerror = () => {
        if (!opened) reject(new Error('Connexion au serveur impossible.'));
      };
      ws.onclose = () => {
        this.connected = false;
        if (opened) this.emit({ t: 'disconnected' });
      };
      ws.onmessage = (ev) => {
        if (ev.data instanceof ArrayBuffer) {
          this.voiceHandler?.(ev.data);
          return;
        }
        let msg: { t: string; d?: unknown };
        try {
          msg = JSON.parse(ev.data);
        } catch {
          return;
        }
        if (msg.t === 'relay') this.relayHandler?.(msg.d);
        else this.emit(msg as LobbyEvent);
      };
    });
  }

  private emit(e: LobbyEvent) {
    this.lobbyListeners.forEach((l) => l(e));
  }

  public onLobby(fn: (e: LobbyEvent) => void) {
    this.lobbyListeners.add(fn);
    return () => this.lobbyListeners.delete(fn);
  }

  private raw(msg: unknown) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  public create(settings: RoomSettings) {
    this.raw({ t: 'create', ...settings });
  }
  public join(code: string) {
    this.raw({ t: 'join', code });
  }
  /** Host only, in the lobby. */
  public updateSettings(settings: Partial<RoomSettings>) {
    this.raw({ t: 'settings', ...settings });
  }
  public start() {
    this.raw({ t: 'start' });
  }
  public leave() {
    this.raw({ t: 'leave' });
  }

  /** In-game messages to the partner. */
  public relay(d: unknown) {
    this.raw({ t: 'relay', d });
  }
  public onRelay(fn: ((d: unknown) => void) | null) {
    this.relayHandler = fn;
  }

  /** Proximity voice chat: raw audio frames to / from the partner. */
  private voiceHandler: ((b: ArrayBuffer) => void) | null = null;
  public sendVoice(b: ArrayBuffer) {
    const ws = this.ws;
    // Never let audio pile up behind a slow connection
    if (ws?.readyState === WebSocket.OPEN && ws.bufferedAmount < 64 * 1024) ws.send(b);
  }
  public onVoice(fn: ((b: ArrayBuffer) => void) | null) {
    this.voiceHandler = fn;
  }

  public close() {
    this.ws?.close();
    this.ws = null;
  }
}
