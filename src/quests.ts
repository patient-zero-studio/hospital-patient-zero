/**
 * 📋 Daily quests: 3 a day (same for everyone), progress sent at the end of
 * every game (won or lost). Shared with the server (ids, goals, rewards).
 */
import { todayKey } from './economy';

export type QuestStat = 'hides' | 'chases' | 'docs' | 'escape' | 'nosprint' | 'distance' | 'unhurt' | 'cat' | 'uv' | 'coop' | 'gifts';

export interface QuestDef {
  id: string;
  text: string;
  stat: QuestStat;
  goal: number;
  coins: number;
  xp: number;
}

export const QUESTS: QuestDef[] = [
  { id: 'hides3', text: 'Utilise 3 cachettes', stat: 'hides', goal: 3, coins: 40, xp: 40 },
  { id: 'chases2', text: 'Sème 2 poursuites', stat: 'chases', goal: 2, coins: 60, xp: 60 },
  { id: 'docs2', text: 'Trouve 2 documents', stat: 'docs', goal: 2, coins: 40, xp: 40 },
  { id: 'escape1', text: 'Sors d\'un chapitre (Normal ou plus)', stat: 'escape', goal: 1, coins: 60, xp: 60 },
  { id: 'escape2', text: 'Sors de 2 chapitres (Normal ou plus)', stat: 'escape', goal: 2, coins: 90, xp: 90 },
  { id: 'nosprint', text: 'Sors d\'un chapitre sans jamais courir', stat: 'nosprint', goal: 1, coins: 80, xp: 80 },
  { id: 'walk500', text: 'Marche 500 m au total', stat: 'distance', goal: 500, coins: 40, xp: 40 },
  { id: 'unhurt', text: 'Sors d\'un chapitre sans être blessé', stat: 'unhurt', goal: 1, coins: 70, xp: 70 },
  { id: 'cat60', text: 'Laisse le chat noir te suivre 1 minute', stat: 'cat', goal: 60, coins: 50, xp: 50 },
  { id: 'uv3', text: 'Révèle 3 messages à la lampe UV', stat: 'uv', goal: 3, coins: 50, xp: 50 },
  { id: 'coop1', text: 'Joue une partie en coop', stat: 'coop', goal: 1, coins: 50, xp: 50 },
];
/** In December: golden gifts too */
export const XMAS_QUEST: QuestDef = { id: 'gifts2', text: 'Trouve 2 cadeaux dorés', stat: 'gifts', goal: 2, coins: 60, xp: 60 };

/** Coins + XP when the 3 quests of the day are done */
export const QUEST_BONUS = { coins: 150, xp: 100 };

const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

/** The 3 quests of a day (no two with the same stat) */
export const dailyQuests = (day = todayKey(), xmas = false): QuestDef[] => {
  const pool = xmas ? [...QUESTS, XMAS_QUEST] : QUESTS;
  const out: QuestDef[] = [];
  let h = hash(day + 'quests');
  for (let guard = 0; out.length < 3 && guard < 50; guard++) {
    const q = pool[h % pool.length];
    h = Math.imul(h ^ 0x9e3779b9, 16777619) >>> 0;
    if (!out.some((o) => o.stat === q.stat)) out.push(q);
  }
  return out;
};

/** What a finished game sends to the server */
export type QuestRun = Partial<Record<QuestStat, number>>;
