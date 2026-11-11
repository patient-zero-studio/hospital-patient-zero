import React from 'react';

/** Wake-up cinematic: letterbox bars, thoughts in the middle, "skip" hint. Thoughts keep showing a moment after it ends. */
export const IntroOverlay: React.FC<{ intro: boolean; text: string | null; touch?: boolean; onSkip: () => void }> = ({ intro, text, touch, onSkip }) => {
  if (!intro && !text) return null;
  return (
    <div className="fixed inset-0 z-[70] pointer-events-none select-none">
      {intro && (
        <>
          <div className="absolute inset-x-0 top-0 h-[11vh] bg-black" />
          <div className="absolute inset-x-0 bottom-0 h-[11vh] bg-black" />
          <button
            onClick={onSkip}
            className="pointer-events-auto absolute bottom-[3vh] right-6 px-3 py-1 border border-zinc-700 text-zinc-400 hover:text-zinc-100 font-mono text-[11px] uppercase tracking-widest bg-black/60"
          >
            {touch ? 'Passer ⏭' : '[Espace] Passer'}
          </button>
        </>
      )}
      {text && (
        <div key={text} className="intro-thought absolute left-1/2 top-[62%] -translate-x-1/2 w-[90vw] max-w-2xl text-center">
          <span className="font-serif italic text-lg sm:text-2xl text-zinc-100 drop-shadow-[0_2px_8px_rgba(0,0,0,0.95)]">{text}</span>
        </div>
      )}
    </div>
  );
};
