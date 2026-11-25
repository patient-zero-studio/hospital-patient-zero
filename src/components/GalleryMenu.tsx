import React, { useMemo, useState } from 'react';
import { Image, Lock, X } from 'lucide-react';
import { GALLERY_DOCS } from '../galleryDocs';
import { ENDING_CHAPTER, ENDING_FROM_ACH, ENDING_KEYS, ENDING_NOTES, EndingKey } from '../gallery';
import { GameState } from '../game/GameState';
import type { GameEnding, GameItem } from '../types';

const CH_NAME = ['', 'L\'Hôpital', 'Les Égouts', 'Le Dédale', 'La Forêt', 'Le Site B', 'Le Toit', 'Le Cœur', 'Le Rêve de Lucas (secret)', 'Salles cachées', 'Le Donjon'];

/** Title + text of an ending (the "+" version needs the documents) */
const endingText = (key: EndingKey) => {
  const base = key.replace('+', '') as GameEnding;
  const gs = new GameState(1);
  const n = key.endsWith('+') ? (ENDING_NOTES[base] ?? 0) : 0;
  gs.notesCollected = Array.from({ length: n }, (_, i) => ({ id: 'x' + i }) as GameItem);
  return gs.evaluateEnding(base);
};

interface Props {
  endings: string[];
  docs: string[];
  /** achievements done (old accounts: endings seen before the gallery existed) */
  achDone: Record<string, unknown>;
  onClose: () => void;
}

/** 🖼️ Gallery: the endings you've seen and the documents you've found */
export const GalleryMenu: React.FC<Props> = ({ endings, docs, achDone, onClose }) => {
  const [tab, setTab] = useState<'endings' | 'docs'>('endings');
  const [open, setOpen] = useState<string | null>(null);
  const seen = useMemo(() => {
    const s = new Set(endings);
    for (const [ach, key] of Object.entries(ENDING_FROM_ACH)) if (achDone[ach]) s.add(key);
    return s;
  }, [endings, achDone]);
  const found = useMemo(() => new Set(docs), [docs]);
  const texts = useMemo(() => Object.fromEntries(ENDING_KEYS.map((k) => [k, endingText(k)])), []);

  const tabBtn = (t: typeof tab, label: string) => (
    <button
      onClick={() => {
        setTab(t);
        setOpen(null);
      }}
      className={`flex-1 py-2 font-mono text-[11px] uppercase tracking-widest border ${tab === t ? 'border-amber-600 bg-amber-950/30 text-zinc-100' : 'border-zinc-800 text-zinc-500 hover:border-zinc-600'}`}
    >
      {label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-[78] bg-black/85 flex items-center justify-center p-4" onClick={onClose}>
      <div className="relative w-full max-w-xl max-h-[92vh] overflow-y-auto bg-zinc-950 border border-zinc-800 p-6 shadow-[0_0_60px_rgba(245,158,11,0.12)]" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-3 right-3 text-zinc-500 hover:text-zinc-200" aria-label="Fermer">
          <X className="w-5 h-5" />
        </button>
        <h2 className="font-mono uppercase tracking-[0.25em] text-sm text-zinc-100 flex items-center gap-2 mb-4">
          <Image className="w-4 h-4 text-amber-400" /> Galerie
        </h2>
        <div className="flex gap-1 mb-4">
          {tabBtn('endings', `🎬 Fins (${ENDING_KEYS.filter((k) => seen.has(k)).length}/${ENDING_KEYS.length})`)}
          {tabBtn('docs', `📄 Documents (${GALLERY_DOCS.filter((d) => found.has(d.id)).length}/${GALLERY_DOCS.length})`)}
        </div>

        {tab === 'endings' ? (
          <div className="space-y-1.5">
            {ENDING_KEYS.map((k) => {
              const ok = seen.has(k);
              const e = texts[k];
              const ch = ENDING_CHAPTER[k.replace('+', '')];
              return (
                <div key={k} className={`border ${ok ? 'border-amber-800/60 bg-black/40' : 'border-zinc-900 bg-black/20'}`}>
                  <button disabled={!ok} onClick={() => setOpen(open === k ? null : k)} className="w-full flex items-center gap-3 px-3 py-2 text-left">
                    <span className="text-[10px] font-mono text-zinc-500 w-16 shrink-0">Ch. {ch}</span>
                    <span className={`flex-1 text-sm ${ok ? 'text-amber-100' : 'text-zinc-600'}`}>{ok ? e.title : '??? — fin non découverte'}</span>
                    {!ok && <Lock className="w-3.5 h-3.5 text-zinc-700" />}
                    {k.endsWith('+') && <span className="text-[9px] font-mono text-emerald-400" title="Avec tous les documents du chapitre">+ docs</span>}
                  </button>
                  {ok && open === k && <p className="px-3 pb-3 text-sm font-serif italic text-zinc-300 leading-relaxed">{e.narrative}</p>}
                  {!ok && k.endsWith('+') && <p className="px-3 pb-2 text-[10px] font-mono text-zinc-600">Indice : trouve tous les documents du chapitre {ch} avant de sortir.</p>}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((ch) => (
              <div key={ch}>
                <div className="text-[10px] font-mono uppercase tracking-[0.3em] text-zinc-500 mb-1">
                  {ch === 9 ? `🔮 ${CH_NAME[ch]}` : `Chapitre ${ch} — ${CH_NAME[ch]}`}
                </div>
                <div className="space-y-1">
                  {GALLERY_DOCS.filter((d) => d.chapter === ch).map((d) => {
                    const ok = found.has(d.id);
                    return (
                      <div key={d.id} className={`border ${ok ? 'border-zinc-700 bg-black/40' : 'border-zinc-900 bg-black/20'}`}>
                        <button disabled={!ok} onClick={() => setOpen(open === d.id ? null : d.id)} className="w-full flex items-center gap-2 px-3 py-1.5 text-left">
                          <span>{d.kind === 'cassette' ? '📼' : '📄'}</span>
                          <span className={`flex-1 text-sm ${ok ? 'text-zinc-100' : 'text-zinc-600'}`}>{ok ? d.name : '??? — document non trouvé'}</span>
                          {!ok && <Lock className="w-3.5 h-3.5 text-zinc-700" />}
                        </button>
                        {ok && open === d.id && <p className="px-3 pb-3 text-sm font-serif italic text-zinc-300 leading-relaxed whitespace-pre-line">{d.text}</p>}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            <p className="text-[10px] font-mono text-zinc-600">Les documents comptent quand tu les ramasses, même si tu meurs ensuite.</p>
          </div>
        )}
      </div>
    </div>
  );
};
