import React, { useEffect, useState } from 'react';
/** Message du jour (une phrase d'ambiance différente chaque jour) */
const DAILY_LINES = [
  "Les casiers sont froids. Mais ils sont vides. Pour l'instant.",
  "Il n'a pas d'yeux. Il n'en a jamais eu besoin.",
  "Une goutte tombe dans les égouts. Quelque chose a entendu.",
  "Ne courez pas dans les couloirs. Il aime qu'on coure.",
  "La chambre 104 a encore ses sangles. Quelqu'un les a arrachées.",
  "Éteignez la lampe. Écoutez. Respirez doucement.",
  "L'Infirmière n'a pas bougé. Vous en êtes sûr ?",
  "Le Dr Moreau prenait toujours des notes. Toujours.",
  "Monsieur Pompon attend toujours, contre le mur de gauche.",
  "Un réveil qui sonne peut vous sauver la vie. Ou vous la coûter.",
  "Dans la forêt, chaque lumière se voit de loin.",
  "Les murs du Dédale ne disent plus la même chose qu'hier.",
  "Sur le toit, l'éclair vous montre. À lui aussi.",
  "Il y a 25 documents. Et un chapitre que personne ne voit.",
];

import { RANK_TIERS, tierOf } from '../ranked';
import { Award, Bell, BellOff, BookOpen, Coins, Crown, Flag, GraduationCap, HelpCircle, Image as ImageIcon, ListOrdered, Lock, Medal, Star, Wrench, ClipboardList, Music, Plus, Settings, Shield, Shirt, ShoppingBag, Skull, Swords, Target, Ticket, User, Users, VolumeX, X, Zap } from 'lucide-react';
import type { ChallengeDef } from '../challenges';
import { ACHIEVEMENTS } from '../achievements';
import { AudioSettings, ControlSettings } from '../types';
import { sound } from '../audio/SoundSystem';
import { DIFFICULTIES, Difficulty } from '../game/Difficulty';
import { fmtCoins } from '../economy';
import { InstallButton } from './InstallButton';
import { SeasonalOverlay } from './SeasonalOverlay';
import { getLang, setLang } from '../i18n';
import { SEASON_INFO, Season } from '../seasons';
import { LevelInfo, levelColor } from '../levels';
import type { Boost } from '../net/api';
import type { Appearance } from '../appearance';
import { MenuStage } from './MenuStage';
import { STAR_LABELS } from '../stars';

export const BOOST_LABEL: Record<string, string> = {
  coins2: '🪙 PIÈCES DOUBLÉES',
  treats2: '🍬 FRIANDISES DOUBLÉES',
  xp2: '⭐ XP DOUBLÉE',
  all2: '⚡ TOUT EST DOUBLÉ (pièces, XP, friandises)',
};

/** "5 h 12 min" left on the surprise event */
const useBoostLeft = (boost: Boost | null) => {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);
  if (!boost) return null;
  const left = Math.max(0, boost.until - now);
  if (left <= 0) return null;
  const h = Math.floor(left / 3600000);
  const m = Math.floor((left % 3600000) / 60000);
  return `${h > 0 ? `${h} h ` : ''}${String(m).padStart(2, '0')} min`;
};

interface StartScreenProps {
  onStartGame: () => void;
  /** 🧟 endless survival */
  onSurvival?: () => void;
  /** ⚔️ find a random opponent right away */
  onFindOpponent?: () => void;
  /** 🎄 Christmas night special chapter (December only) */
  onXmasNight?: () => void;
  /** 🎓 guided first game */
  onTutorial?: () => void;
  tutorialDone?: boolean;
  /** Campaign: chapters 1 → 5 in one run */
  onCampaign?: () => void;
  onMultiplayer: () => void;
  username: string | null;
  difficulty: Difficulty;
  onChangeDifficulty: (d: Difficulty) => void;
  /** null = not logged in */
  coins: number | null;
  /** the free daily gift is waiting in the shop */
  giftReady?: boolean;
  /** 🔔 push notifications state (null = not logged in) */
  notifications?: 'on' | 'off' | 'unsupported' | 'denied' | null;
  onToggleNotifications?: () => void;
  /** 🏆 season pass & weekly challenges */
  onProgression?: () => void;
  progressionAlert?: number;
  /** player level (null = not logged in) */
  level?: LevelInfo | null;
  /** ⚡ surprise event on */
  boost?: Boost | null;
  /** friends list (null online count = not logged in) */
  onFriends?: () => void;
  /** 🎟️ enter a gift code */
  onRedeem?: () => void;
  /** 🏅 ranked season */
  onRanked?: () => void;
  rankTier?: string | null;
  /** 🛡️ clans, 🎵 menu music, 🖼️ gallery */
  onClans?: () => void;
  clanTag?: string | null;
  onMusic?: () => void;
  onGallery?: () => void;
  onBestiary?: () => void;
  /** 🔧 L'Atelier (permanent upgrades) */
  onAtelier?: () => void;
  /** 📋 daily quests (number still to do) */
  onQuests?: () => void;
  questsLeft?: number;
  friendsOnline?: number | null;
  /** friend requests + invitations waiting */
  friendsAlert?: number;
  /** shop not unlocked yet (escape once, Exploration is enough) */
  shopLocked?: boolean;
  /** 🎄 / 🎃 event on */
  season?: Season | null;
  /** an advent calendar box can be opened */
  adventReady?: boolean;
  /** phone / tablet */
  touch?: boolean;
  menuMusic?: boolean;
  onToggleMusic?: () => void;
  onShop: () => void;
  /** 🎭 your character, shown in the middle of the menu */
  look?: Appearance | null;
  /** emotes owned (played when you click your character) */
  emotes?: string[];
  onCustomize?: () => void;
  chapter?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
  ch2Unlocked?: boolean;
  ch3Unlocked?: boolean;
  ch4Unlocked?: boolean;
  ch5Unlocked?: boolean;
  ch6Unlocked?: boolean;
  ch7Unlocked?: boolean;
  ch8Unlocked?: boolean;
  /** secret chapter: documents found so far / needed */
  docsProgress?: [number, number];
  /** ⭐ stars per chapter (bitmask) */
  chapterStars?: Record<string, number>;
  /** 🎁 golden gifts found this Christmas */
  xgifts?: number;
  challenge?: ChallengeDef;
  challengeOn?: boolean;
  challengeDone?: boolean;
  onToggleChallenge?: () => void;
  /** 🏅 ranked mode (only these games win / lose ranked points) */
  rankedOn?: boolean;
  onToggleRanked?: () => void;
  rankPoints?: number | null;
  onLeaderboard?: () => void;
  onChangeChapter?: (c: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9) => void;
  /** achievements unlocked (null = not logged in) */
  achCount?: number | null;
  onAchievements?: () => void;
  audioSettings: AudioSettings;
  controlSettings: ControlSettings;
  onUpdateAudio: (newAudio: Partial<AudioSettings>) => void;
  onUpdateControls: (newControls: Partial<ControlSettings>) => void;
}

type ChapterN = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

/** Dark "horror" palette for the chunky buttons */
const C = {
  blood: '#4a0808',
  rust: '#1c0c0b',
  toxic: '#120f0e',
  steel: '#141416',
  bruise: '#1a0b10',
  teal: '#0f1315',
  bone: '#18120f',
  night: '#0c0a0a',
};

/** Square chunky button with an icon on top and a short label */
const Sq: React.FC<{ icon: React.ReactNode; label: string; color: string; onClick?: () => void; badge?: number | string; wide?: boolean; title?: string }> = ({ icon, label, color, onClick, badge, wide, title }) => (
  <button
    onClick={onClick}
    title={title ?? label}
    className={`chunky relative flex items-center justify-center h-[58px] short:h-[46px] text-white ${wide ? 'col-span-2 flex-row gap-2' : 'w-full flex-col gap-0.5'}`}
    style={{ background: color }}
  >
    <span className={`leading-none text-red-500 [&>svg]:w-full [&>svg]:h-full ${wide ? 'w-6 h-6 short:w-5 short:h-5' : 'w-5 h-5 short:w-4 short:h-4'}`}>{icon}</span>
    <span className={`font-game outl leading-none text-zinc-200 ${wide ? 'text-[16px] short:text-[13px]' : 'text-[10px] short:text-[9px]'} max-w-full truncate px-0.5`}>{label}</span>
    {badge != null && badge !== 0 && (
      <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1 rounded-full bg-red-600 border-2 border-black text-[10px] font-game text-white flex items-center justify-center animate-pulse">
        {badge}
      </span>
    )}
  </button>
);

/** ⭐⭐⭐ earned on a chapter */
const StarRow: React.FC<{ mask: number; size?: number; chapter: number }> = ({ mask, size = 12, chapter }) => (
  <span className="inline-flex gap-0.5" title={STAR_LABELS(chapter).map((l, i) => `${(mask >> i) & 1 ? '★' : '☆'} ${l}`).join('\n')}>
    {[0, 1, 2].map((i) => (
      <Star key={i} style={{ width: size, height: size }} className={(mask >> i) & 1 ? 'text-amber-400 fill-amber-400' : 'text-zinc-600'} />
    ))}
  </span>
);

/** Small square button of the top bar */
const TopBtn: React.FC<{ onClick: () => void; title: string; children: React.ReactNode; color?: string }> = ({ onClick, title, children, color = C.steel }) => (
  <button onClick={onClick} title={title} className="chunky w-10 h-10 flex items-center justify-center text-white !rounded-xl" style={{ background: color }}>
    {children}
  </button>
);

export const StartScreen: React.FC<StartScreenProps> = ({
  onStartGame,
  onCampaign,
  onTutorial,
  onXmasNight,
  onFindOpponent,
  onSurvival,
  tutorialDone = true,
  onMultiplayer,
  username,
  difficulty,
  onChangeDifficulty,
  coins,
  giftReady = false,
  shopLocked = false,
  level = null,
  onProgression,
  notifications = null,
  onToggleNotifications,
  progressionAlert = 0,
  boost = null,
  onFriends,
  onRedeem,
  onClans,
  clanTag,
  onRanked,
  rankTier,
  onMusic,
  onGallery,
  onBestiary,
  onAtelier,
  onQuests,
  questsLeft = 0,
  friendsOnline = null,
  friendsAlert = 0,
  season = null,
  adventReady = false,
  onShop,
  look = null,
  emotes,
  onCustomize,
  achCount = null,
  onAchievements,
  chapter = 1,
  ch2Unlocked = false,
  ch3Unlocked = false,
  ch4Unlocked = false,
  ch5Unlocked = false,
  ch6Unlocked = false,
  ch7Unlocked = false,
  ch8Unlocked = false,
  docsProgress,
  chapterStars = {},
  xgifts = 0,
  onChangeChapter,
  challenge,
  challengeOn = false,
  challengeDone = false,
  onToggleChallenge,
  rankedOn = false,
  onToggleRanked,
  rankPoints = null,
  onLeaderboard,
  touch = false,
  menuMusic = true,
  onToggleMusic,
  audioSettings,
  controlSettings,
  onUpdateAudio,
  onUpdateControls,
}) => {
  const [showSettings, setShowSettings] = useState(false);
  const [picker, setPicker] = useState(false);
  const boostLeft = useBoostLeft(boost);

  const CHAPTERS: { n: ChapterN; icon: string; name: string; sub: string; color: string }[] = [
    { n: 1, icon: '🏥', name: 'L\'Hôpital', sub: 'Échappez au Patient Zéro', color: '#0d1416' },
    { n: 2, icon: '🐀', name: 'Les Égouts', sub: 'Il n\'a pas d\'yeux. Il écoute.', color: '#0f140d' },
    { n: 3, icon: '🌀', name: 'Le Dédale', sub: 'Il suit ta trace. Ne t\'arrête pas.', color: '#16120d' },
    { n: 4, icon: '🌲', name: 'La Forêt', sub: 'Lampe allumée, il te voit de loin.', color: '#0c160e' },
    { n: 5, icon: '🟣', name: 'Le Site B', sub: 'Finale : la lumière devient une arme.', color: '#150c18' },
    { n: 6, icon: '⛈️', name: 'Le Toit', sub: 'Épilogue : la tempête, et un hélicoptère.', color: '#111317' },
    { n: 7, icon: '💉', name: 'Le Cœur', sub: 'Boss final : le vrai Patient Zéro.', color: '#2a0606' },
    ch8Unlocked
      ? { n: 8, icon: '🌳', name: 'Le Rêve de Lucas', sub: 'Chapitre secret : ses souvenirs, et une ombre.', color: '#2d4a3a' }
      : { n: 8, icon: '❔', name: '???', sub: 'Chapitre secret', color: C.night },
  ];
  const unlocked = [true, ch2Unlocked, ch3Unlocked, ch4Unlocked, ch5Unlocked, ch6Unlocked, ch7Unlocked, ch8Unlocked];
  let eff: number = chapter;
  while (eff > 1 && !unlocked[eff - 1]) eff--;
  const cur = CHAPTERS[Math.min(7, eff - 1)];
  const lockText = (n: number) =>
    n === 8
      ? `Trouvez tous les documents des chapitres 1 à 7${docsProgress ? ` (${docsProgress[0]}/${docsProgress[1]})` : ''}`
      : n === 7
        ? 'Envolez-vous une fois du toit'
        : n === 6
          ? 'Terminez une fois le Site B'
          : n === 5
            ? 'Soyez secouru une fois dans la forêt'
            : n === 4
              ? 'Sortez une fois du Dédale'
              : n === 3
                ? 'Sortez une fois des égouts'
                : 'Sortez une fois de l\'hôpital';
  const heat = ['#151515', '#241009', '#320b08', '#440707', '#5a0410'];
  const diff = DIFFICULTIES[difficulty - 1];
  const tier = RANK_TIERS.find((t) => t.id === rankTier) ?? RANK_TIERS[0];
  const shopBadge = (giftReady ? 1 : 0) + (adventReady ? 1 : 0);
  const daily = DAILY_LINES[Math.floor(Date.now() / 86400000) % DAILY_LINES.length];

  // ── Pieces (placed differently on big screens and on phones) ──
  const leftButtons = (
    <>
      <Sq
        icon={shopLocked ? <Lock /> : <ShoppingBag />}
        label="Boutique"
        color={C.rust}
        onClick={onShop}
        badge={shopBadge ? '!' : undefined}
        title={shopLocked ? 'Finis une partie en Exploration pour ouvrir la boutique' : 'Skins & boîtes mystère'}
      />
      {onAtelier && <Sq icon={<Wrench />} label="Atelier" color={C.blood} onClick={onAtelier} title="L'Atelier : améliorations pour toujours (lampe, batterie, sac…)" />}
      {onProgression && <Sq icon={<Crown />} label="Pass" color={C.bruise} onClick={onProgression} badge={progressionAlert} title="Pass & défis" />}
      {onRanked && <Sq icon={<Medal style={{ color: tier.color }} />} label="Classé" color={C.steel} onClick={onRanked} title={`Classé — ${tier.name}`} />}
      {onFriends && <Sq icon={<Users />} label="Amis" color={C.toxic} onClick={onFriends} badge={friendsAlert} title={friendsOnline ? `Amis — ${friendsOnline} en ligne` : 'Amis'} />}
      {onClans && <Sq icon={<Shield />} label={clanTag ? `[${clanTag}]` : 'Clans'} color={C.teal} onClick={onClans} title="Clans" />}
      {onAchievements && <Sq icon={<Award />} label={achCount != null ? `${achCount}/${ACHIEVEMENTS.length}` : 'Succès'} color={C.bone} onClick={onAchievements} title="Succès" />}
      {onLeaderboard && <Sq icon={<ListOrdered />} label="Top" color={C.night} onClick={onLeaderboard} title="Classement" />}
    </>
  );
  const rightButtons = (
    <>
      {onBestiary && <Sq icon={<BookOpen />} label="Bestiaire" color={C.bruise} onClick={onBestiary} />}
      {onGallery && <Sq icon={<ImageIcon />} label="Galerie" color={C.bone} onClick={onGallery} />}
      {onMusic && <Sq icon={<Music />} label="Musiques" color={C.teal} onClick={onMusic} />}
      {onRedeem && <Sq icon={<Ticket />} label="Code" color={C.rust} onClick={onRedeem} title="Code cadeau" />}
      {onTutorial && tutorialDone && <Sq icon={<GraduationCap />} label="Tutoriel" color={C.toxic} onClick={onTutorial} />}
      {onQuests && <Sq icon={<ClipboardList />} label="Quêtes" color={C.blood} onClick={onQuests} badge={questsLeft} title="Quêtes du jour : 3 missions, des pièces et un bonus" />}
    </>
  );

  const eventList = [
    onTutorial && !tutorialDone && (
        <button onClick={onTutorial} className="chunky w-full text-left px-3 py-2 text-white !border-red-600" style={{ background: '#3a0707' }}>
          <span className="flex items-center gap-1.5 font-game outl text-[15px] leading-tight"><GraduationCap className="w-4 h-4 text-red-400" /> Nouveau ? Tutoriel</span>
          <span className="block text-[11px] text-red-100/70">2 min pour apprendre à survivre</span>
        </button>
      ),
    boostLeft && boost && (
        <div className="chunky overflow-hidden w-full text-white" style={{ background: '#1c0b06' }}>
          <div className="flex items-center gap-1 bg-black/70 px-2.5 py-0.5 font-game text-[11px] text-amber-400"><Zap className="w-3 h-3" /> ÉVÉNEMENT — {boostLeft}</div>
          <div className="px-2.5 py-1.5 font-game outl text-[15px] leading-tight">{BOOST_LABEL[boost.kind]}</div>
        </div>
      ),
    season && (
        <button onClick={onShop} className="chunky w-full text-left px-3 py-2 text-white" style={{ background: '#140c0c', borderColor: SEASON_INFO[season].color }}>
          <span className="block font-game outl text-[16px] leading-tight">
            {SEASON_INFO[season].emoji} {SEASON_INFO[season].name}
          </span>
          <span className="block text-[11px] font-bold">Skins limités{season === 'noel' ? ' & calendrier' : ''}</span>
          {season === 'noel' && <span className="block text-[11px] text-amber-300">🎁 Cadeaux dorés : {xgifts} — skins à 5, 15 et 30</span>}
        </button>
      ),
    onXmasNight && (
        <button onClick={onXmasNight} className="chunky w-full text-left px-3 py-2 text-white" style={{ background: '#2a0606' }}>
          <span className="block font-game outl text-[16px] leading-tight">🎄 Nuit de Noël</span>
          <span className="block text-[11px] font-bold text-red-100">Chapitre spécial · skin unique 🎁</span>
        </button>
      ),
    challenge && onToggleChallenge && (
        <button onClick={onToggleChallenge} className="chunky w-full text-left px-3 py-2 text-white" style={{ background: challengeOn ? '#3a0707' : C.night }}>
          <span className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1 font-game outl text-[11px] text-red-400 whitespace-nowrap"><Target className="w-3 h-3" /> DÉFI DU JOUR {challengeDone ? '✔' : `+${challenge.reward}`}</span>
            <span className={`relative shrink-0 w-9 h-5 rounded-full border-2 border-black ${challengeOn ? 'bg-red-600' : 'bg-zinc-700'}`}>
              <span className={`absolute top-[1px] w-3.5 h-3.5 rounded-full bg-white border border-black transition-all ${challengeOn ? 'left-[17px]' : 'left-[1px]'}`} />
            </span>
          </span>
          <span className="block font-game outl text-[15px] leading-tight mt-0.5">
            {challenge.name}
          </span>
          <span className="block text-[10px] font-bold text-zinc-300 leading-snug">{challenge.desc}</span>
        </button>
      ),
  ];
  const eventCards = eventList
    .filter(Boolean)
    .slice(0, 2)
    .map((el, i) => (
      <div key={i} className={i > 0 ? '[@media(max-height:720px)]:hidden' : ''}>
        {el}
      </div>
    ));

  const chip = 'chunky flex items-center justify-center gap-1.5 h-10 short:h-8 px-2 text-zinc-100 font-game outl text-[13px] short:text-[11px] whitespace-nowrap [&>svg]:w-4 [&>svg]:h-4 [&>svg]:text-red-500';
  const myTier = rankPoints != null ? tierOf(rankPoints) : null;
  const rankedSwitch = onToggleRanked && (
    <button
      onClick={onToggleRanked}
      className={`chunky col-span-2 flex items-center gap-2 h-11 short:h-9 px-3 text-left ${rankedOn ? '!border-amber-500' : ''}`}
      style={{ background: rankedOn ? '#2a1a04' : C.night }}
      title={rankedOn ? 'Partie classée : une victoire donne des points, une mort en fait perdre' : 'Activer la partie classée (Normal ou plus)'}
    >
      <Medal className={`w-5 h-5 shrink-0 ${rankedOn ? 'text-amber-400' : 'text-zinc-500'}`} style={rankedOn && myTier ? { color: myTier.color } : undefined} />
      <span className="flex-1 min-w-0">
        <span className={`block font-game outl text-[13px] short:text-[11px] leading-tight ${rankedOn ? 'text-amber-300' : 'text-zinc-300'}`}>PARTIE CLASSÉE</span>
        <span className="block short:hidden text-[10px] text-zinc-400 leading-tight truncate">
          {rankPoints == null ? 'Connecte-toi pour jouer en classé' : rankedOn ? `${myTier?.name} · ${rankPoints} pts — gagne pour monter` : 'Désactivée : aucune perte de points'}
        </span>
      </span>
      <span className={`relative shrink-0 w-10 h-5 rounded-full border-2 border-black ${rankedOn ? 'bg-amber-500' : 'bg-zinc-700'}`}>
        <span className={`absolute top-[1px] w-3.5 h-3.5 rounded-full bg-white border border-black transition-all ${rankedOn ? 'left-[21px]' : 'left-[1px]'}`} />
      </span>
    </button>
  );
  const modeChips = (
    <>
      {rankedSwitch}
      <button onClick={onMultiplayer} className={chip} style={{ background: C.teal }} title="Coop et Imposteur jusqu'à 8, Chasse, Course">
        <Users /> Multijoueur
      </button>
      {onSurvival && (
        <button onClick={onSurvival} className={chip} style={{ background: C.blood }} title="Survie infinie : tiens le plus longtemps">
          <Skull /> Survie
        </button>
      )}
      {onFindOpponent && (
        <button onClick={onFindOpponent} className={chip} style={{ background: C.rust }} title="Chasse en ligne : l'un de vous est le monstre">
          <Swords /> Duel
        </button>
      )}
      {onCampaign && (
        <button
          onClick={ch5Unlocked ? onCampaign : undefined}
          disabled={!ch5Unlocked}
          className={chip}
          style={{ background: C.bruise }}
          title={ch5Unlocked ? 'Les 5 chapitres d\'affilée' : 'Finissez la forêt pour débloquer la campagne'}
        >
          {ch5Unlocked ? <Flag /> : <Lock />} Campagne
        </button>
      )}
    </>
  );

  const chapterCard = (
    <button
      onClick={() => setPicker(true)}
      className="chunky relative overflow-hidden text-left text-white h-[92px] short:h-[64px] w-full wide:w-[250px] short:w-[190px] px-3 py-2 short:py-1.5"
      style={{ background: cur.color }}
      title="Changer de chapitre et de difficulté"
    >
      <span className="flex items-center gap-2 font-game outl text-[11px] text-red-400">CHAPITRE {cur.n} ▸ CHANGER <StarRow mask={chapterStars[cur.n] ?? 0} chapter={cur.n} /></span>
      <span className="block font-game outl text-[23px] short:text-[18px] leading-tight pr-12">{cur.name}</span>
      <span className="block short:hidden text-[11px] font-bold text-white/85 pr-12 truncate">{cur.sub}</span>
      <span className="absolute right-2 -bottom-3 font-game text-[72px] short:text-[52px] leading-none text-red-700/50 pointer-events-none">{String(cur.n).padStart(2, '0')}</span>
    </button>
  );
  const diffCard = (
    <button
      onClick={() => setPicker(true)}
      className="chunky flex flex-col items-center justify-center text-white h-[92px] short:h-[64px] w-full wide:w-[130px] short:w-[100px] px-2"
      style={{ background: heat[difficulty - 1] }}
      title={diff.description}
    >
      <span className="font-game outl text-[11px] text-red-400">DIFFICULTÉ</span>
      <span className="font-game outl text-[20px] short:text-[16px] leading-tight">{diff.name}</span>
      <span className="flex gap-0.5 h-4 items-center text-red-400">{diff.monsters === 0 ? <span className="text-[10px] text-zinc-400">AUCUN MONSTRE</span> : Array.from({ length: diff.monsters }).map((_, i) => <Skull key={i} className="w-3.5 h-3.5" />)}</span>
    </button>
  );
  const playBtn = (
    <button
      onClick={onStartGame}
      className="chunky menu-pulse w-full h-[96px] short:h-[64px] flex flex-col items-center justify-center text-white !rounded-[20px]"
      style={{ background: 'linear-gradient(#8f0c0c, #3d0303)', borderColor: '#d11a1a' }}
    >
      <span className="font-game outl-lg text-[42px] short:text-[30px] leading-none tracking-[0.18em] text-red-50">JOUER</span>
      <span className={`font-game outl text-[11px] mt-1 short:hidden ${rankedOn && rankPoints != null ? 'text-amber-300' : 'text-red-200/70'}`}>
        {rankedOn && rankPoints != null ? `🏅 CLASSÉ · ${cur.name} · ${difficulty < 2 ? 'Normal' : diff.name}` : `SOLO · ${cur.name} · ${diff.name}`}
      </span>
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 select-none overflow-y-auto overflow-x-hidden">
      {/* Dark vignette over the 3D hospital, slow red light rays behind the character */}
      <div className="fixed inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at 50% 55%, rgba(40,6,6,0.55) 0%, rgba(0,0,0,0.82) 60%, rgba(0,0,0,0.96) 100%)' }} />
      <div className="fixed inset-0 pointer-events-none overflow-hidden opacity-60">
        <div
          className="absolute left-1/2 top-[52%] w-[1600px] h-[1600px] -ml-[800px] -mt-[800px]"
          style={{
            background: 'radial-gradient(circle, rgba(150,0,0,0.35) 0%, rgba(80,0,0,0.15) 25%, transparent 45%)',
            maskImage: 'radial-gradient(circle, #000 0%, transparent 45%)',
            WebkitMaskImage: 'radial-gradient(circle, #000 0%, transparent 45%)',
          }}
        />
      </div>
      {season && <SeasonalOverlay season={season} />}

      <div className="relative min-h-full wide:h-full wide:min-h-[560px] short:min-h-[360px] flex flex-col gap-3 p-3 wide:block wide:p-0">
        {/* ── Top bar ── */}
        <header className="wide:absolute wide:top-3 short:top-2 wide:left-4 wide:right-4 z-20 flex items-start justify-between gap-2">
          <div className="chunky flex items-center gap-2.5 pl-1.5 pr-3 py-1.5 text-white !rounded-2xl min-w-0" style={{ background: 'rgba(10,10,14,0.85)' }}>
            <button
              onClick={onCustomize}
              disabled={!onCustomize}
              title={onCustomize ? 'Personnaliser mon personnage' : ''}
              className="relative shrink-0 w-12 h-12 rounded-lg border border-red-900 flex items-center justify-center disabled:cursor-default"
              style={{ background: '#1a0a0a', boxShadow: `inset 0 0 0 2px ${level ? levelColor(level.level) + '66' : '#0000'}` }}
            >
              <User className="w-6 h-6 text-zinc-200" />
              {level && (
                <span className="absolute -bottom-2 -right-2 min-w-[22px] h-[22px] px-1 rounded-md bg-red-700 border border-black font-game text-[11px] text-white flex items-center justify-center">
                  {level.level}
                </span>
              )}
            </button>
            <div className="min-w-0">
              <div data-no-i18n className="font-game outl text-[18px] leading-tight max-w-[140px] truncate">
                {username ?? 'Invité'}
              </div>
              {level && level.need > 0 ? (
                <div className="w-[120px] h-3 mt-0.5 rounded-md bg-black p-[2px]" title={`${level.into} / ${level.need} XP avant le niveau ${level.level + 1}`}>
                  <div className="h-full rounded-[3px]" style={{ width: `${(level.into / level.need) * 100}%`, background: 'linear-gradient(#e33, #8b0000)' }} />
                </div>
              ) : (
                <div className="text-[11px] font-bold text-zinc-400">{username ? 'Niveau max !' : 'Connecte-toi pour progresser'}</div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap justify-end">
            {coins != null && (
              <button onClick={onShop} className="chunky flex items-center gap-1.5 h-10 pl-1 pr-1 text-white !rounded-xl" style={{ background: 'rgba(10,10,14,0.85)' }} title="Boutique">
                <Coins className="w-5 h-5 ml-1 text-amber-500" />
                <span className="font-game outl text-[17px] px-0.5">{fmtCoins(coins)}</span>
                <span className="w-6 h-6 rounded-md border border-black flex items-center justify-center bg-red-700">
                  <Plus className="w-4 h-4" strokeWidth={4} />
                </span>
              </button>
            )}
            <TopBtn onClick={() => setLang(getLang() === 'fr' ? 'en' : 'fr')} title={getLang() === 'fr' ? 'Play in English' : 'Jouer en français'}>
              <span data-no-i18n className="font-game outl text-[13px]">
                {getLang() === 'fr' ? 'FR' : 'EN'}
              </span>
            </TopBtn>
            {notifications && notifications !== 'unsupported' && onToggleNotifications && (
              <TopBtn
                onClick={onToggleNotifications}
                color={notifications === 'on' ? C.blood : C.steel}
                title={
                  notifications === 'on'
                    ? 'Notifications activées (invitations, cadeaux, événements). Cliquer pour couper.'
                    : notifications === 'denied'
                      ? 'Notifications bloquées dans les réglages du navigateur.'
                      : 'Être prévenu quand un ami t\'invite, d\'un cadeau ou d\'un événement, même jeu fermé.'
                }
              >
                {notifications === 'on' ? <Bell className="w-5 h-5" /> : <BellOff className="w-5 h-5" />}
              </TopBtn>
            )}
            {onToggleMusic && (
              <TopBtn onClick={onToggleMusic} title="Musique du menu" color={menuMusic ? C.blood : C.steel}>
                {menuMusic ? <Music className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
              </TopBtn>
            )}
            <TopBtn onClick={() => setShowSettings(true)} title="Options & Son">
              <Settings className="w-5 h-5" />
            </TopBtn>
          </div>
        </header>

        {/* ── Centre: title + your character ── */}
        <section className="relative h-[360px] wide:absolute wide:left-1/2 wide:-translate-x-1/2 wide:top-[64px] wide:bottom-[118px] short:top-[50px] short:bottom-[6px] wide:h-auto wide:w-[min(40vw,620px)]">
          <div className="absolute inset-x-0 top-0 z-10 text-center pointer-events-none">
            <h1 className="title-flicker font-serif font-black text-[44px] wide:text-[56px] short:text-[30px] leading-none text-zinc-100 tracking-[0.14em] drop-shadow-[0_0_26px_rgba(200,0,0,0.75)]">
              HOSPITAL
              {season && <span className="ml-1 text-[0.6em] align-top">{season === 'noel' ? '🎅' : SEASON_INFO[season].emoji}</span>}
            </h1>
            <span className="inline-block mt-1.5 px-3 py-0.5 border border-red-800 bg-black/70 font-game text-[12px] short:text-[10px] text-red-500 tracking-[0.4em]">PATIENT ZÉRO</span>
          </div>
          <MenuStage look={look} emotes={emotes} />
          {onCustomize && (
            <button onClick={onCustomize} className="chunky absolute left-1/2 -translate-x-1/2 bottom-1 z-10 h-9 px-3 font-game outl text-[13px] text-white !rounded-xl whitespace-nowrap" style={{ background: C.night }}>
              <Shirt className="inline w-4 h-4 -mt-0.5 mr-1 text-red-500" />Personnaliser
            </button>
          )}
        </section>

        {/* ── Big JOUER (first thing under the character on phones) ── */}
        <div className="wide:absolute wide:right-4 wide:bottom-4 short:bottom-2 wide:w-[250px] short:w-[220px] z-10">{playBtn}</div>

        {/* ── Chapter + difficulty ── */}
        <div className="grid grid-cols-[1fr_110px] gap-2 wide:flex wide:absolute wide:left-4 wide:bottom-4 short:bottom-2 z-10">
          {chapterCard}
          {diffCard}
        </div>

        {/* ── Other modes (above JOUER) ── */}
        <div className="grid grid-cols-2 gap-2 wide:absolute wide:right-4 wide:bottom-[124px] short:bottom-[78px] wide:w-[250px] short:w-[220px] z-10">{modeChips}</div>

        {/* ── Left column ── */}
        <nav className="grid grid-cols-4 gap-2 wide:grid-cols-2 wide:absolute wide:left-4 wide:top-[92px] short:top-[74px] wide:w-[140px] short:w-[120px] z-10">{leftButtons}</nav>

        {/* ── Right column: events + more ── */}
        <aside className="flex flex-col gap-2 wide:absolute wide:right-4 wide:top-[70px] short:top-[74px] wide:w-[210px] short:w-[176px] z-10">
          <div className="flex flex-col gap-2 short:hidden">{eventCards}</div>
          <div className="grid grid-cols-4 wide:grid-cols-3 gap-2 mt-1">{rightButtons}</div>
        </aside>

        {/* Phone-only footer */}
        <div className="wide:hidden text-center pt-2 pb-4 space-y-2">
          <p className="text-[12px] italic text-red-300/80 font-serif">« {daily} »</p>
          {touch && <p className="text-[11px] text-zinc-500">📱 Tiens ton téléphone en paysage : le jeu passe en plein écran.</p>}
          <InstallButton />
        </div>
        {/* Big screens: daily line under the character */}
        <p className="hidden wide:block short:hidden absolute left-1/2 -translate-x-1/2 bottom-3 w-[min(30vw,360px)] text-center text-[11px] italic text-red-300/70 font-serif pointer-events-none">« {daily} »</p>
      </div>

      {/* ── Chapter & difficulty picker ── */}
      {picker && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 bg-black/80" onClick={() => setPicker(false)}>
          <div className="chunky relative w-full max-w-2xl max-h-[92vh] overflow-y-auto p-4 sm:p-5 text-white !rounded-3xl" style={{ background: '#121218' }} onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setPicker(false)} className="absolute top-3 right-3 w-9 h-9 rounded-xl border border-red-800 bg-black flex items-center justify-center text-red-400" aria-label="Fermer">
              <X className="w-5 h-5" strokeWidth={3} />
            </button>
            <h2 className="font-game outl text-[24px] mb-3">Choisis ta partie</h2>
            {onChangeChapter && (
              <>
                <div className="font-game text-[13px] text-zinc-400 mb-1.5">CHAPITRE</div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
                  {CHAPTERS.map((c) => {
                    const locked = !unlocked[c.n - 1];
                    const active = eff === c.n;
                    return (
                      <button
                        key={c.n}
                        disabled={locked}
                        onClick={() => onChangeChapter(c.n)}
                        title={locked ? `${lockText(c.n)} (connecté) pour débloquer ce chapitre` : c.sub}
                        className={`chunky relative overflow-hidden h-[84px] text-left px-2.5 py-2 ${active ? '!border-red-500 ring-2 ring-red-600' : ''}`}
                        style={{ background: locked ? '#0c0c0e' : c.color }}
                      >
                        <span className="block font-game outl text-[11px] text-white/80">CHAPITRE {c.n}</span>
                        <span className="block font-game outl text-[16px] leading-tight pr-6">{locked ? '???' : c.name}</span>
                        {locked ? <span className="block text-[10px] font-bold text-zinc-400 leading-tight pr-6">{lockText(c.n)}</span> : <StarRow mask={chapterStars[c.n] ?? 0} chapter={c.n} size={13} />}
                        <span className="absolute right-1.5 bottom-0 font-game text-[40px] leading-none text-red-700/45">{locked ? <Lock className="w-6 h-6 mb-2 text-zinc-600" /> : String(c.n).padStart(2, '0')}</span>
                        {active && <span className="absolute top-1 right-1.5 font-game text-red-400 text-[14px]">✔</span>}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
            <div className="font-game text-[13px] text-zinc-400 mb-1.5">DIFFICULTÉ</div>
            <div className="grid grid-cols-5 gap-1.5">
              {DIFFICULTIES.map((d) => {
                const active = d.level === difficulty;
                return (
                  <button
                    key={d.level}
                    onClick={() => onChangeDifficulty(d.level)}
                    className={`chunky flex flex-col items-center justify-center h-[64px] px-1 text-white ${active ? '!border-red-500 ring-2 ring-red-600' : ''}`}
                    style={{ background: heat[d.level - 1] }}
                  >
                    <span className="font-game outl text-[11px] sm:text-[14px] leading-tight max-w-full truncate">{d.name}</span>
                    <span className="flex gap-0.5 h-3.5 items-center text-red-400">{d.monsters === 0 ? <span className="text-[9px] text-zinc-400">AUCUN</span> : Array.from({ length: d.monsters }).map((_, i) => <Skull key={i} className="w-3 h-3" />)}</span>
                  </button>
                );
              })}
            </div>
            <p className="text-[12px] text-zinc-300 italic font-serif mt-2 min-h-[1.2em]">{diff.description}</p>
            {challenge && onToggleChallenge && (
              <button
                onClick={onToggleChallenge}
                className="chunky w-full mt-3 flex items-center gap-3 px-3 py-2 text-left text-white"
                style={{ background: challengeOn ? '#3a0707' : C.night }}
              >
                <Target className="w-6 h-6 shrink-0 text-red-500" />
                <span className="flex-1 min-w-0">
                  <span className="block font-game outl text-[11px] text-red-400">DÉFI DU JOUR {challengeDone ? '✔' : `· +${challenge.reward} pièces`}</span>
                  <span className="block font-game outl text-[15px] leading-tight">{challenge.name}</span>
                  <span className="block text-[11px] font-bold text-zinc-300">{challenge.desc}</span>
                </span>
                <span className={`relative shrink-0 w-11 h-6 rounded-full border-2 border-black ${challengeOn ? 'bg-red-600' : 'bg-zinc-700'}`}>
                  <span className={`absolute top-[1px] w-[18px] h-[18px] rounded-full bg-white border border-black transition-all ${challengeOn ? 'left-[21px]' : 'left-[1px]'}`} />
                </span>
              </button>
            )}
            <button
              onClick={() => {
                setPicker(false);
                onStartGame();
              }}
              className="chunky w-full mt-4 h-[60px] font-game outl text-[26px] text-white !rounded-2xl"
              style={{ background: 'linear-gradient(#8f0c0c, #3d0303)', borderColor: '#d11a1a' }}
            >
              JOUER
            </button>
          </div>
        </div>
      )}

      {/* ── Settings window ── */}
      {showSettings && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80" onClick={() => setShowSettings(false)}>
          <div className="chunky relative w-full max-w-md max-h-[92vh] overflow-y-auto p-5 sm:p-6 text-white !rounded-3xl" style={{ background: '#121218' }} onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setShowSettings(false)} className="absolute top-3 right-3 w-9 h-9 rounded-xl border border-red-800 bg-black flex items-center justify-center text-red-400" aria-label="Fermer">
              <X className="w-5 h-5" strokeWidth={3} />
            </button>
            <h2 className="flex items-center gap-2 font-game outl text-[22px] mb-4"><Settings className="w-5 h-5 text-red-500" /> Options & Son</h2>

            <div className="space-y-4 text-[14px] text-zinc-200 font-bold">
              <div>
                <div className="flex justify-between mb-1.5">
                  <span>Volume Principal</span>
                  <span className="font-game text-red-400">{Math.round(audioSettings.masterVolume * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={audioSettings.masterVolume}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    onUpdateAudio({ masterVolume: val });
                    sound.updateSettings({ masterVolume: val });
                  }}
                  className="w-full accent-red-600 h-2 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between mb-1.5">
                  <span>Sensibilité de la Souris</span>
                  <span className="font-game text-red-400">{controlSettings.mouseSensitivity.toFixed(1)}x</span>
                </div>
                <input
                  type="range"
                  min="0.2"
                  max="3.0"
                  step="0.1"
                  value={controlSettings.mouseSensitivity}
                  onChange={(e) => onUpdateControls({ mouseSensitivity: parseFloat(e.target.value) })}
                  className="w-full accent-red-600 h-2 cursor-pointer"
                />
              </div>

              <div className="space-y-2">
                {(
                  [
                    ['invertY', 'Inverser l\'Axe Vertical (Y)', null],
                    ['micEnabled', 'Micro : le monstre entend votre voix', 'Le navigateur vous demandera l\'autorisation'],
                    ['shadowsEnabled', 'Ombres Dynamiques (Lampe)', null],
                    ['performanceMode', 'Mode Performance 60+ FPS', 'Recommandé pour PC portables'],
                    ['hints', 'Indices quand je suis bloqué', 'Un conseil s\'affiche si tu n\'avances plus pendant 2 min'],
                  ] as const
                ).map(([key, label, sub]) => {
                  const on = key === 'hints' ? controlSettings.hints !== false : !!controlSettings[key];
                  return (
                    <button
                      key={key}
                      onClick={() => onUpdateControls({ [key]: !on } as Partial<ControlSettings>)}
                      className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border-2 border-black text-left"
                      style={{ background: '#1d1d25' }}
                    >
                      <span>
                        <span className="block">{label}</span>
                        {sub && <span className="block text-[11px] text-zinc-500 font-normal">{sub}</span>}
                      </span>
                      <span className={`relative shrink-0 w-11 h-6 rounded-full border-2 border-black ${on ? 'bg-red-600' : 'bg-zinc-700'}`}>
                        <span className={`absolute top-[1px] w-[18px] h-[18px] rounded-full bg-white border border-black transition-all ${on ? 'left-[21px]' : 'left-[1px]'}`} />
                      </span>
                    </button>
                  );
                })}
              </div>
              {touch && (
                <div className="space-y-2">
                  <button
                    onClick={() => onUpdateControls({ vibration: controlSettings.vibration === false })}
                    className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border-2 border-black text-left"
                    style={{ background: '#1d1d25' }}
                  >
                    <span>
                      <span className="block">Vibrations</span>
                      <span className="block text-[11px] text-zinc-500 font-normal">Quand le monstre te repère, te frappe ou t'attrape</span>
                    </span>
                    <span className={`relative shrink-0 w-11 h-6 rounded-full border-2 border-black ${controlSettings.vibration !== false ? 'bg-red-600' : 'bg-zinc-700'}`}>
                      <span className={`absolute top-[1px] w-[18px] h-[18px] rounded-full bg-white border border-black transition-all ${controlSettings.vibration !== false ? 'left-[21px]' : 'left-[1px]'}`} />
                    </span>
                  </button>
                  <div className="px-3 py-2.5 rounded-xl border-2 border-black" style={{ background: '#1d1d25' }}>
                    <span className="block mb-2">Taille des boutons et du joystick</span>
                    <div className="grid grid-cols-3 gap-1.5">
                      {(
                        [
                          [1, 'Normale'],
                          [1.25, 'Grande'],
                          [1.5, 'Très grande'],
                        ] as const
                      ).map(([v, l]) => (
                        <button
                          key={v}
                          onClick={() => onUpdateControls({ touchScale: v })}
                          className={`h-9 rounded-lg border-2 font-game text-[12px] ${(controlSettings.touchScale ?? 1) === v ? 'border-red-500 bg-red-950/60 text-red-200' : 'border-black bg-zinc-800 text-zinc-300'}`}
                        >
                          {l}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              {!touch && (
                <div className="flex flex-wrap gap-x-3 gap-y-1.5 pt-1 text-[11px] text-zinc-400 font-normal">
                  {[
                    ['ZQSD', 'Se déplacer'],
                    ['E', 'Interagir'],
                    ['F', 'Lampe'],
                    ['Shift', 'Courir'],
                    ['C', 'S\'accroupir'],
                    ['Tab', 'Inventaire'],
                    ['M', 'Carte'],
                    ['P', 'Mode photo'],
                  ].map(([k, v]) => (
                    <span key={k} className="flex items-center gap-1">
                      <kbd data-no-i18n className="px-1.5 py-0.5 rounded-md border-2 border-black bg-zinc-800 font-game text-[11px] text-zinc-100">
                        {k}
                      </kbd>
                      {v}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <a href="/comment-jouer/" className="mt-4 flex items-center justify-center gap-1.5 text-[12px] text-red-300 hover:text-red-200 underline underline-offset-2">
              <HelpCircle className="w-4 h-4" /> Comment jouer : touches, chapitres, monstres et astuces
            </a>
            <button onClick={() => setShowSettings(false)} className="chunky w-full mt-4 h-12 font-game outl text-[18px] text-white !rounded-2xl" style={{ background: C.blood }}>
              Enregistrer
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
