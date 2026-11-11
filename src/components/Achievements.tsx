import React, { useEffect, useMemo, useState } from 'react';
import { Coins, Lock, Trophy, X } from 'lucide-react';
import { ACHIEVEMENTS, ACH_BY_ID, AchState, TIER_STYLE } from '../achievements';

/** "Succès débloqué" card, one at a time, top of the screen. */
export const AchievementToast: React.FC<{ queue: string[]; onDone: () => void }> = ({ queue, onDone }) => {
  const id = queue[0];
  const def = id ? ACH_BY_ID.get(id) : undefined;
  useEffect(() => {
    if (!id) return;
    const t = setTimeout(onDone, 4200);
    return () => clearTimeout(t);
  }, [id, onDone]);
  if (!def) return null;
  const tier = TIER_STYLE[def.tier];
  return (
    <div
      key={id}
      className="ach-pop fixed top-16 left-1/2 -translate-x-1/2 z-[95] flex items-center gap-3 pl-3 pr-5 py-2.5 bg-black/90 border-2 font-mono pointer-events-none"
      style={{ borderColor: tier.color, boxShadow: `0 0 28px ${tier.color}66` }}
    >
      <div className="w-12 h-12 flex items-center justify-center text-2xl border" style={{ borderColor: tier.color, background: `${tier.color}22` }}>
        {def.icon}
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-[0.3em]" style={{ color: tier.color }}>
          🏆 Succès débloqué — {tier.label}
        </div>
        <div className="text-zinc-100 font-bold text-sm">{def.name}</div>
        <div className="text-[11px] text-zinc-400">{def.desc}</div>
      </div>
      <div className="flex items-center gap-1 text-amber-300 text-sm font-bold ml-2">
        +{def.reward} <Coins className="w-4 h-4" />
      </div>
    </div>
  );
};

interface MenuProps {
  ach: AchState | null;
  loggedIn: boolean;
  onClose: () => void;
}

/** Full list with progress, secrets hidden until unlocked. */
export const AchievementsMenu: React.FC<MenuProps> = ({ ach, loggedIn, onClose }) => {
  const [filter, setFilter] = useState<'all' | 'done' | 'todo'>('all');
  const done = ach?.done ?? {};
  const total = ACHIEVEMENTS.length;
  const count = ACHIEVEMENTS.filter((a) => done[a.id]).length;
  const earned = ACHIEVEMENTS.filter((a) => done[a.id]).reduce((s, a) => s + a.reward, 0);
  const all = ACHIEVEMENTS.reduce((s, a) => s + a.reward, 0);
  const list = useMemo(
    () => ACHIEVEMENTS.filter((a) => (filter === 'done' ? done[a.id] : filter === 'todo' ? !done[a.id] : true)),
    [filter, done]
  );

  return (
    <div className="fixed inset-0 z-[80] bg-black/85 flex items-center justify-center p-3 select-none" onClick={onClose}>
      <div
        className="w-full max-w-3xl max-h-[92vh] overflow-y-auto bg-zinc-950 border border-zinc-800 shadow-[0_0_60px_rgba(0,0,0,0.9)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 bg-zinc-950/95 border-b border-zinc-800 p-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Trophy className="w-6 h-6 text-amber-400" />
            <div>
              <div className="font-mono uppercase tracking-[0.25em] text-zinc-100 text-sm">Succès</div>
              <div className="text-[11px] font-mono text-zinc-500">
                {count} / {total} débloqués · {earned} / {all} pièces gagnées
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-zinc-400 hover:text-white border border-zinc-800 hover:border-zinc-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-4 pt-3">
          <div className="h-2 bg-zinc-900 border border-zinc-800">
            <div className="h-full bg-gradient-to-r from-amber-700 to-amber-400" style={{ width: `${(count / total) * 100}%` }} />
          </div>
          {!loggedIn && (
            <div className="mt-3 px-3 py-2 border border-amber-800 bg-amber-950/30 text-amber-300 text-xs font-mono">
              Connectez-vous (bouton Multijoueur) pour débloquer les succès et gagner leurs pièces.
            </div>
          )}
          <div className="mt-3 flex gap-2 text-[11px] font-mono">
            {(['all', 'todo', 'done'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1 border ${filter === f ? 'border-amber-500 text-amber-300 bg-amber-950/30' : 'border-zinc-800 text-zinc-400 hover:border-zinc-600'}`}
              >
                {f === 'all' ? 'Tous' : f === 'todo' ? 'À faire' : 'Débloqués'}
              </button>
            ))}
          </div>
          <div className="mt-2 text-[10px] font-mono text-zinc-600">Les succès de sortie ne comptent pas en mode Exploration (difficulté 1).</div>
        </div>

        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
          {list.map((a) => {
            const got = !!done[a.id];
            const hidden = a.secret && !got;
            const tier = TIER_STYLE[a.tier];
            const progress = a.stat && a.goal ? Math.min(a.goal, ach?.stats[a.stat] ?? 0) : null;
            return (
              <div
                key={a.id}
                className={`flex gap-3 p-3 border ${got ? 'bg-zinc-900/70' : 'bg-black/40 opacity-80'}`}
                style={{ borderColor: got ? tier.color : '#27272a' }}
              >
                <div
                  className={`w-11 h-11 shrink-0 flex items-center justify-center text-xl border ${got ? '' : 'grayscale'}`}
                  style={{ borderColor: got ? tier.color : '#3f3f46', background: got ? `${tier.color}1f` : 'transparent' }}
                >
                  {hidden ? <Lock className="w-4 h-4 text-zinc-600" /> : a.icon}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`font-mono text-[13px] font-bold truncate ${got ? 'text-zinc-100' : 'text-zinc-400'}`}>{hidden ? '???' : a.name}</span>
                    <span className="text-[9px] font-mono uppercase tracking-wider shrink-0" style={{ color: tier.color }}>
                      {tier.label}
                    </span>
                  </div>
                  <div className="text-[11px] text-zinc-500 leading-snug">{hidden ? 'Succès secret. Explorez… si vous l\'osez.' : a.desc}</div>
                  <div className="mt-1 flex items-center justify-between gap-2 text-[10px] font-mono">
                    {progress != null && !got ? (
                      <div className="flex items-center gap-2 flex-1">
                        <div className="h-1.5 flex-1 bg-zinc-900 border border-zinc-800">
                          <div className="h-full bg-zinc-400" style={{ width: `${(progress / a.goal!) * 100}%` }} />
                        </div>
                        <span className="text-zinc-400">
                          {progress}/{a.goal}
                        </span>
                      </div>
                    ) : (
                      <span className={got ? 'text-emerald-400' : 'text-zinc-600'}>
                        {got ? `✔ ${new Date(done[a.id]).toLocaleDateString('fr-FR')}` : 'Verrouillé'}
                      </span>
                    )}
                    <span className="flex items-center gap-1 text-amber-300/90 shrink-0">
                      +{a.reward} <Coins className="w-3 h-3" />
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
