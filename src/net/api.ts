/** Account API (username + password). The session token lives in localStorage. */
import { Appearance, DEFAULT_APPEARANCE, sanitizeAppearance } from '../appearance';

import type { BoxId, BoxResult, SupplyKind, Wallet } from '../economy';
import type { AchState, StatKey } from '../achievements';
import type { Season, SeasonSetting } from '../seasons';
import type { LevelInfo } from '../levels';
import type { WeeklyDef } from '../progression';

export type BoostKind = 'coins2' | 'treats2' | 'xp2' | 'all2';
export interface Boost {
  kind: BoostKind;
  until: number;
}

const TOKEN_KEY = 'hospital-pz-token';

export interface WalletView {
  wallet: Wallet;
  /** ⭐ stars per chapter (bitmask) */
  stars?: Record<string, number>;
  /** ids of today's offers */
  shop: string[];
  day: string;
  /** timestamp of the next shop rotation */
  nextReset: number;
  /** admin account: infinite coins, can gift coins */
  admin?: boolean;
  /** free daily gift not opened yet today */
  dailyAvailable?: boolean;
  /** consecutive days (1..7) */
  dailyStreak?: number;
  /** achievements unlocked + counters */
  ach?: AchState;
  /** achievements unlocked by this very request */
  newAch?: string[];
  /** 🔪 coins won for an Imposteur win (in this very request) */
  impCoins?: number;
  /** today's challenge and whether this account already won it */
  challenge?: { id: string; done: boolean };
  /** player level (XP) */
  level?: LevelInfo;
  /** 💝 gifts / news received, shown once */
  inbox?: { from: string; text: string; at: number }[];
  trophies?: { week: string; place: number }[];
  /** 🗓️ weekly challenges */
  weekly?: { resetAt: number; list: (WeeklyDef & { progress: number; claimed: boolean })[] };
  /** 🏆 season pass of the month */
  pass?: { key: string; name: string; xp: number; tier: number; claimed: number[]; ends: number };
  /** ⚡ surprise event on (double coins / treats / XP) */
  boost?: Boost | null;
  /** false until the player escapes once (Exploration is enough) */
  shopUnlocked?: boolean;
  /** event currently on (Christmas / Halloween) */
  season?: Season | null;
  /** admins only: what the event switch is set to */
  seasonSetting?: SeasonSetting;
  /** ids sold in the event shop */
  seasonShop?: string[];
  /** advent calendar (Christmas only): last box that can be opened + boxes already opened */
  advent?: { open: number; claimed: number[] };
  /** ⏱️ personal bests, "chapter-difficulty" → seconds */
  bests?: Record<string, number>;
  /** 📣 friends brought in with your link (paid), and who brought you */
  referrals?: number;
  referredBy?: string | null;
  /** 🎵 menu tracks bought */
  tracks?: string[];
  /** 🖼️ endings seen, documents found */
  gallery?: { endings: string[]; docs: string[]; beasts?: string[]; items?: string[] };
  /** 🛡️ your clan's tag */
  clanTag?: string | null;
  /** 🏅 ranked season */
  ranked?: RankedSelf;
}

export interface RankedSelf {
  season: string;
  name: string;
  ends: number;
  points: number;
  tier: string;
  next: { id: string; min: number } | null;
  wins: number;
  losses: number;
  history: { season: string; tier: string; points: number }[];
  /** 🎁 ranked pass */
  pass: { xp: number; tier: number; claimed: number[] };
}
export interface RankedView extends RankedSelf {
  rank: number | null;
  counts: Record<string, number>;
  top: { username: string; points: number; tier: string; level: number; clan: string | null }[];
}

export interface ClanSummary {
  id: string;
  name: string;
  tag: string;
  emblem: string;
  color: string;
  open: boolean;
  members: number;
  score: number;
}
export interface ClansView {
  price: number;
  max: number;
  top: (ClanSummary & { rank: number; requested: boolean })[];
  mine:
    | (ClanSummary & {
        rank: number;
        leader: string;
        isLeader: boolean;
        members: { username: string; level: number; weekXp: number; status: 'playing' | 'online' | 'offline'; leader: boolean }[];
        requests: string[];
        chat: { from: string; text: string; at: number; mine: boolean }[];
        chest: { coins: number; top: { username: string; coins: number }[] };
        war: {
          active: boolean;
          inWar: boolean;
          ends: number;
          next: number;
          us?: number;
          them?: number;
          enemy?: { name: string; tag: string; emblem: string; color: string } | null;
        };
        warsWon: number;
        warsPlayed: number;
        lastWar: { enemy: string; tag: string; us: number; them: number; result: 'win' | 'tie' | 'loss' } | null;
      })
    | null;
}

export interface DmView {
  with: string;
  status: 'playing' | 'online' | 'offline';
  messages: { from: string; text: string; at: number; mine: boolean }[];
}

export interface GiftCodeView {
  code: string;
  coins: number;
  skin?: string;
  treats?: number;
  max: number;
  used: number;
  until: number;
  by: string;
  at: number;
}

// 📣 Referral link: remember who invited us (until we sign up)
try {
  const ref = new URLSearchParams(location.search).get('ref');
  if (ref && /^[A-Za-z0-9_-]{3,16}$/.test(ref)) {
    localStorage.setItem('pz-ref', ref);
    history.replaceState(null, '', location.pathname);
  }
} catch {
  /* ignore */
}
const savedRef = () => {
  try {
    return localStorage.getItem('pz-ref') ?? undefined;
  } catch {
    return undefined;
  }
};

const getJson = async (url: string, token: string) => {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Serveur injoignable.');
  return data;
};

export interface FriendsView {
  friends: { username: string; status: 'playing' | 'online' | 'offline'; level?: number; unread?: number; watchable?: boolean }[];
  requests: string[];
  /** requests you sent, still waiting */
  sent?: string[];
  invites: { from: string; code: string; mode: string; chapter: number; difficulty: number }[];
  /** you host a room waiting for a partner */
  canInvite: boolean;
  message?: string;
}

export interface WeeklyBoardView {
  resetAt: number;
  prizes: number[];
  top: { username: string; xp: number; level: number }[];
  me: { rank: number | null; xp: number } | null;
  lastPodium: { username: string; xp: number; place: number }[];
}

export interface PlayerProfileView {
  trophies?: { week: string; place: number }[];
  username: string;
  level: LevelInfo;
  admin: boolean;
  since?: string;
  status: 'playing' | 'online' | 'offline';
  stats: Partial<Record<StatKey, number>>;
  achievements: number;
  skins: number;
  records: { board: string; time: number; rank: number }[];
  look: Appearance;
  friend: boolean;
  me: boolean;
  clan?: { name: string; tag: string; emblem: string; color: string } | null;
  ranked?: { tier: string; points: number; history: { season: string; tier: string; points: number }[] };
}

export interface BoardEntry {
  username: string;
  time: number;
  date: string;
  level?: number;
  /** survival: last wave reached */
  wave?: number;
}

export interface AdminUser {
  username: string;
  coins: number;
  admin: boolean;
  banned?: boolean;
  level?: number;
  createdAt?: string;
}

export interface AdminStats {
  accounts: number;
  banned: number;
  online: number;
  playing: number;
  rooms: number;
  coins: number;
  shopUnlocked: number;
  days: { day: string; signups: number; escapes: number; deaths: number; players: number }[];
  topSkins: { name: string; count: number }[];
  levels: Record<string, number>;
}

export interface Session {
  token: string;
  username: string;
}

// Per-tab session first (two accounts can play in two tabs of the same browser),
// then the last login of this browser (stay logged in after closing it).
const readToken = () => {
  try {
    return sessionStorage.getItem(TOKEN_KEY) ?? localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};
const writeToken = (t: string | null) => {
  try {
    if (t) {
      sessionStorage.setItem(TOKEN_KEY, t);
      localStorage.setItem(TOKEN_KEY, t);
    } else {
      sessionStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(TOKEN_KEY);
    }
  } catch {
    /* ignore */
  }
};

const post = async (url: string, body: unknown, token?: string) => {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Serveur injoignable.');
  return data;
};

export const api = {
  async register(username: string, password: string): Promise<Session> {
    const s = await post('/api/register', { username, password, ref: savedRef() });
    writeToken(s.token);
    return s;
  },
  async login(username: string, password: string): Promise<Session> {
    const s = await post('/api/login', { username, password });
    writeToken(s.token);
    return s;
  },
  /** Restores the saved session, or null if expired / no server. */
  async restore(): Promise<Session | null> {
    const token = readToken();
    if (!token) return null;
    try {
      const res = await fetch('/api/me', { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        writeToken(null);
        return null;
      }
      const { username } = await res.json();
      return { token, username };
    } catch {
      return null;
    }
  },
  /** Customised colours of the account (defaults if never set). */
  async getProfile(token: string): Promise<Appearance> {
    try {
      const res = await fetch('/api/profile', { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return DEFAULT_APPEARANCE;
      return sanitizeAppearance(await res.json());
    } catch {
      return DEFAULT_APPEARANCE;
    }
  },
  async saveProfile(token: string, a: Appearance): Promise<Appearance> {
    const res = await fetch('/api/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(a),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Sauvegarde impossible.');
    return sanitizeAppearance(data);
  },
  // ---- Coins, shop, boxes, hobo ----
  async getWallet(token: string): Promise<WalletView> {
    const res = await fetch('/api/wallet', { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Serveur injoignable.');
    return data;
  },
  ranked: (token: string): Promise<RankedView> => getJson('/api/ranked', token),
  stars: (token: string, chapter: number, mask: number): Promise<WalletView & { before: number; after: number; bonus: number }> => post('/api/stars', { chapter, mask }, token),
  claimRankedPass: (token: string, tier: number): Promise<WalletView & { result: BoxResult }> => post('/api/rpass/claim', { tier }, token),
  reward: (token: string, difficulty: number, found: number, chapter = 1, ranked = false): Promise<WalletView & { gained: number; xp?: number; rankGain?: { gain: number; points: number; tier: string; promoted: boolean; passXp?: number } | null }> =>
    post('/api/wallet/reward', { difficulty, found, chapter, ranked }, token),
  claimWeekly: (token: string, id: string): Promise<WalletView & { result: BoxResult }> => post('/api/weekly/claim', { id }, token),
  claimPass: (token: string, tier: number): Promise<WalletView & { result: BoxResult }> => post('/api/pass/claim', { tier }, token),
  xmasReward: (token: string, presents: number): Promise<WalletView & { message: string }> => post('/api/event/xmas', { presents }, token),
  claimDaily: (token: string): Promise<WalletView & { result: BoxResult }> => post('/api/shop/daily', {}, token),
  /** Event treats picked up during a run (sent when it ends, win or lose). */
  addTreats: (token: string, count: number, chests = 0): Promise<WalletView & { added: number }> => post('/api/event/treats', { count, chests }, token),
  openEventBox: (token: string): Promise<WalletView & { result: BoxResult }> => post('/api/event/box', {}, token),
  claimAdvent: (token: string, day: number): Promise<WalletView & { result: BoxResult }> => post('/api/shop/advent', { day }, token),
  /** Event + surprise boost on for everyone (undefined = server unreachable). */
  async status(): Promise<{ season: Season | null; boost: Boost | null } | undefined> {
    try {
      const res = await fetch('/api/season');
      if (!res.ok) return undefined;
      const d = await res.json();
      return { season: d.season ?? null, boost: d.boost ?? null };
    } catch {
      return undefined;
    }
  },
  submitSurvival: (token: string, time: number, wave: number): Promise<WalletView & { record: boolean; rank: number | null; coins: number; xp: number }> =>
    post('/api/survival', { time, wave }, token),
  xpDeath: (token: string, difficulty = 1, ranked = false): Promise<WalletView & { xp: number; rankLost?: number }> => post('/api/xp/death', { difficulty, ranked }, token),
  adminBoost: (token: string, kind: BoostKind | null, hours: number): Promise<WalletView> => post('/api/admin/boost', { kind, hours }, token),
  /** Event on for everyone (null = none, undefined = server unreachable). */
  async season(): Promise<Season | null | undefined> {
    try {
      const res = await fetch('/api/season');
      if (!res.ok) return undefined;
      return (await res.json()).season ?? null;
    } catch {
      return undefined;
    }
  },
  adminSeason: (token: string, season: SeasonSetting): Promise<WalletView> => post('/api/admin/season', { season }, token),
  buyCosmetic: (token: string, id: string): Promise<WalletView> => post('/api/shop/buy', { id }, token),
  openBox: (token: string, box: BoxId): Promise<WalletView & { result: BoxResult }> => post('/api/shop/box', { box }, token),
  buyGoods: (token: string, kind: string): Promise<WalletView> => post('/api/hobo/buy', { kind }, token),
  takeStash: (token: string, kind: SupplyKind): Promise<WalletView> => post('/api/hobo/stash', { kind }, token),
  submitRun: (
    token: string,
    run: { chapter: number; difficulty: number; time: number; challenge: boolean }
  ): Promise<WalletView & { record: boolean; rank: number | null; challengeWon: number }> => post('/api/run', run, token),
  async leaderboard(): Promise<Record<string, BoardEntry[]>> {
    const res = await fetch('/api/leaderboard');
    if (!res.ok) throw new Error('Serveur injoignable.');
    return (await res.json()).boards ?? {};
  },
  reportAch: (token: string, unlock: string[], stats: Partial<Record<StatKey, number>>): Promise<WalletView> =>
    post('/api/achievements', { unlock, stats }, token),

  async player(token: string, name: string): Promise<PlayerProfileView> {
    const res = await fetch(`/api/player/${encodeURIComponent(name)}`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Serveur injoignable.');
    return { ...data, look: sanitizeAppearance(data.look) };
  },
  async weeklyBoard(): Promise<WeeklyBoardView> {
    const t = readToken();
    const res = await fetch('/api/weekly-board', { headers: t ? { Authorization: `Bearer ${t}` } : {} });
    if (!res.ok) throw new Error('Serveur injoignable.');
    return res.json();
  },
  gift: (token: string, to: string, what: { coins?: number; skin?: string }): Promise<WalletView & { message: string }> => post('/api/friends/gift', { to, ...what }, token),
  inboxClear: (token: string): Promise<WalletView> => post('/api/inbox/clear', {}, token),
  async pushKey(): Promise<string | null> {
    try {
      return (await (await fetch('/api/push/key')).json()).key ?? null;
    } catch {
      return null;
    }
  },
  pushSubscribe: (token: string, sub: PushSubscriptionJSON) => post('/api/push/subscribe', { sub }, token),
  pushUnsubscribe: (token: string, endpoint: string) => post('/api/push/unsubscribe', { endpoint }, token),
  async adminBackups(token: string): Promise<{ days: string[]; accounts: number }> {
    const res = await fetch('/api/admin/backups', { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Serveur injoignable.');
    return data;
  },
  report: (token: string, username: string, reason: string, note: string): Promise<{ message: string }> => post('/api/report', { username, reason, note }, token),
  async adminReports(token: string): Promise<{ id: string; target: string; by: string; reason: string; note: string; at: number; banned: boolean }[]> {
    const res = await fetch('/api/admin/reports', { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Serveur injoignable.');
    return data;
  },
  adminReportDone: (token: string, id: string) => post('/api/admin/reports/done', { id }, token),
  adminRestore: (token: string, day: string): Promise<{ message: string }> => post('/api/admin/restore', { day }, token),
  // ---- Friends ----
  async friends(token: string): Promise<FriendsView> {
    const res = await fetch('/api/friends', { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Serveur injoignable.');
    return data;
  },
  friendAdd: (token: string, username: string): Promise<FriendsView> => post('/api/friends/add', { username }, token),
  friendAccept: (token: string, username: string): Promise<FriendsView> => post('/api/friends/accept', { username }, token),
  friendRemove: (token: string, username: string): Promise<FriendsView> => post('/api/friends/remove', { username }, token),
  friendInvite: (token: string, username: string): Promise<FriendsView> => post('/api/friends/invite', { username }, token),
  inviteDismiss: (token: string, code: string): Promise<FriendsView> => post('/api/friends/invite/dismiss', { code }, token),

  // ---- 🛡️ Clans, 🎵 music, 🖼️ gallery ----
  clans: (token: string, q = ''): Promise<ClansView> => getJson('/api/clans' + (q ? `?q=${encodeURIComponent(q)}` : ''), token),
  clanCreate: (token: string, c: { name: string; tag: string; emblem: string; color: string; open: boolean }): Promise<ClansView & { message: string }> =>
    post('/api/clans/create', c, token),
  clanJoin: (token: string, id: string): Promise<ClansView & { message: string }> => post('/api/clans/join', { id }, token),
  clanLeave: (token: string): Promise<ClansView & { message: string }> => post('/api/clans/leave', {}, token),
  clanManage: (
    token: string,
    action: 'accept' | 'refuse' | 'kick' | 'lead' | 'settings',
    username?: string,
    settings?: { open?: boolean; emblem?: string; color?: string }
  ): Promise<ClansView> => post('/api/clans/manage', { action, username, ...settings }, token),
  clanChat: (token: string, text: string): Promise<ClansView> => post('/api/clans/chat', { text }, token),
  clanDeposit: (token: string, coins: number): Promise<ClansView & { message: string; wallet: WalletView }> => post('/api/clans/deposit', { coins }, token),
  adminClanDelete: (token: string, id: string): Promise<{ message: string }> => post('/api/admin/clans/delete', { id }, token),
  buyTrack: (token: string, id: string): Promise<WalletView & { message: string }> => post('/api/music/buy', { id }, token),
  gallery: (
    token: string,
    docs: string[],
    ending?: string,
    beasts: string[] = [],
    items: string[] = []
  ): Promise<{ gallery: { endings: string[]; docs: string[]; beasts?: string[]; items?: string[] } }> => post('/api/gallery', { docs, ending, beasts, items }, token),

  // ---- 🎟️ Codes, 💬 chat, 👀 spectator ----
  redeem: (token: string, code: string): Promise<WalletView & { message: string }> => post('/api/redeem', { code }, token),
  dm: (token: string, name: string): Promise<DmView> => getJson(`/api/dm/${encodeURIComponent(name)}`, token),
  dmSend: (token: string, to: string, text: string): Promise<{ ok: boolean; text: string }> => post('/api/dm', { to, text }, token),
  adminCodes: (token: string): Promise<GiftCodeView[]> => getJson('/api/admin/codes', token),
  adminCodeCreate: (
    token: string,
    c: { code?: string; coins?: number; treats?: number; skin?: string; max?: number; days?: number }
  ): Promise<{ message: string; codes: GiftCodeView[] }> => post('/api/admin/codes', c, token),
  adminCodeDelete: (token: string, code: string): Promise<{ message: string; codes: GiftCodeView[] }> => post('/api/admin/codes/delete', { code }, token),

  // ---- Admin ----
  async adminUsers(token: string): Promise<AdminUser[]> {
    const res = await fetch('/api/admin/users', { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Serveur injoignable.');
    return data;
  },
  async adminStats(token: string): Promise<AdminStats> {
    const res = await fetch('/api/admin/stats', { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Serveur injoignable.');
    return data;
  },
  adminModerate: (token: string, username: string, action: 'ban' | 'unban' | 'rename', newName?: string): Promise<{ message: string }> =>
    post('/api/admin/moderate', { username, action, newName }, token),
  adminGift: (token: string, to: string, amount: number): Promise<{ to: string; coins: number }> => post('/api/admin/gift', { to, amount }, token),

  async logout(token: string) {
    writeToken(null);
    await post('/api/logout', {}, token).catch(() => {});
  },
};
