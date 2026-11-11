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
} from '../src/economy.ts';
import { AchDef, AchState, StatKey, applyAchReport, sanitizeAch } from '../src/achievements.ts';
import { challengeMet, dailyChallenge } from '../src/challenges.ts';
import { debouncedSaver, makeStore } from './storage.ts';

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
}

const store = makeStore(DATA_DIR);
const remote = store.kind === 'upstash';
console.log(remote ? '[storage] comptes enregistrés dans Upstash (en ligne)' : `[storage] comptes enregistrés dans ${DATA_DIR}`);

const users = new Map<string, User>(); // key = lowercase username
{
  const raw = await store.load('users');
  if (raw) for (const u of JSON.parse(raw) as User[]) users.set(u.username.toLowerCase(), u);
}
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
  if (s.expires < Date.now()) {
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
  const key = username.toLowerCase();
  if (users.has(key)) return res.status(409).json({ error: 'Ce pseudo est déjà pris.' });
  const salt = crypto.randomBytes(16).toString('hex');
  users.set(key, { username, salt, hash: hashPassword(password, salt), createdAt: new Date().toISOString() });
  saveUsers();
  res.json({ token: newSession(username), username });
});

app.post('/api/login', (req, res) => {
  if (rateLimited(req.ip ?? '?')) return res.status(429).json({ error: 'Trop de tentatives, réessayez plus tard.' });
  const { username, password } = req.body ?? {};
  const user = typeof username === 'string' ? users.get(username.toLowerCase()) : undefined;
  if (!user || typeof password !== 'string' || !checkPassword(user, password))
    return res.status(401).json({ error: 'Pseudo ou mot de passe incorrect.' });
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
  return u.wallet;
};
const authUser = (req: express.Request) => {
  const username = userFromToken(bearer(req));
  return username ? users.get(username.toLowerCase()) : undefined;
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
  if (coins > 0) walletOf(u).coins += coins;
  return newly.map((a: AchDef) => a.id);
};
const walletView = (u: User) => ({
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
  if (user.lastGift === todayKey()) return res.status(400).json({ error: 'Déjà ouvert aujourd\'hui. Revenez demain !' });
  const streak = nextStreak(user);
  const result = rollDailyGift(walletOf(user), streak);
  user.lastGift = todayKey();
  user.giftStreak = streak;
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
const saveBoards = () => boardsSaver.save();

app.get('/api/leaderboard', (_req, res) => {
  const out: Record<string, BoardEntry[]> = {};
  for (const [k, list] of Object.entries(boards)) out[k] = list.slice(0, 10);
  res.json({ boards: out });
});

// An escape: { chapter, difficulty, time (s), challenge: boolean }
app.post('/api/run', (req, res) => {
  const user = authUser(req);
  if (!user) return res.status(401).json({ error: 'Session expirée.' });
  const now = Date.now();
  const chNum = Number(req.body?.chapter);
  // 0 = the campaign (chapters 1 → 5 in one go)
  const chapter = chNum === 0 ? 0 : chNum === 5 ? 5 : chNum === 4 ? 4 : chNum === 3 ? 3 : chNum === 2 ? 2 : 1;
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
  res.json([...users.values()].map((u) => ({ username: u.username, coins: walletOf(u).coins, admin: isAdmin(u) })));
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

app.get('/api/wallet', (req, res) => {
  const user = authUser(req);
  if (!user) return res.status(401).json({ error: 'Session expirée.' });
  res.json(walletView(user));
});

// Coins for getting out of the hospital (none in Exploration)
app.post('/api/wallet/reward', (req, res) => {
  const user = authUser(req);
  if (!user) return res.status(401).json({ error: 'Session expirée.' });
  const now = Date.now();
  if (user.lastReward && now - user.lastReward < 20000) return res.json({ gained: 0, ...walletView(user) });
  const base = rewardFor(Number(req.body?.difficulty));
  const found = base > 0 ? Math.min(MAX_FOUND_COINS, Math.max(0, Math.floor(Number(req.body?.found) || 0))) : 0;
  const gained = base + found;
  walletOf(user).coins += gained;
  if (gained > 0) user.lastReward = now;
  saveUsers();
  res.json({ gained, ...walletView(user) });
});

app.post('/api/shop/buy', (req, res) => {
  const user = authUser(req);
  if (!user) return res.status(401).json({ error: 'Session expirée.' });
  const err = buyCosmetic(walletOf(user), String(req.body?.id ?? ''));
  if (err) return res.status(400).json({ error: err });
  saveUsers();
  res.json(walletView(user));
});

app.post('/api/shop/box', (req, res) => {
  const user = authUser(req);
  if (!user) return res.status(401).json({ error: 'Session expirée.' });
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
  chapter: 1 | 2 | 4 | 5;
  started: boolean;
}

/** Chapters 4 and 5 are co-op only: any other mode falls back to chapter 1. */
const roomSettings = (r: Room) => {
  if (r.chapter >= 4 && r.mode !== 'coop') r.chapter = 1;
  return { difficulty: r.difficulty, mode: r.mode, monster: r.monster, chapter: r.chapter };
};
const parseChapter = (v: unknown): 1 | 2 | 4 | 5 => {
  const n = Number(v);
  return n === 2 || n === 4 || n === 5 ? n : 1;
};
const parseMode = (v: unknown): GameMode => (v === 'versus' || v === 'race' ? v : 'coop');
const parseSide = (v: unknown): 'host' | 'guest' => (v === 'guest' ? 'guest' : 'host');

const rooms = new Map<string, Room>();
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
          room.started = true;
          // One random seed for both players: same forest / lab layout
          const start = { t: 'start', ...roomSettings(room), seed: crypto.randomInt(1, 2 ** 31) / 2 ** 31 };
          send(room.host, start);
          send(room.guest, start);
          break;
        }
        case 'leave':
          leaveRoom(client);
          break;
        case 'relay':
          // Game traffic: forwarded untouched to the other player
          send(peerOf(client), { t: 'relay', d: msg.d });
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
  await Promise.allSettled([usersSaver.flush(), boardsSaver.flush(), remote ? sessionsSaver.flush() : Promise.resolve()]);
  process.exit(0);
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Hospital — Patient Zero : http://localhost:${PORT}  (${PROD ? 'production' : 'dev'})`);
});
