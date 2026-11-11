import type { GameEnding, GameItem, Objective, MonsterState } from '../types';
import type { Appearance } from '../appearance';

/** What each player tells the other about themselves (~15 Hz). */
export interface PlayerNetState {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  /** flashlight on */
  fl: boolean;
  /** crouching */
  cr: boolean;
  /** hidden (locker / bed) */
  hid: boolean;
  /** 0..1 how visible to the creatures */
  vis: number;
  dead: boolean;
  /** sprinting */
  sp?: boolean;
  /** id of the hiding spot (locker / bed) when hidden */
  hs?: string;
  /** versus creature: knocked out by a sedative */
  st?: boolean;
  /** chapter 5: lamp in UV mode */
  uv?: boolean;
}

export type InteractRequest =
  | { kind: 'door'; id: string }
  | { kind: 'container'; id: string }
  | { kind: 'breaker' }
  | { kind: 'purge' }
  | { kind: 'vending' }
  | { kind: 'can'; idx: number }
  | { kind: 'vent' }
  | { kind: 'repair' }
  | { kind: 'pickup'; uid: number }
  | { kind: 'drop'; idx: number }
  /** chapters 4-5: [E] on a level object (jerrycan, generator, lever, flare…) */
  | { kind: 'level' }
  /** bought from the hobo / taken from the stash */
  | { kind: 'give'; item: GameItem };

/** Authoritative world state sent by the host (~10 Hz). */
export interface WorldSnapshot {
  /** [x, z, rotY, stateIndex, speed] per creature */
  monsters: [number, number, number, number, number][];
  /** [doorId, open, locked] */
  doors: [string, boolean, boolean][];
  /** [containerId, searched, locked] */
  containers: [string, boolean, boolean][];
  power: boolean;
  inv: GameItem[];
  objectives: Objective[];
  /** [x, y, z, qx, qy, qz, qw] per can */
  cans: number[][];
  /** Sent only when the number of documents changes. */
  notes?: GameItem[];
  /** Versus: seconds left before the creature wins. */
  timeLeft?: number;
  /** Duct crawler: [x, z, rotY, stateIndex] */
  cr?: [number, number, number, number];
  /** Floor-1 staircase rebuilt with planks */
  stairs?: boolean;
  /** Duct grille pulled off */
  vent?: boolean;
  /** Items lying in the world (sent when the list changes): [uid, x, z, rotY, item] */
  wi?: [number, number, number, number, GameItem][];
  /** Chapters 4-5: the level's own state (ForestNet / SiteNet) */
  lv?: unknown;
}

export const MONSTER_STATES: MonsterState[] = ['PATROL', 'LISTEN', 'INVESTIGATE', 'SEARCH', 'CHASE', 'TARGET_LOST', 'RETURN', 'STUNNED'];

export type GameMsg =
  // both ways
  | { k: 'p'; s: PlayerNetState }
  // guest → host
  | { k: 'noise'; x: number; z: number; loud: number; hid: boolean }
  | { k: 'act'; req: InteractRequest }
  | { k: 'slot'; i: number }
  | { k: 'flip'; power: number }
  // host → guest
  | { k: 'snap'; w: WorldSnapshot }
  | { k: 'toast'; msg: string }
  | { k: 'used'; item: GameItem }
  | { k: 'fx'; name: 'screamer' | 'powerUp' | 'vending' | 'flipResult'; mine?: boolean; result?: string }
  | { k: 'caught'; m: number }
  | { k: 'end'; ending: GameEnding }
  | { k: 'gameover' }
  /** coins found by the guest */
  | { k: 'coins'; n: number }
  /** achievement earned by the guest (decided by the host) */
  | { k: 'ach'; id: string }
  /** an alarm clock rings at (x, z) */
  | { k: 'alarm'; x: number; z: number }
  // versus (both ways)
  | { k: 'pounce' }
  /** Each player's customised colours (sent at the start of a game) */
  | { k: 'look'; a: Appearance }
  /** Survivor → creature player: sedative, immobilised `s` seconds */
  | { k: 'stun'; s: number }
  | { k: 'vsEnd'; winner: 'monster' | 'survivor'; reason: string; ending?: GameEnding }
  /** Versus anti-camping: survivor → creature player, blinded and moved by an AI for s seconds */
  | { k: 'blind'; s: number }
  /** Race: host → guest, someone reached the exit first */
  | { k: 'raceEnd'; winner: 'host' | 'guest'; ending: GameEnding };

/** Link between the engine and the other player. */
export interface GameLink {
  role: 'host' | 'guest';
  partnerName: string;
  /** coop = together vs the AI; versus = one of the two players is the creature; race = first one out wins */
  mode: 'coop' | 'versus' | 'race';
  /** versus only: what the local player is */
  versusRole: 'monster' | 'survivor' | null;
  send: (msg: GameMsg) => void;
  setHandler: (fn: ((msg: GameMsg) => void) | null) => void;
  /** Proximity voice chat (binary audio frames). */
  sendVoice?: (b: ArrayBuffer) => void;
  setVoiceHandler?: (fn: ((b: ArrayBuffer) => void) | null) => void;
}
