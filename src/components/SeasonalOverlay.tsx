import React, { useMemo } from 'react';
import type { Season } from '../seasons';

/** Menu decoration: falling snow + lights for Christmas, bats / ghosts / pumpkins for Halloween. */
export const SeasonalOverlay: React.FC<{ season: Season }> = ({ season }) => {
  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const items = useMemo(() => {
    let s = season === 'noel' ? 7 : 13;
    const r = () => {
      s = (s * 9301 + 49297) % 233280;
      return s / 233280;
    };
    const n = season === 'noel' ? 46 : 16;
    return Array.from({ length: n }, (_, i) => ({
      left: r() * 100,
      size: season === 'noel' ? 8 + r() * 14 : 18 + r() * 18,
      dur: season === 'noel' ? 7 + r() * 9 : 9 + r() * 10,
      delay: -r() * 16,
      drift: (r() - 0.5) * 80,
      glyph: season === 'noel' ? (i % 5 === 0 ? '❅' : '❄') : ['🦇', '🦇', '👻', '🦇', '🕸️'][i % 5],
      top: r() * 70,
    }));
  }, [season]);

  const bulbs = season === 'noel' ? ['#ff2a2a', '#2aff5a', '#ffd21a', '#3a8aff', '#ff5ad8'] : ['#ff7a00', '#a040ff', '#7aff2a'];

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-[5]" aria-hidden>
      <style>{`
        @keyframes pz-fall { from { transform: translate(0, -10vh) rotate(0deg); } to { transform: translate(var(--drift), 110vh) rotate(360deg); } }
        @keyframes pz-fly { 0% { transform: translate(-15vw, 0) scaleX(1); } 50% { transform: translate(55vw, -6vh) scaleX(1); } 100% { transform: translate(120vw, 4vh) scaleX(1); } }
        @keyframes pz-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.25; } }
      `}</style>
      {/* Garland of lights across the top */}
      <svg className="absolute top-0 left-0 w-full h-10" viewBox="0 0 100 10" preserveAspectRatio="none">
        <path d="M0 1 Q 12.5 8 25 1 T 50 1 T 75 1 T 100 1" stroke={season === 'noel' ? '#1f4a1f' : '#222'} strokeWidth="0.4" fill="none" />
      </svg>
      <div className="absolute top-0 left-0 w-full h-10">
        {Array.from({ length: 24 }).map((_, i) => {
          const x = (i + 0.5) / 24;
          const y = Math.abs(Math.sin(x * Math.PI * 4)) * 70 + 10;
          return (
            <span
              key={i}
              className="absolute rounded-full"
              style={{
                left: `${x * 100}%`,
                top: `${y}%`,
                width: 9,
                height: 12,
                background: bulbs[i % bulbs.length],
                boxShadow: `0 0 10px 3px ${bulbs[i % bulbs.length]}`,
                animation: reduce ? undefined : `pz-blink ${1.2 + (i % 4) * 0.4}s ease-in-out ${(i % 3) * 0.3}s infinite`,
              }}
            />
          );
        })}
      </div>
      {!reduce &&
        items.map((it, i) =>
          season === 'noel' ? (
            <span
              key={i}
              className="absolute text-white/80"
              style={{
                left: `${it.left}%`,
                top: 0,
                fontSize: it.size,
                ['--drift' as string]: `${it.drift}px`,
                animation: `pz-fall ${it.dur}s linear ${it.delay}s infinite`,
                textShadow: '0 0 6px rgba(255,255,255,0.6)',
              }}
            >
              {it.glyph}
            </span>
          ) : (
            <span
              key={i}
              className="absolute opacity-70"
              style={{ top: `${it.top}%`, left: 0, fontSize: it.size, animation: `pz-fly ${it.dur}s linear ${it.delay}s infinite`, filter: 'drop-shadow(0 0 6px rgba(160,64,255,0.6))' }}
            >
              {it.glyph}
            </span>
          )
        )}
      {/* Corners */}
      {season === 'halloween' ? (
        <>
          <span className="absolute bottom-3 left-3 text-5xl drop-shadow-[0_0_18px_rgba(255,140,0,0.9)]">🎃</span>
          <span className="absolute bottom-3 right-3 text-4xl drop-shadow-[0_0_18px_rgba(255,140,0,0.9)]">🎃</span>
          <span className="absolute top-8 right-2 text-6xl opacity-60">🕸️</span>
        </>
      ) : (
        <>
          <span className="absolute bottom-3 left-3 text-5xl drop-shadow-[0_0_14px_rgba(255,255,255,0.5)]">🎄</span>
          <span className="absolute bottom-3 right-3 text-4xl">🎁</span>
          <div className="absolute bottom-0 left-0 w-full h-6 bg-gradient-to-t from-white/25 to-transparent" />
        </>
      )}
    </div>
  );
};
