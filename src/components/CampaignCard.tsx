import React, { useEffect } from 'react';
import { fmtTime } from '../challenges';

const NAMES: Record<number, { icon: string; name: string; line: string }> = {
  2: { icon: '🐀', name: 'Les Égouts', line: 'Sous l\'hôpital, l\'eau noire et quelque chose qui écoute.' },
  3: { icon: '🌀', name: 'Le Dédale', line: 'Des tunnels sans fin. Quelqu\'un suit ta trace.' },
  4: { icon: '🌲', name: 'La Forêt', line: 'La pluie, une tour radio, et une silhouette entre les arbres.' },
  5: { icon: '🟣', name: 'Le Site B', line: 'Là où tout a commencé. Là où tout doit finir.' },
};

/** Campaign: black screen between two chapters (click / Enter to go on: it needs a gesture to lock the mouse). */
export const CampaignCard: React.FC<{
  done: string;
  next: number;
  time: number;
  items: number;
  onContinue: () => void;
  onQuit: () => void;
}> = ({ done, next, time, items, onContinue, onQuit }) => {
  const n = NAMES[next];
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Enter' || e.code === 'Space') onContinue();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onContinue]);
  return (
    <div className="fixed inset-0 z-[90] bg-black flex items-center justify-center p-6 select-none campaign-card">
      <div className="max-w-xl w-full text-center font-mono">
        <div className="text-[10px] uppercase tracking-[0.4em] text-zinc-600 mb-2">Campagne · chapitre {next - 1}/5 terminé</div>
        <div className="text-xs text-emerald-400/80 mb-10">{done}</div>
        <div className="text-[11px] uppercase tracking-[0.35em] text-violet-400 mb-3">Chapitre {next}</div>
        <div className="font-serif text-4xl sm:text-6xl text-zinc-100 tracking-widest mb-4">
          {n?.icon} {n?.name}
        </div>
        <div className="font-serif italic text-zinc-400 mb-10">{n?.line}</div>
        <div className="flex justify-center gap-6 text-[11px] text-zinc-500 mb-10">
          <span>⏱ {fmtTime(time)}</span>
          <span>🎒 {items} objet{items > 1 ? 's' : ''} emporté{items > 1 ? 's' : ''}</span>
        </div>
        <div className="flex justify-center gap-3">
          <button
            onClick={onContinue}
            className="px-8 py-3 bg-red-700 hover:bg-red-600 text-white text-xs uppercase tracking-widest border border-red-500 shadow-[0_0_25px_rgba(220,38,38,0.45)]"
          >
            Continuer ▶
          </button>
          <button onClick={onQuit} className="px-5 py-3 text-zinc-500 hover:text-zinc-200 text-[11px] uppercase tracking-widest border border-zinc-800">
            Menu
          </button>
        </div>
        <div className="mt-4 text-[10px] text-zinc-700">[Entrée] pour continuer</div>
      </div>
    </div>
  );
};
