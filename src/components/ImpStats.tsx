import React from 'react';
import type { StatKey } from '../achievements';

/** 🔪 Imposteur record: games, wins on each side, times unmasked */
export const ImpStats: React.FC<{ stats: Partial<Record<StatKey, number>> | null | undefined; mine?: boolean }> = ({ stats, mine }) => {
  const g = stats?.impGames ?? 0;
  if (!g && !mine) return null;
  const asImp = stats?.impAsImp ?? 0;
  const wImp = stats?.impWins ?? 0;
  const wCrew = stats?.crewWins ?? 0;
  const caught = stats?.impCaught ?? 0;
  const crewGames = g - asImp;
  const pct = (a: number, b: number) => (b > 0 ? ` (${Math.round((a / b) * 100)} %)` : '');
  return (
    <div className="mb-3 p-2 border border-red-900/60 bg-red-950/10">
      <div className="text-[10px] font-mono uppercase tracking-[0.3em] text-red-400 mb-1.5">🔪 Imposteur</div>
      {!g ? (
        <p className="text-xs font-mono text-zinc-500">
          Pas encore de partie d'Imposteur. Lance-en une depuis Multijoueur (4 joueurs minimum). Chaque victoire rapporte des pièces (60 en imposteur, 40 en survivant), et 10 victoires débloquent le skin « Masque de l'imposteur » 🎭.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs font-mono text-zinc-300">
          <span>🎮 Parties jouées</span>
          <span className="text-right text-zinc-100 font-bold">{g}</span>
          <span>🔪 Victoires en imposteur</span>
          <span className="text-right text-zinc-100 font-bold">
            {wImp} / {asImp}
            <span className="text-zinc-500 font-normal">{pct(wImp, asImp)}</span>
          </span>
          <span>🧍 Victoires en survivant</span>
          <span className="text-right text-zinc-100 font-bold">
            {wCrew} / {crewGames}
            <span className="text-zinc-500 font-normal">{pct(wCrew, crewGames)}</span>
          </span>
          <span>🗳 Démasqué</span>
          <span className="text-right text-zinc-100 font-bold">{caught} fois</span>
          <span className="col-span-2 mt-1 text-[11px] text-zinc-400">
            {wImp + wCrew >= 10
              ? "🎭 Skin « Masque de l'imposteur » débloqué !"
              : `🎭 Skin « Masque de l'imposteur » : ${wImp + wCrew}/10 victoires`}
          </span>
        </div>
      )}
    </div>
  );
};
