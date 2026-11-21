import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { levelColor } from '../levels';

interface Row {
  username: string;
  level: number;
  games: number;
  wins: number;
  impWins: number;
  crewWins: number;
  asImp: number;
  caught: number;
}

/** 🔪 Top Imposteur players (by wins, as impostor + as survivor) */
export const ImpBoard: React.FC<{ me: string | null; onProfile?: (name: string) => void }> = ({ me, onProfile }) => {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    fetch('/api/imp-board', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j: { board?: Row[] }) => setRows(Array.isArray(j.board) ? j.board : []))
      .catch(() => setErr(true));
  }, []);
  const medal = ['#f2c14e', '#c0c8d0', '#c47a3a'];
  return (
    <div className="mt-3 border border-zinc-800">
      {!rows && !err && (
        <div className="p-6 flex justify-center text-zinc-500">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      )}
      {err && <div className="p-4 text-red-400 text-xs font-mono">Classement indisponible pour le moment.</div>}
      {rows && rows.length === 0 && (
        <div className="p-6 text-center text-zinc-500 text-xs font-mono">Personne n'a encore gagné de partie d'Imposteur. Sois le premier !</div>
      )}
      {rows &&
        rows.map((e, i) => {
          const mine = !!me && e.username.toLowerCase() === me.toLowerCase();
          return (
            <div
              key={e.username}
              className={`flex items-center gap-3 px-3 py-2 font-mono text-sm border-b border-zinc-900 last:border-b-0 ${mine ? 'bg-emerald-950/30' : i % 2 ? 'bg-black/30' : ''}`}
            >
              <span className="w-7 text-center font-black" style={{ color: medal[i] ?? '#71717a' }}>
                {i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}
              </span>
              <span className={`flex-1 min-w-0 truncate ${mine ? 'text-emerald-300' : 'text-zinc-200'}`}>
                <span className="mr-1.5 text-[10px] px-1 border" style={{ color: levelColor(e.level), borderColor: levelColor(e.level) + '88' }}>
                  {e.level}
                </span>
                {onProfile ? (
                  <button onClick={() => onProfile(e.username)} className="hover:underline" title="Voir le profil" data-no-i18n>
                    {e.username}
                  </button>
                ) : (
                  <span data-no-i18n>{e.username}</span>
                )}
                {mine && ' (vous)'}
              </span>
              <span className="text-[10px] text-zinc-500 text-right leading-tight">
                🔪 {e.impWins} · 🧍 {e.crewWins}
                <br />
                {e.games} partie{e.games > 1 ? 's' : ''}
              </span>
              <span className="w-16 text-right text-red-300 font-bold">
                {e.wins} vict.
              </span>
            </div>
          );
        })}
    </div>
  );
};
