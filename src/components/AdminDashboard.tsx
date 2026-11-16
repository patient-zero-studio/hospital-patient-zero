import React, { useEffect, useState } from 'react';
import { Ban, Loader2, Pencil, RefreshCw, ShieldCheck } from 'lucide-react';
import { api, AdminStats, AdminUser } from '../net/api';
import type { GiftCodeView } from '../net/api';
import { CATALOG } from '../economy';
import { levelColor } from '../levels';

const Tile: React.FC<{ label: string; value: React.ReactNode; color?: string }> = ({ label, value, color = '#e4e4e7' }) => (
  <div className="p-2.5 border border-zinc-800 bg-black/40">
    <div className="text-[9px] font-mono uppercase tracking-[0.25em] text-zinc-500">{label}</div>
    <div className="text-xl font-black font-mono" style={{ color }}>
      {value}
    </div>
  </div>
);

/** Bars for the last 14 days (one series). */
const Bars: React.FC<{ title: string; days: AdminStats['days']; k: 'players' | 'signups' | 'escapes' | 'deaths'; color: string }> = ({ title, days, k, color }) => {
  const max = Math.max(1, ...days.map((d) => d[k]));
  return (
    <div className="p-2.5 border border-zinc-800 bg-black/40">
      <div className="flex justify-between text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500 mb-1.5">
        <span>{title}</span>
        <span style={{ color }}>aujourd'hui : {days[days.length - 1]?.[k] ?? 0}</span>
      </div>
      <div className="flex items-end gap-[3px] h-16">
        {days.map((d) => (
          <div key={d.day} className="flex-1 flex flex-col justify-end h-full" title={`${d.day} : ${d[k]}`}>
            <div style={{ height: `${(d[k] / max) * 100}%`, minHeight: d[k] ? 2 : 0, background: color }} />
          </div>
        ))}
      </div>
      <div className="flex justify-between text-[9px] font-mono text-zinc-600 mt-1">
        <span>il y a 13 j</span>
        <span>aujourd'hui</span>
      </div>
    </div>
  );
};

/** 📊 Admin dashboard: how the game is doing + moderation (rename / ban). */
export const AdminDashboard: React.FC<{ token: string }> = ({ token }) => {
  const [st, setSt] = useState<AdminStats | null>(null);
  const [list, setList] = useState<AdminUser[] | null>(null);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [renaming, setRenaming] = useState<{ user: string; name: string } | null>(null);
  const [confirmBan, setConfirmBan] = useState<string | null>(null);

  const load = () => {
    api.adminStats(token).then(setSt).catch((e) => setMsg({ ok: false, text: (e as Error).message }));
    api.adminUsers(token).then(setList).catch(() => {});
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const act = async (key: string, fn: () => Promise<{ message: string }>) => {
    setBusy(key);
    setMsg(null);
    try {
      const r = await fn();
      setMsg({ ok: true, text: r.message });
      setRenaming(null);
      setConfirmBan(null);
      load();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const shown = (list ?? []).filter((u) => !u.admin && u.username.toLowerCase().includes(q.toLowerCase())).slice(0, 40);

  return (
    <div className="mb-5 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-mono uppercase tracking-[0.3em] text-zinc-500">📊 Tableau de bord</div>
        <button onClick={load} className="text-zinc-500 hover:text-zinc-200 flex items-center gap-1 text-[10px] font-mono uppercase">
          <RefreshCw className="w-3 h-3" /> Actualiser
        </button>
      </div>
      {!st ? (
        <div className="flex justify-center py-6 text-zinc-500">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
            <Tile label="Comptes" value={st.accounts} />
            <Tile label="En ligne" value={st.online} color="#22c55e" />
            <Tile label="En partie" value={st.playing} color="#f59e0b" />
            <Tile label="Bannis" value={st.banned} color="#ef4444" />
            <Tile label="Parties ouvertes" value={st.rooms} />
            <Tile label="Boutique débloquée" value={st.shopUnlocked} />
            <Tile label="Pièces en jeu" value={st.coins.toLocaleString('fr-FR')} color="#fbbf24" />
            <Tile label="Nouveaux (14 j)" value={st.days.reduce((t, d) => t + d.signups, 0)} color="#38bdf8" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            <Bars title="Joueurs actifs" days={st.days} k="players" color="#22c55e" />
            <Bars title="Nouveaux comptes" days={st.days} k="signups" color="#38bdf8" />
            <Bars title="Sorties réussies" days={st.days} k="escapes" color="#fbbf24" />
            <Bars title="Morts" days={st.days} k="deaths" color="#ef4444" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            <div className="p-2.5 border border-zinc-800 bg-black/40">
              <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500 mb-1.5">Skins les plus possédés</div>
              {st.topSkins.length === 0 ? (
                <div className="text-[11px] text-zinc-600 font-mono">Aucun pour l'instant.</div>
              ) : (
                st.topSkins.map((s) => (
                  <div key={s.name} className="flex justify-between text-[11px] font-mono text-zinc-300">
                    <span className="truncate">{s.name}</span>
                    <span className="text-amber-300">{s.count}</span>
                  </div>
                ))
              )}
            </div>
            <div className="p-2.5 border border-zinc-800 bg-black/40">
              <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500 mb-1.5">Niveaux des joueurs</div>
              {Object.entries(st.levels).map(([k, n]) => (
                <div key={k} className="flex items-center gap-2 text-[11px] font-mono text-zinc-300">
                  <span className="w-12">Niv {k}</span>
                  <span className="flex-1 h-2 bg-zinc-900">
                    <span className="block h-full bg-sky-500" style={{ width: `${(n / Math.max(1, st.accounts)) * 100}%` }} />
                  </span>
                  <span className="w-6 text-right">{n}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      <CodesPanel token={token} />
      <ReportsPanel token={token} />
      <BackupsPanel token={token} />

      {/* Moderation */}
      <div className="p-2.5 border border-zinc-800 bg-black/40">
        <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500 mb-1.5">🛡️ Modération</div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Chercher un pseudo…"
          className="w-full mb-2 bg-black border border-zinc-700 px-3 py-1.5 text-sm text-zinc-100 font-mono focus:border-amber-500 outline-none"
        />
        {msg && <p className={`text-xs font-mono mb-2 ${msg.ok ? 'text-emerald-400' : 'text-red-400'}`}>{msg.text}</p>}
        <div className="space-y-1 max-h-72 overflow-y-auto">
          {shown.map((u) => (
            <div key={u.username} className={`flex items-center gap-2 px-2 py-1.5 border text-sm ${u.banned ? 'border-red-900 bg-red-950/30' : 'border-zinc-800'}`}>
              {renaming?.user === u.username ? (
                <form
                  className="flex-1 flex gap-1"
                  onSubmit={(e) => {
                    e.preventDefault();
                    act('ren-' + u.username, () => api.adminModerate(token, u.username, 'rename', renaming.name.trim()));
                  }}
                >
                  <input
                    autoFocus
                    value={renaming.name}
                    onChange={(e) => setRenaming({ user: u.username, name: e.target.value })}
                    maxLength={16}
                    className="flex-1 min-w-0 bg-black border border-zinc-600 px-2 py-0.5 text-sm font-mono text-zinc-100"
                  />
                  <button disabled={!!busy} className="px-2 text-[10px] font-mono uppercase border border-emerald-700 text-emerald-300">
                    OK
                  </button>
                  <button type="button" onClick={() => setRenaming(null)} className="px-2 text-[10px] font-mono uppercase text-zinc-500">
                    ✕
                  </button>
                </form>
              ) : (
                <>
                  <span className="text-[10px] font-mono px-1 border" style={{ color: levelColor(u.level ?? 1), borderColor: levelColor(u.level ?? 1) + '88' }}>
                    {u.level ?? 1}
                  </span>
                  <span className={`flex-1 truncate ${u.banned ? 'text-red-300 line-through' : 'text-zinc-200'}`}>{u.username}</span>
                  <button title="Renommer" onClick={() => setRenaming({ user: u.username, name: u.username })} className="p-1 text-zinc-500 hover:text-sky-300">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  {u.banned ? (
                    <button
                      disabled={!!busy}
                      onClick={() => act('unban-' + u.username, () => api.adminModerate(token, u.username, 'unban'))}
                      className="px-2 py-0.5 text-[10px] font-mono uppercase border border-emerald-700 text-emerald-300 flex items-center gap-1"
                    >
                      <ShieldCheck className="w-3 h-3" /> Débannir
                    </button>
                  ) : confirmBan === u.username ? (
                    <>
                      <button
                        disabled={!!busy}
                        onClick={() => act('ban-' + u.username, () => api.adminModerate(token, u.username, 'ban'))}
                        className="px-2 py-0.5 text-[10px] font-mono uppercase bg-red-700 text-white"
                      >
                        Confirmer
                      </button>
                      <button onClick={() => setConfirmBan(null)} className="px-1 text-[10px] font-mono uppercase text-zinc-500">
                        Non
                      </button>
                    </>
                  ) : (
                    <button title="Bannir" onClick={() => setConfirmBan(u.username)} className="p-1 text-zinc-500 hover:text-red-400">
                      <Ban className="w-3.5 h-3.5" />
                    </button>
                  )}
                </>
              )}
            </div>
          ))}
          {list && shown.length === 0 && <div className="text-[11px] font-mono text-zinc-600">Personne.</div>}
        </div>
      </div>
    </div>
  );
};

/** 💾 Daily backups of the accounts: restore one if something went wrong. */
/** 🎟️ Gift codes for YouTube / TikTok / events */
const CodesPanel: React.FC<{ token: string }> = ({ token }) => {
  const [codes, setCodes] = useState<GiftCodeView[] | null>(null);
  const [form, setForm] = useState({ code: '', coins: 500, treats: 0, skin: '', max: 100, days: 30 });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    api.adminCodes(token).then(setCodes).catch((e) => setMsg({ ok: false, text: (e as Error).message }));
  }, [token]);
  const skins = CATALOG.filter((c) => !c.value.startsWith('#'));
  const num = (k: 'coins' | 'treats' | 'max' | 'days') => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: Math.max(0, Number(e.target.value) || 0) }));
  const field = 'bg-black border border-zinc-700 px-2 py-1 text-xs text-zinc-100 font-mono w-full';
  return (
    <div className="p-2.5 border border-zinc-800 bg-black/40">
      <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500 mb-1.5">🎟️ Codes cadeaux</div>
      {msg && <p className={`text-xs font-mono mb-2 ${msg.ok ? 'text-emerald-400' : 'text-red-400'}`}>{msg.text}</p>}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 text-[10px] font-mono text-zinc-500">
        <label>
          Code (vide = au hasard)
          <input className={field} value={form.code} maxLength={20} placeholder="NOEL2026" onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} />
        </label>
        <label>
          Pièces
          <input className={field} type="number" value={form.coins} onChange={num('coins')} />
        </label>
        <label>
          Friandises (événement en cours)
          <input className={field} type="number" value={form.treats} onChange={num('treats')} />
        </label>
        <label className="col-span-2 sm:col-span-1">
          Skin offert
          <select className={field} value={form.skin} onChange={(e) => setForm((f) => ({ ...f, skin: e.target.value }))}>
            <option value="">— aucun —</option>
            {skins.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.target === 'human' ? 'humain' : 'monstre'})
              </option>
            ))}
          </select>
        </label>
        <label>
          Joueurs max (0 = illimité)
          <input className={field} type="number" value={form.max} onChange={num('max')} />
        </label>
        <label>
          Valable (jours, 0 = toujours)
          <input className={field} type="number" value={form.days} onChange={num('days')} />
        </label>
      </div>
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setMsg(null);
          try {
            const r = await api.adminCodeCreate(token, { ...form, skin: form.skin || undefined, code: form.code || undefined });
            setCodes(r.codes);
            setMsg({ ok: true, text: r.message });
            setForm((f) => ({ ...f, code: '' }));
          } catch (e) {
            setMsg({ ok: false, text: (e as Error).message });
          } finally {
            setBusy(false);
          }
        }}
        className="mt-2 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-black font-mono text-[11px] uppercase font-bold disabled:opacity-40"
      >
        Créer le code
      </button>
      <div className="mt-2 space-y-1 max-h-48 overflow-y-auto">
        {!codes ? (
          <Loader2 className="w-4 h-4 animate-spin text-zinc-500" />
        ) : codes.length === 0 ? (
          <p className="text-[11px] font-mono text-zinc-600">Aucun code pour l'instant.</p>
        ) : (
          codes.map((c) => {
            const expired = (c.until && Date.now() > c.until) || (c.max && c.used >= c.max);
            return (
              <div key={c.code} className={`flex items-center gap-2 text-[11px] font-mono ${expired ? 'opacity-50' : ''}`}>
                <span data-no-i18n className="text-amber-200 tracking-widest">{c.code}</span>
                <span className="flex-1 text-zinc-400 truncate">
                  {[c.coins ? `${c.coins} 🪙` : '', c.treats ? `${c.treats} 🍬` : '', c.skin ? `skin ${CATALOG.find((x) => x.id === c.skin)?.name ?? c.skin}` : ''].filter(Boolean).join(' + ')} · {c.used}
                  {c.max ? `/${c.max}` : ''} utilisé{c.used > 1 ? 's' : ''}
                  {c.until ? ` · jusqu'au ${new Date(c.until).toLocaleDateString('fr-FR')}` : ''}
                </span>
                <button
                  onClick={async () => {
                    const r = await api.adminCodeDelete(token, c.code).catch(() => null);
                    if (r) setCodes(r.codes);
                  }}
                  className="text-zinc-600 hover:text-red-400"
                  title="Supprimer"
                >
                  ✕
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

const BackupsPanel: React.FC<{ token: string }> = ({ token }) => {
  const [b, setB] = useState<{ days: string[]; accounts: number } | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    api.adminBackups(token).then(setB).catch((e) => setMsg({ ok: false, text: (e as Error).message }));
  }, [token]);
  return (
    <div className="p-2.5 border border-zinc-800 bg-black/40">
      <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500 mb-1.5">💾 Sauvegardes des comptes (une par jour, 7 jours)</div>
      {msg && <p className={`text-xs font-mono mb-2 ${msg.ok ? 'text-emerald-400' : 'text-red-400'}`}>{msg.text}</p>}
      {!b ? (
        <Loader2 className="w-4 h-4 animate-spin text-zinc-500" />
      ) : b.days.length === 0 ? (
        <p className="text-[11px] font-mono text-zinc-600">Pas encore de sauvegarde (la première se fait une minute après le démarrage du serveur).</p>
      ) : (
        <div className="space-y-1">
          {b.days.map((d) => (
            <div key={d} className="flex items-center gap-2 text-xs font-mono">
              <span className="flex-1 text-zinc-300">{new Date(d + 'T12:00:00Z').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
              {confirm === d ? (
                <>
                  <span className="text-[10px] text-red-300">Tout revenir à ce jour ?</span>
                  <button
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        setMsg({ ok: true, text: (await api.adminRestore(token, d)).message });
                      } catch (e) {
                        setMsg({ ok: false, text: (e as Error).message });
                      } finally {
                        setBusy(false);
                        setConfirm(null);
                      }
                    }}
                    className="px-2 py-0.5 bg-red-700 text-white text-[10px] uppercase"
                  >
                    Oui, restaurer
                  </button>
                  <button onClick={() => setConfirm(null)} className="px-1 text-[10px] uppercase text-zinc-500">
                    Non
                  </button>
                </>
              ) : (
                <button onClick={() => setConfirm(d)} className="px-2 py-0.5 border border-zinc-700 text-[10px] uppercase text-zinc-400 hover:border-amber-500 hover:text-amber-200">
                  Restaurer
                </button>
              )}
            </div>
          ))}
          <p className="text-[10px] font-mono text-zinc-600 mt-1">
            Remet tous les comptes (pièces, skins, niveaux…) comme ce jour-là. Ce qui a été gagné depuis est perdu ; une copie de l'état actuel est gardée au cas où.
          </p>
        </div>
      )}
    </div>
  );
};

/** 🚩 Players reported by others. */
const ReportsPanel: React.FC<{ token: string }> = ({ token }) => {
  const [list, setList] = useState<Awaited<ReturnType<typeof api.adminReports>> | null>(null);
  const load = () => api.adminReports(token).then(setList).catch(() => setList([]));
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);
  return (
    <div className="p-2.5 border border-zinc-800 bg-black/40">
      <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500 mb-1.5">🚩 Signalements ({list?.length ?? '…'})</div>
      {list && list.length === 0 && <p className="text-[11px] font-mono text-zinc-600">Aucun signalement. 👍</p>}
      <div className="space-y-1 max-h-60 overflow-y-auto">
        {list?.map((r) => (
          <div key={r.id} className="flex items-start gap-2 px-2 py-1.5 border border-zinc-800 text-xs font-mono">
            <div className="flex-1 min-w-0">
              <div>
                <span className={r.banned ? 'text-red-400 line-through' : 'text-zinc-100'}>{r.target}</span>
                <span className="text-red-300"> · {r.reason}</span>
              </div>
              {r.note && <div className="text-zinc-400 italic truncate">« {r.note} »</div>}
              <div className="text-[10px] text-zinc-600">
                par {r.by} · {new Date(r.at).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
            <button
              onClick={() => api.adminReportDone(token, r.id).then(load)}
              title="Marquer comme traité"
              className="px-2 py-0.5 border border-zinc-700 text-[10px] uppercase text-zinc-400 hover:text-emerald-300"
            >
              Traité
            </button>
          </div>
        ))}
      </div>
      <p className="text-[10px] font-mono text-zinc-600 mt-1">Pour agir : cherche le pseudo dans « Modération » ci-dessous (renommer / bannir).</p>
    </div>
  );
};
