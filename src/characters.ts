/**
 * Playable survivors: each one has a hairstyle, a build and default colours.
 * Free for everyone; chosen in the customisation menu (Appearance.human.char).
 */
export type HairStyle = 'short' | 'long' | 'ponytail' | 'bun' | 'curly' | 'bald';

export interface CharacterDef {
  id: string;
  name: string;
  emoji: string;
  desc: string;
  hair: HairStyle;
  beard?: boolean;
  /** overall size (1 = normal) and shoulder width */
  height: number;
  width: number;
  colors: { skin: string; hair: string; gown: string };
}

export const CHARACTERS: CharacterDef[] = [
  { id: 'alex', name: 'Alex', emoji: '🧑', desc: 'Le patient de la chambre 104.', hair: 'short', height: 1, width: 1, colors: { skin: '#d9b59a', hair: '#1d1d22', gown: '#7f9aa8' } },
  { id: 'marie', name: 'Marie', emoji: '👩', desc: 'Infirmière de nuit, elle connaît chaque couloir.', hair: 'long', height: 0.97, width: 0.94, colors: { skin: '#f3d6bf', hair: '#8a5a2a', gown: '#a87f8f' } },
  { id: 'bob', name: 'Bob', emoji: '🧔', desc: 'Agent d\'entretien costaud, pas très discret.', hair: 'bald', beard: true, height: 1.02, width: 1.14, colors: { skin: '#c49473', hair: '#4a2e1a', gown: '#3f5f8f' } },
  { id: 'john', name: 'John', emoji: '👱', desc: 'Grand, blond, venu rendre visite à son frère.', hair: 'short', beard: true, height: 1.06, width: 1.02, colors: { skin: '#f3d6bf', hair: '#d8b860', gown: '#9ab89a' } },
  { id: 'lea', name: 'Léa', emoji: '👧', desc: 'Petite et rapide, une queue de cheval rousse.', hair: 'ponytail', height: 0.93, width: 0.9, colors: { skin: '#f3d6bf', hair: '#b04a2a', gown: '#c8c8c0' } },
  { id: 'karim', name: 'Karim', emoji: '🧑🏾', desc: 'Étudiant en médecine, garde son calme.', hair: 'curly', height: 1.01, width: 1, colors: { skin: '#7a4e33', hair: '#1d1d22', gown: '#2f2f35' } },
  { id: 'yuki', name: 'Yuki', emoji: '👩🏻', desc: 'Chercheuse du Site B, chignon impeccable.', hair: 'bun', height: 0.96, width: 0.92, colors: { skin: '#f3d6bf', hair: '#1d1d22', gown: '#f2f2ec' } },
  { id: 'odette', name: 'Mamie Odette', emoji: '👵', desc: 'Pensionnaire depuis 40 ans. Elle en a vu d\'autres.', hair: 'bun', height: 0.9, width: 0.96, colors: { skin: '#e8c8b0', hair: '#c8c8c8', gown: '#a87f8f' } },
  { id: 'dede', name: 'Dédé', emoji: '👴', desc: 'Ancien gardien de nuit, moustache de compétition.', hair: 'bald', beard: true, height: 0.95, width: 1.06, colors: { skin: '#d9b59a', hair: '#c8c8c8', gown: '#b08a4a' } },
];

export const characterOf = (id: string | undefined) => CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0];
export const isCharacter = (id: string) => CHARACTERS.some((c) => c.id === id);
