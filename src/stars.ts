/**
 * ⭐ Up to 3 stars per chapter (Normal or harder), each one earned on its own:
 *   ★ get out   ★ without being wounded   ★ under the time limit
 * Stored on the account as a bitmask per chapter (bit 0 / 1 / 2).
 */
export const STAR_TIME: Record<number, number> = { 1: 12 * 60, 2: 8 * 60, 3: 10 * 60, 4: 10 * 60, 5: 12 * 60, 6: 8 * 60, 7: 10 * 60, 8: 10 * 60 };
/** Coins for the first time a chapter has its 3 stars */
export const STAR_REWARD = 150;

export const starTime = (chapter: number) => STAR_TIME[chapter] ?? 10 * 60;

export interface RunStats {
  time: number;
  distance: number;
  hides: number;
  hits: number;
  chases: number;
  docs: number;
}

/** The 3 stars of a finished run */
export const starsOf = (chapter: number, s: RunStats): [boolean, boolean, boolean] => [true, s.hits === 0, s.time <= starTime(chapter)];
export const starMask = (st: boolean[]) => (st[0] ? 1 : 0) | (st[1] ? 2 : 0) | (st[2] ? 4 : 0);
export const starCount = (mask: number) => (mask & 1) + ((mask >> 1) & 1) + ((mask >> 2) & 1);
export const STAR_LABELS = (chapter: number) => {
  const t = starTime(chapter);
  return ['Sortir du chapitre', 'Sans être blessé', `En moins de ${Math.floor(t / 60)} min`];
};
export const fmtClock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
