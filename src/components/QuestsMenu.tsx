import React, { useEffect, useState } from 'react';
import { CheckCircle2, ClipboardList, Coins, X } from 'lucide-react';
import type { WalletView } from '../net/api';

interface Props {
  quests: NonNullable<WalletView['quests']>;
  onClose: () => void;
}

const left = (until: number) => {
  const ms = Math.max(0, until - Date.now());
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h} h ${String(m).padStart(2, '0')}`;
};

/** 📋 The 3 quests of the day */
export const QuestsMenu: React.FC<Props> = ({ quests, onClose }) => {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30000);
    return () => clearInterval(t);
  }, []);
  const done = quests.list.filter((q) => q.done).length;
  return (
    <div className="fixed inset-0 z-[78] bg-black/85 flex items-center justify-center p-3" onClick={onClose}>
      <div className="chunky relative w-full max-w-md max-h-[92vh] overflow-y-auto p-5 text-white !rounded-3xl" style={{ background: '#121218' }} onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-3 right-3 w-9 h-9 rounded-xl border border-red-800 bg-black flex items-center justify-center text-red-400" aria-label="Fermer">
          <X className="w-5 h-5" />
        </button>
        <h2 className="flex items-center gap-2 font-game text-[22px] mb-1">
          <ClipboardList className="w-5 h-5 text-red-500" /> Quêtes du jour
        </h2>
        <p className="text-[12px] text-zinc-400 mb-4">
          {done}/3 réussies · nouvelles quêtes dans {left(quests.next)}. Elles avancent à la fin de chaque partie, gagnée ou perdue.
        </p>
        <div className="space-y-2">
          {quests.list.map((q) => (
            <div key={q.id} className={`p-3 rounded-xl border ${q.done ? 'border-emerald-700/70 bg-emerald-950/20' : 'border-red-950 bg-[#0d0b0b]'}`}>
              <div className="flex items-center gap-2">
                {q.done ? <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" /> : <span className="w-5 h-5 shrink-0 rounded-full border-2 border-zinc-600" />}
                <span className={`flex-1 text-[14px] ${q.done ? 'text-emerald-200 line-through decoration-emerald-600/60' : 'text-zinc-100'}`}>{q.text}</span>
                <span className="flex items-center gap-1 text-[12px] font-game text-amber-300">
                  <Coins className="w-3.5 h-3.5" /> {q.coins}
                </span>
              </div>
              {q.goal > 1 && (
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex-1 h-2 rounded-full bg-zinc-800 overflow-hidden">
                    <div className={`h-full ${q.done ? 'bg-emerald-500' : 'bg-red-600'}`} style={{ width: `${(q.prog / q.goal) * 100}%` }} />
                  </div>
                  <span className="text-[11px] font-mono text-zinc-400">
                    {q.prog}/{q.goal}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
        <div className={`mt-4 p-3 rounded-xl border text-center ${quests.bonus ? 'border-amber-500 bg-amber-950/30 text-amber-200' : 'border-zinc-800 text-zinc-400'}`}>
          {quests.bonus ? `🏆 Les 3 quêtes sont faites : bonus de ${quests.bonusCoins} pièces gagné !` : `🏆 Les 3 quêtes réussies = bonus de ${quests.bonusCoins} pièces`}
        </div>
      </div>
    </div>
  );
};
