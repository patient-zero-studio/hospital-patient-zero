export type ItemType =
  | 'key'
  | 'keycard'
  | 'battery'
  | 'medkit'
  | 'fuse'
  | 'tool'
  | 'note'
  | 'cassette'
  | 'throwable'
  | 'sedative'
  /** snack: gives back some stamina */
  | 'food'
  /** alarm clock: put down, it rings and lures the creatures */
  | 'alarm'
  /** coins found during a run (banked when you get out) */
  | 'coins'
  | 'special';

export interface GameItem {
  id: string;
  name: string;
  type: ItemType;
  description: string;
  lore?: string;
  icon: string; // lucide icon identifier
  usableOn?: string; // target ID, e.g., 'door-surgery', 'breaker-box'
  quantity?: number;
}

export type MonsterState =
  | 'PATROL'
  | 'LISTEN'
  | 'INVESTIGATE'
  | 'SEARCH'
  | 'CHASE'
  | 'TARGET_LOST'
  | 'RETURN'
  /** Knocked out by a sedative syringe. */
  | 'STUNNED';

export interface Objective {
  id: string;
  text: string;
  completed: boolean;
  isCurrent: boolean;
}

export interface AudioSettings {
  masterVolume: number;
  ambienceVolume: number;
  sfxVolume: number;
  musicVolume: number;
}

export interface ControlSettings {
  mouseSensitivity: number;
  invertY: boolean;
  headBob: boolean;
  shadowsEnabled: boolean;
  performanceMode: boolean;
  /** The creature hears your real voice through the microphone. */
  micEnabled: boolean;
  /** Microphone sensitivity multiplier (0.5 – 2). */
  micSensitivity: number;
  /** Online: proximity voice chat with the partner. */
  voiceChat: boolean;
}

export type GameEnding = 'SURVIVAL' | 'PURGE' | 'TRUTH' | 'SEWER' | 'MAZE' | 'RESCUE' | 'DESTROY' | 'LUCAS';
/** 1 = the hospital, 2 = the sewers */
export type Chapter = 1 | 2 | 3 | 4 | 5;
