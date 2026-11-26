import React, { useEffect, useRef, useState } from 'react';
import { Check, Loader2, Lock, Music, Play, X } from 'lucide-react';
import { MENU_TRACKS, trackUnlocked, unlockText } from '../music';
import { sound } from '../audio/SoundSystem';
import { api, WalletView } from '../net/api';
import { fmtCoins } from '../economy';

interface Props {
  token: string | null;
  wallet: WalletView | null;
  onWallet: (w: WalletView) => void;
  onClose: () => void;
}

const saved = () => {
  try {
    return localStorage.getItem('pz-menu-track') || 'aurore';
  } catch {
    return 'aurore';
  }
};

/** 🎵 Pick the menu music; locked tracks can be listened to, not chosen. */
export const MusicMenu: React.FC<Props> = ({ token, wallet, onWallet, onClose }) => {
  const [chosen, setChosen] = useState(saved);
  const [playing, setPlaying] = useState(sound.menuTrack);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const chosenRef = useRef(chosen);
  chosenRef.current = chosen;

  // Back to the chosen track when the menu closes (after a preview)
  useEffect(() => () => sound.setMenuTrack(chosenRef.current), []);

  const player = {
    level: wallet?.level?.level ?? 1,
    ach: wallet?.ach?.done ?? {},
    owned: wallet?.tracks ?? [],
    admin: wallet?.admin,
  };

  const listen = (id: string) => {
    sound.init();
    sound.resume();
    sound.setMenuTrack(id);
    if (!sound.menuMusicPlaying) sound.startMenuMusic();
    setPlaying(id);
  };
  const choose = (id: string) => {
    try {
      localStorage.setItem('pz-menu-track', id);
    } catch {
      /* ignore */
    }
    setChosen(id);
    listen(id);
    // 🎵 it's also the record on your room's jukebox
    if (token) api.setJukebox(token, id).catch(() => undefined);
  };

  return (
    <div className="fixed inset-0 z-[78] bg-black/85 flex items-center justify-center p-4" onClick={onClose}>
      <div className="relative w-full max-w-md max-h-[92vh] overflow-y-auto bg-zinc-950 border border-zinc-800 p-6 shadow-[0_0_60px_rgba(236,72,153,0.12)]" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-3 right-3 text-zinc-500 hover:text-zinc-200" aria-label="Fermer">
          <X className="w-5 h-5" />
        </button>
        <h2 className="font-mono uppercase tracking-[0.25em] text-sm text-zinc-100 flex items-center gap-2 mb-1">
          <Music className="w-4 h-4 text-pink-400" /> Musiques du menu
        </h2>
        <p className="text-xs text-zinc-400 font-serif italic mb-4">Écoute-les toutes. Choisis celles que tu as débloquées (niveau, succès ou pièces).</p>
        {msg && <p className={`text-xs font-mono mb-3 ${msg.ok ? 'text-emerald-400' : 'text-red-400'}`}>{msg.text}</p>}
        <div className="space-y-1.5">
          {MENU_TRACKS.map((t) => {
            const open = trackUnlocked(t, player);
            const isChosen = chosen === t.id;
            return (
              <div key={t.id} className={`flex items-center gap-3 px-3 py-2 border ${isChosen ? 'border-pink-500 bg-pink-950/20' : 'border-zinc-800 bg-black/40'}`}>
                <span className={`text-2xl ${playing === t.id ? 'animate-pulse' : ''}`}>{t.emoji}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-zinc-100 flex items-center gap-1.5">
                    {t.name} {!open && <Lock className="w-3 h-3 text-zinc-500" />}
                  </div>
                  <div className="text-[10px] text-zinc-500">{t.desc}</div>
                  {!open && <div className="text-[10px] font-mono text-amber-300">🔒 {unlockText(t.unlock)}</div>}
                </div>
                <button onClick={() => listen(t.id)} title="Écouter" className={`p-1.5 border ${playing === t.id ? 'border-pink-500 text-pink-300' : 'border-zinc-700 text-zinc-400 hover:text-zinc-100'}`}>
                  <Play className="w-3.5 h-3.5" />
                </button>
                {open ? (
                  isChosen ? (
                    <span className="px-2 py-1 text-[10px] font-mono uppercase text-pink-300 flex items-center gap-1">
                      <Check className="w-3 h-3" /> Choisie
                    </span>
                  ) : (
                    <button onClick={() => choose(t.id)} className="px-2 py-1 bg-pink-600 hover:bg-pink-500 text-white text-[10px] font-mono uppercase">
                      Choisir
                    </button>
                  )
                ) : t.unlock.kind === 'coins' && token ? (
                  <button
                    disabled={!!busy || (wallet?.wallet.coins ?? 0) < t.unlock.price}
                    onClick={async () => {
                      setBusy(t.id);
                      setMsg(null);
                      try {
                        const r = await api.buyTrack(token, t.id);
                        onWallet(r);
                        setMsg({ ok: true, text: r.message });
                        choose(t.id);
                      } catch (e) {
                        setMsg({ ok: false, text: (e as Error).message });
                      } finally {
                        setBusy(null);
                      }
                    }}
                    className="px-2 py-1 bg-amber-500 hover:bg-amber-400 text-black text-[10px] font-mono uppercase font-bold disabled:opacity-40"
                    title={`Tu as ${fmtCoins(wallet?.wallet.coins ?? 0)} pièces`}
                  >
                    {busy === t.id ? <Loader2 className="w-3 h-3 animate-spin" /> : `${t.unlock.price} 🪙`}
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
        {!token && <p className="text-[11px] font-mono text-zinc-500 mt-3">Connecte-toi pour débloquer les musiques.</p>}
      </div>
    </div>
  );
};
