import React from 'react';
import { AudioSettings, ControlSettings } from '../types';
import { Volume2, Sliders, Play, RotateCcw, Home, X, Mic } from 'lucide-react';
import { sound } from '../audio/SoundSystem';

interface PauseSettingsModalProps {
  audioSettings: AudioSettings;
  controlSettings: ControlSettings;
  onResume: () => void;
  /** Undefined = not allowed (online guest). */
  onRestart?: () => void;
  onMainMenu: () => void;
  online?: boolean;
  onUpdateAudio: (newAudio: Partial<AudioSettings>) => void;
  onUpdateControls: (newControls: Partial<ControlSettings>) => void;
}

export const PauseSettingsModal: React.FC<PauseSettingsModalProps> = ({
  audioSettings,
  controlSettings,
  onResume,
  onRestart,
  onMainMenu,
  online,
  onUpdateAudio,
  onUpdateControls,
}) => {
  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-zinc-950 border border-zinc-800 w-full max-w-lg p-6 flex flex-col gap-6 shadow-2xl max-h-full overflow-y-auto">
        {/* Title */}
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <div className="flex items-center gap-2">
            <Sliders className="w-5 h-5 text-red-500" />
            <h2 className="text-base font-mono uppercase tracking-widest text-zinc-100 font-bold">
              PAUSE — OPTIONS DU JEU
            </h2>
          </div>
          <button onClick={onResume} className="text-zinc-500 hover:text-zinc-200 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Audio Sliders */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-zinc-400">
            <Volume2 className="w-4 h-4 text-red-400" />
            <span>Mixage Audio Immersion</span>
          </div>

          <div className="space-y-2.5 bg-zinc-900/40 border border-zinc-800/80 p-3.5">
            <div>
              <div className="flex justify-between text-xs font-mono text-zinc-300 mb-1">
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
              <div className="flex justify-between text-xs font-mono text-zinc-300 mb-1">
                <span>Effets Sonores & Pas (SFX)</span>
                <span>{Math.round(audioSettings.sfxVolume * 100)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={audioSettings.sfxVolume}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  onUpdateAudio({ sfxVolume: val });
                  sound.updateSettings({ sfxVolume: val });
                }}
                className="w-full accent-red-600 bg-zinc-800 h-1.5 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs font-mono text-zinc-300 mb-1">
                <span>Ambiance & Drones d'Horreur</span>
                <span>{Math.round(audioSettings.ambienceVolume * 100)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={audioSettings.ambienceVolume}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  onUpdateAudio({ ambienceVolume: val });
                  sound.updateSettings({ ambienceVolume: val });
                }}
                className="w-full accent-red-600 bg-zinc-800 h-1.5 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs font-mono text-zinc-300 mb-1">
                <span>Battements de Cœur & Tension</span>
                <span>{Math.round(audioSettings.musicVolume * 100)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={audioSettings.musicVolume}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  onUpdateAudio({ musicVolume: val });
                  sound.updateSettings({ musicVolume: val });
                }}
                className="w-full accent-red-600 bg-zinc-800 h-1.5 cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* Microphone */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-zinc-400">
            <Mic className="w-4 h-4 text-red-400" />
            <span>Micro — le monstre entend votre voix</span>
          </div>
          <div className="bg-zinc-900/40 border border-zinc-800/80 p-3.5 space-y-3">
            <div className="flex items-center justify-between text-xs font-mono text-zinc-300">
              <span>Activer le micro</span>
              <input
                type="checkbox"
                checked={controlSettings.micEnabled}
                onChange={(e) => onUpdateControls({ micEnabled: e.target.checked })}
                className="accent-red-600 cursor-pointer w-4 h-4"
              />
            </div>
            <div className={controlSettings.micEnabled ? '' : 'opacity-40 pointer-events-none'}>
              <div className="flex justify-between text-xs font-mono text-zinc-300 mb-1">
                <span>Sensibilité du micro</span>
                <span>{controlSettings.micSensitivity.toFixed(1)}x</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="2"
                step="0.1"
                value={controlSettings.micSensitivity}
                onChange={(e) => onUpdateControls({ micSensitivity: parseFloat(e.target.value) })}
                className="w-full accent-red-600 bg-zinc-800 h-1.5 cursor-pointer"
              />
              <p className="text-[10px] text-zinc-500 mt-1">Plus c'est élevé, plus un simple chuchotement peut vous trahir.</p>
            </div>
            <div className="flex items-center justify-between text-xs font-mono text-zinc-300 pt-2 border-t border-zinc-800/80">
              <span>Chat vocal de proximité (en ligne)</span>
              <input
                type="checkbox"
                checked={controlSettings.voiceChat !== false}
                onChange={(e) => onUpdateControls({ voiceChat: e.target.checked })}
                className="accent-red-600 cursor-pointer w-4 h-4"
              />
            </div>
            <p className="text-[10px] text-zinc-500 -mt-1">Votre partenaire vous entend selon la distance et les murs. [V] coupe / rallume le micro.</p>
          </div>
        </div>

        {/* Controls Settings */}
        <div className="space-y-3">
          <div className="text-xs font-mono uppercase tracking-wider text-zinc-400">
            Commandes & Caméra
          </div>

          <div className="bg-zinc-900/40 border border-zinc-800/80 p-3.5 space-y-3">
            <div>
              <div className="flex justify-between text-xs font-mono text-zinc-300 mb-1">
                <span>Sensibilité Souris</span>
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

            <div className="flex items-center justify-between text-xs font-mono text-zinc-300">
              <span>Inverser l'Axe Vertical (Y)</span>
              <input
                type="checkbox"
                checked={controlSettings.invertY}
                onChange={(e) => onUpdateControls({ invertY: e.target.checked })}
                className="accent-red-600 cursor-pointer w-4 h-4"
              />
            </div>

            <div className="flex items-center justify-between text-xs font-mono text-zinc-300">
              <span>Oscillation de Marche (Head Bob)</span>
              <input
                type="checkbox"
                checked={controlSettings.headBob}
                onChange={(e) => onUpdateControls({ headBob: e.target.checked })}
                className="accent-red-600 cursor-pointer w-4 h-4"
              />
            </div>

            <div className="flex items-center justify-between text-xs font-mono text-zinc-300">
              <span>Ombres Dynamiques (Lampe)</span>
              <input
                type="checkbox"
                checked={controlSettings.shadowsEnabled}
                onChange={(e) => onUpdateControls({ shadowsEnabled: e.target.checked })}
                className="accent-red-600 cursor-pointer w-4 h-4"
              />
            </div>

            <div className="flex items-center justify-between text-xs font-mono text-zinc-300">
              <div>
                <span className="block">Mode Performance Élevée</span>
                <span className="text-[10px] text-zinc-500">Fluidité maximale 60+ FPS</span>
              </div>
              <input
                type="checkbox"
                checked={controlSettings.performanceMode}
                onChange={(e) => onUpdateControls({ performanceMode: e.target.checked })}
                className="accent-red-600 cursor-pointer w-4 h-4"
              />
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-2 pt-2 border-t border-zinc-800">
          <button
            onClick={onResume}
            className="w-full py-2.5 bg-red-700 hover:bg-red-600 text-white font-mono text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-colors shadow-lg"
          >
            <Play className="w-4 h-4" />
            <span>Reprendre la Partie</span>
          </button>

          {onRestart && (
            <button
              onClick={onRestart}
              className="w-full py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 font-mono text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              <span>{online ? 'Recommencer (pour les deux joueurs)' : 'Recommencer depuis le Début'}</span>
            </button>
          )}

          <button
            onClick={onMainMenu}
            className="w-full py-2 bg-zinc-950 hover:bg-zinc-900 border border-zinc-800 text-zinc-500 hover:text-zinc-300 font-mono text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-colors"
          >
            <Home className="w-4 h-4" />
            <span>{online ? 'Quitter la partie en ligne' : 'Menu Principal'}</span>
          </button>
          {online && (
            <p className="text-[10px] font-mono text-amber-500/80 text-center">
              En ligne, le jeu continue pendant que ce menu est ouvert !
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
