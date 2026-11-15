/**
 * Long-term goals: weekly challenges, the monthly season pass and the skins
 * given at some levels. Shared by the server (authoritative) and the client.
 */
import type { StatKey } from './achievements';

// ---------------------------------------------------------------------------
// Weekly challenges (3 per week, same for everyone, new ones every Monday UTC)
// ---------------------------------------------------------------------------
/** Monday (UTC) of the week of `d`, as YYYY-MM-DD. */
export const weekKey = (d = new Date()) => {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
  return x.toISOString().slice(0, 10);
};
/** Next Monday 00:00 UTC. */
export const nextWeek = (d = new Date()) => {
  const x = new Date(weekKey(d) + 'T00:00:00Z');
  x.setUTCDate(x.getUTCDate() + 7);
  return x.getTime();
};

/** What a weekly challenge counts: an achievement counter, or escapes in Difficult+. */
export type WeeklyCounter = StatKey | 'hard';
export interface WeeklyDef {
  id: string;
  icon: string;
  title: string;
  counter: WeeklyCounter;
  goal: number;
  coins: number;
  xp: number;
}
export const WEEKLY_POOL: WeeklyDef[] = [
  { id: 'esc3', icon: '🚪', title: 'Sors 3 fois de l\'hôpital', counter: 'escapes', goal: 3, coins: 150, xp: 120 },
  { id: 'esc6', icon: '🏃', title: 'Sors 6 fois (n\'importe quel chapitre)', counter: 'escapes', goal: 6, coins: 250, xp: 200 },
  { id: 'hard1', icon: '☠️', title: 'Sors en difficulté Difficile ou plus', counter: 'hard', goal: 1, coins: 250, xp: 200 },
  { id: 'hard3', icon: '💀', title: 'Sors 3 fois en Difficile ou plus', counter: 'hard', goal: 3, coins: 400, xp: 300 },
  { id: 'hide15', icon: '🗄️', title: 'Cache-toi 15 fois', counter: 'hides', goal: 15, coins: 150, xp: 120 },
  { id: 'coins60', icon: '🪙', title: 'Ramasse 60 pièces pendant tes parties', counter: 'coinsFound', goal: 60, coins: 200, xp: 150 },
  { id: 'box3', icon: '🎁', title: 'Ouvre 3 boîtes ou cadeaux', counter: 'boxes', goal: 3, coins: 150, xp: 100 },
  { id: 'flip5', icon: '🥫', title: 'Réussis 5 bottle flips (maintiens B)', counter: 'flips', goal: 5, coins: 200, xp: 150 },
];

/** The 3 challenges of a week (deterministic). */
export const weeklyChallenges = (key = weekKey()): WeeklyDef[] => {
  let h = 2166136261;
  for (const c of key) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const pool = [...WEEKLY_POOL];
  const out: WeeklyDef[] = [];
  while (out.length < 3 && pool.length) {
    h = Math.imul(h ^ (h >>> 13), 0x5bd1e995) >>> 0;
    const pick = pool.splice(h % pool.length, 1)[0];
    // Never two challenges on the same counter
    if (out.some((o) => o.counter === pick.counter)) continue;
    out.push(pick);
  }
  return out;
};

// ---------------------------------------------------------------------------
// Season pass: 30 tiers filled with the XP earned during the month (free)
// ---------------------------------------------------------------------------
export const PASS_TIERS = 30;
export const PASS_XP_PER_TIER = 100;
export const passKey = (d = new Date()) => d.toISOString().slice(0, 7);
export const passEnds = (d = new Date()) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
export const passName = (key = passKey()) => `Saison de ${MONTHS[Number(key.slice(5, 7)) - 1]}`;

export type PassReward = { kind: 'coins'; coins: number } | { kind: 'supplies'; count: number } | { kind: 'box'; box: 'rare' | 'mythique' | 'legendaire' } | { kind: 'skin'; skin: string };

/** Reward of tier `t` (1..30): skins at 10, 20 and 30, boxes every 5, coins otherwise. */
export const passReward = (t: number): PassReward => {
  if (t === 10) return { kind: 'skin', skin: 'h-pass-crown' };
  if (t === 20) return { kind: 'skin', skin: 'm-pass-toxic' };
  if (t === 30) return { kind: 'skin', skin: 'h-pass-hazmat' };
  if (t === 25) return { kind: 'box', box: 'legendaire' };
  if (t % 5 === 0) return { kind: 'box', box: t >= 15 ? 'mythique' : 'rare' };
  if (t % 3 === 0) return { kind: 'supplies', count: 2 + Math.floor(t / 10) };
  return { kind: 'coins', coins: 40 + t * 5 };
};

// ---------------------------------------------------------------------------
// Skins given when reaching some levels
// ---------------------------------------------------------------------------
export const LEVEL_SKINS: { level: number; skin: string }[] = [
  { level: 10, skin: 'h-lvl-goggles' },
  { level: 25, skin: 'm-lvl-abyss' },
  { level: 50, skin: 'h-lvl-veteran' },
  { level: 100, skin: 'm-lvl-legend' },
];
