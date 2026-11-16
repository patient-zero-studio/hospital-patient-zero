import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import { api, DmView } from '../net/api';

/** 💬 Private chat with a friend (rude words are hidden by the server). */
export const FriendChat: React.FC<{ token: string; friend: string }> = ({ token, friend }) => {
  const [view, setView] = useState<DmView | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      api
        .dm(token, friend)
        .then((v) => alive && setView(v))
        .catch((e) => alive && setErr((e as Error).message));
    load();
    const t = setInterval(load, 3000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [token, friend]);

  const count = view?.messages.length ?? 0;
  useEffect(() => {
    box.current?.scrollTo({ top: box.current.scrollHeight });
  }, [count]);

  const send = async () => {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    setErr(null);
    try {
      await api.dmSend(token, friend, t);
      setText('');
      setView(await api.dm(token, friend));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-2 border border-sky-800/60 bg-sky-950/20 space-y-2">
      <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-sky-300">💬 Discussion avec {friend}</div>
      <div ref={box} className="h-44 overflow-y-auto space-y-1 pr-1">
        {!view ? (
          <div className="flex justify-center py-6 text-zinc-500">
            <Loader2 className="w-4 h-4 animate-spin" />
          </div>
        ) : view.messages.length === 0 ? (
          <p className="text-[11px] font-mono text-zinc-500 text-center py-6">Pas encore de message. Dis bonjour ! 👋</p>
        ) : (
          view.messages.map((m, i) => (
            <div key={i} className={`flex ${m.mine ? 'justify-end' : 'justify-start'}`}>
              <div
                data-no-i18n
                className={`max-w-[80%] px-2 py-1 text-xs break-words ${m.mine ? 'bg-sky-700/60 text-sky-50' : 'bg-zinc-800 text-zinc-100'}`}
                title={new Date(m.at).toLocaleString()}
              >
                {m.text}
              </div>
            </div>
          ))
        )}
      </div>
      {err && <p className="text-[11px] font-mono text-red-400">{err}</p>}
      <form
        className="flex gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={200}
          placeholder="Ton message…"
          className="flex-1 min-w-0 bg-black border border-zinc-700 px-2 py-1.5 text-xs text-zinc-100 focus:border-sky-500 outline-none"
        />
        <button type="submit" disabled={busy || !text.trim()} className="px-2.5 bg-sky-600 hover:bg-sky-500 text-black disabled:opacity-40" aria-label="Envoyer">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </form>
      <p className="text-[9px] font-mono text-zinc-600">Les gros mots sont masqués. Signale un joueur depuis son profil si besoin.</p>
    </div>
  );
};
