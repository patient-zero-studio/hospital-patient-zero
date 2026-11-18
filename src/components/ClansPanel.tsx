import React, { useEffect, useRef, useState } from 'react';
import { Crown, Loader2, Search, Send, Shield, X } from 'lucide-react';
import { api, ClansView } from '../net/api';
import { CLAN_COLORS, CLAN_EMBLEMS, CLAN_MAX, CLAN_PRICE } from '../clans';
import { levelColor } from '../levels';
import { fmtCoins } from '../economy';

const DOT: Record<string, string> = { playing: '#f59e0b', online: '#22c55e', offline: '#52525b' };

/** A clan badge: emblem + [TAG] in the clan colour */
export const ClanBadge: React.FC<{ emblem: string; tag: string; color: string; size?: 'sm' | 'lg' }> = ({ emblem, tag, color, size = 'sm' }) => (
  <span
    data-no-i18n
    className={`inline-flex items-center gap-1 border font-mono font-bold ${size === 'lg' ? 'px-2 py-1 text-sm' : 'px-1 text-[10px]'}`}
    style={{ color, borderColor: color + '99', background: color + '1a' }}
  >
    <span>{emblem}</span>[{tag}]
  </span>
);

interface Props {
  token: string;
  coins: number;
  admin?: boolean;
  onWallet?: () => void;
  onProfile?: (name: string) => void;
  onClose: () => void;
}

/** 🛡️ Clans: create one (100 coins), join, chat, weekly ranking */
export const ClansPanel: React.FC<Props> = ({ token, coins, admin, onWallet, onProfile, onClose }) => {
  const [view, setView] = useState<ClansView | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [tab, setTab] = useState<'mine' | 'list' | 'create'>('mine');
  const [q, setQ] = useState('');
  const [form, setForm] = useState({ name: '', tag: '', emblem: CLAN_EMBLEMS[0], color: CLAN_COLORS[0], open: true });
  const [text, setText] = useState('');
  const [confirmLeave, setConfirmLeave] = useState(false);
  const chatBox = useRef<HTMLDivElement>(null);

  const load = (query = q) =>
    api
      .clans(token, query)
      .then((v) => {
        setView(v);
        return v;
      })
      .catch((e) => setMsg({ ok: false, text: (e as Error).message }));

  useEffect(() => {
    load().then((v) => v && !v.mine && setTab('list'));
    const t = setInterval(() => load(), 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const chatLen = view?.mine?.chat.length ?? 0;
  useEffect(() => {
    chatBox.current?.scrollTo({ top: chatBox.current.scrollHeight });
  }, [chatLen, tab]);

  const act = async (key: string, fn: () => Promise<ClansView & { message?: string }>) => {
    setBusy(key);
    setMsg(null);
    try {
      const r = await fn();
      setView(r);
      if (r.message) setMsg({ ok: true, text: r.message });
      return r;
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const mine = view?.mine ?? null;
  const tabBtn = (t: typeof tab, label: string) => (
    <button
      onClick={() => setTab(t)}
      className={`flex-1 py-2 font-mono text-[11px] uppercase tracking-widest border ${tab === t ? 'border-indigo-500 bg-indigo-950/40 text-zinc-100' : 'border-zinc-800 text-zinc-500 hover:border-zinc-600'}`}
    >
      {label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-[78] bg-black/85 flex items-center justify-center p-4" onClick={onClose}>
      <div className="relative w-full max-w-lg max-h-[92vh] overflow-y-auto bg-zinc-950 border border-zinc-800 p-6 shadow-[0_0_60px_rgba(99,102,241,0.15)]" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-3 right-3 text-zinc-500 hover:text-zinc-200" aria-label="Fermer">
          <X className="w-5 h-5" />
        </button>
        <h2 className="font-mono uppercase tracking-[0.25em] text-sm text-zinc-100 flex items-center gap-2 mb-4">
          <Shield className="w-4 h-4 text-indigo-400" /> Clans
        </h2>

        <div className="flex gap-1 mb-3">
          {tabBtn('mine', mine ? `${mine.emblem} Mon clan` : '🛡️ Mon clan')}
          {tabBtn('list', '🏆 Classement')}
          {!mine && tabBtn('create', '➕ Créer')}
        </div>
        {msg && <p className={`text-xs font-mono mb-3 ${msg.ok ? 'text-emerald-400' : 'text-red-400'}`}>{msg.text}</p>}

        {!view ? (
          <div className="flex justify-center py-8 text-zinc-500">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : tab === 'mine' ? (
          !mine ? (
            <div className="text-center py-6 space-y-3">
              <p className="text-sm text-zinc-400 font-serif italic">Tu n'es dans aucun clan. Rejoins-en un depuis le classement, ou crée le tien !</p>
              <div className="flex gap-2 justify-center">
                <button onClick={() => setTab('list')} className="px-3 py-2 border border-indigo-600 text-indigo-200 font-mono text-xs uppercase">
                  Voir les clans
                </button>
                <button onClick={() => setTab('create')} className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-mono text-xs uppercase">
                  Créer ({CLAN_PRICE} 🪙)
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-3 p-3 border" style={{ borderColor: mine.color + '88', background: mine.color + '12' }}>
                <span className="text-4xl">{mine.emblem}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-lg text-zinc-100 truncate" data-no-i18n>
                    {mine.name}
                  </div>
                  <ClanBadge emblem={mine.emblem} tag={mine.tag} color={mine.color} />
                  <div className="text-[10px] font-mono text-zinc-400 mt-1">
                    {mine.members.length}/{CLAN_MAX} membres · {mine.open ? 'ouvert à tous' : 'sur demande'} · chef : {mine.leader}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-black font-mono text-amber-300">#{mine.rank}</div>
                  <div className="text-[10px] font-mono text-zinc-500">{mine.score} XP cette semaine</div>
                </div>
              </div>
              <p className="text-[10px] font-mono text-zinc-500">
                🏆 Chaque lundi, les 3 meilleurs clans (XP gagnée par tous les membres) gagnent : 300 / 200 / 100 pièces pour chaque membre.
              </p>

              {mine.isLeader && mine.requests.length > 0 && (
                <div className="p-2 border border-amber-700/60 bg-amber-950/15 space-y-1">
                  <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-amber-300">Demandes ({mine.requests.length})</div>
                  {mine.requests.map((r) => (
                    <div key={r} className="flex items-center gap-2 text-sm">
                      <span className="flex-1 text-zinc-200" data-no-i18n>
                        {r}
                      </span>
                      <button disabled={!!busy} onClick={() => act('acc' + r, () => api.clanManage(token, 'accept', r))} className="px-2 py-0.5 bg-emerald-600 text-black text-[11px] font-mono uppercase">
                        Accepter
                      </button>
                      <button disabled={!!busy} onClick={() => act('ref' + r, () => api.clanManage(token, 'refuse', r))} className="px-2 py-0.5 text-zinc-500 text-[11px] font-mono uppercase">
                        Refuser
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div>
                <div className="text-[10px] font-mono uppercase tracking-[0.3em] text-zinc-500 mb-1">Membres</div>
                <div className="space-y-1">
                  {mine.members.map((m) => (
                    <div key={m.username} className="flex items-center gap-2 px-2 py-1.5 border border-zinc-800 bg-black/40 text-sm">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: DOT[m.status] }} />
                      <span className="text-[10px] px-1 border font-mono" style={{ color: levelColor(m.level), borderColor: levelColor(m.level) + '88' }}>
                        Niv {m.level}
                      </span>
                      <button className="flex-1 min-w-0 text-left truncate text-zinc-100 hover:underline" onClick={() => onProfile?.(m.username)} data-no-i18n>
                        {m.username}
                      </button>
                      {m.leader && <Crown className="w-3.5 h-3.5 text-amber-400" />}
                      <span className="text-[10px] font-mono text-zinc-400">{m.weekXp} XP</span>
                      {mine.isLeader && !m.leader && (
                        <>
                          <button title="Nommer chef" onClick={() => act('lead' + m.username, () => api.clanManage(token, 'lead', m.username))} className="text-zinc-600 hover:text-amber-300 text-xs">
                            👑
                          </button>
                          <button title="Retirer du clan" onClick={() => act('kick' + m.username, () => api.clanManage(token, 'kick', m.username))} className="text-zinc-600 hover:text-red-400 text-xs">
                            ✕
                          </button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* 💬 clan chat */}
              <div className="p-2 border border-indigo-800/60 bg-indigo-950/15">
                <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-indigo-300 mb-1">💬 Chat du clan</div>
                <div ref={chatBox} className="h-40 overflow-y-auto space-y-1 pr-1">
                  {mine.chat.length === 0 && <p className="text-[11px] font-mono text-zinc-500 text-center py-6">Pas encore de message.</p>}
                  {mine.chat.map((m, i) => (
                    <div key={i} className="text-xs" data-no-i18n>
                      <span className={m.mine ? 'text-indigo-300' : 'text-zinc-400'}>{m.from} :</span> <span className="text-zinc-100 break-words">{m.text}</span>
                    </div>
                  ))}
                </div>
                <form
                  className="flex gap-1.5 mt-2"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!text.trim()) return;
                    const r = await act('chat', () => api.clanChat(token, text.trim()));
                    if (r) setText('');
                  }}
                >
                  <input value={text} onChange={(e) => setText(e.target.value)} maxLength={200} placeholder="Message au clan…" className="flex-1 min-w-0 bg-black border border-zinc-700 px-2 py-1.5 text-xs text-zinc-100 focus:border-indigo-500 outline-none" />
                  <button type="submit" disabled={busy === 'chat' || !text.trim()} className="px-2.5 bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-40" aria-label="Envoyer">
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              </div>

              {mine.isLeader && (
                <div className="p-2 border border-zinc-800 space-y-2">
                  <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">Réglages (chef)</div>
                  <label className="flex items-center gap-2 text-xs font-mono text-zinc-300">
                    <input type="checkbox" checked={mine.open} onChange={(e) => act('open', () => api.clanManage(token, 'settings', undefined, { open: e.target.checked }))} className="accent-indigo-500" />
                    Ouvert à tous (sinon, tu acceptes les demandes)
                  </label>
                  <div className="flex flex-wrap gap-1">
                    {CLAN_EMBLEMS.map((em) => (
                      <button key={em} onClick={() => act('em', () => api.clanManage(token, 'settings', undefined, { emblem: em }))} className={`w-7 h-7 border ${mine.emblem === em ? 'border-white' : 'border-zinc-800'}`}>
                        {em}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-1">
                    {CLAN_COLORS.map((c) => (
                      <button key={c} onClick={() => act('col', () => api.clanManage(token, 'settings', undefined, { color: c }))} className={`w-6 h-6 border-2 ${mine.color === c ? 'border-white' : 'border-transparent'}`} style={{ background: c }} />
                    ))}
                  </div>
                </div>
              )}

              {confirmLeave ? (
                <div className="flex items-center gap-2 text-xs font-mono">
                  <span className="text-red-300 flex-1">{mine.members.length === 1 ? 'Tu es seul : le clan sera supprimé. Sûr ?' : 'Quitter le clan ?'}</span>
                  <button
                    onClick={async () => {
                      await act('leave', () => api.clanLeave(token));
                      setConfirmLeave(false);
                      setTab('list');
                    }}
                    className="px-2 py-1 bg-red-700 text-white uppercase"
                  >
                    Oui, quitter
                  </button>
                  <button onClick={() => setConfirmLeave(false)} className="px-2 py-1 text-zinc-500 uppercase">
                    Non
                  </button>
                </div>
              ) : (
                <button onClick={() => setConfirmLeave(true)} className="text-[11px] font-mono text-zinc-600 hover:text-red-400 underline">
                  Quitter le clan
                </button>
              )}
            </div>
          )
        ) : tab === 'list' ? (
          <div className="space-y-2">
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                load(q);
              }}
            >
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Chercher un clan (nom ou tag)" className="flex-1 min-w-0 bg-black border border-zinc-700 px-3 py-1.5 text-sm text-zinc-100 font-mono focus:border-indigo-500 outline-none" />
              <button type="submit" className="px-3 border border-zinc-700 text-zinc-300" aria-label="Chercher">
                <Search className="w-4 h-4" />
              </button>
            </form>
            {view.top.length === 0 ? (
              <p className="text-sm text-zinc-500 font-serif italic text-center py-6">Aucun clan pour l'instant. Sois le premier à en créer un !</p>
            ) : (
              view.top.map((c) => (
                <div key={c.id} className="flex items-center gap-2 px-2 py-2 border border-zinc-800 bg-black/40">
                  <span className="w-7 text-center font-mono text-sm text-zinc-500">{['🥇', '🥈', '🥉'][c.rank - 1] ?? `#${c.rank}`}</span>
                  <span className="text-2xl">{c.emblem}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-zinc-100 truncate" data-no-i18n>
                      {c.name}
                    </div>
                    <div className="flex items-center gap-2">
                      <ClanBadge emblem={c.emblem} tag={c.tag} color={c.color} />
                      <span className="text-[10px] font-mono text-zinc-500">
                        {c.members}/{CLAN_MAX} · {c.score} XP
                      </span>
                    </div>
                  </div>
                  {!mine &&
                    (c.requested ? (
                      <span className="text-[10px] font-mono text-amber-300">demande envoyée</span>
                    ) : c.members >= CLAN_MAX ? (
                      <span className="text-[10px] font-mono text-zinc-600">complet</span>
                    ) : (
                      <button disabled={!!busy} onClick={() => act('join' + c.id, () => api.clanJoin(token, c.id)).then((r) => r?.mine && setTab('mine'))} className="px-2 py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-mono uppercase">
                        {c.open ? 'Rejoindre' : 'Demander'}
                      </button>
                    ))}
                  {admin && (
                    <button title="Supprimer ce clan (admin)" onClick={async () => {
                      try {
                        setMsg({ ok: true, text: (await api.adminClanDelete(token, c.id)).message });
                        load();
                      } catch (e) {
                        setMsg({ ok: false, text: (e as Error).message });
                      }
                    }} className="text-zinc-700 hover:text-red-400 text-xs">
                      🗑️
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-zinc-400">
              Créer un clan coûte <b className="text-amber-300">{CLAN_PRICE} pièces</b> (tu en as {fmtCoins(coins)}). Jusqu'à {CLAN_MAX} membres.
            </p>
            <label className="block text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">
              Nom du clan
              <input value={form.name} maxLength={20} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Les Survivants" className="mt-1 w-full bg-black border border-zinc-700 px-3 py-2 text-sm text-zinc-100 normal-case tracking-normal focus:border-indigo-500 outline-none" />
            </label>
            <label className="block text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">
              Tag (2 à 4 lettres)
              <input value={form.tag} maxLength={4} onChange={(e) => setForm((f) => ({ ...f, tag: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') }))} placeholder="SURV" className="mt-1 w-full bg-black border border-zinc-700 px-3 py-2 text-sm text-zinc-100 font-mono tracking-widest focus:border-indigo-500 outline-none" />
            </label>
            <div>
              <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500 mb-1">Emblème</div>
              <div className="flex flex-wrap gap-1">
                {CLAN_EMBLEMS.map((em) => (
                  <button key={em} onClick={() => setForm((f) => ({ ...f, emblem: em }))} className={`w-8 h-8 text-lg border ${form.emblem === em ? 'border-white bg-zinc-800' : 'border-zinc-800'}`}>
                    {em}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500 mb-1">Couleur</div>
              <div className="flex gap-1">
                {CLAN_COLORS.map((c) => (
                  <button key={c} onClick={() => setForm((f) => ({ ...f, color: c }))} className={`w-7 h-7 border-2 ${form.color === c ? 'border-white' : 'border-transparent'}`} style={{ background: c }} />
                ))}
              </div>
            </div>
            <label className="flex items-center gap-2 text-xs font-mono text-zinc-300">
              <input type="checkbox" checked={form.open} onChange={(e) => setForm((f) => ({ ...f, open: e.target.checked }))} className="accent-indigo-500" />
              Ouvert à tous (sinon, tu acceptes chaque demande)
            </label>
            {form.tag.length >= 2 && (
              <div className="text-xs text-zinc-400">
                Aperçu : <ClanBadge emblem={form.emblem} tag={form.tag} color={form.color} size="lg" /> <span data-no-i18n>{form.name}</span>
              </div>
            )}
            <button
              disabled={!!busy || form.name.trim().length < 3 || form.tag.length < 2 || (!admin && coins < CLAN_PRICE)}
              onClick={async () => {
                const r = await act('create', () => api.clanCreate(token, form));
                if (r?.mine) {
                  setTab('mine');
                  onWallet?.();
                }
              }}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-mono text-xs uppercase tracking-widest disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {busy === 'create' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />} Créer le clan — {CLAN_PRICE} 🪙
            </button>
            {!admin && coins < CLAN_PRICE && <p className="text-[11px] font-mono text-red-400">Pas assez de pièces : échappe-toi de l'hôpital pour en gagner !</p>}
          </div>
        )}
      </div>
    </div>
  );
};
