import React, { useEffect, useRef, useState } from 'react';
import { Backpack, Eye, Flashlight, Hand, Mic, MicOff, Pause, PersonStanding, Trash2, Zap } from 'lucide-react';
import type { GameEngine, HudSnapshot } from '../game/Engine';

/** True on phones / tablets (finger, no mouse). */
export const IS_TOUCH =
  typeof window !== 'undefined' &&
  ((typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window || navigator.maxTouchPoints > 0) &&
  !(typeof matchMedia === 'function' && matchMedia('(pointer: fine)').matches && !('ontouchstart' in window));

/** Fullscreen + landscape when the browser allows it (Android Chrome does, iOS Safari partly). */
export const enterMobileFullscreen = async () => {
  try {
    const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
    if (!document.fullscreenElement) {
      if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' } as FullscreenOptions);
      else el.webkitRequestFullscreen?.();
    }
    const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    await o?.lock?.('landscape').catch(() => {});
  } catch {
    /* not allowed: playing in the browser window is fine too */
  }
};

const STICK_R = 56;

interface Props {
  engine: GameEngine | null;
  hud: HudSnapshot;
  onInventory: () => void;
  onPause: () => void;
}

/** A round button that reacts on touch-down (no 300 ms click delay). */
const Btn: React.FC<{
  onDown: () => void;
  onUp?: () => void;
  className: string;
  active?: boolean;
  children: React.ReactNode;
  label?: string;
}> = ({ onDown, onUp, className, active, children, label }) => (
  <button
    onPointerDown={(e) => {
      e.stopPropagation();
      e.preventDefault();
      onDown();
    }}
    onPointerUp={(e) => {
      e.stopPropagation();
      onUp?.();
    }}
    onPointerCancel={() => onUp?.()}
    onContextMenu={(e) => e.preventDefault()}
    className={`absolute pointer-events-auto rounded-full flex flex-col items-center justify-center select-none border backdrop-blur-[1px] active:scale-95 transition-transform ${
      active ? 'bg-amber-500/40 border-amber-300 text-amber-100' : 'bg-black/35 border-white/25 text-zinc-100'
    } ${className}`}
    style={{ touchAction: 'none' }}
  >
    {children}
    {label && <span className="text-[8px] font-mono uppercase tracking-wider mt-0.5 opacity-80">{label}</span>}
  </button>
);

/**
 * On-screen controls for phones: a virtual joystick on the left, drag on the
 * right to look around, and big buttons for the actions.
 */
export const TouchControls: React.FC<Props> = ({ engine, hud, onInventory, onPause }) => {
  const stickRef = useRef<{ id: number; ox: number; oy: number } | null>(null);
  const lookRef = useRef<{ id: number; x: number; y: number } | null>(null);
  const [knob, setKnob] = useState<{ ox: number; oy: number; dx: number; dy: number } | null>(null);
  const [sprint, setSprint] = useState(false);
  const pressTimer = useRef<number | null>(null);
  const monster = hud.versusRole === 'monster';

  // Release everything when the controls disappear (menu, death…)
  useEffect(
    () => () => {
      if (engine) {
        engine.player.touchMove = { x: 0, y: 0 };
        engine.player.touchSprint = false;
      }
    },
    [engine]
  );
  useEffect(() => {
    if (engine) engine.player.touchSprint = sprint;
  }, [sprint, engine]);
  // Running stops by itself when you let go of the stick
  useEffect(() => {
    if (!knob && sprint) setSprint(false);
  }, [knob, sprint]);

  if (!engine) return null;
  const p = engine.player;

  // ---- Left half: joystick (appears where the thumb lands) ----
  const stickDown = (e: React.PointerEvent) => {
    if (stickRef.current) return;
    try {
      (e.target as Element).setPointerCapture(e.pointerId);
    } catch {
      /* synthetic pointer */
    }
    stickRef.current = { id: e.pointerId, ox: e.clientX, oy: e.clientY };
    setKnob({ ox: e.clientX, oy: e.clientY, dx: 0, dy: 0 });
  };
  const stickMove = (e: React.PointerEvent) => {
    const s = stickRef.current;
    if (!s || s.id !== e.pointerId) return;
    let dx = e.clientX - s.ox;
    let dy = e.clientY - s.oy;
    const len = Math.hypot(dx, dy);
    if (len > STICK_R) {
      dx = (dx / len) * STICK_R;
      dy = (dy / len) * STICK_R;
    }
    p.touchMove = { x: dx / STICK_R, y: -dy / STICK_R };
    setKnob({ ox: s.ox, oy: s.oy, dx, dy });
  };
  const stickUp = (e: React.PointerEvent) => {
    if (stickRef.current?.id !== e.pointerId) return;
    stickRef.current = null;
    p.touchMove = { x: 0, y: 0 };
    setKnob(null);
  };

  // ---- Right half: drag to look around ----
  const lookDown = (e: React.PointerEvent) => {
    if (lookRef.current) return;
    try {
      (e.target as Element).setPointerCapture(e.pointerId);
    } catch {
      /* synthetic pointer */
    }
    lookRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
  };
  const lookMove = (e: React.PointerEvent) => {
    const l = lookRef.current;
    if (!l || l.id !== e.pointerId) return;
    p.touchLook(e.clientX - l.x, e.clientY - l.y);
    l.x = e.clientX;
    l.y = e.clientY;
  };
  const lookUp = (e: React.PointerEvent) => {
    if (lookRef.current?.id === e.pointerId) lookRef.current = null;
  };

  const hasCan = hud.items.some((i) => i.type === 'throwable');
  const hint = hud.hint;

  // Hotbar: tap = use, hold = drop
  const slotDown = (i: number) => {
    pressTimer.current = window.setTimeout(() => {
      pressTimer.current = null;
      engine.dropSlot(i);
      navigator.vibrate?.(30);
    }, 500);
  };
  const slotUp = (i: number) => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
      engine.useSlot(i);
    }
  };

  return (
    <div className="absolute inset-0 z-20 select-none" style={{ touchAction: 'none' }}>
      {/* Zones */}
      <div className="absolute left-0 top-0 bottom-0 w-[45%]" onPointerDown={stickDown} onPointerMove={stickMove} onPointerUp={stickUp} onPointerCancel={stickUp} />
      <div className="absolute right-0 top-0 bottom-0 w-[55%]" onPointerDown={lookDown} onPointerMove={lookMove} onPointerUp={lookUp} onPointerCancel={lookUp} />

      {/* Joystick */}
      {knob ? (
        <div className="absolute pointer-events-none" style={{ left: knob.ox - STICK_R, top: knob.oy - STICK_R }}>
          <div className="rounded-full border-2 border-white/25 bg-white/5" style={{ width: STICK_R * 2, height: STICK_R * 2 }} />
          <div
            className="absolute rounded-full bg-white/35 border border-white/60"
            style={{ width: 50, height: 50, left: STICK_R - 25 + knob.dx, top: STICK_R - 25 + knob.dy }}
          />
        </div>
      ) : (
        <div className="absolute left-10 bottom-24 pointer-events-none opacity-40">
          <div className="rounded-full border-2 border-dashed border-white/30 flex items-center justify-center text-[9px] font-mono text-white/70" style={{ width: STICK_R * 2, height: STICK_R * 2 }}>
            BOUGER
          </div>
        </div>
      )}

      {/* Top-right: bag & pause */}
      <Btn onDown={onPause} className="top-3 right-3 w-11 h-11">
        <Pause className="w-5 h-5" />
      </Btn>
      {!monster && (
        <Btn onDown={onInventory} className="top-3 right-16 w-11 h-11">
          <Backpack className="w-5 h-5" />
        </Btn>
      )}
      {hud.voice && (
        <Btn
          onDown={() => engine.toggleVoiceMute()}
          active={hud.voice.on && !hud.voice.muted}
          className={`top-3 ${monster ? 'right-16' : 'right-[116px]'} w-11 h-11 ${hud.voice.self ? 'ring-2 ring-emerald-400' : ''}`}
        >
          {hud.voice.on && !hud.voice.muted ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5 text-red-400" />}
        </Btn>
      )}

      {/* Action cluster (bottom-right) */}
      <Btn onDown={() => engine.interact()} className={`right-6 bottom-24 w-20 h-20 ${hint ? 'ring-2 ring-red-500/80' : ''}`} label={monster ? 'Attraper' : 'Action'}>
        <Hand className="w-8 h-8" />
      </Btn>
      {!monster && (
        <Btn onDown={() => engine.toggleFlashlight()} active={hud.flashlightOn} className="right-28 bottom-20 w-14 h-14" label="Lampe">
          <Flashlight className="w-5 h-5" />
        </Btn>
      )}
      <Btn onDown={() => p.toggleCrouch()} active={hud.crouching} className="right-28 bottom-40 w-14 h-14" label={monster ? 'Furtif' : 'Accroupi'}>
        <PersonStanding className="w-5 h-5" />
      </Btn>
      <Btn onDown={() => setSprint((s) => !s)} active={sprint} className="right-6 bottom-48 w-14 h-14" label="Courir">
        <Zap className="w-5 h-5" />
      </Btn>
      {!monster && hasCan && (
        <Btn onDown={() => engine.flipPress()} onUp={() => engine.flipRelease()} className="right-48 bottom-20 w-14 h-14" label="Flip">
          <span className="text-lg">🥤</span>
        </Btn>
      )}
      {!monster && hud.objective?.includes('[R] craie') && (
        <Btn onDown={() => engine.drawChalk()} className="right-48 bottom-20 w-14 h-14" label="Craie">
          <span className="text-lg">✏️</span>
        </Btn>
      )}
      {!monster && hud.objective?.includes('[R] lampe UV') && (
        <Btn onDown={() => engine.drawChalk()} className="right-48 bottom-20 w-14 h-14" label="UV">
          <span className="text-lg">🟣</span>
        </Btn>
      )}
      {hud.canBlind && (
        <Btn onDown={() => engine.blindPress()} className="right-48 bottom-40 w-16 h-16 bg-amber-600/50 animate-pulse" label="Aveugler">
          <Eye className="w-6 h-6" />
        </Btn>
      )}

      {/* Hotbar overlay (same place as the HUD hotbar): tap = use, hold = drop */}
      {!monster && !hud.hidden && (
        <>
          <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex gap-1.5">
            {Array.from({ length: hud.maxSlots }).map((_, i) => (
              <button
                key={i}
                className="w-12 h-12 pointer-events-auto"
                style={{ touchAction: 'none' }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  slotDown(i);
                }}
                onPointerUp={(e) => {
                  e.stopPropagation();
                  slotUp(i);
                }}
                onContextMenu={(e) => e.preventDefault()}
              />
            ))}
          </div>
          {hud.items.length > 0 && (
            <Btn onDown={() => engine.dropSlot(hud.selectedSlot)} className="bottom-6 left-[calc(50%+142px)] w-10 h-10">
              <Trash2 className="w-4 h-4" />
            </Btn>
          )}
        </>
      )}
    </div>
  );
};

/** Asks to turn the phone sideways. */
export const RotateHint: React.FC = () => {
  const [portrait, setPortrait] = useState(() => window.innerHeight > window.innerWidth);
  useEffect(() => {
    const on = () => setPortrait(window.innerHeight > window.innerWidth);
    window.addEventListener('resize', on);
    window.addEventListener('orientationchange', on);
    return () => {
      window.removeEventListener('resize', on);
      window.removeEventListener('orientationchange', on);
    };
  }, []);
  if (!portrait) return null;
  return (
    <div className="fixed inset-0 z-[95] bg-black/95 flex flex-col items-center justify-center text-center p-6">
      <div className="text-6xl mb-4 animate-[spin_2.5s_ease-in-out_infinite]">📱</div>
      <div className="text-lg font-mono uppercase tracking-widest text-zinc-100">Tourne ton téléphone</div>
      <div className="text-sm font-serif italic text-zinc-400 mt-2">Le jeu se joue en mode paysage.</div>
    </div>
  );
};
