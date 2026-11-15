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
  /** today's challenge and whether this account already won it */
  challenge?: { id: string; done: boolean };
  /** player level (XP) */
  level?: LevelInfo;
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
}

export interface FriendsView {
  friends: { username: string; status: 'playing' | 'online' | 'offline'; level?: number }[];
  requests: string[];
  /** requests you sent, still waiting */
  sent?: string[];
  invites: { from: string; code: string; mode: string; chapter: number; difficulty: number }[];
  /** you host a room waiting for a partner */
  canInvite: boolean;
  message?: string;
}

export interface PlayerProfileView {
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
}

export interface BoardEntry {
  username: string;
  time: number;
  date: string;
  level?: number;
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
    const s = await post('/api/register', { username, password });
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
  reward: (token: string, difficulty: number, found: number): Promise<WalletView & { gained: number; xp?: number }> =>
    post('/api/wallet/reward', { difficulty, found }, token),
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
  xpDeath: (token: string): Promise<WalletView & { xp: number }> => post('/api/xp/death', {}, token),
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
