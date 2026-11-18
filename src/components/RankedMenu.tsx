import React, { useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { api, RankedView } from '../net/api';
import { RANK_TIERS, RANK_WIN, tierOf } from '../ranked';
import { passName } from '../progression';
import { levelColor } from '../levels';

const tierById = (id: string) => RANK_TIERS.find((t) => t.id === id) ?? RANK_TIERS[0];

/** 🏅 Small rank badge (emoji + name in the tier colour) */
export const RankBadge: React.FC<{ tier: string; big?: boolean }> = ({ tier, big }) => {
  const t = tierById(tier);
  return (
    <span
      className={`inline-flex items-center gap-1 border font-mono font-bold uppercase ${big ? 'px-3 py-1.5 text-base' : 'px-1 text-[10px]'}`}
      style={{ color: t.color, borderColor: t.color + '99', background: t.color + '1a' }}
    >
      <span>{t.emoji}</span>
      {t.name}
    </span>
  );
};

const fmtLeft = (ms: number) => {
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  return d > 0 ? `${d} j ${h} h` : `${h} h`;
};

/** 🏅 Ranked season: your rank, the 7 tiers and their rewards, the top 50 */
export const RankedMenu: React.FC<{ token: string; me: string; onProfile?: (name: string) => void; onClose: () => void }> = ({ token, me, onProfile, onClose }) => {
  const [v, setV] = useState<RankedView | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<'me' | 'top'>('me');
  useEffect(() => {
    api.ranked(token).then(setV).catch((e) => setErr((e as Error).message));
  }, [token]);

  const t = v ? tierOf(v.points) : RANK_TIERS[0];
  const next = v?.next ? tierById(v.next.id) : null;
  const pct = v && next ? Math.round(((v.points - t.min) / (next.min - t.min)) * 100) : 100;
  const tabBtn = (k: typeof tab, label: string) => (
    <button
      onClick={() => setTab(k)}
      className={`flex-1 py-2 font-mono text-[11px] uppercase tracking-widest border ${tab === k ? 'border-rose-500 bg-rose-950/30 text-zinc-100' : 'border-zinc-800 text-zinc-500 hover:border-zinc-600'}`}
    >
      {label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-[78] bg-black/85 flex items-center justify-center p-4" onClick={onClose}>
      <div className="relative w-full max-w-lg max-h-[92vh] overflow-y-auto bg-zinc-950 border border-zinc-800 p-6 shadow-[0_0_60px_rgba(244,63,94,0.12)]" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-3 right-3 text-zinc-500 hover:text-zinc-200" aria-label="Fermer">
          <X className="w-5 h-5" />
        </button>
        <h2 className="font-mono uppercase tracking-[0.25em] text-sm text-zinc-100 mb-1">🏅 Saison classée</h2>
        {err && <p className="text-xs font-mono text-red-400">{err}</p>}
        {!v ? (
          !err && (
            <div className="flex justify-center py-8 text-zinc-500">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          )
        ) : (
          <>
            <p className="text-[11px] font-mono text-zinc-500 mb-4">
              {v.name} · fin dans {fmtLeft(v.ends - Date.now())} · ensuite, tout le monde repart du Bois
            </p>
            <div className="flex gap-1 mb-4">
              {tabBtn('me', 'Mon rang')}
              {tabBtn('top', `Top 50`)}
            </div>

            {tab === 'me' ? (
              <div className="space-y-4">
                <div className="p-4 border text-center" style={{ borderColor: t.color + '88', background: `radial-gradient(circle, ${t.color}22 0%, transparent 70%)` }}>
                  <div className="text-6xl mb-1">{t.emoji}</div>
                  <div className="text-2xl font-black font-mono uppercase tracking-widest" style={{ color: t.color }}>
                    {t.name}
                  </div>
                  <div className="text-sm font-mono text-zinc-300 mt-1">
                    {v.points} points{v.rank ? ` · ${v.rank}${v.rank === 1 ? 'er' : 'e'} du classement` : ''}
                  </div>
                  {next ? (
                    <div className="mt-3">
                      <div className="h-2 bg-zinc-800 overflow-hidden">
                        <div className="h-full" style={{ width: `${pct}%`, background: next.color }} />
                      </div>
                      <div className="text-[10px] font-mono text-zinc-500 mt-1">
                        Encore {next.min - v.points} points pour {next.emoji} {next.name}
                      </div>
                    </div>
                  ) : (
                    <div className="text-[11px] font-mono text-rose-300 mt-2">Tu es au sommet. Garde ta place dans le top 50 !</div>
                  )}
                  <div className="text-[10px] font-mono text-zinc-500 mt-2">
                    {v.wins} sortie{v.wins > 1 ? 's' : ''} · {v.losses} capture{v.losses > 1 ? 's' : ''} cette saison
                  </div>
                </div>

                <div className="text-[11px] text-zinc-400 space-y-1">
                  <p>
                    <b className="text-zinc-200">Gagner des points :</b> sors d'un chapitre en Normal ou plus. Normal +{RANK_WIN[2]}, Difficile +{RANK_WIN[3]}, Cauchemar +{RANK_WIN[4]}, Enfer +{RANK_WIN[5]}, et +3 par chapitre après le premier.
                  </p>
                  <p>
                    <b className="text-zinc-200">Perdre des points :</b> te faire attraper (à partir de Bronze). Tu ne redescends jamais sous ton rang.
                  </p>
                </div>

                <div className="space-y-1">
                  {[...RANK_TIERS].reverse().map((x) => (
                    <div key={x.id} className={`flex items-center gap-2 px-2 py-1.5 border text-xs font-mono ${x.id === t.id ? 'bg-white/5' : ''}`} style={{ borderColor: x.id === t.id ? x.color : '#27272a' }}>
                      <span className="text-lg w-7 text-center">{x.emoji}</span>
                      <span className="w-20 font-bold uppercase" style={{ color: x.color }}>
                        {x.name}
                      </span>
                      <span className="flex-1 text-zinc-500">{x.min} pts</span>
                      <span className="text-zinc-500">{v.counts[x.id] ?? 0} joueur{(v.counts[x.id] ?? 0) > 1 ? 's' : ''}</span>
                      <span className="w-24 text-right text-amber-300">{x.reward ? `+${x.reward} 🪙` : '—'}</span>
                    </div>
                  ))}
                  <p className="text-[10px] font-mono text-zinc-600">🪙 = pièces gagnées à la fin du mois selon ton rang.</p>
                </div>

                {v.history.length > 0 && (
                  <div>
                    <div className="text-[10px] font-mono uppercase tracking-[0.3em] text-zinc-500 mb-1">Saisons passées</div>
                    <div className="flex flex-wrap gap-1">
                      {v.history.map((h) => (
                        <span key={h.season} className="text-[10px] font-mono text-zinc-400 flex items-center gap-1">
                          {passName(h.season).replace('Saison de ', '')} <RankBadge tier={h.tier} />
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : v.top.length === 0 ? (
              <p className="text-sm text-zinc-500 font-serif italic text-center py-6">Personne n'a encore de points ce mois-ci. À toi de jouer !</p>
            ) : (
              <div className="space-y-1">
                {v.top.map((e, i) => (
                  <div
                    key={e.username}
                    className={`flex items-center gap-2 px-2 py-1.5 border text-sm ${e.username.toLowerCase() === me.toLowerCase() ? 'border-emerald-700 bg-emerald-950/30' : 'border-zinc-800 bg-black/40'}`}
                  >
                    <span className="w-7 text-center font-mono text-zinc-500">{['🥇', '🥈', '🥉'][i] ?? i + 1}</span>
                    <RankBadge tier={e.tier} />
                    <span className="text-[10px] px-1 border font-mono" style={{ color: levelColor(e.level), borderColor: levelColor(e.level) + '88' }}>
                      Niv {e.level}
                    </span>
                    <button className="flex-1 min-w-0 truncate text-left text-zinc-100 hover:underline" onClick={() => onProfile?.(e.username)} data-no-i18n>
                      {e.username}
                      {e.clan && <span className="text-indigo-300 text-[10px] ml-1">[{e.clan}]</span>}
                    </button>
                    <span className="font-mono text-zinc-300">{e.points}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
