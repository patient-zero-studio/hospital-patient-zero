/** Account API (username + password). The session token lives in localStorage. */
import { Appearance, DEFAULT_APPEARANCE, sanitizeAppearance } from '../appearance';

import type { BoxId, BoxResult, SupplyKind, Wallet } from '../economy';
import type { AchState, StatKey } from '../achievements';

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
}

export interface BoardEntry {
  username: string;
  time: number;
  date: string;
}

export interface AdminUser {
  username: string;
  coins: number;
  admin: boolean;
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
  reward: (token: string, difficulty: number, found: number): Promise<WalletView & { gained: number }> =>
    post('/api/wallet/reward', { difficulty, found }, token),
  claimDaily: (token: string): Promise<WalletView & { result: BoxResult }> => post('/api/shop/daily', {}, token),
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

  // ---- Admin ----
  async adminUsers(token: string): Promise<AdminUser[]> {
    const res = await fetch('/api/admin/users', { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Serveur injoignable.');
    return data;
  },
  adminGift: (token: string, to: string, amount: number): Promise<{ to: string; coins: number }> => post('/api/admin/gift', { to, amount }, token),

  async logout(token: string) {
    writeToken(null);
    await post('/api/logout', {}, token).catch(() => {});
  },
};
