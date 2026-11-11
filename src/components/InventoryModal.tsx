import React, { useState } from 'react';
import { GameItem, Objective } from '../types';
import { ItemIcon } from './ItemIcon';
import {
  X,
  Map as MapIcon, 
  BookOpen, 
  Package, 
  Volume2
} from 'lucide-react';
import { sound } from '../audio/SoundSystem';

interface InventoryModalProps {
  inventory: GameItem[];
  maxSlots: number;
  objectives: Objective[];
  notes: GameItem[];
  onClose: () => void;
  onUseItem: (item: GameItem) => void;
  onDropItem?: (item: GameItem) => void;
  /** Plays the VHS film of the Patient Zero experiment */
  onWatchFilm?: (id: string) => void;
}

export const InventoryModal: React.FC<InventoryModalProps> = ({
  inventory,
  maxSlots,
  objectives,
  notes,
  onClose,
  onUseItem,
  onDropItem,
  onWatchFilm,
}) => {
  const [activeTab, setActiveTab] = useState<'items' | 'notes' | 'map'>('items');
  const [selectedItem, setSelectedItem] = useState<GameItem | null>(inventory[0] || null);
  const [selectedNote, setSelectedNote] = useState<GameItem | null>(notes[0] || null);
  const [isPlayingCassette, setIsPlayingCassette] = useState<boolean>(false);

  const getItemIcon = (iconName: string) => <ItemIcon icon={iconName} />;

  const handlePlayCassette = () => {
    setIsPlayingCassette(true);
    sound.playPaperRustle();
    setTimeout(() => {
      setIsPlayingCassette(false);
    }, 6000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4">
      <div className="bg-zinc-950 border border-zinc-800 w-full max-w-4xl h-[620px] flex flex-col shadow-2xl overflow-hidden">
        {/* Top Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-4 bg-zinc-900/60">
          <div className="flex items-center gap-3">
            <span className="text-sm font-mono tracking-widest text-red-500 font-bold">HÔPITAL SAINT-AURORE</span>
            <span className="text-zinc-600 font-mono">/</span>
            <span className="text-xs font-mono uppercase tracking-wider text-zinc-400">Équipement & Archives</span>
          </div>

          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-100 p-1.5 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-zinc-800 bg-zinc-900/30">
          <button
            onClick={() => setActiveTab('items')}
            className={`flex items-center gap-2 px-6 py-3 text-xs font-mono tracking-wider transition-colors border-b-2 ${
              activeTab === 'items'
                ? 'border-red-600 text-zinc-100 bg-zinc-800/40'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Package className="w-4 h-4" />
            <span>INVENTAIRE ({inventory.length}/{maxSlots})</span>
          </button>

          <button
            onClick={() => setActiveTab('notes')}
            className={`flex items-center gap-2 px-6 py-3 text-xs font-mono tracking-wider transition-colors border-b-2 ${
              activeTab === 'notes'
                ? 'border-red-600 text-zinc-100 bg-zinc-800/40'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span>DOSSIERS & LOGS ({notes.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('map')}
            className={`flex items-center gap-2 px-6 py-3 text-xs font-mono tracking-wider transition-colors border-b-2 ${
              activeTab === 'map'
                ? 'border-red-600 text-zinc-100 bg-zinc-800/40'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <MapIcon className="w-4 h-4" />
            <span>PLAN DU COMPLEXE</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-hidden p-6 flex gap-6">
          {activeTab === 'items' && (
            <>
              {/* Left: Inventory Grid */}
              <div className="flex-1 flex flex-col justify-between">
                <div>
                  <div className="text-xs font-mono uppercase tracking-wider text-zinc-500 mb-3">
                    Emplacements de stockage
                  </div>
                  <div className="grid grid-cols-4 gap-3">
                    {Array.from({ length: maxSlots }).map((_, index) => {
                      const item = inventory[index];
                      const isSelected = selectedItem?.id === item?.id && item !== undefined;

                      return (
                        <div
                          key={index}
                          onClick={() => item && setSelectedItem(item)}
                          className={`aspect-square border p-2 flex flex-col items-center justify-center relative cursor-pointer transition-all ${
                            isSelected
                              ? 'border-red-500 bg-red-950/20'
                              : item
                              ? 'border-zinc-700 bg-zinc-900/60 hover:border-zinc-500'
                              : 'border-zinc-800/60 bg-zinc-950/40 cursor-default'
                          }`}
                        >
                          {item ? (
                            <>
                              {getItemIcon(item.icon)}
                              <span className="text-[10px] text-zinc-300 font-mono mt-2 text-center line-clamp-1">
                                {item.name}
                              </span>
                            </>
                          ) : (
                            <span className="text-[11px] font-mono text-zinc-800">VIDE</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Objectives list */}
                <div className="border border-zinc-800 bg-zinc-900/40 p-4">
                  <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-400 block mb-2">
                    Missions & Journal d'Objectifs
                  </span>
                  <div className="space-y-1.5 max-h-28 overflow-y-auto pr-2">
                    {objectives.map((obj) => (
                      <div key={obj.id} className="flex items-start gap-2 text-xs">
                        <span className={`font-mono ${obj.completed ? 'text-emerald-500' : obj.isCurrent ? 'text-amber-400' : 'text-zinc-600'}`}>
                          {obj.completed ? '✓' : obj.isCurrent ? '►' : '•'}
                        </span>
                        <span className={`${obj.completed ? 'line-through text-zinc-600' : obj.isCurrent ? 'text-zinc-200 font-medium' : 'text-zinc-500'}`}>
                          {obj.text}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right: Item Detail Card */}
              <div className="w-80 border border-zinc-800 bg-zinc-900/40 p-5 flex flex-col justify-between">
                {selectedItem ? (
                  <div>
                    <div className="flex items-center gap-3 border-b border-zinc-800 pb-3 mb-4">
                      {getItemIcon(selectedItem.icon)}
                      <div>
                        <h4 className="text-sm font-semibold text-zinc-100">{selectedItem.name}</h4>
                        <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 bg-zinc-800 text-zinc-400">
                          {selectedItem.type}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <span className="text-[10px] font-mono text-zinc-500 uppercase block">Description</span>
                        <p className="text-xs text-zinc-300 mt-1 leading-relaxed">
                          {selectedItem.description}
                        </p>
                      </div>

                      {selectedItem.lore && (
                        <div className="p-3 bg-zinc-950 border border-zinc-800 text-xs italic text-zinc-400 leading-relaxed font-serif">
                          {selectedItem.lore}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="h-full flex items-center justify-center text-xs text-zinc-600 font-mono">
                    Sélectionnez un objet pour l'examiner
                  </div>
                )}

                {selectedItem && (
                  <div className="flex gap-2 pt-4 border-t border-zinc-800">
                    <button
                      onClick={() => onUseItem(selectedItem)}
                      className="flex-1 py-2 bg-red-950/80 hover:bg-red-900 border border-red-700 text-red-200 text-xs font-mono uppercase tracking-wider transition-colors"
                    >
                      Utiliser
                    </button>
                    {onDropItem && (
                      <button
                        onClick={() => {
                          onDropItem(selectedItem);
                          setSelectedItem(null);
                        }}
                        className="flex-1 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-600 text-zinc-300 text-xs font-mono uppercase tracking-wider transition-colors"
                      >
                        Lâcher
                      </button>
                    )}
                  </div>
                )}
              </div>
            </>
          )}

          {activeTab === 'notes' && (
            <div className="flex-1 flex gap-6">
              {/* Notes list */}
              <div className="w-72 border border-zinc-800 bg-zinc-900/30 overflow-y-auto divide-y divide-zinc-800/80">
                {notes.length === 0 ? (
                  <div className="p-4 text-xs font-mono text-zinc-600">
                    Aucun document trouvé pour le moment.
                  </div>
                ) : (
                  notes.map((n) => (
                    <div
                      key={n.id}
                      onClick={() => setSelectedNote(n)}
                      className={`p-3.5 cursor-pointer transition-colors ${
                        selectedNote?.id === n.id ? 'bg-zinc-800/70 border-l-2 border-red-500' : 'hover:bg-zinc-900'
                      }`}
                    >
                      <div className="text-xs font-medium text-zinc-200 truncate">{n.name}</div>
                      <div className="text-[10px] font-mono text-zinc-500 mt-0.5">
                        {n.id.startsWith('vhs-') ? '📼 Vidéo VHS' : n.type === 'cassette' ? 'Enregistrement audio' : 'Document écrit'}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Note reader */}
              <div className="flex-1 border border-zinc-800 bg-[#161513] p-6 text-zinc-300 font-serif overflow-y-auto flex flex-col justify-between">
                {selectedNote ? (
                  <div>
                    <div className="border-b border-zinc-700/60 pb-3 mb-4 flex justify-between items-center">
                      <h3 className="text-base font-bold text-amber-100 font-mono tracking-wide">
                        {selectedNote.name}
                      </h3>
                      {selectedNote.id.startsWith('vhs-') && onWatchFilm ? (
                        <button
                          onClick={() => onWatchFilm(selectedNote.id)}
                          className="flex items-center gap-1.5 px-3 py-1 bg-red-950 border border-red-700 text-red-100 text-xs font-mono hover:bg-red-900 transition-colors animate-pulse"
                        >
                          <span>▶ Regarder la cassette</span>
                        </button>
                      ) : selectedNote.type === 'cassette' && (
                        <button
                          onClick={handlePlayCassette}
                          className="flex items-center gap-1.5 px-3 py-1 bg-purple-950 border border-purple-700 text-purple-200 text-xs font-mono hover:bg-purple-900 transition-colors"
                        >
                          <Volume2 className="w-3.5 h-3.5" />
                          <span>{isPlayingCassette ? 'Lecture...' : 'Écouter'}</span>
                        </button>
                      )}
                    </div>
                    <div className="text-sm leading-relaxed whitespace-pre-wrap text-zinc-300">
                      {selectedNote.lore || selectedNote.description}
                    </div>
                  </div>
                ) : (
                  <div className="h-full flex items-center justify-center text-zinc-600 font-mono text-xs">
                    Sélectionnez un document à consulter
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'map' && (
            <div className="flex-1 border border-zinc-800 bg-zinc-950 p-6 flex flex-col items-center justify-center relative">
              <div className="text-xs font-mono text-zinc-400 mb-4 tracking-widest uppercase">
                PLAN TECHNIQUE — ÉTAGE PRINCIPAL HÔPITAL SAINT-AURORE
              </div>

              {/* Blueprint schematic */}
              <div className="w-full max-w-lg border border-zinc-700/60 p-4 bg-zinc-900/40 font-mono text-[11px] grid grid-cols-3 gap-2">
                <div className="border border-zinc-700 p-3 bg-zinc-950/60">
                  <div className="text-red-400 font-bold">ZONE B</div>
                  <div>Aile des Soins</div>
                  <div className="text-zinc-500 text-[10px]">Chambres 101 - 104</div>
                </div>

                <div className="border border-red-700 p-3 bg-red-950/20 text-center">
                  <div className="text-red-400 font-bold">ZONE H</div>
                  <div>Laboratoire Secret</div>
                  <div className="text-zinc-500 text-[10px]">Origine Patient Zéro</div>
                </div>

                <div className="border border-zinc-700 p-3 bg-zinc-950/60">
                  <div className="text-red-400 font-bold">ZONE C</div>
                  <div>Bloc Opératoire</div>
                  <div className="text-zinc-500 text-[10px]">Disjoncteur Électrique</div>
                </div>

                <div className="border border-zinc-700 p-3 bg-zinc-950/60">
                  <div className="text-red-400 font-bold">ZONE D</div>
                  <div>Pharmacie & Stock</div>
                  <div className="text-zinc-500 text-[10px]">Fusible A (Digicode)</div>
                </div>

                <div className="border border-zinc-600 p-3 bg-zinc-900/80 text-center">
                  <div className="text-zinc-300 font-bold">ZONE A</div>
                  <div>Couloir Principal</div>
                  <div className="text-zinc-500 text-[10px]">Zone de Patrouille</div>
                </div>

                <div className="border border-zinc-700 p-3 bg-zinc-950/60">
                  <div className="text-red-400 font-bold">ZONE E</div>
                  <div>Morgue</div>
                  <div className="text-zinc-500 text-[10px]">Passe Dr. Moreau + Fusible B</div>
                </div>

                <div className="col-span-3 border border-zinc-700 p-3 bg-zinc-950/60 flex justify-between items-center">
                  <div>
                    <span className="text-red-400 font-bold">ZONE F :</span> Archives & Coffre du Directeur (Code 1987)
                  </div>
                  <div className="text-amber-400 font-bold">
                    ISSUE DE SECOURS (FIN 1)
                  </div>
                </div>
              </div>

              <div className="text-[10px] font-mono text-zinc-500 mt-4">
                Note : Les portes blindées nécessitent la restauration du courant pour autoriser la validation des cartes d'accès.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
