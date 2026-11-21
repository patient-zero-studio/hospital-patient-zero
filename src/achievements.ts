/**
 * Achievements: shared by the game (detects them) and the server (stores them
 * with the account and pays the coin reward once).
 */
export type AchTier = 'bronze' | 'argent' | 'or' | 'platine';

export interface AchDef {
  id: string;
  name: string;
  desc: string;
  icon: string;
  tier: AchTier;
  reward: number;
  /** progress achievements: counter + goal */
  stat?: StatKey;
  goal?: number;
  /** name / description hidden until unlocked */
  secret?: boolean;
  /** only the server can grant it (the game can't report it) */
  server?: boolean;
}

export type StatKey = 'escapes' | 'deaths' | 'hides' | 'coinsFound' | 'boxes' | 'flips';
export const STAT_KEYS: StatKey[] = ['escapes', 'deaths', 'hides', 'coinsFound', 'boxes', 'flips'];
/** Max a single report may add to a counter (anti-abuse). */
const STAT_STEP_MAX: Record<StatKey, number> = { escapes: 1, deaths: 3, hides: 30, coinsFound: 200, boxes: 0, flips: 30 };

export const ACHIEVEMENTS: AchDef[] = [
  // --- Escapes & endings ---
  { id: 'first_escape', name: 'Premier souffle', desc: 'Sortir de l\'hôpital pour la première fois.', icon: '🚪', tier: 'bronze', reward: 50 },
  { id: 'end_survival', name: 'Survivant', desc: 'Obtenir la fin « Survie ».', icon: '🏃', tier: 'bronze', reward: 50 },
  { id: 'end_purge', name: 'Table rase', desc: 'Obtenir la fin « Purge ».', icon: '🔥', tier: 'argent', reward: 75 },
  { id: 'end_truth', name: 'La Vérité', desc: 'Obtenir la fin secrète « La Vérité ».', icon: '📜', tier: 'or', reward: 120, secret: true },
  { id: 'all_endings', name: 'Toutes les vérités', desc: 'Obtenir les trois fins.', icon: '👁️', tier: 'platine', reward: 250 },
  { id: 'nightmare', name: 'Cauchemar vivant', desc: 'Sortir en difficulté 5.', icon: '💀', tier: 'platine', reward: 250 },
  { id: 'speed5', name: 'Pressé', desc: 'Sortir en moins de 5 minutes (difficulté 2 ou plus).', icon: '⏱️', tier: 'argent', reward: 100 },
  { id: 'speed3', name: 'Speedrunner', desc: 'Sortir en moins de 3 minutes (difficulté 2 ou plus).', icon: '⚡', tier: 'or', reward: 200 },
  { id: 'dark', name: 'Dans le noir', desc: 'Sortir avec la lampe allumée moins de 90 secondes en tout.', icon: '🌑', tier: 'or', reward: 150 },
  { id: 'no_hide', name: 'Jamais caché', desc: 'Sortir sans jamais se cacher.', icon: '🚫', tier: 'argent', reward: 100 },
  { id: 'ghost', name: 'Fantôme', desc: 'Sortir sans qu\'aucun monstre ne vous ait pris en chasse.', icon: '👻', tier: 'or', reward: 200, secret: true },
  // --- Chapter 2: the sewers ---
  { id: 'ch2_escape', name: 'Rat d\'égout', desc: 'Sortir des égouts (Chapitre 2).', icon: '🐀', tier: 'argent', reward: 100 },
  { id: 'ch2_silent', name: 'Pas un bruit', desc: 'Sortir des égouts sans que l\'Aveugle ne vous ait jamais pris en chasse.', icon: '🤫', tier: 'or', reward: 200 },
  { id: 'ch2_notes', name: 'Sujet 07', desc: 'Trouver les 3 documents des égouts avant de sortir.', icon: '🦻', tier: 'or', reward: 150, secret: true },
  // --- Chapter 3: the maze ---
  { id: 'ch3_escape', name: 'Fil d\'Ariane', desc: 'Sortir du Dédale (Chapitre 3).', icon: '🌀', tier: 'or', reward: 150 },
  { id: 'ch3_nogate', name: 'Sans filet', desc: 'Sortir du Dédale sans abaisser une seule grille.', icon: '🏃', tier: 'or', reward: 200 },
  { id: 'ch3_notes', name: 'Réseau 9', desc: 'Trouver les 2 documents du Dédale avant de sortir.', icon: '🗺️', tier: 'argent', reward: 100, secret: true },
  // --- Chapter 4: the forest ---
  { id: 'ch4_escape', name: 'Dernier signal', desc: 'Être secouru par l\'hélicoptère (Chapitre 4).', icon: '🚁', tier: 'or', reward: 200 },
  { id: 'ch4_unseen', name: 'Invisible sous la pluie', desc: 'Tenir jusqu\'à l\'arrivée des secours sans que la Bête vous voie pendant l\'attente.', icon: '🌧️', tier: 'or', reward: 250 },
  // --- Campaign ---
  { id: 'campaign_done', name: 'D\'une traite', desc: 'Finir la Campagne : les 5 chapitres d\'affilée (difficulté 2+).', icon: '🏆', tier: 'or', reward: 400 },
  // --- Chapter 5: Site B (finale) ---
  { id: 'ch5_end', name: 'Purge', desc: 'Vaincre le Patient Zéro au Site B (Chapitre 5).', icon: '🟣', tier: 'or', reward: 250 },
  { id: 'ch5_lucas', name: 'Appelle-moi Lucas', desc: 'Trouver qui il était vraiment… et le lui rappeler.', icon: '🧒', tier: 'or', reward: 400, secret: true },
  { id: 'ch5_notes', name: 'Protocole Aurore', desc: 'Trouver les 3 documents du Site B.', icon: '📁', tier: 'argent', reward: 120, secret: true },
  { id: 'ch4_notes', name: 'Garde forestier', desc: 'Trouver les 2 documents de la forêt avant d\'être secouru.', icon: '🌲', tier: 'argent', reward: 100, secret: true },
  // --- Online ---
  { id: 'duo', name: 'À la vie, à la mort', desc: 'Sortir en coop avec votre partenaire encore en vie.', icon: '🤝', tier: 'argent', reward: 100 },
  { id: 'vs_monster', name: 'Prédateur', desc: 'Gagner une partie en jouant le monstre.', icon: '🩸', tier: 'argent', reward: 75 },
  { id: 'vs_survivor', name: 'Proie coriace', desc: 'Gagner une partie contre un monstre joué par un humain.', icon: '🛡️', tier: 'argent', reward: 75 },
  { id: 'race_win', name: 'Le plus rapide', desc: 'Gagner une course.', icon: '🏁', tier: 'argent', reward: 75 },
  { id: 'blind', name: 'Éblouissant', desc: 'Aveugler un monstre qui campe.', icon: '🔦', tier: 'bronze', reward: 40 },
  { id: 'voice', name: 'Tu m\'entends ?', desc: 'Parler à votre partenaire avec le chat vocal.', icon: '🎙️', tier: 'bronze', reward: 20 },
  // --- Exploration ---
  { id: 'stairs', name: 'Charpentier', desc: 'Reconstruire l\'escalier effondré avec les planches.', icon: '🪚', tier: 'bronze', reward: 40 },
  { id: 'crawler', name: 'Ça rampe…', desc: 'Faire fuir le Rampant avec votre lampe.', icon: '🕷️', tier: 'argent', reward: 60 },
  { id: 'salle0', name: 'Salle 0', desc: 'Fouiller l\'armoire de la Salle 0, au sous-sol.', icon: '0️⃣', tier: 'or', reward: 80, secret: true },
  { id: 'secret3', name: 'Dossiers confidentiels', desc: 'Entrer dans la salle secrète du 3e étage.', icon: '🗄️', tier: 'or', reward: 80, secret: true },
  { id: 'hobo', name: 'Ami des rues', desc: 'Parler au SDF de l\'entrepôt.', icon: '🧥', tier: 'bronze', reward: 20 },
  { id: 'alarm', name: 'Réveil brutal', desc: 'Faire sonner un réveil.', icon: '⏰', tier: 'bronze', reward: 20 },
  { id: 'vhs', name: 'Âmes sensibles s\'abstenir', desc: 'Regarder la cassette VHS « Sujet 00 » jusqu\'au bout.', icon: '📼', tier: 'argent', reward: 60, secret: true },
  { id: 'vhs2', name: 'Dernier message', desc: 'Regarder la cassette du Dr Moreau, cachée dans le bureau du directeur.', icon: '🎥', tier: 'argent', reward: 60, secret: true },
  { id: 'screamer', name: 'Il bouge encore', desc: 'Fouiller le corps du Dr Moreau…', icon: '😱', tier: 'bronze', reward: 30, secret: true },
  // --- Counters ---
  { id: 'flip10', name: 'Roi du flip', desc: 'Réussir 10 bottle flips.', icon: '🍾', tier: 'bronze', reward: 30, stat: 'flips', goal: 10 },
  { id: 'deaths10', name: 'Abonné à la morgue', desc: 'Vous faire attraper 10 fois.', icon: '⚰️', tier: 'bronze', reward: 50, stat: 'deaths', goal: 10 },
  { id: 'hides50', name: 'Roi du placard', desc: 'Vous cacher 50 fois.', icon: '🚪', tier: 'argent', reward: 75, stat: 'hides', goal: 50 },
  { id: 'escapes10', name: 'Habitué', desc: 'Sortir de l\'hôpital 10 fois.', icon: '🏥', tier: 'or', reward: 150, stat: 'escapes', goal: 10 },
  { id: 'escapes50', name: 'Légende de Saint-Aurore', desc: 'Sortir de l\'hôpital 50 fois.', icon: '👑', tier: 'platine', reward: 500, stat: 'escapes', goal: 50 },
  { id: 'coins500', name: 'Pilleur', desc: 'Ramasser 500 pièces pendant vos parties.', icon: '🪙', tier: 'argent', reward: 100, stat: 'coinsFound', goal: 500 },
  { id: 'boxes10', name: 'Collectionneur', desc: 'Ouvrir 10 boîtes mystère ou cadeaux.', icon: '🎁', tier: 'or', reward: 100, stat: 'boxes', goal: 10 },
  // --- Gadgets, speedrun, social ---
  { id: 'smoke', name: 'Écran de fumée', desc: 'Lancer un fumigène.', icon: '💨', tier: 'bronze', reward: 20 },
  { id: 'trap', name: 'Pris au piège', desc: 'Bloquer un monstre avec un piège à mâchoires.', icon: '🪤', tier: 'argent', reward: 75 },
  { id: 'speedrun', name: 'Speedrunner', desc: 'Sortir d\'un chapitre en moins de 5 minutes (Normal ou plus).', icon: '⏱️', tier: 'or', reward: 150, server: true },
  { id: 'referral', name: 'Recruteur', desc: 'Parrainer un ami qui s\'échappe une fois.', icon: '📣', tier: 'argent', reward: 100, server: true },
  { id: 'code', name: 'Code secret', desc: 'Utiliser un code cadeau.', icon: '🎟️', tier: 'bronze', reward: 20, server: true },
  { id: 'spectate', name: 'Dans les tribunes', desc: 'Regarder un ami jouer en direct.', icon: '👀', tier: 'bronze', reward: 30, server: true },
  { id: 'rank_gold', name: 'Rang Or', desc: 'Atteindre le rang Or en saison classée.', icon: '🥇', tier: 'argent', reward: 100, server: true },
  { id: 'rank_pro', name: 'Pro', desc: 'Atteindre le rang Pro en saison classée.', icon: '👑', tier: 'platine', reward: 500, server: true },
  { id: 'rpass_done', name: 'Pass classé terminé', desc: 'Prendre le palier 20 du pass classé.', icon: '🏆', tier: 'platine', reward: 300, server: true },
  { id: 'clan', name: 'Frères d\'armes', desc: 'Créer ou rejoindre un clan.', icon: '🛡️', tier: 'bronze', reward: 30, server: true },
  { id: 'chat', name: 'Bavard', desc: 'Envoyer un message à un ami.', icon: '💬', tier: 'bronze', reward: 20, server: true },
  // --- La Nuit du Cirque ---
  { id: 'circus_trust', name: 'À la vie, à la mort', desc: 'Survivre aux 3 nuits du cirque sans que personne ne trahisse.', icon: '🤝', tier: 'or', reward: 200 },
  { id: 'circus_traitor', name: 'Marché conclu', desc: 'Livrer votre partenaire au Directeur… et gagner.', icon: '🔪', tier: 'argent', reward: 100, secret: true },
  { id: 'circus_escape', name: 'Sortie de piste', desc: 'Être trahi, et pourtant s\'enfuir du chapiteau.', icon: '🎪', tier: 'or', reward: 150 },
  // --- Secret chapter ---
  { id: 'ch8_end', name: 'Le garçon qui voulait être docteur', desc: 'Terminer le chapitre secret : le Rêve de Lucas. Récompense : skins de l\'Ombre et de Lucas.', icon: '🌳', tier: 'platine', reward: 500, secret: true },
  // --- Chapter 7 ---
  { id: 'ch7_end', name: 'Le dernier patient', desc: 'Vaincre le Dr Moreau et lui injecter l\'antidote (Chapitre 7). Récompense : 2 skins du Dr Moreau.', icon: '💉', tier: 'platine', reward: 400 },
  { id: 'ch7_notes', name: 'La formule', desc: 'Trouver les 2 documents du Cœur avant la fin.', icon: '🧪', tier: 'or', reward: 150 },
  // --- Chapter 6 ---
  { id: 'ch6_escape', name: 'Au-dessus de la tempête', desc: 'S\'envoler du toit en hélicoptère (Chapitre 6).', icon: '🚁', tier: 'or', reward: 250 },
  { id: 'ch6_notes', name: 'Hélios 2', desc: 'Trouver les 2 documents du toit avant de partir.', icon: '📓', tier: 'argent', reward: 100 },
  // --- Progression, events, friends ---
  { id: 'tutorial', name: 'Bon élève', desc: 'Finir le tutoriel.', icon: '🎓', tier: 'bronze', reward: 30 },
  { id: 'new_face', name: 'Nouveau visage', desc: 'Jouer un autre personnage qu\'Alex.', icon: '🧑', tier: 'bronze', reward: 30, server: true },
  { id: 'lvl10', name: 'Habitué de Saint-Aurore', desc: 'Atteindre le niveau 10.', icon: '⭐', tier: 'argent', reward: 100, server: true },
  { id: 'lvl25', name: 'Vétéran', desc: 'Atteindre le niveau 25.', icon: '🌟', tier: 'or', reward: 200, server: true },
  { id: 'lvl50', name: 'Légende vivante', desc: 'Atteindre le niveau 50.', icon: '💫', tier: 'platine', reward: 500, server: true },
  { id: 'friend', name: 'Pas tout seul', desc: 'Avoir un ami dans sa liste.', icon: '🤝', tier: 'bronze', reward: 30, server: true },
  { id: 'matchmade', name: 'Inconnu sympathique', desc: 'Jouer avec un partenaire trouvé au hasard.', icon: '🔎', tier: 'bronze', reward: 50, server: true },
  { id: 'gift', name: 'Généreux', desc: 'Offrir un cadeau à un ami.', icon: '💝', tier: 'bronze', reward: 50, server: true },
  { id: 'chest', name: 'Chasseur de trésor', desc: 'Trouver un coffre rare pendant un événement.', icon: '💎', tier: 'argent', reward: 100, server: true },
  { id: 'event_box', name: 'Gourmand', desc: 'Ouvrir une boîte d\'événement (500 friandises).', icon: '🍬', tier: 'argent', reward: 75, server: true },
  { id: 'xmas_all', name: 'Joyeux Noël, Patient Zéro', desc: 'Retrouver les 12 cadeaux de la Nuit de Noël.', icon: '🎅', tier: 'or', reward: 200, server: true },
  { id: 'advent25', name: 'Calendrier complet', desc: 'Ouvrir les 25 cases du calendrier de l\'Avent.', icon: '🗓️', tier: 'platine', reward: 300, server: true },
  { id: 'pass10', name: 'Saisonnier', desc: 'Atteindre le palier 10 du pass de saison.', icon: '🏆', tier: 'argent', reward: 100, server: true },
  { id: 'pass30', name: 'Pass terminé', desc: 'Atteindre le palier 30 du pass de saison.', icon: '👑', tier: 'platine', reward: 400, server: true },
  { id: 'weekly3', name: 'Semaine parfaite', desc: 'Réussir les 3 défis d\'une même semaine.', icon: '🗓️', tier: 'or', reward: 150, server: true },
  { id: 'podium', name: 'Sur le podium', desc: 'Finir dans le top 3 du classement de la semaine.', icon: '🥇', tier: 'platine', reward: 300, server: true },
];

export const ACH_BY_ID = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));
const ENDING_ACHS = ['end_survival', 'end_purge', 'end_truth'];

export const TIER_STYLE: Record<AchTier, { label: string; color: string }> = {
  bronze: { label: 'Bronze', color: '#c47a3a' },
  argent: { label: 'Argent', color: '#b9c2cc' },
  or: { label: 'Or', color: '#f2c14e' },
  platine: { label: 'Platine', color: '#7fe3f0' },
};

export interface AchState {
  /** id → unlock time (ms) */
  done: Record<string, number>;
  stats: Record<StatKey, number>;
}

export const NEW_ACH = (): AchState => ({ done: {}, stats: { escapes: 0, deaths: 0, hides: 0, coinsFound: 0, boxes: 0, flips: 0 } });

export const sanitizeAch = (x: unknown): AchState => {
  const src = (x ?? {}) as Partial<AchState>;
  const out = NEW_ACH();
  for (const [id, t] of Object.entries(src.done ?? {})) if (ACH_BY_ID.has(id) && Number.isFinite(Number(t))) out.done[id] = Number(t);
  for (const k of STAT_KEYS) {
    const v = Number(src.stats?.[k]);
    if (Number.isFinite(v) && v > 0) out.stats[k] = Math.floor(v);
  }
  return out;
};

/**
 * Applies a report from the game: event achievements + counter increments.
 * Returns the newly unlocked achievements (reward to pay = sum of their `reward`).
 * `trusted` increments (server-side, e.g. boxes) are not capped.
 */
export const applyAchReport = (
  st: AchState,
  unlock: unknown,
  stats: unknown,
  trusted: Partial<Record<StatKey, number>> = {},
): AchDef[] => {
  const newly: AchDef[] = [];
  const now = Date.now();
  const grant = (id: string) => {
    const def = ACH_BY_ID.get(id);
    if (!def || st.done[id]) return;
    st.done[id] = now;
    newly.push(def);
  };
  if (Array.isArray(unlock))
    for (const id of unlock.slice(0, 40)) {
      const def = typeof id === 'string' ? ACH_BY_ID.get(id) : undefined;
      if (def && !def.stat && !def.server && id !== 'all_endings') grant(id);
    }
  const inc = (stats ?? {}) as Record<string, unknown>;
  for (const k of STAT_KEYS) {
    const v = Math.floor(Number(inc[k]) || 0);
    if (v > 0) st.stats[k] += Math.min(v, STAT_STEP_MAX[k]);
    const t = Math.floor(Number(trusted[k]) || 0);
    if (t > 0) st.stats[k] += t;
  }
  for (const def of ACHIEVEMENTS) if (def.stat && def.goal && st.stats[def.stat] >= def.goal) grant(def.id);
  if (ENDING_ACHS.every((id) => st.done[id])) grant('all_endings');
  return newly;
};

/** Server-side unlock (achievements the game can't report itself). Returns the newly unlocked ones. */
export const grantServerAch = (st: AchState, ids: string[]): AchDef[] => {
  const out: AchDef[] = [];
  for (const id of ids) {
    const def = ACH_BY_ID.get(id);
    if (!def || st.done[id]) continue;
    st.done[id] = Date.now();
    out.push(def);
  }
  return out;
};
