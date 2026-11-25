import React, { useMemo } from 'react';
import { SEASON_INFO, type Season } from '../seasons';

const CORNERS: Record<Season, [string, string]> = {
  noel: ['🎄', '🎁'],
  halloween: ['🎃', '🎃'],
  paques: ['🧺', '🐰'],
  valentin: ['🌹', '💝'],
  poisson: ['🐠', '🤡'],
  chevaliers: ['🛡️', '🏰'],
};

/** Menu decoration: things falling (snow, petals, hearts) or flying (bats, fish) + a garland of lights. */
export const SeasonalOverlay: React.FC<{ season: Season }> = ({ season }) => {
  const info = SEASON_INFO[season];
  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const items = useMemo(() => {
    let s = season.length * 7 + 3;
    const r = () => {
      s = (s * 9301 + 49297) % 233280;
      return s / 233280;
    };
    const n = info.fly ? 16 : 40;
    return Array.from({ length: n }, (_, i) => ({
      left: r() * 100,
      size: info.fly ? 18 + r() * 18 : season === 'noel' ? 8 + r() * 14 : 12 + r() * 12,
      dur: info.fly ? 9 + r() * 10 : 7 + r() * 9,
      delay: -r() * 16,
      drift: (r() - 0.5) * 80,
      glyph: info.falling[i % info.falling.length],
      top: r() * 70,
    }));
  }, [season, info]);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-[5]" aria-hidden>
      <style>{`
        @keyframes pz-fall { from { transform: translate(0, -10vh) rotate(0deg); } to { transform: translate(var(--drift), 110vh) rotate(360deg); } }
        @keyframes pz-fly { 0% { transform: translate(-15vw, 0); } 50% { transform: translate(55vw, -6vh); } 100% { transform: translate(120vw, 4vh); } }
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
          const c = info.bulbs[i % info.bulbs.length];
          return (
            <span
              key={i}
              className="absolute rounded-full"
              style={{
                left: `${x * 100}%`,
                top: `${y}%`,
                width: 9,
                height: 12,
                background: c,
                boxShadow: `0 0 10px 3px ${c}`,
                animation: reduce ? undefined : `pz-blink ${1.2 + (i % 4) * 0.4}s ease-in-out ${(i % 3) * 0.3}s infinite`,
              }}
            />
          );
        })}
      </div>
      {!reduce &&
        items.map((it, i) =>
          info.fly ? (
            <span
              key={i}
              className="absolute opacity-70"
              style={{ top: `${it.top}%`, left: 0, fontSize: it.size, animation: `pz-fly ${it.dur}s linear ${it.delay}s infinite`, filter: `drop-shadow(0 0 6px ${info.accent}99)` }}
            >
              {it.glyph}
            </span>
          ) : (
            <span
              key={i}
              className={`absolute ${season === 'noel' ? 'text-white/80' : 'opacity-80'}`}
              style={{
                left: `${it.left}%`,
                top: 0,
                fontSize: it.size,
                ['--drift' as string]: `${it.drift}px`,
                animation: `pz-fall ${it.dur}s linear ${it.delay}s infinite`,
                textShadow: season === 'noel' ? '0 0 6px rgba(255,255,255,0.6)' : undefined,
              }}
            >
              {it.glyph}
            </span>
          )
        )}
      {/* Corners */}
      <span className="absolute bottom-3 left-3 text-5xl" style={{ filter: `drop-shadow(0 0 16px ${info.color})` }}>
        {CORNERS[season][0]}
      </span>
      <span className="absolute bottom-3 right-3 text-4xl" style={{ filter: `drop-shadow(0 0 16px ${info.color})` }}>
        {CORNERS[season][1]}
      </span>
      {season === 'halloween' && <span className="absolute top-8 right-2 text-6xl opacity-60">🕸️</span>}
      {season === 'noel' && <div className="absolute bottom-0 left-0 w-full h-6 bg-gradient-to-t from-white/25 to-transparent" />}
    </div>
  );
};
