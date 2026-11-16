import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { api, WeeklyBoardView } from '../net/api';
import { levelColor } from '../levels';

const medal = ['🥇', '🥈', '🥉'];

/** 🏅 Weekly leaderboard: XP earned since Monday, the top 3 win coins. */
export const WeeklyBoard: React.FC<{ me: string | null; onProfile?: (name: string) => void }> = ({ me, onProfile }) => {
  const [b, setB] = useState<WeeklyBoardView | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api.weeklyBoard().then(setB).catch((e) => setErr((e as Error).message));
  }, []);
  if (err) return <div className="p-4 text-red-400 text-xs font-mono">{err}</div>;
  if (!b)
    return (
      <div className="p-6 flex justify-center text-zinc-500">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  const days = Math.max(0, Math.ceil((b.resetAt - Date.now()) / 86400000));
  return (
    <div className="space-y-3">
      <div className="p-3 border border-amber-700/60 bg-amber-950/20 text-[11px] font-mono text-amber-200">
        🏅 Gagne de l'XP cette semaine (sorties, défis, succès…). Lundi, le top 3 gagne{' '}
        <b>
          🥇 {b.prizes[0]} · 🥈 {b.prizes[1]} · 🥉 {b.prizes[2]} pièces
        </b>{' '}
        et un trophée sur son profil. Fin dans {days} jour{days > 1 ? 's' : ''}.
      </div>
      {b.me && (
        <div className="text-xs font-mono text-zinc-300">
          Toi : <span className="text-emerald-300">{b.me.xp} XP</span> {b.me.rank ? `· ${b.me.rank}${b.me.rank === 1 ? 'er' : 'e'}` : '· pas encore classé'}
        </div>
      )}
      <div className="border border-zinc-800">
        {b.top.length === 0 ? (
          <div className="p-6 text-center text-zinc-500 text-xs font-mono">Personne n'a encore joué cette semaine. Fonce !</div>
        ) : (
          b.top.map((e, i) => {
            const mine = me && e.username.toLowerCase() === me.toLowerCase();
            return (
              <div key={e.username} className={`flex items-center gap-3 px-3 py-2 font-mono text-sm border-b border-zinc-900 last:border-b-0 ${mine ? 'bg-emerald-950/30' : i % 2 ? 'bg-black/30' : ''}`}>
                <span className="w-7 text-center font-black text-zinc-400">{i < 3 ? medal[i] : i + 1}</span>
                <span className="text-[10px] px-1 border" style={{ color: levelColor(e.level), borderColor: levelColor(e.level) + '88' }}>
                  {e.level}
                </span>
                <span className={`flex-1 truncate ${mine ? 'text-emerald-300' : 'text-zinc-200'}`}>
                  {onProfile ? (
                    <button onClick={() => onProfile(e.username)} className="hover:underline">
                      {e.username}
                    </button>
                  ) : (
                    e.username
                  )}
                </span>
                <span className="text-amber-300 font-bold">{e.xp} XP</span>
              </div>
            );
          })
        )}
      </div>
      {b.lastPodium.length > 0 && (
        <div className="text-[11px] font-mono text-zinc-500">
          Semaine dernière : {b.lastPodium.map((p) => `${medal[p.place - 1]} ${p.username} (${p.xp} XP)`).join('  ·  ')}
        </div>
      )}
    </div>
  );
};
