import React, { useState } from 'react';
import { Check, Loader2, UserMinus, UserPlus, Users, X } from 'lucide-react';
import type { FriendsView } from '../net/api';

const DOT: Record<string, { color: string; label: string }> = {
  playing: { color: '#f59e0b', label: 'En partie' },
  online: { color: '#22c55e', label: 'En ligne' },
  offline: { color: '#52525b', label: 'Hors ligne' },
};

interface Props {
  view: FriendsView | null;
  onAdd: (name: string) => Promise<string | undefined>;
  onAccept: (name: string) => Promise<string | undefined>;
  onRemove: (name: string) => Promise<void>;
  onInvite: (name: string) => Promise<string | undefined>;
  /** no room yet: open the multiplayer panel to create one */
  onCreateRoom?: () => void;
  onClose: () => void;
}

/** Friends: add by pseudo, accept requests, see who is online, invite them to your game. */
export const FriendsPanel: React.FC<Props> = ({ view, onAdd, onAccept, onRemove, onInvite, onCreateRoom, onClose }) => {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  const run = async (key: string, fn: () => Promise<string | undefined | void>) => {
    setBusy(key);
    setMsg(null);
    try {
      const m = await fn();
      if (m) setMsg({ ok: true, text: m });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const online = view?.friends.filter((f) => f.status !== 'offline').length ?? 0;

  return (
    <div className="fixed inset-0 z-[78] bg-black/85 flex items-center justify-center p-4" onClick={onClose}>
      <div className="relative w-full max-w-md max-h-[92vh] overflow-y-auto bg-zinc-950 border border-zinc-800 p-6 shadow-[0_0_60px_rgba(34,197,94,0.12)]" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-3 right-3 text-zinc-500 hover:text-zinc-200" aria-label="Fermer">
          <X className="w-5 h-5" />
        </button>
        <h2 className="font-mono uppercase tracking-[0.25em] text-sm text-zinc-100 flex items-center gap-2 mb-4">
          <Users className="w-4 h-4 text-emerald-400" /> Amis
          {view && <span className="text-[10px] text-zinc-500 normal-case tracking-normal">({online} en ligne)</span>}
        </h2>

        {/* Add by pseudo */}
        <form
          className="flex gap-2 mb-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            run('add', async () => {
              const m = await onAdd(name.trim());
              setName('');
              return m;
            });
          }}
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Pseudo de ton ami"
            maxLength={24}
            className="flex-1 min-w-0 bg-black border border-zinc-700 px-3 py-2 text-sm text-zinc-100 font-mono focus:border-emerald-500 outline-none"
          />
          <button
            type="submit"
            disabled={!!busy || !name.trim()}
            className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-black font-mono text-xs uppercase tracking-widest font-bold disabled:opacity-40 flex items-center gap-1.5"
          >
            {busy === 'add' ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />} Ajouter
          </button>
        </form>
        {msg && <p className={`text-xs font-mono mb-3 ${msg.ok ? 'text-emerald-400' : 'text-red-400'}`}>{msg.text}</p>}

        {!view ? (
          <div className="flex justify-center py-8 text-zinc-500">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : (
          <>
            {/* Requests received */}
            {view.requests.length > 0 && (
              <div className="mb-4">
                <div className="text-[10px] font-mono uppercase tracking-[0.3em] text-amber-400 mb-1.5">Demandes reçues ({view.requests.length})</div>
                <div className="space-y-1">
                  {view.requests.map((r) => (
                    <div key={r} className="flex items-center gap-2 px-3 py-2 border border-amber-800/60 bg-amber-950/20">
                      <span className="flex-1 text-sm text-zinc-100 truncate">{r}</span>
                      <button
                        disabled={!!busy}
                        onClick={() => run('acc-' + r, () => onAccept(r))}
                        className="px-2 py-1 border border-emerald-600 text-emerald-300 text-[11px] font-mono uppercase hover:bg-emerald-900/40 flex items-center gap-1"
                      >
                        <Check className="w-3 h-3" /> Accepter
                      </button>
                      <button
                        disabled={!!busy}
                        onClick={() => run('dec-' + r, () => onRemove(r))}
                        className="px-2 py-1 border border-zinc-700 text-zinc-400 text-[11px] font-mono uppercase hover:text-zinc-100"
                      >
                        Refuser
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Invite hint */}
            {view.friends.length > 0 && !view.canInvite && onCreateRoom && (
              <button
                onClick={onCreateRoom}
                className="w-full mb-3 px-3 py-2 border border-red-800/70 bg-red-950/20 text-[11px] font-mono text-red-300 hover:border-red-500 text-left"
              >
                🎮 Pour inviter un ami : crée d'abord une partie (Multijoueur → Créer). Cliquer ici pour y aller.
              </button>
            )}

            <div className="text-[10px] font-mono uppercase tracking-[0.3em] text-zinc-500 mb-1.5">Mes amis ({view.friends.length})</div>
            {view.friends.length === 0 ? (
              <p className="text-sm text-zinc-500 font-serif italic py-4 text-center">Pas encore d'amis. Ajoute le pseudo d'un joueur ci-dessus !</p>
            ) : (
              <div className="space-y-1">
                {view.friends.map((f) => (
                  <div key={f.username} className="flex items-center gap-2 px-3 py-2 border border-zinc-800 bg-black/40">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: DOT[f.status].color, boxShadow: f.status !== 'offline' ? `0 0 8px ${DOT[f.status].color}` : undefined }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-zinc-100 truncate">{f.username}</div>
                      <div className="text-[10px] font-mono" style={{ color: DOT[f.status].color }}>
                        {DOT[f.status].label}
                      </div>
                    </div>
                    {confirmRemove === f.username ? (
                      <>
                        <button
                          disabled={!!busy}
                          onClick={() => run('rm-' + f.username, async () => {
                            await onRemove(f.username);
                            setConfirmRemove(null);
                          })}
                          className="px-2 py-1 border border-red-700 text-red-300 text-[11px] font-mono uppercase"
                        >
                          Retirer
                        </button>
                        <button onClick={() => setConfirmRemove(null)} className="px-2 py-1 text-zinc-500 text-[11px] font-mono uppercase">
                          Non
                        </button>
                      </>
                    ) : (
                      <>
                        {view.canInvite && f.status !== 'offline' && (
                          <button
                            disabled={!!busy}
                            onClick={() => run('inv-' + f.username, () => onInvite(f.username))}
                            className="px-2 py-1 bg-red-700 hover:bg-red-600 text-white text-[11px] font-mono uppercase tracking-wider"
                          >
                            {busy === 'inv-' + f.username ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Inviter'}
                          </button>
                        )}
                        <button onClick={() => setConfirmRemove(f.username)} title="Retirer cet ami" className="p-1 text-zinc-600 hover:text-red-400">
                          <UserMinus className="w-4 h-4" />
                        </button>
                      </>
                    )}
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

/** "X t'invite !" popup, bottom of the screen. */
export const InviteToast: React.FC<{
  invite: { from: string; mode: string; chapter: number; difficulty: number };
  onJoin: () => void;
  onDecline: () => void;
}> = ({ invite, onJoin, onDecline }) => {
  const mode = invite.mode === 'versus' ? 'Chasse' : invite.mode === 'race' ? 'Course' : 'Coop';
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[90] w-[min(92vw,420px)] p-3 border border-emerald-500 bg-zinc-950/95 shadow-[0_0_30px_rgba(34,197,94,0.35)] flex items-center gap-3">
      <div className="text-3xl animate-bounce">🎮</div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold text-zinc-100 truncate">{invite.from} t'invite !</div>
        <div className="text-[10px] font-mono text-zinc-400">
          {mode} · Chapitre {invite.chapter} · difficulté {invite.difficulty}
        </div>
      </div>
      <button onClick={onJoin} className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-black font-mono text-xs uppercase font-bold">
        Rejoindre
      </button>
      <button onClick={onDecline} className="px-2 py-2 text-zinc-500 hover:text-zinc-200 font-mono text-xs uppercase">
        Non
      </button>
    </div>
  );
};
