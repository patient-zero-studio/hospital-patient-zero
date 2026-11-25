import React, { useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { api, PlayerProfileView } from '../net/api';
import { cosmetic, isLegendary, rarityColor } from '../economy';
import { levelColor } from '../levels';
import { LAMPS } from '../lamps';
import { CosmeticBadge } from './ShopMenu';
import { Room104 } from './Room104';
import { Preview } from './CustomizeMenu';
import { RankBadge } from './RankedMenu';

/**
 * 🏚️ A player's secret room in the hospital: their character in the middle,
 * the trophy shelf, the showcase of their rarest skins, their lamps, and who
 * came to visit. Friends can drop by.
 */
interface Props {
  name: string;
  token: string;
  /** 🔒 the 3D room 104 (Knights' update: admins only until released) */
  room3d?: boolean;
  onClose: () => void;
}

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
const ago = (t: number) => {
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 60) return `il y a ${Math.max(1, m)} min`;
  const h = Math.round(m / 60);
  return h < 48 ? `il y a ${h} h` : `il y a ${Math.round(h / 24)} j`;
};

const Shelf: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="relative">
    <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-amber-200/70 mb-1">{title}</div>
    <div className="min-h-[64px] flex flex-wrap items-end gap-1.5 px-2 pt-2 pb-1">{children}</div>
    {/* the wooden plank */}
    <div className="h-2.5 rounded-sm" style={{ background: 'linear-gradient(#6b4423, #3b2412)', boxShadow: '0 6px 10px rgba(0,0,0,0.7)', borderTop: '1px solid #8b5a2b' }} />
  </div>
);

export const SecretRoom: React.FC<Props> = ({ name, token, room3d = false, onClose }) => {
  const [p, setP] = useState<PlayerProfileView | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [visit, setVisit] = useState<{ visits: number; visitors: { name: string; at: number }[] } | null>(null);

  useEffect(() => {
    api.player(token, name).then(setP).catch((e) => setErr((e as Error).message));
    // counts the visit (not your own) and gives the guest book
    api.roomVisit(token, name).then(setVisit).catch(() => undefined);
  }, [name, token]);

  const castle = !!p?.castle;
  const lamp = p?.look.human.lamp && LAMPS[p.look.human.lamp] ? hex(LAMPS[p.look.human.lamp].color) : '#fff1dc';
  const rare = (p?.rare ?? []).map((id) => cosmetic(id)).filter((c): c is NonNullable<typeof c> => !!c);
  const lamps = (p?.lamps ?? []).map((id) => cosmetic(id)).filter((c): c is NonNullable<typeof c> => !!c);

  return (
    <div className="fixed inset-0 z-[88] bg-black/90 flex items-center justify-center p-2 sm:p-4" onClick={onClose}>
      <div
        className="relative w-full max-w-4xl max-h-[96vh] overflow-y-auto border-4 border-black shadow-[0_0_80px_rgba(0,0,0,0.9)]"
        style={{
          background: castle
            ? // 🏰 castle: big stone blocks, the warm glow of the fireplace
              `radial-gradient(ellipse at 50% 100%, #ff7a1a44 0%, transparent 45%),
            radial-gradient(ellipse at 50% 30%, ${lamp}22 0%, transparent 55%),
            repeating-linear-gradient(0deg, #2a2622 0 2px, transparent 2px 34px),
            repeating-linear-gradient(90deg, #2a2622 0 2px, transparent 2px 68px),
            linear-gradient(#4a443c, #2e2a25)`
            : // wallpaper (faded stripes), wainscot and an old wooden floor
              `
            radial-gradient(ellipse at 50% 30%, ${lamp}22 0%, transparent 55%),
            linear-gradient(transparent 0 72%, #2a1a0e 72% 73%, transparent 73%),
            repeating-linear-gradient(90deg, #1d1712 0 18px, #191410 18px 36px)`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute top-3 right-3 z-10 text-zinc-400 hover:text-white" aria-label="Fermer">
          <X className="w-6 h-6" />
        </button>
        {castle && (
          <>
            {/* banners on both sides */}
            {[0, 1].map((side) => (
              <div
                key={side}
                className="absolute top-0 hidden sm:block pointer-events-none"
                style={{
                  [side ? 'right' : 'left']: 14,
                  width: 54,
                  height: 190,
                  background: side ? 'linear-gradient(#1d3a8a, #142a66)' : 'linear-gradient(#9a0c18, #6a0810)',
                  clipPath: 'polygon(0 0, 100% 0, 100% 100%, 50% 86%, 0 100%)',
                  boxShadow: '0 6px 12px #000',
                }}
              >
                <div className="text-center text-2xl pt-6">{side ? '🐉' : '🦁'}</div>
                <div className="mx-auto mt-2 w-8 h-0.5 bg-amber-400" />
              </div>
            ))}
          </>
        )}
        {err ? (
          <p className="text-sm font-mono text-red-400 py-16 text-center">{err}</p>
        ) : !p ? (
          <div className="flex justify-center py-24 text-zinc-500">
            <Loader2 className="w-8 h-8 animate-spin" />
          </div>
        ) : (
          <div className="p-4 sm:p-6">
            {/* door plate */}
            <div className="flex flex-col items-center mb-4">
              <div
                className="px-5 py-1.5 font-game uppercase tracking-[0.2em] text-amber-100 text-lg sm:text-xl text-center"
                style={{ background: 'linear-gradient(#a8761a, #6b4a10)', border: '3px solid #000', boxShadow: '0 4px 0 #000, inset 0 1px 0 #f5c84a' }}
              >
                {castle ? '🏰 Château de' : '🏚️ Chambre de'} {p.sire ? 'Sire ' : ''}
                {p.username}
              </div>
              <div className="text-[11px] font-mono text-zinc-400 mt-2 flex items-center gap-2">
                <span style={{ color: levelColor(p.level.level) }}>⭐ Niveau {p.level.level}</span>
                {p.ranked && <RankBadge tier={p.ranked.tier} />}
                <span>· 👣 {visit?.visits ?? p.visits ?? 0} visite{(visit?.visits ?? p.visits ?? 0) > 1 ? 's' : ''}</span>
              </div>
            </div>

            {/* 🏚️ room 104, in 3D: you, your creature, and your collection on display */}
            <div className="mb-4" style={{ boxShadow: `0 0 40px ${lamp}33` }}>
              {room3d ? (
              <Room104
                look={p.look}
                lampColor={LAMPS[p.look.human.lamp]?.color ?? 0xfff1dc}
                lamps={lamps.map((c) => LAMPS[c.value]?.color ?? 0xfff1dc)}
                trophies={(p.trophies?.length ?? 0) + ((p.records ?? []).some((r) => r.rank === 1) ? 1 : 0)}
                rare={rare.map((c) => rarityColor(c))}
                castle={castle}
              />
              ) : (
                <div className="flex justify-center">
                  <Preview look={p.look} tab="human" />
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
              {/* left wall: trophies */}
              <div className="space-y-4">
                <Shelf title="🏆 Trophées">
                  <span className="text-3xl" title={`Niveau ${p.level.level}`}>
                    ⭐
                  </span>
                  {(p.trophies ?? []).slice(-6).map((t) => (
                    <span key={t.week} className="text-3xl" title={`${t.place}e de la semaine du ${t.week}`}>
                      {['🥇', '🥈', '🥉'][t.place - 1] ?? '🏅'}
                    </span>
                  ))}
                  {(p.records ?? []).some((r) => r.rank === 1) && (
                    <span className="text-3xl" title="Record n°1 au classement">
                      👑
                    </span>
                  )}
                  {(p.trophies ?? []).length === 0 && !(p.records ?? []).some((r) => r.rank === 1) && <span className="text-[10px] font-mono text-zinc-600">(vide pour l'instant)</span>}
                </Shelf>
                <Shelf title="📜 Souvenirs">
                  {[
                    ['🚪', p.stats.escapes ?? 0, 'sorties'],
                    ['💀', p.stats.deaths ?? 0, 'morts'],
                    ['🏅', p.achievements, 'succès'],
                    ['👕', p.skins, 'skins'],
                  ].map(([i, n, l]) => (
                    <div key={String(l)} className="px-2 py-1 text-center" style={{ background: '#e8dcc0', color: '#2a1a0e', border: '2px solid #000', transform: `rotate(${String(l).length % 2 ? -3 : 2}deg)` }}>
                      <div className="text-base leading-none">{i}</div>
                      <div className="text-xs font-black font-mono">{n}</div>
                      <div className="text-[8px] font-mono uppercase">{l}</div>
                    </div>
                  ))}
                </Shelf>
              </div>

              {/* right wall: showcase + lamps */}
              <div className="space-y-4">
                <Shelf title="💎 Vitrine (skins les plus rares)">
                  {rare.length === 0 && <span className="text-[10px] font-mono text-zinc-600">(pas encore de skin rare)</span>}
                  {rare.map((c) => (
                    <div
                      key={c.id}
                      title={c.name}
                      className="p-0.5"
                      style={{ border: `2px solid ${rarityColor(c)}`, boxShadow: isLegendary(c) ? `0 0 14px ${rarityColor(c)}` : undefined, background: '#0008' }}
                    >
                      <CosmeticBadge c={c} size={38} />
                    </div>
                  ))}
                </Shelf>
                <Shelf title="🔦 Lampes">
                  {lamps.length === 0 && <span className="text-[10px] font-mono text-zinc-600">(aucune lampe de collection)</span>}
                  {lamps.map((c) => {
                    const col = hex(LAMPS[c.value]?.color ?? 0xfff1dc);
                    return (
                      <div key={c.id} title={c.name} className="flex flex-col items-center">
                        <div className="w-7 h-7 rounded-full" style={{ background: `radial-gradient(circle, #fff 0%, ${col} 45%, transparent 72%)`, boxShadow: `0 0 16px ${col}` }} />
                        <div className="w-2 h-4" style={{ background: '#333', border: '1px solid #000' }} />
                      </div>
                    );
                  })}
                </Shelf>
              </div>
            </div>

            {/* guest book */}
            <div className="mt-5 p-3" style={{ background: '#e8dcc0', color: '#2a1a0e', border: '3px solid #000', boxShadow: '0 4px 0 #000' }}>
              <div className="text-[10px] font-mono uppercase tracking-[0.25em] font-bold mb-1">👣 Livre des visiteurs</div>
              {visit && visit.visitors.length > 0 ? (
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs font-mono">
                  {visit.visitors.map((v) => (
                    <span key={v.name}>
                      <b>{v.name}</b> <span className="opacity-60">{ago(v.at)}</span>
                    </span>
                  ))}
                </div>
              ) : (
                <div className="text-xs font-mono opacity-70">Personne n'est encore passé… {p.me ? 'Invite tes amis à visiter ta chambre depuis ton profil !' : ''}</div>
              )}
            </div>
            {p.me && <p className="text-[10px] font-mono text-zinc-500 text-center mt-3">Ta chambre se remplit toute seule : skins rares, lampes, trophées de la semaine…</p>}
          </div>
        )}
      </div>
    </div>
  );
};
