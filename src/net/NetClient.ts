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
  chapter: 1 | 2 | 4 | 5 | 6 | 7 | 8 | 9;
  /** 🫣 versus variant: hide-and-seek */
  hide?: boolean;
  /** 🔪 Imposteur (co-op room, 4 to 8 players) */
  imp?: boolean;
}

export type LobbyEvent =
  | { t: 'hello'; username: string }
  | ({ t: 'created'; code: string } & RoomSettings)
  | ({ t: 'joined'; code: string; host: string; players?: string[] } & RoomSettings)
  | { t: 'peer-joined'; username: string; players?: string[] }
  | { t: 'peer-left'; username?: string; players?: string[] }
  | { t: 'room-closed' }
  | ({ t: 'settings' } & RoomSettings)
  | ({ t: 'start'; seed?: number; players?: string[] } & RoomSettings)
  | { t: 'error'; error: string }
  | { t: 'queued'; waiting: number }
  | { t: 'chat'; from: string; i: number }
  /** 🎭 an emote in the lobby */
  | { t: 'lemote'; from: string; id: string }
  | { t: 'unqueued' }
  /** 👀 spectator: the game you watch */
  | ({ t: 'watch-start'; seed?: number; player: string; other?: string } & RoomSettings)
  | { t: 'watch-end'; reason: string }
  /** 💬 a friend sent you a message */
  | { t: 'dm'; from: string }
  | { t: 'disconnected' };

export class NetClient {
  private ws: WebSocket | null = null;
  private lobbyListeners = new Set<(e: LobbyEvent) => void>();
  private relayHandler: ((d: unknown, from?: string) => void) | null = null;
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
        let msg: { t: string; d?: unknown; from?: string };
        try {
          msg = JSON.parse(ev.data);
        } catch {
          return;
        }
        if (msg.t === 'relay') this.relayHandler?.(msg.d, msg.from);
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
  /** 🎭 Emote / dance in the lobby */
  public lobbyEmote(id: string) {
    this.raw({ t: 'lemote', id });
  }
  /** 💬 Quick message (index in CHAT_PRESETS) */
  public chat(i: number) {
    this.raw({ t: 'chat', i });
  }
  /** 🔎 Wait for a random partner with these settings */
  public queue(settings: RoomSettings) {
    this.raw({ t: 'queue', ...settings });
  }
  public unqueue() {
    this.raw({ t: 'unqueue' });
  }
  /** 👀 Watch a friend's co-op game */
  public watch(name: string) {
    this.raw({ t: 'watch', name });
  }
  public unwatch() {
    this.raw({ t: 'unwatch' });
  }

  /** In-game messages to the partner. */
  public relay(d: unknown) {
    this.raw({ t: 'relay', d });
  }
  public onRelay(fn: ((d: unknown, from?: string) => void) | null) {
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

/** 💬 Quick messages in the multiplayer lobby */
export const CHAT_PRESETS = ['👋 Salut !', '✅ Prêt !', '⏳ Attends-moi', '🚀 On y va !', '😂 GG', '🙏 Merci !', '😱 J\'ai peur…', '🔁 On en refait une ?'];
