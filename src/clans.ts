/** 🛡️ Clans: shared constants (client + server) */
export const CLAN_PRICE = 100;
export const CLAN_MAX = 20;
export const CLAN_EMBLEMS = ['💀', '🩸', '🔥', '👁️', '🦇', '🐺', '⚡', '🌙', '🕷️', '☣️', '🗡️', '👑', '🧟', '🔦', '🏥', '🐀'];
export const CLAN_COLORS = ['#dc2626', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#ec4899', '#14b8a6', '#e4e4e7'];
export const CLAN_NAME_RE = /^[A-Za-zÀ-ÿ0-9 '_-]{3,20}$/;
export const CLAN_TAG_RE = /^[A-Z0-9]{2,4}$/;
/** Weekly prizes for each member of the 3 best clans */
export const CLAN_PRIZES = [300, 200, 100];

/** 💰 Clan chest: coins put together unlock skins for every member */
export const CLAN_CHEST_LEVELS = [
  { coins: 3000, skin: 'h-clan-knight' },
  { coins: 10000, skin: 'm-clan-beast' },
  { coins: 30000, skin: 'hfx-clan-embers' },
];
/** ⚔️ Weekend clan war: prizes for each member */
export const WAR_WIN = 300;
export const WAR_TIE = 150;
export const WAR_LOSS = 50;
/** Saturday (UTC) of the weekend `d` belongs to, or null on weekdays */
export const warKey = (d = new Date()): string | null => {
  const day = d.getUTCDay();
  if (day !== 6 && day !== 0) return null;
  const sat = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - (day === 0 ? 1 : 0)));
  return sat.toISOString().slice(0, 10);
};
/** End of the weekend (Monday 00:00 UTC) or start of the next one (Saturday 00:00 UTC) */
export const warEnds = (d = new Date()) => {
  const day = d.getUTCDay();
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + (day === 0 ? 1 : 2));
};
export const nextWarStart = (d = new Date()) => {
  const day = d.getUTCDay();
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + ((6 - day + 7) % 7 || 7));
};
