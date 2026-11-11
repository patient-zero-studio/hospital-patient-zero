import React, { useState } from 'react';
import { Users, LogOut, Copy, Check, Loader2, X, Palette } from 'lucide-react';
import { DIFFICULTIES, Difficulty } from '../game/Difficulty';

export type GameMode = 'coop' | 'versus' | 'race';

export interface MatchSettings {
  difficulty: Difficulty;
  mode: GameMode;
  /** versus: which side plays the creature */
  monster: 'host' | 'guest';
  /** 1 = the hospital, 2 = the sewers, 4 = the forest, 5 = Site B (co-op only) */
  chapter: 1 | 2 | 4 | 5;
}

export interface LobbyState extends MatchSettings {
  status: 'idle' | 'connecting' | 'hosting' | 'joined';
  code?: string;
  partner?: string | null;
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
  onUpdateSettings: (s: Partial<MatchSettings>) => void;
  /** chapter 2 unlocked for this account (got out of the hospital once) */
  ch2Unlocked?: boolean;
  ch4Unlocked?: boolean;
  ch5Unlocked?: boolean;
  onStart: () => void;
  onLeave: () => void;
  onClose: () => void;
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
        </div>
        <div className="grid grid-cols-3 gap-1">
          <button disabled={readOnly} className={tab(value.mode === 'coop')} onClick={() => onChange({ mode: 'coop' })}>
            🤝 Coop
            <div className="text-[9px] normal-case tracking-normal text-zinc-500">ensemble contre les monstres</div>
          </button>
          <button
            disabled={readOnly || value.chapter >= 4}
            title={value.chapter >= 4 ? 'Chapitres 4 et 5 : coop uniquement' : ''}
            className={tab(value.mode === 'versus')}
            onClick={() => onChange({ mode: 'versus' })}
          >
            🧟 Chasse
            <div className="text-[9px] normal-case tracking-normal text-zinc-500">l'un est le monstre</div>
          </button>
          <button
            disabled={readOnly || value.chapter >= 4}
            title={value.chapter >= 4 ? 'Chapitres 4 et 5 : coop uniquement' : ''}
            className={tab(value.mode === 'race')}
            onClick={() => onChange({ mode: 'race' })}
          >
            🏁 Course
            <div className="text-[9px] normal-case tracking-normal text-zinc-500">le premier sorti gagne</div>
          </button>
        </div>
        {value.mode === 'race' && (
          <p className="text-[10px] font-mono text-zinc-500 leading-relaxed">
            Chacun pour soi : inventaire et objectifs séparés, mêmes monstres. Le premier qui sort de l'hôpital gagne.
          </p>
        )}
        {value.mode === 'versus' ? (
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
            <p className="text-[10px] font-mono text-zinc-500 leading-relaxed">
              Le survivant doit s'échapper en moins de 12 minutes. Le monstre voit mal, mais chaque bruit apparaît en rouge, même à travers les
              murs. S'il campe, le survivant peut l'aveugler 5 s avec [G]. Pseudos masqués.
            </p>
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
          <h2 className="font-mono uppercase tracking-[0.25em] text-sm text-zinc-100">Multijoueur à 2</h2>
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
                  <button onClick={() => p.onCreate(draft)} className={`${btn} w-full bg-red-700 hover:bg-red-600 text-white`}>
                    Créer et obtenir un code
                  </button>
                </div>
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
                <SettingsEditor value={p.lobby} onChange={p.onUpdateSettings} iAm="host" />
                <div className="text-sm font-mono text-center min-h-[1.5em]">
                  {p.lobby.partner ? (
                    <span className="text-emerald-400">✔ {p.lobby.partner} a rejoint la partie !</span>
                  ) : (
                    <span className="text-zinc-500 inline-flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" /> En attente d'un joueur…
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <button onClick={p.onLeave} className={`${btn} border border-zinc-700 text-zinc-400 hover:text-zinc-100`}>
                    Annuler
                  </button>
                  <button disabled={!p.lobby.partner} onClick={p.onStart} className={`${btn} flex-1 bg-red-700 hover:bg-red-600 text-white`}>
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
