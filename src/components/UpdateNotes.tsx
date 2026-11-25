import React, { useState } from 'react';
import { X } from 'lucide-react';
import { UPDATES } from '../updates';

/** 📰 "Nouvelle mise à jour de …": what's new, what changed, what's gone. */
export const UpdateNotes: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [i, setI] = useState(0);
  const u = UPDATES[i];
  const section = (title: string, color: string, items?: string[]) =>
    items && items.length > 0 ? (
      <div className="mb-4">
        <div className="text-[11px] font-mono uppercase tracking-[0.3em] mb-2 font-bold" style={{ color }}>
          {title}
        </div>
        <ul className="space-y-2">
          {items.map((t) => (
            <li key={t} className="text-sm text-zinc-200 leading-snug pl-3" style={{ borderLeft: `3px solid ${color}` }}>
              {t}
            </li>
          ))}
        </ul>
      </div>
    ) : null;
  return (
    <div className="fixed inset-0 z-[90] bg-black/90 flex items-center justify-center p-3" onClick={onClose}>
      <div
        className="relative w-full max-w-lg max-h-[92vh] overflow-y-auto bg-zinc-950 border-2 border-red-900 p-5 sm:p-6 shadow-[0_0_70px_rgba(220,38,38,0.3)]"
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute top-3 right-3 text-zinc-500 hover:text-zinc-200" aria-label="Fermer">
          <X className="w-5 h-5" />
        </button>
        <div className="text-[10px] font-mono uppercase tracking-[0.4em] text-red-400 mb-1">📰 Patient Zéro</div>
        <h2 className="font-game uppercase text-2xl text-zinc-50 leading-tight" style={{ textShadow: '0 0 18px rgba(220,38,38,0.6)' }}>
          {u.name}
        </h2>
        <div className="text-[11px] font-mono text-zinc-500 mb-5">{u.date}</div>
        {section('✨ Nouveautés', '#34d399', u.added)}
        {section('🔧 Changements', '#fbbf24', u.changed)}
        {section('🗑️ Retiré ou moins fort', '#f87171', u.removed)}
        <div className="flex items-center gap-2 mt-2">
          {UPDATES.length > 1 && (
            <button
              onClick={() => setI((i + 1) % UPDATES.length)}
              className="px-3 py-2 border border-zinc-700 text-zinc-400 hover:text-zinc-200 font-mono text-[11px] uppercase tracking-widest"
            >
              {i + 1 < UPDATES.length ? '◀ Mise à jour précédente' : '▶ La plus récente'}
            </button>
          )}
          <button onClick={onClose} className="flex-1 py-2.5 bg-red-700 hover:bg-red-600 text-white font-mono text-xs uppercase tracking-widest font-bold">
            C'est parti !
          </button>
        </div>
      </div>
    </div>
  );
};
