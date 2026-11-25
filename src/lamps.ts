/**
 * 🔦 Collectible flashlights: the colour of your beam, and the rarer ones
 * have a small bonus (battery lasts longer, wider beam).
 */
export interface LampDef {
  color: number;
  /** battery drain multiplier (lower = lasts longer) */
  drain: number;
  /** beam width multiplier */
  width: number;
}

export const DEFAULT_LAMP: LampDef = { color: 0xfff1dc, drain: 1, width: 1 };

export const LAMPS: Record<string, LampDef> = {
  lminer: { color: 0xffd27a, drain: 1, width: 1 },
  lice: { color: 0xa8dcff, drain: 1, width: 1 },
  lcandle: { color: 0xffa04a, drain: 1, width: 1 },
  lgreen: { color: 0x8aff9a, drain: 1, width: 1 },
  lred: { color: 0xff4a3a, drain: 0.9, width: 1 },
  lpink: { color: 0xff6ad8, drain: 0.9, width: 1 },
  lgold: { color: 0xffd84a, drain: 0.85, width: 1.15 },
};

export const lampOf = (id?: string): LampDef => (id && LAMPS[id]) || DEFAULT_LAMP;
