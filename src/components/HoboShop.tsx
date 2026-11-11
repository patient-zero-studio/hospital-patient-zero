import React, { useMemo, useState } from 'react';
import { Coins, Loader2, Package, ShoppingBag, X } from 'lucide-react';
import { HOBO_GOODS, SUPPLY_NAMES, SupplyKind, fmtCoins } from '../economy';
import type { WalletView } from '../net/api';
import { ItemIcon } from './ItemIcon';

const ICON: Record<string, string> = {
  battery: 'BatteryCharging',
  food: 'Cookie',
  medkit: 'HeartPulse',
  can: 'CupSoda',
  alarm: 'AlarmClock',
  sedative: 'Syringe',
};

const LINES = [
  '« Psst… T\'as des pièces ? J\'ai ce qu\'il te faut. Et non, je sors pas d\'ici : la bestiole du conduit me connaît. »',
  '« Approche, approche. Piles, sédatifs, de quoi grignoter… Tout est presque neuf. »',
  '« Je vis ici depuis la fermeture. Les monstres ? Ils viennent jamais dans mon entrepôt. Bon, alors, t\'achètes ? »',
  '« Les pièces que tu ramasses là-haut, garde-les. Si tu sors vivant, elles sont à toi. Sinon… elles sont à moi. »',
];

interface Props {
  username: string | null;
  wallet: WalletView | null;
  handsFull: boolean;
  /** Pays (server) then gives the item in game; throws on error. */
  onBuy: (kind: string) => Promise<void>;
  onTake: (kind: SupplyKind) => Promise<void>;
  onOpenShop: () => void;
  onLogin: () => void;
  onClose: () => void;
}

/** The hobo of the warehouse: buy supplies with your coins, collect your stash. */
export const HoboShop: React.FC<Props> = ({ username, wallet, handsFull, onBuy, onTake, onOpenShop, onLogin, onClose }) => {
  const line = useMemo(() => LINES[Math.floor(Math.random() * LINES.length)], []);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const coins = wallet?.wallet.coins ?? 0;
  const stash = wallet?.wallet.stash;

  const run = async (key: string, fn: () => Promise<void>, ok: string) => {
    if (handsFull) {
      setMsg({ ok: false, text: '« Tes mains sont pleines, l\'ami. Pose un truc d\'abord ([X]). »' });
      return;
    }
    setBusy(key);
    setMsg(null);
    try {
      await fn();
      setMsg({ ok: true, text: ok });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black/80 flex items-center justify-center p-4">
      <div className="relative w-full max-w-xl max-h-[92vh] overflow-y-auto bg-zinc-950 border border-amber-900/60 p-6 shadow-[0_0_60px_rgba(255,120,30,0.2)]">
        <button onClick={onClose} className="absolute top-3 right-3 text-zinc-500 hover:text-zinc-200">
          <X className="w-5 h-5" />
        </button>
        <div className="flex items-start gap-3 mb-4 pr-6">
          <div className="text-4xl">🧔</div>
          <div>
            <div className="text-[10px] font-mono uppercase tracking-[0.3em] text-amber-500">Le SDF de l'entrepôt</div>
            <p className="text-sm font-serif italic text-zinc-300 leading-snug">{line}</p>
          </div>
        </div>

        {!username ? (
          <div className="text-center py-6 space-y-3">
            <p className="text-sm text-zinc-400 font-serif italic">« Pas de compte, pas de pièces, pas d'affaires. »</p>
            <button onClick={onLogin} className="px-5 py-2 bg-amber-600 hover:bg-amber-500 text-black font-mono text-xs uppercase tracking-widest font-bold">
              Se connecter
            </button>
          </div>
        ) : !wallet ? (
          <div className="flex justify-center py-8 text-zinc-500">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] font-mono uppercase tracking-[0.3em] text-zinc-500">Sa marchandise</div>
              <div className="flex items-center gap-1.5 text-amber-300 font-mono text-sm">
                <Coins className="w-4 h-4" /> {fmtCoins(coins)}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
              {HOBO_GOODS.map((g) => (
                <div key={g.kind} className="flex items-center gap-3 p-2 border border-zinc-800 bg-black/40">
                  <div className="w-10 h-10 flex items-center justify-center border border-zinc-700 bg-zinc-900">
                    <ItemIcon icon={ICON[g.kind]} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-zinc-100">{g.name}</div>
                    <div className="text-[10px] text-zinc-500 leading-tight">{g.desc}</div>
                  </div>
                  <button
                    disabled={!!busy || coins < g.price}
                    onClick={() => run(g.kind, () => onBuy(g.kind), `« Tiens, ${g.name.toLowerCase()}. Fais-en bon usage. »`)}
                    className="px-2.5 py-1.5 font-mono text-xs flex items-center gap-1 border border-amber-600 text-amber-300 hover:bg-amber-900/40 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {busy === g.kind ? <Loader2 className="w-3 h-3 animate-spin" /> : <Coins className="w-3 h-3" />} {g.price}
                  </button>
                </div>
              ))}
            </div>

            <div className="text-[10px] font-mono uppercase tracking-[0.3em] text-zinc-500 mb-2 flex items-center gap-2">
              <Package className="w-3.5 h-3.5" /> Votre réserve (boîtes mystère)
            </div>
            {stash && Object.values(stash).some((n) => n > 0) ? (
              <div className="flex flex-wrap gap-2 mb-4">
                {(Object.keys(stash) as SupplyKind[])
                  .filter((k) => stash[k] > 0)
                  .map((k) => (
                    <button
                      key={k}
                      disabled={!!busy}
                      onClick={() => run('stash-' + k, () => onTake(k), `« Ah oui, je te gardais ça : ${SUPPLY_NAMES[k].toLowerCase()}. »`)}
                      className="flex items-center gap-2 px-3 py-1.5 border border-zinc-700 hover:border-emerald-500 text-zinc-200 text-xs"
                    >
                      <ItemIcon icon={ICON[k]} className="w-4 h-4" /> {SUPPLY_NAMES[k]} ×{stash[k]} — récupérer
                    </button>
                  ))}
              </div>
            ) : (
              <p className="text-[11px] text-zinc-600 font-mono mb-4">Rien en réserve. Les boîtes mystère peuvent vous donner des ressources.</p>
            )}

            {msg && <p className={`text-xs font-serif italic mb-3 ${msg.ok ? 'text-emerald-300' : 'text-red-400'}`}>{msg.text}</p>}

            <button onClick={onOpenShop} className="w-full py-2.5 border border-amber-700 text-amber-300 hover:bg-amber-950/40 font-mono text-xs uppercase tracking-widest flex items-center justify-center gap-2">
              <ShoppingBag className="w-4 h-4" /> Skins & boîtes mystère
            </button>
          </>
        )}
      </div>
    </div>
  );
};
