import React from 'react';
import { GameEnding } from '../types';
import { Award, RotateCcw, Home, Sparkles, CheckCircle2 } from 'lucide-react';

interface VictoryModalProps {
  ending: GameEnding;
  title: string;
  narrative: string;
  notesFound: number;
  totalNotes: number;
  difficultyLabel?: string;
  /** Undefined = waiting for the host (online guest). */
  onPlayAgain?: () => void;
  onMainMenu: () => void;
}

export const VictoryModal: React.FC<VictoryModalProps> = ({
  ending,
  title,
  narrative,
  notesFound,
  totalNotes,
  difficultyLabel,
  onPlayAgain,
  onMainMenu,
}) => {
  return (
    <div className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4">
      <div className="bg-zinc-950 border-2 border-amber-600/60 w-full max-w-xl p-8 flex flex-col items-center text-center shadow-[0_0_60px_rgba(200,120,20,0.3)]">
        <div className="w-16 h-16 rounded-full bg-amber-950/60 border border-amber-500/80 flex items-center justify-center mb-4">
          <Award className="w-9 h-9 text-amber-400" />
        </div>

        <span className="text-[10px] font-mono uppercase tracking-widest text-amber-500 mb-1">
          ÉPILOGUE ATTEINT
        </span>
        <h2 className="text-xl font-mono uppercase tracking-widest text-zinc-100 font-extrabold mb-4">
          {title}
        </h2>

        {/* Narrative Box */}
        <div className="bg-zinc-900/50 border border-zinc-800 p-5 mb-6 text-left w-full">
          <p className="text-sm text-zinc-300 leading-relaxed font-serif italic">
            "{narrative}"
          </p>
        </div>

        {/* Endings breakdown */}
        {ending === 'DESTROY' || ending === 'LUCAS' ? (
          <div className="w-full grid grid-cols-2 gap-2 mb-6 text-left font-mono text-[10px]">
            <div className={`p-2.5 border ${ending === 'DESTROY' ? 'border-amber-500 bg-amber-950/20 text-amber-200' : 'border-zinc-800 text-zinc-600'}`}>
              <div className="font-bold">FIN : LA DERNIÈRE PURGE</div>
              <div>Le détruire</div>
            </div>
            <div className={`p-2.5 border ${ending === 'LUCAS' ? 'border-amber-500 bg-amber-950/20 text-amber-200' : 'border-zinc-800 text-zinc-600'}`}>
              <div className="font-bold">FIN : APPELLE-MOI LUCAS</div>
              <div>{ending === 'LUCAS' ? 'Le libérer' : '3 documents… et un nom'}</div>
            </div>
          </div>
        ) : ending === 'RESCUE' ? (
          <div className="w-full mb-6 p-3 border border-amber-500 bg-amber-950/20 text-amber-200 text-left font-mono text-[11px]">
            <div className="font-bold">CHAPITRE 4 TERMINÉ — LA FORÊT</div>
            <div className="text-zinc-400">Les cabanes et les jerricans changent à chaque partie. Trouvez les 2 documents pour savoir ce qu'est vraiment la Bête.</div>
          </div>
        ) : ending === 'MAZE' ? (
          <div className="w-full mb-6 p-3 border border-amber-500 bg-amber-950/20 text-amber-200 text-left font-mono text-[11px]">
            <div className="font-bold">CHAPITRE 3 TERMINÉ — LE DÉDALE</div>
            <div className="text-zinc-400">Le labyrinthe change à chaque partie. Trouvez les 2 documents pour connaître la vérité sur le Réseau 9.</div>
          </div>
        ) : ending === 'SEWER' ? (
          <div className="w-full mb-6 p-3 border border-amber-500 bg-amber-950/20 text-amber-200 text-left font-mono text-[11px]">
            <div className="font-bold">CHAPITRE 2 TERMINÉ — LES ÉGOUTS</div>
            <div className="text-zinc-400">Trouvez les 3 documents pour connaître toute la vérité sur le Sujet 07.</div>
          </div>
        ) : (
        <div className="w-full grid grid-cols-3 gap-2 mb-6 text-left font-mono text-[10px]">
          <div className={`p-2.5 border ${ending === 'SURVIVAL' ? 'border-amber-500 bg-amber-950/20 text-amber-200' : 'border-zinc-800 text-zinc-600'}`}>
            <div className="font-bold">FIN 1 : FUITE</div>
            <div>Issue de secours</div>
          </div>
          <div className={`p-2.5 border ${ending === 'PURGE' ? 'border-amber-500 bg-amber-950/20 text-amber-200' : 'border-zinc-800 text-zinc-600'}`}>
            <div className="font-bold">FIN 2 : PURGE</div>
            <div>Incinération du lab</div>
          </div>
          <div className={`p-2.5 border ${ending === 'TRUTH' ? 'border-amber-500 bg-amber-950/20 text-amber-200' : 'border-zinc-800 text-zinc-600'}`}>
            <div className="font-bold">FIN 3 : VÉRITÉ</div>
            <div>Dossiers révélés</div>
          </div>
        </div>
        )}

        {/* Stats */}
        <div className="w-full flex justify-between items-center bg-zinc-900/40 border border-zinc-800/80 px-4 py-2.5 mb-6 text-xs font-mono text-zinc-400">
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span>Documents découverts :</span>
          </div>
          <span className="text-zinc-200 font-bold">{notesFound} / {totalNotes}</span>
        </div>
        {difficultyLabel && (
          <div className="w-full flex justify-between items-center bg-zinc-900/40 border border-zinc-800/80 px-4 py-2.5 -mt-4 mb-6 text-xs font-mono text-zinc-400">
            <span>Difficulté :</span>
            <span className="text-zinc-200 font-bold">{difficultyLabel}</span>
          </div>
        )}

        {/* Actions */}
        <div className="w-full flex gap-3">
          {onPlayAgain ? (
            <button
              onClick={onPlayAgain}
              className="flex-1 py-3 bg-amber-700 hover:bg-amber-600 text-white font-mono text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all font-bold"
            >
              <RotateCcw className="w-4 h-4" />
              <span>{ending === 'SEWER' || ending === 'MAZE' || ending === 'RESCUE' || ending === 'DESTROY' || ending === 'LUCAS' ? 'Rejouer le chapitre' : 'Débloquer les Autres Fins'}</span>
            </button>
          ) : (
            <div className="flex-1 py-3 border border-zinc-800 text-zinc-500 font-mono text-[10px] uppercase tracking-widest text-center">
              En attente que l'hôte relance…
            </div>
          )}

          <button
            onClick={onMainMenu}
            className="px-6 py-3 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 font-mono text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-colors"
          >
            <Home className="w-4 h-4" />
            <span>Menu</span>
          </button>
        </div>
      </div>
    </div>
  );
};
