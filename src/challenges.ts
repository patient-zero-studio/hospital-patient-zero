/**
 * Daily challenge: the same for everyone, changes at midnight (UTC).
 * Win it once a day by getting out (difficulty 2+) with the challenge switched on.
 */
import { todayKey } from './economy';

export type ChallengeId = 'dim' | 'pack3' | 'nosprint' | 'horde' | 'clock' | 'dive' | 'fast' | 'inverted' | 'fog' | 'nohide' | 'nolamp' | 'giant';

export interface ChallengeDef {
  id: ChallengeId;
  name: string;
  desc: string;
  icon: string;
  reward: number;
  /** must be played in this chapter */
  chapter?: 1 | 2;
  /** must get out in under N seconds */
  timeLimit?: number;
}

export const CHALLENGES: ChallengeDef[] = [
  { id: 'dim', name: 'Piles usées', desc: 'Votre lampe se vide 3 fois plus vite.', icon: '🔋', reward: 150 },
  { id: 'pack3', name: 'Mains liées', desc: 'Seulement 3 objets dans les mains au lieu de 5.', icon: '🎒', reward: 150 },
  { id: 'nosprint', name: 'Jambes de plomb', desc: 'Impossible de courir.', icon: '🦵', reward: 175 },
  { id: 'horde', name: 'La Horde', desc: 'Un monstre de plus vous traque.', icon: '☠️', reward: 175 },
  { id: 'clock', name: 'Contre la montre', desc: 'Sortez en moins de 6 minutes.', icon: '⏱️', reward: 150, timeLimit: 360 },
  { id: 'dive', name: 'Plongée', desc: 'Chapitre 2 obligatoire, et la lampe se vide 2 fois plus vite.', icon: '🐀', reward: 200, chapter: 2 },
  // --- Mutators: weird rules ---
  { id: 'fast', name: 'Monstres sous adrénaline', desc: 'Les monstres sont 40 % plus rapides.', icon: '⚡', reward: 225 },
  { id: 'inverted', name: 'Tête à l\'envers', desc: 'Gauche et droite sont inversées.', icon: '🙃', reward: 200 },
  { id: 'fog', name: 'Brouillard', desc: 'Un brouillard épais : on voit à peine à 5 mètres.', icon: '🌫️', reward: 175 },
  { id: 'nohide', name: 'Nulle part où se cacher', desc: 'Impossible de se cacher dans les casiers et les lits.', icon: '🚫', reward: 225 },
  { id: 'nolamp', name: 'Pile à plat', desc: 'La lampe démarre à 15 % et les piles ne rechargent que 25 %.', icon: '🪫', reward: 200 },
  { id: 'giant', name: 'Géants', desc: 'Les monstres sont immenses… et vous entendent de plus loin.', icon: '🗿', reward: 175 },
];

export const CHALLENGE_BY_ID = new Map(CHALLENGES.map((c) => [c.id, c]));

/** Today's challenge (same for every player). */
export const dailyChallenge = (day = todayKey()): ChallengeDef => {
  let h = 2166136261;
  for (let i = 0; i < day.length; i++) h = Math.imul(h ^ day.charCodeAt(i), 16777619);
  return CHALLENGES[(h >>> 0) % CHALLENGES.length];
};

/** Did this run meet the challenge's own conditions (besides the modifiers)? */
export const challengeMet = (c: ChallengeDef, run: { chapter: number; difficulty: number; time: number }) =>
  run.difficulty >= 2 && (!c.chapter || run.chapter === c.chapter) && (!c.timeLimit || run.time <= c.timeLimit);

/** "4:07" */
export const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
