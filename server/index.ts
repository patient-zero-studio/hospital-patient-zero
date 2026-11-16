/// <reference types="node" />
/**
 * Game server: accounts (username + password), 2-player rooms with a join
 * code, and a WebSocket relay between the two players of a room.
 * In dev it also serves the game through Vite; with --prod it serves dist/.
 */
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import crypto from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { Appearance, DEFAULT_APPEARANCE, enforceOwned, sanitizeAppearance } from '../src/appearance.ts';
import {
  BoxId,
  MAX_FOUND_COINS,
  NEW_WALLET,
  SupplyKind,
  Wallet,
  buyCosmetic,
  buyGoods,
  dailyShop,
  openBox,
  rewardFor,
  sanitizeWallet,
  takeStash,
  todayKey,
  INFINITE_COINS,
  rollDailyGift,
  ADVENT,
  claimAdvent,
  seasonShop,
  EVENT_BOX_PRICE,
  MAX_TREATS_PER_RUN,
  TREATS_PER_CHEST,
  XMAS_PRESENTS,
  openEventBox,
} from '../src/economy.ts';
import { SEASONS, SEASON_INFO, SeasonSetting, adventDay, adventYear, isSeasonSetting, resolveSeason } from '../src/seasons.ts';
import { AchDef, AchState, StatKey, applyAchReport, sanitizeAch } from '../src/achievements.ts';
import { challengeMet, dailyChallenge } from '../src/challenges.ts';
import { debouncedSaver, makeStore } from './storage.ts';
import { DAILY_XP, DEATH_XP, ESCAPE_XP, levelOf, levelReward } from '../src/levels.ts';
import { censorText, isBadName } from '../src/moderation.ts';
import { grantServerAch } from '../src/achievements.ts';
import { PushSub, isPushSub, pushPublicKey, pushTo, setupPush } from './push.ts';
import { LEVEL_SKINS, PASS_TIERS, PASS_XP_PER_TIER, nextWeek, passEnds, passKey, passName, passReward, weekKey, weeklyChallenges } from '../src/progression.ts';
import { BOXES, SUPPLY_NAMES, TIER_LABEL, TIER_PRICE, cosmetic as cosmeticById } from '../src/economy.ts';
import { CATALOG } from '../src/economy.ts';

/** Admin accounts (lower case): infinite coins, can gift coins to anyone. */
const ADMINS = new Set(['corrupted_wolf', ...(process.env.PZ_ADMINS ?? '').toLowerCase().split(',').filter(Boolean)]);
const isAdmin = (u: { username: string }) => ADMINS.has(u.username.toLowerCase());

const PROD = process.argv.includes('--prod');
const PORT = Number(process.env.PORT) || 3000;
const ROOT = process.cwd();
const DATA_DIR = process.env.PZ_DATA_DIR || path.join(ROOT, 'server', 'data');

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------
interface User {
  username: string;
  salt: string;
  hash: string;
  createdAt: string;
  /** Customised colours of the player's human and creature. */
  profile?: Appearance;
  /** Coins, cosmetics owned, resources won in boxes. */
  wallet?: Wallet;
  /** last escape reward (anti-spam) */
  lastReward?: number;
  /** day (YYYY-MM-DD, UTC) of the last free daily gift, and the streak of consecutive days */
  lastGift?: string;
  giftStreak?: number;
  /** Achievements unlocked + progress counters */
  ach?: AchState;
  /** day (YYYY-MM-DD) the daily challenge was won */
  lastChallenge?: string;
  /** last run submitted (anti-spam) */
  lastRun?: number;
  /** Advent calendar boxes opened, for the Christmas of `year` */
  advent?: { year: number; days: number[] };
  /** The shop opens after the first escape (Exploration is enough) */
  shopUnlocked?: boolean;
  /** last treats banked (anti-spam) */
  lastTreats?: number;
  /** Experience points (player level) */
  xp?: number;
  /** last XP for a lost run (anti-spam) */
  lastDeathXp?: number;
  /** last Christmas night reward (anti-spam) */
  lastXmas?: number;
  /** last survival score (anti-spam) */
  lastSurvival?: number;
  /** Banned by an admin: can't log in any more */
  banned?: boolean;
  /** XP earned this week (weekly leaderboard) + podiums won */
  weekXp?: { week: string; xp: number };
  trophies?: { week: string; place: number }[];
  /** Gifts received from friends, shown once */
  inbox?: { from: string; text: string; at: number }[];
  /** gifts sent today (limit) */
  gifts?: { day: string; n: number };
  /** devices that accept notifications */
  push?: PushSub[];
  /** Weekly challenges: counters at the start of the week, escapes in Difficult+, rewards taken */
  weekly?: { week: string; base: Partial<Record<StatKey, number>>; hard: number; claimed: string[] };
  /** Season pass of the month: XP earned this month, tiers taken */
  pass?: { key: string; xp: number; claimed: number[] };
  /** Friends (lower-case names) and friend requests received */
  friends?: string[];
  friendReqs?: string[];
  /** 🎟️ gift codes already used */
  redeemed?: string[];
  codeTries?: { at: number; n: number };
  /** 📣 who invited this player (lower case), and whether the referral was paid */
  referredBy?: string;
  refPaid?: boolean;
  /** players this account brought in (paid) */
  referrals?: number;
  /** 💬 last message sent (anti-spam), last read per friend */
  lastDm?: number;
  dmRead?: Record<string, number>;
}

const store = makeStore(DATA_DIR);
await setupPush(store);
const remote = store.kind === 'upstash';
console.log(remote ? '[storage] comptes enregistrés dans Upstash (en ligne)' : `[storage] comptes enregistrés dans ${DATA_DIR}`);

const users = new Map<string, User>(); // key = lowercase username
{
  const raw = await store.load('users');
  if (raw) for (const u of JSON.parse(raw) as User[]) users.set(u.username.toLowerCase(), u);
}
/** 💾 One copy of the accounts per day, the last 7 days are kept. */
const backupUsers = async () => {
  try {
    const day = new Date().toISOString().slice(0, 10);
    const index: string[] = JSON.parse((await store.load('backups')) ?? '[]');
    if (index.includes(day)) return;
    await store.save(`backup-users-${day}`, JSON.stringify([...users.values()]));
    index.push(day);
    while (index.length > 7) await store.remove(`backup-users-${index.shift()}`);
    await store.save('backups', JSON.stringify(index));
    console.log(`[storage] sauvegarde du jour : ${users.size} comptes`);
  } catch (e) {
    console.error('[storage] sauvegarde impossible :', (e as Error).message);
  }
};
setTimeout(backupUsers, 60000);
setInterval(backupUsers, 3 * 3600000);
const usersSaver = debouncedSaver(store, 'users', () => JSON.stringify([...users.values()], null, remote ? 0 : 2), remote ? 1500 : 200);
const saveUsers = () => usersSaver.save();

const hashPassword = (password: string, salt: string) => crypto.scryptSync(password, salt, 64).toString('hex');
const checkPassword = (user: User, password: string) => {
  const a = Buffer.from(hashPassword(password, user.salt), 'hex');
  const b = Buffer.from(user.hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

/**
 * token → username. On a host that sleeps, sessions are saved too, so players
 * stay logged in when it wakes up (on this PC, a restart asks to log in again).
 */
const sessions = new Map<string, { username: string; expires: number }>();
const SESSION_MS = 30 * 24 * 3600 * 1000;
const sessionsSaver = debouncedSaver(store, 'sessions', () => JSON.stringify([...sessions]), 1500);
if (remote) {
  const raw = await store.load('sessions');
  if (raw) for (const [t, s] of JSON.parse(raw) as [string, { username: string; expires: number }][]) if (s.expires > Date.now()) sessions.set(t, s);
}
const newSession = (username: string) => {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { username, expires: Date.now() + SESSION_MS });
  if (remote) sessionsSaver.save();
  return token;
};
const userFromToken = (token?: string | null) => {
  if (!token) return null;
  const s = sessions.get(token);
  if (!s) return null;
  if (s.expires < Date.now() || users.get(s.username.toLowerCase())?.banned) {
    sessions.delete(token);
    return null;
  }
  return s.username;
};

// Basic brute-force protection: 20 auth attempts / 10 min / IP
const attempts = new Map<string, { n: number; reset: number }>();
const rateLimited = (ip: string) => {
  const now = Date.now();
  const a = attempts.get(ip);
  if (!a || a.reset < now) {
    attempts.set(ip, { n: 1, reset: now + 10 * 60 * 1000 });
    return false;
  }
  a.n++;
  return a.n > 20;
};

const USERNAME_RE = /^[A-Za-z0-9_-]{3,16}$/;

const app = express();
app.disable('x-powered-by');
// Behind a tunnel / host proxy: rate limits use each player's real address
app.set('trust proxy', 1);
app.use('/api', express.json({ limit: '4kb' }));

app.post('/api/register', (req, res) => {
  if (rateLimited(req.ip ?? '?')) return res.status(429).json({ error: 'Trop de tentatives, réessayez plus tard.' });
  const { username, password } = req.body ?? {};
  if (typeof username !== 'string' || !USERNAME_RE.test(username))
    return res.status(400).json({ error: 'Pseudo : 3 à 16 caractères (lettres, chiffres, _ ou -).' });
  if (typeof password !== 'string' || password.length < 6 || password.length > 64)
    return res.status(400).json({ error: 'Mot de passe : 6 à 64 caractères.' });
  if (isBadName(username)) return res.status(400).json({ error: 'Ce pseudo n\'est pas autorisé. Choisis-en un autre (sans gros mots).' });
  const key = username.toLowerCase();
  if (users.has(key)) return res.status(409).json({ error: 'Ce pseudo est déjà pris.' });
  const salt = crypto.randomBytes(16).toString('hex');
  const ref = typeof req.body?.ref === 'string' ? req.body.ref.toLowerCase() : '';
  users.set(key, {
    username,
    salt,
    hash: hashPassword(password, salt),
    createdAt: new Date().toISOString(),
    ...(ref && ref !== key && users.has(ref) ? { referredBy: ref } : {}),
  });
  saveUsers();
  bumpStat('signups');
  res.json({ token: newSession(username), username });
});

app.post('/api/login', (req, res) => {
  if (rateLimited(req.ip ?? '?')) return res.status(429).json({ error: 'Trop de tentatives, réessayez plus tard.' });
  const { username, password } = req.body ?? {};
  const user = typeof username === 'string' ? users.get(username.toLowerCase()) : undefined;
  if (!user || typeof password !== 'string' || !checkPassword(user, password))
    return res.status(401).json({ error: 'Pseudo ou mot de passe incorrect.' });
  if (user.banned) return res.status(403).json({ error: 'Ce compte a été banni par un administrateur.' });
  res.json({ token: newSession(user.username), username: user.username });
});

const bearer = (req: express.Request) => (req.headers.authorization ?? '').replace(/^Bearer /, '');

app.get('/api/me', (req, res) => {
  const username = userFromToken(bearer(req));
  if (!username) return res.status(401).json({ error: 'Session expirée.' });
  res.json({ username });
});

// Customisation (human + creature colours), stored with the account
app.get('/api/profile', (req, res) => {
  const username = userFromToken(bearer(req));
  const user = username ? users.get(username.toLowerCase()) : undefined;
  if (!user) return res.status(401).json({ error: 'Session expirée.' });
  res.json(sanitizeAppearance(user.profile ?? DEFAULT_APPEARANCE));
});

app.put('/api/profile', (req, res) => {
  const username = userFromToken(bearer(req));
  const user = username ? users.get(username.toLowerCase()) : undefined;
  if (!user) return res.status(401).json({ error: 'Session expirée.' });
  user.profile = enforceOwned(sanitizeAppearance(req.body), walletOf(user).owned);
  if (user.profile.human.char && user.profile.human.char !== 'alex') serverAch(user, 'new_face');
  saveUsers();
  res.json(user.profile);
});

// ---------------------------------------------------------------------------
// Coins, shop, mystery boxes, the hobo's goods
// ---------------------------------------------------------------------------
const walletOf = (u: User) => {
  u.wallet = u.wallet ? sanitizeWallet(u.wallet) : NEW_WALLET();
  // Admins never run out
  if (isAdmin(u)) u.wallet.coins = INFINITE_COINS;
  // …and never run out of event treats either (to try the event boxes)
  if (isAdmin(u)) for (const k of SEASONS) u.wallet.treats[k] = INFINITE_COINS;
  return u.wallet;
};
const authUser = (req: express.Request) => {
  const username = userFromToken(bearer(req));
  const u = username ? users.get(username.toLowerCase()) : undefined;
  if (u) markActive(u.username);
  return u;
};

// ---- Daily statistics for the admin dashboard (last 60 days) ----
interface DayStats {
  signups: number;
  escapes: number;
  deaths: number;
  /** players seen that day */
  players: string[];
}
const stats: Record<string, DayStats> = await (async () => {
  try {
    const raw = await store.load('stats');
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
})();
const statsSaver = debouncedSaver(store, 'stats', () => JSON.stringify(stats), remote ? 5000 : 1000);
const today = () => {
  const k = todayKey();
  if (!stats[k]) {
    stats[k] = { signups: 0, escapes: 0, deaths: 0, players: [] };
    const keys = Object.keys(stats).sort();
    while (keys.length > 60) delete stats[keys.shift()!];
  }
  return stats[k];
};
const bumpStat = (k: 'signups' | 'escapes' | 'deaths') => {
  today()[k]++;
  statsSaver.save();
};
const markActive = (name: string) => {
  const d = today();
  if (!d.players.includes(name)) {
    d.players.push(name);
    statsSaver.save();
  }
};
const nextReset = () => {
  const d = new Date();
  d.setUTCHours(24, 0, 0, 0);
  return d.getTime();
};
const achOf = (u: User) => (u.ach = sanitizeAch(u.ach));
/** Records achievements / counters and pays their coin rewards once. */
const reportAch = (u: User, unlock: unknown, stats: unknown, trusted: Partial<Record<StatKey, number>> = {}) => {
  const newly = applyAchReport(achOf(u), unlock, stats, trusted);
  const coins = newly.reduce((s, a) => s + a.reward, 0);
  if (coins > 0) {
    walletOf(u).coins += coins;
    addXp(u, coins / 2);
  }
  return newly.map((a: AchDef) => a.id);
};
/** Unlocks achievements only the server can check, and pays them. */
const serverAch = (u: User, ...ids: string[]) => {
  const newly = grantServerAch(achOf(u), ids);
  const coins = newly.reduce((t, a) => t + a.reward, 0);
  if (coins > 0) {
    walletOf(u).coins += coins;
    addXp(u, coins / 2);
  }
  return newly.map((a) => a.id);
};
// ---- Events (Christmas / Halloween): follows the calendar unless an admin forces one ----
/** PZ_FAKE_DATE (tests only) pretends today is another day for the events. */
const eventNow = () => (process.env.PZ_FAKE_DATE ? new Date(process.env.PZ_FAKE_DATE) : new Date());
type BoostKind = 'coins2' | 'treats2' | 'xp2' | 'all2';
const BOOST_KINDS: BoostKind[] = ['coins2', 'treats2', 'xp2', 'all2'];
const settings: {
  season: SeasonSetting;
  boost?: { kind: BoostKind; until: number };
  notifiedSeason?: string | null;
  weekPaid?: string;
  lastPodium?: { username: string; xp: number; place: number }[];
} = await (async () => {
  try {
    const raw = await store.load('settings');
    const s = raw ? JSON.parse(raw) : {};
    const boost = s.boost && BOOST_KINDS.includes(s.boost.kind) && Number(s.boost.until) > Date.now() ? { kind: s.boost.kind, until: Number(s.boost.until) } : undefined;
    return { season: isSeasonSetting(s.season) ? s.season : 'auto', boost, notifiedSeason: s.notifiedSeason, weekPaid: s.weekPaid, lastPodium: Array.isArray(s.lastPodium) ? s.lastPodium : [] };
  } catch {
    return { season: 'auto' as SeasonSetting };
  }
})();
/** ⚡ Surprise event started by an admin (double coins / treats / XP), while it lasts */
const activeBoost = () => (settings.boost && settings.boost.until > Date.now() ? settings.boost : undefined);
const boostMul = (what: 'coins' | 'treats' | 'xp') => {
  const b = activeBoost();
  return b && (b.kind === 'all2' || b.kind === `${what}2`) ? 2 : 1;
};
const settingsSaver = debouncedSaver(store, 'settings', () => JSON.stringify(settings), 300);
const currentSeason = () => resolveSeason(settings.season, eventNow());
const adventOf = (u: User) => {
  const year = adventYear(eventNow());
  if (!u.advent || u.advent.year !== year || !Array.isArray(u.advent.days)) u.advent = { year, days: [] };
  return u.advent;
};
/** Calendar state, only while Christmas is on. Box N opens on December N, for everyone (admins too). */
const adventView = (u: User) =>
  currentSeason() === 'noel' ? { open: adventDay(eventNow()), claimed: adventOf(u).days } : undefined;

app.get('/api/season', (_req, res) => {
  res.json({ season: currentSeason(), boost: activeBoost() ?? null });
});

/** Adds XP (doubled during an XP surprise event): coins for every level reached, level skins, season pass. */
const addXp = (u: User, amount: number) => {
  const before = levelOf(u.xp ?? 0).level;
  const gain = Math.max(0, Math.floor(amount * boostMul('xp')));
  u.xp = (u.xp ?? 0) + gain;
  passOf(u).xp += gain;
  const wk = weekKey();
  if (!u.weekXp || u.weekXp.week !== wk) u.weekXp = { week: wk, xp: 0 };
  u.weekXp.xp += gain;
  const after = levelOf(u.xp).level;
  for (let l = before + 1; l <= after; l++) walletOf(u).coins += levelReward(l);
  grantLevelSkins(u);
  if (after >= 10) serverAch(u, 'lvl10');
  if (after >= 25) serverAch(u, 'lvl25');
  if (after >= 50) serverAch(u, 'lvl50');
  const tier = Math.floor(passOf(u).xp / PASS_XP_PER_TIER);
  if (tier >= 10) serverAch(u, 'pass10');
  if (tier >= PASS_TIERS) serverAch(u, 'pass30');
};
const grantLevelSkins = (u: User) => {
  const lv = levelOf(u.xp ?? 0).level;
  const w = walletOf(u);
  for (const ls of LEVEL_SKINS) if (lv >= ls.level && !w.owned.includes(ls.skin)) w.owned.push(ls.skin);
};

// ---- 🗓️ Weekly challenges & 🏆 season pass ----
const weeklyOf = (u: User) => {
  const wk = weekKey();
  if (!u.weekly || u.weekly.week !== wk) u.weekly = { week: wk, base: { ...achOf(u).stats }, hard: 0, claimed: [] };
  return u.weekly;
};
const weeklyView = (u: User) => {
  const w = weeklyOf(u);
  const st = achOf(u).stats;
  return {
    resetAt: nextWeek(),
    list: weeklyChallenges(w.week).map((c) => {
      const done = c.counter === 'hard' ? w.hard : Math.max(0, (st[c.counter] ?? 0) - (w.base[c.counter] ?? 0));
      return { ...c, progress: Math.min(c.goal, done), claimed: w.claimed.includes(c.id) };
    }),
  };
};
const passOf = (u: User) => {
  const k = passKey();
  if (!u.pass || u.pass.key !== k) u.pass = { key: k, xp: 0, claimed: [] };
  return u.pass;
};
const passView = (u: User) => {
  const p = passOf(u);
  return { key: p.key, name: passName(p.key), xp: p.xp, tier: Math.min(PASS_TIERS, Math.floor(p.xp / PASS_XP_PER_TIER)), claimed: p.claimed, ends: passEnds() };
};

/** Shop locked until the player gets out once (accounts that already bought skins keep it). */
const shopOpenFor = (u: User) => isAdmin(u) || !!u.shopUnlocked || walletOf(u).owned.length > 0;
const SHOP_LOCKED = 'Boutique verrouillée : échappe-toi de l\'hôpital une fois (le mode Exploration suffit) pour la débloquer.';

const walletView = (u: User) => ({
  bests: bestsOf(u),
  referrals: u.referrals ?? 0,
  referredBy: u.referredBy ? (users.get(u.referredBy)?.username ?? null) : null,
  inbox: u.inbox ?? [],
  trophies: u.trophies ?? [],
  level: levelOf(u.xp ?? 0),
  weekly: weeklyView(u),
  pass: passView(u),
  boost: activeBoost() ?? null,
  shopUnlocked: shopOpenFor(u),
  season: currentSeason(),
  seasonSetting: isAdmin(u) ? settings.season : undefined,
  seasonShop: seasonShop(currentSeason()).map((x) => x.id),
  advent: adventView(u),
  ach: achOf(u),
  challenge: { id: dailyChallenge().id, done: u.lastChallenge === todayKey() },
  wallet: walletOf(u),
  shop: dailyShop().map((x) => x.id),
  day: todayKey(),
  nextReset: nextReset(),
  admin: isAdmin(u),
  dailyAvailable: u.lastGift !== todayKey(),
  /** streak the next gift will count (or the current one if already opened today) */
  dailyStreak: u.lastGift === todayKey() ? (u.giftStreak ?? 1) : nextStreak(u),
});

/** Consecutive days: yesterday's gift keeps the streak going, otherwise back to 1. */
const nextStreak = (u: User) => {
  const y = new Date();
  y.setUTCDate(y.getUTCDate() - 1);
  return u.lastGift === todayKey(y) ? Math.min(7, (u.giftStreak ?? 0) + 1) : 1;
};

// Free gift, once a day
app.post('/api/shop/daily', (req, res) => {
  const user = authUser(req);
  if (!user) return res.status(401).json({ error: 'Session expirée.' });
  if (!shopOpenFor(user)) return res.status(403).json({ error: SHOP_LOCKED });
  if (user.lastGift === todayKey()) return res.status(400).json({ error: 'Déjà ouvert aujourd\'hui. Revenez demain !' });
  const streak = nextStreak(user);
  const result = rollDailyGift(walletOf(user), streak);
  user.lastGift = todayKey();
  user.giftStreak = streak;
  addXp(user, DAILY_XP);
  const newAch = reportAch(user, [], {}, { boxes: 1 });
  saveUsers();
  res.json({ result, newAch, ...walletView(user) });
});

// ---------------------------------------------------------------------------
// Leaderboard (best escape time per player, per chapter and difficulty) + daily challenge
// ---------------------------------------------------------------------------
interface BoardEntry {
  username: string;
  time: number;
  date: string;
  /** survival: wave reached */
  wave?: number;
}
const boards: Record<string, BoardEntry[]> = await (async () => {
  try {
    const raw = await store.load('leaderboard');
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
})();
const boardsSaver = debouncedSaver(store, 'leaderboard', () => JSON.stringify(boards), remote ? 1500 : 300);
/** ⏱️ Personal bests of a player: "chapter-difficulty" → seconds */
function bestsOf(u: User) {
  const out: Record<string, number> = {};
  for (const [k, list] of Object.entries(boards)) {
    if (k.startsWith('survival')) continue;
    const mine = list.find((e) => e.username === u.username);
    if (mine) out[k] = mine.time;
  }
  return out;
}
const saveBoards = () => boardsSaver.save();

app.get('/api/leaderboard', (_req, res) => {
  const out: Record<string, BoardEntry[]> = {};
  for (const [k, list] of Object.entries(boards))
    out[k] = list.slice(0, 10).map((e) => ({ ...e, level: levelOf(users.get(e.username.toLowerCase())?.xp ?? 0).level }));
  res.json({ boards: out });
});

// An escape: { chapter, difficulty, time (s), challenge: boolean }
app.post('/api/run', (req, res) => {
  const user = authUser(req);
  if (!user) return res.status(401).json({ error: 'Session expirée.' });
  const now = Date.now();
  const chNum = Number(req.body?.chapter);
  // 0 = the campaign (chapters 1 → 5 in one go)
  const chapter = chNum === 0 ? 0 : chNum === 6 ? 6 : chNum === 5 ? 5 : chNum === 4 ? 4 : chNum === 3 ? 3 : chNum === 2 ? 2 : 1;
  const difficulty = Math.floor(Number(req.body?.difficulty));
  const time = Math.round(Number(req.body?.time) * 10) / 10;
  // Exploration doesn't count; a real escape takes at least a minute (the campaign: 10 min, up to 6 h)
  const [minT, maxT] = chapter === 0 ? [600, 21600] : [60, 7200];
  if (!(difficulty >= 2 && difficulty <= 5) || !Number.isFinite(time) || time < minT || time > maxT)
    return res.json({ record: false, rank: null, challengeWon: 0, ...walletView(user) });
  if (user.lastRun && now - user.lastRun < 20000) return res.json({ record: false, rank: null, challengeWon: 0, ...walletView(user) });
  user.lastRun = now;

  const key = `${chapter}-${difficulty}`;
  const list = (boards[key] ??= []);
  const mine = list.find((e) => e.username === user.username);
  const record = !mine || time < mine.time;
  if (record) {
    if (mine) {
      mine.time = time;
      mine.date = todayKey();
    } else list.push({ username: user.username, time, date: todayKey() });
    list.sort((a, b) => a.time - b.time);
    list.splice(50);
    saveBoards();
  }
  const rank = list.findIndex((e) => e.username === user.username);
  if (chapter !== 0 && time < 300) serverAch(user, 'speedrun');

  let challengeWon = 0;
  const c = dailyChallenge();
  if (req.body?.challenge === true && chapter !== 0 && user.lastChallenge !== todayKey() && challengeMet(c, { chapter, difficulty, time })) {
    user.lastChallenge = todayKey();
    challengeWon = c.reward;
    walletOf(user).coins += c.reward;
  }
  saveUsers();
  res.json({ record, rank: rank >= 0 ? rank + 1 : null, challengeWon, ...walletView(user) });
});

// Achievements reported by the game: { unlock: string[], stats: { key: increment } }
app.post('/api/achievements', (req, res) => {
  const user = authUser(req);
  if (!user) return res.status(401).json({ error: 'Session expirée.' });
  const newAch = reportAch(user, req.body?.unlock, req.body?.stats);
  saveUsers();
  res.json({ newAch, ...walletView(user) });
});

// ---- Admin: list players, gift coins ----
app.get('/api/admin/users', (req, res) => {
  const user = authUser(req);
  if (!user || !isAdmin(user)) return res.status(403).json({ error: 'Réservé aux admins.' });
  res.json(
    [...users.values()].map((u) => ({
      username: u.username,
      coins: walletOf(u).coins,
      admin: isAdmin(u),
      banned: !!u.banned,
      level: levelOf(u.xp ?? 0).level,
      createdAt: u.createdAt,
    }))
  );
});

// 📊 Admin dashboard
app.get('/api/admin/stats', (req, res) => {
  const user = authUser(req);
  if (!user || !isAdmin(user)) return res.status(403).json({ error: 'Réservé aux admins.' });
  const all = [...users.values()];
  const players = all.filter((u) => !isAdmin(u));
  const days: { day: string; signups: number; escapes: number; deaths: number; players: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    const k = todayKey(d);
    const st = stats[k];
    days.push({ day: k, signups: st?.signups ?? 0, escapes: st?.escapes ?? 0, deaths: st?.deaths ?? 0, players: st?.players.length ?? 0 });
  }
  const owned = new Map<string, number>();
  for (const u of players) for (const id of walletOf(u).owned) owned.set(id, (owned.get(id) ?? 0) + 1);
  const topSkins = [...owned.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([id, n]) => ({ name: CATALOG.find((c) => c.id === id)?.name ?? id, count: n }));
  const levels = { '1-4': 0, '5-9': 0, '10-19': 0, '20-49': 0, '50+': 0 };
  for (const u of players) {
    const l = levelOf(u.xp ?? 0).level;
    levels[l >= 50 ? '50+' : l >= 20 ? '20-49' : l >= 10 ? '10-19' : l >= 5 ? '5-9' : '1-4']++;
  }
  const now = Date.now();
  const online = new Set([...clients].map((c) => c.username.toLowerCase()));
  for (const [n, t] of lastSeen) if (now - t < 75000) online.add(n);
  res.json({
    accounts: players.length,
    banned: players.filter((u) => u.banned).length,
    online: online.size,
    playing: [...clients].filter((c) => c.room?.started).length,
    rooms: rooms.size,
    coins: players.reduce((t, u) => t + walletOf(u).coins, 0),
    shopUnlocked: players.filter((u) => shopOpenFor(u)).length,
    days,
    topSkins,
    levels,
  });
});

// 🛡️ Admin: ban / unban / rename a player
app.post('/api/admin/moderate', (req, res) => {
  const user = authUser(req);
  if (!user || !isAdmin(user)) return res.status(403).json({ error: 'Réservé aux admins.' });
  const key = String(req.body?.username ?? '').toLowerCase();
  const target = users.get(key);
  if (!target) return res.status(404).json({ error: 'Ce joueur n\'existe pas.' });
  if (isAdmin(target)) return res.status(400).json({ error: 'Impossible sur un admin.' });
  const action = req.body?.action;
  if (action === 'ban' || action === 'unban') {
    target.banned = action === 'ban';
    if (target.banned) {
      for (const [t, se] of sessions) if (se.username.toLowerCase() === key) sessions.delete(t);
      for (const c of clients) if (c.username.toLowerCase() === key) c.ws.close();
      if (remote) sessionsSaver.save();
    }
    saveUsers();
    console.log(`[admin] ${user.username} ${target.banned ? 'bannit' : 'débannit'} ${target.username}`);
    return res.json({ message: target.banned ? `⛔ ${target.username} est banni.` : `✅ ${target.username} peut rejouer.` });
  }
  if (action === 'rename') {
    const name = String(req.body?.newName ?? '').trim();
    const nk = name.toLowerCase();
    if (!USERNAME_RE.test(name)) return res.status(400).json({ error: 'Pseudo : 3 à 16 caractères (lettres, chiffres, _ ou -).' });
    if (isBadName(name)) return res.status(400).json({ error: 'Ce pseudo n\'est pas autorisé non plus.' });
    if (nk !== key && users.has(nk)) return res.status(409).json({ error: 'Ce pseudo est déjà pris.' });
    const old = target.username;
    users.delete(key);
    target.username = name;
    users.set(nk, target);
    // Everywhere the old name was used
    for (const u of users.values()) {
      if (u.friends) u.friends = u.friends.map((f) => (f === key ? nk : f));
      if (u.friendReqs) u.friendReqs = u.friendReqs.map((f) => (f === key ? nk : f));
    }
    for (const list of Object.values(boards)) for (const e of list) if (e.username.toLowerCase() === key) e.username = name;
    for (const se of sessions.values()) if (se.username.toLowerCase() === key) se.username = name;
    for (const c of clients) if (c.username.toLowerCase() === key) c.username = name;
    saveUsers();
    saveBoards();
    if (remote) sessionsSaver.save();
    console.log(`[admin] ${user.username} renomme ${old} en ${name}`);
    return res.json({ message: `✏️ ${old} s'appelle maintenant ${name}.` });
  }
  res.status(400).json({ error: 'Action inconnue.' });
});

app.post('/api/admin/gift', (req, res) => {
  const user = authUser(req);
  if (!user || !isAdmin(user)) return res.status(403).json({ error: 'Réservé aux admins.' });
  const target = users.get(String(req.body?.to ?? '').toLowerCase());
  if (!target) return res.status(404).json({ error: 'Ce joueur n\'existe pas.' });
  const amount = Math.floor(Number(req.body?.amount));
  if (!Number.isFinite(amount) || amount < 1 || amount > 1_000_000) return res.status(400).json({ error: 'Montant : de 1 à 1 000 000 pièces.' });
  if (isAdmin(target)) return res.status(400).json({ error: 'Un admin a déjà des pièces infinies.' });
  walletOf(target).coins += amount;
  saveUsers();
  console.log(`[admin] ${user.username} offre ${amount} pièces à ${target.username}`);
  res.json({ to: target.username, coins: walletOf(target).coins });
});

// Admin: start / stop an event for everyone
app.post('/api/admin/season', (req, res) => {
  const user = authUser(req);
  if (!user || !isAdmin(user)) return res.status(403).json({ error: 'Réservé aux admins.' });
  const s = req.body?.season;
  if (!isSeasonSetting(s)) return res.status(400).json({ error: 'Événement inconnu.' });
  settings.season = s;
  settingsSaver.save();
  console.log(`[admin] ${user.username} règle l'événement sur « ${s} »`);
  res.json(walletView(user));
});

// 🧟 Endless survival: best time per player
app.post('/api/survival', (req, res) => {
  const user = authUser(req);
  if (!user) return res.status(401).json({ error: 'Session expirée.' });
  const now = Date.now();
  const time = Math.round(Number(req.body?.time) * 10) / 10;
  const wave = Math.floor(Number(req.body?.wave));
  // A wave every 22-40 s at most: anything faster is not a real run
  if (!(time >= 20 && time <= 4 * 3600) || !(wave >= 1 && wave <= time / 20 + 2) || (user.lastSurvival && now - user.lastSurvival < 20000))
    return res.json({ record: false, rank: null, coins: 0, xp: 0, ...walletView(user) });
  user.lastSurvival = now;
  const list = (boards.survival ??= []);
  const mine = list.find((e) => e.username === user.username);
  const record = !mine || time > mine.time;
  if (record) {
    if (mine) {
      mine.time = time;
      mine.wave = wave;
      mine.date = todayKey();
    } else list.push({ username: user.username, time, wave, date: todayKey() });
    list.sort((a, b) => b.time - a.time);
    list.splice(50);
    saveBoards();
  }
  const rank = list.findIndex((e) => e.username === user.username);
  const coins = Math.min(300, wave * 15) * boostMul('coins');
  walletOf(user).coins += coins;
  const xp = 20 + wave * 15;
  addXp(user, xp);
  bumpStat('deaths');
  saveUsers();
  res.json({ record, rank: rank >= 0 ? rank + 1 : null, coins, xp: xp * boostMul('xp'), ...walletView(user) });
});

// 🎄 Christmas night: coins per present found, the unique skin for all of them
app.post('/api/event/xmas', (req, res) => {
  const user = authUser(req);
  if (!user) return res.status(401).json({ error: 'Session expirée.' });
  if (currentSeason() !== 'noel') return res.status(400).json({ error: 'La Nuit de Noël n\'est jouable qu\'en décembre.' });
  const now = Date.now();
  if (user.lastXmas && now - user.lastXmas < 60000) return res.json({ message: '', ...walletView(user) });
  user.lastXmas = now;
  const n = Math.min(XMAS_PRESENTS, Math.max(0, Math.floor(Number(req.body?.presents) || 0)));
  const w = walletOf(user);
  const coins = n * 20 * boostMul('coins');
  w.coins += coins;
  let message = `🎁 ${n}/${XMAS_PRESENTS} cadeaux : +${coins} pièces`;
  if (n >= XMAS_PRESENTS) {
    if (!w.owned.includes('m-noel-evilsanta')) {
      w.owned.push('m-noel-evilsanta');
      serverAch(user, 'xmas_all');
      message += ' · 🎅 SKIN « Père Noël maléfique » débloqué !';
    } else {
      w.coins += 300;
      message += ' · +300 pièces bonus (skin déjà gagné)';
    }
  }
  addXp(user, 30 + n * 5);
  saveUsers();
  res.json({ message, ...walletView(user) });
});

// 🍬 Event treats picked up in a run (kept even if you die)
app.post('/api/event/treats', (req, res) => {
  const user = authUser(req);
  if (!user) return res.status(401).json({ error: 'Session expirée.' });
  const season = currentSeason();
  const now = Date.now();
  const chests = Math.min(1, Math.max(0, Math.floor(Number(req.body?.chests) || 0)));
  const n = Math.min(MAX_TREATS_PER_RUN, Math.max(0, Math.floor(Number(req.body?.count) || 0))) + chests * TREATS_PER_CHEST;
  if (!season || n <= 0 || (user.lastTreats && now - user.lastTreats < 15000)) return res.json({ added: 0, ...walletView(user) });
  user.lastTreats = now;
  const w = walletOf(user);
  const added = n * boostMul('treats');
  if (chests > 0) serverAch(user, 'chest');
  w.treats[season] = (w.treats[season] ?? 0) + added;
  saveUsers();
  res.json({ added, ...walletView(user) });
});

// 🎁 Event box: 500 treats → an event skin (or coins)
app.post('/api/event/box', (req, res) => {
  const user = authUser(req);
  if (!user) return res.status(401).json({ error: 'Session expirée.' });
  if (!shopOpenFor(user)) return res.status(403).json({ error: SHOP_LOCKED });
  const season = currentSeason();
  if (!season) return res.status(400).json({ error: 'Aucun événement en cours.' });
  const result = openEventBox(walletOf(user), season);
  if (result) serverAch(user, 'event_box');
  if (!result) return res.status(400).json({ error: `Il faut ${EVENT_BOX_PRICE} pour ouvrir la boîte.` });
  const newAch = reportAch(user, [], {}, { boxes: 1 });
  saveUsers();
  res.json({ result, newAch, ...walletView(user) });
});

// 🗓️ Weekly challenge reward
app.post('/api/weekly/claim', (req, res) => {
  const user = authUser(req);
  if (!user) return res.status(401).json({ error: 'Session expirée.' });
  const c = weeklyView(user).list.find((x) => x.id === String(req.body?.id ?? ''));
  if (!c) return res.status(404).json({ error: 'Ce défi n\'est pas de cette semaine.' });
  if (c.claimed) return res.status(400).json({ error: 'Récompense déjà prise.' });
  if (c.progress < c.goal) return res.status(400).json({ error: 'Défi pas encore réussi.' });
  weeklyOf(user).claimed.push(c.id);
  if (weeklyOf(user).claimed.length >= 3) serverAch(user, 'weekly3');
  walletOf(user).coins += c.coins;
  addXp(user, c.xp);
  saveUsers();
  res.json({ result: { kind: 'coins', coins: c.coins, text: `${c.coins} pièces + ${c.xp} XP` }, ...walletView(user) });
});

// 🏆 Season pass tier reward
app.post('/api/pass/claim', (req, res) => {
  const user = authUser(req);
  if (!user) return res.status(401).json({ error: 'Session expirée.' });
  const t = Math.floor(Number(req.body?.tier));
  const p = passOf(user);
  if (!(t >= 1 && t <= PASS_TIERS)) return res.status(400).json({ error: 'Palier inconnu.' });
  if (t > Math.floor(p.xp / PASS_XP_PER_TIER)) return res.status(400).json({ error: 'Palier pas encore atteint : joue encore un peu !' });
  if (p.claimed.includes(t)) return res.status(400).json({ error: 'Déjà pris.' });
  const w = walletOf(user);
  const r = passReward(t);
  let result: { kind: string; coins?: number; skin?: string; text: string };
  if (r.kind === 'coins') {
    w.coins += r.coins;
    result = { kind: 'coins', coins: r.coins, text: `${r.coins} pièces` };
  } else if (r.kind === 'supplies') {
    const kinds = Object.keys(w.stash) as SupplyKind[];
    const got: Record<string, number> = {};
    for (let i = 0; i < r.count; i++) {
      const k = kinds[Math.floor(Math.random() * kinds.length)];
      w.stash[k]++;
      got[k] = (got[k] ?? 0) + 1;
    }
    result = { kind: 'supplies', text: 'Ressources : ' + Object.entries(got).map(([k, n]) => `${n}× ${SUPPLY_NAMES[k as SupplyKind]}`).join(', ') + ' (auprès du SDF)' };
  } else if (r.kind === 'box') {
    // A free box: the price is given back first, then it opens as usual
    w.coins += BOXES.find((b) => b.id === r.box)!.price;
    const box = openBox(w, r.box)!;
    result = { ...box, text: `${BOXES.find((b) => b.id === r.box)!.name} : ${box.text}` };
  } else {
    const item = cosmeticById(r.skin)!;
    if (w.owned.includes(item.id)) {
      const refund = Math.round(TIER_PRICE[item.tier] * 0.6);
      w.coins += refund;
      result = { kind: 'skin', skin: item.id, text: `${item.name} (déjà possédé → +${refund} pièces)` };
    } else {
      w.owned.push(item.id);
      result = { kind: 'skin', skin: item.id, text: `${item.name} — ${TIER_LABEL[item.tier]} !` };
    }
  }
  p.claimed.push(t);
  saveUsers();
  res.json({ result, ...walletView(user) });
});

// 👤 Public profile of a player (anyone logged in can look)
app.get('/api/player/:name', (req, res) => {
  const me = authUser(req);
  if (!me) return res.status(401).json({ error: 'Session expirée.' });
  const u = users.get(String(req.params.name).toLowerCase());
  if (!u || u.banned) return res.status(404).json({ error: 'Ce joueur n\'existe pas.' });
  const ach = achOf(u);
  const records: { board: string; time: number; rank: number }[] = [];
  for (const [k, list] of Object.entries(boards)) {
    const i = list.findIndex((e) => e.username.toLowerCase() === u.username.toLowerCase());
    if (i >= 0) records.push({ board: k, time: list[i].time, rank: i + 1 });
  }
  const look = u.profile ? enforceOwned(sanitizeAppearance(u.profile), walletOf(u).owned) : DEFAULT_APPEARANCE;
  const key = u.username.toLowerCase();
  res.json({
    username: u.username,
    level: levelOf(u.xp ?? 0),
    admin: isAdmin(u),
    since: u.createdAt,
    status: statusOf(key),
    stats: ach.stats,
    achievements: Object.keys(ach.done).length,
    skins: walletOf(u).owned.length,
    records: records.sort((a, b) => a.rank - b.rank).slice(0, 8),
    look,
    trophies: u.trophies ?? [],
    friend: friendsOf(me).includes(key),
    me: key === me.username.toLowerCase(),
  });
});

// ---------------------------------------------------------------------------
// 🔔 Push notifications
// ---------------------------------------------------------------------------
const notify = (u: User | undefined, title: string, body: string, tag: string) => {
  if (!u?.push?.length) return;
  pushTo(u.push, title, body, tag).then((keep) => {
    if (keep.length !== u.push?.length) {
      u.push = keep;
      saveUsers();
    }
  });
};
const notifyAll = (title: string, body: string, tag: string) => {
  for (const u of users.values()) if (!u.banned) notify(u, title, body, tag);
};
app.get('/api/push/key', (_req, res) => res.json({ key: pushPublicKey() }));
app.post('/api/push/subscribe', (req, res) => {
  const user = authUser(req);
  if (!user) return res.status(401).json({ error: 'Session expirée.' });
  const sub = req.body?.sub;
  if (!isPushSub(sub)) return res.status(400).json({ error: 'Abonnement invalide.' });
  user.push = [...(user.push ?? []).filter((x) => x.endpoint !== sub.endpoint), { endpoint: sub.endpoint, keys: sub.keys }].slice(-4);
  saveUsers();
  res.json({ ok: true });
});
app.post('/api/push/unsubscribe', (req, res) => {
  const user = authUser(req);
  if (!user) return res.status(401).json({ error: 'Session expirée.' });
  const ep = String(req.body?.endpoint ?? '');
  user.push = (user.push ?? []).filter((x) => x.endpoint !== ep);
  saveUsers();
  res.json({ ok: true });
});
// A new event starting (Christmas, Halloween…): tell everyone, once
const checkSeasonNotify = () => {
  const cur = currentSeason();
  if ((settings.notifiedSeason ?? null) === cur) return;
  settings.notifiedSeason = cur;
  settingsSaver.save();
  if (cur) notifyAll(`${SEASON_INFO[cur].emoji} ${SEASON_INFO[cur].name} commence !`, 'Décorations, skins limités et friandises à ramasser. Viens jouer !', 'season');
};

// ---------------------------------------------------------------------------
// 🏅 Weekly leaderboard: XP earned this week, top 3 paid every Monday
// ---------------------------------------------------------------------------
const WEEK_PRIZES = [1000, 600, 300];
const payLastWeek = () => {
  const cur = weekKey();
  if (settings.weekPaid === cur) return;
  const prev = weekKey(new Date(Date.now() - 7 * 86400000));
  const ranking = [...users.values()]
    .filter((u) => !u.banned && !isAdmin(u) && u.weekXp?.week === prev && u.weekXp.xp > 0)
    .sort((a, b) => b.weekXp!.xp - a.weekXp!.xp)
    .slice(0, 3);
  settings.lastPodium = ranking.map((u, i) => ({ username: u.username, xp: u.weekXp!.xp, place: i + 1 }));
  ranking.forEach((u, i) => {
    walletOf(u).coins += WEEK_PRIZES[i];
    u.trophies = [...(u.trophies ?? []), { week: prev, place: i + 1 }].slice(-20);
    u.inbox = [...(u.inbox ?? []), { from: 'Patient Zero', text: `🏅 ${i + 1}${i ? 'e' : 'er'} du classement de la semaine : +${WEEK_PRIZES[i]} pièces !`, at: Date.now() }].slice(-20);
    serverAch(u, 'podium');
    notify(u, '🏅 Podium de la semaine !', `Tu finis ${i + 1}${i ? 'e' : 'er'} : +${WEEK_PRIZES[i]} pièces.`, 'podium');
  });
  settings.weekPaid = cur;
  settingsSaver.save();
  if (ranking.length) saveUsers();
};
setTimeout(() => {
  payLastWeek();
  checkSeasonNotify();
}, 5000);
setInterval(() => {
  payLastWeek();
  checkSeasonNotify();
}, 30 * 60000);
app.get('/api/weekly-board', (req, res) => {
  const me = authUser(req);
  const wk = weekKey();
  const list = [...users.values()]
    .filter((u) => !u.banned && !isAdmin(u) && u.weekXp?.week === wk && u.weekXp.xp > 0)
    .sort((a, b) => b.weekXp!.xp - a.weekXp!.xp);
  const rank = me ? list.findIndex((u) => u === me) : -1;
  res.json({
    resetAt: nextWeek(),
    prizes: WEEK_PRIZES,
    top: list.slice(0, 20).map((u) => ({ username: u.username, xp: u.weekXp!.xp, level: levelOf(u.xp ?? 0).level })),
    me: me ? { rank: rank >= 0 ? rank + 1 : null, xp: me.weekXp?.week === wk ? me.weekXp.xp : 0 } : null,
    lastPodium: settings.lastPodium ?? [],
  });
});

// ---------------------------------------------------------------------------
// 💝 Gifts between friends (coins or a skin)
// ---------------------------------------------------------------------------
app.post('/api/friends/gift', (req, res) => {
  const user = authUser(req);
  if (!user) return res.status(401).json({ error: 'Session expirée.' });
  const key = String(req.body?.to ?? '').toLowerCase();
  const target = users.get(key);
  if (!target || !friendsOf(user).includes(key)) return res.status(400).json({ error: 'Tu ne peux offrir qu\'à un ami.' });
  const day = todayKey();
  if (!user.gifts || user.gifts.day !== day) user.gifts = { day, n: 0 };
  if (user.gifts.n >= 5 && !isAdmin(user)) return res.status(429).json({ error: '5 cadeaux par jour maximum. Reviens demain !' });
  const w = walletOf(user);
  const tw = walletOf(target);
  let text: string;
  if (req.body?.skin) {
    const item = cosmeticById(String(req.body.skin));
    if (!item) return res.status(400).json({ error: 'Skin inconnu.' });
    if (item.unlock) return res.status(400).json({ error: 'Ce skin se gagne, il ne s\'offre pas.' });
    if (!w.owned.includes(item.id)) return res.status(400).json({ error: 'Tu n\'as pas ce skin.' });
    if (tw.owned.includes(item.id)) return res.status(400).json({ error: `${target.username} l'a déjà.` });
    if (!isAdmin(user)) w.owned = w.owned.filter((x) => x !== item.id);
    tw.owned.push(item.id);
    text = `💝 ${user.username} t'a offert le skin « ${item.name} » !`;
  } else {
    const n = Math.floor(Number(req.body?.coins));
    if (!(n >= 10 && n <= 2000)) return res.status(400).json({ error: 'De 10 à 2000 pièces.' });
    if (w.coins < n) return res.status(400).json({ error: 'Pas assez de pièces.' });
    if (!isAdmin(user)) w.coins -= n;
    tw.coins += n;
    text = `💝 ${user.username} t'a offert ${n} pièces !`;
  }
  user.gifts.n++;
  target.inbox = [...(target.inbox ?? []), { from: user.username, text, at: Date.now() }].slice(-20);
  serverAch(user, 'gift');
  notify(target, '💝 Tu as reçu un cadeau !', text.replace('💝 ', ''), 'gift');
  saveUsers();
  res.json({ message: `🎁 Cadeau envoyé à ${target.username} !`, ...walletView(user) });
});
app.post('/api/inbox/clear', (req, res) => {
  const user = authUser(req);
  if (!user) return res.status(401).json({ error: 'Session expirée.' });
  user.inbox = [];
  saveUsers();
  res.json(walletView(user));
});

// ---------------------------------------------------------------------------
// 💾 Admin: list and restore the daily backups
// ---------------------------------------------------------------------------
app.get('/api/admin/backups', async (req, res) => {
  const user = authUser(req);
  if (!user || !isAdmin(user)) return res.status(403).json({ error: 'Réservé aux admins.' });
  const days: string[] = JSON.parse((await store.load('backups')) ?? '[]');
  res.json({ days: [...days].reverse(), accounts: users.size });
});
app.post('/api/admin/restore', async (req, res) => {
  const user = authUser(req);
  if (!user || !isAdmin(user)) return res.status(403).json({ error: 'Réservé aux admins.' });
  const day = String(req.body?.day ?? '');
  const days: string[] = JSON.parse((await store.load('backups')) ?? '[]');
  if (!days.includes(day)) return res.status(404).json({ error: 'Pas de sauvegarde ce jour-là.' });
  const raw = await store.load(`backup-users-${day}`);
  const list = raw ? (JSON.parse(raw) as User[]) : null;
  if (!Array.isArray(list) || !list.length) return res.status(500).json({ error: 'Sauvegarde vide ou abîmée : rien n\'a été changé.' });
  // Safety copy of the current accounts first (in case the restore was a mistake)
  await store.save('backup-users-avant-restauration', JSON.stringify([...users.values()]));
  users.clear();
  for (const u of list) if (u?.username) users.set(u.username.toLowerCase(), u);
  // Admins never lose their own access
  if (!users.has(user.username.toLowerCase())) users.set(user.username.toLowerCase(), user);
  saveUsers();
  await usersSaver.flush();
  console.log(`[admin] ${user.username} restaure la sauvegarde du ${day} (${users.size} comptes)`);
  res.json({ message: `💾 Comptes remis comme le ${day} (${users.size} comptes). Une copie de l'état d'avant a été gardée.` });
});

// ---------------------------------------------------------------------------
// 🚩 Reports: players flag someone, admins see the list
// ---------------------------------------------------------------------------
interface Report {
  id: string;
  target: string;
  by: string;
  reason: string;
  note: string;
  at: number;
}
const REPORT_REASONS = ['Pseudo insultant', 'Triche', 'Comportement toxique', 'Autre'];
const reports: Report[] = await (async () => {
  try {
    return JSON.parse((await store.load('reports')) ?? '[]');
  } catch {
    return [];
  }
})();
const reportsSaver = debouncedSaver(store, 'reports', () => JSON.stringify(reports), 1000);
app.post('/api/report', (req, res) => {
  const user = authUser(req);
  if (!user) return res.status(401).json({ error: 'Session expirée.' });
  const target = users.get(String(req.body?.username ?? '').toLowerCase());
  if (!target || target === user) return res.status(400).json({ error: 'Joueur introuvable.' });
  const reason = String(req.body?.reason ?? '');
  if (!REPORT_REASONS.includes(reason)) return res.status(400).json({ error: 'Choisis une raison.' });
  const note = String(req.body?.note ?? '').slice(0, 200);
  const dayAgo = Date.now() - 86400000;
  const mine = reports.filter((r) => r.by === user.username && r.at > dayAgo);
  if (mine.length >= 5) return res.status(429).json({ error: '5 signalements par jour maximum.' });
  if (mine.some((r) => r.target === target.username)) return res.status(400).json({ error: 'Tu as déjà signalé ce joueur aujourd\'hui.' });
  reports.push({ id: crypto.randomBytes(6).toString('hex'), target: target.username, by: user.username, reason, note, at: Date.now() });
  while (reports.length > 300) reports.shift();
  reportsSaver.save();
  res.json({ message: '🚩 Merci, un admin va regarder.' });
});
app.get('/api/admin/reports', (req, res) => {
  const user = authUser(req);
  if (!user || !isAdmin(user)) return res.status(403).json({ error: 'Réservé aux admins.' });
  res.json([...reports].reverse().map((r) => ({ ...r, banned: !!users.get(r.target.toLowerCase())?.banned })));
});
app.post('/api/admin/reports/done', (req, res) => {
  const user = authUser(req);
  if (!user || !isAdmin(user)) return res.status(403).json({ error: 'Réservé aux admins.' });
  const id = String(req.body?.id ?? '');
  const i = reports.findIndex((r) => r.id === id);
  if (i >= 0) reports.splice(i, 1);
  reportsSaver.save();
  res.json({ ok: true });
});

// ⚡ Admin: surprise event for everyone (double coins / treats / XP) for a while
app.post('/api/admin/boost', (req, res) => {
  const user = authUser(req);
  if (!user || !isAdmin(user)) return res.status(403).json({ error: 'Réservé aux admins.' });
  const kind = req.body?.kind as BoostKind;
  const hours = Number(req.body?.hours);
  if (hours === 0) settings.boost = undefined;
  else {
    if (!BOOST_KINDS.includes(kind) || !(hours > 0 && hours <= 168)) return res.status(400).json({ error: 'Événement surprise inconnu.' });
    settings.boost = { kind, until: Date.now() + hours * 3600000 };
    const what = { coins2: 'PIÈCES DOUBLÉES', treats2: 'FRIANDISES DOUBLÉES', xp2: 'XP DOUBLÉE', all2: 'TOUT EST DOUBLÉ' }[kind];
    notifyAll('⚡ Événement surprise !', `${what} pendant ${hours} h sur Patient Zero. Viens jouer !`, 'boost');
  }
  settingsSaver.save();
  console.log(`[admin] ${user.username} : événement surprise ${settings.boost ? `${kind} ${hours} h` : 'arrêté'}`);
  res.json(walletView(user));
});

// 🎄 Advent calendar: one box per day, December 1 → 25
app.post('/api/shop/advent', (req, res) => {
  const user = authUser(req);
  if (!user) return res.status(401).json({ error: 'Session expirée.' });
  if (!shopOpenFor(user)) return res.status(403).json({ error: SHOP_LOCKED });
  const view = adventView(user);
  if (!view) return res.status(400).json({ error: 'Le calendrier de l\'Avent n\'est ouvert que pendant Noël.' });
  const day = Math.floor(Number(req.body?.day));
  if (!(day >= 1 && day <= ADVENT.length)) return res.status(400).json({ error: 'Case inconnue.' });
  if (day > view.open) return res.status(400).json({ error: `Patience ! Cette case s'ouvre le ${day} décembre.` });
  const cal = adventOf(user);
  if (cal.days.includes(day)) return res.status(400).json({ error: 'Case déjà ouverte.' });
  const result = claimAdvent(walletOf(user), day);
  cal.days.push(day);
  if (cal.days.length >= 25) serverAch(user, 'advent25');
  const newAch = reportAch(user, [], {}, { boxes: 1 });
  saveUsers();
  res.json({ result, newAch, ...walletView(user) });
});

app.get('/api/wallet', (req, res) => {
  const user = authUser(req);
  if (!user) return res.status(401).json({ error: 'Session expirée.' });
  res.json(walletView(user));
});

// Coins for getting out of the hospital (none in Exploration)
app.post('/api/wallet/reward', (req, res) => {
  const user = authUser(req);
  if (!user) return res.status(401).json({ error: 'Session expirée.' });
  // Any escape (Exploration included) unlocks the shop
  user.shopUnlocked = true;
  const now = Date.now();
  if (user.lastReward && now - user.lastReward < 20000) return res.json({ gained: 0, xp: 0, ...walletView(user) });
  const diff = Math.min(5, Math.max(1, Math.floor(Number(req.body?.difficulty)) || 1));
  const base = rewardFor(diff);
  const found = base > 0 ? Math.min(MAX_FOUND_COINS, Math.max(0, Math.floor(Number(req.body?.found) || 0))) : 0;
  const gained = (base + found) * boostMul('coins');
  walletOf(user).coins += gained;
  const xp = ESCAPE_XP[diff] * boostMul('xp');
  if (diff >= 3) weeklyOf(user).hard++;
  addXp(user, ESCAPE_XP[diff]);
  user.lastReward = now;
  bumpStat('escapes');
  if (diff >= 2) payReferral(user);
  saveUsers();
  res.json({ gained, xp, ...walletView(user) });
});

// A lost run still gives a little XP
app.post('/api/xp/death', (req, res) => {
  const user = authUser(req);
  if (!user) return res.status(401).json({ error: 'Session expirée.' });
  const now = Date.now();
  if (user.lastDeathXp && now - user.lastDeathXp < 30000) return res.json({ xp: 0, ...walletView(user) });
  user.lastDeathXp = now;
  addXp(user, DEATH_XP);
  bumpStat('deaths');
  saveUsers();
  res.json({ xp: DEATH_XP * boostMul('xp'), ...walletView(user) });
});

app.post('/api/shop/buy', (req, res) => {
  const user = authUser(req);
  if (!user) return res.status(401).json({ error: 'Session expirée.' });
  if (!shopOpenFor(user)) return res.status(403).json({ error: SHOP_LOCKED });
  const err = buyCosmetic(walletOf(user), String(req.body?.id ?? ''), todayKey(), currentSeason());
  if (err) return res.status(400).json({ error: err });
  saveUsers();
  res.json(walletView(user));
});

app.post('/api/shop/box', (req, res) => {
  const user = authUser(req);
  if (!user) return res.status(401).json({ error: 'Session expirée.' });
  if (!shopOpenFor(user)) return res.status(403).json({ error: SHOP_LOCKED });
  const result = openBox(walletOf(user), String(req.body?.box ?? '') as BoxId);
  if (!result) return res.status(400).json({ error: 'Pas assez de pièces.' });
  const newAch = reportAch(user, [], {}, { boxes: 1 });
  saveUsers();
  res.json({ result, newAch, ...walletView(user) });
});

app.post('/api/hobo/buy', (req, res) => {
  const user = authUser(req);
  if (!user) return res.status(401).json({ error: 'Session expirée.' });
  const err = buyGoods(walletOf(user), String(req.body?.kind ?? ''));
  if (err) return res.status(400).json({ error: err });
  saveUsers();
  res.json(walletView(user));
});

app.post('/api/hobo/stash', (req, res) => {
  const user = authUser(req);
  if (!user) return res.status(401).json({ error: 'Session expirée.' });
  const err = takeStash(walletOf(user), String(req.body?.kind ?? '') as SupplyKind);
  if (err) return res.status(400).json({ error: err });
  saveUsers();
  res.json(walletView(user));
});

app.post('/api/logout', (req, res) => {
  sessions.delete(bearer(req));
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Rooms (2 players) + relay
// ---------------------------------------------------------------------------
interface Client {
  ws: WebSocket;
  username: string;
  room: Room | null;
  alive: boolean;
  lastChat?: number;
  /** 👀 spectator of this room, following one of the players */
  watching?: Room;
  follow?: 'host' | 'guest';
}
type GameMode = 'coop' | 'versus' | 'race';
interface Room {
  code: string;
  host: Client;
  guest: Client | null;
  difficulty: number;
  /** coop = together against the AI; versus = one player is the monster; race = first one out wins */
  mode: GameMode;
  /** versus: who plays the creature */
  monster: 'host' | 'guest';
  /** 1 = the hospital, 2 = the sewers, 4 = the forest, 5 = Site B (co-op only) */
  chapter: 1 | 2 | 4 | 5 | 6;
  started: boolean;
  /** same level layout for everyone (spectators too) */
  seed?: number;
  /** 👀 friends watching */
  spectators?: Client[];
}

/** Chapters 4 and 5 are co-op only: any other mode falls back to chapter 1. */
const roomSettings = (r: Room) => {
  if (r.chapter >= 4 && r.mode !== 'coop') r.chapter = 1;
  return { difficulty: r.difficulty, mode: r.mode, monster: r.monster, chapter: r.chapter };
};
const parseChapter = (v: unknown): 1 | 2 | 4 | 5 | 6 => {
  const n = Number(v);
  return n === 2 || n === 4 || n === 5 || n === 6 ? n : 1;
};
const parseMode = (v: unknown): GameMode => (v === 'versus' || v === 'race' ? v : 'coop');
const parseSide = (v: unknown): 'host' | 'guest' => (v === 'guest' ? 'guest' : 'host');

const rooms = new Map<string, Room>();
/** 🔎 Players waiting for a random partner */
const matchQueue: { client: Client; mode: GameMode; difficulty: number; chapter: 1 | 2 | 4 | 5 | 6 }[] = [];
const unqueue = (c: Client) => {
  for (let i = matchQueue.length - 1; i >= 0; i--) if (matchQueue[i].client === c) matchQueue.splice(i, 1);
};
/** 👀 Spectators go back to the menu */
const endWatchers = (room: Room, reason: string) => {
  for (const s of room.spectators ?? []) {
    s.watching = undefined;
    send(s, { t: 'watch-end', reason });
  }
  room.spectators = [];
};
const unwatch = (c: Client) => {
  const r = c.watching;
  if (!r) return;
  r.spectators = (r.spectators ?? []).filter((s) => s !== c);
  c.watching = undefined;
};
const startRoom = (room: Room) => {
  room.started = true;
  endWatchers(room, 'La partie a recommencé.');
  // One random seed for both players: same forest / lab layout
  room.seed = crypto.randomInt(1, 2 ** 31) / 2 ** 31;
  const start = { t: 'start', ...roomSettings(room), seed: room.seed };
  send(room.host, start);
  send(room.guest, start);
};
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I confusion
const newCode = () => {
  for (;;) {
    let c = '';
    for (let i = 0; i < 6; i++) c += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)];
    if (!rooms.has(c)) return c;
  }
};

const send = (c: Client | null | undefined, msg: unknown) => {
  if (c && c.ws.readyState === WebSocket.OPEN) c.ws.send(JSON.stringify(msg));
};
const peerOf = (c: Client) => (c.room ? (c.room.host === c ? c.room.guest : c.room.host) : null);

const leaveRoom = (c: Client) => {
  const room = c.room;
  if (!room) return;
  c.room = null;
  endWatchers(room, 'La partie est terminée.');
  if (room.host === c) {
    // Host left: the room closes
    rooms.delete(room.code);
    if (room.guest) {
      room.guest.room = null;
      send(room.guest, { t: 'room-closed' });
    }
  } else {
    room.guest = null;
    room.started = false;
    send(room.host, { t: 'peer-left' });
  }
};

const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true, maxPayload: 256 * 1024 });

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url ?? '/', 'http://x');
  if (url.pathname !== '/ws') return; // other upgrades (Vite HMR) are not ours
  const username = userFromToken(url.searchParams.get('token'));
  if (!username) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    const client: Client = { ws, username, room: null, alive: true };
    clients.add(client);
    ws.on('pong', () => (client.alive = true));
    ws.on('close', () => {
      clients.delete(client);
      unwatch(client);
      unqueue(client);
      leaveRoom(client);
    });
    ws.on('message', (raw, isBinary) => {
      if (isBinary) {
        // Proximity voice chat: small audio frames forwarded untouched to the partner (in game only)
        const peer = peerOf(client);
        const buf = raw as Buffer;
        if (!peer || !client.room?.started || buf.length > 4096 || peer.ws.readyState !== WebSocket.OPEN) return;
        if (peer.ws.bufferedAmount > 256 * 1024) return; // slow link: drop audio rather than lag
        peer.ws.send(buf, { binary: true });
        return;
      }
      let msg: { t?: string; [k: string]: unknown };
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      switch (msg.t) {
        case 'create': {
          leaveRoom(client);
          const difficulty = Math.min(5, Math.max(1, Number(msg.difficulty) || 2));
          const room: Room = {
            code: newCode(),
            host: client,
            guest: null,
            difficulty,
            mode: parseMode(msg.mode),
            monster: parseSide(msg.monster),
            chapter: parseChapter(msg.chapter),
            started: false,
          };
          rooms.set(room.code, room);
          client.room = room;
          send(client, { t: 'created', code: room.code, ...roomSettings(room) });
          break;
        }
        case 'join': {
          const code = String(msg.code ?? '').toUpperCase().trim();
          const room = rooms.get(code);
          if (!room) return send(client, { t: 'error', error: 'Aucune partie avec ce code.' });
          if (room.host === client) return send(client, { t: 'error', error: 'Vous êtes déjà l\'hôte de cette partie.' });
          if (room.guest) return send(client, { t: 'error', error: 'Cette partie est déjà complète.' });
          leaveRoom(client);
          room.guest = client;
          client.room = room;
          send(client, { t: 'joined', code: room.code, host: room.host.username, ...roomSettings(room) });
          send(room.host, { t: 'peer-joined', username: client.username });
          break;
        }
        case 'settings': {
          // Host changes difficulty / mode / who is the monster while in the lobby
          const room = client.room;
          if (!room || room.host !== client) return;
          if (msg.difficulty !== undefined) room.difficulty = Math.min(5, Math.max(1, Number(msg.difficulty) || 2));
          if (msg.mode !== undefined) room.mode = parseMode(msg.mode);
          if (msg.monster !== undefined) room.monster = parseSide(msg.monster);
          if (msg.chapter !== undefined) room.chapter = parseChapter(msg.chapter);
          const s = { t: 'settings', ...roomSettings(room) };
          send(room.host, s);
          send(room.guest, s);
          break;
        }
        case 'start': {
          const room = client.room;
          if (!room || room.host !== client) return;
          if (!room.guest) return send(client, { t: 'error', error: 'Attendez que votre ami rejoigne la partie.' });
          startRoom(room);
          break;
        }
        case 'queue': {
          // 🔎 Find a random partner with the same mode
          leaveRoom(client);
          unqueue(client);
          const mode = parseMode(msg.mode);
          const wait = { client, mode, difficulty: Math.min(5, Math.max(1, Number(msg.difficulty) || 2)), chapter: parseChapter(msg.chapter) };
          const other = matchQueue.find((q) => q.mode === mode && q.client.username.toLowerCase() !== client.username.toLowerCase() && q.client.ws.readyState === WebSocket.OPEN);
          if (!other) {
            matchQueue.push(wait);
            send(client, { t: 'queued', waiting: matchQueue.filter((q) => q.mode === mode).length });
            break;
          }
          unqueue(other.client);
          // The one who waited hosts, with their settings
          const room: Room = {
            code: newCode(),
            host: other.client,
            guest: client,
            difficulty: other.difficulty,
            mode,
            monster: crypto.randomInt(2) ? 'host' : 'guest',
            chapter: other.chapter,
            started: false,
          };
          rooms.set(room.code, room);
          other.client.room = room;
          client.room = room;
          for (const c of [other.client, client]) {
            const u = users.get(c.username.toLowerCase());
            if (u) serverAch(u, 'matchmade');
          }
          saveUsers();
          send(other.client, { t: 'created', code: room.code, ...roomSettings(room) });
          send(other.client, { t: 'peer-joined', username: client.username });
          send(client, { t: 'joined', code: room.code, host: other.client.username, ...roomSettings(room) });
          // Starts by itself after a few seconds (time to see who you got)
          setTimeout(() => {
            if (rooms.get(room.code) === room && room.guest && !room.started) startRoom(room);
          }, 5000);
          break;
        }
        case 'unqueue':
          unqueue(client);
          send(client, { t: 'unqueued' });
          break;
        case 'leave':
          leaveRoom(client);
          break;
        case 'chat': {
          // 💬 Quick messages between the two players (presets only)
          const now = Date.now();
          const i = Math.floor(Number(msg.i));
          if (!(i >= 0 && i < 8) || now - (client.lastChat ?? 0) < 700) break;
          client.lastChat = now;
          send(peerOf(client), { t: 'chat', from: client.username, i });
          send(client, { t: 'chat', from: client.username, i });
          break;
        }
        case 'relay': {
          // Game traffic: forwarded untouched to the other player
          send(peerOf(client), { t: 'relay', d: msg.d });
          // 👀 …and to the spectators: the world comes from the host, the view from the player they follow
          const room = client.room;
          if (room?.spectators?.length) {
            const role = room.host === client ? 'host' : 'guest';
            const k = (msg.d as { k?: string } | null)?.k;
            const personal = k === 'p' || k === 'look' || k === 'emote';
            for (const s of room.spectators) if (personal ? s.follow === role : role === 'host') send(s, { t: 'relay', d: msg.d });
          }
          break;
        }
        case 'watch': {
          const me = users.get(client.username.toLowerCase());
          const name = String(msg.name ?? '').toLowerCase();
          if (!me || !friendsOf(me).includes(name)) return send(client, { t: 'error', error: 'Tu ne peux regarder que tes amis.' });
          const target = clientsOf(name).find((c) => c.room?.started && c.room.guest);
          const room = target?.room;
          if (!target || !room) return send(client, { t: 'error', error: 'Ton ami n\'est pas en partie en ligne en ce moment.' });
          if (room.mode !== 'coop') return send(client, { t: 'error', error: 'Seules les parties en coop peuvent être regardées.' });
          if ((room.spectators ?? []).length >= 4) return send(client, { t: 'error', error: 'Il y a déjà 4 spectateurs dans cette partie.' });
          unwatch(client);
          unqueue(client);
          leaveRoom(client);
          room.spectators = [...(room.spectators ?? []), client];
          client.watching = room;
          client.follow = room.host === target ? 'host' : 'guest';
          const other = client.follow === 'host' ? room.guest : room.host;
          send(client, { t: 'watch-start', ...roomSettings(room), seed: room.seed, player: target.username, other: other?.username });
          // The players send everything again for the newcomer (and are told someone watches)
          for (const c of [room.host, room.guest]) {
            send(c, { t: 'relay', d: { k: 'resync' } });
            send(c, { t: 'relay', d: { k: 'toast', msg: `👀 ${client.username} regarde la partie.` } });
          }
          serverAch(me, 'spectate');
          saveUsers();
          break;
        }
        case 'unwatch':
          unwatch(client);
          break;
      }
    });
    send(client, { t: 'hello', username });
  });
});

// Drop dead connections (no pong within 20 s)
const clients = new Set<Client>();
setInterval(() => {
  for (const c of clients) {
    if (!c.alive) {
      c.ws.terminate();
      clients.delete(c);
      continue;
    }
    c.alive = false;
    c.ws.ping();
  }
}, 20000);


// ---------------------------------------------------------------------------
// Friends: requests by pseudo, who is online, invitations to your room
// ---------------------------------------------------------------------------
/** Last time each account was seen (any friends request), lower-case name → ms */
const lastSeen = new Map<string, number>();
/** Pending invitations to a room, by invited player (lower case) */
const invites = new Map<string, { from: string; code: string; at: number }[]>();
const MAX_FRIENDS = 100;

const friendsOf = (u: User) => (u.friends = Array.isArray(u.friends) ? u.friends.filter((f) => users.has(f)) : []);
const requestsOf = (u: User) => (u.friendReqs = Array.isArray(u.friendReqs) ? u.friendReqs.filter((f) => users.has(f)) : []);
const clientsOf = (name: string) => [...clients].filter((c) => c.username.toLowerCase() === name);
const statusOf = (name: string): 'playing' | 'online' | 'offline' => {
  const cs = clientsOf(name);
  if (cs.some((c) => c.room?.started)) return 'playing';
  if (cs.length || Date.now() - (lastSeen.get(name) ?? 0) < 75000) return 'online';
  return 'offline';
};
/** The room this player hosts and that still waits for a partner */
const openRoomOf = (name: string) => clientsOf(name).find((c) => c.room && c.room.host === c && !c.room.guest && !c.room.started)?.room ?? null;

const friendsView = (u: User) => {
  const me = u.username.toLowerCase();
  lastSeen.set(me, Date.now());
  const now = Date.now();
  const mine = (invites.get(me) ?? []).filter((i) => now - i.at < 5 * 60000 && rooms.get(i.code)?.host.username.toLowerCase() === i.from.toLowerCase());
  if (mine.length) invites.set(me, mine);
  else invites.delete(me);
  const order = { playing: 0, online: 1, offline: 2 };
  return {
    friends: friendsOf(u)
      .map((f) => ({
        username: users.get(f)!.username,
        status: statusOf(f),
        level: levelOf(users.get(f)!.xp ?? 0).level,
        unread: unreadFrom(u, f),
        watchable: [...clientsOf(f)].some((c) => c.room?.started && c.room.mode === 'coop'),
      }))
      .sort((a, b) => order[a.status] - order[b.status] || a.username.localeCompare(b.username)),
    requests: requestsOf(u).map((f) => users.get(f)!.username),
    /** requests you sent that are still waiting */
    sent: [...users.values()].filter((o) => (o.friendReqs ?? []).includes(me)).map((o) => o.username),
    invites: mine.map((i) => {
      const r = rooms.get(i.code)!;
      return { from: i.from, code: i.code, mode: r.mode, chapter: r.chapter, difficulty: r.difficulty };
    }),
    /** you host a room waiting for a partner: you can invite */
    canInvite: !!openRoomOf(me),
  };
};

app.get('/api/friends', (req, res) => {
  const user = authUser(req);
  if (!user) return res.status(401).json({ error: 'Session expirée.' });
  res.json(friendsView(user));
});

app.post('/api/friends/add', (req, res) => {
  const user = authUser(req);
  if (!user) return res.status(401).json({ error: 'Session expirée.' });
  const name = String(req.body?.username ?? '').trim().toLowerCase();
  const me = user.username.toLowerCase();
  const other = users.get(name);
  if (!other) return res.status(404).json({ error: 'Aucun joueur avec ce pseudo.' });
  if (name === me) return res.status(400).json({ error: 'C\'est toi !' });
  if (friendsOf(user).includes(name)) return res.status(400).json({ error: 'Vous êtes déjà amis.' });
  if (friendsOf(user).length >= MAX_FRIENDS) return res.status(400).json({ error: `${MAX_FRIENDS} amis maximum.` });
  // They already asked you: you become friends right away
  if (requestsOf(user).includes(name)) {
    user.friendReqs = requestsOf(user).filter((f) => f !== name);
    user.friends = [...friendsOf(user), name];
    other.friends = [...friendsOf(other).filter((f) => f !== me), me];
    serverAch(user, 'friend');
    serverAch(other, 'friend');
    saveUsers();
    return res.json({ message: `🤝 ${other.username} et toi êtes maintenant amis !`, ...friendsView(user) });
  }
  const theirs = requestsOf(other);
  if (!theirs.includes(me)) {
    if (theirs.length >= 50) return res.status(400).json({ error: 'Ce joueur a trop de demandes en attente.' });
    other.friendReqs = [...theirs, me];
    notify(other, '👥 Demande d\'ami', `${user.username} veut être ton ami dans Patient Zero.`, 'friend');
    saveUsers();
  }
  res.json({ message: `📨 Demande envoyée à ${other.username}.`, ...friendsView(user) });
});

app.post('/api/friends/accept', (req, res) => {
  const user = authUser(req);
  if (!user) return res.status(401).json({ error: 'Session expirée.' });
  const name = String(req.body?.username ?? '').trim().toLowerCase();
  const me = user.username.toLowerCase();
  const other = users.get(name);
  if (!other || !requestsOf(user).includes(name)) return res.status(404).json({ error: 'Plus de demande de ce joueur.' });
  user.friendReqs = requestsOf(user).filter((f) => f !== name);
  if (!friendsOf(user).includes(name)) user.friends = [...friendsOf(user), name];
  if (!friendsOf(other).includes(me)) other.friends = [...friendsOf(other), me];
  serverAch(user, 'friend');
  serverAch(other, 'friend');
  saveUsers();
  res.json({ message: `🤝 ${other.username} et toi êtes maintenant amis !`, ...friendsView(user) });
});

/** Declines a request, or removes a friend (for both). */
app.post('/api/friends/remove', (req, res) => {
  const user = authUser(req);
  if (!user) return res.status(401).json({ error: 'Session expirée.' });
  const name = String(req.body?.username ?? '').trim().toLowerCase();
  const me = user.username.toLowerCase();
  user.friendReqs = requestsOf(user).filter((f) => f !== name);
  user.friends = friendsOf(user).filter((f) => f !== name);
  const other = users.get(name);
  if (other) {
    other.friends = friendsOf(other).filter((f) => f !== me);
    // …and cancels a request you sent
    other.friendReqs = requestsOf(other).filter((f) => f !== me);
  }
  saveUsers();
  res.json(friendsView(user));
});

app.post('/api/friends/invite', (req, res) => {
  const user = authUser(req);
  if (!user) return res.status(401).json({ error: 'Session expirée.' });
  const name = String(req.body?.username ?? '').trim().toLowerCase();
  const me = user.username.toLowerCase();
  if (!friendsOf(user).includes(name)) return res.status(400).json({ error: 'Ce joueur n\'est pas ton ami.' });
  const room = openRoomOf(me);
  if (!room) return res.status(400).json({ error: 'Crée d\'abord une partie (Multijoueur → Créer), puis invite ton ami.' });
  const list = (invites.get(name) ?? []).filter((i) => i.from.toLowerCase() !== me);
  list.push({ from: user.username, code: room.code, at: Date.now() });
  invites.set(name, list.slice(-5));
  // Instant if they are connected to the game server
  for (const c of clientsOf(name)) send(c, { t: 'invite', from: user.username, code: room.code });
  notify(users.get(name)!, '🎮 Invitation', `${user.username} t'invite à jouer ! Ouvre le jeu pour le rejoindre.`, 'invite');
  res.json({ message: `🎮 Invitation envoyée à ${users.get(name)!.username}.`, ...friendsView(user) });
});

app.post('/api/friends/invite/dismiss', (req, res) => {
  const user = authUser(req);
  if (!user) return res.status(401).json({ error: 'Session expirée.' });
  const me = user.username.toLowerCase();
  const code = String(req.body?.code ?? '');
  invites.set(
    me,
    (invites.get(me) ?? []).filter((i) => i.code !== code)
  );
  res.json(friendsView(user));
});


// ---------------------------------------------------------------------------
// 🎟️ Gift codes (made by an admin, used once per player)
// ---------------------------------------------------------------------------
interface GiftCode {
  code: string;
  coins: number;
  skin?: string;
  treats?: number;
  /** how many players can use it (0 = unlimited) */
  max: number;
  used: number;
  /** expiry (ms), 0 = never */
  until: number;
  by: string;
  at: number;
}
const giftCodes: GiftCode[] = await (async () => {
  try {
    const raw = await store.load('codes');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
})();
const codesSaver = debouncedSaver(store, 'codes', () => JSON.stringify(giftCodes), 500);
const CODE_RE = /^[A-Z0-9-]{4,20}$/;

app.get('/api/admin/codes', (req, res) => {
  const user = authUser(req);
  if (!user || !isAdmin(user)) return res.status(403).json({ error: 'Réservé aux admins.' });
  res.json([...giftCodes].reverse());
});
app.post('/api/admin/codes', (req, res) => {
  const user = authUser(req);
  if (!user || !isAdmin(user)) return res.status(403).json({ error: 'Réservé aux admins.' });
  let code = String(req.body?.code ?? '').trim().toUpperCase();
  if (!code) for (let i = 0; i < 8; i++) code += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)];
  if (!CODE_RE.test(code)) return res.status(400).json({ error: 'Code : 4 à 20 lettres, chiffres ou tirets.' });
  if (giftCodes.some((c) => c.code === code)) return res.status(409).json({ error: 'Ce code existe déjà.' });
  const coins = Math.max(0, Math.min(100000, Math.floor(Number(req.body?.coins) || 0)));
  const treats = Math.max(0, Math.min(5000, Math.floor(Number(req.body?.treats) || 0)));
  const skin = req.body?.skin ? String(req.body.skin) : '';
  if (skin && !cosmeticById(skin)) return res.status(400).json({ error: 'Skin inconnu.' });
  if (!coins && !treats && !skin) return res.status(400).json({ error: 'Mets au moins des pièces, des friandises ou un skin.' });
  const max = Math.max(0, Math.min(100000, Math.floor(Number(req.body?.max) || 0)));
  const days = Math.max(0, Math.min(365, Number(req.body?.days) || 0));
  const gc: GiftCode = { code, coins, treats, ...(skin ? { skin } : {}), max, used: 0, until: days ? Date.now() + days * 86400000 : 0, by: user.username, at: Date.now() };
  giftCodes.push(gc);
  codesSaver.save();
  console.log(`[admin] ${user.username} crée le code ${code}`);
  res.json({ message: `🎟️ Code ${code} créé !`, codes: [...giftCodes].reverse() });
});
app.post('/api/admin/codes/delete', (req, res) => {
  const user = authUser(req);
  if (!user || !isAdmin(user)) return res.status(403).json({ error: 'Réservé aux admins.' });
  const i = giftCodes.findIndex((c) => c.code === String(req.body?.code ?? ''));
  if (i >= 0) giftCodes.splice(i, 1);
  codesSaver.save();
  res.json({ message: 'Code supprimé.', codes: [...giftCodes].reverse() });
});

app.post('/api/redeem', (req, res) => {
  const user = authUser(req);
  if (!user) return res.status(401).json({ error: 'Session expirée.' });
  const now = Date.now();
  // No guessing: 8 wrong tries per 10 minutes
  if (!user.codeTries || now - user.codeTries.at > 10 * 60000) user.codeTries = { at: now, n: 0 };
  if (user.codeTries.n >= 8) return res.status(429).json({ error: 'Trop d\'essais. Réessaie dans 10 minutes.' });
  const code = String(req.body?.code ?? '').trim().toUpperCase();
  const gc = giftCodes.find((c) => c.code === code);
  const fail = (msg: string) => {
    user.codeTries!.n++;
    return res.status(400).json({ error: msg });
  };
  if (!gc) return fail('Ce code n\'existe pas.');
  if (gc.until && now > gc.until) return fail('Ce code a expiré.');
  if (gc.max && gc.used >= gc.max) return fail('Ce code a déjà été utilisé par tout le monde.');
  if ((user.redeemed ?? []).includes(code)) return res.status(400).json({ error: 'Tu as déjà utilisé ce code.' });
  const w = walletOf(user);
  const got: string[] = [];
  if (gc.coins) {
    w.coins += gc.coins;
    got.push(`${gc.coins} pièces`);
  }
  if (gc.treats) {
    const season = currentSeason() ?? 'noel';
    w.treats[season] = (w.treats[season] ?? 0) + gc.treats;
    got.push(`${gc.treats} ${SEASON_INFO[season].treat.many}`);
  }
  if (gc.skin) {
    const item = cosmeticById(gc.skin)!;
    if (w.owned.includes(item.id)) {
      const refund = Math.round(TIER_PRICE[item.tier] * 0.6);
      w.coins += refund;
      got.push(`${item.name} (déjà possédé → +${refund} pièces)`);
    } else {
      w.owned.push(item.id);
      got.push(`le skin « ${item.name} »`);
    }
  }
  gc.used++;
  user.redeemed = [...(user.redeemed ?? []), code].slice(-200);
  serverAch(user, 'code');
  codesSaver.save();
  saveUsers();
  res.json({ message: `🎟️ Code accepté ! Tu gagnes : ${got.join(', ')}.`, ...walletView(user) });
});

// ---------------------------------------------------------------------------
// 📣 Referral: a friend signs up with your link and escapes once → you both win
// ---------------------------------------------------------------------------
const REFERRAL_COINS = 300;
const MAX_REFERRALS = 25;
function payReferral(u: User) {
  if (!u.referredBy || u.refPaid) return;
  u.refPaid = true;
  const sponsor = users.get(u.referredBy);
  walletOf(u).coins += REFERRAL_COINS;
  u.inbox = [...(u.inbox ?? []), { from: 'Patient Zero', text: `📣 Bonus de parrainage : +${REFERRAL_COINS} pièces ! Merci d'avoir rejoint le jeu.`, at: Date.now() }].slice(-20);
  if (!sponsor || (sponsor.referrals ?? 0) >= MAX_REFERRALS) return;
  sponsor.referrals = (sponsor.referrals ?? 0) + 1;
  walletOf(sponsor).coins += REFERRAL_COINS;
  sponsor.inbox = [...(sponsor.inbox ?? []), { from: u.username, text: `📣 ${u.username}, que tu as parrainé, s'est échappé pour la première fois : +${REFERRAL_COINS} pièces !`, at: Date.now() }].slice(-20);
  serverAch(sponsor, 'referral');
  notify(sponsor, '📣 Parrainage réussi !', `${u.username} s'est échappé : +${REFERRAL_COINS} pièces pour toi.`, 'referral');
}

// ---------------------------------------------------------------------------
// 💬 Private chat between friends (filtered)
// ---------------------------------------------------------------------------
type Dm = { f: string; t: string; at: number };
const dms: Record<string, Dm[]> = await (async () => {
  try {
    const raw = await store.load('dms');
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
})();
const dmsSaver = debouncedSaver(store, 'dms', () => JSON.stringify(dms), remote ? 3000 : 500);
const pairKey = (a: string, b: string) => [a, b].sort().join('|');
const unreadFrom = (u: User, friend: string) => {
  const read = u.dmRead?.[friend] ?? 0;
  return (dms[pairKey(u.username.toLowerCase(), friend)] ?? []).filter((m) => m.f === friend && m.at > read).length;
};

app.get('/api/dm/:name', (req, res) => {
  const user = authUser(req);
  if (!user) return res.status(401).json({ error: 'Session expirée.' });
  const me = user.username.toLowerCase();
  const other = String(req.params.name ?? '').toLowerCase();
  if (!friendsOf(user).includes(other)) return res.status(400).json({ error: 'Tu ne peux parler qu\'à tes amis.' });
  const list = dms[pairKey(me, other)] ?? [];
  user.dmRead = { ...(user.dmRead ?? {}), [other]: Date.now() };
  res.json({
    with: users.get(other)?.username ?? other,
    status: statusOf(other),
    messages: list.map((m) => ({ from: users.get(m.f)?.username ?? m.f, text: m.t, at: m.at, mine: m.f === me })),
  });
});

app.post('/api/dm', (req, res) => {
  const user = authUser(req);
  if (!user) return res.status(401).json({ error: 'Session expirée.' });
  const me = user.username.toLowerCase();
  const other = String(req.body?.to ?? '').toLowerCase();
  const target = users.get(other);
  if (!target || !friendsOf(user).includes(other)) return res.status(400).json({ error: 'Tu ne peux parler qu\'à tes amis.' });
  const raw = String(req.body?.text ?? '').replace(/[\u0000-\u001f]/g, ' ').trim();
  if (!raw) return res.status(400).json({ error: 'Message vide.' });
  if (raw.length > 200) return res.status(400).json({ error: '200 caractères maximum.' });
  const now = Date.now();
  if (user.lastDm && now - user.lastDm < 1000) return res.status(429).json({ error: 'Doucement ! Un message par seconde.' });
  user.lastDm = now;
  const text = censorText(raw);
  const key = pairKey(me, other);
  const list = (dms[key] ??= []);
  list.push({ f: me, t: text, at: now });
  if (list.length > 60) list.splice(0, list.length - 60);
  user.dmRead = { ...(user.dmRead ?? {}), [other]: now };
  dmsSaver.save();
  serverAch(user, 'chat');
  // Instant if they have the game open, otherwise a notification
  for (const c of clientsOf(other)) send(c, { t: 'dm', from: user.username });
  if (statusOf(other) === 'offline') notify(target, `💬 ${user.username}`, text.slice(0, 80), `dm-${me}`);
  saveUsers();
  res.json({ ok: true, text });
});

// ---------------------------------------------------------------------------
// 👀 Spectator: watch a friend's co-op game live
// ---------------------------------------------------------------------------
app.get('/api/spectate/:name', (req, res) => {
  const user = authUser(req);
  if (!user) return res.status(401).json({ error: 'Session expirée.' });
  const other = String(req.params.name ?? '').toLowerCase();
  if (!friendsOf(user).includes(other)) return res.status(400).json({ error: 'Tu ne peux regarder que tes amis.' });
  const room = clientsOf(other).find((c) => c.room?.started)?.room;
  if (!room) return res.status(404).json({ error: 'Ton ami n\'est pas en partie en ligne en ce moment.' });
  if (room.mode !== 'coop') return res.status(400).json({ error: 'Seules les parties en coop peuvent être regardées.' });
  res.json({ code: room.code });
});

// ---------------------------------------------------------------------------
// Front-end
// ---------------------------------------------------------------------------
// Health check for hosting platforms
app.get('/healthz', (_req, res) => res.json({ ok: true }));

if (PROD) {
  const dist = path.join(ROOT, 'dist');
  app.use(
    express.static(dist, {
      setHeaders: (res, file) => {
        const name = path.basename(file);
        // The page and the service worker must always be fresh (new versions show up at once)
        if (name === 'index.html' || name === 'sw.js' || name === 'manifest.webmanifest') res.setHeader('Cache-Control', 'no-cache');
        // Built files carry a hash in their name: cache them for a long time
        else if (file.includes(`${path.sep}assets${path.sep}`)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      },
    })
  );
  app.get(/.*/, (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(dist, 'index.html'));
  });
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'spa' });
  app.use(vite.middlewares);
}

// The host stops the server (sleep, redeploy): write what is still pending first
let stopping = false;
const shutdown = async (sig: string) => {
  if (stopping) return;
  stopping = true;
  console.log(`[server] ${sig} : sauvegarde avant l'arrêt…`);
  await Promise.allSettled([usersSaver.flush(), boardsSaver.flush(), settingsSaver.flush(), statsSaver.flush(), remote ? sessionsSaver.flush() : Promise.resolve()]);
  process.exit(0);
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Hospital — Patient Zero : http://localhost:${PORT}  (${PROD ? 'production' : 'dev'})`);
});
