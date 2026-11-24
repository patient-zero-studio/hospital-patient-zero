import React, { useMemo, useState } from 'react';
import { BookOpen, Lock, X } from 'lucide-react';
import { BEASTS, ITEM_ENTRIES } from '../bestiary';
import { GALLERY_DOCS } from '../galleryDocs';

interface Props {
  beasts: string[];
  items: string[];
  docs: string[];
  onClose: () => void;
}

const CASSETTES = GALLERY_DOCS.filter((d) => d.kind === 'cassette');

/** 📖 Bestiary: creatures met, objects found, cassettes listened to */
export const BestiaryMenu: React.FC<Props> = ({ beasts, items, docs, onClose }) => {
  const [tab, setTab] = useState<'beasts' | 'items' | 'tapes'>('beasts');
  const [open, setOpen] = useState<string | null>(null);
  const met = useMemo(() => new Set(beasts), [beasts]);
  const got = useMemo(() => new Set(items), [items]);
  const heard = useMemo(() => new Set(docs), [docs]);

  const tabBtn = (t: typeof tab, label: string) => (
    <button
      onClick={() => {
        setTab(t);
        setOpen(null);
      }}
      className={`flex-1 py-2 font-mono text-[11px] uppercase tracking-widest border ${tab === t ? 'border-violet-600 bg-violet-950/30 text-zinc-100' : 'border-zinc-800 text-zinc-500 hover:border-zinc-600'}`}
    >
      {label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-[78] bg-black/85 flex items-center justify-center p-4" onClick={onClose}>
      <div className="relative w-full max-w-xl max-h-[92vh] overflow-y-auto bg-zinc-950 border border-zinc-800 p-6 shadow-[0_0_60px_rgba(139,92,246,0.14)]" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-3 right-3 text-zinc-500 hover:text-zinc-200" aria-label="Fermer">
          <X className="w-5 h-5" />
        </button>
        <h2 className="font-mono uppercase tracking-[0.25em] text-sm text-zinc-100 flex items-center gap-2 mb-4">
          <BookOpen className="w-4 h-4 text-violet-400" /> Bestiaire
        </h2>
        <div className="flex gap-1 mb-4">
          {tabBtn('beasts', `🧟 Créatures (${BEASTS.filter((b) => met.has(b.id)).length}/${BEASTS.length})`)}
          {tabBtn('items', `🎒 Objets (${ITEM_ENTRIES.filter((b) => got.has(b.id)).length}/${ITEM_ENTRIES.length})`)}
          {tabBtn('tapes', `📼 Cassettes (${CASSETTES.filter((d) => heard.has(d.id)).length}/${CASSETTES.length})`)}
        </div>

        {tab === 'beasts' && (
          <div className="space-y-1.5">
            {BEASTS.map((b) => {
              const ok = met.has(b.id);
              return (
                <div key={b.id} className={`border ${ok ? 'border-violet-900/70 bg-black/40' : 'border-zinc-900 bg-black/20'}`}>
                  <button disabled={!ok} onClick={() => setOpen(open === b.id ? null : b.id)} className="w-full flex items-center gap-3 px-3 py-2 text-left">
                    <span className={`text-3xl w-10 text-center ${ok ? '' : 'grayscale opacity-20 blur-[2px]'}`}>{b.emoji}</span>
                    <span className="flex-1 min-w-0">
                      <span className={`block text-sm ${ok ? 'text-zinc-100' : 'text-zinc-600'}`}>{ok ? b.name : '??? — créature jamais croisée'}</span>
                      <span className="block text-[10px] font-mono text-zinc-500">{b.where}</span>
                    </span>
                    {!ok && <Lock className="w-3.5 h-3.5 text-zinc-700" />}
                  </button>
                  {ok && open === b.id && (
                    <div className="px-3 pb-3">
                      <p className="text-sm font-serif italic text-zinc-300 leading-relaxed mb-2">{b.desc}</p>
                      <p className="text-[10px] font-mono uppercase tracking-widest text-violet-400 mb-1">Pour survivre</p>
                      <ul className="space-y-0.5">
                        {b.tips.map((t) => (
                          <li key={t} className="text-xs text-zinc-300">
                            • {t}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              );
            })}
            <p className="text-[10px] font-mono text-zinc-600 pt-1">Une créature s'ajoute quand vous la croisez de près pendant une partie.</p>
          </div>
        )}

        {tab === 'items' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {ITEM_ENTRIES.map((it) => {
              const ok = got.has(it.id);
              return (
                <div key={it.id} className={`flex gap-2 p-2 border ${ok ? 'border-zinc-700 bg-black/40' : 'border-zinc-900 bg-black/20'}`}>
                  <span className={`text-2xl ${ok ? '' : 'grayscale opacity-20'}`}>{it.emoji}</span>
                  <span className="min-w-0">
                    <span className={`block text-sm ${ok ? 'text-zinc-100' : 'text-zinc-600'}`}>{ok ? it.name : '???'}</span>
                    <span className="block text-[11px] text-zinc-400 leading-snug">{ok ? it.desc : 'Pas encore trouvé.'}</span>
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {tab === 'tapes' && (
          <div className="space-y-1">
            {CASSETTES.map((d) => {
              const ok = heard.has(d.id);
              return (
                <div key={d.id} className={`border ${ok ? 'border-zinc-700 bg-black/40' : 'border-zinc-900 bg-black/20'}`}>
                  <button disabled={!ok} onClick={() => setOpen(open === d.id ? null : d.id)} className="w-full flex items-center gap-2 px-3 py-1.5 text-left">
                    <span>📼</span>
                    <span className={`flex-1 text-sm ${ok ? 'text-zinc-100' : 'text-zinc-600'}`}>
                      {ok ? d.name : d.chapter === 9 ? '??? — cassette d\'une salle cachée' : `??? — cassette du chapitre ${d.chapter}`}
                    </span>
                    {!ok && <Lock className="w-3.5 h-3.5 text-zinc-700" />}
                  </button>
                  {ok && open === d.id && <p className="px-3 pb-3 text-sm font-serif italic text-zinc-300 leading-relaxed whitespace-pre-line">{d.text}</p>}
                </div>
              );
            })}
            <p className="text-[10px] font-mono text-zinc-600 pt-1">🔮 Certaines cassettes ne se trouvent que dans les salles cachées : cherchez un symbole avec la lampe UV.</p>
          </div>
        )}
      </div>
    </div>
  );
};
