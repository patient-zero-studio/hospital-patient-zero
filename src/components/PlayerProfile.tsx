import React, { useEffect, useState } from 'react';
import { Loader2, UserPlus, X } from 'lucide-react';
import { api, PlayerProfileView } from '../net/api';
import { levelColor } from '../levels';
import { characterOf } from '../characters';
import { fmtTime } from '../challenges';
import { CATALOG } from '../economy';

const BOARD_NAMES: Record<string, string> = { '0': 'Campagne', '1': 'Ch.1 Hôpital', '2': 'Ch.2 Égouts', '3': 'Ch.3 Dédale', '4': 'Ch.4 Forêt', '5': 'Ch.5 Site B' };
const DIFF = ['', 'Exploration', 'Normal', 'Difficile', 'Cauchemar', 'Enfer'];
const STATUS: Record<string, [string, string]> = { playing: ['#f59e0b', 'En partie'], online: ['#22c55e', 'En ligne'], offline: ['#71717a', 'Hors ligne'] };

/** 👤 Someone's public card: level, records, achievements, how they look. */
export const PlayerProfile: React.FC<{ name: string; token: string; onAddFriend?: (name: string) => Promise<string | undefined>; onClose: () => void }> = ({
  name,
  token,
  onAddFriend,
  onClose,
}) => {
  const [p, setP] = useState<PlayerProfileView | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    api.player(token, name).then(setP).catch((e) => setErr((e as Error).message));
  }, [name, token]);
  const ch = p ? characterOf(p.look.human.char) : null;
  const outfit = p?.look.human.outfit ? cosmeticOutfitName(p.look.human.outfit) : null;
  return (
    <div className="fixed inset-0 z-[85] bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
      <div className="relative w-full max-w-md bg-zinc-950 border border-zinc-800 p-5 shadow-[0_0_50px_rgba(56,189,248,0.15)]" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-3 right-3 text-zinc-500 hover:text-zinc-200" aria-label="Fermer">
          <X className="w-5 h-5" />
        </button>
        {err ? (
          <p className="text-sm font-mono text-red-400 py-6 text-center">{err}</p>
        ) : !p || !ch ? (
          <div className="flex justify-center py-10 text-zinc-500">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : (
          <>
            <div className="flex items-center gap-4 mb-4">
              <div className="w-16 h-16 flex items-center justify-center text-4xl border-2" style={{ borderColor: levelColor(p.level.level), background: p.look.human.gown + '55' }}>
                {ch.emoji}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xl font-bold text-zinc-100 truncate">
                  {p.admin ? '👑 ' : ''}
                  {p.username}
                </div>
                <div className="text-xs font-mono" style={{ color: levelColor(p.level.level) }}>
                  ⭐ Niveau {p.level.level}
                </div>
                <div className="text-[10px] font-mono flex items-center gap-1.5" style={{ color: STATUS[p.status][0] }}>
                  <span className="w-2 h-2 rounded-full" style={{ background: STATUS[p.status][0] }} /> {STATUS[p.status][1]}
                  {p.since && <span className="text-zinc-600">· inscrit le {new Date(p.since).toLocaleDateString('fr-FR')}</span>}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-1.5 mb-4 text-center">
              {[
                ['🚪', p.stats.escapes ?? 0, 'sorties'],
                ['💀', p.stats.deaths ?? 0, 'morts'],
                ['🏅', p.achievements, 'succès'],
                ['👕', p.skins, 'skins'],
              ].map(([i, n, l]) => (
                <div key={String(l)} className="p-2 border border-zinc-800 bg-black/40">
                  <div className="text-lg">{i}</div>
                  <div className="text-sm font-bold font-mono text-zinc-100">{n}</div>
                  <div className="text-[9px] font-mono uppercase text-zinc-500">{l}</div>
                </div>
              ))}
            </div>
            <div className="text-[11px] font-mono text-zinc-400 mb-3">
              Joue <span className="text-zinc-100">{ch.name}</span>
              {outfit && (
                <>
                  {' '}
                  en tenue <span className="text-amber-300">{outfit}</span>
                </>
              )}
            </div>
            <div className="text-[10px] font-mono uppercase tracking-[0.3em] text-zinc-500 mb-1.5">Meilleurs temps</div>
            {p.records.length === 0 ? (
              <p className="text-xs text-zinc-600 font-mono mb-3">Pas encore de record au classement.</p>
            ) : (
              <div className="space-y-1 mb-3">
                {p.records.map((r) => {
                  const [ch2, d] = r.board.split('-');
                  return (
                    <div key={r.board} className="flex justify-between text-xs font-mono px-2 py-1 border border-zinc-900 bg-black/30">
                      <span className="text-zinc-300">
                        {BOARD_NAMES[ch2] ?? ch2} · {DIFF[Number(d)] ?? d}
                      </span>
                      <span>
                        <span className="text-amber-300 font-bold">{fmtTime(r.time)}</span>
                        <span className="text-zinc-500"> · {r.rank}{r.rank === 1 ? 'er' : 'e'}</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
            {!p.me && !p.friend && onAddFriend && (
              <button
                onClick={async () => {
                  try {
                    setMsg((await onAddFriend(p.username)) ?? null);
                  } catch (e) {
                    setMsg((e as Error).message);
                  }
                }}
                className="w-full py-2 bg-emerald-700 hover:bg-emerald-600 text-white font-mono text-xs uppercase tracking-widest flex items-center justify-center gap-2"
              >
                <UserPlus className="w-4 h-4" /> Ajouter en ami
              </button>
            )}
            {p.friend && <p className="text-xs font-mono text-emerald-400 text-center">🤝 Vous êtes amis</p>}
            {msg && <p className="text-xs font-mono text-zinc-300 text-center mt-2">{msg}</p>}
          </>
        )}
      </div>
    </div>
  );
};

/** The look stores the outfit's value (e.g. "santa"): find its name in the catalog. */
const cosmeticOutfitName = (value: string) => CATALOG.find((c) => c.slot === 'outfit' && c.target === 'human' && c.value === value)?.name ?? null;
