import React, { useEffect, useMemo, useRef, useState } from 'react';
import { sound } from '../audio/SoundSystem';

/**
 * 🎁 Chest opening, Brawl-style: the chest shakes harder and harder, bursts
 * open in the colour of what's inside, and the prize pops out. A legendary
 * turns the whole screen gold.
 */
interface Props {
  /** box name and colour */
  name: string;
  color: string;
  /** null while the server answers */
  ready: boolean;
  /** what's inside */
  prize: {
    /** rarity colour (gold for coins, blue for supplies, the skin tier colour...) */
    color: string;
    /** "Légendaire", "Exclusif", "Pièces"... */
    label: string;
    /** 0 coins/supplies, 1 small, 2 style, 3 exclusive, 4 legendary */
    rank: number;
    text: string;
    icon: React.ReactNode;
    /** the 3D model wearing the skin */
    preview?: React.ReactNode;
  } | null;
  onClose: () => void;
}

const SHAKE_MS = 1700;

export const ChestReveal: React.FC<Props> = ({ name, color, ready, prize, onClose }) => {
  const [phase, setPhase] = useState<'shake' | 'burst' | 'show'>('shake');
  const [k, setK] = useState(1);
  const start = useRef(performance.now());
  const legend = (prize?.rank ?? 0) >= 4;
  const glow = prize && phase !== 'shake' ? prize.color : color;

  // Shaking harder and harder (with thumps), then the burst
  useEffect(() => {
    sound.init();
    sound.resume();
    const id = window.setInterval(() => {
      const el = performance.now() - start.current;
      setK(1 + Math.min(3, el / 500));
      sound.playChestRattle(Math.min(1, 0.4 + el / 2000));
    }, 260);
    return () => window.clearInterval(id);
  }, []);
  useEffect(() => {
    if (!ready || !prize || phase !== 'shake') return;
    const wait = Math.max(0, SHAKE_MS - (performance.now() - start.current));
    const t = window.setTimeout(() => {
      setPhase('burst');
      sound.playChestOpen(prize.rank);
      if (navigator.vibrate) navigator.vibrate(prize.rank >= 4 ? [80, 40, 200] : 60);
    }, wait);
    return () => window.clearTimeout(t);
  }, [ready, prize, phase]);
  useEffect(() => {
    if (phase !== 'burst') return;
    const t = window.setTimeout(() => setPhase('show'), legend ? 900 : 550);
    return () => window.clearTimeout(t);
  }, [phase, legend]);

  const particles = useMemo(
    () =>
      Array.from({ length: 34 }, (_, i) => {
        const a = (i / 34) * Math.PI * 2 + Math.random() * 0.3;
        const d = 140 + Math.random() * 260;
        return { dx: Math.cos(a) * d, dy: Math.sin(a) * d - 40, s: 6 + Math.random() * 10, delay: Math.random() * 0.12, star: i % 3 === 0 };
      }),
    []
  );

  const shaking = phase === 'shake';
  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center overflow-hidden select-none"
      style={{
        background: legend && phase !== 'shake' ? 'radial-gradient(circle at 50% 45%, #6a4a00 0%, #2a1400 45%, #000 100%)' : 'radial-gradient(circle at 50% 45%, #1a0606 0%, #000 75%)',
        transition: 'background 0.5s',
        animation: phase === 'burst' ? `chest-quake ${legend ? 0.12 : 0.1}s linear ${legend ? 6 : 3}` : undefined,
      }}
      onClick={() => phase === 'show' && onClose()}
    >
      {/* turning light rays */}
      <div
        className="absolute pointer-events-none"
        style={{
          width: '160vmax',
          height: '160vmax',
          background: `repeating-conic-gradient(from 0deg, ${glow}${phase === 'shake' ? '22' : legend ? '88' : '55'} 0deg 9deg, transparent 9deg 24deg)`,
          WebkitMaskImage: 'radial-gradient(circle, #000 0%, transparent 55%)',
          maskImage: 'radial-gradient(circle, #000 0%, transparent 55%)',
          animation: `menu-rays ${phase === 'shake' ? 18 : 9}s linear infinite`,
          transition: 'background 0.3s',
        }}
      />
      {/* big halo */}
      <div
        className="absolute rounded-full pointer-events-none"
        style={{
          width: phase === 'shake' ? 220 + k * 30 : legend ? 620 : 460,
          height: phase === 'shake' ? 220 + k * 30 : legend ? 620 : 460,
          background: `radial-gradient(circle, ${glow}${phase === 'shake' ? '55' : 'aa'} 0%, transparent 65%)`,
          transition: 'all 0.3s',
        }}
      />

      {/* the chest */}
      {phase !== 'show' && (
        <div className="relative" style={{ width: 200, height: 170, animation: shaking ? `chest-shake ${Math.max(0.09, 0.32 - k * 0.06)}s linear infinite` : undefined, ['--k' as string]: k }}>
          {/* lid */}
          <div
            className="absolute left-0 right-0 top-0"
            style={{
              height: 66,
              borderRadius: '40px 40px 6px 6px',
              background: 'linear-gradient(#5a1010, #2a0606)',
              border: '4px solid #000',
              boxShadow: `inset 0 -6px 0 rgba(0,0,0,0.4), 0 0 ${10 + k * 10}px ${color}`,
              animation: phase === 'burst' ? 'chest-lid 0.55s ease-out forwards' : undefined,
              zIndex: 2,
            }}
          >
            <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-6" style={{ background: 'linear-gradient(#f5c84a, #a8761a)', borderLeft: '3px solid #000', borderRight: '3px solid #000' }} />
          </div>
          {/* body */}
          <div
            className="absolute left-0 right-0 bottom-0"
            style={{ height: 110, borderRadius: '6px 6px 14px 14px', background: 'linear-gradient(#3a0a0a, #160303)', border: '4px solid #000', boxShadow: `0 0 ${16 + k * 14}px ${color}aa` }}
          >
            <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-6" style={{ background: 'linear-gradient(#f5c84a, #a8761a)', borderLeft: '3px solid #000', borderRight: '3px solid #000' }} />
            {[18, 74].map((y) => (
              <div key={y} className="absolute left-0 right-0 h-2.5" style={{ top: y, background: '#a8761a', borderTop: '2px solid #000', borderBottom: '2px solid #000' }} />
            ))}
            {/* lock */}
            <div
              className="absolute left-1/2 -translate-x-1/2 -top-3 w-11 h-12 rounded-md flex items-center justify-center font-black text-xl"
              style={{ background: 'linear-gradient(#ffe08a, #c8901a)', border: '3px solid #000', color: '#3a1a00', boxShadow: `0 0 ${k * 8}px ${color}` }}
            >
              ?
            </div>
            {/* light leaking through the cracks */}
            <div className="absolute -top-1 left-2 right-2 h-1.5 rounded-full" style={{ background: color, boxShadow: `0 0 ${k * 12}px ${k * 3}px ${color}`, opacity: Math.min(1, k / 3) }} />
          </div>
        </div>
      )}

      {/* burst: flash + particles */}
      {phase !== 'shake' && (
        <>
          <div className="absolute inset-0 pointer-events-none" style={{ background: legend ? '#fff3c0' : '#fff', animation: `chest-flash ${legend ? 0.9 : 0.5}s ease-out forwards` }} />
          {particles.map((p, i) => (
            <span
              key={i}
              className="absolute pointer-events-none"
              style={{
                width: p.s,
                height: p.s,
                background: p.star ? '#fff' : prize?.color,
                borderRadius: p.star ? 2 : '50%',
                boxShadow: `0 0 10px ${prize?.color}`,
                transform: p.star ? 'rotate(45deg)' : undefined,
                ['--dx' as string]: `${p.dx * (legend ? 1.4 : 1)}px`,
                ['--dy' as string]: `${p.dy * (legend ? 1.4 : 1)}px`,
                animation: `chest-particle ${legend ? 1.4 : 0.9}s ease-out ${p.delay}s forwards`,
              }}
            />
          ))}
        </>
      )}

      {/* the prize */}
      {phase === 'show' && prize && (
        <div className="relative flex flex-col items-center text-center px-4" style={{ animation: 'chest-item 0.5s cubic-bezier(.2,1.6,.4,1) both' }}>
          <div className="font-game uppercase tracking-[0.25em] text-[12px] mb-1" style={{ color }}>
            {name}
          </div>
          <div
            className="font-game uppercase mb-3"
            style={{
              color: prize.color,
              fontSize: legend ? 40 : prize.rank >= 3 ? 30 : 22,
              textShadow: `0 0 18px ${prize.color}, 0 3px 0 #000`,
              animation: legend ? 'title-flicker 2.5s infinite' : undefined,
            }}
          >
            {legend ? '★ Légendaire ! ★' : prize.label}
          </div>
          {prize.preview ? (
            <div className="rounded-xl overflow-hidden" style={{ boxShadow: `0 0 40px ${prize.color}aa`, border: `3px solid ${prize.color}` }}>
              {prize.preview}
            </div>
          ) : (
            <div
              className="w-36 h-36 flex items-center justify-center text-7xl rounded-2xl"
              style={{ border: `4px solid ${prize.color}`, boxShadow: `0 0 50px ${prize.color}`, background: `radial-gradient(circle, ${prize.color}55, #000)` }}
            >
              {prize.icon}
            </div>
          )}
          <div className="mt-4 text-2xl font-black text-zinc-100 max-w-md" style={{ textShadow: '0 2px 0 #000' }}>
            {prize.text}
          </div>
          <div className="text-[11px] font-mono text-zinc-400 mt-5 animate-pulse">Touche pour continuer</div>
        </div>
      )}
      {phase === 'shake' && (
        <div className="absolute bottom-[18%] font-game uppercase tracking-[0.3em] text-[13px]" style={{ color }}>
          {name}…
        </div>
      )}
    </div>
  );
};
