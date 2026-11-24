/**
 * 🔧 L'Atelier: permanent upgrades bought with coins (3 levels each).
 * Shared with the server (ids and prices are checked there).
 * Not used in ranked games, so that ranked stays fair.
 */
export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  icon: string;
  /** what each level gives (index 0 = level 1) */
  levels: [string, string, string];
}
export type UpgradeId = 'lamp' | 'battery' | 'bag' | 'quiet' | 'kit';

export const UPGRADES: UpgradeDef[] = [
  { id: 'lamp', name: 'Lampe renforcée', icon: '🔦', levels: ['Faisceau +15 % (plus loin, plus fort)', 'Faisceau +30 %', 'Faisceau +45 %'] },
  { id: 'battery', name: 'Batterie longue durée', icon: '🔋', levels: ['La lampe dure 18 % plus longtemps', '+43 %', '+82 %'] },
  { id: 'bag', name: 'Sac plus grand', icon: '🎒', levels: ['6 places au lieu de 5', '7 places', '8 places'] },
  { id: 'quiet', name: 'Semelles silencieuses', icon: '👟', levels: ['Tes pas s\'entendent 12 % moins loin', '24 % moins loin', '36 % moins loin'] },
  { id: 'kit', name: 'Trousse de départ', icon: '🩹', levels: ['1 bandage au début de chaque partie', '1 bandage + 1 pile', '2 bandages + 1 pile'] },
];

/** Coins for level 1, 2, 3 */
export const UPGRADE_PRICES = [250, 600, 1200];
export const MAX_UPGRADE = 3;
export const isUpgradeId = (id: unknown): id is UpgradeId => typeof id === 'string' && UPGRADES.some((u) => u.id === id);

/** Effects for given levels (0 = not bought) */
export const upgradeEffects = (lv: Partial<Record<UpgradeId, number>>) => {
  const l = (id: UpgradeId) => Math.max(0, Math.min(MAX_UPGRADE, Math.floor(lv[id] ?? 0)));
  return {
    beam: 1 + 0.15 * l('lamp'),
    drain: 1 - 0.15 * l('battery'),
    slots: 5 + l('bag'),
    noise: 1 - 0.12 * l('quiet'),
    kit: l('kit'),
  };
};
