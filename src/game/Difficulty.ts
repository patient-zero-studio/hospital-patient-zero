export type Difficulty = 1 | 2 | 3 | 4 | 5;

export interface DifficultyInfo {
  level: Difficulty;
  name: string;
  monsters: number;
  description: string;
}

/** Level N has N - 1 creatures roaming the hospital. */
export const DIFFICULTIES: DifficultyInfo[] = [
  { level: 1, name: 'Exploration', monsters: 0, description: 'Aucun monstre. Explorez l\'hôpital et découvrez l\'histoire.' },
  { level: 2, name: 'Normal', monsters: 1, description: 'Le Patient Zéro rôde dans les couloirs.' },
  { level: 3, name: 'Difficile', monsters: 2, description: 'Deux créatures au rez-de-chaussée, une autre rôde à l\'étage.' },
  { level: 4, name: 'Cauchemar', monsters: 3, description: 'Trois créatures en bas, une à l\'étage. Chaque bruit compte.' },
  { level: 5, name: 'Enfer', monsters: 4, description: 'Quatre créatures en bas, une à l\'étage. Bonne chance.' },
];

export const difficultyInfo = (d: Difficulty) => DIFFICULTIES[d - 1];
