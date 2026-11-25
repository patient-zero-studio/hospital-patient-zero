import React, { useEffect, useState } from 'react';
import { Delete, Lock, X } from 'lucide-react';

interface Props {
  /** true = right code */
  onTry: (code: string) => boolean;
  onClose: () => void;
}

/** 🧩 4-digit keypad of the code safe */
export const KeypadModal: React.FC<Props> = ({ onTry, onClose }) => {
  const [code, setCode] = useState('');
  const [state, setState] = useState<'idle' | 'bad' | 'ok'>('idle');

  const press = (d: string) => {
    if (state === 'ok') return;
    setState('idle');
    setCode((c) => (c.length < 4 ? c + d : c));
  };
  const submit = () => {
    if (code.length < 4 || state === 'ok') return;
    if (onTry(code)) {
      setState('ok');
      setTimeout(onClose, 900);
    } else {
      setState('bad');
      setCode('');
    }
  };

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      e.stopPropagation();
      if (/^[0-9]$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') setCode((c) => c.slice(0, -1));
      else if (e.key === 'Enter') submit();
      else if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', k, true);
    return () => window.removeEventListener('keydown', k, true);
  });

  const screen = state === 'ok' ? 'OUVERT' : state === 'bad' ? 'ERREUR' : code.padEnd(4, '·').split('').join(' ');
  return (
    <div className="fixed inset-0 z-[72] bg-black/75 flex items-center justify-center p-3" onClick={onClose}>
      <div className={`chunky relative w-[260px] p-4 text-white !rounded-2xl ${state === 'bad' ? 'animate-[shake_0.3s]' : ''}`} style={{ background: '#16181c' }} onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-2 right-2 w-8 h-8 rounded-lg border border-red-800 bg-black flex items-center justify-center text-red-400" aria-label="Fermer">
          <X className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-2 font-game text-[15px] mb-3">
          <Lock className="w-4 h-4 text-red-500" /> Coffre à code
        </div>
        <div
          className={`h-14 mb-3 rounded-lg border-2 border-black flex items-center justify-center font-mono text-[26px] tracking-[0.2em] ${state === 'bad' ? 'bg-red-950 text-red-400' : state === 'ok' ? 'bg-emerald-950 text-emerald-300' : 'bg-[#0b1a10] text-emerald-400'}`}
          style={{ textShadow: '0 0 8px currentColor' }}
        >
          {screen}
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
            <button key={d} onClick={() => press(d)} className="chunky h-12 font-game text-[20px] text-zinc-100" style={{ background: '#22252b' }}>
              {d}
            </button>
          ))}
          <button onClick={() => setCode((c) => c.slice(0, -1))} className="chunky h-12 flex items-center justify-center text-zinc-300" style={{ background: '#22252b' }} aria-label="Effacer">
            <Delete className="w-5 h-5" />
          </button>
          <button onClick={() => press('0')} className="chunky h-12 font-game text-[20px] text-zinc-100" style={{ background: '#22252b' }}>
            0
          </button>
          <button onClick={submit} className="chunky h-12 font-game text-[15px] text-white" style={{ background: code.length === 4 ? '#7a0a0a' : '#3a1a1a' }}>
            OK
          </button>
        </div>
        <p className="mt-3 text-[11px] text-zinc-500 leading-snug">Le code est écrit quelque part… Chaque erreur fait biper le coffre.</p>
      </div>
    </div>
  );
};
