/** 🛡️ Clans: shared constants (client + server) */
export const CLAN_PRICE = 100;
export const CLAN_MAX = 20;
export const CLAN_EMBLEMS = ['💀', '🩸', '🔥', '👁️', '🦇', '🐺', '⚡', '🌙', '🕷️', '☣️', '🗡️', '👑', '🧟', '🔦', '🏥', '🐀'];
export const CLAN_COLORS = ['#dc2626', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#ec4899', '#14b8a6', '#e4e4e7'];
export const CLAN_NAME_RE = /^[A-Za-zÀ-ÿ0-9 '_-]{3,20}$/;
export const CLAN_TAG_RE = /^[A-Z0-9]{2,4}$/;
/** Weekly prizes for each member of the 3 best clans */
export const CLAN_PRIZES = [300, 200, 100];
