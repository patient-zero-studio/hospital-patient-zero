/**
 * "Cassette 0": found-footage VHS film of the Patient Zero experiment (14 March 1987).
 * Its own little Three.js scene rendered at VHS resolution, with tape effects,
 * an on-screen counter, subtitles, recorded voices (tools/record-vhs-voices.ps1)
 * and procedural sound. About 1 minute, skippable.
 */
import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { ProceduralTextures as Tex } from '../textures/ProceduralTextures';
import { RemotePlayer } from '../game/RemotePlayer';
import { MonsterAI } from '../game/MonsterAI';
import { sound } from '../audio/SoundSystem';

export type Mode = 'blue' | 'static' | 'cam' | 'black';

export interface Frame {
  mode: Mode;
  cam: string;
  clock: string;
  sub: string | null;
  glitch: number;
  flash: boolean;
  end: string[] | null;
}

/** Real length of the film (s). */
const LEN = 59.3;

/**
 * The scenes were written on a 46 s script; the recorded lines need more room.
 * Real film time → script time (piecewise linear), so every line is said in full.
 */
const WARP: [number, number][] = [
  [0, 0],
  [3.3, 3.3],
  [16.9, 11.0],
  [20.4, 12.8],
  [22.8, 15.2],
  [25.0, 15.5],
  [28.5, 18.3],
  [29.3, 19.0],
  [38.2, 25.0],
  [40.6, 27.4],
  [41.9, 28.7],
  [43.5, 30.6],
  [47.6, 34.0],
  [49.7, 36.4],
  [50.6, 37.3],
  [52.9, 39.6],
  [55.9, 42.6],
  [LEN, 46.0],
];
const warp = (real: number) => {
  for (let i = 1; i < WARP.length; i++) {
    const [r1, s1] = WARP[i];
    const [r0, s0] = WARP[i - 1];
    if (real <= r1) return s0 + ((real - r0) / (r1 - r0)) * (s1 - s0);
  }
  return 46 + (real - LEN);
};

export type Speaker = 'moreau' | 'assistant' | 'patient';

/**
 * Recorded lines (public/audio/vhs/*.wav, made by tools/record-vhs-voices.ps1):
 * [start (real s), file, length (s), speaker, subtitle]
 */
const LINES: [number, string, number, Speaker, string][] = [
  [3.7, 'm1', 7.69, 'moreau', 'DR MOREAU — Protocole Aurore. Sujet zéro. 14 mars 1987, 3 h 12.'],
  [12.5, 'a1', 3.95, 'assistant', 'ASSISTANTE — Il tremble, docteur… Il dit qu\'il veut rentrer chez lui.'],
  [16.9, 'm2', 4.85, 'moreau', 'DR MOREAU — Notez sa fréquence cardiaque. Phase 1 : injection.'],
  [23.2, 'p1', 4.13, 'patient', 'PATIENT — Non… non, s\'il vous plaît ! Je ne dirai rien ! Je vous en supplie !'],
  [27.4, 'm3', 1.51, 'moreau', 'DR MOREAU — Injection… maintenant.'],
  [31.0, 'p2', 1.75, 'patient', 'PATIENT — AAAAH ! ÇA BRÛLE ! ÇA BRÛLE !'],
  [32.9, 'a2', 3.2, 'assistant', 'ASSISTANTE — Ses constantes explosent ! Docteur, arrêtez !'],
  [36.3, 'm4', 1.42, 'moreau', 'DR MOREAU — Continuez l\'enregistrement !'],
  [43.6, 'm5', 3.16, 'moreau', 'DR MOREAU (hors champ, à voix basse) — …Sujet zéro ? Tu… tu m\'entends ?'],
];

/** Each character: playback speed (pitch), drive, loudness. */
export const CAST: Record<Speaker, { rate: number; drive: number; gain: number }> = {
  moreau: { rate: 0.92, drive: 1.2, gain: 1.1 },
  assistant: { rate: 1.0, drive: 1.4, gain: 1.0 },
  patient: { rate: 1.08, drive: 3.2, gain: 1.15 },
};
const lineEnd = (l: (typeof LINES)[number]) => l[0] + l[2] / CAST[l[3]].rate + 0.35;

/** Call from the click that opens the film (unlocks audio on phones). */
export const primeFilmVoices = () => {
  sound.init();
  sound.resume();
};

/** Old tape recording: telephone-band mic, a bit of overdrive, wow & flutter, room echo. */
export const playLine = (buf: AudioBuffer, who: Speaker, volume = 1) => {
  const o = sound.voiceOutput();
  if (!o) return null;
  const ctx = o.ctx;
  const c = CAST[who];
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = c.rate;
  // Wow & flutter
  const wow = ctx.createOscillator();
  const wowG = ctx.createGain();
  wow.frequency.value = 0.7 + Math.random() * 0.4;
  wowG.gain.value = 9;
  wow.connect(wowG);
  wowG.connect(src.detune);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 260;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 3800;
  const presence = ctx.createBiquadFilter();
  presence.type = 'peaking';
  presence.frequency.value = 1900;
  presence.Q.value = 0.9;
  presence.gain.value = 5;
  const shaper = ctx.createWaveShaper();
  const curve = new Float32Array(1024);
  for (let i = 0; i < 1024; i++) {
    const x = (i / 1023) * 2 - 1;
    curve[i] = Math.tanh(x * c.drive) / Math.tanh(c.drive);
  }
  shaper.curve = curve;
  const g = ctx.createGain();
  g.gain.value = 0.9 * c.gain * volume;
  const rev = ctx.createGain();
  rev.gain.value = 0.22;
  src.connect(hp);
  hp.connect(presence);
  presence.connect(shaper);
  shaper.connect(lp);
  lp.connect(g);
  g.connect(o.out);
  g.connect(rev);
  rev.connect(o.reverb);
  const t = ctx.currentTime + 0.02;
  src.start(t);
  wow.start(t);
  const dur = buf.duration / c.rate;
  wow.stop(t + dur + 0.1);
  return src;
};

/** Fetches + decodes the recorded lines into `into` (missing ones: subtitles only). */
export const loadVoices = (ids: string[], into: Map<string, AudioBuffer>, alive: () => boolean) => {
  const actx = sound.voiceOutput()?.ctx;
  if (!actx) return;
  const base = import.meta.env.BASE_URL ?? '/';
  for (const id of ids) {
    fetch(`${base}audio/vhs/${id}.wav`)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((ab) => actx.decodeAudioData(ab))
      .then((b) => {
        if (alive()) into.set(id, b);
      })
      .catch(() => {
        /* missing line: subtitles only */
      });
  }
};

/** TV snow drawn into a tiny canvas (stretched, pixelated). */
export const makeNoise = (nc: HTMLCanvasElement) => {
  nc.width = 160;
  nc.height = 90;
  const nctx = nc.getContext('2d')!;
  const nimg = nctx.createImageData(160, 90);
  return () => {
    const d = nimg.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = (Math.random() * 255) | 0;
      d[i] = d[i + 1] = d[i + 2] = v;
      d[i + 3] = 255;
    }
    nctx.putImageData(nimg, 0, 0);
  };
};

/** Escape / Space stop the tape. */
export const useStopKeys = (stop: () => void) => {
  const ref = useRef(stop);
  ref.current = stop;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape' || e.code === 'Space') {
        e.preventDefault();
        e.stopImmediatePropagation();
        ref.current();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);
};

/** The TV: 3D picture, blue PLAY screen, snow, scanlines, OSD, subtitles, end cards. */
export const VhsScreen: React.FC<{
  f: Frame;
  mount: React.RefObject<HTMLDivElement | null>;
  noise: React.RefObject<HTMLCanvasElement | null>;
  blue: string[];
  onStop: () => void;
}> = ({ f, mount, noise, blue, onStop }) => {
  const showNoise = f.mode === 'static' ? 1 : f.mode === 'cam' ? 0.13 + f.glitch * 0.35 : f.mode === 'black' ? 0.04 : 0.06;
  const osd = { textShadow: '2px 0 rgba(255,0,0,0.6), -2px 0 rgba(0,180,255,0.6)' };
  return (
    <div className="fixed inset-0 z-[96] bg-black select-none overflow-hidden" style={{ cursor: 'default' }}>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="relative w-full h-full max-w-[177.8vh] max-h-[56.25vw] overflow-hidden bg-black">
          <div
            ref={mount}
            className="absolute inset-0"
            style={{
              opacity: f.mode === 'cam' ? 1 : 0,
              transform: f.glitch > 0.3 ? `translateX(${(Math.random() - 0.5) * 30 * f.glitch}px) skewX(${(Math.random() - 0.5) * 6 * f.glitch}deg)` : undefined,
            }}
          />
          {f.mode === 'blue' && (
            <div className="absolute inset-0 bg-[#1a2fd0] flex items-start justify-start p-[4%] font-mono text-white text-[3.2vh] tracking-widest">
              <div>
                ▶ PLAY
                <div className="mt-[3vh]" />
                {blue.map((b) => (
                  <div key={b} className="text-[2.4vh] opacity-90">
                    {b}
                  </div>
                ))}
              </div>
            </div>
          )}
          <canvas
            ref={noise}
            className="absolute inset-0 w-full h-full pointer-events-none"
            style={{ opacity: showNoise, mixBlendMode: f.mode === 'static' ? 'normal' : 'screen', imageRendering: 'pixelated' }}
          />
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                'repeating-linear-gradient(0deg, rgba(0,0,0,0.28) 0px, rgba(0,0,0,0.28) 1px, transparent 2px, transparent 3px), radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.75) 100%)',
            }}
          />
          {f.glitch > 0.2 && (
            <div
              className="absolute inset-x-0 pointer-events-none"
              style={{ top: `${Math.random() * 85}%`, height: `${4 + f.glitch * 10}%`, background: 'rgba(255,255,255,0.18)', mixBlendMode: 'overlay', filter: 'blur(2px)' }}
            />
          )}
          {f.cam && (
            <>
              <div className="absolute top-[4%] left-[4%] font-mono text-white text-[2.6vh] tracking-widest" style={osd}>
                <span className="text-red-500 animate-pulse">●</span> REC
              </div>
              <div className="absolute top-[4%] right-[4%] font-mono text-white text-[2.4vh] tracking-widest" style={osd}>
                {f.cam}
              </div>
              <div className="absolute bottom-[5%] right-[4%] font-mono text-white text-[2.4vh] tracking-widest" style={osd}>
                {f.clock}
              </div>
            </>
          )}
          {f.sub && (
            <div className="absolute bottom-[14%] inset-x-[6%] text-center">
              <span className="font-mono text-[2.6vh] text-yellow-200 bg-black/55 px-2 leading-relaxed" style={{ textShadow: '0 0 4px #000' }}>
                {f.sub}
              </span>
            </div>
          )}
          {f.end && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-[2vh] text-center px-[8%]">
              <div className="font-serif italic text-[4vh] text-zinc-100">{f.end[0]}</div>
              <div className="font-mono text-[2.4vh] tracking-widest text-red-400">{f.end[1]}</div>
            </div>
          )}
          {f.flash && <div className="absolute inset-0 bg-red-700/40 mix-blend-screen pointer-events-none" />}
        </div>
      </div>
      <button
        onClick={onStop}
        className="absolute top-3 right-3 z-10 px-3 py-1.5 border border-zinc-700 bg-black/70 text-zinc-300 hover:text-white font-mono text-[11px] uppercase tracking-widest"
      >
        ⏹ Arrêter [Échap]
      </button>
    </div>
  );
};

export const ExperimentFilm: React.FC<{ onClose: (watchedToEnd: boolean) => void }> = ({ onClose }) => {
  const mount = useRef<HTMLDivElement>(null);
  const noise = useRef<HTMLCanvasElement>(null);
  const [f, setF] = useState<Frame>({ mode: 'blue', cam: '', clock: '', sub: null, glitch: 0, flash: false, end: null });
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const host = mount.current!;
    const W = 480;
    const H = 270;
    const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'low-power' });
    renderer.setPixelRatio(1);
    renderer.setSize(W, H, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;
    renderer.domElement.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;filter:blur(0.7px) contrast(1.2) saturate(0.7) sepia(0.18) brightness(1.05);';
    host.appendChild(renderer.domElement);

    const disposables: { dispose: () => void }[] = [];
    const track = <T extends { dispose: () => void }>(o: T) => {
      disposables.push(o);
      return o;
    };
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050605);
    scene.fog = new THREE.FogExp2(0x050605, 0.06);
    const hemi = new THREE.HemisphereLight(0x8a9a92, 0x201812, 0.55);
    scene.add(hemi);

    // ---- Operating room ----
    const wallTex = Tex.getDirtyWallTexture().clone();
    wallTex.needsUpdate = true;
    wallTex.repeat.set(3, 1);
    track(wallTex);
    const room = new THREE.Mesh(
      track(new THREE.BoxGeometry(9, 3.4, 9)),
      track(new THREE.MeshStandardMaterial({ map: wallTex, side: THREE.BackSide, roughness: 0.9 }))
    );
    room.position.y = 1.7;
    scene.add(room);
    const floorTex = Tex.getFloorTileTexture().clone();
    floorTex.needsUpdate = true;
    floorTex.repeat.set(3, 3);
    track(floorTex);
    const floor = new THREE.Mesh(track(new THREE.PlaneGeometry(9, 9)), track(new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.35 })));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.002;
    scene.add(floor);

    const mat = (c: number, r = 0.6, m = 0) => track(new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m }));
    const box = (w: number, h: number, d: number, m: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0) => {
      const b = new THREE.Mesh(track(new THREE.BoxGeometry(w, h, d)), m);
      b.position.set(x, y, z);
      parent.add(b);
      return b;
    };
    const steel = mat(0x9aa0a4, 0.35, 0.8);
    const darkSteel = mat(0x2a2e30, 0.4, 0.8);
    const leather = mat(0x3a2a1c, 0.7);

    // Reclined restraint table
    const table = new THREE.Group();
    table.position.set(0, 0, 0.1);
    scene.add(table);
    box(0.08, 0.9, 0.08, darkSteel, table, -0.3, 0.45, 0.35);
    box(0.08, 0.9, 0.08, darkSteel, table, 0.3, 0.45, 0.35);
    const board = new THREE.Group();
    board.position.set(0, 0.85, 0.25);
    board.rotation.x = -0.62;
    table.add(board);
    box(0.75, 2.0, 0.08, mat(0x5a6668, 0.6, 0.3), board, 0, 0.65, -0.06);
    const straps: THREE.Object3D[] = [];
    for (const y of [1.15, 0.55, -0.15]) straps.push(box(0.8, 0.08, 0.05, leather, board, 0, y, 0.18));

    // Patient (a real human model, strapped on the board)
    const dummyLight = new THREE.SpotLight(0xffffff, 0);
    const patient = new RemotePlayer('', dummyLight, new THREE.Object3D());
    patient.showName = false;
    // Feet on the floor in front of the board, body lying against it (model faces +z, towards the cameras)
    patient.group.position.set(0, 0, 1.08);
    patient.group.rotation.set(-0.62, 0, 0);
    patient.group.visible = true;
    scene.add(patient.group);

    // Two scientists (lab coats, masks)
    const person = (coat: number, hairC: number) => {
      const g = new THREE.Group();
      const body = new THREE.Mesh(track(new THREE.CapsuleGeometry(0.24, 1.0, 4, 10)), mat(coat, 0.85));
      body.position.y = 0.9;
      g.add(body);
      const head = new THREE.Mesh(track(new THREE.SphereGeometry(0.15, 16, 12)), mat(0xd0a88c, 0.6));
      head.position.y = 1.62;
      g.add(head);
      const hair = new THREE.Mesh(track(new THREE.SphereGeometry(0.155, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2)), mat(hairC, 0.8));
      hair.position.y = 1.64;
      g.add(hair);
      box(0.2, 0.09, 0.06, mat(0x9ab8c0, 0.9), g, 0, 1.57, 0.13);
      const arm = new THREE.Group();
      arm.position.set(0.27, 1.32, 0);
      g.add(arm);
      const fore = new THREE.Mesh(track(new THREE.CapsuleGeometry(0.06, 0.55, 3, 8)), mat(coat, 0.85));
      fore.position.y = -0.3;
      arm.add(fore);
      scene.add(g);
      return { g, arm };
    };
    const moreau = person(0xe8e6e0, 0x6a6a6a);
    moreau.g.position.set(-1.4, 0, 1.2);
    moreau.g.lookAt(0, 0, 0.3);
    const syringe = new THREE.Group();
    const barrel = new THREE.Mesh(track(new THREE.CylinderGeometry(0.018, 0.018, 0.14, 8)), track(new THREE.MeshStandardMaterial({ color: 0xc8f0ff, transparent: true, opacity: 0.6 })));
    barrel.rotation.x = Math.PI / 2;
    syringe.add(barrel);
    const liquid = new THREE.Mesh(track(new THREE.CylinderGeometry(0.012, 0.012, 0.09, 8)), track(new THREE.MeshStandardMaterial({ color: 0x30ff70, emissive: 0x20ff60, emissiveIntensity: 1.5 })));
    liquid.rotation.x = Math.PI / 2;
    syringe.add(liquid);
    syringe.position.set(0, -0.62, 0.08);
    moreau.arm.add(syringe);
    const assistant = person(0xdcdcd4, 0x2a1a10);
    assistant.g.position.set(1.6, 0, -0.4);
    assistant.g.lookAt(0, 0, 0.3);
    const clipboard = box(0.25, 0.32, 0.02, mat(0x8a6a44), assistant.arm, 0, -0.6, 0.12);
    clipboard.rotation.x = -0.6;

    // Equipment: EKG monitor, IV stand, cart
    const monitorScreenMat = track(new THREE.MeshStandardMaterial({ color: 0x001a08, emissive: 0x22ff66, emissiveIntensity: 1.2 }));
    const monitor = new THREE.Group();
    monitor.position.set(1.4, 0, 1.4);
    box(0.5, 1.1, 0.4, darkSteel, monitor, 0, 0.55, 0);
    box(0.5, 0.38, 0.32, darkSteel, monitor, 0, 1.3, 0);
    box(0.42, 0.28, 0.01, monitorScreenMat, monitor, 0, 1.31, 0.165);
    monitor.lookAt(0, 0, 0);
    scene.add(monitor);
    const cart = new THREE.Group();
    cart.position.set(-1.6, 0, -1.2);
    box(0.9, 0.04, 0.5, steel, cart, 0, 0.85, 0);
    box(0.9, 0.04, 0.5, steel, cart, 0, 0.35, 0);
    for (const [x, z] of [[-0.42, -0.22], [0.42, -0.22], [-0.42, 0.22], [0.42, 0.22]]) box(0.03, 0.85, 0.03, steel, cart, x, 0.42, z);
    scene.add(cart);
    box(0.03, 2, 0.03, steel, scene, 0.7, 1, -0.4);
    box(0.4, 0.04, 0.04, steel, scene, 0.7, 1.95, -0.4);
    // Bloodied floor after the "incident"
    const bloodTex = Tex.getBloodDecalTexture(0);
    const blood = new THREE.Mesh(track(new THREE.PlaneGeometry(2.2, 2.2)), track(new THREE.MeshStandardMaterial({ map: bloodTex, transparent: true, depthWrite: false, roughness: 0.2 })));
    blood.rotation.x = -Math.PI / 2;
    blood.position.set(0.8, 0.01, 0.3);
    blood.visible = false;
    scene.add(blood);

    // Lights: surgical lamp, flickering tube, red alarm
    const lamp = new THREE.SpotLight(0xfff3e0, 60, 9, 0.6, 0.5, 1.6);
    lamp.position.set(0, 3.1, 0.6);
    lamp.target.position.set(0, 0.9, 0.1);
    scene.add(lamp, lamp.target);
    const lampHead = new THREE.Mesh(track(new THREE.CylinderGeometry(0.4, 0.28, 0.16, 20)), steel);
    lampHead.position.set(0, 3.15, 0.6);
    scene.add(lampHead);
    const tube = new THREE.PointLight(0xc8ffd8, 6, 10, 1.6);
    tube.position.set(-2, 3.0, -2);
    scene.add(tube);
    const alarm = new THREE.PointLight(0xff1a0a, 0, 12, 1.4);
    alarm.position.set(2.5, 3.0, 2.5);
    scene.add(alarm);

    // The creature (hidden until after the incident)
    const monster = new MonsterAI(new THREE.Vector3(0.6, 0, 0.6), new Map(), [], new Map(), () => {});
    monster.mesh.visible = false;
    scene.add(monster.mesh);

    // Cameras
    const cam = new THREE.PerspectiveCamera(68, W / H, 0.05, 40);
    const CAM1 = { pos: new THREE.Vector3(3.6, 3.0, 3.6), look: new THREE.Vector3(0, 0.9, 0) };
    const CAM2 = { pos: new THREE.Vector3(0.7, 1.5, 2.55), look: new THREE.Vector3(0, 1.25, 0.45) };

    // ---- Noise overlay ----
    const drawNoise = makeNoise(noise.current!);

    // ---- Timeline ----
    const fired = new Set<string>();
    const once = (k: string, t: number, at: number, fn: () => void) => {
      if (t >= at && !fired.has(k)) {
        fired.add(k);
        fn();
      }
    };
    const lerp = (a: number, b: number, k: number) => a + (b - a) * Math.max(0, Math.min(1, k));
    const start = performance.now();
    let last = start;
    let raf = 0;
    let lastUi = '';
    sound.init();
    sound.resume();
    // Recorded voices: loaded during the blue "PLAY" screen
    const buffers = new Map<string, AudioBuffer>();
    const playing: AudioBufferSourceNode[] = [];
    const spoken = new Set<number>();
    let alive = true;
    loadVoices(LINES.map((l) => l[1]), buffers, () => alive);

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const real = (now - start) / 1000;
      // Scenes run on script time; voices and subtitles on real time
      const t = warp(real);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      // Mode
      let mode: Mode = 'cam';
      if (t < 2.5) mode = 'blue';
      else if (t < 3.3) mode = 'static';
      else if (t >= 27.4 && t < 28.7) mode = 'static';
      else if (t >= 37.3 && t < 39.6) mode = 'static';
      else if (t >= 39.6) mode = 'black';
      let glitch = 0;
      if (t > 25 && t < 27.4) glitch = 0.55 + Math.random() * 0.45;
      else if (t > 34 && t < 37.3) glitch = Math.random() < 0.08 ? 0.6 : 0.08;
      else if (Math.random() < 0.01) glitch = 0.35;
      // Black frames during the transformation
      if (t > 25.6 && t < 27.4 && Math.random() < 0.25) mode = 'black';

      // Sound cues
      once('s0', t, 0.05, () => sound.playStatic(0.5, 0.12));
      once('s1', t, 2.5, () => sound.playStatic(0.8, 0.2));
      once('hb', t, 11.2, () => sound.setHeartbeat(95, true));
      once('hb2', t, 18.4, () => sound.setHeartbeat(150, true));
      // Screams placed on real time, between the spoken lines
      once('scream1', real, 29.6, () => sound.playHumanScream(1.25, 0.3));
      once('slam1', t, 20.2, () => sound.playDoorSlam());
      once('scream2', real, 38.0, () => sound.playHumanScream(2.0, 0.28));
      once('br', t, 20.6, () => sound.playBreath?.(1));
      once('slam2', t, 22.6, () => sound.playDoorSlam());
      once('growl1', t, 24.3, () => sound.playMonsterGrowl(2, 0));
      once('roar', t, 26.2, () => sound.playMonsterChaseRoar());
      once('st2', t, 27.4, () => {
        sound.playStatic(1.3, 0.22);
        sound.setHeartbeat(60, false);
      });
      once('growl2', t, 29.5, () => sound.playMonsterGrowl(4, 0.3));
      once('growl3', t, 34.2, () => sound.playMonsterGrowl(2.5, 0));
      once('lunge', t, 36.4, () => sound.playMonsterChaseRoar());
      once('scream', t, 37.05, () => sound.playScreamer());
      once('st3', t, 37.3, () => sound.playStatic(2.3, 0.24));
      once('end', real, LEN, () => closeRef.current(true));

      // Spoken lines (each one plays to its end, the next starts after it)
      LINES.forEach((l, i) => {
        if (real >= l[0] && !spoken.has(i)) {
          spoken.add(i);
          const b = buffers.get(l[1]);
          // Too late (still loading after half a second)? keep the subtitle only
          if (b && real - l[0] < 0.5) {
            const s = playLine(b, l[3], i === LINES.length - 1 ? 0.6 : 1);
            if (s) playing.push(s);
          }
        }
      });

      // ---- Acting ----
      const shake = t > 18.6 && t < 25.6 ? Math.min(1, (t - 18.6) / 2.5) : 0;
      const beforeIncident = t < 27.4;
      patient.group.visible = beforeIncident;
      straps.forEach((s) => (s.visible = beforeIncident));
      monster.mesh.visible = !beforeIncident || (t > 25.6 && Math.random() < 0.35);
      if (beforeIncident) {
        patient.group.rotation.z = Math.sin(t * 38) * 0.06 * shake;
        patient.group.rotation.x = -0.62 + Math.sin(t * 27) * 0.04 * shake;
        patient.group.position.x = Math.sin(t * 31) * 0.03 * shake;
        board.rotation.z = Math.sin(t * 44) * 0.02 * shake;
      }
      // Moreau walks to the patient, injects, steps back
      if (beforeIncident) {
        const k = (t - 12.8) / 2.4;
        moreau.g.position.set(lerp(-1.4, -0.62, k), 0, lerp(1.2, 1.3, k));
        if (t > 19.5) moreau.g.position.set(lerp(-0.62, -1.8, (t - 19.5) / 1.5), 0, lerp(1.3, 1.9, (t - 19.5) / 1.5));
        moreau.g.lookAt(0, 0, 0.9);
        moreau.arm.rotation.x = t > 15.5 && t < 19.6 ? lerp(0, -1.1, (t - 15.5) / 1.2) : 0;
        syringe.visible = t < 19.6;
        liquid.scale.y = t > 18.3 ? Math.max(0.05, 1 - (t - 18.3) / 0.8) : 1;
        assistant.arm.rotation.x = -0.5 + (t > 22 ? Math.sin(t * 9) * 0.3 : 0);
        assistant.g.position.set(1.6, 0, -0.4);
        assistant.g.rotation.z = 0;
        assistant.g.visible = true;
        moreau.g.visible = true;
        blood.visible = false;
        board.rotation.x = -0.62;
      } else {
        // After: the board torn down, the assistant on the floor, Moreau gone
        moreau.g.visible = false;
        syringe.visible = false;
        assistant.g.position.set(1.2, 0.25, 0.6);
        assistant.g.rotation.set(0, 0.6, Math.PI / 2);
        blood.visible = true;
        board.rotation.x = -1.45;
        board.rotation.z = 0.35;
      }

      // Lights
      const crisis = t > 18.6 && t < 27.4;
      lamp.intensity = t > 27.4 ? (Math.random() < 0.15 ? 0 : 7) : crisis && Math.random() < 0.18 ? 6 : 60;
      tube.intensity = Math.random() < (crisis ? 0.3 : 0.04) ? 0.4 : 6;
      alarm.intensity = t > 20 ? (Math.sin(t * 9) > 0 ? 25 : 0) : 0;
      monitorScreenMat.emissive.setHex(t > 20 && t < 27.4 ? (Math.sin(t * 12) > 0 ? 0xff2222 : 0x22ff66) : 0x22ff66);
      hemi.intensity = t > 27.4 ? 0.25 : 0.55;

      // Creature
      if (!beforeIncident) {
        const lungeK = t > 36.4 ? Math.min(1, (t - 36.4) / 0.65) : 0;
        if (lungeK > 0) {
          monster.poseLunge(cam.position, lungeK * 0.35);
          monster.mesh.position.lerpVectors(new THREE.Vector3(0.6, 0, 0.6), new THREE.Vector3(cam.position.x * 0.82, 0, cam.position.z * 0.82), lungeK);
        } else {
          monster.mesh.position.set(0.6, 0, 0.6);
          monster.animateFilm(dt, t > 34);
          // Feeding over the body, then the head slowly turns to the camera
          const face = Math.atan2(cam.position.x - 0.6, cam.position.z - 0.6);
          const toBody = Math.atan2(1.2 - 0.6, 0.6 - 0.6);
          monster.mesh.rotation.y = t < 34 ? toBody : lerp(toBody, face, (t - 34) / 1.6);
        }
      } else {
        // Glimpses of the creature where the patient was, during the transformation
        monster.mesh.position.set(0, 0, 1.0);
        monster.mesh.rotation.y = 0;
        monster.animateFilm(dt, true);
      }

      // Camera
      const shot = t >= 19 && t < 25.6 ? CAM2 : CAM1;
      cam.position.copy(shot.pos);
      if (shot === CAM2) {
        cam.fov = 42;
        cam.position.x += Math.sin(t * 7) * 0.02 + (Math.random() - 0.5) * 0.04 * shake;
        cam.position.y += Math.sin(t * 5) * 0.015;
      } else cam.fov = 68;
      cam.updateProjectionMatrix();
      cam.lookAt(shot.look);
      if (t > 36.9 && t < 37.3) cam.position.add(new THREE.Vector3((Math.random() - 0.5) * 0.15, (Math.random() - 0.5) * 0.15, 0));

      if (mode === 'cam') renderer.render(scene, cam);
      if (mode !== 'blue' && mode !== 'black') drawNoise();
      else if (Math.random() < 0.3) drawNoise();

      // OSD
      const secs = beforeIncident ? 7 + Math.floor(t - 3.3) : 19 * 60 - 12 * 60 + 41 + Math.floor(t - 28.7);
      const total = 3 * 3600 + 12 * 60 + secs;
      const hh = Math.floor(total / 3600);
      const mm = Math.floor((total % 3600) / 60);
      const ss = total % 60;
      const clock = `14 MAR 1987  ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
      const sub = LINES.find((l) => real >= l[0] && real < lineEnd(l))?.[4] ?? null;
      const end =
        t >= 39.6
          ? t < 42.6
            ? ['FIN DE BANDE', 'CASSETTE 0 / 1 — LABORATOIRE SAINT-AURORE']
            : ['Le Patient Zéro n\'est pas né monstre.', 'C\'était un patient. Comme vous.']
          : null;
      const next: Frame = {
        mode,
        cam: mode === 'cam' ? (shot === CAM2 ? 'CAM 2 — SALLE 0' : 'CAM 1 — SALLE 0') : '',
        clock: mode === 'cam' ? clock : '',
        sub: mode === 'cam' || mode === 'black' ? sub : null,
        glitch: Math.round(glitch * 10) / 10,
        flash: t > 36.95 && t < 37.3,
        end,
      };
      const key = JSON.stringify(next);
      if (key !== lastUi) {
        lastUi = key;
        setF(next);
      }
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      alive = false;
      for (const s of playing) {
        try {
          s.stop();
        } catch {
          /* already ended */
        }
      }
      sound.setHeartbeat(60, false);
      patient.dispose();
      monster.dispose();
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  useStopKeys(() => closeRef.current(false));

  return <VhsScreen f={f} mount={mount} noise={noise} blue={['PROTOCOLE AURORE — SUJET 00', 'CONFIDENTIEL — NE PAS DIFFUSER']} onStop={() => onClose(false)} />;
};
