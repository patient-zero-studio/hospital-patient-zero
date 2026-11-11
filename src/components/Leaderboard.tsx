import React, { useEffect, useState } from 'react';
import { Loader2, Medal, X } from 'lucide-react';
import { api, BoardEntry } from '../net/api';
import { fmtTime } from '../challenges';
import { DIFFICULTIES } from '../game/Difficulty';

/** Fastest escapes, per chapter and difficulty (one line per player: their best). */
export const LeaderboardMenu: React.FC<{ me: string | null; onClose: () => void }> = ({ me, onClose }) => {
  const [boards, setBoards] = useState<Record<string, BoardEntry[]> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chapter, setChapter] = useState<0 | 1 | 2 | 3 | 4 | 5>(1);
  const [diff, setDiff] = useState(2);

  useEffect(() => {
    api
      .leaderboard()
      .then(setBoards)
      .catch((e: Error) => setError(e.message));
  }, []);

  const list = boards?.[`${chapter}-${diff}`] ?? [];
  const tab = (on: boolean) =>
    `px-3 py-1.5 border font-mono text-[11px] uppercase tracking-wider ${on ? 'border-amber-500 text-amber-300 bg-amber-950/30' : 'border-zinc-800 text-zinc-400 hover:border-zinc-600'}`;
  const medal = ['#f2c14e', '#c0c8d0', '#c47a3a'];

  return (
    <div className="fixed inset-0 z-[80] bg-black/85 flex items-center justify-center p-3 select-none" onClick={onClose}>
      <div
        className="w-full max-w-lg max-h-[92vh] overflow-y-auto bg-zinc-950 border border-zinc-800 shadow-[0_0_60px_rgba(0,0,0,0.9)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-zinc-950/95 border-b border-zinc-800 p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Medal className="w-6 h-6 text-amber-400" />
            <div>
              <div className="font-mono uppercase tracking-[0.25em] text-zinc-100 text-sm">Classement</div>
              <div className="text-[11px] font-mono text-zinc-500">Les sorties les plus rapides</div>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-zinc-400 hover:text-white border border-zinc-800 hover:border-zinc-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-2">
          <div className="flex gap-2 flex-wrap">
            <button className={tab(chapter === 1)} onClick={() => setChapter(1)}>
              🏥 Chapitre 1
            </button>
            <button className={tab(chapter === 2)} onClick={() => setChapter(2)}>
              🐀 Chapitre 2
            </button>
            <button className={tab(chapter === 3)} onClick={() => setChapter(3)}>
              🌀 Chapitre 3
            </button>
            <button className={tab(chapter === 4)} onClick={() => setChapter(4)}>
              🌲 Chapitre 4
            </button>
            <button className={tab(chapter === 5)} onClick={() => setChapter(5)}>
              🟣 Chapitre 5
            </button>
            <button className={tab(chapter === 0)} onClick={() => setChapter(0)}>
              🏆 Campagne
            </button>
          </div>
          <div className="flex gap-1 flex-wrap">
            {DIFFICULTIES.filter((d) => d.level >= 2).map((d) => (
              <button key={d.level} className={tab(diff === d.level)} onClick={() => setDiff(d.level)}>
                {d.level} · {d.name}
              </button>
            ))}
          </div>

          <div className="mt-3 border border-zinc-800">
            {!boards && !error && (
              <div className="p-6 flex justify-center text-zinc-500">
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
            )}
            {error && <div className="p-4 text-red-400 text-xs font-mono">{error}</div>}
            {boards && list.length === 0 && (
              <div className="p-6 text-center text-zinc-500 text-xs font-mono">Personne n'est encore sorti ici. Soyez le premier !</div>
            )}
            {list.map((e, i) => {
              const mine = me && e.username.toLowerCase() === me.toLowerCase();
              return (
                <div
                  key={e.username}
                  className={`flex items-center gap-3 px-3 py-2 font-mono text-sm border-b border-zinc-900 last:border-b-0 ${mine ? 'bg-emerald-950/30' : i % 2 ? 'bg-black/30' : ''}`}
                >
                  <span className="w-7 text-center font-black" style={{ color: medal[i] ?? '#71717a' }}>
                    {i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}
                  </span>
                  <span className={`flex-1 truncate ${mine ? 'text-emerald-300' : 'text-zinc-200'}`}>
                    {e.username}
                    {mine && ' (vous)'}
                  </span>
                  <span className="text-[10px] text-zinc-600">{new Date(e.date).toLocaleDateString('fr-FR')}</span>
                  <span className="w-14 text-right text-amber-300 font-bold">{fmtTime(e.time)}</span>
                </div>
              );
            })}
          </div>
          <p className="text-[10px] font-mono text-zinc-600">Il faut être connecté et sortir de l'hôpital (difficulté 2 ou plus) pour apparaître ici.</p>
        </div>
      </div>
    </div>
  );
};
