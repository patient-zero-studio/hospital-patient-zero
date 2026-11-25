/**
 * Coins, cosmetics shop and mystery boxes. Pure functions shared by the
 * server (authoritative for accounts) and the client (display).
 */
import { SEASONS, type Season } from './seasons';

export type Tier = 'petit' | 'moyen' | 'style' | 'exclusif';
export type Target = 'human' | 'monster';
/** What a cosmetic changes: a colour slot, an accessory or a whole outfit. */
export type Slot = 'gown' | 'hair' | 'skin' | 'eyes' | 'acc' | 'outfit' | 'fx' | 'dance' | 'lamp';

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
  /** Earned, never sold: season pass tier or player level */
  unlock?: 'pass' | 'level' | 'xmas' | 'ranked' | 'clan' | 'story' | 'gifts';
}

export const TIER_PRICE: Record<Tier, number> = { petit: 100, moyen: 500, style: 1000, exclusif: 2000 };
export const TIER_LABEL: Record<Tier, string> = { petit: 'Petit skin', moyen: 'Skin moyen', style: 'Skin stylé', exclusif: 'Exclusif' };
export const TIER_COLOR: Record<Tier, string> = { petit: '#a1a1aa', moyen: '#38bdf8', style: '#c084fc', exclusif: '#fbbf24' };

/** ✨ Rarity: exclusive AND never sold (earned or advent calendar) = Légendaire */
export const isLegendary = (c: Cosmetic) => c.tier === 'exclusif' && (!!c.unlock || !!c.calendarOnly);
export const rarityLabel = (c: Cosmetic) => (isLegendary(c) ? 'Légendaire' : TIER_LABEL[c.tier]);
export const rarityColor = (c: Cosmetic) => (isLegendary(c) ? '#ff8a1a' : TIER_COLOR[c.tier]);

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
  { ...ev('noel', 'm-noel-evilsanta', 'Père Noël maléfique', 'monster', 'outfit', 'evilsanta', 'exclusif', true), unlock: 'xmas' },
  // 🎁 Golden gifts hidden in every December game (5 / 15 / 30 found)
  { ...ev('noel', 'h-noel-bells', 'Collier de clochettes', 'human', 'acc', 'bellcollar', 'style', true), unlock: 'gifts' },
  { ...ev('noel', 'm-noel-fouettard', 'Père Fouettard', 'monster', 'outfit', 'fouettard', 'exclusif', true), unlock: 'gifts' },
  { ...ev('noel', 'h-noel-fouettard', 'Manteau du Père Fouettard', 'human', 'outfit', 'fouettard', 'exclusif', true), unlock: 'gifts' },

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

  // ---- 🐰 Pâques (une semaine avant et après Pâques) ----
  ev('paques', 'h-pq-gown-lemon', 'Blouse jaune poussin', 'human', 'gown', '#fde047', 'petit'),
  ev('paques', 'h-pq-hair-mint', 'Cheveux menthe', 'human', 'hair', '#6ee7b7', 'petit'),
  ev('paques', 'm-pq-skin-lilac', 'Peau lilas', 'monster', 'skin', '#c4b5fd', 'petit'),
  ev('paques', 'h-pq-ears', 'Oreilles de lapin', 'human', 'acc', 'bunnyears', 'moyen'),
  ev('paques', 'm-pq-ears', 'Oreilles de lapin', 'monster', 'acc', 'bunnyears', 'moyen'),
  ev('paques', 'h-pq-bunny', 'Lapin de Pâques', 'human', 'outfit', 'bunny', 'style'),
  ev('paques', 'm-pq-choco', 'Lapin en chocolat', 'monster', 'outfit', 'chocobunny', 'exclusif'),

  // ---- 💘 Saint-Valentin (7 → 16 février) ----
  ev('valentin', 'h-sv-gown-rose', 'Blouse rose tendre', 'human', 'gown', '#f9a8d4', 'petit'),
  ev('valentin', 'h-sv-hair-red', 'Cheveux rouge passion', 'human', 'hair', '#be123c', 'petit'),
  ev('valentin', 'm-sv-eyes-love', 'Yeux amoureux', 'monster', 'eyes', '#ff3a8a', 'petit'),
  ev('valentin', 'h-sv-shades', 'Lunettes cœur', 'human', 'acc', 'heartshades', 'moyen'),
  ev('valentin', 'm-sv-boppers', 'Serre-tête cœurs', 'monster', 'acc', 'heartboppers', 'moyen'),
  ev('valentin', 'h-sv-cupid', 'Cupidon', 'human', 'outfit', 'cupid', 'style'),
  ev('valentin', 'm-sv-lovebeast', 'Monstre amoureux', 'monster', 'outfit', 'lovebeast', 'exclusif'),

  // ---- 🐟 Poisson d'avril (1er → 3 avril) ----
  ev('poisson', 'h-pa-gown-sea', 'Blouse bleu océan', 'human', 'gown', '#0ea5e9', 'petit'),
  ev('poisson', 'm-pa-skin-fish', "Peau d'écailles", 'monster', 'skin', '#2dd4bf', 'petit'),
  ev('poisson', 'h-pa-fishhat', 'Poisson sur la tête', 'human', 'acc', 'fishhat', 'moyen'),
  ev('poisson', 'm-pa-fishhat', 'Poisson sur la tête', 'monster', 'acc', 'fishhat', 'moyen'),
  ev('poisson', 'h-pa-clownnose', 'Nez de clown', 'human', 'acc', 'clownnose', 'moyen'),
  ev('poisson', 'h-pa-clown', 'Clown farceur', 'human', 'outfit', 'clown', 'style'),
  ev('poisson', 'm-pa-clown', 'Clown maléfique', 'monster', 'outfit', 'clownm', 'exclusif'),

  // ---- 🏆 Pass de saison (paliers 10, 20, 30) ----
  // 🏅 Ranked pass (earned, never sold)
  { ...c('m-rank-gladiator', 'Gladiateur de l\'arène', 'monster', 'outfit', 'gladiator', 'exclusif'), unlock: 'ranked' },
  { ...c('hfx-rank-stars', 'Étoiles du classement', 'human', 'fx', 'stars', 'exclusif'), unlock: 'ranked' },
  { ...c('h-rank-champion', 'Champion classé', 'human', 'outfit', 'champion', 'exclusif'), unlock: 'ranked' },
  // 🏆 Story trophies: beat the boss (chapter 7), finish the secret chapter
  { ...c('m-story-moreau', 'Dr Moreau (boss)', 'monster', 'outfit', 'moreau', 'exclusif'), unlock: 'story' },
  { ...c('h-story-moreau', 'Blouse du Dr Moreau', 'human', 'outfit', 'moreauh', 'exclusif'), unlock: 'story' },
  { ...c('m-story-ombre', 'L\'Ombre', 'monster', 'outfit', 'ombre', 'exclusif'), unlock: 'story' },
  { ...c('h-story-lucas', 'Pyjama de Lucas', 'human', 'outfit', 'lucas', 'exclusif'), unlock: 'story' },
  // 🔪 Imposteur: 10 wins
  { ...c('h-imp-mask', "Masque de l'imposteur", 'human', 'outfit', 'impostor', 'exclusif'), unlock: 'story' },
  // 🛡️ Clan chest (earned together, never sold)
  { ...c('h-clan-knight', 'Chevalier du clan', 'human', 'outfit', 'clanknight', 'style'), unlock: 'clan' },
  { ...c('m-clan-beast', 'Bête du clan', 'monster', 'outfit', 'clanbeast', 'exclusif'), unlock: 'clan' },
  { ...c('hfx-clan-embers', 'Braises du clan', 'human', 'fx', 'embers', 'exclusif'), unlock: 'clan' },
  // 💃 Victory dances
  c('d-jump', 'Saut de joie', 'human', 'dance', 'jump', 'petit'),
  c('d-salute', 'Salut militaire', 'human', 'dance', 'salute', 'petit'),
  c('d-guitar', 'Air guitar', 'human', 'dance', 'guitar', 'moyen'),
  c('d-flex', 'Muscles !', 'human', 'dance', 'flex', 'moyen'),
  c('d-robot', 'Danse du robot', 'human', 'dance', 'robot', 'style'),
  c('d-moon', 'Moonwalk', 'human', 'dance', 'moon', 'exclusif'),
  c('d-bow', 'Révérence', 'human', 'dance', 'bow', 'petit'),
  c('d-zombie', 'Marche du zombie', 'human', 'dance', 'zombie', 'petit'),
  c('d-chicken', 'Danse du poulet', 'human', 'dance', 'chicken', 'moyen'),
  c('d-floss', 'Floss', 'human', 'dance', 'floss', 'moyen'),
  c('d-disco', 'Disco', 'human', 'dance', 'disco', 'style'),
  c('d-break', 'Breakdance', 'human', 'dance', 'breakdance', 'exclusif'),
  // 🤠 Chapeaux, masques et tenues
  c('h-acc-eyepatch', 'Cache-œil', 'human', 'acc', 'eyepatch', 'petit'),
  c('h-acc-fedora', 'Chapeau de détective', 'human', 'acc', 'fedora', 'moyen'),
  c('h-acc-cowboy', 'Chapeau de cowboy', 'human', 'acc', 'cowboyhat', 'moyen'),
  c('h-acc-pirate', 'Tricorne de pirate', 'human', 'acc', 'piratehat', 'moyen'),
  c('m-acc-pirate', 'Tricorne de pirate', 'monster', 'acc', 'piratehat', 'moyen'),
  c('h-acc-plague', 'Masque de peste', 'human', 'acc', 'plaguemask', 'style'),
  c('m-acc-plague', 'Masque de peste', 'monster', 'acc', 'plaguemask', 'style'),
  c('h-out-cowboy', 'Cowboy', 'human', 'outfit', 'cowboy', 'style'),
  c('h-out-pirate', 'Pirate', 'human', 'outfit', 'pirate', 'style'),
  c('h-out-detective', 'Détective', 'human', 'outfit', 'detective', 'style'),
  c('h-out-plague', 'Médecin de peste', 'human', 'outfit', 'plaguedoc', 'exclusif'),
  c('m-out-plague', 'Bête de la peste', 'monster', 'outfit', 'plaguebeast', 'style'),
  c('m-out-wendigo', 'Wendigo', 'monster', 'outfit', 'wendigo', 'exclusif'),
  c('m-out-ghostpirate', 'Pirate fantôme', 'monster', 'outfit', 'ghostpirate', 'exclusif'),
  // ✨ Animated skins
  c('hfx-aura', 'Aura spectrale', 'human', 'fx', 'aura', 'exclusif'),
  c('hfx-smoke', 'Traînée de fumée', 'human', 'fx', 'smoke', 'style'),
  c('hfx-halo', 'Auréole dorée', 'human', 'fx', 'halo', 'style'),
  c('hfx-sparks', 'Survolté', 'human', 'fx', 'sparks', 'exclusif'),
  c('mfx-aura', 'Aura maudite', 'monster', 'fx', 'aura', 'exclusif'),
  c('mfx-smoke', 'Brume noire', 'monster', 'fx', 'smoke', 'style'),
  c('mfx-flames', 'Flammes infernales', 'monster', 'fx', 'flames', 'exclusif'),
  c('mfx-rainbow', 'Yeux arc-en-ciel', 'monster', 'fx', 'rainbow', 'style'),
  { ...c('h-pass-crown', 'Couronne du survivant', 'human', 'acc', 'crown', 'style'), unlock: 'pass' },
  { ...c('m-pass-toxic', 'Patient Toxique', 'monster', 'outfit', 'toxic', 'style'), unlock: 'pass' },
  { ...c('h-pass-hazmat', 'Combinaison NRBC', 'human', 'outfit', 'hazmat', 'exclusif'), unlock: 'pass' },
  // ---- ⭐ Niveaux 10, 25, 50, 100 ----
  { ...c('h-lvl-goggles', 'Lunettes de vision nocturne', 'human', 'acc', 'nightvision', 'moyen'), unlock: 'level' },
  { ...c('m-lvl-abyss', 'Créature des abysses', 'monster', 'outfit', 'abyss', 'style'), unlock: 'level' },
  { ...c('h-lvl-veteran', 'Vétéran de Saint-Aurore', 'human', 'outfit', 'veteran', 'exclusif'), unlock: 'level' },
  { ...c('m-lvl-legend', 'Patient Zéro Légendaire', 'monster', 'outfit', 'legend', 'exclusif'), unlock: 'level' },
  // ---- 🔦 Lampes de collection ----
  c('l-miner', 'Lampe de mineur', 'human', 'lamp', 'lminer', 'petit'),
  c('l-ice', 'Lampe bleu glacier', 'human', 'lamp', 'lice', 'petit'),
  c('l-candle', 'Lanterne bougie', 'human', 'lamp', 'lcandle', 'moyen'),
  c('l-green', 'Lanterne verte', 'human', 'lamp', 'lgreen', 'moyen'),
  c('l-red', 'Lampe rouge sang', 'human', 'lamp', 'lred', 'style'),
  c('l-pink', 'Néon rose', 'human', 'lamp', 'lpink', 'style'),
  c('l-gold', 'Lampe dorée', 'human', 'lamp', 'lgold', 'exclusif'),
];

export const cosmetic = (id: string) => CATALOG.find((x) => x.id === id);
/** Everyday items (daily shop, boxes, free gift): no event items. */
const REGULAR = CATALOG.filter((x) => !x.season && !x.unlock);

/** Items sold in the event shop while the event is on. */
export const seasonShop = (season: Season | null): Cosmetic[] => (season ? CATALOG.filter((x) => x.season === season && !x.calendarOnly) : []);

// ---------------------------------------------------------------------------
// Wallet
// ---------------------------------------------------------------------------
export type SupplyKind = 'battery' | 'medkit' | 'sedative' | 'food' | 'alarm' | 'smoke' | 'trap';
export interface Wallet {
  coins: number;
  owned: string[];
  /** Resources won in boxes, collected from the hobo in the warehouse */
  stash: Record<SupplyKind, number>;
  /** Event treats picked up in the levels (bonbons, œufs…), per event */
  treats: Partial<Record<Season, number>>;
}

/** Admin accounts have (practically) infinite coins. */
export const INFINITE_COINS = 1_000_000_000;
/** Shows ∞ for an admin's bottomless purse. */
export const fmtCoins = (n: number) => (n >= INFINITE_COINS / 10 ? '∞' : String(n));

export const NEW_WALLET = (): Wallet => ({ coins: 100, owned: [], stash: { battery: 0, medkit: 0, sedative: 0, food: 0, alarm: 0, smoke: 0, trap: 0 }, treats: {} });

export const sanitizeWallet = (w: unknown): Wallet => {
  const src = (w ?? {}) as Partial<Wallet>;
  const base = NEW_WALLET();
  const stash = { ...base.stash };
  for (const k of Object.keys(stash) as SupplyKind[]) {
    const v = Number(src.stash?.[k]);
    if (Number.isFinite(v) && v > 0) stash[k] = Math.floor(v);
  }
  const treats: Partial<Record<Season, number>> = {};
  for (const k of SEASONS) {
    const v = Number(src.treats?.[k]);
    if (Number.isFinite(v) && v > 0) treats[k] = Math.floor(v);
  }
  return {
    coins: Number.isFinite(Number(src.coins)) ? Math.max(0, Math.floor(Number(src.coins))) : base.coins,
    owned: Array.isArray(src.owned) ? src.owned.filter((id) => typeof id === 'string' && !!cosmetic(id)) : [],
    stash,
    treats,
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
/** ✨ How rare an outfit is: 0 none, 1 stylé, 2 exclusif, 3 légendaire */
export const outfitRank = (target: Target, value?: string): 0 | 1 | 2 | 3 => {
  if (!value) return 0;
  const it = CATALOG.find((x) => x.target === target && x.slot === 'outfit' && x.value === value);
  if (!it) return 0;
  if (isLegendary(it)) return 3;
  return it.tier === 'exclusif' ? 2 : it.tier === 'style' ? 1 : 0;
};

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
  smoke: 'Fumigène',
  trap: 'Piège à mâchoires',
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
    const kinds: SupplyKind[] = ['battery', 'medkit', 'sedative', 'food', 'alarm', 'smoke', 'trap'];
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
  return { kind: 'skin', skin: skin.id, text: `${skin.name} — ${rarityLabel(skin)} !` };
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
    const kinds: SupplyKind[] = ['battery', 'medkit', 'sedative', 'food', 'alarm', 'smoke', 'trap'];
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
  if (item.unlock)
    return item.unlock === 'pass'
      ? 'Ce skin se gagne dans le pass de saison.'
      : item.unlock === 'xmas'
        ? 'Ce skin se gagne dans la Nuit de Noël (les 12 cadeaux).'
        : item.unlock === 'gifts'
          ? 'Ce skin se gagne en trouvant des cadeaux dorés en décembre (5, 15 et 30).'
        : item.unlock === 'story'
          ? 'Ce skin se gagne avec un succès (voir le menu Succès).'
          : item.unlock === 'ranked'
            ? 'Ce skin se gagne en mode classé.'
            : item.unlock === 'clan'
              ? 'Ce skin se gagne dans le coffre de clan.'
              : 'Ce skin se gagne en montant de niveau.';
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
      parts.push(`${skin.name} — ${rarityLabel(skin)} !`);
    }
  }
  if (r.supplies) {
    const kinds: SupplyKind[] = ['battery', 'medkit', 'sedative', 'food', 'alarm', 'smoke', 'trap'];
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
// Event treats: picked up in the levels, 500 open an event box
// ---------------------------------------------------------------------------
export const EVENT_BOX_PRICE = 500;
/** Most treats a single run can bring back (anti-abuse). */
export const MAX_TREATS_PER_RUN = 60;
/** A rare chest found in a level gives this many treats (one per run at most). */
export const TREATS_PER_CHEST = 250;
/** 🎄 Christmas night: presents hidden in the hospital */
export const XMAS_PRESENTS = 12;

/** Opens an event box with treats (mutates). Returns null if not enough treats. */
export const openEventBox = (w: Wallet, season: Season, rnd: () => number = Math.random): BoxResult | null => {
  const have = w.treats[season] ?? 0;
  if (have < EVENT_BOX_PRICE) return null;
  w.treats[season] = have - EVENT_BOX_PRICE;
  const r = rnd();
  if (r < 0.12) {
    const n = Math.round(200 + rnd() * 300);
    w.coins += n;
    return { kind: 'coins', coins: n, text: `${n} pièces` };
  }
  // Event skins (not the advent calendar ones): rarer tiers less often
  const weights: Record<Tier, number> = { petit: 40, moyen: 32, style: 20, exclusif: 8 };
  const pool = CATALOG.filter((x) => x.season === season && !x.calendarOnly);
  const total = pool.reduce((t, x) => t + weights[x.tier], 0);
  let k = rnd() * total;
  let skin = pool[pool.length - 1];
  for (const x of pool) {
    if ((k -= weights[x.tier]) <= 0) {
      skin = x;
      break;
    }
  }
  if (w.owned.includes(skin.id)) {
    const refund = Math.round(TIER_PRICE[skin.tier] * 0.6);
    w.coins += refund;
    return { kind: 'skin', skin: skin.id, refund, text: `${skin.name} (déjà possédé → +${refund} pièces)` };
  }
  w.owned.push(skin.id);
  return { kind: 'skin', skin: skin.id, text: `${skin.name} — ${rarityLabel(skin)} !` };
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
  { kind: 'medkit', name: 'Adrénaline', price: 60, desc: 'Endurance au maximum + 6 s de sprint illimité.' },
  { kind: 'can', name: 'Canette', price: 10, desc: 'À lancer pour faire diversion.' },
  { kind: 'alarm', name: 'Réveil', price: 45, desc: 'Posez-le : il sonne et attire les monstres.' },
  { kind: 'sedative', name: 'Sédatif', price: 150, desc: 'Immobilise un monstre 5 secondes.' },
  { kind: 'smoke', name: 'Fumigène', price: 80, desc: 'Un nuage épais : les monstres ne vous voient plus.' },
  { kind: 'trap', name: 'Piège à mâchoires', price: 110, desc: 'Bloque 6 s le premier monstre qui marche dessus.' },
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

/** 🏆 Skins won by finishing the story: achievement → skins */
export const STORY_SKINS: { ach: string; skins: string[] }[] = [
  { ach: 'ch7_end', skins: ['m-story-moreau', 'h-story-moreau'] },
  { ach: 'ch8_end', skins: ['m-story-ombre', 'h-story-lucas'] },
  { ach: 'imp_10', skins: ['h-imp-mask'] },
];

/** 🎁 Golden gifts found in December → exclusive skins */
export const GIFT_SKINS: [number, string][] = [
  [5, 'h-noel-bells'],
  [15, 'm-noel-fouettard'],
  [30, 'h-noel-fouettard'],
];
