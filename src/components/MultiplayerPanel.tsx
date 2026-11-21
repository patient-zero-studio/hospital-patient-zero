import { CHAT_PRESETS, fetchPublicRooms, type PublicRoom } from '../net/NetClient';
import React, { useEffect, useState } from 'react';
import { Users, LogOut, Copy, Check, Loader2, X, Palette } from 'lucide-react';
import { DIFFICULTIES, Difficulty } from '../game/Difficulty';
import { LobbyStage, ownedEmotes } from './LobbyStage';
import type { Appearance } from '../appearance';

export type GameMode = 'coop' | 'versus' | 'race';

export interface MatchSettings {
  difficulty: Difficulty;
  mode: GameMode;
  /** versus: which side plays the creature */
  monster: 'host' | 'guest';
  /** 1 = the hospital, 2 = the sewers, 4 = the forest, 5 = Site B (co-op only) */
  chapter: 1 | 2 | 4 | 5 | 6 | 7 | 8 | 9;
  /** 🫣 versus variant: hide-and-seek */
  hide?: boolean;
  /** 🔪 Imposteur (co-op, 4 to 8 players) */
  imp?: boolean;
  /** 🌍 listed in the public games */
  pub?: boolean;
}

const roomLabel = (r: PublicRoom) =>
  r.imp
    ? '🔪 Imposteur'
    : r.mode === 'versus'
      ? r.hide
        ? '🫣 Cache-cache'
        : '🧟 Chasse'
      : r.mode === 'race'
        ? '🏁 Course'
        : r.chapter === 9
          ? '🎪 La Nuit du Cirque'
          : `🤝 Coop · chapitre ${r.chapter}`;

/** 🌍 The open public games, refreshed every few seconds */
const PublicGames: React.FC<{ onJoin: (code: string) => void }> = ({ onJoin }) => {
  const [rooms, setRooms] = useState<PublicRoom[] | null>(null);
  const [err, setErr] = useState(false);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    const load = () =>
      fetchPublicRooms()
        .then((r) => live && (setRooms(r), setErr(false)))
        .catch(() => live && setErr(true));
    load();
    const id = window.setInterval(load, 5000);
    return () => {
      live = false;
      window.clearInterval(id);
    };
  }, [tick]);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-mono uppercase tracking-[0.3em] text-zinc-500">🌍 Parties publiques</div>
        <button onClick={() => setTick((t) => t + 1)} className="text-[10px] font-mono text-zinc-500 hover:text-zinc-200">
          ↻ Actualiser
        </button>
      </div>
      {rooms === null ? (
        <p className="text-xs font-mono text-zinc-600">{err ? 'Liste indisponible pour le moment.' : 'Chargement…'}</p>
      ) : rooms.length === 0 ? (
        <p className="text-xs font-mono text-zinc-600">
          Aucune partie publique ouverte. Crée la tienne et coche « 🌍 Partie publique » pour que d'autres joueurs te rejoignent.
        </p>
      ) : (
        <div className="space-y-1 max-h-48 overflow-y-auto">
          {rooms.map((r) => (
            <div key={r.code} className="flex items-center gap-2 px-2 py-1.5 border border-zinc-800 bg-black/40">
              <div className="flex-1 min-w-0">
                <div className="text-xs font-mono text-zinc-100 truncate">{roomLabel(r)}</div>
                <div className="text-[10px] font-mono text-zinc-500 truncate">
                  👑 <span data-no-i18n>{r.host}</span> · {r.players}/{r.max} joueurs
                  {r.imp && r.players < 4 ? ` · encore ${4 - r.players} pour lancer` : ''}
                </div>
              </div>
              <button onClick={() => onJoin(r.code)} className="px-3 py-1.5 text-[11px] font-mono uppercase tracking-wider bg-emerald-800 hover:bg-emerald-700 text-white">
                Rejoindre
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const PubToggle: React.FC<{ on: boolean; onChange: (v: boolean) => void }> = ({ on, onChange }) => (
  <label className="flex items-center gap-2 text-xs font-mono text-zinc-300 cursor-pointer select-none">
    <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} className="accent-emerald-500" />
    🌍 Partie publique <span className="text-zinc-500">(visible dans la liste, n'importe qui peut rejoindre)</span>
  </label>
);

export interface LobbyState extends MatchSettings {
  status: 'idle' | 'connecting' | 'hosting' | 'joined' | 'searching';
  /** searching: players waiting in that mode */
  waiting?: number;
  /** 💬 quick messages of the lobby */
  chat?: { from: string; text: string }[];
  /** 🎭 last emote of each player (by name) */
  emotes?: Record<string, { id: string; at: number }>;
  code?: string;
  partner?: string | null;
  /** 👥 everyone in the room (host first) */
  players?: string[];
  error?: string | null;
}

interface Props {
  username: string | null;
  lobby: LobbyState;
  authBusy: boolean;
  authError: string | null;
  onLogin: (username: string, password: string) => void;
  onRegister: (username: string, password: string) => void;
  onLogout: () => void;
  onCustomize: () => void;
  onCreate: (s: MatchSettings) => void;
  onJoin: (code: string) => void;
  /** 🔎 random partner */
  onFindMatch?: (s: MatchSettings) => void;
  onCancelSearch?: () => void;
  /** 💬 send a quick message */
  onChat?: (i: number) => void;
  onUpdateSettings: (s: Partial<MatchSettings>) => void;
  /** chapter 2 unlocked for this account (got out of the hospital once) */
  ch2Unlocked?: boolean;
  ch4Unlocked?: boolean;
  ch5Unlocked?: boolean;
  ch6Unlocked?: boolean;
  ch7Unlocked?: boolean;
  ch8Unlocked?: boolean;
  onStart: () => void;
  onLeave: () => void;
  onClose: () => void;
  /** opens the friends list (to invite one) */
  onFriends?: () => void;
  /** 🎭 the lobby stage: both looks, owned skins, send an emote */
  myLook?: Appearance;
  partnerLook?: Appearance | null;
  owned?: string[];
  onEmote?: (id: string) => void;
}

const input =
  'w-full bg-black/70 border border-zinc-700 focus:border-red-600 outline-none px-3 py-2 font-mono text-sm text-zinc-100 placeholder:text-zinc-600';
const btn = 'px-4 py-2.5 font-mono text-xs uppercase tracking-widest transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed';

export const MultiplayerPanel: React.FC<Props> = (p) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [code, setCode] = useState('');
  const [draft, setDraft] = useState<MatchSettings>({ difficulty: p.lobby.difficulty, mode: p.lobby.mode, monster: p.lobby.monster, chapter: p.lobby.chapter ?? 1 });
  const [copied, setCopied] = useState(false);
  const [emoteWait, setEmoteWait] = useState(false);

  // 👥 Everyone in the room (co-op takes up to 8)
  const pl = p.lobby.players ?? [];
  const max = p.lobby.mode === 'coop' && p.lobby.chapter !== 9 ? 8 : 2;
  const impShort = !!p.lobby.imp && p.lobby.mode === 'coop' && pl.length < 4;
  const roster =
    pl.length > 0 && (max > 2 || pl.length > 2) ? (
      <div className="border border-zinc-800 bg-black/30 p-2 text-left">
        <div className="text-[10px] font-mono uppercase tracking-[0.3em] text-zinc-500 mb-1">
          Joueurs ({pl.length}/{max})
        </div>
        <div className="flex flex-wrap gap-1">
          {pl.map((n, i) => (
            <span key={n} className={`px-2 py-0.5 text-xs font-mono border ${n === p.username ? 'border-emerald-700 text-emerald-300' : 'border-zinc-700 text-zinc-200'}`}>
              {i === 0 ? '👑 ' : ''}
              {n}
            </span>
          ))}
        </div>
        {impShort && <div className="mt-1 text-[11px] text-amber-400">🔪 Imposteur : il faut au moins 4 joueurs ({pl.length}/4).</div>}
        {pl.length > max && <div className="mt-1 text-[11px] text-amber-400">Ce mode se joue à 2 : passez en coop pour jouer à plusieurs.</div>}
      </div>
    ) : null;

  // 🎭 Both characters, and the emotes you can send
  const stage =
    p.lobby.partner && p.myLook && p.username ? (
      <div className="space-y-1.5">
        <LobbyStage
          me={{ name: p.username, look: p.myLook, emote: p.lobby.emotes?.[p.username] ?? null }}
          partner={{ name: p.lobby.partner, look: p.partnerLook ?? null, emote: p.lobby.emotes?.[p.lobby.partner] ?? null }}
        />
        {p.onEmote && (
          <div className="flex flex-wrap gap-1 justify-center">
            {ownedEmotes(p.owned ?? []).map((e) => (
              <button
                key={e.id}
                disabled={emoteWait}
                onClick={() => {
                  p.onEmote!(e.id);
                  setEmoteWait(true);
                  setTimeout(() => setEmoteWait(false), 1200);
                }}
                className="px-2 py-1 border border-fuchsia-800 text-[11px] text-fuchsia-200 hover:border-fuchsia-400 disabled:opacity-40"
              >
                {e.label}
              </button>
            ))}
          </div>
        )}
        {(p.owned ?? []).every((id) => !id.startsWith('d-')) && (
          <p className="text-[10px] font-mono text-zinc-600 text-center">Plus de danses dans la boutique 💃</p>
        )}
      </div>
    ) : null;

  const submitAuth = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'login') p.onLogin(user.trim(), pass);
    else p.onRegister(user.trim(), pass);
  };

  const copy = async () => {
    if (!p.lobby.code) return;
    try {
      await navigator.clipboard.writeText(p.lobby.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked: the code stays visible */
    }
  };

  const DifficultyPicker = ({ value, onChange, disabled }: { value: Difficulty; onChange: (d: Difficulty) => void; disabled?: boolean }) => (
    <div className="grid grid-cols-5 gap-1">
      {DIFFICULTIES.map((d) => (
        <button
          key={d.level}
          disabled={disabled}
          onClick={() => onChange(d.level)}
          className={`py-1.5 border font-mono text-[10px] uppercase ${
            d.level === value ? 'border-red-600 bg-red-950/40 text-zinc-100' : 'border-zinc-800 bg-black/40 text-zinc-500 hover:border-zinc-600'
          } disabled:cursor-default`}
        >
          <div className="text-base font-black">{d.level}</div>
          {d.name}
        </button>
      ))}
    </div>
  );

  /**
   * Mode + role + difficulty. `iAm` = 'host' when editing as the room owner.
   * In versus the AI creatures are disabled, so difficulty is hidden.
   */
  const SettingsEditor = ({
    value,
    onChange,
    readOnly,
    iAm,
  }: {
    value: MatchSettings;
    onChange: (s: Partial<MatchSettings>) => void;
    readOnly?: boolean;
    iAm: 'host' | 'guest';
  }) => {
    const iAmMonster = value.monster === iAm;
    const tab = (active: boolean) =>
      `py-2 border font-mono text-[10px] uppercase tracking-wider ${
        active ? 'border-red-600 bg-red-950/40 text-zinc-100' : 'border-zinc-800 bg-black/40 text-zinc-500 hover:border-zinc-600'
      } disabled:cursor-default`;
    return (
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-1">
          <button disabled={readOnly} className={tab((value.chapter ?? 1) === 1)} onClick={() => onChange({ chapter: 1 })}>
            🏥 Chapitre 1
            <div className="text-[9px] normal-case tracking-normal text-zinc-500">l'hôpital</div>
          </button>
          <button
            disabled={readOnly || (!p.ch2Unlocked && value.chapter !== 2)}
            title={p.ch2Unlocked ? '' : 'Sortez une fois de l\'hôpital pour débloquer le chapitre 2'}
            className={tab(value.chapter === 2)}
            onClick={() => onChange({ chapter: 2 })}
          >
            {p.ch2Unlocked || value.chapter === 2 ? '🐀' : '🔒'} Chapitre 2
            <div className="text-[9px] normal-case tracking-normal text-zinc-500">les égouts</div>
          </button>
          <button
            disabled={readOnly || (!p.ch4Unlocked && value.chapter !== 4)}
            title={p.ch4Unlocked ? 'Coop uniquement' : 'Sortez une fois du Dédale pour débloquer le chapitre 4'}
            className={tab(value.chapter === 4)}
            onClick={() => onChange({ chapter: 4, mode: 'coop' })}
          >
            {p.ch4Unlocked || value.chapter === 4 ? '🌲' : '🔒'} Chapitre 4
            <div className="text-[9px] normal-case tracking-normal text-zinc-500">la forêt (coop)</div>
          </button>
          <button
            disabled={readOnly || (!p.ch5Unlocked && value.chapter !== 5)}
            title={p.ch5Unlocked ? 'Coop uniquement' : 'Soyez secouru une fois dans la forêt pour débloquer le chapitre 5'}
            className={tab(value.chapter === 5)}
            onClick={() => onChange({ chapter: 5, mode: 'coop' })}
          >
            {p.ch5Unlocked || value.chapter === 5 ? '🟣' : '🔒'} Chapitre 5
            <div className="text-[9px] normal-case tracking-normal text-zinc-500">le Site B (coop)</div>
          </button>
          <button
            disabled={readOnly || (!p.ch6Unlocked && value.chapter !== 6)}
            title={p.ch6Unlocked ? 'Coop uniquement' : 'Terminez une fois le Site B pour débloquer le chapitre 6'}
            className={tab(value.chapter === 6)}
            onClick={() => onChange({ chapter: 6, mode: 'coop' })}
          >
            {p.ch6Unlocked || value.chapter === 6 ? '⛈️' : '🔒'} Chapitre 6
            <div className="text-[9px] normal-case tracking-normal text-zinc-500">le toit (coop)</div>
          </button>
          <button
            disabled={readOnly || (!p.ch7Unlocked && value.chapter !== 7)}
            title={p.ch7Unlocked ? 'Coop uniquement' : 'Envolez-vous une fois du toit pour débloquer le chapitre 7'}
            className={tab(value.chapter === 7)}
            onClick={() => onChange({ chapter: 7, mode: 'coop' })}
          >
            {p.ch7Unlocked || value.chapter === 7 ? '💉' : '🔒'} Chapitre 7
            <div className="text-[9px] normal-case tracking-normal text-zinc-500">le boss (coop)</div>
          </button>
          <button
            disabled={readOnly}
            title="Mode spécial à 2 : survivre 3 nuits… et résister à la trahison"
            className={tab(value.chapter === 9)}
            onClick={() => onChange({ chapter: 9, mode: 'coop', hide: false, imp: false })}
          >
            🎪 La Nuit du Cirque
            <div className="text-[9px] normal-case tracking-normal text-zinc-500">survie & trahison</div>
          </button>
          <button
            disabled={readOnly || (!p.ch8Unlocked && value.chapter !== 8)}
            title={p.ch8Unlocked ? 'Coop uniquement' : 'Chapitre secret : trouvez tous les documents des chapitres 1 à 7'}
            className={tab(value.chapter === 8)}
            onClick={() => onChange({ chapter: 8, mode: 'coop' })}
          >
            {p.ch8Unlocked || value.chapter === 8 ? '🌳' : '❔'} {p.ch8Unlocked || value.chapter === 8 ? 'Chapitre secret' : '???'}
            <div className="text-[9px] normal-case tracking-normal text-zinc-500">{p.ch8Unlocked || value.chapter === 8 ? 'le rêve (coop)' : 'secret'}</div>
          </button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-1">
          <button disabled={readOnly} className={tab(value.mode === 'coop' && !value.imp)} onClick={() => onChange({ mode: 'coop', hide: false, imp: false })}>
            🤝 Coop
            <div className="text-[9px] normal-case tracking-normal text-zinc-500">ensemble contre les monstres</div>
          </button>
          <button
            disabled={readOnly || value.chapter >= 4}
            title={value.chapter >= 4 ? 'Chapitres 4 et 5 : coop uniquement' : ''}
            className={tab(value.mode === 'versus' && !value.hide)}
            onClick={() => onChange({ mode: 'versus', hide: false, imp: false })}
          >
            🧟 Chasse
            <div className="text-[9px] normal-case tracking-normal text-zinc-500">l'un est le monstre</div>
          </button>
          <button
            disabled={readOnly || value.chapter >= 4}
            title={value.chapter >= 4 ? 'Chapitres 1 et 2 uniquement' : ''}
            className={tab(value.mode === 'versus' && !!value.hide)}
            onClick={() => onChange({ mode: 'versus', hide: true, imp: false })}
          >
            🫣 Cache-cache
            <div className="text-[9px] normal-case tracking-normal text-zinc-500">trouve-le en 3 min</div>
          </button>
          <button
            disabled={readOnly || value.chapter >= 4}
            title={value.chapter >= 4 ? 'Chapitres 4 et 5 : coop uniquement' : ''}
            className={tab(value.mode === 'race')}
            onClick={() => onChange({ mode: 'race', hide: false, imp: false })}
          >
            🏁 Course
            <div className="text-[9px] normal-case tracking-normal text-zinc-500">le premier sorti gagne</div>
          </button>
          <button
            disabled={readOnly}
            title="De 4 à 8 joueurs"
            className={tab(value.mode === 'coop' && !!value.imp)}
            onClick={() => onChange({ mode: 'coop', hide: false, imp: true, chapter: 1 })}
          >
            🔪 Imposteur
            <div className="text-[9px] normal-case tracking-normal text-zinc-500">4 à 8 joueurs</div>
          </button>
        </div>
        {value.mode === 'race' && (
          <p className="text-[10px] font-mono text-zinc-500 leading-relaxed">
            Chacun pour soi : inventaire et objectifs séparés, mêmes monstres. Le premier qui sort de l'hôpital gagne.
          </p>
        )}
        {value.mode === 'coop' && value.imp ? (
          <p className="text-[10px] font-mono text-zinc-500 leading-relaxed">
            🔪 De 4 à 8 joueurs, dans l'hôpital. L'un de vous est tiré au sort en secret : c'est un monstre déguisé. La nuit, il peut tuer
            quelqu'un en s'approchant ([K]). Chaque matin, tout le monde vote pour bannir un suspect. Les survivants gagnent s'ils le
            démasquent, ou si l'un d'eux tient autant de nuits qu'il y a de joueurs. Rôles secrets : 🩺 un Médecin protège quelqu'un chaque nuit, et dès 5 joueurs 🔍 un Détective peut démasquer une personne.
          </p>
        ) : value.mode === 'versus' ? (
          <>
            <div className="text-[10px] font-mono uppercase tracking-[0.3em] text-zinc-500">{readOnly ? 'Votre rôle' : 'Vous jouez'}</div>
            <div className="grid grid-cols-2 gap-1">
              <button
                disabled={readOnly}
                className={tab(iAmMonster)}
                onClick={() => onChange({ monster: iAm })}
              >
                🧟 Le Monstre
              </button>
              <button
                disabled={readOnly}
                className={tab(!iAmMonster)}
                onClick={() => onChange({ monster: iAm === 'host' ? 'guest' : 'host' })}
              >
                🔦 Le Survivant
              </button>
            </div>
            {value.hide ? (
              <p className="text-[10px] font-mono text-zinc-500 leading-relaxed">
                🫣 Le chercheur (le monstre) compte jusqu'à 30 dans le noir pendant que l'autre se cache : casier, lit, recoin… Puis il a 3 minutes pour le
                trouver (fouillez les cachettes avec [E], ou touchez-le). À chaque manche, les rôles s'échangent : celui qui reste caché le plus longtemps gagne.
              </p>
            ) : (
            <p className="text-[10px] font-mono text-zinc-500 leading-relaxed">
              Le survivant doit s'échapper en moins de 12 minutes. Le monstre voit mal, mais chaque bruit apparaît en rouge, même à travers les
              murs. S'il campe, le survivant peut l'aveugler 5 s avec [G]. Pseudos masqués.
            </p>
            )}
          </>
        ) : (
          <>
            <div className="text-[10px] font-mono uppercase tracking-[0.3em] text-zinc-500">Difficulté</div>
            <DifficultyPicker value={value.difficulty} onChange={(d) => onChange({ difficulty: d })} disabled={readOnly} />
          </>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4" onClick={p.onClose}>
      <div
        className="relative w-full max-w-md bg-zinc-950 border border-zinc-800 p-6 shadow-[0_0_60px_rgba(150,0,0,0.25)]"
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={p.onClose} className="absolute top-3 right-3 text-zinc-500 hover:text-zinc-200">
          <X className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2 mb-5">
          <Users className="w-5 h-5 text-red-500" />
          <h2 className="font-mono uppercase tracking-[0.25em] text-sm text-zinc-100">Multijoueur</h2>
        </div>

        {/* ---------------- Not logged in: account ---------------- */}
        {!p.username && (
          <form onSubmit={submitAuth} className="space-y-3">
            <div className="grid grid-cols-2 gap-1 mb-2">
              {(['login', 'register'] as const).map((m) => (
                <button
                  type="button"
                  key={m}
                  onClick={() => setMode(m)}
                  className={`${btn} border ${mode === m ? 'border-red-600 text-zinc-100 bg-red-950/30' : 'border-zinc-800 text-zinc-500'}`}
                >
                  {m === 'login' ? 'Se connecter' : 'Créer un compte'}
                </button>
              ))}
            </div>
            <input className={input} placeholder="Pseudo" autoComplete="username" value={user} onChange={(e) => setUser(e.target.value)} maxLength={16} />
            <input
              className={input}
              type="password"
              placeholder="Mot de passe"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              maxLength={64}
            />
            {mode === 'register' && (
              <p className="text-[10px] font-mono text-zinc-500">Pseudo : 3 à 16 caractères (lettres, chiffres, _ -). Mot de passe : 6 caractères minimum.</p>
            )}
            {p.authError && <p className="text-xs font-mono text-red-400">{p.authError}</p>}
            <button type="submit" disabled={p.authBusy || !user || !pass} className={`${btn} w-full bg-red-700 hover:bg-red-600 text-white`}>
              {p.authBusy ? 'Patientez…' : mode === 'login' ? 'Connexion' : 'Créer mon compte'}
            </button>
          </form>
        )}

        {/* ---------------- Logged in ---------------- */}
        {p.username && (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs font-mono text-zinc-400 border-b border-zinc-800 pb-3">
              <span>
                Connecté : <span className="text-emerald-400 font-bold">{p.username}</span>
              </span>
              <div className="flex items-center gap-3">
                <button onClick={p.onCustomize} className="flex items-center gap-1 text-zinc-400 hover:text-zinc-100">
                  <Palette className="w-3.5 h-3.5" /> Personnaliser
                </button>
                {p.lobby.status === 'idle' && (
                  <button onClick={p.onLogout} className="flex items-center gap-1 text-zinc-500 hover:text-zinc-200">
                    <LogOut className="w-3.5 h-3.5" /> Déconnexion
                  </button>
                )}
              </div>
            </div>

            {p.lobby.error && <p className="text-xs font-mono text-red-400">{p.lobby.error}</p>}

            {p.lobby.status === 'searching' && (
              <div className="text-center space-y-4 py-4">
                <div className="text-4xl animate-pulse">🔎</div>
                <div className="text-sm font-mono text-zinc-200 flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Recherche d'un partenaire…
                </div>
                <p className="text-[11px] font-mono text-zinc-500">
                  Dès qu'un autre joueur cherche le même mode, vous êtes mis ensemble et la partie démarre toute seule. Tu peux attendre ici.
                </p>
                <button onClick={p.onCancelSearch} className={`${btn} w-full border border-zinc-700 text-zinc-400 hover:text-zinc-100`}>
                  Annuler la recherche
                </button>
              </div>
            )}

            {p.lobby.status === 'connecting' && (
              <div className="flex items-center gap-2 text-sm font-mono text-zinc-400">
                <Loader2 className="w-4 h-4 animate-spin" /> Connexion au serveur…
              </div>
            )}

            {p.lobby.status === 'idle' && (
              <>
                <div className="space-y-2">
                  <div className="text-[10px] font-mono uppercase tracking-[0.3em] text-zinc-500">Créer une partie</div>
                  <SettingsEditor value={draft} onChange={(s) => setDraft((d) => ({ ...d, ...s }))} iAm="host" />
                  <PubToggle on={!!draft.pub} onChange={(v) => setDraft((d) => ({ ...d, pub: v }))} />
                  <button onClick={() => p.onCreate(draft)} className={`${btn} w-full bg-red-700 hover:bg-red-600 text-white`}>
                    Créer et obtenir un code
                  </button>
                </div>
                {p.onFindMatch && (
                  <button
                    onClick={() => p.onFindMatch!(draft)}
                    className={`${btn} w-full bg-emerald-700 hover:bg-emerald-600 text-white flex items-center justify-center gap-2`}
                  >
                    🔎 Trouver un partenaire au hasard ({draft.mode === 'versus' ? (draft.hide ? 'Cache-cache' : 'Chasse') : draft.mode === 'race' ? 'Course' : 'Coop'})
                  </button>
                )}
                {p.onFindMatch && (
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      onClick={() => p.onFindMatch!({ ...draft, mode: 'versus', chapter: 1 })}
                      className={`${btn} bg-red-900 hover:bg-red-800 text-white border border-red-600`}
                    >
                      ⚔️ Chercher un adversaire (Chasse)
                    </button>
                    <button
                      onClick={() => p.onFindMatch!({ ...draft, mode: 'race', chapter: 1 })}
                      className={`${btn} bg-amber-900/80 hover:bg-amber-800 text-white border border-amber-600`}
                    >
                      🏁 Chercher un adversaire (Course)
                    </button>
                  </div>
                )}
                <div className="flex items-center gap-2 text-[10px] font-mono text-zinc-600">
                  <div className="flex-1 h-px bg-zinc-800" /> OU <div className="flex-1 h-px bg-zinc-800" />
                </div>
                <div className="space-y-2">
                  <div className="text-[10px] font-mono uppercase tracking-[0.3em] text-zinc-500">Rejoindre un ami</div>
                  <div className="flex gap-2">
                    <input
                      className={`${input} uppercase tracking-[0.4em] text-center`}
                      placeholder="CODE"
                      value={code}
                      maxLength={6}
                      onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                    />
                    <button
                      disabled={code.length !== 6}
                      onClick={() => p.onJoin(code)}
                      className={`${btn} bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-600`}
                    >
                      Rejoindre
                    </button>
                  </div>
                </div>
                <PublicGames onJoin={p.onJoin} />
              </>
            )}

            {p.lobby.status === 'hosting' && (
              <div className="space-y-4">
                <div className="text-center">
                  <div className="text-[10px] font-mono uppercase tracking-[0.3em] text-zinc-500 mb-1">Code à donner à votre ami</div>
                  <button onClick={copy} className="inline-flex items-center gap-3 px-5 py-2 border border-red-700 bg-red-950/30 hover:bg-red-950/60">
                    <span className="text-3xl font-black font-mono tracking-[0.35em] text-zinc-100">{p.lobby.code}</span>
                    {copied ? <Check className="w-5 h-5 text-emerald-400" /> : <Copy className="w-5 h-5 text-zinc-400" />}
                  </button>
                </div>
                {pl.length < max && p.onFriends && (
                  <button onClick={p.onFriends} className="w-full py-2 border border-emerald-700 bg-emerald-950/30 text-emerald-300 hover:border-emerald-400 font-mono text-xs uppercase tracking-widest">
                    👥 Inviter un ami
                  </button>
                )}
                <SettingsEditor value={p.lobby} onChange={p.onUpdateSettings} iAm="host" />
                <PubToggle on={!!p.lobby.pub} onChange={(v) => p.onUpdateSettings({ pub: v })} />
                <div className="text-sm font-mono text-center min-h-[1.5em]">
                  {p.lobby.partner ? (
                    <span className="text-emerald-400">✔ {pl.length > 2 ? `${pl.length - 1} joueurs ont rejoint la partie !` : `${p.lobby.partner} a rejoint la partie !`}</span>
                  ) : (
                    <span className="text-zinc-500 inline-flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" /> En attente d'un joueur…
                    </span>
                  )}
                </div>
                {roster}
                {stage}
                {p.lobby.partner && p.onChat && (
                  <div className="space-y-1.5">
                    <div className="max-h-24 overflow-y-auto space-y-0.5 text-xs font-mono">
                      {(p.lobby.chat ?? []).slice(-6).map((m, i) => (
                        <div key={i}>
                          <span className={m.from === p.username ? 'text-emerald-400' : 'text-sky-300'}>{m.from}</span> <span className="text-zinc-200">{m.text}</span>
                        </div>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {CHAT_PRESETS.map((t, i) => (
                        <button key={i} onClick={() => p.onChat!(i)} className="px-2 py-1 border border-zinc-700 text-[11px] text-zinc-300 hover:border-sky-500">
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex gap-2">
                  <button onClick={p.onLeave} className={`${btn} border border-zinc-700 text-zinc-400 hover:text-zinc-100`}>
                    Annuler
                  </button>
                  <button disabled={!p.lobby.partner || impShort} onClick={p.onStart} className={`${btn} flex-1 bg-red-700 hover:bg-red-600 text-white`}>
                    Lancer la partie
                  </button>
                </div>
              </div>
            )}

            {p.lobby.status === 'joined' && (
              <div className="space-y-4 text-center">
                <div className="text-sm font-mono text-emerald-400">✔ Connecté à la partie de {p.lobby.partner}</div>
                <div className="text-left">
                  <div className="text-[10px] font-mono uppercase tracking-[0.3em] text-zinc-500 mb-1">Réglages choisis par l'hôte</div>
                  <SettingsEditor value={p.lobby} onChange={() => {}} readOnly iAm="guest" />
                </div>
                <div className="text-xs font-mono text-zinc-500 inline-flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> En attente que l'hôte lance la partie…
                </div>
                {roster}
                {stage}
                {p.lobby.partner && p.onChat && (
                  <div className="space-y-1.5">
                    <div className="max-h-24 overflow-y-auto space-y-0.5 text-xs font-mono">
                      {(p.lobby.chat ?? []).slice(-6).map((m, i) => (
                        <div key={i}>
                          <span className={m.from === p.username ? 'text-emerald-400' : 'text-sky-300'}>{m.from}</span> <span className="text-zinc-200">{m.text}</span>
                        </div>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {CHAT_PRESETS.map((t, i) => (
                        <button key={i} onClick={() => p.onChat!(i)} className="px-2 py-1 border border-zinc-700 text-[11px] text-zinc-300 hover:border-sky-500">
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <button onClick={p.onLeave} className={`${btn} w-full border border-zinc-700 text-zinc-400 hover:text-zinc-100`}>
                  Quitter
                </button>
              </div>
            )}

            <p className="text-[10px] font-mono text-zinc-600 leading-relaxed">
              Coop : même hôpital, mêmes monstres, inventaire d'équipe ; perdu quand vous êtes attrapés tous les deux. Chasse : un joueur est le
              Patient Zéro et traque l'autre.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
