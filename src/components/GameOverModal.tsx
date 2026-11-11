import React from 'react';
import { Skull, RotateCcw, Home } from 'lucide-react';

interface GameOverModalProps {
  /** Undefined = waiting for the host (online guest). */
  onRestart?: () => void;
  onMainMenu: () => void;
  online?: boolean;
}

export const GameOverModal: React.FC<GameOverModalProps> = ({ onRestart, onMainMenu, online }) => {
  return (
    <div className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4">
      {/* Red horror noise overlay */}
      <div className="absolute inset-0 bg-red-950/30 mix-blend-color-burn pointer-events-none" />

      <div className="bg-zinc-950/90 border-2 border-red-900 w-full max-w-md p-8 flex flex-col items-center text-center shadow-[0_0_50px_rgba(180,0,0,0.5)] z-10">
        <div className="w-16 h-16 rounded-full bg-red-950/80 border border-red-700 flex items-center justify-center mb-4">
          <Skull className="w-9 h-9 text-red-500 animate-pulse" />
        </div>

        <h1 className="text-2xl font-mono uppercase tracking-widest text-red-600 font-extrabold mb-1">
          VOUS AVEZ PÉRI
        </h1>
        <p className="text-xs font-mono text-zinc-400 mb-6 uppercase tracking-wider">
          {online ? 'Vous avez été attrapés tous les deux.' : 'Le Patient Zéro vous a rattrapé dans les couloirs.'}
        </p>

        {/* Survival Tip */}
        <div className="bg-zinc-900/60 border border-zinc-800 p-4 mb-6 text-left w-full">
          <span className="text-[10px] font-mono uppercase tracking-widest text-red-400 block mb-1">
            CONSEIL DE SURVIE
          </span>
          <p className="text-xs text-zinc-300 leading-relaxed font-mono">
            La créature voit à peine dans le noir, mais la lumière de votre lampe l'attire et elle entend chaque pas de course. Éteignez la lampe [F], accroupissez-vous [C], et ne vous cachez jamais dans un casier sous ses yeux. Et surtout… taisez-vous : il entend votre voix.
          </p>
        </div>

        {/* Buttons */}
        <div className="w-full flex flex-col gap-3">
          {onRestart ? (
            <button
              onClick={onRestart}
              className="w-full py-3 bg-red-700 hover:bg-red-600 text-white font-mono text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all shadow-lg font-bold"
            >
              <RotateCcw className="w-4 h-4" />
              <span>{online ? 'Rejouer ensemble' : 'Recommencer'}</span>
            </button>
          ) : (
            <div className="w-full py-3 border border-zinc-800 text-zinc-500 font-mono text-xs uppercase tracking-widest text-center">
              En attente que l'hôte relance…
            </div>
          )}

          <button
            onClick={onMainMenu}
            className="w-full py-2.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-zinc-200 font-mono text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-colors"
          >
            <Home className="w-4 h-4" />
            <span>Retour au Menu Principal</span>
          </button>
        </div>
      </div>
    </div>
  );
};
