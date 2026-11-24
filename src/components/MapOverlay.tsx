import React, { useEffect, useRef, useState } from 'react';
import { Crosshair, Skull, Package, EyeOff, X, Trash2 } from 'lucide-react';
import type { MapSnapshot, MapMarkKind } from '../game/Engine';

interface Props {
  /** fresh data from the engine (called every 400 ms while the map is open) */
  read: () => MapSnapshot | null;
  onMark: (x: number, z: number, kind: MapMarkKind) => void;
  onUnmark: (x: number, z: number) => void;
  onClose: () => void;
}

const MARKS: { kind: MapMarkKind; label: string; color: string; glyph: string; Icon: typeof Skull }[] = [
  { kind: 'danger', label: 'Danger', color: '#ef4444', glyph: '☠', Icon: Skull },
  { kind: 'item', label: 'Objet', color: '#f59e0b', glyph: '✚', Icon: Package },
  { kind: 'hide', label: 'Cachette', color: '#22c55e', glyph: '◼', Icon: EyeOff },
];

/** 🗺️ [M] The map you draw by exploring: walls appear where you have been. */
export const MapOverlay: React.FC<Props> = ({ read, onMark, onUnmark, onClose }) => {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [snap, setSnap] = useState<MapSnapshot | null>(() => read());
  const [tool, setTool] = useState<MapMarkKind | 'erase'>('danger');
  const view = useRef({ scale: 12, cx: 0, cz: 0, follow: true });
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const [, redraw] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setSnap(read()), 400);
    return () => clearInterval(t);
  }, [read]);

  // ---- Drawing ----
  useEffect(() => {
    const c = canvas.current;
    if (!c || !snap) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = c.clientWidth;
    const H = c.clientHeight;
    if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) {
      c.width = Math.round(W * dpr);
      c.height = Math.round(H * dpr);
    }
    const g = c.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const v = view.current;
    if (v.follow) {
      v.cx = snap.me.x;
      v.cz = snap.me.z;
    }
    const sx = (x: number) => W / 2 + (x - v.cx) * v.scale;
    const sy = (z: number) => H / 2 + (z - v.cz) * v.scale;

    // Old paper, darkened
    g.fillStyle = '#0b0908';
    g.fillRect(0, 0, W, H);
    const { grid, w, h, cell, minX, minZ } = snap;
    // Explored ground
    g.fillStyle = '#2a211b';
    const cs = cell * v.scale + 0.6;
    const x0 = Math.max(0, Math.floor((v.cx - W / 2 / v.scale - minX) / cell));
    const x1 = Math.min(w - 1, Math.ceil((v.cx + W / 2 / v.scale - minX) / cell));
    const z0 = Math.max(0, Math.floor((v.cz - H / 2 / v.scale - minZ) / cell));
    const z1 = Math.min(h - 1, Math.ceil((v.cz + H / 2 / v.scale - minZ) / cell));
    for (let zi = z0; zi <= z1; zi++) {
      for (let xi = x0; xi <= x1; xi++) {
        if (grid[zi * w + xi]) g.fillRect(sx(minX + xi * cell), sy(minZ + zi * cell), cs, cs);
      }
    }
    const seen = (x: number, z: number) => {
      const xi = Math.floor((x - minX) / cell);
      const zi = Math.floor((z - minZ) / cell);
      return xi >= 0 && zi >= 0 && xi < w && zi < h && grid[zi * w + xi] === 1;
    };
    // Walls (ink) and furniture (lighter), only where explored
    const wl = snap.walls;
    for (let i = 0; i < wl.length; i += 5) {
      const ax = wl[i];
      const az = wl[i + 1];
      const bx = wl[i + 2];
      const bz = wl[i + 3];
      if (bx < v.cx - W / 2 / v.scale || ax > v.cx + W / 2 / v.scale || bz < v.cz - H / 2 / v.scale || az > v.cz + H / 2 / v.scale) continue;
      // Sample along the box: visible if any part was explored
      const n = Math.max(1, Math.ceil(Math.max(bx - ax, bz - az) / cell));
      let vis = false;
      for (let k = 0; k <= n && !vis; k++) {
        const f = k / n;
        vis = seen(ax + (bx - ax) * f, az + (bz - az) * f) || seen(ax + (bx - ax) * f, bz) || seen(ax, az + (bz - az) * f);
      }
      if (!vis) continue;
      g.fillStyle = wl[i + 4] ? '#d8c9b0' : '#6e5d4c';
      g.fillRect(sx(ax), sy(az), Math.max(1, (bx - ax) * v.scale), Math.max(1, (bz - az) * v.scale));
    }
    // Doors
    for (const d of snap.doors) {
      if (!seen(d.x, d.z)) continue;
      g.fillStyle = d.locked ? '#dc2626' : d.open ? '#4b5563' : '#a16207';
      g.beginPath();
      g.arc(sx(d.x), sy(d.z), Math.max(2.5, v.scale * 0.35), 0, Math.PI * 2);
      g.fill();
    }
    // Marks
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (const m of snap.marks) {
      const def = MARKS.find((x) => x.kind === m.kind)!;
      const px = sx(m.x);
      const py = sy(m.z);
      g.fillStyle = 'rgba(0,0,0,0.7)';
      g.beginPath();
      g.arc(px, py, 11, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = def.color;
      g.lineWidth = 2;
      g.stroke();
      g.fillStyle = def.color;
      g.font = 'bold 13px sans-serif';
      g.fillText(def.glyph, px, py + 1);
    }
    // Team mates
    for (const p of snap.peers) {
      g.fillStyle = '#38bdf8';
      g.beginPath();
      g.arc(sx(p.x), sy(p.z), 5, 0, Math.PI * 2);
      g.fill();
      g.font = '11px sans-serif';
      g.fillText(p.name, sx(p.x), sy(p.z) - 12);
    }
    // You: a red arrow (yaw 0 looks towards -z, i.e. up on the map)
    const px = sx(snap.me.x);
    const py = sy(snap.me.z);
    g.save();
    g.translate(px, py);
    g.rotate(-snap.me.yaw);
    g.fillStyle = '#ef4444';
    g.strokeStyle = '#000';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(0, -11);
    g.lineTo(7, 8);
    g.lineTo(0, 4);
    g.lineTo(-7, 8);
    g.closePath();
    g.stroke();
    g.fill();
    g.restore();
  });

  // ---- Input ----
  const toWorld = (clientX: number, clientY: number) => {
    const c = canvas.current!;
    const r = c.getBoundingClientRect();
    const v = view.current;
    return { x: v.cx + (clientX - r.left - r.width / 2) / v.scale, z: v.cz + (clientY - r.top - r.height / 2) / v.scale };
  };
  const onDown = (e: React.PointerEvent) => {
    drag.current = { x: e.clientX, y: e.clientY, moved: false };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 6) return;
    d.moved = true;
    d.x = e.clientX;
    d.y = e.clientY;
    const v = view.current;
    v.follow = false;
    v.cx -= dx / v.scale;
    v.cz -= dy / v.scale;
    redraw((n) => n + 1);
  };
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.moved || !snap) return;
    const p = toWorld(e.clientX, e.clientY);
    // Click on a mark = remove it, otherwise place the chosen one
    const near = snap.marks.find((m) => Math.hypot(m.x - p.x, m.z - p.z) * view.current.scale < 14);
    if (near) onUnmark(near.x, near.z);
    else if (tool !== 'erase') onMark(Math.round(p.x * 10) / 10, Math.round(p.z * 10) / 10, tool);
    setTimeout(() => setSnap(read()), 30);
  };
  const onWheel = (e: React.WheelEvent) => {
    const v = view.current;
    v.scale = Math.min(30, Math.max(3, v.scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
    redraw((n) => n + 1);
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black/80 flex flex-col p-3 sm:p-5 select-none">
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <h2 className="font-game text-[20px] text-zinc-100 mr-2">🗺️ Carte</h2>
        {MARKS.map((m) => (
          <button
            key={m.kind}
            onClick={() => setTool(m.kind)}
            className={`chunky flex items-center gap-1.5 h-9 px-3 font-game text-[12px] text-zinc-100 ${tool === m.kind ? '!border-red-500' : ''}`}
            style={{ background: tool === m.kind ? '#2a0a0a' : '#121214' }}
          >
            <m.Icon className="w-4 h-4" style={{ color: m.color }} /> {m.label}
          </button>
        ))}
        <button
          onClick={() => setTool('erase')}
          className={`chunky flex items-center gap-1.5 h-9 px-3 font-game text-[12px] text-zinc-100 ${tool === 'erase' ? '!border-red-500' : ''}`}
          style={{ background: tool === 'erase' ? '#2a0a0a' : '#121214' }}
        >
          <Trash2 className="w-4 h-4 text-zinc-400" /> Effacer
        </button>
        <button
          onClick={() => {
            view.current.follow = true;
            redraw((n) => n + 1);
          }}
          className="chunky flex items-center gap-1.5 h-9 px-3 font-game text-[12px] text-zinc-100"
          style={{ background: '#121214' }}
        >
          <Crosshair className="w-4 h-4 text-red-500" /> Centrer
        </button>
        <button onClick={onClose} className="chunky ml-auto w-9 h-9 flex items-center justify-center text-red-400" style={{ background: '#121214' }} aria-label="Fermer">
          <X className="w-5 h-5" />
        </button>
      </div>
      <canvas
        ref={canvas}
        className="flex-1 w-full rounded-lg border border-red-900/60 cursor-crosshair touch-none"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onWheel={onWheel}
        onContextMenu={(e) => e.preventDefault()}
      />
      <p className="mt-2 text-[11px] text-zinc-400 text-center">
        La carte se dessine là où tu passes. Clique pour poser une marque{snap?.peers.length ? ' (ton équipe la voit)' : ''}, clique sur une marque pour l'enlever · molette : zoom · glisser : déplacer · [M] ou [Échap] pour fermer
      </p>
    </div>
  );
};
