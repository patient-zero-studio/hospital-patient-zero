import React, { useState } from 'react';
import { Check, Loader2, Lock, Trophy, X } from 'lucide-react';
import type { WalletView } from '../net/api';
import { BOXES, cosmetic } from '../economy';
import { LEVEL_SKINS, PASS_TIERS, PASS_XP_PER_TIER, passReward } from '../progression';
import { levelColor } from '../levels';
import { CosmeticBadge } from './ShopMenu';

const fmtLeft = (ms: number) => {
  const h = Math.max(0, Math.floor(ms / 3600000));
  return h >= 48 ? `${Math.floor(h / 24)} jours` : `${h} h`;
};

/** How many rewards wait to be taken (badge on the menu button). */
export const progressionAlerts = (w: WalletView | null) => {
  if (!w?.weekly || !w.pass) return 0;
  const weekly = w.weekly.list.filter((c) => c.progress >= c.goal && !c.claimed).length;
  let pass = 0;
  for (let t = 1; t <= w.pass.tier; t++) if (!w.pass.claimed.includes(t)) pass++;
  return weekly + pass;
};

interface Props {
  wallet: WalletView | null;
  onClaimWeekly: (id: string) => Promise<string>;
  onClaimPass: (tier: number) => Promise<string>;
  onClose: () => void;
}

/** 🏆 Weekly challenges, the monthly season pass and the level skins. */
export const ProgressionMenu: React.FC<Props> = ({ wallet, onClaimWeekly, onClaimPass, onClose }) => {
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = async (key: string, fn: () => Promise<string>) => {
    setBusy(key);
    setMsg(null);
    try {
      setMsg({ ok: true, text: '🎉 ' + (await fn()) });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };
  const level = wallet?.level?.level ?? 1;
  const pass = wallet?.pass;
  const weekly = wallet?.weekly;

  return (
    <div className="fixed inset-0 z-[75] bg-black/85 flex items-center justify-center p-4" onClick={onClose}>
      <div className="relative w-full max-w-3xl max-h-[92vh] overflow-y-auto bg-zinc-950 border border-zinc-800 p-6 shadow-[0_0_60px_rgba(168,85,247,0.18)]" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-3 right-3 text-zinc-500 hover:text-zinc-200" aria-label="Fermer">
          <X className="w-5 h-5" />
        </button>
        <h2 className="font-mono uppercase tracking-[0.25em] text-sm text-zinc-100 flex items-center gap-2 mb-4">
          <Trophy className="w-4 h-4 text-violet-400" /> Pass & défis
        </h2>
        {msg && <p className={`text-sm font-mono mb-3 ${msg.ok ? 'text-emerald-400' : 'text-red-400'}`}>{msg.text}</p>}
        {!wallet || !pass || !weekly ? (
          <div className="flex justify-center py-12 text-zinc-500">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : (
          <>
            {/* Weekly challenges */}
            <section className="mb-6">
              <div className="flex items-baseline justify-between mb-2">
                <h3 className="font-mono uppercase tracking-[0.25em] text-xs text-sky-300">🗓️ Défis de la semaine</h3>
                <span className="text-[10px] font-mono text-zinc-500">nouveaux dans {fmtLeft(weekly.resetAt - Date.now())}</span>
              </div>
              <div className="space-y-1.5">
                {weekly.list.map((c) => {
                  const done = c.progress >= c.goal;
                  return (
                    <div key={c.id} className={`flex items-center gap-3 p-2.5 border ${c.claimed ? 'border-zinc-800 opacity-60' : done ? 'border-emerald-500 bg-emerald-950/20' : 'border-zinc-800 bg-black/40'}`}>
                      <div className="text-2xl">{c.icon}</div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-zinc-100">{c.title}</div>
                        <div className="flex items-center gap-2 mt-1">
                          <div className="flex-1 h-1.5 bg-zinc-900">
                            <div className="h-full bg-sky-500" style={{ width: `${(c.progress / c.goal) * 100}%` }} />
                          </div>
                          <span className="text-[10px] font-mono text-zinc-400">
                            {c.progress}/{c.goal}
                          </span>
                        </div>
                        <div className="text-[10px] font-mono text-amber-300 mt-0.5">
                          🪙 {c.coins} · ⭐ {c.xp} XP
                        </div>
                      </div>
                      {c.claimed ? (
                        <span className="text-[10px] font-mono text-emerald-400 uppercase flex items-center gap-1">
                          <Check className="w-3 h-3" /> Pris
                        </span>
                      ) : (
                        <button
                          disabled={!done || !!busy}
                          onClick={() => run('w-' + c.id, () => onClaimWeekly(c.id))}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-black font-mono text-[11px] uppercase font-bold disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          {busy === 'w-' + c.id ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Récupérer'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Season pass */}
            <section className="mb-6">
              <div className="flex items-baseline justify-between mb-1">
                <h3 className="font-mono uppercase tracking-[0.25em] text-xs text-violet-300">🏆 {pass.name}</h3>
                <span className="text-[10px] font-mono text-zinc-500">se termine dans {fmtLeft(pass.ends - Date.now())}</span>
              </div>
              <p className="text-[11px] font-mono text-zinc-500 mb-2">
                Gratuit pour tous : chaque {PASS_XP_PER_TIER} XP gagnés ce mois-ci débloquent un palier. Skins exclusifs aux paliers 10, 20 et 30 !
              </p>
              <div className="flex items-center gap-2 mb-2">
                <div className="flex-1 h-2.5 bg-zinc-900 border border-zinc-800">
                  <div className="h-full bg-gradient-to-r from-violet-700 to-fuchsia-500" style={{ width: `${Math.min(100, (pass.xp / (PASS_TIERS * PASS_XP_PER_TIER)) * 100)}%` }} />
                </div>
                <span className="text-[11px] font-mono text-violet-200">
                  Palier {pass.tier}/{PASS_TIERS}
                </span>
              </div>
              <div className="flex gap-1.5 overflow-x-auto pb-2">
                {Array.from({ length: PASS_TIERS }, (_, i) => {
                  const t = i + 1;
                  const r = passReward(t);
                  const got = pass.claimed.includes(t);
                  const open = t <= pass.tier;
                  const skin = r.kind === 'skin' ? cosmetic(r.skin) : undefined;
                  const big = r.kind === 'skin' || r.kind === 'box';
                  return (
                    <button
                      key={t}
                      disabled={!open || got || !!busy}
                      onClick={() => run('p-' + t, () => onClaimPass(t))}
                      title={
                        r.kind === 'coins'
                          ? `${r.coins} pièces`
                          : r.kind === 'supplies'
                            ? `${r.count} ressources`
                            : r.kind === 'box'
                              ? BOXES.find((b) => b.id === r.box)!.name
                              : skin?.name
                      }
                      className={`relative shrink-0 w-16 flex flex-col items-center gap-1 p-1.5 border text-center ${
                        got ? 'border-zinc-800 opacity-50' : open ? 'border-violet-400 bg-violet-950/40 animate-pulse cursor-pointer' : big ? 'border-amber-700/60 bg-black/40' : 'border-zinc-800 bg-black/40'
                      }`}
                    >
                      <span className="text-[9px] font-mono text-zinc-500">{t}</span>
                      {skin ? (
                        <CosmeticBadge c={skin} size={34} />
                      ) : (
                        <span className="text-2xl leading-[34px]">{r.kind === 'coins' ? '🪙' : r.kind === 'supplies' ? '📦' : '🎁'}</span>
                      )}
                      <span className="text-[9px] font-mono text-zinc-400 leading-tight">
                        {r.kind === 'coins' ? r.coins : r.kind === 'supplies' ? `${r.count}×` : r.kind === 'box' ? r.box : 'skin'}
                      </span>
                      {got ? (
                        <Check className="absolute top-1 right-1 w-3 h-3 text-emerald-400" />
                      ) : !open ? (
                        <Lock className="absolute top-1 right-1 w-2.5 h-2.5 text-zinc-600" />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Level skins */}
            <section>
              <h3 className="font-mono uppercase tracking-[0.25em] text-xs mb-2" style={{ color: levelColor(level) }}>
                ⭐ Skins de niveau (tu es niveau {level})
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {LEVEL_SKINS.map((ls) => {
                  const c = cosmetic(ls.skin)!;
                  const has = level >= ls.level;
                  return (
                    <div key={ls.skin} className={`flex flex-col items-center p-2 border text-center ${has ? 'border-emerald-600 bg-emerald-950/20' : 'border-zinc-800 bg-black/40'}`}>
                      <div className={has ? '' : 'grayscale opacity-50'}>
                        <CosmeticBadge c={c} size={44} />
                      </div>
                      <div className="text-xs text-zinc-100 mt-1">{c.name}</div>
                      <div className="text-[10px] font-mono" style={{ color: has ? '#34d399' : levelColor(ls.level) }}>
                        {has ? '✔ Débloqué' : `Niveau ${ls.level}`}
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="text-[10px] font-mono text-zinc-600 mt-2">Donnés automatiquement en atteignant le niveau. Équipe-les dans la personnalisation.</p>
            </section>
          </>
        )}
      </div>
    </div>
  );
};
