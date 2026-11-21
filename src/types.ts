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
  /** smoke grenade: a cloud the creatures can't see through */
  | 'smoke'
  /** jaw trap: put down, it holds the first creature that steps on it */
  | 'trap'
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
  /** Graphics quality: auto = adapts to the device */
  quality?: GraphicsQuality;
  /** ⏱️ Speedrun: chrono + personal best on screen */
  speedrun?: boolean;
}

export type GraphicsQuality = 'auto' | 'low' | 'medium' | 'high' | 'ultra';

export type GameEnding = 'SURVIVAL' | 'PURGE' | 'TRUTH' | 'SEWER' | 'MAZE' | 'RESCUE' | 'DESTROY' | 'LUCAS' | 'ROOFTOP' | 'MOREAU' | 'SECRET';
/** 1 = the hospital, 2 = the sewers */
export type Chapter = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
