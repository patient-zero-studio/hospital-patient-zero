import React, { useEffect, useState } from 'react';
import { fetchPublicRooms, type PublicRoom } from '../net/NetClient';

/** 🌍 Main menu: a public game is looking for players */
export const PublicRoomBanner: React.FC<{ me: string | null; active: boolean; onJoin: (code: string) => void }> = ({ me, active, onJoin }) => {
  const [room, setRoom] = useState<PublicRoom | null>(null);
  const [hidden, setHidden] = useState<string[]>([]);
  useEffect(() => {
    if (!active) {
      setRoom(null);
      return;
    }
    let live = true;
    const load = () =>
      fetchPublicRooms()
        .then((list) => {
          if (!live) return;
          const mine = me?.toLowerCase();
          setRoom(list.find((r) => r.host.toLowerCase() !== mine && !hidden.includes(r.code)) ?? null);
        })
        .catch(() => {});
    load();
    const id = window.setInterval(load, 10000);
    return () => {
      live = false;
      window.clearInterval(id);
    };
  }, [active, me, hidden.join(',')]);
  if (!active || !room) return null;
  const need = room.imp ? Math.max(0, 4 - room.players) : 0;
  const what = room.imp
    ? '🔪 un Imposteur'
    : room.mode === 'versus'
      ? room.hide
        ? '🫣 un Cache-cache'
        : '🧟 une Chasse'
      : room.mode === 'race'
        ? '🏁 une Course'
        : room.chapter === 9
          ? '🎪 la Nuit du Cirque'
          : '🤝 une partie en coop';
  return (
    <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[70] w-[min(94vw,460px)] flex items-center gap-2 p-2.5 border border-emerald-600 bg-zinc-950/95 shadow-[0_0_30px_rgba(16,185,129,0.3)]">
      <div className="flex-1 min-w-0 text-xs font-mono text-zinc-100">
        🌍 <span className="text-emerald-300 font-bold" data-no-i18n>{room.host}</span>{' '}
        {need > 0 ? `cherche encore ${need} joueur${need > 1 ? 's' : ''} pour ${what}` : `t'attend pour ${what}`}
        <span className="text-zinc-500"> · {room.players}/{room.max}</span>
      </div>
      <button onClick={() => onJoin(room.code)} className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white font-mono text-[11px] uppercase tracking-wider font-bold">
        Rejoindre
      </button>
      <button onClick={() => setHidden((h) => [...h, room.code])} className="px-1.5 text-zinc-500 hover:text-zinc-200 text-sm" title="Masquer">
        ✕
      </button>
    </div>
  );
};
