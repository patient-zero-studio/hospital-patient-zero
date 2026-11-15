/**
 * Player level: experience (XP) earned by playing, coins at every level.
 * Shared by the server (authoritative) and the client (display).
 */
export const MAX_LEVEL = 100;

/** XP needed to go from `level` to `level + 1`. */
export const xpToNext = (level: number) => 100 + 50 * (level - 1);

export interface LevelInfo {
  level: number;
  /** XP already earned inside the current level */
  into: number;
  /** XP needed for the next level (0 at the max level) */
  need: number;
  xp: number;
}

export const levelOf = (xp: number): LevelInfo => {
  let level = 1;
  let rest = Math.max(0, Math.floor(xp));
  while (level < MAX_LEVEL && rest >= xpToNext(level)) {
    rest -= xpToNext(level);
    level++;
  }
  return { level, into: level >= MAX_LEVEL ? 0 : rest, need: level >= MAX_LEVEL ? 0 : xpToNext(level), xp: Math.floor(xp) };
};

/** Coins given when reaching `level`: a bigger bonus every 5 and 10 levels. */
export const levelReward = (level: number) => (level % 10 === 0 ? 500 : level % 5 === 0 ? 200 : 20 + level * 5);

/** XP for getting out, by difficulty (1 = Exploration … 5). */
export const ESCAPE_XP = [0, 40, 80, 110, 150, 200];
/** XP for a run that ended badly (you still learned something). */
export const DEATH_XP = 15;
/** XP for opening the free daily gift. */
export const DAILY_XP = 10;

/** Badge colour of a level. */
export const levelColor = (level: number) =>
  level >= 50 ? '#f472b6' : level >= 30 ? '#fbbf24' : level >= 20 ? '#c084fc' : level >= 10 ? '#38bdf8' : '#a1a1aa';
