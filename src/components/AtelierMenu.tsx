import React, { useState } from 'react';
import { Coins, Loader2, Wrench, X } from 'lucide-react';
import { MAX_UPGRADE, UPGRADES, UPGRADE_PRICES } from '../upgrades';
import { fmtCoins } from '../economy';

interface Props {
  levels: Record<string, number>;
  coins: number;
  admin?: boolean;
  onBuy: (id: string) => Promise<void>;
  onClose: () => void;
}

/** 🔧 L'Atelier: permanent upgrades bought with coins */
export const AtelierMenu: React.FC<Props> = ({ levels, coins, admin = false, onBuy, onClose }) => {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const buy = async (id: string) => {
    setBusy(id);
    setErr(null);
    try {
      await onBuy(id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Achat impossible.');
    }
    setBusy(null);
  };

  return (
    <div className="fixed inset-0 z-[78] bg-black/85 flex items-center justify-center p-3" onClick={onClose}>
      <div className="chunky relative w-full max-w-xl max-h-[92vh] overflow-y-auto p-4 sm:p-6 text-white !rounded-3xl" style={{ background: '#121218' }} onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-3 right-3 w-9 h-9 rounded-xl border border-red-800 bg-black flex items-center justify-center text-red-400" aria-label="Fermer">
          <X className="w-5 h-5" />
        </button>
        <h2 className="flex items-center gap-2 font-game text-[22px] mb-1">
          <Wrench className="w-5 h-5 text-red-500" /> L'Atelier
        </h2>
        <p className="text-[12px] text-zinc-400 mb-1">Des améliorations pour toujours, pour toutes tes parties.</p>
        <p className="text-[11px] text-amber-400/80 mb-3">🏅 Elles ne comptent pas en partie classée : là, tout le monde est à égalité.</p>
        <div className="flex items-center gap-1.5 mb-4 font-game text-[15px] text-amber-300">
          <Coins className="w-4 h-4" /> {admin ? '∞' : fmtCoins(coins)}
        </div>

        <div className="space-y-2">
          {UPGRADES.map((u) => {
            const lv = Math.min(MAX_UPGRADE, levels[u.id] ?? 0);
            const max = lv >= MAX_UPGRADE;
            const price = max ? 0 : UPGRADE_PRICES[lv];
            const can = admin || coins >= price;
            return (
              <div key={u.id} className="flex items-center gap-3 p-3 rounded-xl border border-red-950" style={{ background: '#0d0b0b' }}>
                <span className="w-12 h-12 shrink-0 rounded-lg bg-black/60 border border-red-900/60 flex items-center justify-center text-2xl">{u.icon}</span>
                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="font-game text-[15px] text-zinc-100">{u.name}</span>
                    <span className="flex gap-1">
                      {[0, 1, 2].map((i) => (
                        <span key={i} className={`w-4 h-2 rounded-sm border ${i < lv ? 'bg-red-600 border-red-400' : 'bg-zinc-800 border-zinc-700'}`} />
                      ))}
                    </span>
                  </span>
                  <span className="block text-[11px] text-zinc-400 leading-snug">
                    {lv > 0 && <span className="text-red-300">Actuel : {u.levels[lv - 1]}</span>}
                    {lv > 0 && !max && <span> · </span>}
                    {!max && <span>Niveau {lv + 1} : {u.levels[lv]}</span>}
                    {max && <span className="text-emerald-400"> · niveau maximum</span>}
                  </span>
                </span>
                {!max && (
                  <button
                    onClick={() => buy(u.id)}
                    disabled={!can || !!busy}
                    className="chunky shrink-0 flex items-center gap-1 h-10 px-3 font-game text-[13px] text-amber-200"
                    style={{ background: can ? '#4a0808' : '#1a1a1d' }}
                    title={can ? '' : `Il te manque ${price - coins} pièces`}
                  >
                    {busy === u.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Coins className="w-4 h-4" />}
                    {admin ? 'Gratuit' : fmtCoins(price)}
                  </button>
                )}
              </div>
            );
          })}
        </div>
        {err && <p className="mt-3 text-[12px] text-red-400">{err}</p>}
      </div>
    </div>
  );
};
