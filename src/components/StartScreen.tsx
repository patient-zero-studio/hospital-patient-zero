import React, { useState } from 'react';
import { Coins, Medal, Music, Play, ShoppingBag, Sliders, Trophy, Users, VolumeX } from 'lucide-react';
import type { ChallengeDef } from '../challenges';
import { ACHIEVEMENTS } from '../achievements';
import { AudioSettings, ControlSettings } from '../types';
import { sound } from '../audio/SoundSystem';
import { DIFFICULTIES, Difficulty } from '../game/Difficulty';
import { fmtCoins } from '../economy';
import { InstallButton } from './InstallButton';
import { SeasonalOverlay } from './SeasonalOverlay';
import { SEASON_INFO, Season } from '../seasons';

interface StartScreenProps {
  onStartGame: () => void;
  /** Campaign: chapters 1 → 5 in one run */
  onCampaign?: () => void;
  onMultiplayer: () => void;
  username: string | null;
  difficulty: Difficulty;
  onChangeDifficulty: (d: Difficulty) => void;
  /** null = not logged in */
  coins: number | null;
  /** the free daily gift is waiting in the shop */
  giftReady?: boolean;
  /** 🎄 / 🎃 event on */
  season?: Season | null;
  /** an advent calendar box can be opened */
  adventReady?: boolean;
  /** phone / tablet */
  touch?: boolean;
  menuMusic?: boolean;
  onToggleMusic?: () => void;
  onShop: () => void;
  chapter?: 1 | 2 | 3 | 4 | 5;
  ch2Unlocked?: boolean;
  ch3Unlocked?: boolean;
  ch4Unlocked?: boolean;
  ch5Unlocked?: boolean;
  challenge?: ChallengeDef;
  challengeOn?: boolean;
  challengeDone?: boolean;
  onToggleChallenge?: () => void;
  onLeaderboard?: () => void;
  onChangeChapter?: (c: 1 | 2 | 3 | 4 | 5) => void;
  /** achievements unlocked (null = not logged in) */
  achCount?: number | null;
  onAchievements?: () => void;
  audioSettings: AudioSettings;
  controlSettings: ControlSettings;
  onUpdateAudio: (newAudio: Partial<AudioSettings>) => void;
  onUpdateControls: (newControls: Partial<ControlSettings>) => void;
}

export const StartScreen: React.FC<StartScreenProps> = ({
  onStartGame,
  onCampaign,
  onMultiplayer,
  username,
  difficulty,
  onChangeDifficulty,
  coins,
  giftReady = false,
  season = null,
  adventReady = false,
  onShop,
  achCount = null,
  onAchievements,
  chapter = 1,
  ch2Unlocked = false,
  ch3Unlocked = false,
  ch4Unlocked = false,
  ch5Unlocked = false,
  onChangeChapter,
  challenge,
  challengeOn = false,
  challengeDone = false,
  onToggleChallenge,
  onLeaderboard,
  touch = false,
  menuMusic = true,
  onToggleMusic,
  audioSettings,
  controlSettings,
  onUpdateAudio,
  onUpdateControls,
}) => {
  const [showSettings, setShowSettings] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-between p-3 sm:p-8 gap-3 select-none overflow-y-auto">
      {/* The 3D hospital is rendered behind this translucent overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at center, rgba(40,0,0,0.35) 0%, rgba(0,0,0,0.78) 55%, rgba(0,0,0,0.96) 100%)' }}
      />
      {season && <SeasonalOverlay season={season} />}

      {/* Header */}
      <div className="relative z-10 flex justify-between items-center border-b border-zinc-900 pb-4 [@media(max-height:520px)]:pb-1">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-red-600 animate-pulse" />
          <span className="text-xs font-mono uppercase tracking-widest text-zinc-500">
            HÔPITAL PSYCHIATRIQUE SAINT-AURORE — NIVEAU D'ALERTE BIOLOGIQUE 4
          </span>
        </div>

        <div className="flex items-center gap-2">
        {onToggleMusic && (
          <button
            onClick={onToggleMusic}
            title="Musique du menu"
            className="flex items-center gap-2 px-3 py-1.5 border border-zinc-800 bg-zinc-950/80 text-zinc-400 hover:text-zinc-200 text-xs font-mono uppercase transition-colors"
          >
            {menuMusic ? <Music className="w-3.5 h-3.5 text-red-500 animate-pulse" /> : <VolumeX className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{menuMusic ? 'Musique' : 'Muet'}</span>
          </button>
        )}
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="flex items-center gap-2 px-3 py-1.5 border border-zinc-800 bg-zinc-950/80 text-zinc-400 hover:text-zinc-200 text-xs font-mono uppercase transition-colors"
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>{showSettings ? 'Fermer Options' : 'Options & Son'}</span>
        </button>
        </div>
      </div>

      {/* Center Hero */}
      <div className="relative z-10 max-w-2xl mx-auto text-center flex flex-col items-center">
        <span className="text-xs font-mono uppercase tracking-[0.35em] text-red-500 font-bold mb-2 [@media(max-height:520px)]:hidden">
          SURVIE & HORREUR PSYCHOLOGIQUE 3D
        </span>

        <h1 className="relative title-flicker text-4xl sm:text-6xl md:text-8xl [@media(max-height:520px)]:text-4xl [@media(max-height:520px)]:mb-1 font-serif tracking-[0.15em] font-black text-zinc-100 mb-3 drop-shadow-[0_0_35px_rgba(200,0,0,0.55)]">
          HOSPITAL
          {season && (
            <span
              className="absolute -top-[0.45em] -left-[0.35em] text-[0.6em] -rotate-[25deg] select-none"
              aria-hidden
            >
              {season === 'noel' ? '🎅' : '🎃'}
            </span>
          )}
        </h1>
        {season && (
          <button
            onClick={onShop}
            className="mb-3 px-4 py-1 border font-mono text-[11px] uppercase tracking-[0.3em] animate-pulse"
            style={{ borderColor: SEASON_INFO[season].color, color: SEASON_INFO[season].color, background: SEASON_INFO[season].color + '1a' }}
          >
            {SEASON_INFO[season].emoji} Événement {SEASON_INFO[season].name} — skins limités{season === 'noel' ? ' & calendrier' : ''}
          </button>
        )}

        <div className="inline-block px-4 py-1 border border-red-900/80 bg-red-950/40 text-red-400 font-mono tracking-widest text-sm mb-6 [@media(max-height:520px)]:hidden">
          PATIENT ZERO
        </div>

        <p className="hidden sm:block [@media(max-height:520px)]:hidden text-xs md:text-sm text-zinc-400 leading-relaxed font-serif max-w-lg mb-8 italic">
          « Vous vous réveillez dans une chambre verrouillée de l'Hôpital Saint-Aurore. Les alarmes de confinement résonnent. Une entité déformée erre dans les couloirs obscurs. Échappez-vous avant qu'elle ne sente votre présence. »
        </p>

        {/* Start Button */}
        {!showSettings ? (
          <div className="flex flex-col items-center gap-4 [@media(max-height:520px)]:gap-2">
            {/* Chapters */}
            {onChangeChapter && (
              <div className="w-full max-w-xl">
                <div className="text-[10px] font-mono uppercase tracking-[0.3em] text-zinc-500 mb-2">Chapitre</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {([
                    { n: 1 as const, icon: '🏥', name: 'L\'Hôpital', sub: 'Échappez au Patient Zéro' },
                    { n: 2 as const, icon: '🐀', name: 'Les Égouts', sub: 'Il n\'a pas d\'yeux. Il écoute.' },
                    { n: 3 as const, icon: '🌀', name: 'Le Dédale', sub: 'Il suit ta trace. Ne t\'arrête pas.' },
                    { n: 4 as const, icon: '🌲', name: 'La Forêt', sub: 'Lampe allumée, il te voit de loin.' },
                    { n: 5 as const, icon: '🟣', name: 'Le Site B', sub: 'Finale : la lumière devient une arme.' },
                  ]).map((c) => {
                    const unlocked = [true, ch2Unlocked, ch3Unlocked, ch4Unlocked, ch5Unlocked];
                    const locked = !unlocked[c.n - 1];
                    let eff: number = chapter;
                    while (eff > 1 && !unlocked[eff - 1]) eff--;
                    const active = eff === c.n;
                    const lockText = c.n === 5 ? 'Soyez secouru une fois dans la forêt' : c.n === 4 ? 'Sortez une fois du Dédale' : c.n === 3 ? 'Sortez une fois des égouts' : 'Sortez une fois de l\'hôpital';
                    return (
                      <button
                        key={c.n}
                        disabled={locked}
                        onClick={() => onChangeChapter(c.n)}
                        title={locked ? `${lockText} (connecté) pour débloquer ce chapitre` : ''}
                        className={`flex items-center gap-3 px-3 py-2 border font-mono text-left transition-colors ${
                          active ? 'border-red-600 bg-red-950/40' : 'border-zinc-800 bg-black/50 hover:border-zinc-600'
                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                      >
                        <span className="text-xl">{locked ? '🔒' : c.icon}</span>
                        <span className="min-w-0">
                          <span className={`block text-[11px] uppercase tracking-wider font-bold ${active ? 'text-zinc-100' : 'text-zinc-400'}`}>
                            Chapitre {c.n} — {c.name}
                          </span>
                          <span className="block text-[10px] text-zinc-500 truncate">{locked ? `${lockText} pour débloquer` : c.n === 3 ? `${c.sub} (solo)` : c.n >= 4 ? `${c.sub} (solo ou coop)` : c.sub}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Difficulty: level N = N - 1 creatures */}
            <div className="w-full max-w-xl">
              <div className="text-[10px] font-mono uppercase tracking-[0.3em] text-zinc-500 mb-2">Difficulté</div>
              <div className="grid grid-cols-5 gap-1.5">
                {DIFFICULTIES.map((d) => {
                  const active = d.level === difficulty;
                  const heat = ['#71717a', '#eab308', '#f97316', '#dc2626', '#9f1239'][d.level - 1];
                  return (
                    <button
                      key={d.level}
                      onClick={() => onChangeDifficulty(d.level)}
                      className={`flex flex-col items-center gap-1 py-2 px-1 border font-mono transition-colors cursor-pointer ${
                        active ? 'bg-zinc-900/90' : 'bg-black/50 border-zinc-800 hover:border-zinc-600'
                      }`}
                      style={active ? { borderColor: heat, boxShadow: `0 0 18px ${heat}55` } : undefined}
                    >
                      <span className="text-lg font-black" style={{ color: active ? heat : '#a1a1aa' }}>
                        {d.level}
                      </span>
                      <span className={`text-[10px] uppercase tracking-wider ${active ? 'text-zinc-100' : 'text-zinc-500'}`}>{d.name}</span>
                      <span className="flex gap-0.5 h-3 items-center" title={`${d.monsters} monstre(s)`}>
                        {d.monsters === 0 ? (
                          <span className="text-[9px] text-zinc-500">aucun</span>
                        ) : (
                          Array.from({ length: d.monsters }).map((_, i) => (
                            <span key={i} className="text-[11px]" style={{ color: active ? heat : '#52525b' }}>
                              ☠
                            </span>
                          ))
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="text-[11px] font-serif italic text-zinc-400 mt-2 text-center min-h-[1.2em]">
                {DIFFICULTIES[difficulty - 1].description}
              </div>
            </div>

            {/* Daily challenge (solo) */}
            {challenge && onToggleChallenge && (
              <button
                onClick={onToggleChallenge}
                className={`w-full max-w-xl flex items-center gap-3 px-3 py-2 border font-mono text-left transition-colors ${
                  challengeOn ? 'border-emerald-500 bg-emerald-950/30' : 'border-zinc-800 bg-black/50 hover:border-zinc-600'
                }`}
              >
                <span className="text-2xl">{challenge.icon}</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[10px] uppercase tracking-[0.25em] text-emerald-400">
                    🎯 Défi du jour {challengeDone ? '— réussi ✔' : `— +${challenge.reward} pièces`}
                  </span>
                  <span className="block text-[12px] text-zinc-100 font-bold">{challenge.name}</span>
                  <span className="block text-[10px] text-zinc-400">{challenge.desc} Solo, difficulté 2+.</span>
                </span>
                <span className={`shrink-0 px-2 py-1 border text-[10px] uppercase ${challengeOn ? 'border-emerald-400 text-emerald-300' : 'border-zinc-700 text-zinc-500'}`}>
                  {challengeOn ? 'Activé' : 'Activer'}
                </span>
              </button>
            )}

            <button
              onClick={onStartGame}
              className="px-10 py-4 bg-red-700 hover:bg-red-600 text-white font-mono text-sm uppercase tracking-widest flex items-center gap-3 transition-all shadow-[0_0_30px_rgba(220,38,38,0.5)] cursor-pointer font-bold border border-red-500"
            >
              <Play className="w-4 h-4 fill-white" />
              <span>Jouer en Solo (Activer le Son)</span>
            </button>
            {onCampaign && (
              <button
                onClick={ch5Unlocked ? onCampaign : undefined}
                disabled={!ch5Unlocked}
                title={ch5Unlocked ? '' : 'Débloquez les 5 chapitres pour jouer la campagne'}
                className="px-8 py-3 bg-black/60 hover:bg-violet-950/40 text-violet-200 font-mono text-xs uppercase tracking-widest flex items-center gap-3 transition-all cursor-pointer border border-violet-700/70 hover:border-violet-400 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span>{ch5Unlocked ? '🏆' : '🔒'}</span>
                <span>Campagne — les 5 chapitres d'affilée</span>
                {!ch5Unlocked && <span className="normal-case tracking-normal text-zinc-500">(finissez la forêt)</span>}
              </button>
            )}
            <button
              onClick={onMultiplayer}
              className="px-8 py-3 bg-black/60 hover:bg-zinc-900 text-zinc-100 font-mono text-xs uppercase tracking-widest flex items-center gap-3 transition-all cursor-pointer border border-zinc-600 hover:border-red-600"
            >
              <Users className="w-4 h-4" />
              <span>Multijoueur à 2 — Coop / Chasse / Course</span>
              {username && <span className="text-emerald-400 normal-case tracking-normal">({username})</span>}
            </button>
            <button
              onClick={onShop}
              className="px-8 py-3 bg-black/60 hover:bg-amber-950/40 text-amber-300 font-mono text-xs uppercase tracking-widest flex items-center gap-3 transition-all cursor-pointer border border-amber-700/70 hover:border-amber-400"
            >
              <ShoppingBag className="w-4 h-4" />
              <span>Boutique — skins & boîtes mystère</span>
              {giftReady && <span className="normal-case tracking-normal text-emerald-300 animate-pulse">🎁 cadeau !</span>}
              {adventReady && <span className="normal-case tracking-normal text-red-300 animate-pulse">🎄 case du jour !</span>}
              {coins != null && (
                <span className="flex items-center gap-1 normal-case tracking-normal text-amber-200">
                  <Coins className="w-3.5 h-3.5" /> {fmtCoins(coins)}
                </span>
              )}
            </button>
            <div className="flex gap-2 flex-wrap justify-center">
            {onLeaderboard && (
              <button
                onClick={onLeaderboard}
                className="px-6 py-2.5 bg-black/60 hover:bg-zinc-900 text-zinc-200 font-mono text-xs uppercase tracking-widest flex items-center gap-3 transition-all cursor-pointer border border-zinc-700 hover:border-amber-400"
              >
                <Medal className="w-4 h-4 text-amber-400" />
                <span>Classement</span>
              </button>
            )}
            {onAchievements && (
              <button
                onClick={onAchievements}
                className="px-8 py-2.5 bg-black/60 hover:bg-zinc-900 text-zinc-200 font-mono text-xs uppercase tracking-widest flex items-center gap-3 transition-all cursor-pointer border border-zinc-700 hover:border-amber-400"
              >
                <Trophy className="w-4 h-4 text-amber-400" />
                <span>Succès</span>
                {achCount != null && (
                  <span className="normal-case tracking-normal text-amber-300">
                    {achCount}/{ACHIEVEMENTS.length}
                  </span>
                )}
              </button>
            )}
            </div>
            <InstallButton />
            <span className="text-[11px] font-mono text-zinc-500 text-center">
              {touch ? '📱 Tiens ton téléphone en paysage : le jeu passe en plein écran.' : 'Un clic verrouillera la souris pour la vue 3D à la première personne'}
              {controlSettings.micEnabled && (
                <>
                  <br />
                  🎙 Autorisez le micro : le Patient Zéro entendra votre voix. Ne parlez pas.
                </>
              )}
            </span>
          </div>
        ) : (
          /* Inline Settings Box */
          <div className="bg-zinc-950 border border-zinc-800 p-6 w-full max-w-lg text-left space-y-4">
            <div className="text-xs font-mono uppercase tracking-wider text-red-400 border-b border-zinc-800 pb-2">
              Configuration Audio & Commandes
            </div>

            <div className="space-y-3 font-mono text-xs text-zinc-300">
              <div>
                <div className="flex justify-between mb-1">
                  <span>Volume Principal</span>
                  <span>{Math.round(audioSettings.masterVolume * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={audioSettings.masterVolume}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    onUpdateAudio({ masterVolume: val });
                    sound.updateSettings({ masterVolume: val });
                  }}
                  className="w-full accent-red-600 bg-zinc-800 h-1.5 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between mb-1">
                  <span>Sensibilité de la Souris</span>
                  <span>{controlSettings.mouseSensitivity.toFixed(1)}x</span>
                </div>
                <input
                  type="range"
                  min="0.2"
                  max="3.0"
                  step="0.1"
                  value={controlSettings.mouseSensitivity}
                  onChange={(e) =>
                    onUpdateControls({ mouseSensitivity: parseFloat(e.target.value) })
                  }
                  className="w-full accent-red-600 bg-zinc-800 h-1.5 cursor-pointer"
                />
              </div>

              <div className="flex items-center justify-between pt-1">
                <span>Inverser l'Axe Vertical (Y)</span>
                <input
                  type="checkbox"
                  checked={controlSettings.invertY}
                  onChange={(e) => onUpdateControls({ invertY: e.target.checked })}
                  className="accent-red-600 w-4 h-4 cursor-pointer"
                />
              </div>

              <div className="flex items-center justify-between pt-1">
                <div>
                  <span className="block">Micro : le monstre entend votre voix</span>
                  <span className="text-[10px] text-zinc-500">Le navigateur vous demandera l'autorisation</span>
                </div>
                <input
                  type="checkbox"
                  checked={controlSettings.micEnabled}
                  onChange={(e) => onUpdateControls({ micEnabled: e.target.checked })}
                  className="accent-red-600 w-4 h-4 cursor-pointer"
                />
              </div>

              <div className="flex items-center justify-between pt-1">
                <span>Ombres Dynamiques (Lampe)</span>
                <input
                  type="checkbox"
                  checked={controlSettings.shadowsEnabled}
                  onChange={(e) => onUpdateControls({ shadowsEnabled: e.target.checked })}
                  className="accent-red-600 w-4 h-4 cursor-pointer"
                />
              </div>

              <div className="flex items-center justify-between pt-1">
                <div>
                  <span className="block">Mode Performance 60+ FPS</span>
                  <span className="text-[10px] text-zinc-500">Recommandé pour PC portables</span>
                </div>
                <input
                  type="checkbox"
                  checked={controlSettings.performanceMode}
                  onChange={(e) => onUpdateControls({ performanceMode: e.target.checked })}
                  className="accent-red-600 w-4 h-4 cursor-pointer"
                />
              </div>
            </div>

            <button
              onClick={onStartGame}
              className="w-full py-3 bg-red-700 hover:bg-red-600 text-white font-mono text-xs uppercase tracking-widest font-bold mt-4 transition-colors"
            >
              Sauvegarder & Lancer la Partie
            </button>
          </div>
        )}
      </div>

      {/* Footer: Controls Guide */}
      {touch ? (
        <div className="relative z-10 grid grid-cols-2 sm:grid-cols-4 gap-2 border-t border-zinc-900 pt-3 font-mono text-[11px] text-zinc-400 [@media(max-height:520px)]:text-[10px] [@media(max-height:520px)]:gap-1">
          {[
            ['POUCE GAUCHE', 'Joystick : se déplacer'],
            ['GLISSER À DROITE', 'Regarder autour'],
            ['✋ ACTION', 'Ouvrir, fouiller, parler'],
            ['BARRE D\'OBJETS', 'Toucher : utiliser · appui long : lâcher'],
          ].map(([k, v]) => (
            <div key={k} className="bg-zinc-950/60 border border-zinc-900 p-2">
              <span className="text-zinc-200 font-bold block">{k}</span>
              <span>{v}</span>
            </div>
          ))}
        </div>
      ) : (
      <div className="relative z-10 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 border-t border-zinc-900 pt-4 font-mono text-[11px] text-zinc-400 [@media(max-height:520px)]:hidden">
        <div className="bg-zinc-950/60 border border-zinc-900 p-2">
          <span className="text-zinc-200 font-bold block">ZQSD / WASD</span>
          <span>Se déplacer</span>
        </div>
        <div className="bg-zinc-950/60 border border-zinc-900 p-2">
          <span className="text-zinc-200 font-bold block">SOURIS</span>
          <span>Regarder autour</span>
        </div>
        <div className="bg-zinc-950/60 border border-zinc-900 p-2">
          <span className="text-zinc-200 font-bold block">[E]</span>
          <span>Interagir / Fouiller</span>
        </div>
        <div className="bg-zinc-950/60 border border-zinc-900 p-2">
          <span className="text-zinc-200 font-bold block">[F]</span>
          <span>Lampe torche</span>
        </div>
        <div className="bg-zinc-950/60 border border-zinc-900 p-2">
          <span className="text-zinc-200 font-bold block">[SHIFT]</span>
          <span>Courir (Fait du bruit)</span>
        </div>
        <div className="bg-zinc-950/60 border border-zinc-900 p-2">
          <span className="text-zinc-200 font-bold block">[C] / [TAB]</span>
          <span>S'accroupir / Inventaire</span>
        </div>
      </div>
      )}
    </div>
  );
};
