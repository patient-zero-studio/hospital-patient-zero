import React, { useEffect, useRef, useState } from 'react';
import { sound } from '../audio/SoundSystem';
import { WHEEL, type BoxResult } from '../economy';

/**
 * 🎡 Wheel of fortune: the server picks the slice, the wheel spins, slows
 * down with clicks, and lands on it.
 */
interface Props {
  onSpin: () => Promise<{ index: number; result: BoxResult; apply: () => void }>;
  onClose: () => void;
}

const N = WHEEL.length;
const SLICE = 360 / N;
const R = 150;
const SPIN_MS = 4800;

const slicePath = (i: number) => {
  const a0 = ((-90 + i * SLICE) * Math.PI) / 180;
  const a1 = ((-90 + (i + 1) * SLICE) * Math.PI) / 180;
  return `M0 0 L${R * Math.cos(a0)} ${R * Math.sin(a0)} A${R} ${R} 0 0 1 ${R * Math.cos(a1)} ${R * Math.sin(a1)} Z`;
};

export const WheelSpin: React.FC<Props> = ({ onSpin, onClose }) => {
  const [angle, setAngle] = useState(0);
  const [phase, setPhase] = useState<'idle' | 'spin' | 'done'>('idle');
  const [result, setResult] = useState<BoxResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [win, setWin] = useState<number | null>(null);
  const apply = useRef<(() => void) | null>(null);
  const raf = useRef(0);

  useEffect(() => () => {
    cancelAnimationFrame(raf.current);
    apply.current?.();
  }, []);

  const spin = async () => {
    if (phase !== 'idle') return;
    sound.init();
    sound.resume();
    setPhase('spin');
    setError(null);
    let r: Awaited<ReturnType<Props['onSpin']>>;
    try {
      r = await onSpin();
    } catch (e) {
      setError((e as Error).message);
      setPhase('idle');
      return;
    }
    apply.current = r.apply;
    const jitter = (Math.random() - 0.5) * SLICE * 0.7;
    const target = 360 * 7 - (r.index + 0.5) * SLICE + jitter;
    const t0 = performance.now();
    let lastSlice = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / SPIN_MS);
      const e = 1 - Math.pow(1 - t, 4);
      const a = target * e;
      setAngle(a);
      const s = Math.floor(a / SLICE);
      if (s !== lastSlice) {
        lastSlice = s;
        sound.playWheelTick();
      }
      if (t < 1) {
        raf.current = requestAnimationFrame(step);
        return;
      }
      setWin(r.index);
      setResult(r.result);
      setPhase('done');
      const big = r.result.kind === 'skin' || (r.result.coins ?? 0) >= 150;
      sound.playChestOpen(r.result.kind === 'skin' ? 3 : (r.result.coins ?? 0) >= 500 ? 4 : big ? 2 : 0);
      if (navigator.vibrate) navigator.vibrate(big ? [60, 40, 160] : 50);
      apply.current?.();
      apply.current = null;
    };
    raf.current = requestAnimationFrame(step);
  };

  const jackpot = phase === 'done' && (result?.coins ?? 0) >= 500;
  const color = win !== null ? WHEEL[win].color : '#d946ef';

  return (
    <div
      className="fixed inset-0 z-[80] flex flex-col items-center justify-center overflow-hidden select-none px-4"
      style={{
        background: jackpot ? 'radial-gradient(circle at 50% 45%, #6a4a00 0%, #2a1400 45%, #000 100%)' : 'radial-gradient(circle at 50% 45%, #2a0630 0%, #000 75%)',
        transition: 'background 0.5s',
      }}
      onClick={() => phase === 'done' && onClose()}
    >
      <div className="font-game uppercase tracking-[0.25em] text-fuchsia-300 text-lg mb-4" style={{ textShadow: '0 0 14px #d946ef' }}>
        🎡 Roue de la chance
      </div>

      <div className="relative" style={{ width: 'min(84vw, 340px)', aspectRatio: '1' }}>
        {/* pointer */}
        <div
          className="absolute left-1/2 -translate-x-1/2 -top-3 z-10"
          style={{ width: 0, height: 0, borderLeft: '16px solid transparent', borderRight: '16px solid transparent', borderTop: '30px solid #fbbf24', filter: 'drop-shadow(0 3px 0 #000) drop-shadow(0 0 8px #fbbf24)' }}
        />
        <svg viewBox="-170 -170 340 340" className="w-full h-full" style={{ filter: `drop-shadow(0 0 ${phase === 'done' ? 30 : 16}px ${color})` }}>
          <circle r="166" fill="#111" stroke="#fbbf24" strokeWidth="6" />
          {Array.from({ length: 24 }, (_, i) => {
            const a = (i / 24) * Math.PI * 2;
            const on = phase === 'spin' ? (i + Math.floor(angle / 20)) % 2 === 0 : i % 2 === 0;
            return <circle key={i} cx={158 * Math.cos(a)} cy={158 * Math.sin(a)} r="4" fill={on ? '#fde68a' : '#78350f'} />;
          })}
          <g transform={`rotate(${angle})`}>
            {WHEEL.map((s, i) => {
              const mid = -90 + (i + 0.5) * SLICE;
              const lit = phase === 'done' && win === i;
              return (
                <g key={i}>
                  <path d={slicePath(i)} fill={s.color} stroke="#000" strokeWidth="3" opacity={phase === 'done' && !lit ? 0.45 : 1} />
                  <text
                    transform={`rotate(${mid}) translate(${R * 0.6} 0)`}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="#fff"
                    fontSize="17"
                    fontWeight="900"
                    style={{ paintOrder: 'stroke', stroke: '#000', strokeWidth: 4 }}
                  >
                    {s.label}
                  </text>
                </g>
              );
            })}
          </g>
          <circle r="24" fill="#fbbf24" stroke="#000" strokeWidth="4" />
          <text textAnchor="middle" dominantBaseline="central" fontSize="20">
            💀
          </text>
        </svg>
      </div>

      <div className="h-28 mt-6 flex flex-col items-center text-center">
        {phase === 'idle' && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              spin();
            }}
            className="px-8 py-3 bg-fuchsia-600 hover:bg-fuchsia-500 text-black font-game uppercase tracking-widest text-lg animate-pulse"
            style={{ boxShadow: '0 0 24px #d946ef' }}
          >
            Tourner !
          </button>
        )}
        {phase === 'spin' && <div className="font-mono text-fuchsia-200 text-sm animate-pulse">Ça tourne…</div>}
        {phase === 'done' && result && (
          <div style={{ animation: 'chest-item 0.5s cubic-bezier(.2,1.6,.4,1) both' }}>
            <div className="font-game uppercase" style={{ color: jackpot ? '#fde047' : '#f0abfc', fontSize: jackpot ? 34 : 24, textShadow: `0 0 16px ${jackpot ? '#fbbf24' : '#d946ef'}, 0 3px 0 #000` }}>
              {jackpot ? '★ Jackpot ! ★' : 'Gagné !'}
            </div>
            <div className="text-xl font-black text-zinc-100 mt-1 max-w-md" style={{ textShadow: '0 2px 0 #000' }}>
              {result.text}
            </div>
            <div className="text-[11px] font-mono text-zinc-400 mt-3 animate-pulse">Touche pour continuer</div>
          </div>
        )}
        {error && <div className="text-red-400 font-mono text-xs mt-2">{error}</div>}
        {phase === 'idle' && (
          <button onClick={onClose} className="mt-3 text-[11px] font-mono text-zinc-500 hover:text-zinc-300 uppercase tracking-widest">
            Plus tard
          </button>
        )}
      </div>
    </div>
  );
};
