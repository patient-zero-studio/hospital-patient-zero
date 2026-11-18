/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';

import { AudioSettings, Chapter, ControlSettings, GameEnding, GameItem } from './types';

/** Chapters playable online (3 stays solo: the endless maze). */
const toMpChapter = (c: unknown): 1 | 2 | 4 | 5 | 6 => (c === 2 || c === 4 || c === 5 || c === 6 ? c : 1);
import { sound } from './audio/SoundSystem';
import { CampaignCarry, GameEngine, HudSnapshot } from './game/Engine';
import { CampaignCard } from './components/CampaignCard';
import { Difficulty, difficultyInfo } from './game/Difficulty';
import { getScreamerFace } from './components/screamerFace';
import { MultiplayerPanel, LobbyState, MatchSettings } from './components/MultiplayerPanel';
import { VersusResultModal } from './components/VersusResultModal';
import { CustomizeMenu } from './components/CustomizeMenu';
import { Appearance, DEFAULT_APPEARANCE } from './appearance';
import { api, Boost, BoostKind, FriendsView, Session, WalletView } from './net/api';
import { LevelUpToast } from './components/LevelUpToast';
import { WakeScreen } from './components/WakeScreen';
import { ProgressionMenu, progressionAlerts } from './components/ProgressionMenu';
import { TUTO_STEPS, TutorialOverlay, markTutorialDone, tutorialDone } from './components/Tutorial';
import { levelReward } from './levels';
import { FriendsPanel, InviteToast } from './components/FriendsPanel';
import { RedeemCode } from './components/RedeemCode';
import { ClansPanel } from './components/ClansPanel';
import { MusicMenu } from './components/MusicMenu';
import { GalleryMenu } from './components/GalleryMenu';
import { endingKey } from './gallery';
import { tierOf } from './ranked';
import { RankedMenu } from './components/RankedMenu';
import { CHAT_PRESETS } from './net/NetClient';
import { PlayerProfile } from './components/PlayerProfile';
import { ShopMenu } from './components/ShopMenu';
import { HoboShop } from './components/HoboShop';
import { IS_TOUCH, RotateHint, TouchControls, enterMobileFullscreen } from './components/TouchControls';
import type { BoxId, SupplyKind } from './economy';
import type { StatKey } from './achievements';
import { Season, SeasonSetting, getActiveSeason, onSeasonChange, setActiveSeason } from './seasons';
import { challengeMet, dailyChallenge, fmtTime } from './challenges';
import { LeaderboardMenu } from './components/Leaderboard';
import { IntroOverlay } from './components/IntroOverlay';
import { ExperimentFilm, primeFilmVoices } from './components/ExperimentFilm';
import { MoreauTape } from './components/MoreauTape';
import { AchievementToast, AchievementsMenu } from './components/Achievements';
import { NetClient, LobbyEvent } from './net/NetClient';
import type { GameLink, GameMsg } from './net/protocol';

import { HUD } from './components/HUD';
import { InventoryModal } from './components/InventoryModal';
import { PauseSettingsModal } from './components/PauseSettingsModal';
import { GameOverModal } from './components/GameOverModal';
import { VictoryModal } from './components/VictoryModal';
import { StartScreen } from './components/StartScreen';

const SETTINGS_KEY = 'hospital-pz-settings-v2';

const DEFAULT_AUDIO: AudioSettings = { masterVolume: 0.85, ambienceVolume: 0.75, sfxVolume: 0.85, musicVolume: 0.8 };
const DEFAULT_CONTROLS: ControlSettings = {
  mouseSensitivity: 1.0,
  invertY: false,
  headBob: true,
  shadowsEnabled: true,
  performanceMode: false,
  micEnabled: true,
  micSensitivity: 1,
  voiceChat: true,
};

const loadSettings = (): { audio: AudioSettings; controls: ControlSettings; difficulty: Difficulty } => {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const d = Number(parsed.difficulty);
      return {
        audio: { ...DEFAULT_AUDIO, ...parsed.audio },
        controls: { ...DEFAULT_CONTROLS, ...parsed.controls },
        difficulty: (d >= 1 && d <= 5 ? d : 2) as Difficulty,
      };
    }
  } catch {
    /* storage unavailable */
  }
  // Phones: lighter graphics by default (the microphone needs https, so it's off)
  const controls = IS_TOUCH ? { ...DEFAULT_CONTROLS, performanceMode: true, shadowsEnabled: false, micEnabled: false } : DEFAULT_CONTROLS;
  return { audio: DEFAULT_AUDIO, controls, difficulty: 2 };
};

const EMPTY_HUD: HudSnapshot = {
  battery: 100,
  flashlightOn: true,
  stamina: 100,
  crouching: false,
  sprinting: false,
  hidden: false,
  hint: null,
  objective: '',
  toast: null,
  monsterState: 'PATROL',
  monsterDistance: 99,
  fear: 0,
  fearFlashText: null,
  dying: false,
  freeLook: false,
  stress: 0,
  micLevel: 0,
  micStatus: 'off',
  micHeard: false,
  hideKind: null,
  screamer: false,
  flipCharge: null,
  flipMsg: null,
  flipBest: 0,
  items: [],
  maxSlots: 5,
  partnerName: null,
  partnerDead: false,
  spectating: false,
  watching: false,
  dancing: false,
  versusRole: null,
  race: false,
  canBlind: false,
  blindLeft: 0,
  runCoins: 0,
  runTreats: 0,
  presents: null,
  survival: null,
  speedrun: null,
  treatEmoji: null,
  selectedSlot: 0,
  voice: null,
  intro: false,
  introText: null,
  timeLeft: null,
};

export default function App() {
  const mountRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<GameEngine | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isInventoryOpen, setIsInventoryOpen] = useState(false);
  const [isGameOver, setIsGameOver] = useState(false);
  const [victory, setVictory] = useState<{ ending: GameEnding; title: string; narrative: string } | null>(null);
  /** Campaign: the black screen between two chapters */
  const [campaignCard, setCampaignCard] = useState<{ done: string; next: Chapter; time: number; items: number } | null>(null);
  const [hud, setHud] = useState<HudSnapshot>(EMPTY_HUD);
  const hudRef = useRef(hud);
  hudRef.current = hud;
  const [inventoryVersion, setInventoryVersion] = useState(0);

  const initial = useRef(loadSettings());
  const [audioSettings, setAudioSettings] = useState<AudioSettings>(initial.current.audio);
  const [controlSettings, setControlSettings] = useState<ControlSettings>(initial.current.controls);
  const [difficulty, setDifficulty] = useState<Difficulty>(initial.current.difficulty);
  const [chapter, setChapter] = useState<Chapter>(() => {
    try {
      const v = localStorage.getItem('pz-chapter');
      return v === '6' ? 6 : v === '5' ? 5 : v === '4' ? 4 : v === '3' ? 3 : v === '2' ? 2 : 1;
    } catch {
      return 1;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('pz-chapter', String(chapter));
    } catch {
      /* ignore */
    }
  }, [chapter]);

  // --- Multiplayer ---------------------------------------------------------
  const [session, setSession] = useState<Session | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [mpOpen, setMpOpen] = useState(false);
  const [lobby, setLobby] = useState<LobbyState>({ status: 'idle', difficulty: initial.current.difficulty, mode: 'coop', monster: 'host', chapter: 1 });
  /** Set while an online game is running. */
  const [online, setOnline] = useState<{
    role: 'host' | 'guest';
    partner: string;
    mode: 'coop' | 'versus' | 'race';
    versusRole: 'monster' | 'survivor' | null;
    /** 👀 only watching a friend's game */
    watching?: boolean;
  } | null>(null);
  /** Versus result screen. */
  const [versusResult, setVersusResult] = useState<{ won: boolean; reason: string } | null>(null);
  /** Account customisation (human + creature colours). */
  const [look, setLook] = useState<Appearance>(DEFAULT_APPEARANCE);
  /** null = closed; 'welcome' right after the account was created. */
  const [customize, setCustomize] = useState<null | 'edit' | 'welcome'>(null);
  /** Coins, owned skins, today's shop. */
  const [wallet, setWallet] = useState<WalletView | null>(null);
  // 🎄 / 🎃 Event on (decorations, menu, event shop): the server decides, local date until it answers
  const [season, setSeason] = useState<Season | null>(getActiveSeason());
  useEffect(
    () =>
      onSeasonChange((s) => {
        setSeason(s);
        engineRef.current?.refreshSeasonDecor();
      }),
    []
  );
  const [boost, setBoost] = useState<Boost | null>(null);
  // The free host sleeps after 15 min: if the server takes a while, show the "waking up" screen
  const [wakingSince, setWakingSince] = useState<number | null>(null);
  useEffect(() => {
    let done = false;
    const t0 = Date.now();
    const slow = setTimeout(() => {
      if (!done && navigator.onLine !== false) setWakingSince(t0);
    }, 2000);
    const attempt = async () => {
      const s = await api.status();
      if (s) {
        done = true;
        setWakingSince(null);
        setActiveSeason(s.season);
        setBoost(s.boost);
        return;
      }
      // Still asleep (or no network): retry for up to 4 minutes, then let solo play go on
      if (navigator.onLine === false || Date.now() - t0 > 240000) {
        done = true;
        setWakingSince(null);
        return;
      }
      setTimeout(attempt, 3000);
    };
    attempt();
    return () => {
      done = true;
      clearTimeout(slow);
    };
  }, []);
  useEffect(() => {
    if (wallet && wallet.season !== undefined) setActiveSeason(wallet.season ?? null);
    if (wallet && wallet.boost !== undefined) setBoost(wallet.boost ?? null);
  }, [wallet]);
  // 🎉 Level up: compare with the last level seen
  const lastLevel = useRef<number | null>(null);
  const [levelUp, setLevelUp] = useState<{ level: number; coins: number } | null>(null);
  useEffect(() => {
    const lv = wallet?.level?.level;
    if (lv == null) return;
    if (lastLevel.current != null && lv > lastLevel.current) {
      let coins = 0;
      for (let l = lastLevel.current + 1; l <= lv; l++) coins += levelReward(l);
      setLevelUp({ level: lv, coins });
    }
    lastLevel.current = lv;
  }, [wallet]);
  const [shopOpen, setShopOpen] = useState(false);
  /** Talking to the hobo in the warehouse */
  const [hoboOpen, setHoboOpen] = useState(false);
  /** VHS film of the Patient Zero experiment */
  const [filmOpen, setFilmOpen] = useState(false);
  const [filmId, setFilmId] = useState('vhs-experience');
  /** '+25 pièces' after getting out */
  const [rewardMsg, setRewardMsg] = useState<string | null>(null);
  const sessionRef = useRef<Session | null>(null);
  /** Anxious music on the main menu (can be switched off). */
  const [menuMusic, setMenuMusic] = useState(() => {
    try {
      return localStorage.getItem('pz-menu-music') !== 'off';
    } catch {
      return true;
    }
  });
  const netRef = useRef<NetClient | null>(null);
  const lobbyRef = useRef(lobby);
  lobbyRef.current = lobby;
  const onlineRef = useRef(online);
  onlineRef.current = online;

  // Latest UI state, readable from engine callbacks / listeners without stale closures
  const ui = useRef({ isPlaying, isPaused, isInventoryOpen, isGameOver, victory: !!victory, pausedAt: 0, overlay: false });
  ui.current = { ...ui.current, isPlaying, isPaused, isInventoryOpen, isGameOver, victory: !!victory || !!versusResult || !!campaignCard, overlay: hoboOpen || shopOpen || filmOpen };

  // --- Engine lifecycle (created once) ---------------------------------
  useEffect(() => {
    if (!mountRef.current) return;
    sound.updateSettings(initial.current.audio);
    const engine = new GameEngine(
      mountRef.current,
      {
        onHud: setHud,
        onGameOver: () => {
          document.exitPointerLock?.();
          if (onlineRef.current?.watching) return stopWatchingRef.current('👀 La partie que tu regardais est terminée.');
          reportGalleryRef.current();
          // Campaign: a failed attempt still counts in the total time
          const cp = campaignRef.current;
          if (cp && !onlineRef.current) cp.time += engineRef.current?.runTime ?? 0;
          bankTreatsRef.current();
          if (engineRef.current?.survival) survivalScoreRef.current();
          else deathXpRef.current();
          setIsGameOver(true);
        },
        onVictory: (ending) => victoryRef.current(ending),
        onVersusEnd: (won, text) => {
          document.exitPointerLock?.();
          if (won) grantRewardRef.current(2);
          bankTreatsRef.current();
          setVersusResult({ won, reason: text });
        },
        onHobo: () => {
          document.exitPointerLock?.();
          setHoboOpen(true);
        },
        onAchievement: (id) => queueAchRef.current(id),
        onStat: (k, n) => queueAchRef.current(null, k, n),
        onPointerUnlock: () => {
          const u = ui.current;
          if (u.isPlaying && !u.isInventoryOpen && !u.isGameOver && !u.victory) {
            ui.current.pausedAt = performance.now();
            setIsPaused(true);
          }
        },
      },
      initial.current.controls
    );
    engineRef.current = engine;
    engine.touchMode = IS_TOUCH;
    // A fresh engine is never running: always show the menu so the UI matches it
    // (otherwise a hot-reload leaves the HUD on screen with dead controls).
    setIsPlaying(false);
    setIsPaused(false);
    setIsInventoryOpen(false);
    setIsGameOver(false);
    setVictory(null);
    setOnline(null);
    setVersusResult(null);
    hasStartedOnce.current = false;
    if (import.meta.env.DEV) (window as unknown as { __engine: GameEngine }).__engine = engine;
    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  // Pause the simulation whenever a menu is open
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !isPlaying) return;
    engine.setPaused(isPaused || isInventoryOpen || hoboOpen || shopOpen || filmOpen, isPaused);
  }, [isPaused, isInventoryOpen, isPlaying, hoboOpen, shopOpen, filmOpen]);

  // Persist settings
  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ audio: audioSettings, controls: controlSettings, difficulty }));
    } catch {
      /* ignore */
    }
  }, [audioSettings, controlSettings, difficulty]);

  const lock = () => engineRef.current?.requestLock();

  const resume = useCallback(() => {
    setIsPaused(false);
    setIsInventoryOpen(false);
    lock();
  }, []);

  const toggleInventory = useCallback(() => {
    const u = ui.current;
    if (u.isInventoryOpen) {
      setIsInventoryOpen(false);
      lock();
    } else {
      setInventoryVersion((v) => v + 1);
      setIsInventoryOpen(true);
      document.exitPointerLock?.();
    }
  }, []);

  // --- Keyboard ----------------------------------------------------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const u = ui.current;
      if (!u.isPlaying || u.isGameOver || u.victory) return;
      if (u.overlay) {
        if (e.code === 'Escape') {
          setHoboOpen(false);
          setShopOpen(false);
          lock();
        }
        return;
      }

      if (e.code === 'Tab') {
        e.preventDefault();
        if (!u.isPaused) toggleInventory();
        return;
      }
      if (e.code === 'Escape') {
        e.preventDefault();
        if (u.isInventoryOpen) {
          setIsInventoryOpen(false);
          lock();
        } else if (u.isPaused) {
          // Ignore the same Esc press that released the pointer lock
          if (performance.now() - u.pausedAt > 350) resume();
        } else {
          ui.current.pausedAt = performance.now();
          setIsPaused(true);
          document.exitPointerLock?.();
        }
        return;
      }
      if (e.code === 'KeyE' && !e.repeat && !u.isPaused && !u.isInventoryOpen) {
        engineRef.current?.interact();
      }
      // Hotbar 1-5 (e.code works on AZERTY too: the "&é"(-" keys)
      const slot = /^(?:Digit|Numpad)([1-5])$/.exec(e.code);
      if (slot && !e.repeat && !u.isPaused && !u.isInventoryOpen) {
        engineRef.current?.useSlot(Number(slot[1]) - 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [resume, toggleInventory]);

  // --- Game flow ---------------------------------------------------------
  // ---- Campaign: chapters 1 → 5 in one go -----------------------------------
  /** ch = chapter being played, time = total so far, carry = what you entered this chapter with */
  const campaignRef = useRef<{ ch: Chapter; diff: Difficulty; time: number; carry: CampaignCarry | null } | null>(null);

  const onVictory = (ending: GameEnding) => {
    document.exitPointerLock?.();
    if (onlineRef.current?.watching) return stopWatchingRef.current('👀 Ils s\'en sont sortis ! La partie est terminée.');
    reportGalleryRef.current(ending);
    const e = engineRef.current!;
    grantRewardRef.current(e.builtDifficulty ?? 2);
    bankTreatsRef.current();
    if (e.xmasNight) xmasRewardRef.current(e.runPresents);
    const cp = campaignRef.current;
    if (cp && !onlineRef.current) {
      cp.time += e.runTime;
      if (e.builtChapter < 5) {
        const next = (e.builtChapter + 1) as Chapter;
        cp.ch = next;
        cp.carry = e.campaignCarry();
        e.stop();
        setCampaignCard({ done: e.state.evaluateEnding(ending).title, next, time: cp.time, items: cp.carry.inv.length });
        return;
      }
      // The finale: the whole campaign is over
      campaignRef.current = null;
      submitCampaign(cp.diff, cp.time);
      setVictory(e.state.evaluateEnding(ending));
      return;
    }
    submitRunRef.current();
    setVictory(e.state.evaluateEnding(ending));
  };
  const victoryRef = useRef(onVictory);
  victoryRef.current = onVictory;

  const startCampaign = () => {
    xmasRef.current = false;
    survivalRef.current = false;
    engineRef.current?.setNet(null);
    if (engineRef.current) engineRef.current.levelSeed = null;
    campaignRef.current = { ch: 1, diff: difficulty, time: 0, carry: null };
    setCampaignCard(null);
    challengeOnRef.current = false;
    setChallengeOn(false);
    beginRun(true, difficulty, 1);
    hasStartedOnce.current = true;
  };

  const continueCampaign = () => {
    const cp = campaignRef.current;
    if (!cp) return;
    setCampaignCard(null);
    beginRun(true, cp.diff, cp.ch, () => engineRef.current?.applyCampaignCarry(cp.carry));
  };

  const submitCampaign = async (diff: number, time: number) => {
    const s = sessionRef.current;
    const parts = [`🏆 Campagne terminée en ${fmtTime(time)}`];
    setRunMsg(parts[0]);
    if (diff >= 2) queueAchRef.current('campaign_done');
    if (!s || diff < 2) return;
    try {
      await new Promise((r) => setTimeout(r, 600));
      const r = await api.submitRun(s.token, { chapter: 0, difficulty: diff, time, challenge: false });
      setWallet(r);
      if (r.record) parts.push(r.rank ? `Record perso ! ${r.rank}${r.rank === 1 ? 'er' : 'e'} du classement Campagne` : 'Record perso !');
      setRunMsg(parts.join('  ·  '));
    } catch {
      /* offline */
    }
  };

  const beginRun = (fresh: boolean, diff: Difficulty = difficulty, ch: Chapter = chapter, afterReset?: () => void) => {
    const engine = engineRef.current;
    if (!engine) return;
    if (IS_TOUCH) enterMobileFullscreen();
    // Music is for the menu only
    sound.stopMenuMusic(1.2);
    sound.init();
    sound.resume();
    sound.setPaused(false);
    getScreamerFace(); // pre-render now so the scare doesn't hitch
    engine.setDifficulty(diff);
    engine.chapter = ch;
    // 🎄 Christmas night is a separate mode of chapter 1
    const xmas = xmasRef.current && ch === 1 && !onlineRef.current;
    if (engine.xmasNight !== xmas) {
      engine.xmasNight = xmas;
      fresh = true;
    }
    // 🧟 Endless survival is another mode of chapter 1
    const surv = survivalRef.current && ch === 1 && !onlineRef.current;
    if (engine.survival !== surv) {
      engine.survival = surv;
      fresh = true;
    }
    // The daily challenge is a solo thing
    const wantChallenge = !onlineRef.current && challengeOnRef.current ? dailyChallenge().id : null;
    if (engine.challenge !== wantChallenge) fresh = true;
    engine.challenge = wantChallenge;
    setRunMsg(null);
    if (fresh || engine.builtDifficulty !== diff || engine.builtChapter !== ch) engine.reset();
    afterReset?.();
    engine.start();
    engine.maybeIntro();
    setRewardMsg(null);
    setIsGameOver(false);
    setVictory(null);
    setIsPaused(false);
    setIsInventoryOpen(false);
    setIsPlaying(true);
    lock();
  };

  const hasStartedOnce = useRef(false);
  const xmasRef = useRef(false);
  const survivalRef = useRef(false);
  const startSurvival = () => {
    survivalRef.current = true;
    xmasRef.current = false;
    campaignRef.current = null;
    engineRef.current?.setNet(null);
    if (engineRef.current) engineRef.current.levelSeed = null;
    beginRun(true, difficulty < 2 ? (2 as Difficulty) : difficulty, 1);
    hasStartedOnce.current = true;
  };
  const startXmasNight = () => {
    survivalRef.current = false;
    xmasRef.current = true;
    campaignRef.current = null;
    engineRef.current?.setNet(null);
    if (engineRef.current) engineRef.current.levelSeed = null;
    beginRun(true, difficulty < 2 ? (2 as Difficulty) : difficulty, 1);
    hasStartedOnce.current = true;
  };
  const handleStartGame = () => {
    xmasRef.current = false;
    survivalRef.current = false;
    campaignRef.current = null;
    engineRef.current?.setNet(null);
    if (engineRef.current) engineRef.current.levelSeed = null;
    // Locked chapter picked earlier: fall back to the last one that is open
    const open = [true, ch2Unlocked, ch3Unlocked, ch4Unlocked, ch5Unlocked, ch6Unlocked];
    let ch: Chapter = chapter;
    while (ch > 1 && !open[ch - 1]) ch = (ch - 1) as Chapter;
    beginRun(hasStartedOnce.current, difficulty, ch);
    hasStartedOnce.current = true;
  };

  // ---- 🎓 Tutorial: Exploration, chapter 1, steps checked from the game state ----
  const [tutorial, setTutorial] = useState<{ step: number; start: { x: number; z: number } | null; items: number; lamp?: boolean } | null>(null);
  const [tutoSeen, setTutoSeen] = useState(tutorialDone());
  const startTutorial = () => {
    xmasRef.current = false;
    survivalRef.current = false;
    campaignRef.current = null;
    engineRef.current?.setNet(null);
    if (engineRef.current) engineRef.current.levelSeed = null;
    setDifficulty(1 as Difficulty);
    setChapter(1);
    setTutorial({ step: 0, start: null, items: 0 });
    beginRun(hasStartedOnce.current, 1 as Difficulty, 1);
    hasStartedOnce.current = true;
  };
  const finishTutorial = () => {
    markTutorialDone();
    setTutoSeen(true);
    const s = sessionRef.current;
    if (s) api.reportAch(s.token, ['tutorial'], {}).then((r) => (setWallet(r), showNewAch(r.newAch))).catch(() => {});
  };
  useEffect(() => {
    if (!tutorial || tutorial.step >= TUTO_STEPS.length) return;
    const t = setInterval(() => {
      const e = engineRef.current;
      const h = hudRef.current;
      if (!e || h.intro) return;
      setTutorial((tu) => {
        if (!tu) return tu;
        const p = e.player.position;
        if (!tu.start) return { ...tu, start: { x: p.x, z: p.z }, items: h.items.length };
        // Lamp step: the lamp may already be on, so wait for a press of F
        if (tu.step === 1 && tu.lamp === undefined) return { ...tu, lamp: h.flashlightOn };
        const ok = [
          () => Math.hypot(p.x - tu.start!.x, p.z - tu.start!.z) > 4,
          () => h.flashlightOn !== tu.lamp,
          () => h.crouching,
          () => e.tut.interacts > 0,
          () => h.hidden,
          () => e.tut.cans > 0,
        ][tu.step];
        if (!ok?.()) return tu;
        sound.playItemPickup();
        const step = tu.step + 1;
        if (step >= TUTO_STEPS.length) finishTutorial();
        return { ...tu, step };
      });
    }, 300);
    return () => clearInterval(t);
  }, [tutorial?.step]);
  // The "well done" card goes away by itself
  useEffect(() => {
    if (tutorial && tutorial.step >= TUTO_STEPS.length) {
      const t = setTimeout(() => setTutorial(null), 12000);
      return () => clearTimeout(t);
    }
  }, [tutorial?.step]);
  // Back to the menu: the tutorial stops
  useEffect(() => {
    if (!isPlaying) setTutorial(null);
  }, [isPlaying]);

  const handleRestart = () => {
    const on = onlineRef.current;
    if (on) {
      // Online: only the host restarts, for both players
      if (on.role === 'host') netRef.current?.start();
      return;
    }
    // Campaign: back to the start of the chapter, with what you had then
    const cp = campaignRef.current;
    if (cp) {
      beginRun(true, cp.diff, cp.ch, () => engineRef.current?.applyCampaignCarry(cp.carry));
      return;
    }
    beginRun(true);
  };

  // The hospital ambience (drone, heartbeat) only plays during a run
  useEffect(() => {
    sound.setInGame(isPlaying);
  }, [isPlaying]);

  // ---- Menu music ---------------------------------------------------------
  useEffect(() => {
    try {
      localStorage.setItem('pz-menu-music', menuMusic ? 'on' : 'off');
    } catch {
      /* ignore */
    }
    if (isPlaying || !menuMusic) {
      sound.stopMenuMusic(isPlaying ? 1.5 : 0.6);
      return;
    }
    const start = () => {
      // Never during a game (the click may be the one that starts it)
      if (ui.current.isPlaying) return;
      sound.init();
      sound.resume();
      sound.startMenuMusic();
    };
    if (sound.audioUnlocked) {
      start();
      return;
    }
    // Browsers only allow sound after the first click / key press
    window.addEventListener('pointerdown', start, { once: true });
    window.addEventListener('keydown', start, { once: true });
    return () => {
      window.removeEventListener('pointerdown', start);
      window.removeEventListener('keydown', start);
    };
  }, [isPlaying, menuMusic]);

  // ---- Coins & shop -----------------------------------------------------
  sessionRef.current = session;
  const refreshWallet = useCallback(async () => {
    const s = sessionRef.current;
    if (!s) {
      setWallet(null);
      return;
    }
    try {
      setWallet(await api.getWallet(s.token));
    } catch {
      /* offline */
    }
  }, []);
  useEffect(() => {
    refreshWallet();
  }, [session, refreshWallet]);

  /** Coins for getting out (none in Exploration). */
  const grantReward = async (diff: number) => {
    const s = sessionRef.current;
    if (!s) {
      setRewardMsg(diff <= 1 ? 'Mode Exploration : pas de pièces.' : 'Connectez-vous (Multijoueur) pour gagner des pièces !');
      return;
    }
    try {
      // Exploration gives no coins, but getting out unlocks the shop
      const wasLocked = wallet ? !wallet.shopUnlocked : false;
      const r = await api.reward(s.token, diff, diff <= 1 ? 0 : (engineRef.current?.state.runCoins ?? 0), engineRef.current?.builtChapter ?? 1);
      const rg = r.rankGain;
      const rt = rg ? tierOf(rg.points) : null;
      const rank = rg && rt ? `  ·  ${rt.emoji} +${rg.gain} pts${rg.promoted ? ` — PROMU ${rt.name.toUpperCase()} !` : ` (${rt.name} ${rg.points})`}${rg.passXp ? `  ·  🎁 +${rg.passXp} XP de pass classé` : ''}` : '';
      setWallet(r);
      if (wasLocked && r.shopUnlocked) setRewardMsg('🛒 BOUTIQUE DÉBLOQUÉE ! Skins, boîtes mystère et cadeau du jour t\'attendent au menu.');
      else {
        const xp = (r.xp ? `  ·  ⭐ +${r.xp} XP` : '') + rank;
        if (diff <= 1) setRewardMsg(`Mode Exploration : pas de pièces.${xp}`);
        else if (r.admin) setRewardMsg(`🪙 Admin : pièces infinies${xp}`);
        else if (r.gained > 0) setRewardMsg(`🪙 +${r.gained} pièces — total ${r.wallet.coins}${xp}`);
      }
    } catch {
      /* offline */
    }
  };
  /** Event treats picked up this run go to the account (win or lose). */
  const bankTreats = async () => {
    const s = sessionRef.current;
    const e = engineRef.current;
    const n = e?.runTreats ?? 0;
    const chests = e?.runChests ?? 0;
    if (!e || (n <= 0 && chests <= 0) || !s) return;
    e.runTreats = 0;
    e.runChests = 0;
    try {
      await new Promise((r) => setTimeout(r, 900)); // after the coin reward
      setWallet(await api.addTreats(s.token, n, chests));
    } catch {
      /* offline */
    }
  };
  /** A lost run still gives a little XP. */
  const deathXp = async () => {
    const s = sessionRef.current;
    if (!s || onlineRef.current?.mode === 'versus') return;
    try {
      await new Promise((r) => setTimeout(r, 1500));
      setWallet(await api.xpDeath(s.token, engineRef.current?.builtDifficulty ?? 1));
    } catch {
      /* offline */
    }
  };
  const deathXpRef = useRef(deathXp);
  /** 🧟 Survival: time + wave go to the survival leaderboard (and coins / XP) */
  const survivalScore = async () => {
    const s = sessionRef.current;
    const e = engineRef.current;
    if (!e) return;
    const time = e.runTime;
    const wave = e.survivalWave;
    const t = `🧟 ${fmtTime(time)} · vague ${wave}`;
    if (!s) return setRunMsg(t);
    try {
      const r = await api.submitSurvival(s.token, time, wave);
      setWallet(r);
      setRewardMsg(`${t}${r.coins ? `  ·  🪙 +${r.coins}` : ''}${r.xp ? `  ·  ⭐ +${r.xp} XP` : ''}${r.record ? `  ·  🏆 Record perso${r.rank ? ` (${r.rank}${r.rank === 1 ? 'er' : 'e'})` : ''}` : ''}`);
    } catch {
      setRewardMsg(t);
    }
  };
  const survivalScoreRef = useRef(survivalScore);
  survivalScoreRef.current = survivalScore;
  deathXpRef.current = deathXp;
  /** 🎄 Christmas night: coins per present, the unique skin for all 12. */
  const xmasReward = async (presents: number) => {
    const s = sessionRef.current;
    if (!s) return;
    try {
      await new Promise((r) => setTimeout(r, 1600));
      const r = await api.xmasReward(s.token, presents);
      setWallet(r);
      setRunMsg(r.message);
    } catch {
      /* offline */
    }
  };
  const xmasRewardRef = useRef(xmasReward);
  xmasRewardRef.current = xmasReward;
  const bankTreatsRef = useRef(bankTreats);
  bankTreatsRef.current = bankTreats;
  const grantRewardRef = useRef(grantReward);
  grantRewardRef.current = grantReward;

  // ---- Leaderboard & daily challenge ----------------------------------------
  const [boardOpen, setBoardOpen] = useState(false);
  const [challengeOn, setChallengeOn] = useState(false);
  const challengeOnRef = useRef(challengeOn);
  challengeOnRef.current = challengeOn;
  /** "Nouveau record ! 3e" / "Défi réussi +150" after an escape */
  const [runMsg, setRunMsg] = useState<string | null>(null);
  const todayChallenge = dailyChallenge();
  const submitRun = async () => {
    const s = sessionRef.current;
    const e = engineRef.current;
    if (!s || !e) return;
    const run = { chapter: e.builtChapter, difficulty: e.builtDifficulty, time: e.runTime, challenge: !!e.challenge };
    if (run.difficulty < 2) return;
    try {
      // Let the coin reward go first (both answer with the wallet)
      await new Promise((r) => setTimeout(r, 600));
      const r = await api.submitRun(s.token, run);
      setWallet(r);
      const parts: string[] = [`⏱ ${fmtTime(run.time)}`];
      if (r.record) parts.push(r.rank ? `🏆 Record perso ! ${r.rank}${r.rank === 1 ? 'er' : 'e'} du classement` : '🏆 Record perso !');
      if (r.challengeWon) parts.push(`🎯 Défi du jour réussi : +${r.challengeWon} pièces`);
      else if (run.challenge) {
        const c = todayChallenge;
        if (r.challenge?.done) parts.push('🎯 Défi déjà réussi aujourd\'hui');
        else if (!challengeMet(c, run)) parts.push(`🎯 Défi raté${c.timeLimit ? ` (plus de ${fmtTime(c.timeLimit)})` : c.chapter ? ' (chapitre 2 obligatoire)' : ''}`);
      }
      setRunMsg(parts.join('  ·  '));
    } catch {
      /* offline */
    }
  };
  const submitRunRef = useRef(submitRun);
  submitRunRef.current = submitRun;

  // ---- Achievements -----------------------------------------------------
  const [achOpen, setAchOpen] = useState(false);
  /** newly unlocked ids waiting to be shown */
  const [achPopups, setAchPopups] = useState<string[]>([]);
  const walletRef = useRef(wallet);
  walletRef.current = wallet;
  const achPending = useRef<{ unlock: Set<string>; stats: Partial<Record<StatKey, number>>; timer: number | null }>({
    unlock: new Set(),
    stats: {},
    timer: null,
  });
  const showNewAch = (ids?: string[]) => {
    if (ids?.length) setAchPopups((q) => [...q, ...ids]);
  };
  const flushAch = async () => {
    const p = achPending.current;
    p.timer = null;
    const s = sessionRef.current;
    if (!s || (!p.unlock.size && !Object.keys(p.stats).length)) return;
    const unlock = [...p.unlock];
    const stats = p.stats;
    p.unlock = new Set();
    p.stats = {};
    try {
      const r = await api.reportAch(s.token, unlock, stats);
      setWallet(r);
      showNewAch(r.newAch);
    } catch {
      /* offline: lost, it will be earned again */
    }
  };
  /** Engine events, batched (one request every ~1.5 s at most). */
  const queueAch = (id: string | null, key?: StatKey, n = 1) => {
    if (!sessionRef.current) return;
    const p = achPending.current;
    if (id) {
      if (walletRef.current?.ach?.done[id]) return; // already have it
      p.unlock.add(id);
    }
    if (key) p.stats[key] = (p.stats[key] ?? 0) + n;
    if (p.timer == null) p.timer = window.setTimeout(flushAch, 1500);
  };
  const queueAchRef = useRef(queueAch);
  queueAchRef.current = queueAch;
  const nextAchPopup = useCallback(() => setAchPopups((q) => q.slice(1)), []);
  /** Chapter 2 opens once you got out of the hospital (admins: always). */
  const ch2Unlocked = !!wallet?.ach?.done.first_escape || !!wallet?.admin;
  /** Chapter 3 opens once you got out of the sewers. */
  const ch3Unlocked = !!wallet?.ach?.done.ch2_escape || !!wallet?.admin;
  /** Chapter 4 opens once you got out of the maze. */
  const ch4Unlocked = !!wallet?.ach?.done.ch3_escape || !!wallet?.admin;
  /** Chapter 5 (finale) opens once you were rescued from the forest. */
  const ch5Unlocked = !!wallet?.ach?.done.ch4_escape || !!wallet?.admin;
  const ch6Unlocked = !!wallet?.ach?.done.ch5_end || !!wallet?.admin;

  const tokenOrThrow = () => {
    const s = sessionRef.current;
    if (!s) throw new Error('Connectez-vous d\'abord.');
    return s.token;
  };
  const buyCosmetic = async (id: string) => setWallet(await api.buyCosmetic(tokenOrThrow(), id));
  const openBox = async (box: BoxId) => {
    const r = await api.openBox(tokenOrThrow(), box);
    setWallet(r);
    showNewAch(r.newAch);
    return r.result;
  };
  const claimDaily = async () => {
    const r = await api.claimDaily(tokenOrThrow());
    setWallet(r);
    showNewAch(r.newAch);
    return r.result;
  };
  const claimAdvent = async (day: number) => {
    const r = await api.claimAdvent(tokenOrThrow(), day);
    setWallet(r);
    showNewAch(r.newAch);
    return r.result;
  };
  const openEventBox = async () => {
    const r = await api.openEventBox(tokenOrThrow());
    setWallet(r);
    showNewAch(r.newAch);
    return r.result;
  };
  // ---- Friends -----------------------------------------------------------
  const [friendsOpen, setFriendsOpen] = useState(false);
  /** 👤 public profile being viewed */
  const [profileOf, setProfileOf] = useState<string | null>(null);
  const [friends, setFriends] = useState<FriendsView | null>(null);
  const refreshFriends = useCallback(async () => {
    const s = sessionRef.current;
    if (!s) return setFriends(null);
    try {
      setFriends(await api.friends(s.token));
    } catch {
      /* offline */
    }
  }, []);
  const refreshFriendsRef = useRef(refreshFriends);
  refreshFriendsRef.current = refreshFriends;
  const [redeemOpen, setRedeemOpen] = useState(false);
  // 🎭 The partner's look, for the lobby stage
  const [partnerLook, setPartnerLook] = useState<Appearance | null>(null);
  useEffect(() => {
    const name = lobby.partner;
    const s = sessionRef.current;
    setPartnerLook(null);
    if (!name || !s) return;
    let alive = true;
    api
      .player(s.token, name)
      .then((pr) => alive && setPartnerLook(pr.look))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [lobby.partner]);
  const [clansOpen, setClansOpen] = useState(false);
  const [musicOpen, setMusicOpen] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [rankedOpen, setRankedOpen] = useState(false);
  /** 🖼️ Documents picked up (and the ending reached) go to the gallery */
  const reportGallery = (ending?: GameEnding) => {
    const s = sessionRef.current;
    const e = engineRef.current;
    if (!s || !e || onlineRef.current?.watching) return;
    const docs = e.state.notesCollected.map((n) => n.id);
    const key = ending ? endingKey(ending, e.state.notesCollected.length) : undefined;
    if (!docs.length && !key) return;
    api
      .gallery(s.token, docs, key)
      .then((g) => setWallet((w) => (w ? { ...w, gallery: g.gallery } : w)))
      .catch(() => {});
  };
  const reportGalleryRef = useRef(reportGallery);
  reportGalleryRef.current = reportGallery;
  // ⏱️ Personal bests for the speedrun chrono
  useEffect(() => {
    if (engineRef.current && wallet?.bests) engineRef.current.speedBests = wallet.bests;
  }, [wallet]);
  // Polled while in the menus: who is online, requests, invitations
  useEffect(() => {
    if (!session || isPlaying) return;
    refreshFriends();
    const t = setInterval(refreshFriends, friendsOpen || mpOpen ? 5000 : 10000);
    return () => clearInterval(t);
  }, [session, isPlaying, friendsOpen, mpOpen, lobby.status, refreshFriends]);
  const friendAct = async (fn: (t: string) => Promise<FriendsView>) => {
    const r = await fn(tokenOrThrow());
    setFriends(r);
    return r.message;
  };
  const acceptInvite = (code: string) => {
    const s = sessionRef.current;
    if (s) api.inviteDismiss(s.token, code).then(setFriends).catch(() => {});
    setFriendsOpen(false);
    setShopOpen(false);
    setMpOpen(true);
    joinRoom(code);
  };
  const declineInvite = (code: string) => {
    const s = sessionRef.current;
    setFriends((f) => (f ? { ...f, invites: f.invites.filter((i) => i.code !== code) } : f));
    if (s) api.inviteDismiss(s.token, code).then(setFriends).catch(() => {});
  };

  const [progOpen, setProgOpen] = useState(false);
  // 🔔 Push notifications (friend invites, gifts, events…), even with the game closed
  const [pushState, setPushState] = useState<'on' | 'off' | 'unsupported' | 'denied'>('off');
  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return setPushState('unsupported');
    if (Notification.permission === 'denied') return setPushState('denied');
    navigator.serviceWorker.getRegistration().then((reg) => reg?.pushManager.getSubscription().then((sub) => setPushState(sub ? 'on' : 'off')));
  }, [session]);
  const togglePush = async () => {
    const s = sessionRef.current;
    if (!s || pushState === 'unsupported') return;
    try {
      const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register('/sw.js'));
      const existing = await reg.pushManager.getSubscription();
      if (existing) {
        await api.pushUnsubscribe(s.token, existing.endpoint).catch(() => {});
        await existing.unsubscribe();
        setPushState('off');
        return;
      }
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') return setPushState(perm === 'denied' ? 'denied' : 'off');
      const key = await api.pushKey();
      if (!key) throw new Error('Notifications indisponibles sur le serveur.');
      const pad = '='.repeat((4 - (key.length % 4)) % 4);
      const raw = atob((key + pad).replace(/-/g, '+').replace(/_/g, '/'));
      const appKey = Uint8Array.from(raw, (c) => c.charCodeAt(0));
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: appKey });
      await api.pushSubscribe(s.token, sub.toJSON());
      setPushState('on');
    } catch (e) {
      console.warn('[push]', e);
      setPushState('off');
    }
  };
  const claimWeekly = async (id: string) => {
    const r = await api.claimWeekly(tokenOrThrow(), id);
    setWallet(r);
    return r.result.text;
  };
  const claimPass = async (tier: number) => {
    const r = await api.claimPass(tokenOrThrow(), tier);
    setWallet(r);
    return r.result.text;
  };
  const adminBoost = async (kind: BoostKind | null, hours: number) => setWallet(await api.adminBoost(tokenOrThrow(), kind, hours));
  const adminSetSeason = async (s: SeasonSetting) => setWallet(await api.adminSeason(tokenOrThrow(), s));
  const hoboBuy = async (kind: string) => {
    const e = engineRef.current;
    if (!e || e.handsFull) throw new Error('Mains pleines.');
    setWallet(await api.buyGoods(tokenOrThrow(), kind));
    e.grantSupply(kind as SupplyKind | 'can');
  };
  const hoboTake = async (kind: SupplyKind) => {
    const e = engineRef.current;
    if (!e || e.handsFull) throw new Error('Mains pleines.');
    setWallet(await api.takeStash(tokenOrThrow(), kind));
    e.grantSupply(kind);
  };
  const closeOverlays = () => {
    setHoboOpen(false);
    setShopOpen(false);
    if (ui.current.isPlaying) lock();
  };

  // ---- Accounts ---------------------------------------------------------
  // (again once the server has woken up, if it was asleep the first time)
  const awake = wakingSince == null;
  useEffect(() => {
    if (!awake || sessionRef.current) return;
    api.restore().then((s) => s && setSession(s));
  }, [awake]);

  // Load the account's colours, and give them to the engine
  useEffect(() => {
    if (!session) {
      setLook(DEFAULT_APPEARANCE);
      return;
    }
    api.getProfile(session.token).then(setLook);
  }, [session]);
  useEffect(() => {
    engineRef.current?.setLocalLook(look);
  }, [look]);

  const saveLook = async (a: Appearance) => {
    if (!session) return;
    setLook(await api.saveProfile(session.token, a));
  };

  const doAuth = async (kind: 'login' | 'register', u: string, p: string) => {
    setAuthBusy(true);
    setAuthError(null);
    try {
      const s = kind === 'login' ? await api.login(u, p) : await api.register(u, p);
      setSession(s);
      // New account: straight to the customisation menu
      if (kind === 'register') setCustomize('welcome');
    } catch (e) {
      setAuthError((e as Error).message);
    } finally {
      setAuthBusy(false);
    }
  };

  const logout = () => {
    if (session) api.logout(session.token);
    netRef.current?.close();
    netRef.current = null;
    setSession(null);
    setLobby((l) => ({ ...l, status: 'idle', error: null }));
  };

  // ---- Lobby ------------------------------------------------------------
  const onLobbyEvent = (e: LobbyEvent) => {
    const engine = engineRef.current;
    switch (e.t) {
      case 'created':
        setLobby({ status: 'hosting', code: e.code, partner: null, difficulty: e.difficulty as Difficulty, mode: e.mode, monster: e.monster, chapter: toMpChapter(e.chapter), error: null });
        break;
      case 'joined':
        setLobby({ status: 'joined', code: e.code, partner: e.host, difficulty: e.difficulty as Difficulty, mode: e.mode, monster: e.monster, chapter: toMpChapter(e.chapter), error: null });
        break;
      case 'peer-joined':
        setLobby((l) => ({ ...l, partner: e.username }));
        break;
      case 'settings':
        setLobby((l) => ({ ...l, difficulty: e.difficulty as Difficulty, mode: e.mode, monster: e.monster, chapter: toMpChapter(e.chapter) }));
        break;
      case 'peer-left':
        setLobby((l) => ({ ...l, partner: null }));
        if (onlineRef.current) engine?.partnerLeft();
        break;
      case 'room-closed':
      case 'disconnected':
        if (onlineRef.current) {
          leaveOnlineGame();
          setMpOpen(true);
        }
        setLobby((l) => ({
          ...l,
          status: 'idle',
          partner: null,
          error: e.t === 'room-closed' ? 'L\'hôte a quitté la partie.' : 'Connexion au serveur perdue.',
        }));
        if (e.t === 'disconnected') netRef.current = null;
        break;
      case 'lemote':
        setLobby((l) => ({ ...l, emotes: { ...(l.emotes ?? {}), [e.from]: { id: e.id, at: Date.now() } } }));
        break;
      case 'chat':
        setLobby((l) => ({ ...l, chat: [...(l.chat ?? []), { from: e.from, text: CHAT_PRESETS[e.i] ?? '' }].slice(-20) }));
        break;
      case 'queued':
        setLobby((l) => ({ ...l, status: 'searching', waiting: e.waiting, error: null }));
        break;
      case 'unqueued':
        setLobby((l) => (l.status === 'searching' ? { ...l, status: 'idle' } : l));
        break;
      case 'error':
        setLobby((l) => ({ ...l, status: l.status === 'connecting' ? 'idle' : l.status, error: e.error }));
        break;
      case 'watch-start': {
        const net = netRef.current;
        if (!net || !engine) return;
        const link: GameLink = {
          role: 'guest',
          partnerName: e.player,
          mode: 'coop',
          versusRole: null,
          send: () => {},
          setHandler: (fn) => net.onRelay(fn ? (d) => fn(d as GameMsg) : null),
        };
        engine.setNet(link);
        engine.watchOnly = true;
        engine.levelSeed = typeof e.seed === 'number' ? e.seed : null;
        onlineRef.current = { role: 'guest', partner: e.player, mode: 'coop', versusRole: null, watching: true };
        setOnline(onlineRef.current);
        setVersusResult(null);
        setMpOpen(false);
        setFriendsOpen(false);
        beginRun(true, e.difficulty as Difficulty, toMpChapter(e.chapter));
        break;
      }
      case 'watch-end':
        if (onlineRef.current?.watching) stopWatchingRef.current('👀 ' + e.reason);
        break;
      case 'dm':
        refreshFriendsRef.current();
        break;
      case 'start': {
        const l = lobbyRef.current;
        const role = l.status === 'hosting' ? 'host' : 'guest';
        const net = netRef.current;
        if (!net || !engine) return;
        const versusRole = e.mode === 'versus' ? (e.monster === role ? 'monster' : 'survivor') : null;
        const link: GameLink = {
          role,
          partnerName: l.partner ?? '???',
          mode: e.mode,
          versusRole,
          send: (msg: GameMsg) => net.relay(msg),
          setHandler: (fn) => net.onRelay(fn ? (d) => fn(d as GameMsg) : null),
          sendVoice: (b) => net.sendVoice(b),
          setVoiceHandler: (fn) => net.onVoice(fn),
        };
        engine.setNet(link);
        // Same forest / lab layout on both screens
        engine.levelSeed = typeof e.seed === 'number' ? e.seed : null;
        setOnline({ role, partner: link.partnerName, mode: e.mode, versusRole });
        setVersusResult(null);
        setMpOpen(false);
        beginRun(true, e.difficulty as Difficulty, toMpChapter(e.chapter));
        break;
      }
    }
  };

  /** Connects to the game server (once per session). */
  const ensureNet = async () => {
    if (netRef.current?.connected) return netRef.current;
    if (!session) throw new Error('Connectez-vous d\'abord.');
    const net = new NetClient(session.token);
    net.onLobby(onLobbyEvent);
    setLobby((l) => ({ ...l, status: 'connecting', error: null }));
    try {
      await net.connect();
    } catch (err) {
      setLobby((l) => ({ ...l, status: 'idle', error: (err as Error).message }));
      throw err;
    }
    netRef.current = net;
    return net;
  };

  const createRoom = async (s: MatchSettings) => {
    sound.init(); // user gesture: unlock audio now
    const net = await ensureNet().catch(() => null);
    net?.create(s);
  };
  const joinRoom = async (code: string) => {
    sound.init();
    const net = await ensureNet().catch(() => null);
    net?.join(code);
  };
  /** 🔎 Random partner */
  const findMatch = async (s: MatchSettings) => {
    sound.init();
    const net = await ensureNet().catch(() => null);
    net?.queue(s);
  };
  const cancelSearch = () => {
    netRef.current?.unqueue();
    setLobby((l) => ({ ...l, status: 'idle' }));
  };
  const leaveRoom = () => {
    netRef.current?.leave();
    setLobby((l) => ({ ...l, status: 'idle', partner: null, code: undefined, error: null }));
  };

  /** 👀 Watch a friend's co-op game live */
  const watchFriend = async (name: string) => {
    sound.init();
    const net = await ensureNet().catch(() => null);
    net?.watch(name);
  };
  const stopWatching = (reason: string | null) => {
    netRef.current?.unwatch();
    leaveOnlineGame();
    if (reason) setNotice(reason);
  };
  const stopWatchingRef = useRef(stopWatching);
  stopWatchingRef.current = stopWatching;
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(t);
  }, [notice]);

  /** Back to solo (keeps the account session). */
  const leaveOnlineGame = () => {
    engineRef.current?.stop();
    if (engineRef.current) engineRef.current.watchOnly = false;
    engineRef.current?.setNet(null);
    setOnline(null);
    setVersusResult(null);
    document.exitPointerLock?.();
    setIsPlaying(false);
    setIsPaused(false);
    setIsGameOver(false);
    setIsInventoryOpen(false);
    setVictory(null);
  };

  const handleMainMenu = () => {
    if (onlineRef.current?.watching) return stopWatching(null);
    if (isPlaying) reportGallery();
    if (onlineRef.current) {
      leaveRoom();
      leaveOnlineGame();
      return;
    }
    engineRef.current?.stop();
    engineRef.current?.setPaused(false, false);
    document.exitPointerLock?.();
    setIsPlaying(false);
    setIsPaused(false);
    setIsGameOver(false);
    setIsInventoryOpen(false);
    setVictory(null);
  };

  const handleUseItem = (item: GameItem) => {
    engineRef.current?.useItem(item);
    setInventoryVersion((v) => v + 1);
  };

  const handleAudioUpdate = (a: Partial<AudioSettings>) => {
    setAudioSettings((prev) => ({ ...prev, ...a }));
    sound.updateSettings(a);
  };

  const handleControlsUpdate = (c: Partial<ControlSettings>) => {
    setControlSettings((prev) => {
      const next = { ...prev, ...c };
      engineRef.current?.applySettings(next);
      return next;
    });
  };

  const engine = engineRef.current;
  const showHud = isPlaying && !isPaused && !isGameOver && !victory && !versusResult && !isInventoryOpen && !hud.dying && !hud.dancing;

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-black font-sans">
      <div
        ref={mountRef}
        className="absolute inset-0"
        onClick={() => {
          const u = ui.current;
          if (u.isPlaying && !u.isPaused && !u.isInventoryOpen && !u.isGameOver && !u.victory) lock();
        }}
      />

      {!isPlaying && (
        <StartScreen
          onStartGame={handleStartGame}
          onMultiplayer={() => setMpOpen(true)}
          username={session?.username ?? null}
          difficulty={difficulty}
          onChangeDifficulty={setDifficulty}
          touch={IS_TOUCH}
          menuMusic={menuMusic}
          onToggleMusic={() => setMenuMusic((m) => !m)}
          coins={wallet?.wallet.coins ?? null}
          shopLocked={!!wallet && !wallet.shopUnlocked}
          level={wallet?.level ?? null}
          onProgression={
            session
              ? () => {
                  refreshWallet();
                  setProgOpen(true);
                }
              : undefined
          }
          progressionAlert={progressionAlerts(wallet)}
          notifications={session ? pushState : null}
          onToggleNotifications={togglePush}
          boost={boost}
          onRedeem={session ? () => setRedeemOpen(true) : undefined}
          onClans={session ? () => setClansOpen(true) : undefined}
          clanTag={wallet?.clanTag ?? null}
          onMusic={() => setMusicOpen(true)}
          onGallery={session ? () => setGalleryOpen(true) : undefined}
          onRanked={session ? () => setRankedOpen(true) : undefined}
          rankTier={wallet?.ranked?.tier ?? null}
          onFriends={
            session
              ? () => {
                  refreshFriends();
                  setFriendsOpen(true);
                }
              : () => setMpOpen(true)
          }
          friendsOnline={friends ? friends.friends.filter((f) => f.status !== 'offline').length : null}
          friendsAlert={friends ? friends.requests.length + friends.invites.length + friends.friends.reduce((n, f) => n + (f.unread ?? 0), 0) : 0}
          giftReady={!!wallet?.dailyAvailable && !!wallet.shopUnlocked}
          season={season}
          adventReady={!!wallet?.shopUnlocked && !!wallet.advent && wallet.advent.claimed.length < wallet.advent.open}
          onShop={() => {
            refreshWallet();
            setShopOpen(true);
          }}
          chapter={chapter}
          ch2Unlocked={ch2Unlocked}
          ch3Unlocked={ch3Unlocked}
          ch4Unlocked={ch4Unlocked}
          ch5Unlocked={ch5Unlocked}
          ch6Unlocked={ch6Unlocked}
          onCampaign={startCampaign}
          onTutorial={startTutorial}
          onSurvival={startSurvival}
          onXmasNight={season === 'noel' ? startXmasNight : undefined}
          onFindOpponent={() => {
            setMpOpen(true);
            if (session) findMatch({ mode: 'versus', difficulty: 2 as Difficulty, chapter: 1, monster: 'host' });
          }}
          tutorialDone={tutoSeen}
          challenge={todayChallenge}
          challengeOn={challengeOn}
          challengeDone={!!wallet?.challenge?.done}
          onToggleChallenge={() => setChallengeOn((v) => !v)}
          onLeaderboard={() => setBoardOpen(true)}
          onChangeChapter={setChapter}
          achCount={wallet?.ach ? Object.keys(wallet.ach.done).length : null}
          onAchievements={() => {
            refreshWallet();
            setAchOpen(true);
          }}
          audioSettings={audioSettings}
          controlSettings={controlSettings}
          onUpdateAudio={handleAudioUpdate}
          onUpdateControls={handleControlsUpdate}
        />
      )}

      {mpOpen && !isPlaying && (
        <MultiplayerPanel
          username={session?.username ?? null}
          lobby={lobby}
          authBusy={authBusy}
          authError={authError}
          onLogin={(u, p) => doAuth('login', u, p)}
          onRegister={(u, p) => doAuth('register', u, p)}
          onLogout={logout}
          onCustomize={() => setCustomize('edit')}
          onFriends={() => setFriendsOpen(true)}
          onCreate={createRoom}
          onJoin={joinRoom}
          onFindMatch={findMatch}
          onCancelSearch={cancelSearch}
          onChat={(i) => netRef.current?.chat(i)}
          myLook={look}
          partnerLook={partnerLook}
          owned={wallet?.wallet.owned ?? []}
          onEmote={(id) => {
            netRef.current?.lobbyEmote(id);
            const me = session?.username;
            if (me) setLobby((l) => ({ ...l, emotes: { ...(l.emotes ?? {}), [me]: { id, at: Date.now() } } }));
          }}
          ch2Unlocked={ch2Unlocked}
          ch4Unlocked={ch4Unlocked}
          ch5Unlocked={ch5Unlocked}
          ch6Unlocked={ch6Unlocked}
          onUpdateSettings={(s) => {
            setLobby((l) => ({ ...l, ...s }));
            netRef.current?.updateSettings(s);
          }}
          onStart={() => netRef.current?.start()}
          onLeave={leaveRoom}
          onClose={() => setMpOpen(false)}
        />
      )}

      {customize && session && !isPlaying && (
        <CustomizeMenu
          username={session.username}
          initial={look}
          owned={wallet?.wallet.owned ?? []}
          onOpenShop={() => {
            setCustomize(null);
            setShopOpen(true);
          }}
          welcome={customize === 'welcome'}
          onSave={saveLook}
          onClose={() => setCustomize(null)}
        />
      )}

      {wakingSince != null && <WakeScreen since={wakingSince} />}
      {tutorial && isPlaying && (
        <TutorialOverlay
          step={tutorial.step}
          touch={IS_TOUCH}
          onSkip={() =>
            setTutorial((tu) => {
              if (!tu) return tu;
              const step = tu.step + 1;
              if (step >= TUTO_STEPS.length) finishTutorial();
              return { ...tu, step };
            })
          }
          onQuit={() => {
            finishTutorial();
            setTutorial(null);
          }}
        />
      )}
      {progOpen && session && !isPlaying && (
        <ProgressionMenu wallet={wallet} onClaimWeekly={claimWeekly} onClaimPass={claimPass} onClose={() => setProgOpen(false)} />
      )}
      {!isPlaying && session && (wallet?.inbox?.length ?? 0) > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[91] w-[min(92vw,440px)] p-3 border border-pink-500 bg-zinc-950/95 shadow-[0_0_30px_rgba(236,72,153,0.35)]">
          <div className="space-y-1 mb-2">
            {wallet!.inbox!.slice(-4).map((m, i) => (
              <div key={i} className="text-sm text-zinc-100">
                {m.text}
              </div>
            ))}
          </div>
          <button
            onClick={() => api.inboxClear(tokenOrThrow()).then(setWallet).catch(() => {})}
            className="w-full py-1.5 bg-pink-600 hover:bg-pink-500 text-black font-mono text-xs uppercase font-bold"
          >
            Super, merci !
          </button>
        </div>
      )}
      {levelUp && <LevelUpToast level={levelUp.level} coins={levelUp.coins} onDone={() => setLevelUp(null)} />}
      {clansOpen && session && !isPlaying && (
        <ClansPanel
          token={session.token}
          coins={wallet?.wallet.coins ?? 0}
          admin={!!wallet?.admin}
          onWallet={() => refreshWallet()}
          onProfile={setProfileOf}
          onClose={() => {
            setClansOpen(false);
            refreshWallet();
          }}
        />
      )}
      {rankedOpen && session && !isPlaying && <RankedMenu token={session.token} me={session.username} onProfile={setProfileOf} onWallet={setWallet} onClose={() => setRankedOpen(false)} />}
      {musicOpen && !isPlaying && <MusicMenu token={session?.token ?? null} wallet={wallet} onWallet={setWallet} onClose={() => setMusicOpen(false)} />}
      {galleryOpen && session && !isPlaying && (
        <GalleryMenu endings={wallet?.gallery?.endings ?? []} docs={wallet?.gallery?.docs ?? []} achDone={wallet?.ach?.done ?? {}} onClose={() => setGalleryOpen(false)} />
      )}
      {redeemOpen && session && !isPlaying && <RedeemCode token={session.token} onWallet={setWallet} onClose={() => setRedeemOpen(false)} />}
      {notice && !isPlaying && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[95] px-4 py-2 bg-zinc-950 border border-sky-700 text-sky-100 font-mono text-xs shadow-lg">{notice}</div>
      )}
      {friendsOpen && session && !isPlaying && (
        <FriendsPanel
          view={friends}
          onAdd={(n) => friendAct((t) => api.friendAdd(t, n))}
          onAccept={(n) => friendAct((t) => api.friendAccept(t, n))}
          onRemove={async (n) => {
            await friendAct((t) => api.friendRemove(t, n));
          }}
          onInvite={(n) => friendAct((t) => api.friendInvite(t, n))}
          onProfile={setProfileOf}
          owned={wallet?.wallet.owned ?? []}
          coins={wallet?.wallet.coins ?? 0}
          onGift={async (to, what) => {
            const r = await api.gift(tokenOrThrow(), to, what);
            setWallet(r);
            return r.message;
          }}
          token={session.token}
          me={session.username}
          referrals={wallet?.referrals ?? 0}
          onWatch={(n) => {
            setFriendsOpen(false);
            watchFriend(n);
          }}
          onCreateRoom={
            lobby.status === 'idle'
              ? () => {
                  setFriendsOpen(false);
                  setMpOpen(true);
                }
              : undefined
          }
          onClose={() => setFriendsOpen(false)}
        />
      )}
      {session && !isPlaying && friends?.invites[0] && lobby.status !== 'joined' && (
        <InviteToast
          invite={friends.invites[0]}
          onJoin={() => acceptInvite(friends.invites[0].code)}
          onDecline={() => declineInvite(friends.invites[0].code)}
        />
      )}

      {shopOpen && (
        <ShopMenu
          username={session?.username ?? null}
          wallet={wallet}
          onBuy={buyCosmetic}
          onOpenBox={openBox}
          onClaimDaily={claimDaily}
          onClaimAdvent={claimAdvent}
          onOpenEventBox={openEventBox}
          onExplore={
            isPlaying
              ? undefined
              : () => {
                  setDifficulty(1 as Difficulty);
                  setShopOpen(false);
                }
          }
          onSetSeason={adminSetSeason}
          onBoost={adminBoost}
          token={session?.token ?? null}
          onLogin={() => {
            setShopOpen(false);
            if (!isPlaying) setMpOpen(true);
          }}
          onCustomize={
            isPlaying
              ? undefined
              : () => {
                  setShopOpen(false);
                  setCustomize('edit');
                }
          }
          onClose={closeOverlays}
        />
      )}

      {hoboOpen && isPlaying && !shopOpen && (
        <HoboShop
          username={session?.username ?? null}
          wallet={wallet}
          handsFull={!!engineRef.current?.handsFull}
          onBuy={hoboBuy}
          onTake={hoboTake}
          onOpenShop={() => {
            refreshWallet();
            setShopOpen(true);
          }}
          onLogin={closeOverlays}
          onClose={closeOverlays}
        />
      )}

      <AchievementToast queue={achPopups} onDone={nextAchPopup} />
      {boardOpen && <LeaderboardMenu me={session?.username ?? null} onProfile={session ? setProfileOf : undefined} onClose={() => setBoardOpen(false)} />}
      {profileOf && session && (
        <PlayerProfile
          name={profileOf}
          token={session.token}
          onAddFriend={(n) => friendAct((t) => api.friendAdd(t, n))}
          onClose={() => setProfileOf(null)}
        />
      )}
      {runMsg && victory && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-[90] px-5 py-2 border border-emerald-600 bg-black/90 text-emerald-300 font-mono text-xs shadow-[0_0_30px_rgba(16,185,129,0.3)] text-center max-w-[92vw]">
          {runMsg}
        </div>
      )}
      {achOpen && <AchievementsMenu ach={wallet?.ach ?? null} loggedIn={!!session} onClose={() => setAchOpen(false)} />}

      {rewardMsg && (victory || versusResult || isGameOver) && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[90] px-5 py-2 border border-amber-500 bg-black/90 text-amber-300 font-mono text-sm shadow-[0_0_30px_rgba(250,180,0,0.4)]">
          {rewardMsg}
        </div>
      )}

      {showHud && (
        <HUD
          versusRole={hud.versusRole}
          timeLeft={hud.timeLeft}
          partnerName={hud.partnerName}
          race={hud.race}
          canBlind={hud.canBlind}
          blindLeft={hud.blindLeft}
          partnerDead={hud.partnerDead}
          spectating={hud.spectating}
          watching={hud.watching}
          flashlightBattery={hud.battery}
          flashlightOn={hud.flashlightOn}
          stamina={hud.stamina}
          maxStamina={100}
          isCrouching={hud.crouching}
          isSprinting={hud.sprinting}
          isHidden={hud.hidden}
          interactionHint={IS_TOUCH && hud.hint ? hud.hint.replace(/^\[E\]\s*/, '✋ ') : hud.hint}
          touch={IS_TOUCH}
          objectiveText={hud.objective}
          toastMessage={hud.toast}
          fear={hud.fear}
          fearFlashText={hud.fearFlashText}
          freeLook={hud.freeLook}
          stress={hud.stress}
          micLevel={hud.micLevel}
          micStatus={hud.micStatus}
          micHeard={hud.micHeard}
          hideKind={hud.hideKind}
          screamer={hud.screamer}
          flipCharge={hud.flipCharge}
          flipMsg={hud.flipMsg}
          flipBest={hud.flipBest}
          items={hud.items}
          maxSlots={hud.maxSlots}
          runCoins={hud.runCoins}
          runTreats={hud.runTreats}
          presents={hud.presents}
          survival={hud.survival}
          speedrun={hud.speedrun}
          treatEmoji={hud.treatEmoji}
          selectedSlot={hud.selectedSlot}
          voice={hud.voice}
        />
      )}
      {showHud && <IntroOverlay intro={hud.intro} text={hud.introText} touch={IS_TOUCH} onSkip={() => engineRef.current?.skipIntro()} />}

      {showHud && IS_TOUCH && (
        <TouchControls
          engine={engineRef.current}
          hud={hud}
          onInventory={toggleInventory}
          onPause={() => {
            ui.current.pausedAt = performance.now();
            setIsPaused(true);
          }}
        />
      )}
      {IS_TOUCH && isPlaying && <RotateHint />}

      {isInventoryOpen && engine && (
        <InventoryModal
          key={inventoryVersion}
          inventory={[...engine.state.inventory]}
          maxSlots={engine.state.maxInventorySlots}
          objectives={engine.state.objectives}
          notes={engine.state.notesCollected}
          onClose={toggleInventory}
          onUseItem={handleUseItem}
          onWatchFilm={(id) => {
            primeFilmVoices();
            setFilmId(id);
            setIsInventoryOpen(false);
            setFilmOpen(true);
          }}
        />
      )}

      {filmOpen &&
        (filmId === 'vhs-moreau' ? (
          <MoreauTape
            onClose={(toEnd) => {
              setFilmOpen(false);
              if (toEnd) queueAchRef.current('vhs2');
              if (ui.current.isPlaying) lock();
            }}
          />
        ) : (
          <ExperimentFilm
            onClose={(toEnd) => {
              setFilmOpen(false);
              if (toEnd) queueAchRef.current('vhs');
              if (ui.current.isPlaying) lock();
            }}
          />
        ))}

      {isPaused && !isGameOver && !victory && (
        <PauseSettingsModal
          audioSettings={audioSettings}
          controlSettings={controlSettings}
          onResume={resume}
          onRestart={online?.role === 'guest' ? undefined : handleRestart}
          onMainMenu={handleMainMenu}
          online={!!online}
          onUpdateAudio={handleAudioUpdate}
          onUpdateControls={handleControlsUpdate}
        />
      )}

      {versusResult && online && (online.versusRole || online.mode === 'race') && (
        <VersusResultModal
          won={versusResult.won}
          text={versusResult.reason}
          role={online.versusRole ?? 'racer'}
          onPlayAgain={online.role === 'host' ? handleRestart : undefined}
          onMainMenu={handleMainMenu}
        />
      )}

      {campaignCard && (
        <CampaignCard
          done={campaignCard.done}
          next={campaignCard.next}
          time={campaignCard.time}
          items={campaignCard.items}
          onContinue={continueCampaign}
          onQuit={() => {
            campaignRef.current = null;
            setCampaignCard(null);
            handleMainMenu();
          }}
        />
      )}

      {isGameOver && (
        <GameOverModal
          onRestart={online?.role === 'guest' ? undefined : handleRestart}
          onMainMenu={handleMainMenu}
          online={!!online}
        />
      )}

      {victory && engine && (
        <VictoryModal
          ending={victory.ending}
          title={victory.title}
          narrative={victory.narrative}
          notesFound={engine.state.notesCollected.length}
          totalNotes={engine.state.totalNotes}
          difficultyLabel={
            online?.mode === 'versus'
              ? `Chasse — vous avez échappé à ${online.partner}`
              : online?.mode === 'race'
              ? `Course — vous êtes sorti avant ${online.partner}`
              : `${engine.builtDifficulty} — ${difficultyInfo(engine.builtDifficulty).name}${online ? ` · coop avec ${online.partner}` : ''}`
          }
          onPlayAgain={online?.role === 'guest' ? undefined : handleRestart}
          onMainMenu={handleMainMenu}
        />
      )}
    </div>
  );
}
