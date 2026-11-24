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

import { RANK_TIERS } from '../ranked';
import { Bell, BellOff, ChevronRight, Coins, Medal, Music, Play, ShoppingBag, Sliders, Trophy, Users, VolumeX, X } from 'lucide-react';
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

export const BOOST_LABEL: Record<string, string> = {
  coins2: '🪙 PIÈCES DOUBLÉES',
  treats2: '🍬 FRIANDISES DOUBLÉES',
  xp2: '⭐ XP DOUBLÉE',
  all2: '⚡ TOUT EST DOUBLÉ (pièces, XP, friandises)',
};

/** "⚡ PIÈCES DOUBLÉES — encore 5 h 12" */
const BoostBanner: React.FC<{ boost: Boost }> = ({ boost }) => {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, boost.until - now);
  if (left <= 0) return null;
  const h = Math.floor(left / 3600000);
  const m = Math.floor((left % 3600000) / 60000);
  return (
    <div className="relative z-10 mx-auto w-full max-w-6xl px-4 py-2 rounded-lg border border-amber-400/70 bg-amber-500/15 text-amber-200 font-mono text-[11px] sm:text-xs uppercase tracking-[0.2em] text-center animate-pulse shadow-[0_0_24px_rgba(251,191,36,0.3)]">
      ⚡ Événement surprise : {BOOST_LABEL[boost.kind]} — encore {h > 0 ? `${h} h ` : ''}{String(m).padStart(2, '0')} min
    </div>
  );
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
  challenge?: ChallengeDef;
  challengeOn?: boolean;
  challengeDone?: boolean;
  onToggleChallenge?: () => void;
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

/** Small square icon button of the top bar */
const IconBtn: React.FC<{ onClick: () => void; title: string; active?: boolean; children: React.ReactNode; label?: string }> = ({ onClick, title, active, children, label }) => (
  <button
    onClick={onClick}
    title={title}
    className={`h-9 min-w-9 px-2.5 flex items-center justify-center gap-1.5 rounded-lg border text-xs font-mono transition-colors ${
      active ? 'border-red-700/70 bg-red-950/40 text-red-200' : 'border-white/10 bg-black/50 text-zinc-400 hover:text-zinc-100 hover:border-white/25'
    }`}
  >
    {children}
    {label && <span className="hidden md:inline uppercase tracking-wider">{label}</span>}
  </button>
);

/** A line of the right-hand menu */
const NavRow: React.FC<{ icon: React.ReactNode; label: string; onClick: () => void; right?: React.ReactNode; badge?: number; badgeColor?: string; hover?: string }> = ({
  icon,
  label,
  onClick,
  right,
  badge = 0,
  badgeColor = 'bg-red-600 text-white',
  hover = 'group-hover:text-red-300',
}) => (
  <button onClick={onClick} className="group w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left hover:bg-white/[0.06] transition-colors">
    <span className="w-7 h-7 shrink-0 flex items-center justify-center rounded-md bg-white/[0.05] text-base">{icon}</span>
    <span className={`flex-1 min-w-0 text-[13px] text-zinc-200 transition-colors ${hover}`}>{label}</span>
    {right && <span className="text-[11px] font-mono text-zinc-400 truncate max-w-[45%]">{right}</span>}
    {badge > 0 && <span className={`min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-bold flex items-center justify-center animate-pulse ${badgeColor}`}>{badge}</span>}
    <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-zinc-300 group-hover:translate-x-0.5 transition-all" />
  </button>
);

/** A secondary game mode */
const ModeCard: React.FC<{ icon: string; title: string; sub: string; onClick?: () => void; locked?: boolean; tone: string; extra?: React.ReactNode; wide?: boolean }> = ({
  icon,
  title,
  sub,
  onClick,
  locked,
  tone,
  extra,
  wide,
}) => (
  <button
    onClick={locked ? undefined : onClick}
    disabled={locked}
    className={`group relative flex items-center gap-3 p-3 rounded-xl border border-white/10 bg-black/55 backdrop-blur-sm text-left transition-all hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 ${tone} ${wide ? 'sm:col-span-2' : ''}`}
  >
    <span className="w-11 h-11 shrink-0 flex items-center justify-center rounded-lg bg-white/[0.06] text-2xl">{locked ? '🔒' : icon}</span>
    <span className="flex-1 min-w-0">
      <span className="block text-sm font-semibold text-zinc-100">{title}</span>
      <span className="block text-[11px] text-zinc-400 leading-snug">{sub}</span>
    </span>
    {extra}
    {!locked && <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-zinc-200 transition-colors" />}
  </button>
);

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="text-[10px] font-mono uppercase tracking-[0.3em] text-zinc-500 mb-2">{children}</div>
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
  friendsOnline = null,
  friendsAlert = 0,
  season = null,
  adventReady = false,
  onShop,
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
  onChangeChapter,
  challenge,
  challengeOn = false,
  challengeDone = false,
  onToggleChallenge,
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

  const CHAPTERS: { n: ChapterN; icon: string; name: string; sub: string }[] = [
    { n: 1, icon: '🏥', name: 'L\'Hôpital', sub: 'Échappez au Patient Zéro' },
    { n: 2, icon: '🐀', name: 'Les Égouts', sub: 'Il n\'a pas d\'yeux. Il écoute.' },
    { n: 3, icon: '🌀', name: 'Le Dédale', sub: 'Il suit ta trace. Ne t\'arrête pas.' },
    { n: 4, icon: '🌲', name: 'La Forêt', sub: 'Lampe allumée, il te voit de loin.' },
    { n: 5, icon: '🟣', name: 'Le Site B', sub: 'Finale : la lumière devient une arme.' },
    { n: 6, icon: '⛈️', name: 'Le Toit', sub: 'Épilogue : la tempête, et un hélicoptère.' },
    { n: 7, icon: '💉', name: 'Le Cœur', sub: 'Boss final : le vrai Patient Zéro.' },
    ch8Unlocked ? { n: 8, icon: '🌳', name: 'Le Rêve de Lucas', sub: 'Chapitre secret : ses souvenirs, et une ombre.' } : { n: 8, icon: '❔', name: '???', sub: 'Chapitre secret' },
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
  const heat = ['#71717a', '#eab308', '#f97316', '#dc2626', '#9f1239'];
  const tier = RANK_TIERS.find((t) => t.id === rankTier) ?? RANK_TIERS[0];
  const unlockedCount = unlocked.filter(Boolean).length;

  return (
    <div className="fixed inset-0 z-50 select-none overflow-y-auto overflow-x-hidden">
      {/* The 3D hospital is rendered behind this translucent overlay */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background:
            'linear-gradient(90deg, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.7) 45%, rgba(0,0,0,0.55) 65%, rgba(0,0,0,0.9) 100%), radial-gradient(ellipse at 30% 20%, rgba(120,0,0,0.25) 0%, rgba(0,0,0,0) 60%)',
        }}
      />
      {season && <SeasonalOverlay season={season} />}

      <div className="relative z-10 min-h-full flex flex-col gap-5 px-3 py-3 sm:px-6 sm:py-5 lg:px-10">
        {/* ── Top bar ── */}
        <header className="w-full max-w-6xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="relative flex w-2.5 h-2.5 shrink-0">
              <span className="absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-60 animate-ping" />
              <span className="relative inline-flex w-2.5 h-2.5 rounded-full bg-red-600" />
            </span>
            <span className="hidden sm:block text-[10px] font-mono uppercase tracking-[0.25em] text-zinc-500 truncate">
              Saint-Aurore · Alerte biologique 4
            </span>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Profile chip */}
            {(username || level || coins != null) && (
              <div className="flex items-center gap-2.5 h-9 pl-2 pr-3 rounded-lg border border-white/10 bg-black/50">
                {level && (
                  <span
                    className="w-6 h-6 rounded-md flex items-center justify-center text-[11px] font-bold font-mono text-black"
                    style={{ background: levelColor(level.level) }}
                    title={level.need ? `${level.into} / ${level.need} XP avant le niveau ${level.level + 1}` : 'Niveau maximum !'}
                  >
                    {level.level}
                  </span>
                )}
                <span className="hidden sm:flex flex-col leading-tight">
                  {username && (
                    <span data-no-i18n className="text-[12px] text-zinc-100 font-semibold max-w-[120px] truncate">
                      {username}
                    </span>
                  )}
                  {level && level.need > 0 && (
                    <span className="block w-20 h-1 rounded-full bg-zinc-800 overflow-hidden mt-0.5">
                      <span className="block h-full rounded-full" style={{ width: `${(level.into / level.need) * 100}%`, background: levelColor(level.level) }} />
                    </span>
                  )}
                </span>
                {coins != null && (
                  <span className="flex items-center gap-1 text-[12px] font-mono text-amber-300 border-l border-white/10 pl-2.5">
                    <Coins className="w-3.5 h-3.5" /> {fmtCoins(coins)}
                  </span>
                )}
              </div>
            )}
            <IconBtn onClick={() => setLang(getLang() === 'fr' ? 'en' : 'fr')} title={getLang() === 'fr' ? 'Play in English' : 'Jouer en français'}>
              <span data-no-i18n className="uppercase font-bold text-[11px]">
                {getLang() === 'fr' ? 'FR' : 'EN'}
              </span>
            </IconBtn>
            {notifications && notifications !== 'unsupported' && onToggleNotifications && (
              <IconBtn
                onClick={onToggleNotifications}
                active={notifications === 'on'}
                title={
                  notifications === 'on'
                    ? 'Notifications activées (invitations, cadeaux, événements). Cliquer pour couper.'
                    : notifications === 'denied'
                      ? 'Notifications bloquées dans les réglages du navigateur.'
                      : 'Être prévenu quand un ami t\'invite, d\'un cadeau ou d\'un événement, même jeu fermé.'
                }
              >
                {notifications === 'on' ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
              </IconBtn>
            )}
            {onToggleMusic && (
              <IconBtn onClick={onToggleMusic} title="Musique du menu" active={menuMusic}>
                {menuMusic ? <Music className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              </IconBtn>
            )}
            <IconBtn onClick={() => setShowSettings(true)} title="Options & Son" label="Options">
              <Sliders className="w-4 h-4" />
            </IconBtn>
          </div>
        </header>

        {/* ⚡ Surprise event */}
        {boost && boost.until > Date.now() && <BoostBanner boost={boost} />}

        <main className="w-full max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-5 lg:gap-8 items-start">
          {/* ── Left: title + new game ── */}
          <div className="flex flex-col gap-5 min-w-0">
            {/* Title */}
            <div className="text-center lg:text-left pt-1">
              <span className="block text-[10px] sm:text-xs font-mono uppercase tracking-[0.35em] text-red-500/90 font-bold mb-1 [@media(max-height:520px)]:hidden">
                SURVIE & HORREUR PSYCHOLOGIQUE 3D
              </span>
              <h1 className="relative inline-block title-flicker text-5xl sm:text-7xl [@media(max-height:520px)]:text-4xl font-serif tracking-[0.12em] font-black text-zinc-100 leading-none drop-shadow-[0_0_35px_rgba(200,0,0,0.55)]">
                HOSPITAL
                {season && (
                  <span className="absolute -top-[0.45em] -left-[0.35em] text-[0.6em] -rotate-[25deg] select-none" aria-hidden>
                    {season === 'noel' ? '🎅' : SEASON_INFO[season].emoji}
                  </span>
                )}
              </h1>
              <div className="flex items-center justify-center lg:justify-start gap-3 mt-2">
                <span className="h-px w-10 bg-red-700" />
                <span className="font-mono tracking-[0.45em] text-sm text-red-400">PATIENT ZERO</span>
                <span className="h-px w-10 bg-red-700 lg:hidden" />
              </div>
              <p className="hidden sm:block [@media(max-height:720px)]:hidden mt-3 text-[13px] text-zinc-400 leading-relaxed font-serif italic max-w-xl mx-auto lg:mx-0">
                « Vous vous réveillez dans une chambre verrouillée de l'Hôpital Saint-Aurore. Les alarmes de confinement résonnent. Une entité déformée erre dans les couloirs obscurs. Échappez-vous avant qu'elle ne sente votre présence. »
              </p>
              {season && (
                <button
                  onClick={onShop}
                  className="mt-3 px-4 py-1.5 rounded-full border font-mono text-[11px] uppercase tracking-[0.2em] animate-pulse"
                  style={{ borderColor: SEASON_INFO[season].color, color: SEASON_INFO[season].color, background: SEASON_INFO[season].color + '1a' }}
                >
                  {SEASON_INFO[season].emoji} Événement {SEASON_INFO[season].name} — skins limités{season === 'noel' ? ' & calendrier' : ''}
                </button>
              )}
            </div>

            {/* Tutorial for newcomers */}
            {onTutorial && !tutorialDone && (
              <button
                onClick={onTutorial}
                className="lg:hidden w-full flex items-center gap-3 p-3 rounded-xl bg-emerald-800/80 hover:bg-emerald-700 border border-emerald-400/70 text-left shadow-[0_0_24px_rgba(16,185,129,0.35)] transition-colors"
              >
                <span className="text-2xl">🎓</span>
                <span className="flex-1">
                  <span className="block text-sm font-semibold text-white">Nouveau ? Commence par le tutoriel (2 min)</span>
                  <span className="block text-[11px] text-emerald-100/80">Les touches, les cachettes, la lampe… tout en douceur.</span>
                </span>
                <ChevronRight className="w-5 h-5 text-emerald-100" />
              </button>
            )}

            {/* ── New game panel ── */}
            <section className="rounded-2xl border border-white/10 bg-black/60 backdrop-blur-md p-4 sm:p-5 shadow-[0_20px_60px_rgba(0,0,0,0.6)]">
              {onChangeChapter && (
                <div className="mb-4">
                  <div className="flex items-baseline justify-between">
                    <SectionTitle>Chapitre</SectionTitle>
                    <span className="text-[10px] font-mono text-zinc-600">{unlockedCount}/8 débloqués</span>
                  </div>
                  <div className="grid grid-cols-4 lg:grid-cols-8 gap-1.5 sm:gap-2">
                    {CHAPTERS.map((c) => {
                      const locked = !unlocked[c.n - 1];
                      const active = eff === c.n;
                      return (
                        <button
                          key={c.n}
                          disabled={locked}
                          onClick={() => onChangeChapter(c.n)}
                          title={locked ? `${lockText(c.n)} (connecté) pour débloquer ce chapitre` : `Chapitre ${c.n} — ${c.name}`}
                          className={`relative flex flex-col items-center justify-center gap-1 py-2.5 sm:py-3 lg:py-2 rounded-xl border transition-all ${
                            active
                              ? 'border-red-500 bg-gradient-to-b from-red-900/50 to-red-950/30 shadow-[0_0_22px_rgba(220,38,38,0.35)]'
                              : 'border-white/10 bg-white/[0.03] hover:border-white/25 hover:bg-white/[0.06]'
                          } disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-white/10`}
                        >
                          <span className={`text-2xl sm:text-3xl [@media(max-height:520px)]:text-xl ${locked ? 'grayscale' : ''}`}>{locked ? '🔒' : c.icon}</span>
                          <span className={`text-[10px] font-mono ${active ? 'text-red-200' : 'text-zinc-500'}`}>{c.n}</span>
                          <span className={`hidden sm:block lg:hidden px-1 text-[11px] leading-tight text-center ${active ? 'text-zinc-100 font-semibold' : 'text-zinc-400'}`}>{locked ? '???' : c.name}</span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-2.5 flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/5">
                    <span className="text-lg">{cur.icon}</span>
                    <span className="min-w-0">
                      <span className="block text-[12px] font-semibold text-zinc-100">
                        Chapitre {cur.n} — {cur.name}
                      </span>
                      <span className="block text-[11px] text-zinc-400 truncate">{cur.n === 3 ? `${cur.sub} (solo)` : cur.n >= 4 ? `${cur.sub} (solo ou coop)` : cur.sub}</span>
                    </span>
                  </div>
                </div>
              )}

              {/* Difficulty: level N = N - 1 creatures */}
              <div className="mb-4">
                <SectionTitle>Difficulté</SectionTitle>
                <div className="grid grid-cols-5 gap-1 p-1 rounded-xl bg-white/[0.03] border border-white/10">
                  {DIFFICULTIES.map((d) => {
                    const active = d.level === difficulty;
                    const h = heat[d.level - 1];
                    return (
                      <button
                        key={d.level}
                        onClick={() => onChangeDifficulty(d.level)}
                        className={`flex flex-col items-center gap-0.5 py-2 px-0.5 rounded-lg transition-all ${active ? 'bg-zinc-900' : 'hover:bg-white/[0.05]'}`}
                        style={active ? { boxShadow: `inset 0 0 0 1px ${h}, 0 0 18px ${h}44` } : undefined}
                      >
                        <span className={`max-w-full truncate text-[9px] sm:text-[11px] uppercase sm:tracking-wide font-semibold ${active ? 'text-zinc-100' : 'text-zinc-500'}`}>{d.name}</span>
                        <span className="flex gap-0.5 h-3 items-center" title={`${d.monsters} monstre(s)`}>
                          {d.monsters === 0 ? (
                            <span className="text-[9px] text-zinc-500">aucun</span>
                          ) : (
                            Array.from({ length: d.monsters }).map((_, i) => (
                              <span key={i} className="text-[11px]" style={{ color: active ? h : '#52525b' }}>
                                ☠
                              </span>
                            ))
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className="text-[11px] font-serif italic text-zinc-400 mt-2 min-h-[1.2em]">{DIFFICULTIES[difficulty - 1].description}</div>
              </div>

              {/* Daily challenge (solo) */}
              {challenge && onToggleChallenge && (
                <button
                  onClick={onToggleChallenge}
                  className={`w-full mb-4 flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-colors ${
                    challengeOn ? 'border-emerald-500/80 bg-emerald-950/40' : 'border-white/10 bg-white/[0.03] hover:border-white/25'
                  }`}
                >
                  <span className="text-2xl">{challenge.icon}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[10px] font-mono uppercase tracking-[0.2em] text-emerald-400">
                      🎯 Défi du jour {challengeDone ? '— réussi ✔' : `— +${challenge.reward} pièces`}
                    </span>
                    <span className="block text-[13px] text-zinc-100 font-semibold">{challenge.name}</span>
                    <span className="block text-[11px] text-zinc-400">{challenge.desc} Solo, difficulté 2+.</span>
                  </span>
                  {/* Switch */}
                  <span className={`relative shrink-0 w-10 h-6 rounded-full transition-colors ${challengeOn ? 'bg-emerald-500' : 'bg-zinc-700'}`}>
                    <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${challengeOn ? 'left-[18px]' : 'left-0.5'}`} />
                  </span>
                </button>
              )}

              {/* ▶ Play */}
              <button
                onClick={onStartGame}
                className="group w-full flex items-center justify-center gap-3 py-4 rounded-xl bg-gradient-to-r from-red-800 via-red-600 to-red-800 bg-[length:200%_100%] hover:bg-[position:100%_0] text-white border border-red-400/70 shadow-[0_0_34px_rgba(220,38,38,0.5)] transition-all duration-500"
              >
                <Play className="w-5 h-5 fill-white group-hover:scale-110 transition-transform" />
                <span className="flex flex-col items-start leading-tight">
                  <span className="font-mono text-base sm:text-lg uppercase tracking-[0.25em] font-bold">Jouer en Solo</span>
                  <span className="text-[10px] font-mono uppercase tracking-widest text-red-100/75">
                    {onChangeChapter ? `${cur.icon} ${cur.name} · ` : ''}
                    {DIFFICULTIES[difficulty - 1].name} · le son s'active
                  </span>
                </span>
              </button>
            </section>

            {/* ── Other modes ── */}
            <section>
              <SectionTitle>Autres modes</SectionTitle>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {onXmasNight && (
                  <ModeCard
                    icon="🎄"
                    title="Chapitre spécial — Nuit de Noël"
                    sub="Un chapitre de décembre, avec un skin unique à gagner 🎁"
                    onClick={onXmasNight}
                    tone="hover:border-emerald-400/70 bg-gradient-to-r from-red-950/60 to-emerald-950/60"
                    wide
                  />
                )}
                <ModeCard
                  icon="👥"
                  title="Multijoueur"
                  sub="Coop et Imposteur jusqu'à 8, Chasse, Course"
                  onClick={onMultiplayer}
                  tone="hover:border-sky-400/70"
                  extra={username ? <span data-no-i18n className="hidden sm:block text-[10px] font-mono text-emerald-400 max-w-[80px] truncate">{username}</span> : undefined}
                />
                {onSurvival && <ModeCard icon="🧟" title="Survie infinie" sub="Les vagues s'enchaînent : tiens le plus longtemps" onClick={onSurvival} tone="hover:border-red-400/70" />}
                {onFindOpponent && <ModeCard icon="⚔️" title="Chercher un adversaire" sub="Chasse en ligne : l'un de vous est le monstre" onClick={onFindOpponent} tone="hover:border-orange-400/70" />}
                {onCampaign && (
                  <ModeCard
                    icon="🏆"
                    title="Campagne"
                    sub={ch5Unlocked ? 'Les 5 chapitres d\'affilée, sans retour au menu' : 'Finissez la forêt pour la débloquer'}
                    onClick={onCampaign}
                    locked={!ch5Unlocked}
                    tone="hover:border-violet-400/70"
                  />
                )}
                {onTutorial && tutorialDone && <ModeCard icon="🎓" title="Tutoriel" sub="Revoir les bases en 2 minutes" onClick={onTutorial} tone="hover:border-emerald-400/70" />}
              </div>
            </section>
          </div>

          {/* ── Right: shop, progression, social, collection ── */}
          <aside className="flex flex-col gap-3 min-w-0 lg:sticky lg:top-4">
            {/* Tutorial for newcomers */}
            {onTutorial && !tutorialDone && (
              <button
                onClick={onTutorial}
                className="hidden lg:flex w-full items-center gap-3 p-3 rounded-xl bg-emerald-800/80 hover:bg-emerald-700 border border-emerald-400/70 text-left shadow-[0_0_24px_rgba(16,185,129,0.35)] transition-colors"
              >
                <span className="text-2xl">🎓</span>
                <span className="flex-1">
                  <span className="block text-sm font-semibold text-white">Nouveau ? Commence par le tutoriel (2 min)</span>
                  <span className="block text-[11px] text-emerald-100/80">Les touches, les cachettes, la lampe… tout en douceur.</span>
                </span>
                <ChevronRight className="w-5 h-5 text-emerald-100" />
              </button>
            )}
            {/* Shop */}
            <button
              onClick={onShop}
              className="group relative overflow-hidden flex items-center gap-3 p-4 rounded-2xl border border-amber-600/50 bg-gradient-to-br from-amber-950/70 via-black/70 to-black/70 backdrop-blur-md text-left hover:border-amber-400 transition-colors"
            >
              <span className="w-12 h-12 shrink-0 flex items-center justify-center rounded-xl bg-amber-500/15 border border-amber-500/30">
                <ShoppingBag className="w-6 h-6 text-amber-300" />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-semibold text-amber-100">{shopLocked ? '🔒 Boutique' : 'Boutique'}</span>
                <span className="block text-[11px] text-amber-200/70">{shopLocked ? 'Finis une partie en Exploration' : 'Skins & boîtes mystère'}</span>
                {(giftReady || adventReady) && (
                  <span className="flex gap-2 mt-1">
                    {giftReady && <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] animate-pulse">🎁 cadeau !</span>}
                    {adventReady && <span className="px-1.5 py-0.5 rounded bg-red-500/20 text-red-300 text-[10px] animate-pulse">🎄 case du jour !</span>}
                  </span>
                )}
              </span>
              {coins != null && (
                <span className="flex items-center gap-1 text-sm font-mono text-amber-200">
                  <Coins className="w-4 h-4" /> {fmtCoins(coins)}
                </span>
              )}
            </button>

            {/* Progression */}
            {(onProgression || onRanked || onAchievements || onLeaderboard) && (
              <nav className="rounded-2xl border border-white/10 bg-black/60 backdrop-blur-md p-2">
                <div className="px-3 pt-1.5 pb-1 text-[10px] font-mono uppercase tracking-[0.3em] text-zinc-500">Progression</div>
                {onProgression && <NavRow icon="🏆" label="Pass & défis" onClick={onProgression} badge={progressionAlert} badgeColor="bg-emerald-500 text-black" hover="group-hover:text-violet-300" />}
                {onRanked && <NavRow icon={tier.emoji} label="Classé" onClick={onRanked} right={<span style={{ color: tier.color }}>{tier.name}</span>} />}
                {onAchievements && <NavRow icon={<Trophy className="w-4 h-4 text-amber-400" />} label="Succès" onClick={onAchievements} right={achCount != null ? `${achCount}/${ACHIEVEMENTS.length}` : undefined} hover="group-hover:text-amber-300" />}
                {onLeaderboard && <NavRow icon={<Medal className="w-4 h-4 text-amber-400" />} label="Classement" onClick={onLeaderboard} hover="group-hover:text-amber-300" />}
              </nav>
            )}

            {/* Social */}
            {(onFriends || onClans) && (
              <nav className="rounded-2xl border border-white/10 bg-black/60 backdrop-blur-md p-2">
                <div className="px-3 pt-1.5 pb-1 text-[10px] font-mono uppercase tracking-[0.3em] text-zinc-500">Social</div>
                {onFriends && (
                  <NavRow
                    icon={<Users className="w-4 h-4 text-emerald-400" />}
                    label="Amis"
                    onClick={onFriends}
                    right={friendsOnline != null && friendsOnline > 0 ? <span className="text-emerald-400">● {friendsOnline} en ligne</span> : undefined}
                    badge={friendsAlert}
                    hover="group-hover:text-emerald-300"
                  />
                )}
                {onClans && <NavRow icon="🛡️" label="Clans" onClick={onClans} right={clanTag ? <span data-no-i18n className="text-indigo-300">[{clanTag}]</span> : undefined} hover="group-hover:text-indigo-300" />}
              </nav>
            )}

            {/* Collection */}
            {(onGallery || onBestiary || onMusic || onRedeem) && (
              <nav className="rounded-2xl border border-white/10 bg-black/60 backdrop-blur-md p-2">
                <div className="px-3 pt-1.5 pb-1 text-[10px] font-mono uppercase tracking-[0.3em] text-zinc-500">Collection</div>
                <div className="grid grid-cols-2 gap-1 p-1">
                  {[
                    onBestiary && { icon: '📖', label: 'Bestiaire', fn: onBestiary },
                    onGallery && { icon: '🖼️', label: 'Galerie', fn: onGallery },
                    onMusic && { icon: '🎵', label: 'Musiques', fn: onMusic },
                    onRedeem && { icon: '🎟️', label: 'Code cadeau', fn: onRedeem },
                  ]
                    .filter((x): x is { icon: string; label: string; fn: () => void } => !!x)
                    .map((x) => (
                      <button key={x.label} onClick={x.fn} className="flex items-center gap-2 px-2.5 py-2.5 rounded-lg bg-white/[0.03] hover:bg-white/[0.08] border border-white/5 hover:border-white/20 text-[12px] text-zinc-200 transition-colors">
                        <span className="text-base">{x.icon}</span>
                        <span>{x.label}</span>
                      </button>
                    ))}
                </div>
              </nav>
            )}

            {/* Daily line + help */}
            <div className="rounded-2xl border border-red-900/40 bg-red-950/20 backdrop-blur-md p-4">
              <p className="text-[13px] font-serif italic text-red-200/85 leading-relaxed">« {DAILY_LINES[Math.floor(Date.now() / 86400000) % DAILY_LINES.length]} »</p>
              <a href="/comment-jouer/" className="inline-block mt-2 text-[11px] font-mono text-red-300 hover:text-red-200 underline underline-offset-2">
                📖 Comment jouer : touches, chapitres, monstres et astuces
              </a>
              {controlSettings.micEnabled && <p className="mt-2 text-[11px] text-zinc-400">🎙 Autorisez le micro : le Patient Zéro entendra votre voix. Ne parlez pas.</p>}
              <div className="mt-2 empty:hidden">
                <InstallButton />
              </div>
            </div>
          </aside>
        </main>

        {/* ── Footer: controls ── */}
        <footer className="w-full max-w-6xl mx-auto mt-auto pt-3 border-t border-white/5 [@media(max-height:520px)]:hidden">
          {touch ? (
            <div className="flex flex-wrap justify-center gap-x-5 gap-y-1.5 text-[11px] font-mono text-zinc-500">
              <span>📱 Tiens ton téléphone en paysage : le jeu passe en plein écran.</span>
              <span>
                <b className="text-zinc-300">Pouce gauche</b> se déplacer
              </span>
              <span>
                <b className="text-zinc-300">Glisser à droite</b> regarder
              </span>
              <span>
                <b className="text-zinc-300">✋</b> agir
              </span>
            </div>
          ) : (
            <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 text-[11px] text-zinc-500">
              {[
                ['ZQSD', 'Se déplacer'],
                ['Souris', 'Regarder'],
                ['E', 'Interagir'],
                ['F', 'Lampe'],
                ['Shift', 'Courir'],
                ['C', 'S\'accroupir'],
                ['Tab', 'Inventaire'],
                ['P', 'Mode photo'],
              ].map(([k, v]) => (
                <span key={k} className="flex items-center gap-1.5">
                  <kbd data-no-i18n className="min-w-[24px] px-1.5 py-0.5 rounded-md border border-white/15 border-b-2 bg-zinc-900/80 text-zinc-200 font-mono text-[10px] text-center">
                    {k}
                  </kbd>
                  <span>{v}</span>
                </span>
              ))}
            </div>
          )}
        </footer>
      </div>

      {/* ── Settings window ── */}
      {showSettings && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={() => setShowSettings(false)}>
          <div className="relative w-full max-w-md rounded-2xl border border-white/10 bg-zinc-950 p-5 sm:p-6 shadow-[0_0_60px_rgba(220,38,38,0.15)]" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setShowSettings(false)} className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-100 hover:bg-white/5" aria-label="Fermer">
              <X className="w-5 h-5" />
            </button>
            <h2 className="flex items-center gap-2 text-sm font-mono uppercase tracking-[0.25em] text-zinc-100 mb-5">
              <Sliders className="w-4 h-4 text-red-500" /> Options & Son
            </h2>

            <div className="space-y-4 text-[13px] text-zinc-300">
              <div>
                <div className="flex justify-between mb-1.5">
                  <span>Volume Principal</span>
                  <span className="font-mono text-zinc-400">{Math.round(audioSettings.masterVolume * 100)}%</span>
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
                  className="w-full accent-red-600 h-1.5 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between mb-1.5">
                  <span>Sensibilité de la Souris</span>
                  <span className="font-mono text-zinc-400">{controlSettings.mouseSensitivity.toFixed(1)}x</span>
                </div>
                <input
                  type="range"
                  min="0.2"
                  max="3.0"
                  step="0.1"
                  value={controlSettings.mouseSensitivity}
                  onChange={(e) => onUpdateControls({ mouseSensitivity: parseFloat(e.target.value) })}
                  className="w-full accent-red-600 h-1.5 cursor-pointer"
                />
              </div>

              <div className="rounded-xl border border-white/5 divide-y divide-white/5">
                {(
                  [
                    ['invertY', 'Inverser l\'Axe Vertical (Y)', null],
                    ['micEnabled', 'Micro : le monstre entend votre voix', 'Le navigateur vous demandera l\'autorisation'],
                    ['shadowsEnabled', 'Ombres Dynamiques (Lampe)', null],
                    ['performanceMode', 'Mode Performance 60+ FPS', 'Recommandé pour PC portables'],
                  ] as const
                ).map(([key, label, sub]) => {
                  const on = !!controlSettings[key];
                  return (
                    <button key={key} onClick={() => onUpdateControls({ [key]: !on } as Partial<ControlSettings>)} className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-white/[0.03]">
                      <span>
                        <span className="block">{label}</span>
                        {sub && <span className="block text-[11px] text-zinc-500">{sub}</span>}
                      </span>
                      <span className={`relative shrink-0 w-10 h-6 rounded-full transition-colors ${on ? 'bg-red-600' : 'bg-zinc-700'}`}>
                        <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              onClick={() => setShowSettings(false)}
              className="w-full mt-5 py-3 rounded-xl bg-red-700 hover:bg-red-600 text-white font-mono text-xs uppercase tracking-widest font-bold transition-colors"
            >
              Enregistrer
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

