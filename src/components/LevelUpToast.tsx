import React, { useEffect } from 'react';
import { levelColor } from '../levels';

/** 🎉 "NIVEAU 12 !" banner, shown a few seconds after a level up. */
export const LevelUpToast: React.FC<{ level: number; coins: number; onDone: () => void }> = ({ level, coins, onDone }) => {
  useEffect(() => {
    const t = setTimeout(onDone, 4500);
    return () => clearTimeout(t);
  }, [level, onDone]);
  const c = levelColor(level);
  return (
    <div className="fixed top-16 left-1/2 -translate-x-1/2 z-[95] pointer-events-none select-none" role="status">
      <style>{`@keyframes pz-lvl { 0% { transform: scale(0.4); opacity: 0; } 15% { transform: scale(1.12); opacity: 1; } 25% { transform: scale(1); } 85% { opacity: 1; } 100% { opacity: 0; transform: translateY(-12px); } }`}</style>
      <div
        className="px-8 py-4 border-2 bg-black/90 text-center"
        style={{ borderColor: c, boxShadow: `0 0 50px ${c}88`, animation: 'pz-lvl 4.5s ease-out forwards' }}
      >
        <div className="text-[11px] font-mono uppercase tracking-[0.5em] text-zinc-400">Niveau supérieur</div>
        <div className="font-serif font-black text-4xl tracking-widest" style={{ color: c }}>
          ⭐ NIVEAU {level}
        </div>
        {coins > 0 && <div className="text-sm font-mono text-amber-300 mt-1">🪙 +{coins} pièces</div>}
      </div>
    </div>
  );
};
