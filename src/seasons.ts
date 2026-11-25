/**
 * Seasonal events (Christmas, Halloween, Easter, Valentine's day, April fools).
 * Shared by the server (which one is on, advent calendar, treats) and the
 * client (decorations, event shop, treats to pick up in the levels).
 */
export type Season = 'noel' | 'halloween' | 'paques' | 'valentin' | 'poisson' | 'chevaliers';
export const SEASONS: Season[] = ['noel', 'halloween', 'paques', 'valentin', 'poisson', 'chevaliers'];
/** What the admin chose: follow the calendar, force an event, or none. */
export type SeasonSetting = 'auto' | Season | 'off';

export interface SeasonInfo {
  name: string;
  emoji: string;
  color: string;
  accent: string;
  dates: string;
  /** banner title in the shop */
  title: string;
  banner: string;
  /** the treat you pick up in the levels during the event */
  treat: { one: string; many: string; emoji: string };
  /** bulb colours (garlands, menu) */
  bulbs: string[];
  /** menu animation: things falling or flying */
  falling: string[];
  fly: boolean;
}

export const SEASON_INFO: Record<Season, SeasonInfo> = {
  noel: {
    name: 'Noël',
    emoji: '🎄',
    color: '#ef4444',
    accent: '#22c55e',
    dates: 'du 1er décembre au 6 janvier',
    title: 'JOYEUX NOËL À SAINT-AURORE',
    banner: '🎄 ❄️ 🎅 ❄️ 🎄',
    treat: { one: 'sucre d\'orge', many: 'sucres d\'orge', emoji: '🍭' },
    bulbs: ['#ff2a2a', '#2aff5a', '#ffd21a', '#3a8aff', '#ff5ad8'],
    falling: ['❄', '❄', '❄', '❄', '❅'],
    fly: false,
  },
  halloween: {
    name: 'Halloween',
    emoji: '🎃',
    color: '#f97316',
    accent: '#a855f7',
    dates: 'du 1er octobre au 5 novembre',
    title: 'HALLOWEEN À SAINT-AURORE',
    banner: '🎃 🦇 👻 🦇 🎃',
    treat: { one: 'bonbon', many: 'bonbons', emoji: '🍬' },
    bulbs: ['#ff7a00', '#a040ff', '#7aff2a'],
    falling: ['🦇', '🦇', '👻', '🦇', '🕸️'],
    fly: true,
  },
  paques: {
    name: 'Pâques',
    emoji: '🐰',
    color: '#facc15',
    accent: '#a3e635',
    dates: 'la semaine avant et après Pâques',
    title: 'JOYEUSES PÂQUES À SAINT-AURORE',
    banner: '🥚 🐰 🌷 🐰 🥚',
    treat: { one: 'œuf en chocolat', many: 'œufs en chocolat', emoji: '🥚' },
    bulbs: ['#fde68a', '#a7f3d0', '#fbcfe8', '#bfdbfe', '#ddd6fe'],
    falling: ['🌸', '🌼', '🌷', '🌸', '🥚'],
    fly: false,
  },
  valentin: {
    name: 'Saint-Valentin',
    emoji: '💘',
    color: '#ec4899',
    accent: '#f43f5e',
    dates: 'du 7 au 16 février',
    title: 'SAINT-VALENTIN À SAINT-AURORE',
    banner: '💘 💕 🌹 💕 💘',
    treat: { one: 'cœur', many: 'cœurs', emoji: '💝' },
    bulbs: ['#ff2a6a', '#ff8ab8', '#ffffff', '#c8102e'],
    falling: ['💕', '❤️', '💗', '🌹', '💖'],
    fly: false,
  },
  poisson: {
    name: 'Poisson d\'avril',
    emoji: '🐟',
    color: '#38bdf8',
    accent: '#fb923c',
    dates: 'du 1er au 3 avril',
    title: 'POISSON D\'AVRIL !',
    banner: '🐟 🤡 🐠 🤡 🐟',
    treat: { one: 'poisson', many: 'poissons', emoji: '🐟' },
    bulbs: ['#38bdf8', '#fb923c', '#facc15', '#a3e635', '#f472b6'],
    falling: ['🐟', '🐠', '🐡', '🐟', '🫧'],
    fly: true,
  },
  // ⚔️ Started by an admin (no fixed date)
  chevaliers: {
    name: 'Tournoi des Chevaliers',
    emoji: '⚔️',
    color: '#d4a840',
    accent: '#3b5bdb',
    dates: "quand le roi l'annonce",
    title: 'LE TOURNOI DES CHEVALIERS',
    banner: '⚔️ 🛡️ 👑 🛡️ ⚔️',
    treat: { one: 'blason', many: 'blasons', emoji: '🛡️' },
    bulbs: ['#d4a840', '#3b5bdb', '#c8102e', '#f4f4f0'],
    falling: ['🛡️', '⚔️', '👑', '🏰', '🐉'],
    fly: false,
  },
};

/** Easter Sunday (Gregorian computus), as a UTC date. */
export const easterOf = (y: number) => {
  const a = y % 19;
  const b = Math.floor(y / 100);
  const c = y % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return Date.UTC(y, month - 1, day);
};

/**
 * The event of a date (UTC): Halloween Oct 1 → Nov 5, Christmas Dec 1 → Jan 6,
 * Valentine's day Feb 7 → 16, April fools Apr 1 → 3, Easter ± 7 days.
 */
export const seasonOn = (d = new Date()): Season | null => {
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  if (m === 10 || (m === 11 && day <= 5)) return 'halloween';
  if (m === 12 || (m === 1 && day <= 6)) return 'noel';
  if (m === 2 && day >= 7 && day <= 16) return 'valentin';
  if (m === 4 && day <= 3) return 'poisson';
  const today = Date.UTC(d.getUTCFullYear(), m - 1, day);
  if (Math.abs(today - easterOf(d.getUTCFullYear())) <= 7 * 86400000) return 'paques';
  return null;
};

export const resolveSeason = (setting: SeasonSetting, d = new Date()): Season | null =>
  setting === 'auto' ? seasonOn(d) : setting === 'off' ? null : setting;

export const isSeasonSetting = (v: unknown): v is SeasonSetting => v === 'auto' || v === 'off' || SEASONS.includes(v as Season);

/**
 * Advent calendar: last day that can be opened (0 = not started yet).
 * Box N opens on December N; after the 25th (until Jan 6) missed boxes can still be opened.
 */
export const adventDay = (d = new Date()) => {
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  if (m === 12) return Math.min(25, day);
  if (m === 1 && day <= 6) return 25;
  return 0;
};

/** The year of the Christmas season a date belongs to (January counts for the previous December). */
export const adventYear = (d = new Date()) => (d.getUTCMonth() === 0 ? d.getUTCFullYear() - 1 : d.getUTCFullYear());

// ---------------------------------------------------------------------------
// Client: the event currently shown (decorations, menu, shop)
// ---------------------------------------------------------------------------
let active: Season | null = seasonOn();
const listeners = new Set<(s: Season | null) => void>();

export const getActiveSeason = () => active;
export const setActiveSeason = (s: Season | null) => {
  if (s === active) return;
  active = s;
  listeners.forEach((fn) => fn(s));
};
export const onSeasonChange = (fn: (s: Season | null) => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
