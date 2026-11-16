import React, { useState } from 'react';
import { Loader2, Ticket, X } from 'lucide-react';
import { api, WalletView } from '../net/api';

/** 🎟️ Enter a gift code (made by the admins: YouTube, TikTok, events…) */
export const RedeemCode: React.FC<{ token: string; onWallet: (w: WalletView) => void; onClose: () => void }> = ({ token, onWallet, onClose }) => {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const submit = async () => {
    if (!code.trim() || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await api.redeem(token, code.trim());
      onWallet(r);
      setMsg({ ok: true, text: r.message });
      setCode('');
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] bg-black/85 flex items-center justify-center p-4" onClick={onClose}>
      <div className="relative w-full max-w-sm bg-zinc-950 border border-amber-700/60 p-6 shadow-[0_0_60px_rgba(245,158,11,0.15)]" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-3 right-3 text-zinc-500 hover:text-zinc-200" aria-label="Fermer">
          <X className="w-5 h-5" />
        </button>
        <h2 className="font-mono uppercase tracking-[0.25em] text-sm text-zinc-100 flex items-center gap-2 mb-2">
          <Ticket className="w-4 h-4 text-amber-400" /> Code cadeau
        </h2>
        <p className="text-xs text-zinc-400 font-serif italic mb-4">Tu as un code ? Entre-le ici pour gagner des pièces, des friandises ou un skin. Chaque code ne marche qu'une fois par joueur.</p>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={20}
            placeholder="EX : NOEL2026"
            autoFocus
            className="flex-1 min-w-0 bg-black border border-zinc-700 px-3 py-2 text-sm text-amber-100 font-mono tracking-widest focus:border-amber-500 outline-none"
          />
          <button type="submit" disabled={busy || !code.trim()} className="px-3 py-2 bg-amber-500 hover:bg-amber-400 text-black font-mono text-xs uppercase font-bold disabled:opacity-40">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Valider'}
          </button>
        </form>
        {msg && <p className={`text-xs font-mono mt-3 ${msg.ok ? 'text-emerald-400' : 'text-red-400'}`}>{msg.text}</p>}
      </div>
    </div>
  );
};
