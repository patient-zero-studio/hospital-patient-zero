import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RemotePlayer } from '../game/RemotePlayer';
import type { Appearance } from '../appearance';
import { CATALOG } from '../economy';

/** Emotes everyone has, then the dances bought in the shop */
export const FREE_EMOTES: { id: string; label: string }[] = [{ id: 'wave', label: '👋 Coucou' }];
export const emoteLabel = (id: string) => FREE_EMOTES.find((e) => e.id === id)?.label ?? `💃 ${CATALOG.find((c) => c.slot === 'dance' && c.value === id)?.name ?? id}`;
export const ownedEmotes = (owned: string[]) => [
  ...FREE_EMOTES,
  ...CATALOG.filter((c) => c.slot === 'dance' && owned.includes(c.id)).map((c) => ({ id: c.value, label: `💃 ${c.name}` })),
];
/** How long an emote plays (s) */
export const EMOTE_TIME = 4;

interface Props {
  me: { name: string; look: Appearance; emote: { id: string; at: number } | null };
  partner: { name: string; look: Appearance | null; emote: { id: string; at: number } | null } | null;
}

/** 🎭 The lobby: both characters side by side, dancing when someone sends an emote */
export const LobbyStage: React.FC<Props> = ({ me, partner }) => {
  const mount = useRef<HTMLDivElement>(null);
  const models = useRef<{ me: RemotePlayer; partner: RemotePlayer } | null>(null);
  const state = useRef({ me, partner });
  state.current = { me, partner };

  useEffect(() => {
    const el = mount.current;
    if (!el) return;
    const W = el.clientWidth || 320;
    const H = 190;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(W, H);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, W / H, 0.1, 50);
    camera.position.set(0, 1.25, 4.6);
    camera.lookAt(0, 0.95, 0);
    scene.add(new THREE.HemisphereLight(0x8a9a98, 0x1a1210, 1.5));
    const key = new THREE.SpotLight(0xfff1dc, 55, 20, Math.PI / 4, 0.6, 2);
    key.position.set(0, 3.5, 3);
    scene.add(key);
    const rim = new THREE.PointLight(0xff3020, 5, 8, 2);
    rim.position.set(0, 2, -1.5);
    scene.add(rim);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(1.8, 40), new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 1 }));
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);
    const make = (x: number) => {
      const m = new RemotePlayer('', new THREE.SpotLight(), new THREE.Object3D());
      m.showName = false;
      m.group.visible = true;
      m.group.position.x = x;
      // facing the camera (models look towards -Z by default here)
      m.group.rotation.y = 0;
      scene.add(m.group);
      return m;
    };
    const a = make(-0.65);
    const b = make(0.65);
    models.current = { me: a, partner: b };

    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const s = state.current;
      const play = (m: RemotePlayer, e: { id: string; at: number } | null) => {
        if (e && Date.now() - e.at < EMOTE_TIME * 1000) m.dance(dt, e.id === 'wave' ? '' : e.id);
        else m.idle(dt);
      };
      play(a, s.me.emote);
      b.group.visible = !!s.partner?.look;
      if (s.partner?.look) play(b, s.partner.emote);
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      a.dispose();
      b.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      models.current = null;
    };
  }, []);

  useEffect(() => {
    models.current?.me.applyLook(me.look.human);
  }, [me.look]);
  useEffect(() => {
    if (partner?.look) models.current?.partner.applyLook(partner.look.human);
  }, [partner?.look]);

  return (
    <div className="relative border border-zinc-800 bg-gradient-to-b from-zinc-900/60 to-black">
      <div ref={mount} className="w-full" style={{ height: 190 }} />
      <div className="absolute bottom-1 left-0 right-0 flex justify-around text-[11px] font-mono pointer-events-none" data-no-i18n>
        <span className="text-emerald-400 w-1/2 text-center truncate px-2">{me.name}</span>
        <span className="text-sky-300 w-1/2 text-center truncate px-2">{partner?.name ?? '…'}</span>
      </div>
    </div>
  );
};
