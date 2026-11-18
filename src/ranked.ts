/**
 * 🏅 Ranked seasons (one per month): points won by escaping, lost when caught.
 * Bois → Bronze → Métal → Or → Diamant → Jade → Pro. Everyone starts again at
 * Bois on the 1st of the month, with a reward for the tier reached.
 */
export interface RankTier {
  id: string;
  name: string;
  emoji: string;
  color: string;
  /** points needed */
  min: number;
  /** points lost when caught at this tier */
  loss: number;
  /** coins at the end of the season */
  reward: number;
}

export const RANK_TIERS: RankTier[] = [
  { id: 'bois', name: 'Bois', emoji: '🪵', color: '#a0703c', min: 0, loss: 0, reward: 0 },
  { id: 'bronze', name: 'Bronze', emoji: '🥉', color: '#cd7f32', min: 100, loss: 5, reward: 100 },
  { id: 'metal', name: 'Métal', emoji: '⚙️', color: '#9ca3af', min: 300, loss: 8, reward: 200 },
  { id: 'or', name: 'Or', emoji: '🥇', color: '#fbbf24', min: 600, loss: 12, reward: 400 },
  { id: 'diamant', name: 'Diamant', emoji: '💎', color: '#67e8f9', min: 1000, loss: 15, reward: 700 },
  { id: 'jade', name: 'Jade', emoji: '🟢', color: '#10b981', min: 1500, loss: 20, reward: 1000 },
  { id: 'pro', name: 'Pro', emoji: '👑', color: '#f43f5e', min: 2200, loss: 25, reward: 1500 },
];

export const tierOf = (points: number): RankTier => {
  let t = RANK_TIERS[0];
  for (const x of RANK_TIERS) if (points >= x.min) t = x;
  return t;
};
export const nextTier = (points: number): RankTier | null => RANK_TIERS.find((x) => x.min > points) ?? null;

/** Points for an escape: harder difficulty and later chapters give more */
export const RANK_WIN: Record<number, number> = { 2: 20, 3: 30, 4: 45, 5: 60 };
export const rankWin = (difficulty: number, chapter: number) => (RANK_WIN[difficulty] ?? 0) + Math.max(0, Math.min(8, chapter) - 1) * 3;

// ---------------------------------------------------------------------------
// 🎁 Ranked pass: every ranked win gives pass XP, 20 tiers of rewards (monthly)
// ---------------------------------------------------------------------------
export const RPASS_TIERS = 20;
export const RPASS_XP_PER_TIER = 100;
/** Pass XP for a ranked win: Normal 25, Difficile 35, Cauchemar 45, Enfer 55 */
export const rpassWinXp = (difficulty: number) => (difficulty >= 2 ? 25 + 10 * (Math.min(5, difficulty) - 2) : 0);

export type RPassReward = { kind: 'coins'; coins: number } | { kind: 'supplies'; count: number } | { kind: 'box'; box: 'rare' | 'mythique' | 'legendaire' } | { kind: 'skin'; skin: string };
/** Exclusive skins at tiers 10, 15 and 20, boxes at 5, 12 and 18 */
export const rpassReward = (t: number): RPassReward => {
  if (t === 10) return { kind: 'skin', skin: 'm-rank-gladiator' };
  if (t === 15) return { kind: 'skin', skin: 'hfx-rank-stars' };
  if (t === 20) return { kind: 'skin', skin: 'h-rank-champion' };
  if (t === 5) return { kind: 'box', box: 'rare' };
  if (t === 12) return { kind: 'box', box: 'mythique' };
  if (t === 18) return { kind: 'box', box: 'legendaire' };
  if (t % 4 === 3) return { kind: 'supplies', count: 2 + Math.floor(t / 8) };
  return { kind: 'coins', coins: 50 + t * 5 };
};

/** A caught player loses points, but never drops below the floor of their tier */
export const rankLoss = (points: number) => {
  const t = tierOf(points);
  return Math.min(t.loss, points - t.min);
};
