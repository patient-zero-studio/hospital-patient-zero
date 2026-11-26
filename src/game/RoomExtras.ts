import * as THREE from 'three';
import { DEFAULT_APPEARANCE } from '../appearance';
import { MonsterAI } from './MonsterAI';
import { RemotePlayer } from './RemotePlayer';

/**
 * 🏚️ Things for the secret room (in the menu and in the real room 104):
 * 🖼️ frames of your best moments, 🎵 a jukebox, 🐾 your pet, 🚪 the wardrobe
 * with your favourite outfit on a mannequin.
 */
type Track = <T extends { dispose: () => void }>(o: T) => T;

const add = (track: Track, parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) => {
  const m = new THREE.Mesh(track(geo), mat);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
};
const std = (track: Track, color: number, o: THREE.MeshStandardMaterialParameters = {}) => track(new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...o }));

// ---------------------------------------------------------------------------
// 🖼️ A frame: gold moulding, a dark painting with an emoji and a caption
// ---------------------------------------------------------------------------
export const buildFrame = (e: string, t: string, track: Track) => {
  const g = new THREE.Group();
  const c = document.createElement('canvas');
  c.width = 192;
  c.height = 240;
  const x = c.getContext('2d')!;
  const grd = x.createLinearGradient(0, 0, 0, 240);
  grd.addColorStop(0, '#2a1a12');
  grd.addColorStop(1, '#120a06');
  x.fillStyle = grd;
  x.fillRect(0, 0, 192, 240);
  x.font = '96px serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(e, 96, 100);
  x.fillStyle = '#f5d78a';
  x.font = 'bold 20px Georgia, serif';
  x.fillText(t, 96, 200, 176);
  const tex = track(new THREE.CanvasTexture(c));
  tex.colorSpace = THREE.SRGBColorSpace;
  add(track, g, new THREE.PlaneGeometry(0.48, 0.6), track(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.25 })), 0, 0, 0.012);
  const gold = std(track, 0xc8a040, { metalness: 0.9, roughness: 0.3 });
  for (const [w, h, px, py] of [
    [0.58, 0.05, 0, 0.325],
    [0.58, 0.05, 0, -0.325],
    [0.05, 0.7, 0.265, 0],
    [0.05, 0.7, -0.265, 0],
  ])
    add(track, g, new THREE.BoxGeometry(w, h, 0.04), gold, px, py, 0.01);
  return g;
};

// ---------------------------------------------------------------------------
// 🎵 A jukebox: a little cabinet with a turntable, the record spins, notes fly
// ---------------------------------------------------------------------------
export const buildJukebox = (track: Track) => {
  const g = new THREE.Group();
  add(track, g, new THREE.BoxGeometry(0.6, 0.7, 0.45), std(track, 0x5a2e14, { roughness: 0.5 }), 0, 0.35, 0);
  add(track, g, new THREE.BoxGeometry(0.62, 0.04, 0.47), std(track, 0xc8a040, { metalness: 0.8, roughness: 0.3 }), 0, 0.72, 0);
  const disc = new THREE.Group();
  disc.position.set(-0.05, 0.75, 0);
  g.add(disc);
  add(track, disc, new THREE.CylinderGeometry(0.19, 0.19, 0.012, 28), std(track, 0x0a0a0a, { roughness: 0.25 }));
  add(track, disc, new THREE.CylinderGeometry(0.06, 0.06, 0.014, 16), std(track, 0xd02a2a), 0, 0.001, 0);
  const arm = add(track, g, new THREE.BoxGeometry(0.02, 0.02, 0.26), std(track, 0xc8ccd0, { metalness: 0.9, roughness: 0.3 }), 0.2, 0.78, 0.02);
  arm.rotation.y = 0.4;
  // a horn (gramophone)
  const horn = add(track, g, new THREE.ConeGeometry(0.16, 0.35, 18, 1, true), std(track, 0xc8a040, { metalness: 0.85, roughness: 0.3, side: THREE.DoubleSide }), 0.2, 1.05, -0.12);
  horn.rotation.set(-0.6, 0, -0.5);
  const noteMat = track(new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true }));
  const notes = [0, 1, 2].map((i) => {
    const n = new THREE.Group();
    add(track, n, new THREE.SphereGeometry(0.03, 8, 6), noteMat, 0, 0, 0).scale.set(1.2, 0.9, 0.6);
    add(track, n, new THREE.BoxGeometry(0.008, 0.1, 0.008), noteMat, 0.03, 0.05, 0);
    n.userData.ph = i / 3;
    g.add(n);
    return n;
  });
  return {
    group: g,
    tick: (s: number, dt: number) => {
      disc.rotation.y += dt * 3.5;
      for (const n of notes) {
        const k = (s * 0.4 + n.userData.ph) % 1;
        n.position.set(0.3 + Math.sin(k * 6 + n.userData.ph * 9) * 0.15, 1.2 + k * 0.9, -0.2);
        (n.children[0] as THREE.Mesh).material = noteMat;
        noteMat.opacity = 1 - k;
      }
    },
  };
};

// ---------------------------------------------------------------------------
// 🐾 Pets: a black cat, a raven, a sewer rat (simple, alive, animated)
// ---------------------------------------------------------------------------
export const PET_INFO: Record<string, { name: string; warn: string }> = {
  cat: { name: 'Ton chat', warn: '🐈‍⬛ Ton chat se hérisse et crache… un monstre approche !' },
  raven: { name: 'Ton corbeau', warn: '🐦‍⬛ Ton corbeau croasse et bat des ailes… un monstre approche !' },
  rat: { name: 'Ton rat', warn: '🐀 Ton rat couine et file entre tes jambes… un monstre approche !' },
};

export const buildPet = (kind: string, track: Track) => {
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const eyeM = track(new THREE.MeshBasicMaterial({ color: kind === 'cat' ? 0xffe03a : 0xff3020 }));
  let tail: THREE.Object3D | null = null;
  let wings: THREE.Object3D[] = [];
  let head: THREE.Object3D;
  if (kind === 'raven') {
    const black = std(track, 0x101014, { roughness: 0.4, metalness: 0.2 });
    add(track, body, new THREE.SphereGeometry(0.11, 12, 10), black, 0, 0.14, 0).scale.set(0.9, 0.9, 1.4);
    head = add(track, body, new THREE.SphereGeometry(0.07, 12, 10), black, 0, 0.24, -0.12);
    const beak = add(track, head, new THREE.ConeGeometry(0.025, 0.09, 6), std(track, 0x2a2a2a), 0, -0.01, -0.08);
    beak.rotation.x = -Math.PI / 2;
    for (const s of [-1, 1]) add(track, head, new THREE.SphereGeometry(0.012, 6, 6), eyeM, s * 0.04, 0.02, -0.05);
    wings = [-1, 1].map((s) => {
      const w = new THREE.Group();
      w.position.set(s * 0.08, 0.17, 0);
      add(track, w, new THREE.BoxGeometry(0.2, 0.015, 0.16), black, s * 0.1, 0, 0);
      body.add(w);
      return w;
    });
    tail = add(track, body, new THREE.BoxGeometry(0.08, 0.015, 0.14), black, 0, 0.13, 0.17);
    for (const s of [-1, 1]) add(track, body, new THREE.CylinderGeometry(0.008, 0.008, 0.06, 4), std(track, 0x3a3a3a), s * 0.03, 0.03, 0);
  } else {
    const cat = kind === 'cat';
    const fur = std(track, cat ? 0x141416 : 0x6a5a4e, { roughness: 0.9 });
    const L = cat ? 0.34 : 0.2;
    add(track, body, new THREE.CapsuleGeometry(cat ? 0.08 : 0.06, L, 6, 10), fur, 0, cat ? 0.16 : 0.08, 0).rotation.x = Math.PI / 2;
    head = add(track, body, new THREE.SphereGeometry(cat ? 0.08 : 0.055, 12, 10), fur, 0, cat ? 0.24 : 0.1, -(L / 2 + 0.08));
    for (const s of [-1, 1]) {
      add(track, head, new THREE.SphereGeometry(0.013, 6, 6), eyeM, s * 0.032, 0.015, -0.06);
      const ear = add(track, head, cat ? new THREE.ConeGeometry(0.03, 0.06, 4) : new THREE.SphereGeometry(0.025, 8, 6), cat ? fur : std(track, 0xd8a0a0), s * 0.045, 0.06, 0);
      if (!cat) ear.scale.z = 0.4;
    }
    if (!cat) add(track, head, new THREE.ConeGeometry(0.03, 0.07, 8), fur, 0, -0.01, -0.06).rotation.x = -Math.PI / 2;
    for (const [lx, lz] of [
      [-0.05, -L / 2],
      [0.05, -L / 2],
      [-0.05, L / 2],
      [0.05, L / 2],
    ])
      add(track, body, new THREE.CylinderGeometry(0.018, 0.018, cat ? 0.12 : 0.05, 6), fur, lx, cat ? 0.06 : 0.025, lz);
    tail = new THREE.Group();
    tail.position.set(0, cat ? 0.18 : 0.08, L / 2 + 0.05);
    add(track, tail, new THREE.CylinderGeometry(0.012, cat ? 0.02 : 0.008, cat ? 0.32 : 0.28, 6), cat ? fur : std(track, 0xd8a0a0), 0, cat ? 0.14 : 0, cat ? 0.04 : 0.14).rotation.x = cat ? 0.3 : Math.PI / 2;
    body.add(tail);
  }
  return {
    group: g,
    /** moving: walking/flying; asleep: curled up on the bed */
    tick: (s: number, moving: boolean, asleep = false) => {
      if (tail) tail.rotation.y = Math.sin(s * (moving ? 9 : 2)) * 0.4;
      wings.forEach((w, i) => (w.rotation.z = (i ? 1 : -1) * (moving ? Math.sin(s * 22) * 0.8 : asleep ? 0.05 : 0.15)));
      body.position.y = moving && kind !== 'raven' ? Math.abs(Math.sin(s * 14)) * 0.02 : 0;
      body.scale.y = asleep ? 0.75 + Math.sin(s * 2) * 0.03 : 1;
      head.rotation.x = asleep ? 0.5 : 0;
    },
  };
};

// ---------------------------------------------------------------------------
// 🚪 The wardrobe: doors wide open, your favourite outfit on a mannequin
// value: 'h' + human outfit, 'm' + creature outfit
// ---------------------------------------------------------------------------
export const buildWardrobe = (value: string, track: Track) => {
  const g = new THREE.Group();
  const wood = std(track, 0x4a2c18, { roughness: 0.6 });
  const dark = std(track, 0x1a0e08, { roughness: 0.9 });
  add(track, g, new THREE.BoxGeometry(1.2, 2.5, 0.05), dark, 0, 1.25, -0.27);
  for (const x of [-0.6, 0.6]) add(track, g, new THREE.BoxGeometry(0.05, 2.5, 0.6), wood, x, 1.25, 0);
  add(track, g, new THREE.BoxGeometry(1.25, 0.08, 0.62), wood, 0, 2.5, 0);
  add(track, g, new THREE.BoxGeometry(1.25, 0.1, 0.62), wood, 0, 0.05, 0);
  for (const s of [-1, 1]) {
    const d = new THREE.Group();
    d.position.set(s * 0.6, 0, 0.3);
    d.rotation.y = s * 1.9;
    add(track, d, new THREE.BoxGeometry(0.6, 2.4, 0.04), wood, -s * 0.3, 1.25, 0);
    add(track, d, new THREE.BoxGeometry(0.03, 0.15, 0.04), std(track, 0xc8a040, { metalness: 0.9 }), -s * 0.52, 1.25, 0.03);
    g.add(d);
  }
  // a little light inside
  add(track, g, new THREE.BoxGeometry(1.0, 0.03, 0.05), track(new THREE.MeshBasicMaterial({ color: 0xfff0c0 })), 0, 2.42, 0.15);
  let model: { dispose: () => void; tick: (dt: number) => void } | null = null;
  const v = value.slice(1);
  if (value[0] === 'm') {
    const m = new MonsterAI(new THREE.Vector3(), new Map(), [], new Map(), () => {});
    m.applyLook({ ...DEFAULT_APPEARANCE.monster, outfit: v });
    m.mesh.scale.multiplyScalar(0.9);
    m.mesh.position.set(0, 0.1, 0);
    m.mesh.rotation.y = 0;
    g.add(m.mesh);
    model = { dispose: () => m.dispose(), tick: (dt) => m.tickFx(dt) };
  } else if (value[0] === 'h') {
    const h = new RemotePlayer('', new THREE.SpotLight(), new THREE.Object3D());
    h.showName = false;
    h.group.visible = true;
    h.applyLook({ ...DEFAULT_APPEARANCE.human, outfit: v });
    h.group.position.set(0, 0.1, 0);
    g.add(h.group);
    model = { dispose: () => h.dispose(), tick: (dt) => h.idle(dt) };
  }
  return { group: g, tick: (dt: number) => model?.tick(dt), dispose: () => model?.dispose() };
};
