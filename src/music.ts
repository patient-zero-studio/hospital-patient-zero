/**
 * 🎵 Menu music: tracks to unlock (level, achievement or coins).
 * The sound itself is made live by the sound system (no audio files).
 */
export type TrackUnlock = { kind: 'free' } | { kind: 'level'; n: number } | { kind: 'ach'; id: string; label: string } | { kind: 'coins'; price: number } | { kind: 'limited'; label: string };

export interface MenuTrack {
  id: string;
  name: string;
  emoji: string;
  desc: string;
  unlock: TrackUnlock;
}

export const MENU_TRACKS: MenuTrack[] = [
  { id: 'aurore', name: 'Saint-Aurore', emoji: '🏥', desc: 'La boîte à musique cassée du menu, et son drone qui ne se pose jamais.', unlock: { kind: 'free' } },
  { id: 'berceuse', name: 'Berceuse brisée', emoji: '🧸', desc: 'Une comptine douce… qui déraille de temps en temps.', unlock: { kind: 'level', n: 5 } },
  { id: 'foret', name: 'La forêt la nuit', emoji: '🌲', desc: 'Vent, grillons, une chouette. Et des branches qui craquent.', unlock: { kind: 'ach', id: 'ch4_escape', label: 'Être secouru dans la forêt (Chapitre 4)' } },
  { id: 'choeur', name: 'Chœur des patients', emoji: '👻', desc: 'Des voix lointaines qui chantent dans les couloirs vides.', unlock: { kind: 'level', n: 15 } },
  { id: 'orage', name: 'Orage sur le toit', emoji: '⛈️', desc: 'La pluie, le tonnerre, et un piano abandonné.', unlock: { kind: 'ach', id: 'ch6_escape', label: 'S\'envoler du toit (Chapitre 6)' } },
  { id: 'neons', name: 'Néons du Site B', emoji: '🟣', desc: 'Synthés des années 80 sous la lumière violette.', unlock: { kind: 'coins', price: 400 } },
  { id: 'donjon', name: 'Le Donjon', emoji: '🏰', desc: 'Orgue, chœur et cloche d\'église, sous la crypte. Édition limitée.', unlock: { kind: 'limited', label: 'Sortir du Donjon pendant le Tournoi des Chevaliers (édition limitée)' } },
  { id: 'battement', name: 'Cœur qui bat', emoji: '💓', desc: 'Un rythme de cœur affolé, pour les nuits de poursuite.', unlock: { kind: 'coins', price: 800 } },
];

export const trackById = (id: string) => MENU_TRACKS.find((t) => t.id === id);

/** Can this player listen to the track as their menu music? */
export const trackUnlocked = (t: MenuTrack, p: { level: number; ach: Record<string, unknown>; owned: string[]; admin?: boolean }) => {
  if (p.admin) return true;
  switch (t.unlock.kind) {
    case 'free':
      return true;
    case 'level':
      return p.level >= t.unlock.n;
    case 'ach':
      return !!p.ach[t.unlock.id];
    case 'coins':
    case 'limited':
      return p.owned.includes(t.id);
  }
};

export const unlockText = (u: TrackUnlock) =>
  u.kind === 'level' ? `Niveau ${u.n}` : u.kind === 'ach' || u.kind === 'limited' ? u.label : u.kind === 'coins' ? `${u.price} pièces` : 'Offerte';
