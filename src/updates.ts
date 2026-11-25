/**
 * 📰 The game's updates, newest first. The first one pops up once for every
 * player after it goes online (then stays readable from the "Nouveautés" button).
 *
 * How to prepare the next one: add a new entry at the top while it's being
 * built, and only put it online when the whole update is finished.
 */
export interface GameUpdate {
  /** unique, never reused (used to remember who has seen it) */
  id: string;
  /** "Nouvelle mise à jour de …" */
  name: string;
  /** shown under the title, e.g. "25 novembre 2026" */
  date: string;
  /** ✨ new things */
  added: string[];
  /** 🔧 things that work differently */
  changed?: string[];
  /** 🗑️ things removed or made weaker */
  removed?: string[];
}

export const UPDATES: GameUpdate[] = [
  {
    id: '2026-chevaliers',
    name: 'Nouvelle mise à jour des Chevaliers',
    date: 'Décembre 2026',
    added: [
      "🏰 Chapitre 10 — Le Donjon : une crypte oubliée sous l'hôpital. Retrouve les 3 blasons du royaume, tire le levier et fuis par le pont-levis. Ouvert à tout le monde !",
      "⚔️ Le Patient Zéro en armure : dans le Donjon, ta lampe ne lui fait plus peur. Tu l'entends arriver de loin… Fais tomber une herse [E] devant lui pour le coincer !",
      "🐉 Le dragon : il dort dans l'aile est du Donjon. Marche accroupi… s'il se réveille, il crache du feu. Même le Patient Zéro en a peur !",
      "🗡️ L'épée dans la pierre : 3 essais bruyants pour l'arracher. Elle te sauve UNE fois du Chevalier.",
      "📜 5 parchemins racontent l'histoire de l'armure maudite. Trouve-les tous : un mur s'ouvre sur le trésor de l'ordre (+150 pièces).",
      "⚔️ Duel des Chevaliers : le Donjon à 2 en ligne (menu Multijoueur). Blason = 3 points, parchemin = 1, trésor = 2. Le meilleur gagne !",
      "👑 Quêtes du Roi : sors du Donjon, coince le Chevalier sous une herse, sors en Difficile et en moins de 6 minutes… et tu deviens « Sire » à côté de ton pseudo.",
      "⏳ ÉDITION LIMITÉE, seulement pendant le Tournoi des Chevaliers : skins Écuyer, Chevalier, Dragon et heaumes (Trésor du Royaume et boutique du Tournoi), Torche enflammée et Lanterne de château, Chevalier Noir et Patient Zéro Chevalier (sors du Donjon pendant le Tournoi), la musique « Le Donjon », et la chambre en château pour les « Sire ».",
    ],
  },
];

export const LATEST_UPDATE = UPDATES[0];

/**
 * 🔒 The Knights' update is online but only admins see it (to try it first).
 * Set to true to release it to everybody.
 */
export const KNIGHTS_PUBLIC = false;
/** its achievements, hidden from the others until then */
export const KNIGHTS_ACHS = ['ch10_end', 'king_herse', 'king_hard', 'king_fast'];

const SEEN_KEY = 'pz-update-seen';
export const updateSeen = (): boolean => {
  try {
    return localStorage.getItem(SEEN_KEY) === LATEST_UPDATE.id;
  } catch {
    return true;
  }
};
export const markUpdateSeen = () => {
  try {
    localStorage.setItem(SEEN_KEY, LATEST_UPDATE.id);
  } catch {
    /* private mode: it will show again, no big deal */
  }
};
