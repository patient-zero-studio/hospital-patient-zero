import * as THREE from 'three';
import type { CollisionBox } from './MapBuilder';
import { buildPresentModel, buildTreatModel } from './SeasonalDecor';
import { SEASON_INFO, type Season } from '../seasons';
import { buildFrame, buildJukebox, buildWardrobe } from './RoomExtras';

/**
 * 🏚️ Your room 104, in the game: the room where every game starts gets the
 * decor you chose in Personnaliser (castle, Christmas, Halloween…) and shows
 * your collection: a glass cabinet with your rarest skins, your lamps lit on
 * top, and your trophies.
 *
 * Room 104 is x[-13,-7] z[-10,-4] (inner faces ±2.85 m around (-10, -7)),
 * walls 3.5 m high. The bed is at the north, the bedside table against the
 * west wall (under « NE COURS PAS »), the door in the east wall.
 */
export interface RoomShow {
  /** '' (just the collection), 'castle', 'noel', 'halloween', 'valentin', 'paques', 'poisson' */
  theme: string;
  /** colours of the lamps owned */
  lamps: number[];
  /** rarity colours of the rarest skins owned */
  rare: string[];
  /** gold cups */
  trophies: number;
  /** 🖼️ best moments on the walls */
  frames: { e: string; t: string }[];
  /** 🐾 pet ('' none): sleeps on the bed, then follows you (handled by the engine) */
  pet: string;
  /** 🚪 the outfit in the wardrobe ('h…' / 'm…', '' = no wardrobe) */
  wardrobe: string;
  /** 🏆 « plus belle chambre » contests won (a gold crown on the cabinet) */
  crowns: number;
}

const CX = -10;
const CZ = -7;
const HALF = 2.85;
const H = 3.5;

export const roomShowKey = (r: RoomShow | null) =>
  r ? `${r.theme}|${r.lamps.join(',')}|${r.rare.join(',')}|${r.trophies}|${r.frames.map((f) => f.t).join(',')}|${r.wardrobe}|${r.crowns}` : '';

export const buildRoomDecor = (show: RoomShow) => {
  const disposables: { dispose: () => void }[] = [];
  const t = <T extends { dispose: () => void }>(o: T) => {
    disposables.push(o);
    return o;
  };
  const root = new THREE.Group();
  root.position.set(CX, 0, CZ);
  const boxes: CollisionBox[] = [];
  const anim: ((s: number, dt: number) => void)[] = [];
  const mat = (color: number, o: THREE.MeshStandardMaterialParameters = {}) => t(new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...o }));
  const glow = (color: number) => t(new THREE.MeshBasicMaterial({ color }));
  const mesh = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = root) => {
    const o = new THREE.Mesh(t(geo), m);
    o.position.set(x, y, z);
    parent.add(o);
    return o;
  };
  const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = root) => mesh(new THREE.BoxGeometry(w, h, d), m, x, y, z, parent);
  const collide = (x: number, z: number, hx: number, hz: number, h: number) =>
    boxes.push({ min: new THREE.Vector3(CX + x - hx, 0, CZ + z - hz), max: new THREE.Vector3(CX + x + hx, h, CZ + z + hz) });
  const canvasTex = (w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    draw(c.getContext('2d')!);
    const tx = t(new THREE.CanvasTexture(c));
    tx.colorSpace = THREE.SRGBColorSpace;
    tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
    return tx;
  };
  const theme = show.theme;
  const castle = theme === 'castle';

  // ---------------------------------------------------------------------
  // 💎 The collection: a glass cabinet against the south wall
  // ---------------------------------------------------------------------
  const wood = mat(castle ? 0x4a2a12 : 0x3a3a3e, { metalness: castle ? 0 : 0.5, roughness: 0.5 });
  const cab = new THREE.Group();
  cab.position.set(-0.6, 0, HALF - 0.28);
  root.add(cab);
  box(1.6, 0.1, 0.5, wood, 0, 0.45, 0, cab);
  box(1.6, 0.08, 0.5, wood, 0, 2.05, 0, cab);
  for (const x of [-0.78, 0.78]) box(0.05, 1.6, 0.5, wood, x, 1.25, 0, cab);
  const glass = t(new THREE.MeshStandardMaterial({ color: 0xaaccdd, transparent: true, opacity: 0.14, roughness: 0.05, depthWrite: false }));
  box(1.55, 1.52, 0.02, glass, 0, 1.25, -0.24, cab);
  for (const y of [0.98, 1.5]) box(1.5, 0.02, 0.45, glass, 0, y, 0, cab);
  collide(-0.6, HALF - 0.28, 0.82, 0.27, 2.1);
  show.rare.slice(0, 12).forEach((col, i) => {
    const row = Math.floor(i / 4);
    const x = -0.57 + (i % 4) * 0.38;
    const y = 0.5 + row * 0.52;
    const c = new THREE.Color(col).getHex();
    box(0.15, 0.04, 0.15, mat(0x1a1a1a), x, y + 0.02, 0, cab);
    const m = mat(c, { emissive: c, emissiveIntensity: 1.1, metalness: 0.4, roughness: 0.3 });
    mesh(new THREE.CapsuleGeometry(0.045, 0.12, 4, 10), m, x, y + 0.15, 0, cab);
    mesh(new THREE.SphereGeometry(0.042, 10, 8), m, x, y + 0.28, 0, cab);
  });
  // the lamps you own, lit on top of the cabinet
  show.lamps.slice(0, 8).forEach((c, i) => {
    const x = -0.66 + i * 0.19;
    box(0.04, 0.1, 0.04, mat(0x222222), x, 2.15, 0, cab);
    mesh(new THREE.SphereGeometry(0.055, 10, 8), glow(c), x, 2.25, 0, cab);
  });
  // your trophies: gold cups on a little shelf next to it
  const gold = mat(0xffcc33, { metalness: 0.95, roughness: 0.25, emissive: 0x6a4a00, emissiveIntensity: 0.7 });
  const cups = Math.min(5, show.trophies);
  if (cups > 0) {
    box(0.8, 0.04, 0.3, wood, 0.75, 1.4, HALF - 0.15);
    for (let i = 0; i < cups; i++) {
      const g = new THREE.Group();
      g.position.set(0.47 + i * 0.14, 1.42, HALF - 0.15);
      root.add(g);
      box(0.07, 0.03, 0.07, gold, 0, 0.015, 0, g);
      mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.07, 6), gold, 0, 0.06, 0, g);
      mesh(new THREE.CylinderGeometry(0.05, 0.025, 0.08, 10), gold, 0, 0.13, 0, g);
    }
  }

  // 🏆 contest winner: a gold crown on top of the cabinet
  if (show.crowns > 0) {
    const crown = new THREE.Group();
    crown.position.set(-0.6, 2.12, HALF - 0.28);
    root.add(crown);
    mesh(new THREE.CylinderGeometry(0.16, 0.14, 0.12, 20, 1, true), t(new THREE.MeshStandardMaterial({ color: 0xffcc33, metalness: 0.95, roughness: 0.2, emissive: 0x6a4a00, emissiveIntensity: 0.8, side: THREE.DoubleSide })), 0, 0.06, 0, crown);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      mesh(new THREE.ConeGeometry(0.03, 0.08, 4), gold, Math.sin(a) * 0.15, 0.15, Math.cos(a) * 0.15, crown);
    }
    anim.push((s) => (crown.rotation.y = s * 0.5));
  }

  // 🖼️ your best moments, framed on the east wall (either side of the door) and the south wall
  const frameSpots: [number, number, number, number][] = [
    [HALF - 0.01, 1.8, -2.1, -Math.PI / 2],
    [HALF - 0.01, 1.8, -1.35, -Math.PI / 2],
    [HALF - 0.01, 1.8, 1.35, -Math.PI / 2],
    [HALF - 0.01, 1.8, 2.1, -Math.PI / 2],
    [1.75, 1.95, HALF - 0.01, Math.PI],
    [2.4, 1.95, HALF - 0.01, Math.PI],
  ];
  show.frames.slice(0, 6).forEach((f, i) => {
    const [x, y, z, ry] = frameSpots[i];
    const fr = buildFrame(f.e, f.t, t);
    fr.position.set(x, y, z);
    fr.rotation.y = ry;
    root.add(fr);
  });

  // 🎵 the jukebox in the south-east corner
  const juke = buildJukebox(t);
  juke.group.position.set(2.25, 0, 2.25);
  juke.group.rotation.y = Math.PI * 1.25;
  root.add(juke.group);
  anim.push((s, dt) => juke.tick(s, dt));
  collide(2.25, 2.25, 0.35, 0.35, 0.8);

  // 🚪 the wardrobe against the north wall, with your favourite outfit
  let wardrobe: ReturnType<typeof buildWardrobe> | null = null;
  if (show.wardrobe) {
    wardrobe = buildWardrobe(show.wardrobe, t);
    wardrobe.group.position.set(0.7, 0, -HALF + 0.31);
    root.add(wardrobe.group);
    const w = wardrobe;
    anim.push((_s, dt) => w.tick(dt));
    collide(0.7, -HALF + 0.31, 0.65, 0.32, 2.5);
  }

  // ---------------------------------------------------------------------
  // 🏰 Castle: stone over the walls and the floor, banners, a fireplace
  // ---------------------------------------------------------------------
  if (castle) {
    const stone = canvasTex(256, 256, (g) => {
      g.fillStyle = '#26221e';
      g.fillRect(0, 0, 256, 256);
      for (let r = 0; r < 6; r++)
        for (let x = (r % 2) * -32; x < 256; x += 64) {
          g.fillStyle = `hsl(30, 8%, ${24 + Math.random() * 12}%)`;
          g.fillRect(x + 2, r * 43 + 2, 60, 39);
        }
    });
    const flag = canvasTex(256, 256, (g) => {
      for (let y = 0; y < 8; y++)
        for (let x = 0; x < 8; x++) {
          g.fillStyle = `hsl(28, 10%, ${(x + y) % 2 ? 22 : 30 + Math.random() * 6}%)`;
          g.fillRect(x * 32, y * 32, 32, 32);
          g.strokeStyle = '#141210';
          g.lineWidth = 3;
          g.strokeRect(x * 32, y * 32, 32, 32);
        }
    });
    const wallM = mat(0xffffff, { map: stone, roughness: 0.95 });
    const plane = (w: number, h: number, x: number, y: number, z: number, ry: number, m: THREE.Material, rep: [number, number]) => {
      const geo = new THREE.PlaneGeometry(w, h);
      const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * rep[0], uv.getY(i) * rep[1]);
      const o = mesh(geo, m, x, y, z);
      o.rotation.y = ry;
      o.receiveShadow = true;
      return o;
    };
    // just in front of the walls, but behind the « NE COURS PAS » graffiti (2.84)
    const IN = HALF - 0.001;
    plane(5.7, H, -IN, H / 2, 0, Math.PI / 2, wallM, [2.5, 1.6]);
    plane(5.7, H, 0, H / 2, -IN, 0, wallM, [2.5, 1.6]);
    plane(5.7, H, 0, H / 2, IN, Math.PI, wallM, [2.5, 1.6]);
    // east wall: leave the door free
    plane(2.0, H, IN, H / 2, -1.85, -Math.PI / 2, wallM, [0.9, 1.6]);
    plane(2.0, H, IN, H / 2, 1.85, -Math.PI / 2, wallM, [0.9, 1.6]);
    plane(1.7, H - 2.3, IN, 2.3 + (H - 2.3) / 2, 0, -Math.PI / 2, wallM, [0.75, 0.5]);
    const fl = plane(5.7, 5.7, 0, 0.012, 0, 0, mat(0xffffff, { map: flag, roughness: 0.9 }), [3, 3]);
    fl.rotation.x = -Math.PI / 2;
    // banners on the west wall, either side of the old graffiti
    for (const [z, c, e] of [
      [-1.9, 0x9a0c18, '🦁'],
      [1.9, 0x1d3a8a, '🐉'],
    ] as const) {
      const tex = canvasTex(128, 256, (g) => {
        g.fillStyle = `#${c.toString(16).padStart(6, '0')}`;
        g.beginPath();
        g.moveTo(0, 0);
        g.lineTo(128, 0);
        g.lineTo(128, 256);
        g.lineTo(64, 216);
        g.lineTo(0, 256);
        g.fill();
        g.fillStyle = '#d4a840';
        g.fillRect(10, 18, 108, 6);
        g.font = '64px serif';
        g.textAlign = 'center';
        g.fillText(e, 64, 120);
      });
      const b = mesh(new THREE.PlaneGeometry(0.8, 1.6), t(new THREE.MeshStandardMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, roughness: 1 })), -HALF + 0.02, 2.2, z);
      b.rotation.y = Math.PI / 2;
    }
    // a fireplace in the south-west corner
    box(1.2, 1.1, 0.45, mat(0x4a443c), -2.1, 0.55, HALF - 0.22);
    box(0.8, 0.7, 0.05, glow(0x0a0604), -2.1, 0.4, HALF - 0.46);
    const fire = [0, 1, 2].map((i) => {
      const f = mesh(new THREE.ConeGeometry(0.1, 0.35, 6), glow(0xff7a1a), -2.3 + i * 0.2, 0.25, HALF - 0.4);
      return f;
    });
    anim.push((s) => fire.forEach((f, i) => (f.scale.y = 0.8 + Math.sin(s * 11 + i * 2) * 0.25)));
    collide(-2.1, HALF - 0.22, 0.62, 0.25, 1.1);
  }

  // ---------------------------------------------------------------------
  // 🎉 Event decors
  // ---------------------------------------------------------------------
  const season = theme as Season;
  if (theme && !castle && SEASON_INFO[season]) {
    const info = SEASON_INFO[season];
    // a garland of blinking bulbs along the walls, under the ceiling
    const bulbs = info.bulbs.map((c) => glow(new THREE.Color(c).getHex()));
    const bulbGeo = t(new THREE.SphereGeometry(0.045, 8, 6));
    const garland: THREE.Mesh[] = [];
    for (let i = 0; i < 46; i++) {
      // west wall then north wall
      const k = i / 45;
      const along = k * 11.4 - 5.7;
      const onWest = along < 0;
      const b = new THREE.Mesh(bulbGeo, bulbs[i % bulbs.length]);
      if (onWest) b.position.set(-HALF + 0.05, 3.2 - Math.abs(Math.sin(i * 0.9)) * 0.12, along + 2.85);
      else b.position.set(along - 2.85, 3.2 - Math.abs(Math.sin(i * 0.9)) * 0.12, -HALF + 0.05);
      root.add(b);
      garland.push(b);
    }
    anim.push((s) => garland.forEach((b, i) => (b.visible = Math.sin(s * 3 + i * 1.7) > -0.4)));
    // treats on the floor (sweets, eggs, hearts, fish…)
    const spots: [number, number][] = [
      [0.6, 1.4],
      [1.6, 0.9],
      [-0.4, 0.3],
      [1.9, -0.5],
      [0.9, -2.2],
      [-1.6, 1.6],
    ];
    const treats = spots.map(([x, z], i) => {
      const m = buildTreatModel(season, t);
      m.scale.setScalar(2);
      m.position.set(x, 0.16, z);
      m.rotation.y = i;
      root.add(m);
      return m;
    });
    anim.push((s) => treats.forEach((m, i) => (m.position.y = 0.16 + Math.sin(s * 1.5 + i) * 0.04)));

    if (theme === 'noel') {
      const tree = new THREE.Group();
      tree.position.set(-2.2, 0, 2.2);
      root.add(tree);
      const green = mat(0x1f5a2a, { roughness: 0.9 });
      [0.75, 0.6, 0.45].forEach((r, i) => mesh(new THREE.ConeGeometry(r, 0.8, 12), green, 0, 0.6 + i * 0.5, 0, tree));
      const star = mesh(new THREE.OctahedronGeometry(0.12), glow(0xffe060), 0, 1.85, 0, tree);
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
      collide(-2.2, 2.2, 0.6, 0.6, 2);
      for (let i = 0; i < 3; i++) {
        const p = buildPresentModel(t);
        p.scale.setScalar(1.4);
        p.position.set(-1.6 + i * 0.3, 0, 1.8 + (i % 2) * 0.3);
        p.rotation.y = i;
        root.add(p);
      }
      // a few snowflakes drifting in the room
      const snowM = glow(0xffffff);
      const snowG = t(new THREE.SphereGeometry(0.015, 5, 4));
      const flakes = Array.from({ length: 50 }, () => mesh(snowG, snowM, (Math.random() - 0.5) * 5.4, Math.random() * H, (Math.random() - 0.5) * 5.4));
      anim.push((_s, dt) =>
        flakes.forEach((f) => {
          f.position.y -= dt * 0.3;
          if (f.position.y < 0) f.position.y = H;
        })
      );
    } else if (theme === 'halloween') {
      const pumpkin = (x: number, y: number, z: number, k: number) => {
        const g = new THREE.Group();
        g.position.set(x, y, z);
        g.scale.setScalar(k);
        root.add(g);
        const body = mesh(new THREE.SphereGeometry(0.25, 14, 10), mat(0xff7a00, { emissive: 0x7a3000, emissiveIntensity: 0.8 }), 0, 0.2, 0, g);
        body.scale.y = 0.8;
        mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.1, 6), mat(0x3a5a1a), 0, 0.42, 0, g);
        const face = glow(0xffe060);
        for (const sx of [-0.08, 0.08]) mesh(new THREE.ConeGeometry(0.04, 0.06, 3), face, sx, 0.26, 0.23, g).rotation.x = Math.PI / 2;
        box(0.16, 0.03, 0.02, face, 0, 0.14, 0.235, g);
        return g;
      };
      pumpkin(-2.2, 0, 2.2, 1.4).rotation.y = Math.PI * 0.75;
      pumpkin(2.2, 0, 2.2, 1.1).rotation.y = -Math.PI * 0.75;
      pumpkin(1.9, 0, -0.9, 0.9).rotation.y = -Math.PI / 2;
      const webTex = canvasTex(128, 128, (g) => {
        g.strokeStyle = 'rgba(230,230,230,0.75)';
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
      const webM = t(new THREE.MeshBasicMaterial({ map: webTex, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
      for (const z of [-1, 1]) {
        const w = mesh(new THREE.PlaneGeometry(1.1, 1.1), webM, -HALF + 0.02, H - 0.55, z * (HALF - 0.55));
        w.rotation.set(0, Math.PI / 2, z > 0 ? Math.PI : -Math.PI / 2);
      }
      const batM = mat(0x0a0a0a, { side: THREE.DoubleSide });
      const bats = [0, 1, 2].map((i) => {
        const g = new THREE.Group();
        for (const sx of [-1, 1]) mesh(new THREE.PlaneGeometry(0.22, 0.1), batM, sx * 0.11, 0, 0, g);
        g.userData.ph = i * 2.1;
        root.add(g);
        return g;
      });
      anim.push((s) =>
        bats.forEach((b) => {
          const a = s * 0.7 + b.userData.ph;
          b.position.set(Math.cos(a) * 1.8, 2.9 + Math.sin(a * 2) * 0.15, Math.sin(a) * 1.8);
          b.rotation.y = -a;
          (b.children as THREE.Mesh[]).forEach((w, k) => (w.rotation.y = (k ? 1 : -1) * Math.sin(s * 18) * 0.7));
        })
      );
    } else if (theme === 'valentin') {
      const sh = new THREE.Shape();
      const r = 0.12;
      sh.moveTo(0, -r);
      sh.bezierCurveTo(r * 1.3, -r * 0.1, r * 1.1, r * 1.1, 0, r * 0.45);
      sh.bezierCurveTo(-r * 1.1, r * 1.1, -r * 1.3, -r * 0.1, 0, -r);
      const hg = t(new THREE.ExtrudeGeometry(sh, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 2 }));
      hg.center();
      const hm = mat(0xff2a6a, { emissive: 0x8a0020, emissiveIntensity: 0.7, roughness: 0.3 });
      const hearts = Array.from({ length: 10 }, (_, i) => {
        const h = new THREE.Mesh(hg, hm);
        h.position.set(-2.2 + (i % 5) * 1.1, 2.3 + (i % 3) * 0.3, -1.8 + Math.floor(i / 5) * 3.4);
        h.userData.ph = i;
        root.add(h);
        return h;
      });
      anim.push((s) =>
        hearts.forEach((h) => {
          h.position.y = 2.3 + ((h.userData.ph as number) % 3) * 0.3 + Math.sin(s * 1.2 + h.userData.ph) * 0.12;
          h.rotation.y = s + h.userData.ph;
        })
      );
      const petalM = mat(0xc8102e, { side: THREE.DoubleSide });
      const petalG = t(new THREE.CircleGeometry(0.05, 6));
      for (let i = 0; i < 45; i++) {
        const p = new THREE.Mesh(petalG, petalM);
        p.rotation.set(-Math.PI / 2, 0, Math.random() * 6);
        p.position.set((Math.random() - 0.5) * 5.2, 0.012, (Math.random() - 0.5) * 5.2);
        root.add(p);
      }
      for (const [x, z, c] of [
        [-0.4, -2.4, 0xff2a6a],
        [-2.2, -2.4, 0xffffff],
      ] as const) {
        const b = new THREE.Mesh(hg, mat(c, { roughness: 0.25 }));
        b.scale.setScalar(2.4);
        b.position.set(x, 2.3, z);
        root.add(b);
        mesh(new THREE.CylinderGeometry(0.004, 0.004, 1.4, 4), mat(0xdddddd), x, 1.5, z);
        anim.push((s) => (b.rotation.z = Math.sin(s + x) * 0.15));
      }
    } else if (theme === 'paques') {
      mesh(new THREE.CylinderGeometry(0.35, 0.25, 0.3, 14, 1, true), mat(0x9a6a32, { side: THREE.DoubleSide }), -2.2, 0.15, 2.2);
      for (let i = 0; i < 6; i++) {
        const e = buildTreatModel('paques', t);
        e.scale.setScalar(2);
        e.position.set(-2.2 + Math.cos(i) * 0.15, 0.32, 2.2 + Math.sin(i) * 0.15);
        root.add(e);
      }
      const tulipC = [0xf472b6, 0xfacc15, 0xa78bfa, 0xf87171];
      for (let i = 0; i < 8; i++) {
        const z = 1.0 + i * 0.22;
        mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.4, 5), mat(0x3a8a2a), HALF - 0.15, 0.2, z);
        mesh(new THREE.ConeGeometry(0.06, 0.12, 6), mat(tulipC[i % 4], { emissive: tulipC[i % 4], emissiveIntensity: 0.25 }), HALF - 0.15, 0.45, z).rotation.x = Math.PI;
      }
    } else if (theme === 'poisson') {
      // a fishbowl on the medical tray, paper fish on the walls, bubbles
      mesh(new THREE.SphereGeometry(0.22, 18, 14), t(new THREE.MeshStandardMaterial({ color: 0x88ccff, transparent: true, opacity: 0.25, roughness: 0.05, depthWrite: false })), 2.0, 0.95, -2.3);
      const fish = buildTreatModel('poisson', t);
      fish.scale.setScalar(1.2);
      root.add(fish);
      anim.push((s) => {
        fish.position.set(2.0 + Math.cos(s) * 0.09, 0.95, -2.3 + Math.sin(s) * 0.09);
        fish.rotation.y = -s;
      });
      for (let i = 0; i < 6; i++) {
        const f = buildTreatModel('poisson', t);
        f.scale.setScalar(3.5);
        const north = i < 3;
        f.position.set(-1.8 + (i % 3) * 1.5, 1.5 + (i % 2) * 0.5, north ? -HALF + 0.03 : HALF - 0.03);
        f.rotation.set(0, north ? 0 : Math.PI, (i - 2) * 0.4);
        root.add(f);
      }
      const bubM = t(new THREE.MeshStandardMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0.5, roughness: 0.05 }));
      const bubG = t(new THREE.SphereGeometry(0.03, 8, 6));
      const bubbles = Array.from({ length: 24 }, () => mesh(bubG, bubM, (Math.random() - 0.5) * 5, Math.random() * H, (Math.random() - 0.5) * 5));
      anim.push((_s, dt) =>
        bubbles.forEach((b) => {
          b.position.y += dt * 0.35;
          if (b.position.y > H) b.position.y = 0;
        })
      );
    }
  }

  // ---------------------------------------------------------------------
  // 💡 Plenty of light, only in this room (on when you're inside)
  // ---------------------------------------------------------------------
  const tint: Record<string, [number, number, number]> = {
    '': [0xfff1dc, 0xffe0b0, 0xd8f0ff],
    castle: [0xffb060, 0xff7a1a, 0xffd090],
    noel: [0xfff0d0, 0xff3a3a, 0x3aff6a],
    halloween: [0xffb060, 0xff7a00, 0xa060ff],
    valentin: [0xffd0e0, 0xff3a8a, 0xff80c0],
    paques: [0xfff8d0, 0xfde047, 0x86efac],
    poisson: [0xe0f8ff, 0x38bdf8, 0xfb923c],
  };
  const [cMain, cA, cB] = tint[theme] ?? tint[''];
  const lights: { l: THREE.PointLight; max: number }[] = [];
  const light = (c: number, max: number, x: number, y: number, z: number, dist: number) => {
    const l = new THREE.PointLight(c, 0, dist, 1.2);
    l.position.set(x, y, z);
    root.add(l);
    lights.push({ l, max });
  };
  light(cMain, 22, 0, 3.1, 0, 9);
  light(cA, 10, -1.9, 2.3, 1.9, 6);
  light(cB, 10, 1.9, 2.3, -1.7, 6);
  light(0xfff4e0, 7, -0.6, 2.4, HALF - 0.8, 4);
  let on = 0;

  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = false;
      o.receiveShadow = true;
    }
  });
  return {
    group: root,
    boxes,
    tick: (dt: number, player?: THREE.Vector3) => {
      const s = performance.now() * 0.001;
      anim.forEach((f) => f(s, dt));
      // the lights fade in when you're in the room, out when you leave it
      const inside = !!player && Math.abs(player.x - CX) < HALF + 0.3 && Math.abs(player.z - CZ) < HALF + 0.3;
      on = THREE.MathUtils.damp(on, inside ? 1 : 0, 3, dt);
      for (const { l, max } of lights) l.intensity = max * on;
    },
    dispose: () => {
      wardrobe?.dispose();
      disposables.forEach((d) => d.dispose());
    },
  };
};
