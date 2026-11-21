/**
 * 🔪 Imposteur (4 to 8 players, co-op room): one player is secretly a monster.
 * Each night it can kill (one at a time, with a cooldown). Each morning the
 * survivors vote: the one with the most votes is banished. The survivors win
 * if the impostor is banished, or if one of them is still alive after as many
 * nights as there are players. The impostor wins when nobody else is left.
 *
 * The host runs this; the guests only mirror `netState()`.
 */
export const IMP_NIGHT = 70;
export const IMP_MORNING = 25;
export const IMP_COOLDOWN = 25;
/** no kill in the first seconds of the game */
export const IMP_FIRST = 12;
export const IMP_RANGE = 2.6;
export const IMP_MIN_PLAYERS = 4;
/** 🔍 the Detective joins from this many players (the Medic is always there) */
export const IMP_DET_PLAYERS = 5;

export type ImpRole = 'imp' | 'doc' | 'det' | 'crew';

export type ImpPhase = 'night' | 'morning' | 'over';
export interface ImpNet {
  ph: ImpPhase;
  n: number;
  t: number;
  dead: string[];
  /** who already voted (not for whom) */
  voted: string[];
  /** the impostor can kill right now (only meaningful for the impostor) */
  cd: number;
  res?: 'crew' | 'imp';
  /** revealed at the end */
  imp?: string;
  /** last morning's news */
  log?: string;
  /** the impostor quit the room */
  il?: boolean;
}

export type ImpEvent =
  | { e: 'kill'; victim: string }
  | { e: 'saved'; victim: string }
  | { e: 'banish'; victim: string; wasImp: boolean }
  | { e: 'over'; res: 'crew' | 'imp' };

/** Same pick on every screen: everyone knows the room order and the seed. */
export function pickImpostor(players: string[], seed: number) {
  const i = Math.floor(Math.abs(seed) * 1e6) % players.length;
  return players[i];
}

export class ImpostorGame {
  public ph: ImpPhase = 'night';
  public n = 1;
  public t = IMP_NIGHT;
  public dead = new Set<string>();
  public votes = new Map<string, string>();
  public cooldown = IMP_FIRST;
  public res: 'crew' | 'imp' | null = null;
  public log = '';
  public readonly nights: number;
  public readonly impostor: string;
  /** 🩺 the Medic and 🔍 the Detective (secret, like the impostor) */
  public readonly doctor: string | null;
  public readonly detective: string | null;
  /** 🩺 protected for the coming night / the one before (no twice in a row) */
  public protect: string | null = null;
  public lastProtect: string | null = null;
  /** killed during the current night (told at dawn) */
  private tonight: string[] = [];
  private savedTonight = false;
  /** the impostor left the room (crew wins by forfeit) */
  public impLeft = false;

  constructor(public players: string[], seed: number) {
    this.impostor = pickImpostor(players, seed);
    this.nights = players.length;
    // Same draw on every screen, from the same seed
    const rest = players.filter((p) => p !== this.impostor);
    const k = Math.floor(Math.abs(seed) * 1e9);
    this.doctor = rest.length >= 3 ? rest.splice(k % rest.length, 1)[0] : null;
    this.detective = players.length >= IMP_DET_PLAYERS && rest.length >= 2 ? rest[Math.floor(k / 7) % rest.length] : null;
  }

  public roleOf(name: string): ImpRole {
    return name === this.impostor ? 'imp' : name === this.doctor ? 'doc' : name === this.detective ? 'det' : 'crew';
  }

  /** 🩺 Host: the Medic picks who to protect next night (in the morning). */
  public protectFor(by: string, target: string) {
    if (this.ph !== 'morning' || by !== this.doctor || !this.isAlive(by) || !this.isAlive(target) || target === this.lastProtect) return false;
    this.protect = target;
    return true;
  }

  public isAlive(name: string) {
    return this.players.includes(name) && !this.dead.has(name);
  }
  public crewAlive() {
    return this.players.filter((p) => p !== this.impostor && !this.dead.has(p));
  }
  public canKill() {
    return this.ph === 'night' && this.cooldown <= 0 && !this.res;
  }

  /** Host: one tick. Returns what happened. */
  public update(dt: number): ImpEvent[] {
    const ev: ImpEvent[] = [];
    if (this.res) return ev;
    this.t -= dt;
    if (this.ph === 'night') {
      this.cooldown = Math.max(0, this.cooldown - dt);
      if (this.t <= 0) {
        if (this.n >= this.nights) return this.finish('crew', ev);
        this.ph = 'morning';
        this.t = IMP_MORNING;
        this.votes.clear();
        this.log = this.tonight.length ? `☠ Cette nuit : ${this.tonight.join(', ')}.` : "🌅 Personne n'est mort cette nuit.";
        if (this.savedTonight) this.log += " 🩺 Le médecin a sauvé quelqu'un !";
        this.tonight = [];
        this.savedTonight = false;
        this.lastProtect = this.protect;
        this.protect = null;
      }
    } else if (this.ph === 'morning') {
      const voters = this.players.filter((p) => !this.dead.has(p));
      if (this.t <= 0 || voters.every((v) => this.votes.has(v))) {
        this.tally(ev);
        if (this.res) return ev;
        this.ph = 'night';
        this.n++;
        this.t = IMP_NIGHT;
        this.cooldown = Math.max(this.cooldown, 10);
      }
    }
    return ev;
  }

  /** Host: the impostor strikes. */
  public kill(victim: string): ImpEvent[] {
    const ev: ImpEvent[] = [];
    if (!this.canKill() || victim === this.impostor || !this.isAlive(victim)) return ev;
    if (victim === this.protect) {
      // 🩺 the Medic was there: the blow misses, the impostor must wait again
      this.cooldown = IMP_COOLDOWN;
      this.savedTonight = true;
      ev.push({ e: 'saved', victim });
      return ev;
    }
    this.dead.add(victim);
    this.tonight.push(victim);
    this.cooldown = IMP_COOLDOWN;
    ev.push({ e: 'kill', victim });
    if (this.crewAlive().length === 0) this.finish('imp', ev);
    return ev;
  }

  /** Host: a morning vote ('skip' = nobody). */
  public vote(voter: string, target: string) {
    if (this.ph !== 'morning' || !this.isAlive(voter)) return;
    if (target !== 'skip' && !this.isAlive(target)) return;
    this.votes.set(voter, target);
  }

  /** Host: a player left the room. */
  public leave(name: string): ImpEvent[] {
    const ev: ImpEvent[] = [];
    if (this.res || !this.players.includes(name)) return ev;
    if (name === this.impostor) {
      this.impLeft = true;
      return this.finish('crew', ev);
    }
    if (name === this.protect) this.protect = null;
    this.dead.add(name);
    if (this.crewAlive().length === 0) this.finish('imp', ev);
    return ev;
  }

  private tally(ev: ImpEvent[]) {
    const count = new Map<string, number>();
    for (const t of this.votes.values()) count.set(t, (count.get(t) ?? 0) + 1);
    let best = '';
    let max = 0;
    let tie = false;
    for (const [k, c] of count) {
      if (c > max) {
        best = k;
        max = c;
        tie = false;
      } else if (c === max) tie = true;
    }
    if (!best || tie || best === 'skip' || max < 2) {
      this.log = '🗳 Pas de majorité : personne n\'est banni.';
      return;
    }
    const wasImp = best === this.impostor;
    this.dead.add(best);
    // a banished Medic protects nobody tonight
    if (best === this.doctor) this.protect = null;
    ev.push({ e: 'banish', victim: best, wasImp });
    this.log = wasImp ? `🗳 ${best} est banni… c'était l'imposteur !` : `🗳 ${best} est banni… mais c'était un innocent.`;
    if (wasImp) this.finish('crew', ev);
    else if (this.crewAlive().length === 0) this.finish('imp', ev);
  }

  private finish(res: 'crew' | 'imp', ev: ImpEvent[]) {
    this.res = res;
    this.ph = 'over';
    ev.push({ e: 'over', res });
    return ev;
  }

  public netState(): ImpNet {
    return {
      ph: this.ph,
      n: this.n,
      t: Math.max(0, Math.round(this.t * 10) / 10),
      dead: [...this.dead],
      voted: [...this.votes.keys()],
      cd: Math.ceil(this.cooldown),
      res: this.res ?? undefined,
      imp: this.res ? this.impostor : undefined,
      log: this.log || undefined,
      il: this.impLeft || undefined,
    };
  }

  /** Guest: mirror the host. */
  public netApply(s: ImpNet) {
    this.ph = s.ph;
    this.n = s.n;
    this.t = s.t;
    this.dead = new Set(s.dead);
    this.votes = new Map(s.voted.map((v) => [v, '?']));
    this.cooldown = s.cd;
    this.res = s.res ?? null;
    this.log = s.log ?? '';
    this.impLeft = !!s.il;
  }
}
