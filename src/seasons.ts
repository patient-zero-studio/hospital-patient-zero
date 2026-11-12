/**
 * Seasonal events (Christmas, Halloween). Shared by the server (which one is
 * on, advent calendar) and the client (decorations, event shop).
 */
export type Season = 'noel' | 'halloween';
/** What the admin chose: follow the calendar, force an event, or none. */
export type SeasonSetting = 'auto' | Season | 'off';

export const SEASON_INFO: Record<Season, { name: string; emoji: string; color: string; accent: string; dates: string }> = {
  noel: { name: 'Noël', emoji: '🎄', color: '#ef4444', accent: '#22c55e', dates: 'du 1er décembre au 6 janvier' },
  halloween: { name: 'Halloween', emoji: '🎃', color: '#f97316', accent: '#a855f7', dates: 'du 1er octobre au 5 novembre' },
};

/** The event of a date (UTC): Halloween Oct 1 → Nov 5, Christmas Dec 1 → Jan 6. */
export const seasonOn = (d = new Date()): Season | null => {
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  if (m === 10 || (m === 11 && day <= 5)) return 'halloween';
  if (m === 12 || (m === 1 && day <= 6)) return 'noel';
  return null;
};

export const resolveSeason = (setting: SeasonSetting, d = new Date()): Season | null =>
  setting === 'auto' ? seasonOn(d) : setting === 'off' ? null : setting;

export const isSeasonSetting = (v: unknown): v is SeasonSetting => v === 'auto' || v === 'off' || v === 'noel' || v === 'halloween';

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
