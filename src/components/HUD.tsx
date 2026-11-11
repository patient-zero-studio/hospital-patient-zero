import React from 'react';
import { Battery, BatteryLow, Eye, Footprints, HeartPulse, Mic, MicOff } from 'lucide-react';
import type { MicStatus } from '../audio/MicListener';
import type { GameItem } from '../types';
import { ItemIcon } from './ItemIcon';
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
  selectedSlot = 0,
  touch = false,
  screamer,
  flipCharge,
  flipMsg,
  flipBest = 0,
  partnerName,
  partnerDead,
  spectating,
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
        {timeLeft != null && <VersusTimer timeLeft={timeLeft} role="monster" />}
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
            : `${items.length}/${maxSlots} — [1-5] UTILISER · MOLETTE + [X] LÂCHER${hasCan ? ' · CANETTE : [1-5] LANCER · MAINTENIR [B] BOTTLE FLIP' : ''}`}
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
      {spectating && (
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
