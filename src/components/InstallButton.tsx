import React, { useEffect, useState } from 'react';

/** Chrome / Edge / Android: the browser's own "install this app" prompt, kept for our button. */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    listeners.forEach((l) => l());
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    listeners.forEach((l) => l());
  });
}

const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches ||
  window.matchMedia?.('(display-mode: fullscreen)').matches ||
  (navigator as unknown as { standalone?: boolean }).standalone === true;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** "📲 Installer le jeu" (or how to do it on iPhone). Nothing once installed. */
export const InstallButton: React.FC = () => {
  const [, force] = useState(0);
  const [iosHelp, setIosHelp] = useState(false);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  if (isStandalone()) return null;
  const cls =
    'px-4 py-2 bg-black/60 hover:bg-emerald-950/40 text-emerald-300 font-mono text-[11px] uppercase tracking-widest border border-emerald-800 hover:border-emerald-500 transition-colors';
  if (deferred) {
    return (
      <button
        className={cls}
        onClick={async () => {
          const d = deferred;
          if (!d) return;
          await d.prompt();
          await d.userChoice.catch(() => null);
          deferred = null;
          force((n) => n + 1);
        }}
      >
        📲 Installer le jeu
      </button>
    );
  }
  if (isIos()) {
    return (
      <div className="flex flex-col items-center gap-1">
        <button className={cls} onClick={() => setIosHelp((v) => !v)}>
          📲 Installer sur iPhone
        </button>
        {iosHelp && (
          <span className="text-[10px] font-mono text-zinc-400 max-w-xs text-center">
            Dans Safari : bouton Partager <b>⎋</b> puis « Sur l'écran d'accueil ».
          </span>
        )}
      </div>
    );
  }
  return null;
};
