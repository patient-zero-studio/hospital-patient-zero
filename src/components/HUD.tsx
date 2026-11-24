import React from 'react';
import { Battery, BatteryLow, Eye, Footprints, HeartPulse, Mic, MicOff } from 'lucide-react';
import type { MicStatus } from '../audio/MicListener';
import type { GameItem } from '../types';
import type { HudSnapshot } from '../game/Engine';
import { ItemIcon } from './ItemIcon';
import { EMOTES as EMOTE_LABELS } from '../net/protocol';
import { IMP_SAY } from '../game/Impostor';

/** 🗣 Imposteur: quick sentences before the vote */
const ImpTalk: React.FC<{ alive: string[]; chat: string[] }> = ({ alive, chat }) => {
  const [who, setWho] = React.useState(alive[0] ?? '');
  const target = alive.includes(who) ? who : (alive[0] ?? '');
  const say = (i: number) => window.dispatchEvent(new CustomEvent('pz-say', { detail: { i, t: IMP_SAY[i].who ? target : undefined } }));
  return (
    <div className="mb-3 text-left">
      <div className="max-h-28 overflow-y-auto mb-2 px-2 py-1 bg-black/60 border border-zinc-800 space-y-0.5">
        {chat.length === 0 ? (
          <p className="text-[11px] font-mono text-zinc-600 italic">Personne n'a encore parlé… Accusez, défendez-vous !</p>
        ) : (
          chat.map((l, i) => (
            <p key={i} className="text-[11px] font-mono text-zinc-200">
              {l}
            </p>
          ))
        )}
      </div>
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="text-[10px] font-mono text-zinc-500 uppercase">Parler de</span>
        <select
          value={target}
          onChange={(e) => setWho(e.target.value)}
          className="flex-1 bg-black border border-zinc-700 text-xs font-mono text-zinc-100 px-1 py-1"
        >
          {alive.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-wrap gap-1">
        {IMP_SAY.map((p, i) => (
          <button
            key={i}
            disabled={p.who && !target}
            onClick={() => say(i)}
            className="px-2 py-1 border border-zinc-700 text-[11px] font-mono text-zinc-200 hover:border-amber-500 disabled:opacity-40"
          >
            {p.who && target ? p.label.replace(' …', ` ${target}`).replace('…', ` ${target}`) : p.label}
          </button>
        ))}
      </div>
    </div>
  );
};
import { getScreamerFace } from './screamerFace';

/** Must match MIC_THRESHOLD in the engine. */
const MIC_THRESHOLD = 0.3;

interface HUDProps {
  flashlightBattery: number;
  flashlightOn: boolean;
  stamina: number;
  maxStamina: number;
  isCrouching: boolean;
  isSprinting: boolean;
  isHidden: boolean;
  interactionHint: string | null;
  objectiveText: string;
  toastMessage: string | null;
  fear: number;
  fearFlashText: string | null;
  freeLook?: boolean;
  stress: number;
  micLevel: number;
  micStatus: MicStatus;
  micHeard: boolean;
  hideKind: 'locker' | 'bed' | null;
  items: GameItem[];
  maxSlots: number;
  /** Coins found this run */
  runCoins?: number;
  runTreats?: number;
  presents?: number | null;
  survival?: { wave: number; time: number } | null;
  /** 🎪 the Ringmaster's deal (seconds left) */
  pact?: number | null;
  /** 🔪 Imposteur */
  imp?: HudSnapshot['imp'];
  /** 🫣 hide-and-seek countdown */
  hideCount?: number | null;
  /** 🎡 the emote wheel [T] is open */
  emoteWheel?: boolean;
  /** 🔮 seconds before the secret passage closes */
  secretLeft?: number | null;
  /** 🩸 wounded */
  wound?: HudSnapshot['wound'];
  /** ⏱️ Speedrun chrono */
  speedrun?: { time: number; best: number | null } | null;
  treatEmoji?: string | null;
  /** Hotbar slot [X] drops */
  selectedSlot?: number;
  /** phone: on-screen controls */
  touch?: boolean;
  screamer?: boolean;
  flipCharge?: number | null;
  flipMsg?: string | null;
  flipBest?: number;
  partnerName?: string | null;
  partnerDead?: boolean;
  spectating?: boolean;
  /** 👀 watching a friend's game (not dead) */
  watching?: boolean;
  versusRole?: 'monster' | 'survivor' | null;
  timeLeft?: number | null;
  /** Race mode: first one out wins */
  race?: boolean;
  /** Versus survivor: the creature is camping, [G] blinds it */
  canBlind?: boolean;
  /** Versus creature: seconds left blinded */
  blindLeft?: number;
  /** Online proximity voice chat */
  voice?: { on: boolean; muted: boolean; self: boolean; partner: boolean } | null;
}

const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** Versus clock, shown to both players. */
/** 1:23.4 */
const fmtRun = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;

const VersusTimer: React.FC<{ timeLeft: number; role: 'monster' | 'survivor' }> = ({ timeLeft, role }) => (
  <div className="absolute top-5 left-1/2 -translate-x-1/2 z-30 text-center">
    <div className="text-[10px] font-mono uppercase tracking-[0.3em] text-zinc-500">
      {role === 'monster' ? 'Temps restant pour la traque' : 'Temps pour fuir l\'hôpital'}
    </div>
    <div className={`text-2xl font-black font-mono tracking-widest ${timeLeft < 60 ? 'text-red-500 animate-pulse' : 'text-zinc-100'}`}>
      {fmtTime(timeLeft)}
    </div>
  </div>
);

export const HUD: React.FC<HUDProps> = ({
  flashlightBattery,
  flashlightOn,
  stamina,
  maxStamina,
  isCrouching,
  isSprinting,
  isHidden,
  interactionHint,
  objectiveText,
  toastMessage,
  fear,
  fearFlashText,
  freeLook,
  stress,
  micLevel,
  micStatus,
  micHeard,
  hideKind,
  items,
  maxSlots,
  runCoins = 0,
  runTreats = 0,
  presents = null,
  survival = null,
  speedrun = null,
  hideCount = null,
  emoteWheel = false,
  secretLeft = null,
  wound = null,
  pact = null,
  imp = null,
  treatEmoji = null,
  selectedSlot = 0,
  touch = false,
  screamer,
  flipCharge,
  flipMsg,
  flipBest = 0,
  partnerName,
  partnerDead,
  spectating,
  watching = false,
  voice,
  versusRole,
  timeLeft,
  race,
  canBlind,
  blindLeft = 0,
}) => {
  // ---- Versus: the creature player's own, minimal HUD ----
  if (versusRole === 'monster') {
    const reach = interactionHint === '[E] ATTRAPER';
    return (
      <div className="absolute inset-0 pointer-events-none select-none overflow-hidden">
        {timeLeft != null && hideCount == null && <VersusTimer timeLeft={timeLeft} role="monster" />}
        {hideCount != null && (
          <div className="absolute inset-0 z-40 bg-black flex flex-col items-center justify-center text-center">
            <div className="text-8xl font-black font-mono text-red-500">{hideCount}</div>
            <div className="text-sm font-serif italic text-zinc-300 mt-2">Yeux fermés… il se cache.</div>
          </div>
        )}
        {blindLeft > 0 && (
          <div className="absolute inset-0 z-40 bg-black flex flex-col items-center justify-center text-center">
            <div className="text-red-600 font-black font-mono tracking-[0.4em] text-2xl">AVEUGLÉ</div>
            <div className="text-zinc-400 font-serif italic mt-2">Vous campiez trop longtemps… une force vous entraîne ailleurs.</div>
            <div className="text-zinc-200 font-mono text-3xl mt-4">{Math.ceil(blindLeft)}</div>
          </div>
        )}
        <div className="absolute top-5 left-6 max-w-xs">
          <div className="text-[10px] uppercase font-mono tracking-[0.3em] text-red-500/90 mb-1">Vous êtes le Patient Zéro</div>
          <div className="text-[13px] text-zinc-200/90 font-serif italic leading-snug" style={{ textShadow: '0 1px 6px #000' }}>
            Traquez le survivant et attrapez-le avant la fin du temps. Ne campez pas : il pourrait vous aveugler.
          </div>
        </div>
        {/* Crosshair / prompt */}
        <div className="absolute inset-0 flex items-center justify-center">
          {interactionHint ? (
            <div className="flex flex-col items-center gap-2 translate-y-6">
              <div className={`rounded-full ${reach ? 'w-4 h-4 bg-red-600 shadow-[0_0_16px_rgba(255,0,0,0.9)] animate-pulse' : 'w-2 h-2 bg-red-300'}`} />
              <div
                className={`px-3 py-1 font-mono tracking-wide bg-black/60 border-l-2 border-red-600 ${reach ? 'text-base text-red-300 font-black' : 'text-[13px] text-zinc-100'}`}
              >
                {interactionHint}
              </div>
            </div>
          ) : (
            <div className="w-1.5 h-1.5 rounded-full bg-red-400/60" />
          )}
        </div>
        {toastMessage && (
          <div className="absolute bottom-28 left-1/2 -translate-x-1/2 max-w-[80vw] hud-fade-in" key={toastMessage}>
            <div className="px-5 py-2 text-sm font-serif italic text-zinc-100 text-center bg-black/70">{toastMessage}</div>
          </div>
        )}
        <div className="absolute bottom-6 left-6 text-[10px] font-mono leading-relaxed text-red-200/70 bg-black/50 px-3 py-2 border border-red-950">
          <div>[E] attraper · fouiller un casier / un lit · portes</div>
          <div>[SHIFT] traquer (courir) · [C] se faufiler</div>
          <div className="text-red-400">Les bruits du survivant apparaissent en rouge</div>
        </div>
        <div className="absolute bottom-6 right-6 flex flex-col items-end gap-1">
          <span className="text-[10px] font-mono tracking-widest text-red-300/80">SOUFFLE</span>
          <div className="w-32 h-[3px] bg-zinc-800/80">
            <div className="h-full bg-red-500" style={{ width: `${(stamina / maxStamina) * 100}%`, transition: 'width 120ms linear' }} />
          </div>
        </div>
      </div>
    );
  }

  const hasCan = items.some((i) => i.type === 'throwable');
  const stressPct = Math.round(stress * 100);
  const stressLabel = stress > 0.75 ? 'PANIQUE' : stress > 0.45 ? 'ANGOISSE' : stress > 0.15 ? 'NERVEUX' : 'CALME';
  const stressColor = stress > 0.75 ? '#dc2626' : stress > 0.45 ? '#f97316' : stress > 0.15 ? '#eab308' : '#a1a1aa';
  const micLoud = micLevel >= MIC_THRESHOLD;
  const lowBattery = flashlightBattery < 20;
  const staminaPct = (stamina / maxStamina) * 100;

  return (
    <div className="absolute inset-0 pointer-events-none select-none overflow-hidden">
      {/* Under a bed: mattress above, floor below, a thin strip of the room */}
      {isHidden && hideKind === 'bed' && (
        <div className="absolute inset-0 z-20">
          <div
            className="absolute inset-x-0 top-0"
            style={{ height: '46%', background: 'linear-gradient(to bottom, rgba(0,0,0,0.99) 75%, rgba(0,0,0,0.6) 92%, transparent)' }}
          />
          <div
            className="absolute inset-x-0 bottom-0"
            style={{ height: '30%', background: 'linear-gradient(to top, rgba(0,0,0,0.97) 55%, transparent)' }}
          />
          {/* Bed frame slats */}
          {[18, 50, 82].map((x) => (
            <div key={x} className="absolute top-0 w-[3%] bg-black/95" style={{ left: `${x - 1.5}%`, height: '52%' }} />
          ))}
          <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 60% 20% at 50% 52%, transparent 50%, rgba(0,0,0,0.85) 100%)' }} />
          <div className="absolute bottom-10 left-1/2 -translate-x-1/2 text-[11px] font-mono tracking-[0.3em] text-zinc-400/80">
            SOUS LE LIT — NE BOUGEZ PLUS — [E] SORTIR
          </div>
        </div>
      )}

      {/* Locker: view through the vent slats */}
      {isHidden && hideKind !== 'bed' && (
        <div className="absolute inset-0 z-20">
          <div
            className="absolute inset-0"
            style={{
              background:
                'repeating-linear-gradient(to bottom, rgba(0,0,0,0.97) 0px, rgba(0,0,0,0.97) 26px, rgba(0,0,0,0) 26px, rgba(0,0,0,0) 40px)',
              maskImage: 'radial-gradient(ellipse 38% 22% at 50% 48%, transparent 60%, black 100%)',
              WebkitMaskImage: 'radial-gradient(ellipse 38% 22% at 50% 48%, transparent 60%, black 100%)',
            }}
          />
          <div
            className="absolute inset-0"
            style={{ background: 'radial-gradient(ellipse 40% 26% at 50% 48%, transparent 55%, rgba(0,0,0,0.98) 100%)' }}
          />
          <div className="absolute bottom-10 left-1/2 -translate-x-1/2 text-[11px] font-mono tracking-[0.3em] text-zinc-400/80">
            CACHÉ — NE FAITES AUCUN BRUIT — [E] SORTIR
          </div>
        </div>
      )}

      {/* SCREAMER: the corpse's face fills the screen */}
      {screamer && (
        <div className="absolute inset-0 z-50 bg-black overflow-hidden">
          <img
            src={getScreamerFace()}
            alt=""
            className="screamer-face absolute left-1/2 top-1/2 h-[135%] max-w-none"
            draggable={false}
          />
          <div className="screamer-flash absolute inset-0" />
        </div>
      )}

      {/* Jumpscare text flash */}
      {fearFlashText && (
        <div className="absolute inset-0 z-30 flex items-center justify-center">
          <span
            className="text-4xl md:text-5xl font-serif italic tracking-[0.2em] text-red-200 hud-glitch"
            style={{ textShadow: '0 0 30px rgba(255,0,0,0.9), 3px 0 rgba(0,255,255,0.4), -3px 0 rgba(255,0,0,0.6)' }}
          >
            {fearFlashText}
          </span>
        </div>
      )}

      {/* Objective */}
      {objectiveText && !isHidden && (
        <div className="absolute top-5 left-6 max-w-sm hud-fade-in" key={objectiveText}>
          <div className="text-[10px] uppercase font-mono tracking-[0.3em] text-red-500/80 mb-1">Objectif</div>
          <div className="text-[13px] text-zinc-200/90 leading-snug font-serif italic" style={{ textShadow: '0 1px 6px #000' }}>
            {objectiveText}
          </div>
        </div>
      )}

      {/* Crosshair / interaction prompt */}
      {!isHidden && (
        <div className="absolute inset-0 flex items-center justify-center">
          {interactionHint ? (
            <div className="flex flex-col items-center gap-2 translate-y-6">
              <div className="w-2 h-2 rounded-full bg-zinc-100 shadow-[0_0_10px_rgba(255,255,255,0.8)]" />
              <div
                className="px-3 py-1 text-[13px] text-zinc-100 font-mono tracking-wide bg-black/55 border-l-2 border-red-600"
                style={{ textShadow: '0 1px 4px #000' }}
              >
                {interactionHint}
              </div>
            </div>
          ) : (
            <div className="w-1 h-1 rounded-full bg-zinc-200/50" />
          )}
        </div>
      )}

      {/* Coins found this run (banked if you get out) */}
      {runCoins > 0 && (
        <div className="absolute bottom-[100px] left-1/2 -translate-x-1/2 px-2 py-0.5 bg-black/60 border border-amber-700/60 text-amber-300 font-mono text-[11px]">
          🪙 {runCoins} pièce{runCoins > 1 ? 's' : ''} trouvée{runCoins > 1 ? 's' : ''}
        </div>
      )}

      {/* 🩸 Wound status + bandage progress */}
      {wound && (
        <div className="absolute bottom-[128px] left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-1 pointer-events-none">
          {wound.band != null ? (
            <div className="w-56 px-3 py-1.5 bg-black/75 border border-rose-200/40">
              <p className="text-[11px] font-mono text-rose-100 mb-1 text-center">🩹 Bandage en cours… ne bougez pas</p>
              <div className="h-1.5 bg-zinc-800 overflow-hidden">
                <div className="h-full bg-rose-200 transition-[width] duration-150" style={{ width: `${Math.round(wound.band * 100)}%` }} />
              </div>
            </div>
          ) : (
            <div className={`px-3 py-1 bg-black/70 border font-mono text-[11px] ${wound.bleed ? 'border-red-700 text-red-300 animate-pulse' : 'border-red-900/70 text-red-400/80'}`}>
              🩸 Blessé{wound.bleed ? ' · vous saignez' : ''}{wound.limp ? ' · vous boitez' : ''} — un coup de plus sera fatal
            </div>
          )}
        </div>
      )}

      {/* 🔮 Secret passage countdown */}
      {secretLeft != null && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-30 px-3 py-1 bg-black/70 border border-violet-700 text-violet-200 font-mono text-xs pointer-events-none">
          🔮 Passage secret : {Math.floor(secretLeft / 60)}:{String(secretLeft % 60).padStart(2, '0')}
        </div>
      )}

      {/* 🎡 Emote wheel [T] */}
      {emoteWheel && (
        <div
          className="absolute inset-0 z-[60] flex items-center justify-center bg-black/30"
          onClick={() => window.dispatchEvent(new CustomEvent('pz-emote', { detail: -1 }))}
        >
          <div className="relative w-[300px] h-[300px]" onClick={(e) => e.stopPropagation()}>
            <div className="absolute inset-[22%] rounded-full border border-zinc-700 bg-black/70 flex items-center justify-center text-center">
              <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-400 leading-tight">
                Emotes
                <br />
                <span className="text-zinc-600 normal-case">[T] fermer</span>
              </span>
            </div>
            {EMOTE_LABELS.map((label, i) => {
              const a = (i / EMOTE_LABELS.length) * Math.PI * 2 - Math.PI / 2;
              return (
                <button
                  key={i}
                  onClick={() => window.dispatchEvent(new CustomEvent('pz-emote', { detail: i }))}
                  className="absolute -translate-x-1/2 -translate-y-1/2 w-[92px] py-2 rounded-full border border-emerald-700 bg-zinc-950/90 hover:bg-emerald-900 hover:border-emerald-400 text-xs font-mono text-zinc-100"
                  style={{ left: `${50 + Math.cos(a) * 40}%`, top: `${50 + Math.sin(a) * 40}%` }}
                >
                  {label}
                  {i < 4 && <span className="block text-[9px] text-zinc-500">[{i + 6}]</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 🔪 Imposteur: night clock, your role, the morning vote */}
      {imp && imp.ph !== 'over' && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-40 text-center pointer-events-none">
          <div className={`px-3 py-1 font-mono text-xs border ${imp.ph === 'morning' ? 'bg-amber-950/80 border-amber-600 text-amber-200' : 'bg-black/70 border-indigo-800 text-indigo-200'}`}>
            {imp.ph === 'morning' ? '🌅 Matin — vote' : `🌙 Nuit ${imp.n}/${imp.nights}`} · {Math.floor(imp.t / 60)}:{String(imp.t % 60).padStart(2, '0')}
          </div>
          {!imp.dead && (
            <div className={`mt-1 px-2 py-0.5 font-mono text-[11px] ${imp.me === 'imp' ? 'bg-red-950/80 text-red-300' : 'bg-black/60 text-zinc-300'}`}>
              {imp.me === 'imp'
                ? imp.ph !== 'night'
                  ? "🔪 Vous êtes l'imposteur — attendez la nuit"
                  : imp.cd > 0
                    ? `🔪 Imposteur — prêt dans ${imp.cd} s`
                    : imp.near
                      ? '🔪 [K] TUER'
                      : "🔪 Imposteur — approchez-vous d'une proie"
                : imp.me === 'doc'
                  ? "🩺 Médecin — le matin, protégez quelqu'un"
                  : imp.me === 'det'
                    ? imp.invUsed
                      ? '🔍 Détective — enquête utilisée'
                      : '🔍 Détective — 1 enquête, le matin'
                    : '🧍 Survivant — méfiez-vous de tout le monde'}
            </div>
          )}
        </div>
      )}
      {imp && imp.ph === 'morning' && !imp.dead && (
        <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div className="pointer-events-auto max-w-md mx-4 p-5 bg-black/90 border-2 border-amber-600 text-center max-h-[92vh] overflow-y-auto">
            <div className="text-[10px] font-mono uppercase tracking-[0.3em] text-amber-400 mb-1">Le jour se lève — {imp.t} s pour voter</div>
            {imp.log && <p className="text-sm text-zinc-200 mb-3">{imp.log}</p>}
            <ImpTalk alive={imp.alive} chat={imp.chat} />
            <p className="font-serif italic text-zinc-100 mb-3">Qui est l'imposteur ?</p>
            <div className="flex flex-wrap gap-1.5 justify-center">
              {imp.alive.map((n) => (
                <button
                  key={n}
                  onClick={() => window.dispatchEvent(new CustomEvent('pz-vote', { detail: n }))}
                  className={`px-3 py-1.5 font-mono text-xs border ${imp.voted === n ? 'bg-red-700 border-red-400 text-white' : 'border-zinc-600 text-zinc-200 hover:border-red-500'}`}
                >
                  {n}
                </button>
              ))}
              <button
                onClick={() => window.dispatchEvent(new CustomEvent('pz-vote', { detail: 'skip' }))}
                className={`px-3 py-1.5 font-mono text-xs border ${imp.voted === 'skip' ? 'bg-zinc-600 border-zinc-300 text-white' : 'border-zinc-700 text-zinc-400 hover:border-zinc-400'}`}
              >
                Passer
              </button>
            </div>
            <div className="text-xs font-mono text-zinc-500 mt-3">
              {imp.voted ? `Votre vote : ${imp.voted === 'skip' ? 'personne' : imp.voted}. ` : ''}
              {imp.nvoted} vote{imp.nvoted > 1 ? 's' : ''} · il faut au moins 2 voix et une majorité.
            </div>
            {imp.me === 'doc' && (
              <div className="mt-4 pt-3 border-t border-emerald-900">
                <p className="text-xs font-mono text-emerald-300 mb-2">🩺 Médecin (secret) : qui protéger cette nuit ?</p>
                <div className="flex flex-wrap gap-1.5 justify-center">
                  {[imp.self, ...imp.alive].map((n, i) => {
                    const off = n === imp.lastProt;
                    return (
                      <button
                        key={n}
                        disabled={off}
                        onClick={() => window.dispatchEvent(new CustomEvent('pz-prot', { detail: n }))}
                        className={`px-3 py-1.5 font-mono text-xs border ${imp.prot === n ? 'bg-emerald-700 border-emerald-400 text-white' : off ? 'border-zinc-800 text-zinc-600 line-through' : 'border-emerald-900 text-emerald-200 hover:border-emerald-500'}`}
                      >
                        {i === 0 ? 'Moi' : n}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {imp.me === 'det' && (
              <div className="mt-4 pt-3 border-t border-sky-900">
                {imp.inv ? (
                  <p className="text-sm font-mono text-sky-200">{imp.inv}</p>
                ) : (
                  <>
                    <p className="text-xs font-mono text-sky-300 mb-2">🔍 Détective (secret) : enquêter sur… (une seule fois dans la partie)</p>
                    <div className="flex flex-wrap gap-1.5 justify-center">
                      {imp.alive.map((n) => (
                        <button
                          key={n}
                          onClick={() => window.dispatchEvent(new CustomEvent('pz-inv', { detail: n }))}
                          className="px-3 py-1.5 font-mono text-xs border border-sky-900 text-sky-200 hover:border-sky-500"
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 🎪 The Ringmaster's deal: only you can see it */}
      {pact != null && (
        <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div className="pointer-events-auto max-w-md mx-4 p-5 bg-black/90 border-2 border-amber-600 text-center shadow-[0_0_50px_rgba(217,119,6,0.4)]">
            <div className="text-4xl mb-2">🎩</div>
            <div className="text-[10px] font-mono uppercase tracking-[0.3em] text-amber-400 mb-2">Message du Directeur — vous seul le voyez</div>
            <p className="font-serif italic text-zinc-100 mb-4">« Livre-moi ton ami… et tu sortiras d'ici libre. Il n'en saura rien… jusqu'à ce qu'il soit trop tard. »</p>
            <div className="flex gap-2 justify-center">
              <button
                onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyO' }))}
                className="px-4 py-2 bg-red-700 hover:bg-red-600 text-white font-mono text-xs uppercase tracking-widest"
              >
                [O] Le livrer
              </button>
              <button
                onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyN' }))}
                className="px-4 py-2 border border-zinc-500 text-zinc-200 hover:bg-zinc-800 font-mono text-xs uppercase tracking-widest"
              >
                [N] Refuser
              </button>
            </div>
            <div className="text-xs font-mono text-zinc-500 mt-3">Sans réponse dans {pact} s, c'est non.</div>
          </div>
        </div>
      )}

      {/* 🫣 Hide-and-seek: the seeker counts */}
      {hideCount != null && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center pointer-events-none">
          <div className="text-8xl font-black font-mono text-red-500 drop-shadow-[0_0_20px_rgba(220,38,38,0.8)]">{hideCount}</div>
          <div className="text-sm font-serif italic text-zinc-300 mt-2">Cachez-vous ! Il compte…</div>
        </div>
      )}

      {/* ⏱️ Speedrun */}
      {speedrun && (
        <div className="absolute top-14 right-3 px-3 py-1 bg-black/70 border border-sky-700 font-mono text-right pointer-events-none">
          <div className="text-lg font-bold text-sky-200 tabular-nums">⏱️ {fmtRun(speedrun.time)}</div>
          {speedrun.best != null && (
            <div className={`text-[10px] tabular-nums ${speedrun.time <= speedrun.best ? 'text-emerald-400' : 'text-red-400'}`}>
              Record {fmtRun(speedrun.best)} ({speedrun.time <= speedrun.best ? '-' : '+'}
              {fmtRun(Math.abs(speedrun.best - speedrun.time))})
            </div>
          )}
        </div>
      )}

      {/* 🧟 Survival */}
      {survival && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 px-4 py-1 bg-black/70 border border-red-700 text-red-100 font-mono text-sm flex items-center gap-3">
          <span>🧟 Vague {survival.wave}</span>
          <span className="text-amber-300 font-bold">
            {Math.floor(survival.time / 60)}:{String(Math.floor(survival.time % 60)).padStart(2, '0')}
          </span>
        </div>
      )}

      {/* 🎄 Christmas night presents */}
      {presents != null && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 px-3 py-1 bg-black/70 border border-red-600/80 text-red-100 font-mono text-xs">
          🎁 {presents}/12 cadeaux
        </div>
      )}

      {/* Event treats picked up this run */}
      {runTreats > 0 && treatEmoji && (
        <div className="absolute bottom-[124px] left-1/2 -translate-x-1/2 px-2 py-0.5 bg-black/60 border border-pink-700/60 text-pink-200 font-mono text-[11px]">
          {treatEmoji} {runTreats}
        </div>
      )}

      {/* Hotbar: 5 slots, keys 1-5 */}
      {!isHidden && (
        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex gap-1.5">
          {Array.from({ length: maxSlots }).map((_, i) => {
            const it = items[i];
            return (
              <div
                key={i}
                className={`relative w-12 h-12 flex items-center justify-center border ${
                  i === selectedSlot ? 'border-amber-400 bg-black/80 shadow-[0_0_10px_rgba(250,190,40,0.45)]' : it ? 'bg-black/70 border-zinc-600' : 'bg-black/40 border-zinc-800/80'
                }`}
                title={it?.name}
              >
                <span className="absolute top-0.5 left-1 text-[9px] font-mono text-zinc-500">{i + 1}</span>
                {it && <ItemIcon icon={it.icon} className="w-5 h-5" />}
              </div>
            );
          })}
        </div>
      )}
      {!isHidden && items.length > 0 && flipCharge == null && (
        <div className="absolute bottom-[76px] left-1/2 -translate-x-1/2 text-[9px] font-mono tracking-widest text-zinc-500 whitespace-nowrap">
          {touch
            ? `${items.length}/${maxSlots} — TOUCHER : UTILISER · APPUI LONG : LÂCHER`
            : `${items.length}/${maxSlots} — [1-${maxSlots}] UTILISER · MOLETTE + [X] LÂCHER${hasCan ? ` · CANETTE : [1-${maxSlots}] LANCER · MAINTENIR [B] BOTTLE FLIP` : ''}`}
        </div>
      )}

      {/* Bottle flip charge gauge */}
      {flipCharge != null && (
        <div className="absolute bottom-[78px] left-1/2 -translate-x-1/2 flex flex-col items-center gap-1">
          <span className="text-[10px] font-mono tracking-[0.3em] text-amber-300">BOTTLE FLIP — RELÂCHEZ [B]</span>
          <div className="relative w-56 h-3 bg-zinc-900/90 border border-zinc-600 overflow-hidden">
            <div
              className="h-full"
              style={{
                width: `${flipCharge * 100}%`,
                background: 'linear-gradient(90deg, #22c55e, #eab308, #ef4444)',
              }}
            />
          </div>
          {flipBest > 0 && <span className="text-[9px] font-mono text-zinc-500">Record : {flipBest} d'affilée</span>}
        </div>
      )}

      {/* Bottle flip result */}
      {flipMsg && (
        <div className="absolute top-[30%] left-1/2 -translate-x-1/2 hud-fade-in" key={flipMsg}>
          <span
            className={`font-black tracking-widest ${flipMsg.startsWith('Raté') ? 'text-xl text-zinc-400' : 'text-4xl text-amber-300'}`}
            style={{ textShadow: flipMsg.startsWith('Raté') ? '0 2px 8px #000' : '0 0 24px rgba(250,200,40,0.8), 0 2px 6px #000' }}
          >
            {flipMsg}
          </span>
        </div>
      )}

      {/* Toast */}
      {toastMessage && (
        <div className="absolute bottom-28 left-1/2 -translate-x-1/2 z-20 max-w-[80vw] hud-fade-in" key={toastMessage}>
          <div
            className="px-5 py-2 text-sm font-serif italic text-zinc-100 text-center"
            style={{ background: 'linear-gradient(90deg, transparent, rgba(0,0,0,0.75) 15%, rgba(0,0,0,0.75) 85%, transparent)', textShadow: '0 1px 6px #000' }}
          >
            {toastMessage}
          </div>
        </div>
      )}

      {/* Bottom-left: flashlight + stance */}
      {!isHidden && (
        <div className="absolute bottom-6 left-6 flex flex-col gap-2">
          <div className={`flex items-center gap-2.5 ${lowBattery ? 'animate-pulse' : ''}`}>
            {lowBattery ? (
              <BatteryLow className="w-4 h-4 text-red-500" />
            ) : (
              <Battery className={`w-4 h-4 ${flashlightOn ? 'text-amber-300' : 'text-zinc-500'}`} />
            )}
            <div className="w-28 h-[3px] bg-zinc-800/80">
              <div
                className={`h-full transition-[width] duration-300 ${lowBattery ? 'bg-red-600' : 'bg-amber-300/90'}`}
                style={{ width: `${flashlightBattery}%` }}
              />
            </div>
            <span className="text-[10px] font-mono text-zinc-400">{Math.round(flashlightBattery)}%</span>
            <span className={`text-[10px] font-mono ${flashlightOn ? 'text-amber-300/80' : 'text-zinc-500'}`}>
              {touch ? 'LAMPE' : `[F] ${flashlightOn ? 'ÉTEINDRE' : 'ALLUMER'}`}
            </span>
          </div>
          {isCrouching && (
            <div className="flex items-center gap-2 text-[10px] font-mono tracking-widest text-emerald-300/80">
              <Eye className="w-3.5 h-3.5" />
              <span>ACCROUPI — SILENCIEUX</span>
            </div>
          )}
          {isSprinting && (
            <div className="flex items-center gap-2 text-[10px] font-mono tracking-widest text-red-400/90">
              <Footprints className="w-3.5 h-3.5" />
              <span>VOUS FAITES DU BRUIT</span>
            </div>
          )}
        </div>
      )}

      {/* Bottom-right: stamina (only when used) */}
      {!isHidden && (stamina < maxStamina - 0.5 || isSprinting) && (
        <div className={`absolute flex flex-col gap-1 ${touch ? 'left-6 bottom-12 items-start' : 'bottom-6 right-6 items-end'}`}>
          <span className="text-[10px] font-mono tracking-widest text-zinc-400">SOUFFLE</span>
          <div className="w-32 h-[3px] bg-zinc-800/80">
            <div
              className={`h-full ${staminaPct < 25 ? 'bg-red-500' : 'bg-zinc-200/80'}`}
              style={{ width: `${staminaPct}%`, transition: 'width 120ms linear' }}
            />
          </div>
        </div>
      )}

      {/* Stress gauge (bottom-right, visible even inside a locker) */}
      <div className={`absolute z-30 flex flex-col gap-1 ${touch ? 'left-5 top-[86px] items-start scale-90 origin-top-left' : 'right-6 bottom-20 items-end'}`}>
        <div className="flex items-center gap-2 text-[10px] font-mono tracking-widest" style={{ color: stressColor }}>
          <HeartPulse
            className="w-4 h-4"
            style={{ animation: stress > 0.15 ? `pulse ${Math.max(0.35, 1.2 - stress)}s ease-in-out infinite` : undefined }}
          />
          <span>STRESS — {stressLabel}</span>
        </div>
        <div className="w-40 h-[5px] bg-zinc-900/90 border border-zinc-800 overflow-hidden">
          <div
            className="h-full"
            style={{
              width: `${stressPct}%`,
              background: `linear-gradient(90deg, #eab308, ${stressColor})`,
              boxShadow: stress > 0.6 ? `0 0 10px ${stressColor}` : undefined,
              transition: 'width 150ms linear',
            }}
          />
        </div>
      </div>

      {/* Voice meter (bottom-left, visible even inside a locker) */}
      {micStatus !== 'off' && !touch && (
        <div className="absolute left-6 bottom-28 z-30 flex flex-col gap-1">
          {micStatus === 'on' ? (
            <>
              <div className={`flex items-center gap-2 text-[10px] font-mono tracking-widest ${micLoud ? 'text-red-400' : 'text-zinc-400'}`}>
                <Mic className="w-3.5 h-3.5" />
                <span>{micHeard ? 'IL VOUS A ENTENDU !' : micLoud ? 'VOTRE VOIX PORTE…' : 'VOIX'}</span>
              </div>
              <div className="relative w-28 h-[4px] bg-zinc-900/90 border border-zinc-800">
                <div
                  className={`h-full ${micLoud ? 'bg-red-500' : 'bg-zinc-300/80'}`}
                  style={{ width: `${Math.min(100, micLevel * 100)}%`, transition: 'width 60ms linear' }}
                />
                {/* Threshold: above this line the creature hears you */}
                <div className="absolute top-[-3px] bottom-[-3px] w-px bg-red-500/80" style={{ left: `${MIC_THRESHOLD * 100}%` }} />
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2 text-[10px] font-mono tracking-widest text-zinc-600">
              <MicOff className="w-3.5 h-3.5" />
              <span>{micStatus === 'starting' ? 'MICRO…' : 'MICRO INDISPONIBLE'}</span>
            </div>
          )}
        </div>
      )}

      {micHeard && (
        <div className="absolute inset-0 z-10 pointer-events-none" style={{ boxShadow: 'inset 0 0 90px rgba(200,0,0,0.45)' }} />
      )}

      {versusRole === 'survivor' && timeLeft != null && <VersusTimer timeLeft={timeLeft} role="survivor" />}

      {/* Anti-camping: the creature has not moved for a while */}
      {canBlind && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 z-30 px-4 py-2 bg-black/75 border border-amber-500 text-amber-300 font-mono text-sm tracking-wide animate-pulse">
          Le monstre campe ! [G] pour l'aveugler 5 s
        </div>
      )}

      {race && !spectating && (
        <div className="absolute top-[72px] right-6 z-30 px-3 py-1 bg-black/55 border border-zinc-800 text-[11px] font-mono text-amber-300">
          🏁 COURSE — sortez avant votre rival{partnerDead ? ' (il est tombé !)' : ''}
        </div>
      )}

      {/* Co-op partner status */}
      {partnerName && !versusRole && (
        <div className="absolute top-[72px] right-6 z-30 flex items-center gap-2 px-3 py-1 bg-black/55 border border-zinc-800 text-[11px] font-mono">
          <span className={`w-2 h-2 rounded-full ${partnerDead ? 'bg-red-600' : 'bg-emerald-400 animate-pulse'}`} />
          <span className="text-zinc-300">{partnerName}</span>
          <span className={partnerDead ? 'text-red-400' : 'text-zinc-500'}>{partnerDead ? 'ATTRAPÉ' : 'en vie'}</span>
          {!touch && <span className="text-zinc-600">· [T] emotes</span>}
        </div>
      )}

      {/* Proximity voice chat */}
      {voice && (
        <div className={`absolute ${touch ? 'top-14 left-1/2 -translate-x-1/2' : 'top-[104px] right-6'} z-30 flex items-center gap-3 px-3 py-1 bg-black/55 border border-zinc-800 text-[11px] font-mono pointer-events-none`}>
          {!voice.on ? (
            <span className="flex items-center gap-1.5 text-zinc-500">
              <MicOff className="w-3.5 h-3.5" /> VOCAL : micro non autorisé
            </span>
          ) : voice.muted ? (
            <span className="flex items-center gap-1.5 text-red-400">
              <MicOff className="w-3.5 h-3.5" /> MICRO COUPÉ{touch ? '' : ' [V]'}
            </span>
          ) : (
            <span className={`flex items-center gap-1.5 ${voice.self ? 'text-emerald-300' : 'text-zinc-400'}`}>
              <Mic className={`w-3.5 h-3.5 ${voice.self ? 'animate-pulse' : ''}`} /> {voice.self ? 'VOUS PARLEZ' : 'VOCAL'}
            </span>
          )}
          {voice.partner && <span className="text-amber-300 animate-pulse">🔊 {partnerName ?? (versusRole ? 'une voix…' : 'partenaire')}</span>}
        </div>
      )}

      {/* Spectator banner */}
      {watching && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-30 text-center px-4 py-1.5 bg-black/60 border border-sky-700">
          <div className="text-sky-300 font-mono tracking-[0.3em] text-xs">👀 EN DIRECT</div>
          <div className="text-zinc-200 font-serif italic text-sm">Tu regardes {partnerName} · [Échap] pour quitter</div>
        </div>
      )}
      {spectating && !watching && (
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 z-30 text-center">
          <div className="text-red-500 font-mono tracking-[0.4em] text-sm">FIN DE PARTIE POUR VOUS</div>
          <div className="text-zinc-300 font-serif italic text-base mt-1">Vous suivez {partnerName ?? (race ? 'votre rival' : 'votre partenaire')}…</div>
        </div>
      )}

      {/* Free-look fallback explanation */}
      {freeLook && !isHidden && (
        <div className="absolute top-5 right-6 max-w-[260px] text-right text-[10px] font-mono leading-relaxed text-zinc-500">
          SOURIS LIBRE — bougez la souris pour regarder, approchez-la du bord de l'écran pour continuer à tourner
        </div>
      )}

      {/* Breathing red edges when the creature is near (complements the post-process) */}
      {fear > 0.2 && (
        <div
          className="absolute inset-0"
          style={{
            boxShadow: `inset 0 0 ${120 + fear * 120}px rgba(120,0,0,${fear * 0.5})`,
          }}
        />
      )}
    </div>
  );
};
