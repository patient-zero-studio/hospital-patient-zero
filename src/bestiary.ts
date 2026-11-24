/**
 * 📖 Bestiary: the creatures met, the objects picked up (cassettes come from the gallery documents).
 * Shared with the server (ids are checked there).
 */
export interface BeastEntry {
  id: string;
  name: string;
  emoji: string;
  where: string;
  desc: string;
  tips: string[];
}

export const BEASTS: BeastEntry[] = [
  {
    id: 'patient0',
    name: 'Le Patient Zéro',
    emoji: '🧟',
    where: 'Chapitre 1 — L\'Hôpital',
    desc: 'Le premier sujet du Protocole Aurore. Sa vue est presque nulle dans le noir, mais il entend tout et la lumière l\'attire.',
    tips: ['Marchez accroupi [C] : il n\'entend presque plus vos pas.', 'Une lampe allumée se voit de loin : éteignez-la quand il rôde.', 'Un casier ou un lit le fait passer à côté de vous… si vous ne bougez pas.'],
  },
  {
    id: 'infirmiere',
    name: 'L\'Infirmière',
    emoji: '👩‍⚕️',
    where: 'Chapitre 1 — difficulté 3 et plus',
    desc: 'Elle ne bouge que lorsque personne ne la regarde. Chaque fois que vous détournez les yeux, elle se rapproche.',
    tips: ['Gardez-la dans votre champ de vision en reculant.', 'En coop, l\'un la surveille pendant que l\'autre avance.'],
  },
  {
    id: 'rampant',
    name: 'Le Rampant',
    emoji: '🕷️',
    where: 'Les conduits d\'aération',
    desc: 'Le Sujet 0 a appris à ramper dans les conduits. Il gratte le métal… et déteste la lumière.',
    tips: ['Dans un conduit, braquez votre lampe devant vous pour le repousser.', 'Ne restez pas immobile dans les conduits.'],
  },
  {
    id: 'mimic',
    name: 'Le Mimic',
    emoji: '👁️',
    where: 'Dans les casiers de l\'hôpital',
    desc: 'Il se cache dans un casier et imite les bruits : des pas, une porte, des chuchotements… et même la voix de vos amis. Démasqué, il jaillit en hurlant et alerte tout l\'étage.',
    tips: ['Un bruit qui revient toujours du même casier ? Méfiance.', 'La lampe UV révèle ses traces de mains sur la porte de son casier.', 'Ne vous cachez jamais dans son casier, et ne restez pas planté devant.'],
  },
  {
    id: 'chat',
    name: 'Le Chat noir (ami)',
    emoji: '🐈‍⬛',
    where: 'Chapitres 1 et 2',
    desc: "Il vivait déjà à Saint-Aurore avant l'épidémie. Il te suit un moment, feule quand une créature approche et gratte les meubles qui cachent quelque chose.",
    tips: ["Ne cours pas près de lui : il s'enfuit en hurlant et tout l'étage l'entend.", 'Quand il se hérisse en regardant un couloir, cache-toi.'],
  },
  {
    id: 'fouettard',
    name: 'Le Père Fouettard',
    emoji: '🔔',
    where: 'Chapitre 1 — en décembre seulement',
    desc: 'Le compagnon noir de saint Nicolas, en version Saint-Aurore : un grand manteau, des chaînes… et des clochettes qui tintent à chaque pas.',
    tips: ['Les clochettes trahissent sa position : écoute d\'où elles viennent.', 'Il est un peu plus lent que les autres : en Normal, on le sème en marchant vite.'],
  },
  {
    id: 'eteigneur',
    name: 'L\'Éteigneur',
    emoji: '🕯️',
    where: 'Chapitre 1 — difficulté Difficile et plus',
    desc: 'Une ombre trop grande qui traverse les murs. Elle éteint les lumières des pièces où elle passe et boit la batterie de ta lampe. Sa caresse glacée ne tue pas… mais le Patient Zéro l\'entend.',
    tips: ['Lampe allumée, on ne voit que ses deux yeux blancs. Éteins-la pour la voir en entier.', 'Reste sous une lampe allumée : elle n\'ose pas approcher.', 'La lampe UV la brûle, et remettre le courant la fait fuir.'],
  },
  {
    id: 'aveugle',
    name: 'L\'Aveugle',
    emoji: '🦇',
    where: 'Chapitre 2 — Les Égouts',
    desc: 'Le Sujet 07. Totalement aveugle, il entend une goutte tomber à cinquante mètres.',
    tips: ['Ne courez JAMAIS dans l\'eau : chaque pas éclabousse.', 'Quand vous l\'entendez respirer, ne bougez plus.'],
  },
  {
    id: 'traqueur',
    name: 'Le Traqueur',
    emoji: '🐺',
    where: 'Chapitre 3 — Le Dédale',
    desc: 'Le Sujet 09 suit l\'odeur et le bruit. Il ne s\'arrête pas, il ne dort pas.',
    tips: ['Ne revenez pas sur vos pas.', 'Tracez des flèches à la craie [R] pour ne pas tourner en rond.'],
  },
  {
    id: 'foret',
    name: 'La Chose des bois',
    emoji: '🌲',
    where: 'Chapitre 4 — La Forêt',
    desc: 'Elle chasse à la vue et ne s\'intéresse qu\'à ce qui brille : lampes, briquets, phares.',
    tips: ['Éteignez votre lampe et accroupissez-vous dans les fougères.', 'Ne courez jamais avec une lumière allumée.'],
  },
  {
    id: 'sujet00',
    name: 'Lucas, le Sujet 00',
    emoji: '🧒',
    where: 'Chapitre 5 — Le Site B',
    desc: 'Le fils du Dr Moreau, premier « volontaire » du Protocole Aurore. Il ne ressent plus la douleur… sauf sous les UV.',
    tips: ['La lampe UV [R] le brûle, mais vide la batterie très vite.', 'Chargez les rampes UV avant de lancer la purge.'],
  },
  {
    id: 'toit',
    name: 'L\'Ombre du toit',
    emoji: '⛈️',
    where: 'Chapitre 6 — Le Toit',
    desc: 'Sous la tempête, la pluie couvre vos pas… mais chaque éclair vous montre à lui.',
    tips: ['Bougez entre les éclairs.', 'Réparez vite les relais radio : l\'hélicoptère n\'attend pas.'],
  },
  {
    id: 'moreau',
    name: 'Le Dr Moreau',
    emoji: '🧪',
    where: 'Chapitre 7 — Le Cœur',
    desc: 'Le vrai Patient Zéro : il s\'est injecté la souche d\'origine. Trois phases, de plus en plus enragées.',
    tips: ['Les UV l\'affaiblissent jusqu\'à l\'effondrement.', 'Injectez l\'antidote dans les 10 secondes, sinon il se relève.'],
  },
  {
    id: 'cauchemar',
    name: 'Le Cauchemar de Lucas',
    emoji: '🧸',
    where: 'Chapitre secret — Le Rêve',
    desc: 'Ce qui hante les souvenirs d\'un petit garçon qui voulait juste rentrer chez lui.',
    tips: ['Retrouvez les souvenirs : ils apaisent le rêve.'],
  },
  {
    id: 'clowns',
    name: 'Les Clowns',
    emoji: '🤡',
    where: 'La Nuit du Cirque (coop)',
    desc: 'Les pantins de Monsieur Loyal. Chaque matin, il propose un marché : livrer votre partenaire et sortir libre.',
    tips: ['Refuser le marché rend la nuit suivante plus dure… mais vous restez ensemble.'],
  },
];

export interface ItemEntry {
  id: string;
  name: string;
  emoji: string;
  desc: string;
}

/** By item type (keys, badges, fuses and tools are grouped) */
export const ITEM_ENTRIES: ItemEntry[] = [
  { id: 'battery', name: 'Pile', emoji: '🔋', desc: 'Recharge 55 % de la batterie de la lampe torche.' },
  { id: 'medkit', name: 'Adrénaline', emoji: '💉', desc: 'Endurance au maximum et 6 secondes de sprint illimité.' },
  { id: 'sedative', name: 'Seringue de sédatif', emoji: '🧪', desc: 'Immobilise un monstre 5 secondes, à moins de 3 m et face à lui.' },
  { id: 'food', name: 'Barre de céréales', emoji: '🍫', desc: 'Redonne 40 points d\'endurance.' },
  { id: 'throwable', name: 'Canette', emoji: '🥫', desc: 'Lancez-la pour faire du bruit ailleurs et attirer les monstres loin de vous.' },
  { id: 'alarm', name: 'Réveil', emoji: '⏰', desc: 'Posé, il sonne au bout de 3 secondes et attire les monstres.' },
  { id: 'smoke', name: 'Fumigène', emoji: '💨', desc: 'Un épais nuage pendant 12 secondes : les monstres ne vous voient plus à travers.' },
  { id: 'trap', name: 'Piège à mâchoires', emoji: '🪤', desc: 'Le premier monstre qui marche dessus reste bloqué 6 secondes.' },
  { id: 'bandage', name: 'Bandage', emoji: '🩹', desc: 'Soigne une blessure : plus de saignement, plus de boiterie. 3 secondes immobile pour le poser.' },
  { id: 'uvlamp', name: 'Lampe UV', emoji: '🟣', desc: 'Révèle les messages cachés, les traces du Mimic… et les passages secrets.' },
  { id: 'talkie', name: 'Talkie-walkie', emoji: '📻', desc: 'Coop : entendez l\'équipe partout et appelez-la. Le grésillement peut attirer les monstres.' },
  { id: 'key', name: 'Clés', emoji: '🔑', desc: 'Ouvrent les portes verrouillées. Fouillez les meubles !' },
  { id: 'keycard', name: 'Badges', emoji: '💳', desc: 'Ouvrent les portes électroniques du laboratoire.' },
  { id: 'fuse', name: 'Fusibles', emoji: '⚡', desc: 'Remettent le courant dans le tableau électrique.' },
  { id: 'tool', name: 'Outils', emoji: '🔧', desc: 'Pied-de-biche, manivelle… pour forcer ou réparer.' },
  { id: 'coins', name: 'Pièces', emoji: '🪙', desc: 'Gardées seulement si vous sortez vivant. Elles servent dans la boutique.' },
];

export const isBeastId = (id: unknown): id is string => typeof id === 'string' && BEASTS.some((b) => b.id === id);
export const isItemEntryId = (id: unknown): id is string => typeof id === 'string' && ITEM_ENTRIES.some((b) => b.id === id);
