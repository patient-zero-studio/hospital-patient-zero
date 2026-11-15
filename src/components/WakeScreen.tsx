import React, { useEffect, useState } from 'react';

const TIPS = [
  '🔦 Ta lampe te sauve… mais elle t\'attire aussi les regards.',
  '🤫 Accroupi (C), tu fais beaucoup moins de bruit.',
  '🗄️ Un casier ou un lit, et le monstre passe à côté de toi.',
  '🥫 Une canette lancée au loin, et il va voir ailleurs.',
  '🎙️ Il entend ton micro : retiens ton souffle quand il approche.',
  '🍬 Pendant les événements, ramasse les friandises cachées dans l\'hôpital.',
  '👥 Ajoute tes amis pour les inviter en un clic.',
];

/**
 * Free hosting falls asleep after 15 min without players: the first visitor
 * waits ~1 min while it wakes up. Shown while the server doesn't answer yet.
 */
export const WakeScreen: React.FC<{ since: number }> = ({ since }) => {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  const s = (now - since) / 1000;
  // Fills up over ~60 s, then crawls (never quite reaches the end)
  const pct = s < 60 ? (s / 60) * 90 : 90 + 9 * (1 - Math.exp(-(s - 60) / 40));
  const tip = TIPS[Math.floor(s / 6) % TIPS.length];
  return (
    <div className="fixed inset-0 z-[120] bg-black flex flex-col items-center justify-center p-6 text-center select-none">
      <style>{`@keyframes pz-beat { 0%, 100% { transform: scale(1); opacity: .9; } 15% { transform: scale(1.18); opacity: 1; } 30% { transform: scale(1); } 45% { transform: scale(1.1); } }`}</style>
      <div className="text-6xl mb-4" style={{ animation: 'pz-beat 1.4s ease-in-out infinite', filter: 'drop-shadow(0 0 24px rgba(220,0,0,0.7))' }}>
        🫀
      </div>
      <div className="font-serif font-black text-3xl sm:text-5xl tracking-[0.2em] text-zinc-100 drop-shadow-[0_0_30px_rgba(200,0,0,0.6)]">HOSPITAL</div>
      <div className="font-mono text-red-400 tracking-[0.4em] text-xs mb-8">PATIENT ZERO</div>
      <div className="font-mono text-sm text-zinc-300 mb-1">L'hôpital se réveille…</div>
      <div className="font-mono text-[11px] text-zinc-500 mb-4">
        Personne n'était là depuis un moment : le serveur redémarre (environ 1 minute). Ensuite ça va vite pour tout le monde.
      </div>
      <div className="w-full max-w-sm h-2 bg-zinc-900 border border-zinc-800 mb-2">
        <div className="h-full bg-gradient-to-r from-red-800 to-red-500 transition-[width] duration-300" style={{ width: `${pct}%` }} />
      </div>
      <div className="font-mono text-[10px] text-zinc-600 mb-8">{Math.floor(s)} s</div>
      <div className="max-w-md min-h-[3em] text-sm text-zinc-400 font-serif italic">{tip}</div>
    </div>
  );
};
