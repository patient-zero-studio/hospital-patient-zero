import React from 'react';
import { Home, RotateCcw, Skull, Trophy } from 'lucide-react';

interface Props {
  won: boolean;
  text: string;
  role: 'monster' | 'survivor' | 'racer';
  /** Undefined = waiting for the host. */
  onPlayAgain?: () => void;
  onMainMenu: () => void;
}

/** Versus ("Chasse") round result. */
export const VersusResultModal: React.FC<Props> = ({ won, text, role, onPlayAgain, onMainMenu }) => {
  const accent = won ? (role === 'monster' ? '#dc2626' : '#f59e0b') : '#71717a';
  return (
    <div className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4">
      <div
        className="w-full max-w-md bg-zinc-950 p-8 flex flex-col items-center text-center border-2"
        style={{ borderColor: accent, boxShadow: `0 0 60px ${accent}55` }}
      >
        <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4 border" style={{ borderColor: accent }}>
          {won ? <Trophy className="w-9 h-9" style={{ color: accent }} /> : <Skull className="w-9 h-9 text-zinc-400" />}
        </div>
        <div className="text-[10px] font-mono uppercase tracking-[0.35em] text-zinc-500 mb-1">
          {role === 'racer' ? 'Mode Course — le premier sorti gagne' : `Mode Chasse — vous étiez ${role === 'monster' ? 'le Monstre' : 'le Survivant'}`}
        </div>
        <h1 className="text-3xl font-black font-mono tracking-widest mb-3" style={{ color: accent }}>
          {won ? 'VICTOIRE' : 'DÉFAITE'}
        </h1>
        <p className="text-sm text-zinc-300 font-serif italic mb-8">{text}</p>
        <div className="w-full flex flex-col gap-2">
          {onPlayAgain ? (
            <button
              onClick={onPlayAgain}
              className="w-full py-3 bg-red-700 hover:bg-red-600 text-white font-mono text-xs uppercase tracking-widest flex items-center justify-center gap-2 font-bold"
            >
              <RotateCcw className="w-4 h-4" /> Revanche
            </button>
          ) : (
            <div className="w-full py-3 border border-zinc-800 text-zinc-500 font-mono text-xs uppercase tracking-widest">
              En attente que l'hôte relance…
            </div>
          )}
          <button
            onClick={onMainMenu}
            className="w-full py-2.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-400 font-mono text-xs uppercase tracking-widest flex items-center justify-center gap-2"
          >
            <Home className="w-4 h-4" /> Quitter la partie en ligne
          </button>
        </div>
      </div>
    </div>
  );
};
