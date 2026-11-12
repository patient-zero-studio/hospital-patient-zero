import React, { useEffect, useState } from 'react';
import { Coins, Crown, Gift, Loader2, ShoppingBag, Sparkles, X } from 'lucide-react';
import { ADVENT, BOXES, BoxId, BoxResult, CATALOG, Cosmetic, TIER_COLOR, TIER_LABEL, TIER_PRICE, cosmetic, fmtCoins } from '../economy';
import { api, AdminUser, WalletView } from '../net/api';
import { SEASON_INFO, Season, SeasonSetting } from '../seasons';

/** Admin: start or stop an event (Christmas / Halloween) for every player. */
const SeasonSwitch: React.FC<{ value: SeasonSetting; onSet: (s: SeasonSetting) => Promise<void> }> = ({ value, onSet }) => {
  const [busy, setBusy] = useState(false);
  const opts: [SeasonSetting, string][] = [
    ['auto', '📅 Automatique (dates)'],
    ['noel', '🎄 Noël maintenant'],
    ['halloween', '🎃 Halloween maintenant'],
    ['off', '⛔ Aucun événement'],
  ];
  return (
    <div className="mb-5 p-3 border border-zinc-800 bg-black/40">
      <div className="text-[10px] font-mono uppercase tracking-[0.3em] text-zinc-500 mb-2">Événement pour tous les joueurs</div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1">
        {opts.map(([v, label]) => (
          <button
            key={v}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onSet(v);
              } finally {
                setBusy(false);
              }
            }}
            className={`px-2 py-2 border text-[11px] font-mono ${value === v ? 'border-amber-400 text-amber-200 bg-amber-950/40' : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'}`}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="text-[10px] font-mono text-zinc-600 mt-2">
        Automatique : Halloween du 1er octobre au 5 novembre, Noël du 1er décembre au 6 janvier. Les cases du calendrier s'ouvrent quand même jour par jour en décembre (les
        admins peuvent toutes les ouvrir pour tester).
      </p>
    </div>
  );
};

/** One reward of the advent calendar, as a little icon. */
const adventIcon = (day: number) => {
  const r = ADVENT[day - 1];
  if (r.skin) return cosmetic(r.skin);
  return null;
};

/** 🎄 Advent calendar: 25 boxes, one opens every day of December. */
const AdventCalendar: React.FC<{
  open: number;
  claimed: number[];
  busy: boolean;
  onOpen: (day: number) => void;
}> = ({ open, claimed, busy, onOpen }) => (
  <div className="mb-5">
    <div className="flex items-baseline justify-between mb-2">
      <h3 className="font-mono uppercase tracking-[0.25em] text-xs text-red-300">🎁 Calendrier de l'Avent</h3>
      <span className="text-[10px] font-mono text-zinc-500">{claimed.length} / 25 ouvertes</span>
    </div>
    <div className="grid grid-cols-5 gap-1.5 p-2 max-w-[440px] mx-auto border border-red-900/60 bg-gradient-to-b from-red-950/40 to-emerald-950/30">
      {ADVENT.map((r, i) => {
        const day = i + 1;
        const done = claimed.includes(day);
        const ready = !done && day <= open;
        const skin = adventIcon(day);
        const special = !!skin && (skin.tier === 'exclusif' || skin.calendarOnly);
        return (
          <button
            key={day}
            disabled={!ready || busy}
            onClick={() => onOpen(day)}
            title={done ? 'Déjà ouverte' : ready ? 'Ouvrir !' : `S'ouvre le ${day} décembre`}
            className={`relative aspect-square flex flex-col items-center justify-center border-2 text-center transition-transform ${
              done
                ? 'border-zinc-700 bg-black/50'
                : ready
                  ? 'border-amber-300 bg-red-700/80 hover:scale-105 animate-pulse shadow-[0_0_18px_rgba(252,211,77,0.6)] cursor-pointer'
                  : `${special ? 'border-amber-500/70' : 'border-red-900'} bg-red-950/70`
            }`}
          >
            {done ? (
              skin ? (
                <CosmeticBadge c={skin} size={30} />
              ) : (
                <span className="text-xl">{r.supplies ? '📦' : '🪙'}</span>
              )
            ) : (
              <>
                <span className={`font-serif font-black ${day === 25 ? 'text-2xl text-amber-300' : 'text-lg text-zinc-100'}`}>{day}</span>
                <span className="text-[10px] leading-none">{ready ? '🎁' : special ? '⭐' : '🔒'}</span>
              </>
            )}
          </button>
        );
      })}
    </div>
    <p className="text-[10px] font-mono text-zinc-500 mt-1.5">
      Une case par jour du 1er au 25 décembre. ⭐ = skin spécial qu'on ne trouve que dans le calendrier (le 25 : le costume de Père Noël !). Une case oubliée peut être
      ouverte plus tard, jusqu'au 6 janvier.
    </p>
  </div>
);

/** Little visual for a cosmetic card. */
export const CosmeticBadge: React.FC<{ c: Cosmetic; size?: number }> = ({ c, size = 44 }) => {
  const isColor = c.value.startsWith('#');
  const emoji: Record<string, string> = {
    cap: '🧢', glasses: '👓', mask: '😷', headphones: '🎧', bandana: '🟥', beanie: '🧶',
    horns: '😈', chains: '⛓️', bandages: '🩹', hockey: '🏒',
    surgeon: '🩺', doctor: '🥼', prisoner: '🟧', punk: '🎸', gold: '🏆', neon: '💡',
    skeleton: '💀', zombie: '🧟', demon: '👹', inferno: '🔥', shadow: '🌑', goldm: '👑',
    santahat: '🎅', elfhat: '🧝', antlers: '🦌', sweater: '🧶', elf: '🧝', santa: '🎅',
    yeti: '❄️', gingerbread: '🍪', krampus: '👹',
    witchhat: '🧙', pumpkinhead: '🎃', witch: '🧙', vampire: '🧛', reaper: '💀', mummy: '🧻', pumpking: '🎃',
  };
  return (
    <div
      className="flex items-center justify-center border-2 shrink-0"
      style={{
        width: size,
        height: size,
        borderColor: TIER_COLOR[c.tier],
        background: isColor ? c.value : 'radial-gradient(circle, #27272a 0%, #09090b 100%)',
        boxShadow: c.tier === 'exclusif' ? `0 0 16px ${TIER_COLOR[c.tier]}88` : undefined,
      }}
    >
      {!isColor && <span style={{ fontSize: size * 0.5 }}>{emoji[c.value] ?? '✨'}</span>}
    </div>
  );
};

const fmtCountdown = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h} h ${String(m).padStart(2, '0')} min`;
};

interface Props {
  username: string | null;
  wallet: WalletView | null;
  onBuy: (id: string) => Promise<void>;
  onOpenBox: (box: BoxId) => Promise<BoxResult>;
  /** free gift of the day */
  onClaimDaily?: () => Promise<BoxResult>;
  /** 🎄 advent calendar box of the day */
  onClaimAdvent?: (day: number) => Promise<BoxResult>;
  /** admin: start / stop an event for everyone */
  onSetSeason?: (s: SeasonSetting) => Promise<void>;
  onLogin: () => void;
  onCustomize?: () => void;
  onClose: () => void;
  /** needed for the admin panel */
  token?: string | null;
}

/** Admin: gift coins to any player. */
const AdminPanel: React.FC<{ token: string }> = ({ token }) => {
  const [list, setList] = useState<AdminUser[] | null>(null);
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState(100);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const load = () => api.adminUsers(token).then(setList).catch((e) => setMsg({ ok: false, text: (e as Error).message }));
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);
  const gift = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api.adminGift(token, to, amount);
      setMsg({ ok: true, text: `🎁 ${amount} pièces offertes à ${r.to} (il a maintenant ${r.coins} pièces).` });
      load();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-3">
      <p className="text-[11px] font-mono text-amber-400">👑 Compte administrateur : pièces infinies, tout est gratuit pour vous, et vous pouvez offrir des pièces.</p>
      <div className="flex flex-wrap gap-2 items-end">
        <label className="flex-1 min-w-[140px]">
          <span className="block text-[10px] font-mono uppercase tracking-[0.3em] text-zinc-500 mb-1">Joueur</span>
          <input
            value={to}
            onChange={(e) => setTo(e.target.value)}
            list="admin-players"
            placeholder="Pseudo"
            className="w-full bg-black border border-zinc-700 px-3 py-2 text-sm text-zinc-100 font-mono focus:border-amber-500 outline-none"
          />
          <datalist id="admin-players">{list?.filter((u) => !u.admin).map((u) => <option key={u.username} value={u.username} />)}</datalist>
        </label>
        <label className="w-32">
          <span className="block text-[10px] font-mono uppercase tracking-[0.3em] text-zinc-500 mb-1">Pièces</span>
          <input
            type="number"
            min={1}
            max={1000000}
            value={amount}
            onChange={(e) => setAmount(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
            className="w-full bg-black border border-zinc-700 px-3 py-2 text-sm text-zinc-100 font-mono focus:border-amber-500 outline-none"
          />
        </label>
        <button
          disabled={busy || !to.trim()}
          onClick={gift}
          className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-black font-mono text-xs uppercase tracking-widest font-bold disabled:opacity-40 flex items-center gap-2"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Gift className="w-4 h-4" />} Offrir
        </button>
      </div>
      <div className="flex flex-wrap gap-1">
        {[50, 100, 500, 1000, 5000].map((n) => (
          <button key={n} onClick={() => setAmount(n)} className={`px-2 py-1 border text-[11px] font-mono ${amount === n ? 'border-amber-400 text-amber-300' : 'border-zinc-700 text-zinc-400'}`}>
            {n}
          </button>
        ))}
      </div>
      {msg && <p className={`text-xs font-mono ${msg.ok ? 'text-emerald-400' : 'text-red-400'}`}>{msg.text}</p>}
      <div>
        <div className="text-[10px] font-mono uppercase tracking-[0.3em] text-zinc-500 mb-1.5">Joueurs ({list?.length ?? '…'})</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
          {list?.map((u) => (
            <button
              key={u.username}
              disabled={u.admin}
              onClick={() => setTo(u.username)}
              className={`flex justify-between px-3 py-1.5 border text-left text-sm ${to === u.username ? 'border-amber-500 bg-amber-950/30' : 'border-zinc-800 bg-black/40'} disabled:opacity-60`}
            >
              <span className="text-zinc-200">{u.admin ? '👑 ' : ''}{u.username}</span>
              <span className="text-amber-300 font-mono">🪙 {fmtCoins(u.coins)}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

/** Cosmetics shop: today's offers (change every day) and mystery boxes. */
export const ShopMenu: React.FC<Props> = ({ username, wallet, onBuy, onOpenBox, onClaimDaily, onClaimAdvent, onSetSeason, onLogin, onCustomize, onClose, token }) => {
  const season: Season | null = wallet?.season ?? null;
  const [tab, setTab] = useState<'event' | 'shop' | 'boxes' | 'mine' | 'admin'>(season ? 'event' : 'shop');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reveal, setReveal] = useState<{ box: BoxId | 'daily' | 'advent'; result: BoxResult | null } | null>(null);
  // The event can start / stop while the shop is open (admin switch)
  useEffect(() => {
    if (!season && tab === 'event') setTab('shop');
  }, [season, tab]);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const coins = wallet?.wallet.coins ?? 0;
  const owned = new Set(wallet?.wallet.owned ?? []);
  const offers = (wallet?.shop ?? []).map(cosmetic).filter(Boolean) as Cosmetic[];
  const eventOffers = (wallet?.seasonShop ?? []).map(cosmetic).filter(Boolean) as Cosmetic[];

  const offerCard = (c: Cosmetic) => {
    const price = TIER_PRICE[c.tier];
    const have = owned.has(c.id);
    return (
      <div key={c.id} className="flex items-center gap-3 p-2 border border-zinc-800 bg-black/40">
        <CosmeticBadge c={c} />
        <div className="flex-1 min-w-0">
          <div className="text-sm text-zinc-100 truncate">{c.name}</div>
          <div className="text-[10px] font-mono uppercase tracking-wider" style={{ color: TIER_COLOR[c.tier] }}>
            {TIER_LABEL[c.tier]} · {c.target === 'human' ? 'Humain' : 'Monstre'}
          </div>
        </div>
        {have ? (
          <span className="text-[10px] font-mono text-emerald-400 uppercase">Possédé</span>
        ) : (
          <button
            disabled={!!busy || coins < price}
            onClick={() => run(c.id, () => onBuy(c.id))}
            className="px-3 py-1.5 font-mono text-xs flex items-center gap-1 border border-amber-600 text-amber-300 hover:bg-amber-900/40 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {busy === c.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Coins className="w-3 h-3" />} {price}
          </button>
        )}
      </div>
    );
  };

  const openAdvent = (day: number) =>
    onClaimAdvent &&
    run('advent', async () => {
      setReveal({ box: 'advent', result: null });
      try {
        const r = await onClaimAdvent(day);
        await new Promise((ok) => setTimeout(ok, 900));
        setReveal({ box: 'advent', result: r });
      } catch (e) {
        setReveal(null);
        throw e;
      }
    });

  const tabBtn = (t: typeof tab, label: React.ReactNode) => (
    <button
      onClick={() => setTab(t)}
      className={`flex-1 py-2 font-mono text-xs uppercase tracking-widest border flex items-center justify-center gap-2 ${
        tab === t ? 'border-amber-500 bg-amber-950/30 text-zinc-100' : 'border-zinc-800 text-zinc-500 hover:border-zinc-600'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-[75] bg-black/85 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="relative w-full max-w-3xl max-h-[92vh] overflow-y-auto bg-zinc-950 border border-zinc-800 p-6 shadow-[0_0_60px_rgba(250,180,0,0.15)]"
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute top-3 right-3 text-zinc-500 hover:text-zinc-200">
          <X className="w-5 h-5" />
        </button>
        <div className="flex items-center justify-between mb-4 pr-8">
          <h2 className="font-mono uppercase tracking-[0.25em] text-sm text-zinc-100 flex items-center gap-2">
            <ShoppingBag className="w-4 h-4 text-amber-400" /> Boutique
          </h2>
          {username && (
            <div className="flex items-center gap-2 px-3 py-1 border border-amber-700/60 bg-amber-950/30 text-amber-300 font-mono text-sm">
              <Coins className="w-4 h-4" /> {fmtCoins(coins)}
              {wallet?.admin && <Crown className="w-4 h-4 text-amber-400" />}
            </div>
          )}
        </div>

        {!username ? (
          <div className="text-center py-10 space-y-4">
            <p className="text-sm text-zinc-400 font-serif italic">
              La boutique est liée à votre compte : vos pièces et vos skins y sont enregistrés.
            </p>
            <button onClick={onLogin} className="px-6 py-3 bg-amber-600 hover:bg-amber-500 text-black font-mono text-xs uppercase tracking-widest font-bold">
              Se connecter / Créer un compte
            </button>
          </div>
        ) : !wallet ? (
          <div className="flex justify-center py-12 text-zinc-500">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-1 mb-4">
              {season && tabBtn('event', <>{SEASON_INFO[season].emoji} {SEASON_INFO[season].name}</>)}
              {tabBtn('shop', <><ShoppingBag className="w-3.5 h-3.5" /> Offres du jour</>)}
              {tabBtn('boxes', <><Gift className="w-3.5 h-3.5" /> Boîtes mystère</>)}
              {tabBtn('mine', <><Sparkles className="w-3.5 h-3.5" /> Mes skins ({owned.size})</>)}
              {wallet.admin && tabBtn('admin', <><Crown className="w-3.5 h-3.5" /> Admin</>)}
            </div>
            {/* Free gift of the day */}
            {onClaimDaily && (
              <div
                className={`flex items-center gap-3 p-3 mb-3 border ${
                  wallet.dailyAvailable ? 'border-emerald-500 bg-emerald-950/30 shadow-[0_0_24px_rgba(52,211,153,0.25)]' : 'border-zinc-800 bg-black/40'
                }`}
              >
                <div className={`text-3xl ${wallet.dailyAvailable ? 'animate-bounce' : 'grayscale opacity-50'}`}>🎁</div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-zinc-100">Cadeau gratuit du jour</div>
                  <div className="text-[10px] font-mono text-zinc-400">
                    Série : {Array.from({ length: 7 }).map((_, i) => (i < (wallet.dailyStreak ?? 1) - (wallet.dailyAvailable ? 1 : 0) ? '🔥' : '·')).join(' ')}
                    {' '}— revenez 7 jours de suite pour un skin offert
                  </div>
                </div>
                {wallet.dailyAvailable ? (
                  <button
                    disabled={!!busy}
                    onClick={() =>
                      run('daily', async () => {
                        setReveal({ box: 'daily', result: null });
                        try {
                          const r = await onClaimDaily();
                          await new Promise((ok) => setTimeout(ok, 900));
                          setReveal({ box: 'daily', result: r });
                        } catch (e) {
                          setReveal(null);
                          throw e;
                        }
                      })
                    }
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-black font-mono text-xs uppercase tracking-widest font-bold"
                  >
                    Ouvrir
                  </button>
                ) : (
                  <span className="text-[10px] font-mono text-zinc-500 text-right">
                    Ouvert ✓<br />Prochain dans {fmtCountdown(wallet.nextReset - now)}
                  </span>
                )}
              </div>
            )}
            <p className="text-[11px] font-mono text-zinc-500 mb-3">
              🪙 Sortez de l'hôpital pour gagner des pièces (20 à 40 selon la difficulté, + les pièces trouvées). Rien en Exploration.
            </p>

            {tab === 'shop' && (
              <>
                <div className="text-[10px] font-mono uppercase tracking-[0.3em] text-zinc-500 mb-2">
                  Nouvelle boutique dans {fmtCountdown(wallet.nextReset - now)}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">{offers.map(offerCard)}</div>
              </>
            )}

            {tab === 'event' && season && (
              <>
                <div
                  className="mb-4 p-3 border text-center"
                  style={{ borderColor: SEASON_INFO[season].color + '88', background: `linear-gradient(90deg, ${SEASON_INFO[season].color}22, ${SEASON_INFO[season].accent}22)` }}
                >
                  <div className="text-2xl">{season === 'noel' ? '🎄 ❄️ 🎅 ❄️ 🎄' : '🎃 🦇 👻 🦇 🎃'}</div>
                  <div className="font-serif font-black text-lg tracking-widest" style={{ color: SEASON_INFO[season].color }}>
                    {season === 'noel' ? 'JOYEUX NOËL À SAINT-AURORE' : 'HALLOWEEN À SAINT-AURORE'}
                  </div>
                  <div className="text-[11px] font-mono text-zinc-400">
                    Skins en édition limitée, en vente seulement pendant l'événement ({SEASON_INFO[season].dates}).
                  </div>
                </div>
                {season === 'noel' && wallet.advent && (
                  <AdventCalendar open={wallet.advent.open} claimed={wallet.advent.claimed} busy={!!busy} onOpen={openAdvent} />
                )}
                <h3 className="font-mono uppercase tracking-[0.25em] text-xs mb-2" style={{ color: SEASON_INFO[season].accent }}>
                  {SEASON_INFO[season].emoji} Boutique {season === 'noel' ? 'de Noël' : "d'Halloween"}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">{eventOffers.map(offerCard)}</div>
              </>
            )}

            {tab === 'boxes' && (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {BOXES.map((b) => (
                    <div key={b.id} className="flex flex-col items-center p-3 border bg-black/40 text-center" style={{ borderColor: b.color + '88' }}>
                      <div
                        className={`w-16 h-16 flex items-center justify-center text-3xl border-2 mb-2 ${busy === b.id ? 'animate-bounce' : ''}`}
                        style={{ borderColor: b.color, boxShadow: `0 0 20px ${b.color}55`, background: `linear-gradient(135deg, ${b.color}33, #000)` }}
                      >
                        🎁
                      </div>
                      <div className="text-sm font-bold" style={{ color: b.color }}>
                        {b.name}
                      </div>
                      <div className="text-[10px] text-zinc-500 font-mono mb-2 min-h-[2.4em]">
                        {b.id === 'rare' && 'Pièces, ressources ou petit skin'}
                        {b.id === 'mythique' && 'Pièces, ressources, skin moyen ou stylé'}
                        {b.id === 'legendaire' && 'Gros lot de pièces, skin stylé ou exclusif'}
                        {b.id === 'exclusive' && 'Skin exclusif très probable !'}
                      </div>
                      <button
                        disabled={!!busy || coins < b.price}
                        onClick={() =>
                          run(b.id, async () => {
                            setReveal({ box: b.id, result: null });
                            try {
                              const r = await onOpenBox(b.id);
                              await new Promise((ok) => setTimeout(ok, 900));
                              setReveal({ box: b.id, result: r });
                            } catch (e) {
                              setReveal(null);
                              throw e;
                            }
                          })
                        }
                        className="w-full py-1.5 font-mono text-xs flex items-center justify-center gap-1 border disabled:opacity-40 disabled:cursor-not-allowed"
                        style={{ borderColor: b.color, color: b.color }}
                      >
                        <Coins className="w-3 h-3" /> {b.price}
                      </button>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] font-mono text-zinc-600 mt-2">Un skin déjà possédé est remboursé à 60 % en pièces. Les ressources s'ajoutent à votre réserve : récupérez-les auprès du SDF de l'entrepôt.</p>
              </>
            )}

            {tab === 'mine' && (
              <>
                {owned.size === 0 ? (
                  <p className="text-sm text-zinc-500 font-serif italic py-6 text-center">Aucun skin pour l'instant. Achetez-en ou tentez une boîte mystère !</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {CATALOG.filter((c) => owned.has(c.id)).map((c) => (
                      <div key={c.id} className="flex items-center gap-3 p-2 border border-zinc-800 bg-black/40">
                        <CosmeticBadge c={c} size={36} />
                        <div>
                          <div className="text-sm text-zinc-100">{c.name}</div>
                          <div className="text-[10px] font-mono uppercase" style={{ color: TIER_COLOR[c.tier] }}>
                            {TIER_LABEL[c.tier]} · {c.target === 'human' ? 'Humain' : 'Monstre'}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {(() => {
                  const st = wallet.wallet.stash;
                  const total = Object.values(st).reduce((a, b) => a + b, 0);
                  return total > 0 ? (
                    <p className="text-[11px] font-mono text-zinc-400 mt-3">
                      Réserve : {st.battery} pile(s), {st.medkit} adrénaline(s), {st.sedative} sédatif(s), {st.food} barre(s), {st.alarm} réveil(s) — à récupérer
                      auprès du SDF dans l'entrepôt.
                    </p>
                  ) : null;
                })()}
                {onCustomize && (
                  <button onClick={onCustomize} className="mt-4 w-full py-2.5 border border-zinc-700 text-zinc-300 hover:border-amber-500 font-mono text-xs uppercase tracking-widest">
                    Équiper mes skins (personnalisation)
                  </button>
                )}
              </>
            )}
            {tab === 'admin' && wallet.admin && token && (
              <>
                {onSetSeason && <SeasonSwitch value={wallet.seasonSetting ?? 'auto'} onSet={onSetSeason} />}
                <AdminPanel token={token} />
              </>
            )}
            {error && <p className="text-xs font-mono text-red-400 mt-3">{error}</p>}
          </>
        )}

        {reveal && (
          <div className="fixed inset-0 z-[80] bg-black/90 flex items-center justify-center" onClick={() => reveal.result && setReveal(null)}>
            {(() => {
              const b =
                reveal.box === 'daily'
                  ? { name: 'Cadeau du jour', color: '#34d399' }
                  : reveal.box === 'advent'
                    ? { name: "Calendrier de l'Avent", color: '#ef4444' }
                    : BOXES.find((x) => x.id === reveal.box)!;
              const r = reveal.result;
              const skin = r?.skin ? cosmetic(r.skin) : undefined;
              return (
                <div className="flex flex-col items-center text-center">
                  <div
                    className={`w-32 h-32 flex items-center justify-center text-6xl border-4 mb-6 ${r ? '' : 'animate-[spin_0.6s_linear_infinite]'}`}
                    style={{ borderColor: b.color, boxShadow: `0 0 60px ${b.color}`, background: `radial-gradient(circle, ${b.color}55, #000)` }}
                  >
                    {!r ? '🎁' : skin ? <CosmeticBadge c={skin} size={90} /> : r.kind === 'coins' ? '🪙' : '📦'}
                  </div>
                  {r ? (
                    <>
                      <div className="text-xs font-mono uppercase tracking-[0.4em] mb-2" style={{ color: b.color }}>
                        {b.name}
                      </div>
                      <div className="text-2xl font-black text-zinc-100 max-w-md">{r.text}</div>
                      <div className="text-[11px] font-mono text-zinc-500 mt-6">Cliquez pour continuer</div>
                    </>
                  ) : (
                    <div className="text-sm font-mono text-zinc-400 animate-pulse">Ouverture…</div>
                  )}
                </div>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
};
