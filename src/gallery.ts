import type { GameEnding } from './types';

/**
 * 🖼️ Gallery: every ending of the game. Some endings have a "+" version
 * (all the chapter's documents found before getting out).
 */
export const ENDING_KEYS = ['SURVIVAL', 'PURGE', 'TRUTH', 'SEWER', 'SEWER+', 'MAZE', 'MAZE+', 'RESCUE', 'RESCUE+', 'DESTROY', 'LUCAS', 'ROOFTOP', 'ROOFTOP+', 'MOREAU', 'SECRET', 'DONJON'] as const;
export type EndingKey = (typeof ENDING_KEYS)[number];
export const isEndingKey = (k: unknown): k is EndingKey => typeof k === 'string' && (ENDING_KEYS as readonly string[]).includes(k);

/** Documents needed for the "+" version */
export const ENDING_NOTES: Partial<Record<GameEnding, number>> = { SEWER: 3, MAZE: 2, RESCUE: 2, ROOFTOP: 2 };
export const endingKey = (ending: GameEnding, notes: number): EndingKey => {
  const need = ENDING_NOTES[ending];
  return (need && notes >= need ? `${ending}+` : ending) as EndingKey;
};
export const ENDING_CHAPTER: Record<string, number> = { SURVIVAL: 1, PURGE: 1, TRUTH: 1, SEWER: 2, MAZE: 3, RESCUE: 4, DESTROY: 5, LUCAS: 5, ROOFTOP: 6, MOREAU: 7, SECRET: 8 };
/** Older accounts: endings deduced from achievements */
export const ENDING_FROM_ACH: Record<string, EndingKey> = {
  end_survival: 'SURVIVAL',
  end_purge: 'PURGE',
  end_truth: 'TRUTH',
  ch2_escape: 'SEWER',
  ch3_escape: 'MAZE',
  ch4_escape: 'RESCUE',
  ch6_escape: 'ROOFTOP',
  ch7_end: 'MOREAU',
  ch8_end: 'SECRET',
  ch10_end: 'DONJON',
};
