import { CATALOG } from './economy';

/** Player customisation: colours, accessory and outfit of your human and your creature. */
export interface Appearance {
  human: { skin: string; gown: string; hair: string; acc: string; outfit: string };
  monster: { skin: string; eyes: string; gown: string; acc: string; outfit: string };
}

export const DEFAULT_APPEARANCE: Appearance = {
  human: { skin: '#d9b59a', gown: '#7f9aa8', hair: '#1d1d22', acc: '', outfit: '' },
  monster: { skin: '#8f968d', eyes: '#ff2a10', gown: '#6a6a60', acc: '', outfit: '' },
};

const HEX = /^#[0-9a-f]{6}$/i;
const ID = /^[a-z0-9]{0,16}$/;
const COSMETIC_KEYS = ['acc', 'outfit'];

/** Keeps only valid colours / ids, falling back to the defaults. */
export const sanitizeAppearance = (a: unknown): Appearance => {
  const src = (a ?? {}) as Partial<Record<'human' | 'monster', Record<string, unknown>>>;
  const pick = <T extends Record<string, string>>(def: T, v: Record<string, unknown> | undefined): T => {
    const out = { ...def };
    for (const k of Object.keys(def) as (keyof T)[]) {
      const c = v?.[k as string];
      if (typeof c !== 'string') continue;
      if (COSMETIC_KEYS.includes(k as string) ? ID.test(c) : HEX.test(c)) out[k] = c.toLowerCase() as T[keyof T];
    }
    return out;
  };
  return { human: pick(DEFAULT_APPEARANCE.human, src.human), monster: pick(DEFAULT_APPEARANCE.monster, src.monster) };
};

/** Colour choices shown in the menu (free for everyone). */
export const PALETTES = {
  humanSkin: ['#f3d6bf', '#d9b59a', '#c49473', '#a06d4f', '#7a4e33', '#4f3222'],
  humanGown: ['#7f9aa8', '#9ab89a', '#c8c8c0', '#a87f8f', '#3f5f8f', '#2f2f35', '#b08a4a', '#8f2f2f'],
  humanHair: ['#1d1d22', '#4a2e1a', '#8a5a2a', '#d8b860', '#b04a2a', '#c8c8c8'],
  monsterSkin: ['#8f968d', '#6f8a5a', '#c8c4b0', '#9a5a5a', '#5a6f8f', '#3a3a3a'],
  monsterEyes: ['#ff2a10', '#ffd21a', '#3aff6a', '#2ab0ff', '#ffffff', '#c03aff'],
  monsterGown: ['#6a6a60', '#5a7080', '#7a5a4a', '#3a3a40', '#8a2a2a', '#a8a890'],
};

const FREE: Record<string, string[]> = {
  'human.skin': PALETTES.humanSkin,
  'human.gown': PALETTES.humanGown,
  'human.hair': PALETTES.humanHair,
  'monster.skin': PALETTES.monsterSkin,
  'monster.eyes': PALETTES.monsterEyes,
  'monster.gown': PALETTES.monsterGown,
};

/** Removes anything the player doesn't own (server side). */
export const enforceOwned = (a: Appearance, owned: string[]): Appearance => {
  const out = sanitizeAppearance(a);
  for (const target of ['human', 'monster'] as const) {
    const part = out[target] as Record<string, string>;
    const def = DEFAULT_APPEARANCE[target] as Record<string, string>;
    for (const key of Object.keys(part)) {
      const v = part[key];
      if (COSMETIC_KEYS.includes(key) && v === '') continue;
      if (FREE[`${target}.${key}`]?.includes(v)) continue;
      const ok = CATALOG.some((x) => owned.includes(x.id) && x.target === target && x.slot === key && x.value === v);
      if (!ok) part[key] = def[key];
    }
  }
  return out;
};
