import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { Appearance } from '../appearance';
import { MonsterAI } from '../game/MonsterAI';
import { RemotePlayer } from '../game/RemotePlayer';
import { buildPresentModel, buildTreatModel } from '../game/SeasonalDecor';
import { SEASON_INFO, type Season } from '../seasons';

/** 🎨 Each event decor: neon light, sky light, sheet, blanket and rug colours */
const THEMES: Record<string, { neon: number; hemi: number; sheet: number; blanket: number; rug: number }> = {
  noel: { neon: 0xffe8c0, hemi: 0xa89a90, sheet: 0xb91c1c, blanket: 0x15803d, rug: 0xb91c1c },
  halloween: { neon: 0xa070ff, hemi: 0x6a5a80, sheet: 0x2a1440, blanket: 0xff7a00, rug: 0x3b0764 },
  valentin: { neon: 0xff9ac8, hemi: 0xb08a9a, sheet: 0xf9a8d4, blanket: 0xe11d48, rug: 0xbe185d },
  paques: { neon: 0xfff4c0, hemi: 0xb8b8a0, sheet: 0xfde68a, blanket: 0xa7f3d0, rug: 0x86efac },
  poisson: { neon: 0x9ae0ff, hemi: 0x90a8b8, sheet: 0x38bdf8, blanket: 0xfb923c, rug: 0x0ea5e9 },
};
const isSeason = (t: string): t is Season => t in SEASON_INFO;

/**
 * 🏚️ The secret room in 3D: room 104, where every game begins. The hospital
 * bed, the locker, the door with its number, the window… and in the middle,
 * the player and their creature, with everything they collected on display:
 * lamps lit on the shelf, trophies on the bedside table, the rarest skins in
 * a glass cabinet. A Sire's room turns into a castle chamber.
 */
interface Props {
  look: Appearance;
  /** lamp colours owned (lit on the shelf) */
  lamps: number[];
  /** the beam colour of the equipped lamp */
  lampColor: number;
  /** number of trophies (gold cups) */
  trophies: number;
  /** rarity colours of the showcased skins */
  rare: string[];
  /** decor: '' = room 104, 'castle', or an event ('noel', 'halloween'…) */
  theme: string;
}

/** a texture drawn on a canvas */
const canvasTex = (w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
};

export const Room104: React.FC<Props> = ({ look, lamps, lampColor, trophies, rare, theme }) => {
  const castle = theme === 'castle';
  const TH = THEMES[theme];
  const mount = useRef<HTMLDivElement>(null);
  const models = useRef<{ human: RemotePlayer; monster: MonsterAI; spot: THREE.SpotLight } | null>(null);

  useEffect(() => {
    const el = mount.current;
    if (!el) return;
    const disposables: { dispose: () => void }[] = [];
    const t = <T extends { dispose: () => void }>(o: T) => {
      disposables.push(o);
      return o;
    };
    const W = () => el.clientWidth || 600;
    const Hh = () => el.clientHeight || 380;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(W(), Hh());
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.shadowMap.enabled = true;
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050505);
    scene.fog = new THREE.Fog(0x050505, 9, 16);
    const camera = new THREE.PerspectiveCamera(48, W() / Hh(), 0.1, 40);

    const mat = (color: number, o: THREE.MeshStandardMaterialParameters = {}) => t(new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...o }));
    const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = scene) => {
      const o = new THREE.Mesh(t(new THREE.BoxGeometry(w, h, d)), m);
      o.position.set(x, y, z);
      o.castShadow = true;
      o.receiveShadow = true;
      parent.add(o);
      return o;
    };

    // ---- the room: 6 m wide, 5 m deep, 3 m high ----
    const RW = 6;
    const RD = 5;
    const RH = 3;
    const floorTex = canvasTex(256, 256, (g) => {
      // checkered hospital linoleum (or old flagstones in a castle)
      for (let y = 0; y < 8; y++)
        for (let x = 0; x < 8; x++) {
          g.fillStyle = castle ? ((x + y) % 2 ? '#4a443c' : '#3a352f') : (x + y) % 2 ? '#8a9a8c' : '#c8ccc0';
          g.fillRect(x * 32, y * 32, 32, 32);
          if (castle) {
            g.strokeStyle = '#1e1b18';
            g.lineWidth = 3;
            g.strokeRect(x * 32, y * 32, 32, 32);
          }
        }
      // dirt and a dark stain
      g.fillStyle = 'rgba(40,20,10,0.35)';
      g.beginPath();
      g.ellipse(180, 90, 40, 22, 0.4, 0, Math.PI * 2);
      g.fill();
    });
    floorTex.repeat.set(3, 2.5);
    const floor = new THREE.Mesh(t(new THREE.PlaneGeometry(RW, RD)), mat(0xffffff, { map: floorTex }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    const wallTex = canvasTex(256, 256, (g) => {
      if (castle) {
        g.fillStyle = '#2e2a25';
        g.fillRect(0, 0, 256, 256);
        for (let r = 0; r < 6; r++)
          for (let x = (r % 2) * -32; x < 256; x += 64) {
            g.fillStyle = `hsl(30, 8%, ${26 + Math.random() * 10}%)`;
            g.fillRect(x + 2, r * 43 + 2, 60, 39);
          }
        return;
      }
      // pale green tiles at the bottom, peeling paint above
      g.fillStyle = '#b8c4ae';
      g.fillRect(0, 0, 256, 256);
      g.fillStyle = '#8fa894';
      g.fillRect(0, 150, 256, 106);
      g.strokeStyle = '#6a8270';
      for (let x = 0; x < 256; x += 32) g.strokeRect(x, 150, 32, 26);
      for (let x = 0; x < 256; x += 32) g.strokeRect(x, 176, 32, 26);
      for (let x = 0; x < 256; x += 32) g.strokeRect(x, 202, 32, 26);
      for (let x = 0; x < 256; x += 32) g.strokeRect(x, 228, 32, 28);
      for (let i = 0; i < 18; i++) {
        g.fillStyle = `rgba(60,50,30,${0.08 + Math.random() * 0.12})`;
        g.fillRect(Math.random() * 256, Math.random() * 140, 4 + Math.random() * 30, 2 + Math.random() * 12);
      }
    });
    wallTex.repeat.set(2, 1);
    const wallM = mat(0xffffff, { map: wallTex });
    const back = new THREE.Mesh(t(new THREE.PlaneGeometry(RW, RH)), wallM);
    back.position.set(0, RH / 2, -RD / 2);
    back.receiveShadow = true;
    scene.add(back);
    for (const s of [-1, 1]) {
      const side = new THREE.Mesh(t(new THREE.PlaneGeometry(RD, RH)), wallM);
      side.position.set((s * RW) / 2, RH / 2, 0);
      side.rotation.y = (-s * Math.PI) / 2;
      side.receiveShadow = true;
      scene.add(side);
    }
    const ceil = new THREE.Mesh(t(new THREE.PlaneGeometry(RW, RD)), mat(castle ? 0x1e1b18 : 0xa8aca0));
    ceil.rotation.x = Math.PI / 2;
    ceil.position.y = RH;
    scene.add(ceil);

    // ---- the door with its number, on the back wall (right) ----
    const doorM = mat(castle ? 0x4a3020 : 0x6a7a72);
    box(1.0, 2.1, 0.08, doorM, 1.7, 1.05, -RD / 2 + 0.04);
    box(0.05, 0.05, 0.12, mat(0xc8ccd0, { metalness: 0.9, roughness: 0.3 }), 1.3, 1.0, -RD / 2 + 0.1);
    const sign = canvasTex(128, 64, (g) => {
      g.fillStyle = castle ? '#d4a840' : '#e8e4da';
      g.fillRect(0, 0, 128, 64);
      g.fillStyle = '#1a1a1a';
      g.font = 'bold 40px Arial';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('104', 64, 34);
    });
    const plate = new THREE.Mesh(t(new THREE.PlaneGeometry(0.4, 0.2)), t(new THREE.MeshBasicMaterial({ map: sign })));
    plate.position.set(1.7, 2.35, -RD / 2 + 0.02);
    scene.add(plate);

    // ---- the window with its blinds (left of the back wall), moonlight ----
    box(1.3, 1.1, 0.04, t(new THREE.MeshBasicMaterial({ color: 0x0a1428 })), -1.6, 1.75, -RD / 2 + 0.02);
    for (let i = 0; i < 9; i++) box(1.3, 0.04, 0.03, mat(0xd8d4c8), -1.6, 1.25 + i * 0.12, -RD / 2 + 0.07).rotation.x = 0.5;
    const moon = new THREE.SpotLight(0x8aa8ff, 25, 9, Math.PI / 6, 0.6, 1.5);
    moon.position.set(-1.6, 2, -RD / 2 + 0.3);
    moon.target.position.set(-0.6, 0, 0.5);
    scene.add(moon, moon.target);

    // ---- the hospital bed (left), bedside table with the trophies ----
    const bedM = mat(castle ? 0x5a3418 : 0xd0d4d8, { metalness: castle ? 0 : 0.6, roughness: 0.4 });
    const bed = new THREE.Group();
    bed.position.set(-2.1, 0, -0.6);
    scene.add(bed);
    box(1.0, 0.08, 2.0, bedM, 0, 0.55, 0, bed);
    box(0.95, 0.18, 1.9, mat(TH?.sheet ?? (castle ? 0x6a1018 : 0xe8e8e0)), 0, 0.68, 0, bed);
    box(0.6, 0.12, 0.35, mat(0xf4f4f0), 0, 0.83, -0.7, bed);
    box(0.97, 0.06, 1.2, mat(TH?.blanket ?? (castle ? 0x8a1a1a : 0x7aa0c8)), 0, 0.79, 0.3, bed);
    box(1.0, 0.7, 0.05, bedM, 0, 0.75, -1.0, bed);
    for (const x of [-0.45, 0.45]) for (const z of [-0.95, 0.95]) box(0.05, 0.55, 0.05, bedM, x, 0.27, z, bed);
    // bedside table
    const tableTop = 0.72;
    box(0.55, tableTop, 0.45, mat(castle ? 0x4a2a12 : 0x9aa49a), -2.1, tableTop / 2, -1.95);
    const gold = mat(0xffcc33, { metalness: 0.95, roughness: 0.25, emissive: 0x4a3000, emissiveIntensity: 0.6 });
    const cups = Math.min(5, trophies);
    for (let i = 0; i < cups; i++) {
      const cup = new THREE.Group();
      cup.position.set(-2.3 + (i % 3) * 0.2, tableTop, -1.95 + Math.floor(i / 3) * 0.18);
      scene.add(cup);
      box(0.08, 0.03, 0.08, gold, 0, 0.015, 0, cup);
      const stem = new THREE.Mesh(t(new THREE.CylinderGeometry(0.015, 0.015, 0.08, 8)), gold);
      stem.position.y = 0.07;
      cup.add(stem);
      const bowl = new THREE.Mesh(t(new THREE.CylinderGeometry(0.06, 0.03, 0.09, 12)), gold);
      bowl.position.y = 0.15;
      cup.add(bowl);
    }
    if (!cups) {
      // just the level star
      const star = new THREE.Mesh(t(new THREE.OctahedronGeometry(0.08)), gold);
      star.position.set(-2.1, tableTop + 0.12, -1.95);
      scene.add(star);
    }

    // ---- the locker (right) and the lamp shelf above it ----
    const lockerM = mat(castle ? 0x3a2a1a : 0x5a6a7a, { metalness: castle ? 0 : 0.5, roughness: 0.5 });
    box(0.7, 1.9, 0.5, lockerM, 2.55, 0.95, -0.2);
    // air vents on the locker door
    for (let i = 0; i < 4; i++) box(0.01, 0.02, 0.3, mat(0x222222), 2.19, 1.5 + i * 0.05, -0.2);
    const shelfY = 2.15;
    box(0.35, 0.04, 2.2, mat(castle ? 0x4a2a12 : 0x8a7a6a), RW / 2 - 0.18, shelfY, 0.2);
    lamps.slice(0, 10).forEach((c, i) => {
      const z = -0.75 + i * 0.21;
      box(0.05, 0.12, 0.05, mat(0x333333), RW / 2 - 0.2, shelfY + 0.08, z);
      const bulb = new THREE.Mesh(t(new THREE.SphereGeometry(0.065, 12, 10)), t(new THREE.MeshBasicMaterial({ color: c })));
      bulb.position.set(RW / 2 - 0.2, shelfY + 0.2, z);
      scene.add(bulb);
    });
    if (lamps.length) {
      // one real light for the whole row (cheap): the colour of the first lamp
      const pl = new THREE.PointLight(lamps[0], 2.5, 3, 1.6);
      pl.position.set(RW / 2 - 0.5, shelfY + 0.3, 0.2);
      scene.add(pl);
    }

    // ---- the glass cabinet with the rarest skins (back wall, middle) ----
    const cab = new THREE.Group();
    cab.position.set(-0.1, 0, -RD / 2 + 0.35);
    scene.add(cab);
    box(1.5, 0.08, 0.5, mat(castle ? 0x4a2a12 : 0x3a3a3e), 0, 0.5, 0, cab);
    box(1.5, 0.08, 0.5, mat(castle ? 0x4a2a12 : 0x3a3a3e), 0, 2.0, 0, cab);
    const glass = t(new THREE.MeshStandardMaterial({ color: 0xaaccdd, transparent: true, opacity: 0.12, roughness: 0.05, metalness: 0.1 }));
    box(1.5, 1.42, 0.02, glass, 0, 1.25, 0.24, cab);
    for (const y of [0.98, 1.48]) box(1.45, 0.02, 0.45, glass, 0, y, 0, cab);
    rare.slice(0, 12).forEach((col, i) => {
      // each skin: a little glowing figurine on a plinth, in its rarity colour
      const row = Math.floor(i / 4);
      const x = -0.54 + (i % 4) * 0.36;
      const y = 0.54 + row * 0.5;
      const c = new THREE.Color(col).getHex();
      box(0.14, 0.04, 0.14, mat(0x222222), x, y + 0.02, 0, cab);
      const fig = new THREE.Mesh(t(new THREE.CapsuleGeometry(0.045, 0.12, 4, 10)), mat(c, { emissive: c, emissiveIntensity: 0.9, metalness: 0.4, roughness: 0.3 }));
      fig.position.set(x, y + 0.14, 0);
      cab.add(fig);
      const head = new THREE.Mesh(t(new THREE.SphereGeometry(0.04, 10, 8)), fig.material as THREE.Material);
      head.position.set(x, y + 0.27, 0);
      cab.add(head);
    });
    const cabLight = new THREE.PointLight(0xffe8c0, 2, 2.2, 1.5);
    cabLight.position.set(-0.1, 1.85, -RD / 2 + 0.5);
    scene.add(cabLight);

    // ---- castle: banners and a fireplace glow ----
    if (castle) {
      for (const [x, c] of [
        [-2.9, 0x9a0c18],
        [2.9, 0x1d3a8a],
      ] as const) {
        const b = new THREE.Mesh(t(new THREE.PlaneGeometry(0.6, 1.6)), mat(c, { side: THREE.DoubleSide, roughness: 1 }));
        b.position.set(x * 0.98, 1.9, -1.4);
        b.rotation.y = x < 0 ? Math.PI / 2 : -Math.PI / 2;
        scene.add(b);
      }
      const fire = new THREE.PointLight(0xff7a1a, 6, 6, 1.4);
      fire.position.set(0, 0.6, 1.2);
      scene.add(fire);
    }

    // ---- 🎉 event decors ----
    const anim: ((s: number, dt: number) => void)[] = [];
    if (isSeason(theme) && theme !== 'chevaliers') {
      const info = SEASON_INFO[theme];
      // a garland of blinking bulbs along the walls
      const bulbs = info.bulbs.map((c) => t(new THREE.MeshBasicMaterial({ color: new THREE.Color(c) })));
      const bulbGeo = t(new THREE.SphereGeometry(0.045, 8, 6));
      const garland: THREE.Mesh[] = [];
      for (let i = 0; i < 26; i++) {
        const x = -2.9 + i * 0.232;
        const b = new THREE.Mesh(bulbGeo, bulbs[i % bulbs.length]);
        b.position.set(x, 2.72 - Math.abs(Math.sin(i * 0.9)) * 0.12, -RD / 2 + 0.05);
        scene.add(b);
        garland.push(b);
      }
      anim.push((s) => garland.forEach((b, i) => (b.visible = Math.sin(s * 3 + i * 1.7) > -0.4)));
      // treats (sweets, eggs, hearts, fish…) here and there
      const spots: [number, number][] = [
        [-1.2, 1.5],
        [1.0, 1.6],
        [-0.7, -1.5],
        [2.1, 1.2],
        [-2.6, 0.9],
        [0.7, -0.5],
        [-1.6, 0.3],
        [1.7, 0.4],
      ];
      const treats = spots.map(([x, z], i) => {
        const m = buildTreatModel(theme, t);
        m.scale.setScalar(2.2);
        m.position.set(x, 0.18, z);
        m.rotation.y = i;
        scene.add(m);
        return m;
      });
      anim.push((s) => treats.forEach((m, i) => (m.position.y = 0.18 + Math.sin(s * 1.5 + i) * 0.04)));

      if (theme === 'noel') {
        // a Christmas tree in the corner, presents underneath, snow behind the window
        const tree = new THREE.Group();
        tree.position.set(-2.45, 0, 1.7);
        scene.add(tree);
        const green = mat(0x1f5a2a, { roughness: 0.9 });
        [0.75, 0.6, 0.45].forEach((r, i) => {
          const c = new THREE.Mesh(t(new THREE.ConeGeometry(r, 0.8, 12)), green);
          c.position.y = 0.6 + i * 0.5;
          tree.add(c);
        });
        const star = new THREE.Mesh(t(new THREE.OctahedronGeometry(0.12)), t(new THREE.MeshBasicMaterial({ color: 0xffe060 })));
        star.position.y = 1.85;
        tree.add(star);
        const tb: THREE.Mesh[] = [];
        for (let i = 0; i < 18; i++) {
          const lvl = i % 3;
          const a = i * 2.1;
          const r = [0.62, 0.48, 0.34][lvl];
          const b = new THREE.Mesh(bulbGeo, bulbs[i % bulbs.length]);
          b.position.set(Math.cos(a) * r, 0.4 + lvl * 0.5, Math.sin(a) * r);
          tree.add(b);
          tb.push(b);
        }
        anim.push((s) => {
          star.rotation.y = s;
          tb.forEach((b, i) => (b.visible = Math.sin(s * 2 + i) > -0.5));
        });
        for (let i = 0; i < 3; i++) {
          const p = buildPresentModel(t);
          p.scale.setScalar(1.4);
          p.position.set(-2.1 + i * 0.35, 0, 1.2 + (i % 2) * 0.3);
          p.rotation.y = i;
          scene.add(p);
        }
        const flakes: THREE.Mesh[] = [];
        const snowM = t(new THREE.MeshBasicMaterial({ color: 0xffffff }));
        const snowG = t(new THREE.SphereGeometry(0.02, 6, 4));
        for (let i = 0; i < 40; i++) {
          const f = new THREE.Mesh(snowG, snowM);
          f.position.set(-2.2 + Math.random() * 1.2, 1.2 + Math.random() * 1.1, -RD / 2 + 0.03);
          scene.add(f);
          flakes.push(f);
        }
        anim.push((_s, dt) =>
          flakes.forEach((f) => {
            f.position.y -= dt * 0.25;
            if (f.position.y < 1.22) f.position.y = 2.28;
          })
        );
      } else if (theme === 'halloween') {
        // glowing pumpkins, candles, cobwebs and bats under the ceiling
        const pumpkin = (x: number, y: number, z: number, k: number) => {
          const g = new THREE.Group();
          g.position.set(x, y, z);
          g.scale.setScalar(k);
          scene.add(g);
          const body = new THREE.Mesh(t(new THREE.SphereGeometry(0.25, 14, 10)), mat(0xff7a00, { emissive: 0x6a2a00, emissiveIntensity: 0.6 }));
          body.scale.y = 0.8;
          body.position.y = 0.2;
          g.add(body);
          const stem = new THREE.Mesh(t(new THREE.CylinderGeometry(0.03, 0.04, 0.1, 6)), mat(0x3a5a1a));
          stem.position.y = 0.42;
          g.add(stem);
          const face = t(new THREE.MeshBasicMaterial({ color: 0xffe060 }));
          for (const sx of [-0.08, 0.08]) {
            const eye = new THREE.Mesh(t(new THREE.ConeGeometry(0.04, 0.06, 3)), face);
            eye.position.set(sx, 0.26, 0.23);
            eye.rotation.x = Math.PI / 2;
            g.add(eye);
          }
          const mouth = new THREE.Mesh(t(new THREE.BoxGeometry(0.16, 0.03, 0.02)), face);
          mouth.position.set(0, 0.14, 0.235);
          g.add(mouth);
        };
        pumpkin(-2.5, 0, 1.5, 1.4);
        pumpkin(2.4, 0, 1.5, 1.1);
        pumpkin(-2.3, 0.72, -1.95, 0.6);
        const glow = new THREE.PointLight(0xff8a20, 4, 4, 1.5);
        glow.position.set(-2.3, 0.6, 1.3);
        scene.add(glow);
        anim.push((s) => (glow.intensity = 3.5 + Math.sin(s * 9) * 0.6 + Math.sin(s * 23) * 0.4));
        const webTex = canvasTex(128, 128, (g) => {
          g.strokeStyle = 'rgba(230,230,230,0.7)';
          g.lineWidth = 1.5;
          for (let a = 0; a < 6; a++) {
            g.beginPath();
            g.moveTo(0, 0);
            g.lineTo(Math.cos((a * Math.PI) / 10) * 128, Math.sin((a * Math.PI) / 10) * 128);
            g.stroke();
          }
          for (let r = 20; r < 128; r += 20) {
            g.beginPath();
            g.arc(0, 0, r, 0, Math.PI / 2);
            g.stroke();
          }
        });
        for (const sx of [-1, 1]) {
          const web = new THREE.Mesh(t(new THREE.PlaneGeometry(1, 1)), t(new THREE.MeshBasicMaterial({ map: webTex, transparent: true, depthWrite: false })));
          web.position.set(sx * 2.5, RH - 0.5, -RD / 2 + 0.02);
          web.scale.x = -sx;
          web.rotation.z = Math.PI;
          scene.add(web);
        }
        const batM = mat(0x0a0a0a, { side: THREE.DoubleSide });
        const bats = [0, 1, 2].map((i) => {
          const g = new THREE.Group();
          for (const sx of [-1, 1]) {
            const w = new THREE.Mesh(t(new THREE.PlaneGeometry(0.22, 0.1)), batM);
            w.position.x = sx * 0.11;
            g.add(w);
          }
          g.userData.ph = i * 2.1;
          scene.add(g);
          return g;
        });
        anim.push((s) =>
          bats.forEach((b) => {
            const a = s * 0.7 + b.userData.ph;
            b.position.set(Math.cos(a) * 1.8, 2.5 + Math.sin(a * 2) * 0.15, Math.sin(a) * 1.2 - 0.3);
            b.rotation.y = -a;
            (b.children as THREE.Mesh[]).forEach((w, k) => (w.rotation.y = (k ? 1 : -1) * Math.sin(s * 18) * 0.7));
          })
        );
      } else if (theme === 'valentin') {
        // floating hearts and rose petals
        const sh = new THREE.Shape();
        const r = 0.12;
        sh.moveTo(0, -r);
        sh.bezierCurveTo(r * 1.3, -r * 0.1, r * 1.1, r * 1.1, 0, r * 0.45);
        sh.bezierCurveTo(-r * 1.1, r * 1.1, -r * 1.3, -r * 0.1, 0, -r);
        const hg = t(new THREE.ExtrudeGeometry(sh, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 2 }));
        hg.center();
        const hm = mat(0xff2a6a, { emissive: 0x8a0020, emissiveIntensity: 0.6, roughness: 0.3 });
        const hearts = Array.from({ length: 10 }, (_, i) => {
          const h = new THREE.Mesh(hg, hm);
          h.position.set(-2.4 + (i % 5) * 1.2, 1.9 + (i % 3) * 0.25, -1.6 + Math.floor(i / 5) * 2.4);
          h.userData.ph = i;
          scene.add(h);
          return h;
        });
        anim.push((s) =>
          hearts.forEach((h) => {
            h.position.y += Math.sin(s * 1.2 + h.userData.ph) * 0.002;
            h.rotation.y = s + h.userData.ph;
          })
        );
        const petalM = mat(0xc8102e, { side: THREE.DoubleSide });
        const petalG = t(new THREE.CircleGeometry(0.05, 6));
        for (let i = 0; i < 40; i++) {
          const p = new THREE.Mesh(petalG, petalM);
          p.rotation.set(-Math.PI / 2, 0, Math.random() * 6);
          p.position.set((Math.random() - 0.5) * 5, 0.01, (Math.random() - 0.3) * 3.5);
          scene.add(p);
        }
        // two heart balloons tied to the bed
        for (const [x, z, c] of [
          [-1.55, -1.5, 0xff2a6a],
          [-1.5, 0.3, 0xffffff],
        ] as const) {
          const b = new THREE.Mesh(hg, mat(c, { roughness: 0.25 }));
          b.scale.setScalar(2.2);
          b.position.set(x, 2.1, z);
          scene.add(b);
          const str = new THREE.Mesh(t(new THREE.CylinderGeometry(0.004, 0.004, 1.3, 4)), mat(0xdddddd));
          str.position.set(x, 1.35, z);
          scene.add(str);
          anim.push((s) => (b.rotation.z = Math.sin(s + x) * 0.15));
        }
      } else if (theme === 'paques') {
        // a basket of eggs and tulips along the wall
        const basket = new THREE.Mesh(t(new THREE.CylinderGeometry(0.35, 0.25, 0.3, 14, 1, true)), mat(0x9a6a32, { side: THREE.DoubleSide }));
        basket.position.set(-2.45, 0.15, 1.6);
        scene.add(basket);
        for (let i = 0; i < 6; i++) {
          const e = buildTreatModel('paques', t);
          e.scale.setScalar(2);
          e.position.set(-2.45 + Math.cos(i) * 0.15, 0.32, 1.6 + Math.sin(i) * 0.15);
          scene.add(e);
        }
        const tulipC = [0xf472b6, 0xfacc15, 0xa78bfa, 0xf87171];
        for (let i = 0; i < 10; i++) {
          const x = -2.7 + i * 0.6;
          const stem = new THREE.Mesh(t(new THREE.CylinderGeometry(0.012, 0.012, 0.4, 5)), mat(0x3a8a2a));
          stem.position.set(x, 0.2, -RD / 2 + 0.15);
          scene.add(stem);
          const fl = new THREE.Mesh(t(new THREE.ConeGeometry(0.06, 0.12, 6)), mat(tulipC[i % 4], { emissive: tulipC[i % 4], emissiveIntensity: 0.2 }));
          fl.position.set(x, 0.45, -RD / 2 + 0.15);
          fl.rotation.x = Math.PI;
          scene.add(fl);
        }
      } else if (theme === 'poisson') {
        // a fishbowl on the bedside table, paper fish on the walls, bubbles
        const bowl = new THREE.Mesh(t(new THREE.SphereGeometry(0.25, 18, 14)), t(new THREE.MeshStandardMaterial({ color: 0x88ccff, transparent: true, opacity: 0.25, roughness: 0.05 })));
        bowl.position.set(-2.1, 0.97, -1.95);
        scene.add(bowl);
        const fish = buildTreatModel('poisson', t);
        fish.scale.setScalar(1.3);
        scene.add(fish);
        anim.push((s) => {
          fish.position.set(-2.1 + Math.cos(s) * 0.1, 0.97, -1.95 + Math.sin(s) * 0.1);
          fish.rotation.y = -s;
        });
        for (let i = 0; i < 6; i++) {
          const f = buildTreatModel('poisson', t);
          f.scale.setScalar(3.5);
          const left = i < 3;
          f.position.set(left ? -2.97 : 2.97, 1.3 + (i % 3) * 0.45, -1.6 + (i % 3) * 1.1);
          f.rotation.set(0, left ? Math.PI / 2 : -Math.PI / 2, (i - 2) * 0.4);
          scene.add(f);
        }
        const bubM = t(new THREE.MeshStandardMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0.5, roughness: 0.05 }));
        const bubG = t(new THREE.SphereGeometry(0.03, 8, 6));
        const bubbles = Array.from({ length: 24 }, () => {
          const b = new THREE.Mesh(bubG, bubM);
          b.position.set((Math.random() - 0.5) * 5, Math.random() * RH, (Math.random() - 0.5) * 3);
          scene.add(b);
          return b;
        });
        anim.push((_s, dt) =>
          bubbles.forEach((b) => {
            b.position.y += dt * 0.35;
            if (b.position.y > RH) b.position.y = 0;
          })
        );
      }
    }

    // ---- light: a flickering neon tube, and your lamp's spotlight on you ----
    scene.add(new THREE.HemisphereLight(TH?.hemi ?? (castle ? 0x8a6a4a : 0x9aa8a0), 0x141210, 1.1));
    const neon = new THREE.PointLight(TH?.neon ?? (castle ? 0xffa050 : 0xe8fff0), 7, 9, 1.4);
    neon.position.set(0, RH - 0.25, 0);
    scene.add(neon);
    box(1.2, 0.05, 0.12, t(new THREE.MeshBasicMaterial({ color: TH?.neon ?? (castle ? 0xffb060 : 0xf0fff4) })), 0, RH - 0.03, 0);
    const spot = new THREE.SpotLight(lampColor, 40, 8, Math.PI / 7, 0.5, 1.5);
    spot.position.set(0.6, RH - 0.2, 2.2);
    spot.target.position.set(0, 0.9, 0.3);
    spot.castShadow = true;
    scene.add(spot, spot.target);

    // ---- you and your creature ----
    const rug = new THREE.Mesh(t(new THREE.CircleGeometry(0.75, 32)), mat(TH?.rug ?? (castle ? 0x6a1018 : 0x7a1414), { roughness: 1 }));
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(0, 0.005, 0.4);
    scene.add(rug);
    const human = new RemotePlayer('', new THREE.SpotLight(), new THREE.Object3D());
    human.showName = false;
    human.group.visible = true;
    human.group.position.set(0, 0, 0.4);
    scene.add(human.group);
    const monster = new MonsterAI(new THREE.Vector3(), new Map(), [], new Map(), () => {});
    monster.mesh.position.set(1.2, 0, -1.3);
    monster.mesh.rotation.y = -0.5;
    scene.add(monster.mesh);
    models.current = { human, monster, spot };

    let raf = 0;
    let last = performance.now();
    let flick = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const s = now * 0.001;
      human.idle(dt);
      human.group.rotation.y = Math.sin(s * 0.4) * 0.5;
      monster.tickFx(dt);
      anim.forEach((f) => f(s, dt));
      // the neon tube flickers now and then
      flick -= dt;
      if (flick <= 0) {
        flick = Math.random() < 0.15 ? 0.06 : 0.8 + Math.random() * 3;
        neon.intensity = flick < 0.1 ? 0.5 : 7;
      }
      // the camera drifts slowly, like a visitor looking around
      camera.position.set(Math.sin(s * 0.15) * 1.3, 1.6, 3.9);
      camera.lookAt(0, 1.05, -0.4);
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(loop);
    const onResize = () => {
      renderer.setSize(W(), Hh());
      camera.aspect = W() / Hh();
      camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      human.dispose();
      monster.dispose();
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
      renderer.domElement.remove();
      models.current = null;
    };
    // the room is rebuilt when what's on display changes
  }, [lamps.join(','), trophies, rare.join(','), theme]);

  useEffect(() => {
    models.current?.human.applyLook(look.human);
    models.current?.monster.applyLook(look.monster);
    models.current?.spot.color.setHex(lampColor);
  }, [look, lampColor, lamps.join(','), trophies, rare.join(','), theme]);

  return <div ref={mount} className="w-full h-[300px] sm:h-[400px] border-4 border-black" />;
};
