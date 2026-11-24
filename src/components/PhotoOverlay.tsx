import React from 'react';

/** 📸 Photo mode: replaces the HUD (the saved image never shows it anyway) */
export const PhotoOverlay: React.FC<{ filter: string; help: boolean; msg: string | null }> = ({ filter, help, msg }) => (
  <div className="fixed inset-0 z-40 pointer-events-none font-mono">
    {msg && <div key={msg} className="absolute inset-0 bg-white animate-[pzflash_0.5s_ease-out_forwards]" />}
    <style>{'@keyframes pzflash{from{opacity:.85}to{opacity:0}}'}</style>
    {help && (
      <>
        {/* Frame corners */}
        {['top-6 left-6 border-t-2 border-l-2', 'top-6 right-6 border-t-2 border-r-2', 'bottom-6 left-6 border-b-2 border-l-2', 'bottom-6 right-6 border-b-2 border-r-2'].map((c) => (
          <div key={c} className={`absolute w-10 h-10 border-white/60 ${c}`} />
        ))}
        <div className="absolute top-8 left-1/2 -translate-x-1/2 px-4 py-1.5 bg-black/60 border border-zinc-700 text-xs text-zinc-100 tracking-widest">
          📸 MODE PHOTO · <span className="text-amber-300">{filter}</span>
        </div>
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 max-w-[92vw] px-4 py-2 bg-black/65 border border-zinc-800 text-[11px] text-zinc-300 text-center leading-relaxed">
          [Souris] regarder · [Z Q S D] bouger · [Espace] / [C] monter / descendre · [Maj] lent · [Molette] zoom
          <br />
          <span className="text-amber-300">[F] filtre</span> · <span className="text-emerald-300">[Entrée] prendre la photo</span> · [H] cacher l'aide · [P] quitter
        </div>
      </>
    )}
    {msg && (
      <div className="absolute top-20 left-1/2 -translate-x-1/2 px-4 py-1.5 bg-black/80 border border-emerald-600 text-sm text-emerald-300">{msg}</div>
    )}
  </div>
);
