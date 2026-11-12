/**
 * Coins, cosmetics shop and mystery boxes. Pure functions shared by the
 * server (authoritative for accounts) and the client (display).
 */
import type { Season } from './seasons';

export type Tier = 'petit' | 'moyen' | 'style' | 'exclusif';
export type Target = 'human' | 'monster';
/** What a cosmetic changes: a colour slot, an accessory or a whole outfit. */
export type Slot = 'gown' | 'hair' | 'skin' | 'eyes' | 'acc' | 'outfit';

export interface Cosmetic {
  id: string;
  name: string;
  target: Target;
  slot: Slot;
  /** colour (#hex) for colour slots, or an accessory / outfit id */
  value: string;
  tier: Tier;
  /** Event item: only sold during that event (never in the daily shop or boxes) */
  season?: Season;
  /** Only in the advent calendar (never sold) */
  calendarOnly?: boolean;
}

export const TIER_PRICE: Record<Tier, number> = { petit: 100, moyen: 500, style: 1000, exclusif: 2000 };
export const TIER_LABEL: Record<Tier, string> = { petit: 'Petit skin', moyen: 'Skin moyen', style: 'Skin stylé', exclusif: 'Exclusif' };
export const TIER_COLOR: Record<Tier, string> = { petit: '#a1a1aa', moyen: '#38bdf8', style: '#c084fc', exclusif: '#fbbf24' };

const c = (id: string, name: string, target: Target, slot: Slot, value: string, tier: Tier): Cosmetic => ({ id, name, target, slot, value, tier });
/** Event item (sold in the event shop while the event is on). */
const ev = (season: Season, id: string, name: string, target: Target, slot: Slot, value: string, tier: Tier, calendarOnly = false): Cosmetic => ({
  ...c(id, name, target, slot, value, tier),
  season,
  ...(calendarOnly ? { calendarOnly } : {}),
});

export const CATALOG: Cosmetic[] = [
  // ---- Petits skins (100) : couleurs ----
  c('h-gown-pink', 'Blouse rose bonbon', 'human', 'gown', '#e86aa8', 'petit'),
  c('h-gown-violet', 'Blouse violet royal', 'human', 'gown', '#6a3ab0', 'petit'),
  c('h-gown-orange', 'Blouse orange vif', 'human', 'gown', '#e8742a', 'petit'),
  c('h-gown-khaki', 'Blouse kaki', 'human', 'gown', '#5a6a3a', 'petit'),
  c('h-gown-sky', 'Blouse bleu ciel', 'human', 'gown', '#7ec8f0', 'petit'),
  c('h-hair-blue', 'Cheveux bleu électrique', 'human', 'hair', '#2a6aff', 'petit'),
  c('h-hair-pink', 'Cheveux roses', 'human', 'hair', '#ff5aa8', 'petit'),
  c('h-hair-green', 'Cheveux verts', 'human', 'hair', '#3ac06a', 'petit'),
  c('h-hair-platinum', 'Cheveux platine', 'human', 'hair', '#f0ece0', 'petit'),
  c('m-skin-toxic', 'Peau toxique', 'monster', 'skin', '#6aff4a', 'petit'),
  c('m-skin-blood', 'Peau rouge sang', 'monster', 'skin', '#b01a1a', 'petit'),
  c('m-skin-ice', 'Peau glacée', 'monster', 'skin', '#9ad8ff', 'petit'),
  c('m-skin-violet', 'Peau violette', 'monster', 'skin', '#6a3a8a', 'petit'),
  c('m-eyes-pink', 'Yeux roses', 'monster', 'eyes', '#ff5ad8', 'petit'),
  c('m-eyes-orange', 'Yeux orange', 'monster', 'eyes', '#ff8a00', 'petit'),
  c('m-gown-white', 'Lambeaux blancs', 'monster', 'gown', '#e8e8e0', 'petit'),
  // ---- Skins moyens (500) : accessoires ----
  c('h-acc-cap', 'Casquette', 'human', 'acc', 'cap', 'moyen'),
  c('h-acc-glasses', 'Lunettes', 'human', 'acc', 'glasses', 'moyen'),
  c('h-acc-mask', 'Masque chirurgical', 'human', 'acc', 'mask', 'moyen'),
  c('h-acc-headphones', 'Casque audio', 'human', 'acc', 'headphones', 'moyen'),
  c('h-acc-bandana', 'Bandana rouge', 'human', 'acc', 'bandana', 'moyen'),
  c('h-acc-beanie', 'Bonnet', 'human', 'acc', 'beanie', 'moyen'),
  c('m-acc-horns', 'Cornes', 'monster', 'acc', 'horns', 'moyen'),
  c('m-acc-chains', 'Chaînes', 'monster', 'acc', 'chains', 'moyen'),
  c('m-acc-bandages', 'Bandages', 'monster', 'acc', 'bandages', 'moyen'),
  c('m-acc-hockey', 'Masque de hockey', 'monster', 'acc', 'hockey', 'moyen'),
  // ---- Skins stylés (1000) : tenues complètes ----
  c('h-out-surgeon', 'Tenue de Chirurgien', 'human', 'outfit', 'surgeon', 'style'),
  c('h-out-doctor', 'Blouse de Docteur', 'human', 'outfit', 'doctor', 'style'),
  c('h-out-prisoner', 'Évadé de prison', 'human', 'outfit', 'prisoner', 'style'),
  c('h-out-punk', 'Punk', 'human', 'outfit', 'punk', 'style'),
  c('m-out-skeleton', 'Squelette', 'monster', 'outfit', 'skeleton', 'style'),
  c('m-out-zombie', 'Zombie', 'monster', 'outfit', 'zombie', 'style'),
  c('m-out-demon', 'Démon', 'monster', 'outfit', 'demon', 'style'),
  // ---- Exclusifs (2000) ----
  c('h-ex-gold', 'Survivant Doré', 'human', 'outfit', 'gold', 'exclusif'),
  c('h-ex-neon', 'Survivant Néon', 'human', 'outfit', 'neon', 'exclusif'),
  c('m-ex-inferno', 'Patient Infernal', 'monster', 'outfit', 'inferno', 'exclusif'),
  c('m-ex-shadow', 'Ombre', 'monster', 'outfit', 'shadow', 'exclusif'),
  c('m-ex-gold', 'Patient Doré', 'monster', 'outfit', 'goldm', 'exclusif'),

  // ---- 🎄 Noël (1er décembre → 6 janvier) ----
  ev('noel', 'h-noel-gown-red', 'Blouse rouge de Noël', 'human', 'gown', '#c8102e', 'petit'),
  ev('noel', 'h-noel-gown-pine', 'Blouse vert sapin', 'human', 'gown', '#166534', 'petit'),
  ev('noel', 'h-noel-hair-snow', 'Cheveux blanc neige', 'human', 'hair', '#f4f6ff', 'petit'),
  ev('noel', 'm-noel-skin-frost', 'Peau givrée', 'monster', 'skin', '#cfefff', 'petit'),
  ev('noel', 'm-noel-eyes-pine', 'Yeux vert sapin', 'monster', 'eyes', '#1aff5a', 'petit'),
  ev('noel', 'h-noel-santahat', 'Bonnet de Père Noël', 'human', 'acc', 'santahat', 'moyen'),
  ev('noel', 'h-noel-elfhat', 'Chapeau de lutin', 'human', 'acc', 'elfhat', 'moyen'),
  ev('noel', 'm-noel-santahat', 'Bonnet de Père Noël', 'monster', 'acc', 'santahat', 'moyen'),
  ev('noel', 'h-noel-antlers', 'Bois de renne', 'human', 'acc', 'antlers', 'moyen', true),
  ev('noel', 'm-noel-antlers', 'Bois de renne', 'monster', 'acc', 'antlers', 'moyen', true),
  ev('noel', 'h-noel-sweater', 'Pull moche de Noël', 'human', 'outfit', 'sweater', 'style'),
  ev('noel', 'h-noel-elf', 'Lutin du Père Noël', 'human', 'outfit', 'elf', 'style'),
  ev('noel', 'm-noel-yeti', 'Yéti des neiges', 'monster', 'outfit', 'yeti', 'style'),
  ev('noel', 'm-noel-ginger', 'Bonhomme pain d\'épice', 'monster', 'outfit', 'gingerbread', 'style', true),
  ev('noel', 'm-noel-krampus', 'Krampus', 'monster', 'outfit', 'krampus', 'exclusif', true),
  ev('noel', 'h-noel-santa', 'Père Noël', 'human', 'outfit', 'santa', 'exclusif', true),

  // ---- 🎃 Halloween (1er octobre → 5 novembre) ----
  ev('halloween', 'h-hw-gown-pumpkin', 'Blouse citrouille', 'human', 'gown', '#f97316', 'petit'),
  ev('halloween', 'h-hw-hair-witch', 'Cheveux de sorcière', 'human', 'hair', '#7c3aed', 'petit'),
  ev('halloween', 'm-hw-skin-ghost', 'Peau de fantôme', 'monster', 'skin', '#e6eeee', 'petit'),
  ev('halloween', 'm-hw-eyes-lime', 'Yeux de sorcière', 'monster', 'eyes', '#b6ff00', 'petit'),
  ev('halloween', 'h-hw-witchhat', 'Chapeau de sorcière', 'human', 'acc', 'witchhat', 'moyen'),
  ev('halloween', 'h-hw-pumpkin', 'Tête de citrouille', 'human', 'acc', 'pumpkinhead', 'moyen'),
  ev('halloween', 'm-hw-witchhat', 'Chapeau de sorcière', 'monster', 'acc', 'witchhat', 'moyen'),
  ev('halloween', 'm-hw-pumpkin', 'Tête de citrouille', 'monster', 'acc', 'pumpkinhead', 'moyen'),
  ev('halloween', 'h-hw-witch', 'Sorcière', 'human', 'outfit', 'witch', 'style'),
  ev('halloween', 'h-hw-vampire', 'Vampire', 'human', 'outfit', 'vampire', 'style'),
  ev('halloween', 'm-hw-mummy', 'Momie', 'monster', 'outfit', 'mummy', 'style'),
  ev('halloween', 'h-hw-reaper', 'Faucheuse', 'human', 'outfit', 'reaper', 'exclusif'),
  ev('halloween', 'm-hw-pumpking', 'Roi Citrouille', 'monster', 'outfit', 'pumpking', 'exclusif'),
];

export const cosmetic = (id: string) => CATALOG.find((x) => x.id === id);
/** Everyday items (daily shop, boxes, free gift): no event items. */
const REGULAR = CATALOG.filter((x) => !x.season);

/** Items sold in the event shop while the event is on. */
export const seasonShop = (season: Season | null): Cosmetic[] => (season ? CATALOG.filter((x) => x.season === season && !x.calendarOnly) : []);

// ---------------------------------------------------------------------------
// Wallet
// ---------------------------------------------------------------------------
export type SupplyKind = 'battery' | 'medkit' | 'sedative' | 'food' | 'alarm';
export interface Wallet {
  coins: number;
  owned: string[];
  /** Resources won in boxes, collected from the hobo in the warehouse */
  stash: Record<SupplyKind, number>;
}

/** Admin accounts have (practically) infinite coins. */
export const INFINITE_COINS = 1_000_000_000;
/** Shows ∞ for an admin's bottomless purse. */
export const fmtCoins = (n: number) => (n >= INFINITE_COINS / 10 ? '∞' : String(n));

export const NEW_WALLET = (): Wallet => ({ coins: 100, owned: [], stash: { battery: 0, medkit: 0, sedative: 0, food: 0, alarm: 0 } });

export const sanitizeWallet = (w: unknown): Wallet => {
  const src = (w ?? {}) as Partial<Wallet>;
  const base = NEW_WALLET();
  const stash = { ...base.stash };
  for (const k of Object.keys(stash) as SupplyKind[]) {
    const v = Number(src.stash?.[k]);
    if (Number.isFinite(v) && v > 0) stash[k] = Math.floor(v);
  }
  return {
    coins: Number.isFinite(Number(src.coins)) ? Math.max(0, Math.floor(Number(src.coins))) : base.coins,
    owned: Array.isArray(src.owned) ? src.owned.filter((id) => typeof id === 'string' && !!cosmetic(id)) : [],
    stash,
  };
};

/** Coins for getting out (none in Exploration). */
export const ESCAPE_REWARD = [0, 0, 20, 25, 30, 40];
export const rewardFor = (difficulty: number) => ESCAPE_REWARD[Math.min(5, Math.max(1, Math.floor(difficulty)))] ?? 0;
/** Coins found during a run are capped (anti-abuse). */
export const MAX_FOUND_COINS = 120;

// ---------------------------------------------------------------------------
// Daily shop (same for everyone, changes every day at midnight UTC)
// ---------------------------------------------------------------------------
export const todayKey = (d = new Date()) => d.toISOString().slice(0, 10);

const seedRng = (key: string) => {
  let h = 1779033703 ^ key.length;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 3432918353);
  let a = (h << 13) | (h >>> 19);
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const pickN = <T,>(arr: T[], n: number, rnd: () => number) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
};

/** Today's offers: 3 small, 2 medium, 2 stylish, 1 exclusive. */
export const dailyShop = (key = todayKey()): Cosmetic[] => {
  const rnd = seedRng('shop-' + key);
  const of = (t: Tier) => REGULAR.filter((x) => x.tier === t);
  return [...pickN(of('petit'), 3, rnd), ...pickN(of('moyen'), 2, rnd), ...pickN(of('style'), 2, rnd), ...pickN(of('exclusif'), 1, rnd)];
};

// ---------------------------------------------------------------------------
// Mystery boxes
// ---------------------------------------------------------------------------
export type BoxId = 'rare' | 'mythique' | 'legendaire' | 'exclusive';
export interface BoxDef {
  id: BoxId;
  name: string;
  price: number;
  color: string;
  /** [weight, reward] */
  table: [number, BoxRoll][];
}
type BoxRoll =
  | { kind: 'coins'; min: number; max: number }
  | { kind: 'supplies'; count: number }
  | { kind: 'skin'; tiers: Tier[] };

export const BOXES: BoxDef[] = [
  {
    id: 'rare',
    name: 'Boîte Rare',
    price: 250,
    color: '#38bdf8',
    table: [
      [45, { kind: 'coins', min: 80, max: 260 }],
      [25, { kind: 'supplies', count: 2 }],
      [30, { kind: 'skin', tiers: ['petit'] }],
    ],
  },
  {
    id: 'mythique',
    name: 'Boîte Mythique',
    price: 600,
    color: '#c084fc',
    table: [
      [30, { kind: 'coins', min: 250, max: 700 }],
      [15, { kind: 'supplies', count: 3 }],
      [40, { kind: 'skin', tiers: ['moyen'] }],
      [15, { kind: 'skin', tiers: ['style'] }],
    ],
  },
  {
    id: 'legendaire',
    name: 'Boîte Légendaire',
    price: 1200,
    color: '#f97316',
    table: [
      [25, { kind: 'coins', min: 600, max: 1500 }],
      [10, { kind: 'supplies', count: 5 }],
      [45, { kind: 'skin', tiers: ['style'] }],
      [20, { kind: 'skin', tiers: ['exclusif'] }],
    ],
  },
  {
    id: 'exclusive',
    name: 'Boîte Exclusive',
    price: 2500,
    color: '#fbbf24',
    table: [
      [15, { kind: 'coins', min: 1800, max: 3500 }],
      [55, { kind: 'skin', tiers: ['exclusif'] }],
      [30, { kind: 'skin', tiers: ['style'] }],
    ],
  },
];

export interface BoxResult {
  kind: 'coins' | 'supplies' | 'skin';
  coins?: number;
  supplies?: Partial<Record<SupplyKind, number>>;
  skin?: string;
  /** duplicate skin turned into coins */
  refund?: number;
  text: string;
}

export const SUPPLY_NAMES: Record<SupplyKind, string> = {
  battery: 'Pile',
  medkit: 'Adrénaline',
  sedative: 'Sédatif',
  food: 'Barre de céréales',
  alarm: 'Réveil',
};

/** Opens a box (mutates the wallet). Returns null if not enough coins. */
export const openBox = (w: Wallet, id: BoxId, rnd: () => number = Math.random): BoxResult | null => {
  const box = BOXES.find((b) => b.id === id);
  if (!box || w.coins < box.price) return null;
  w.coins -= box.price;
  const total = box.table.reduce((s, [wt]) => s + wt, 0);
  let r = rnd() * total;
  let roll = box.table[box.table.length - 1][1];
  for (const [wt, rl] of box.table) {
    if ((r -= wt) <= 0) {
      roll = rl;
      break;
    }
  }
  if (roll.kind === 'coins') {
    const n = Math.round(roll.min + rnd() * (roll.max - roll.min));
    w.coins += n;
    return { kind: 'coins', coins: n, text: `${n} pièces` };
  }
  if (roll.kind === 'supplies') {
    const kinds: SupplyKind[] = ['battery', 'medkit', 'sedative', 'food', 'alarm'];
    const got: Partial<Record<SupplyKind, number>> = {};
    for (let i = 0; i < roll.count; i++) {
      const k = kinds[Math.floor(rnd() * kinds.length)];
      got[k] = (got[k] ?? 0) + 1;
      w.stash[k] += 1;
    }
    const text = Object.entries(got)
      .map(([k, n]) => `${n}× ${SUPPLY_NAMES[k as SupplyKind]}`)
      .join(', ');
    return { kind: 'supplies', supplies: got, text: `Ressources : ${text} (à récupérer auprès du SDF)` };
  }
  const pool = REGULAR.filter((x) => roll.tiers.includes(x.tier));
  const skin = pool[Math.floor(rnd() * pool.length)];
  if (w.owned.includes(skin.id)) {
    const refund = Math.round(TIER_PRICE[skin.tier] * 0.6);
    w.coins += refund;
    return { kind: 'skin', skin: skin.id, refund, text: `${skin.name} (déjà possédé → +${refund} pièces)` };
  }
  w.owned.push(skin.id);
  return { kind: 'skin', skin: skin.id, text: `${skin.name} — ${TIER_LABEL[skin.tier]} !` };
};

// ---------------------------------------------------------------------------
// Free daily gift (once per day; coming back every day grows the streak)
// ---------------------------------------------------------------------------
export const MAX_STREAK = 7;

/** Opens today's free gift (mutates the wallet). `streak` = consecutive days, 1..7. */
export const rollDailyGift = (w: Wallet, streak: number, rnd: () => number = Math.random): BoxResult => {
  const bonus = Math.min(MAX_STREAK, Math.max(1, streak)) * 5;
  const r = rnd();
  // Day 7 in a row: always something special
  if (streak >= MAX_STREAK || r < 0.06) {
    const pool = REGULAR.filter((x) => x.tier === 'petit' && !w.owned.includes(x.id));
    if (pool.length) {
      const skin = pool[Math.floor(rnd() * pool.length)];
      w.owned.push(skin.id);
      return { kind: 'skin', skin: skin.id, text: `${skin.name} — un skin offert !` };
    }
  }
  if (r < 0.22) {
    const kinds: SupplyKind[] = ['battery', 'medkit', 'sedative', 'food', 'alarm'];
    const k = kinds[Math.floor(rnd() * kinds.length)];
    w.stash[k] += 1;
    const n = 15 + bonus;
    w.coins += n;
    return { kind: 'supplies', supplies: { [k]: 1 }, coins: n, text: `${n} pièces + 1× ${SUPPLY_NAMES[k]} (à récupérer auprès du SDF)` };
  }
  const n = Math.round(25 + rnd() * 25) + bonus;
  w.coins += n;
  return { kind: 'coins', coins: n, text: `${n} pièces` };
};

/** Buys one of today's offers (or an event item during its event). Returns an error message, or null on success. */
export const buyCosmetic = (w: Wallet, id: string, key = todayKey(), season: Season | null = null): string | null => {
  const item = cosmetic(id);
  if (!item) return 'Article inconnu.';
  const inEvent = seasonShop(season).some((x) => x.id === id);
  if (item.season && !inEvent) return item.calendarOnly ? 'Cet article est seulement dans le calendrier de l\'Avent.' : 'L\'événement est terminé.';
  if (!inEvent && !dailyShop(key).some((x) => x.id === id)) return 'Cet article n\'est plus en boutique aujourd\'hui.';
  if (w.owned.includes(id)) return 'Vous l\'avez déjà.';
  const price = TIER_PRICE[item.tier];
  if (w.coins < price) return 'Pas assez de pièces.';
  w.coins -= price;
  w.owned.push(id);
  return null;
};

// ---------------------------------------------------------------------------
// 🎄 Advent calendar: one box a day from December 1st to 25th
// ---------------------------------------------------------------------------
export interface AdventReward {
  coins?: number;
  /** random resources (collected from the hobo) */
  supplies?: number;
  skin?: string;
}
/** Day N = ADVENT[N - 1]. Special skins on 6, 12, 18, 24 and the Santa outfit on the 25th. */
export const ADVENT: AdventReward[] = [
  { coins: 50 },
  { supplies: 2 },
  { skin: 'h-noel-gown-red' },
  { coins: 75 },
  { supplies: 2 },
  { skin: 'h-noel-antlers' },
  { coins: 100 },
  { skin: 'm-noel-eyes-pine' },
  { supplies: 3 },
  { coins: 120 },
  { skin: 'h-noel-hair-snow' },
  { skin: 'm-noel-antlers' },
  { coins: 150 },
  { supplies: 3 },
  { skin: 'm-noel-skin-frost' },
  { coins: 200 },
  { skin: 'h-noel-santahat' },
  { skin: 'm-noel-ginger' },
  { coins: 250 },
  { supplies: 4 },
  { skin: 'h-noel-elf' },
  { coins: 300 },
  { skin: 'm-noel-santahat' },
  { skin: 'm-noel-krampus' },
  { skin: 'h-noel-santa', coins: 500 },
];

/** Opens advent box `day` (mutates the wallet). */
export const claimAdvent = (w: Wallet, day: number, rnd: () => number = Math.random): BoxResult => {
  const r = ADVENT[day - 1];
  const parts: string[] = [];
  const result: BoxResult = { kind: 'coins', text: '' };
  if (r.skin) {
    const skin = cosmetic(r.skin)!;
    result.kind = 'skin';
    result.skin = skin.id;
    if (w.owned.includes(skin.id)) {
      const refund = Math.round(TIER_PRICE[skin.tier] * 0.6);
      w.coins += refund;
      result.refund = refund;
      parts.push(`${skin.name} (déjà possédé → +${refund} pièces)`);
    } else {
      w.owned.push(skin.id);
      parts.push(`${skin.name} — ${TIER_LABEL[skin.tier]} !`);
    }
  }
  if (r.supplies) {
    const kinds: SupplyKind[] = ['battery', 'medkit', 'sedative', 'food', 'alarm'];
    const got: Partial<Record<SupplyKind, number>> = {};
    for (let i = 0; i < r.supplies; i++) {
      const k = kinds[Math.floor(rnd() * kinds.length)];
      got[k] = (got[k] ?? 0) + 1;
      w.stash[k] += 1;
    }
    if (result.kind !== 'skin') result.kind = 'supplies';
    result.supplies = got;
    parts.push(
      'Ressources : ' +
        Object.entries(got)
          .map(([k, n]) => `${n}× ${SUPPLY_NAMES[k as SupplyKind]}`)
          .join(', ') +
        ' (à récupérer auprès du SDF)'
    );
  }
  if (r.coins) {
    w.coins += r.coins;
    result.coins = r.coins;
    parts.push(`${r.coins} pièces`);
  }
  result.text = parts.join(' + ');
  return result;
};

// ---------------------------------------------------------------------------
// The hobo's goods (in-game, delivered straight into your hands)
// ---------------------------------------------------------------------------
export interface Goods {
  kind: SupplyKind | 'can';
  name: string;
  price: number;
  desc: string;
}
export const HOBO_GOODS: Goods[] = [
  { kind: 'battery', name: 'Pile', price: 30, desc: '+55 % de batterie pour la lampe.' },
  { kind: 'food', name: 'Barre de céréales', price: 20, desc: 'Redonne du souffle.' },
  { kind: 'medkit', name: 'Adrénaline', price: 60, desc: 'Endurance au maximum.' },
  { kind: 'can', name: 'Canette', price: 10, desc: 'À lancer pour faire diversion.' },
  { kind: 'alarm', name: 'Réveil', price: 45, desc: 'Posez-le : il sonne et attire les monstres.' },
  { kind: 'sedative', name: 'Sédatif', price: 150, desc: 'Immobilise un monstre 5 secondes.' },
];

/** Pays for hobo goods (mutates). Returns an error message or null. */
export const buyGoods = (w: Wallet, kind: string): string | null => {
  const g = HOBO_GOODS.find((x) => x.kind === kind);
  if (!g) return 'Il n\'a pas ça.';
  if (w.coins < g.price) return 'Pas assez de pièces.';
  w.coins -= g.price;
  return null;
};

/** Takes one resource out of the stash (mutates). */
export const takeStash = (w: Wallet, kind: SupplyKind): string | null => {
  if (!(w.stash[kind] > 0)) return 'Rien de ce type dans votre réserve.';
  w.stash[kind] -= 1;
  return null;
};
