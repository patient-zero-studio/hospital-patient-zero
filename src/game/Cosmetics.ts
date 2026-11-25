import * as THREE from 'three';

/**
 * Shop cosmetics: 3D accessories and outfits for the human and the creature.
 * Accessories are built in the head's local space of each model.
 */

type Track = <T extends { dispose: () => void }>(o: T) => T;

const add = (track: Track, parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) => {
  const m = new THREE.Mesh(track(geo), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
};
const std = (track: Track, color: number, opts: THREE.MeshStandardMaterialParameters = {}) =>
  track(new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...opts }));

// ---------------------------------------------------------------------------
// Human (head centre ≈ (0, 0.125, 0), radius ≈ 0.085 × 0.115 × 0.105)
// ---------------------------------------------------------------------------
export interface HumanOutfit {
  gown?: string;
  hair?: string;
  accs: string[];
  /** extra material tweaks */
  gownFx?: 'gold' | 'neon' | 'white' | 'ghost';
  hairFx?: 'neon';
  extras?: ('stethoscope' | 'mohawk' | 'stripes' | 'belt' | 'xmasbands' | 'cape' | 'wings' | 'medal' | 'armor' | 'blackarmor')[];
  /** animated effect that comes with the outfit (unless you wear another one) */
  fx?: string;
}

export const HUMAN_OUTFITS: Record<string, HumanOutfit> = {
  surgeon: { gown: '#4f8a6a', accs: ['surgcap', 'mask'] },
  doctor: { gown: '#f2f2ec', accs: ['glasses'], gownFx: 'white', extras: ['stethoscope'] },
  prisoner: { gown: '#e8741a', accs: ['beanie'], extras: ['stripes'] },
  punk: { gown: '#1a1a1e', hair: '#ff3aa8', accs: [], extras: ['mohawk'] },
  gold: { gown: '#d4a840', hair: '#e8c860', accs: ['shades', 'crown'], gownFx: 'gold', extras: ['cape', 'medal'], fx: 'halo' },
  neon: { gown: '#0a1a20', hair: '#ff3ad8', accs: ['headphones', 'shades'], gownFx: 'neon', hairFx: 'neon', fx: 'sparks' },
  // 🎄 Noël
  santa: { gown: '#c8102e', hair: '#f4f4f4', accs: ['santahat', 'beard'], extras: ['belt', 'cape'], fx: 'stars' },
  elf: { gown: '#15803d', accs: ['elfhat'], extras: ['belt'] },
  sweater: { gown: '#b91c1c', accs: [], extras: ['xmasbands'] },
  fouettard: { gown: '#1a120c', hair: '#0a0a0a', accs: ['hood', 'bellcollar'], extras: ['belt', 'cape'], fx: 'smoke' },
  // 🎃 Halloween
  witch: { gown: '#1e1430', hair: '#7c3aed', accs: ['witchhat'] },
  vampire: { gown: '#0c0c0e', hair: '#0a0a0a', accs: ['fangs'], extras: ['cape'] },
  reaper: { gown: '#08080a', hair: '#08080a', accs: ['hood'], gownFx: 'ghost', extras: ['cape'], fx: 'smoke' },
  // 🐰 Pâques
  bunny: { gown: '#f4f4f0', hair: '#f4f4f0', accs: ['bunnyears'] },
  // 💘 Saint-Valentin
  cupid: { gown: '#fff1f5', hair: '#f5d36a', accs: ['heartshades'], gownFx: 'white', extras: ['wings'] },
  // 🐟 Poisson d'avril
  clown: { gown: '#facc15', hair: '#f97316', accs: ['clownnose', 'fishhat'], extras: ['xmasbands'] },
  // 🏆 Pass de saison / ⭐ niveaux
  hazmat: { gown: '#f5c400', hair: '#1d1d22', accs: ['gasmask'], extras: ['belt'] , fx: 'sparks' },
  moreauh: { gown: '#ecebe6', hair: '#b8b8b8', accs: ['glasses'], gownFx: 'white', extras: ['stethoscope'] , fx: 'aura' },
  lucas: { gown: '#8fb0de', hair: '#4a2e1a', accs: [], extras: ['stripes'] , fx: 'stars' },
  // 🤠 Nouvelles tenues
  cowboy: { gown: '#8a5a2b', hair: '#4a2e1a', accs: ['cowboyhat'], extras: ['belt'] },
  pirate: { gown: '#7a1a1a', hair: '#1d1d22', accs: ['piratehat', 'eyepatch'], extras: ['belt'] },
  detective: { gown: '#9a8a6a', hair: '#3a2a1a', accs: ['fedora'], extras: ['belt'] },
  plaguedoc: { gown: '#141414', hair: '#141414', accs: ['plaguemask', 'fedora'], extras: ['cape', 'belt'], fx: 'smoke' },
  // 🔪 Imposteur: 10 wins
  impostor: { gown: '#1a0a0e', hair: '#0a0a0a', accs: ['impmask'], extras: ['cape'], fx: 'aura' },
  clanknight: { gown: '#2a2f45', hair: '#1d1d22', accs: ['beret'], extras: ['cape', 'belt'] },
  champion: { gown: '#7a0a14', hair: '#f5d36a', accs: ['royalcrown'], gownFx: 'gold', extras: ['cape', 'medal', 'belt'], fx: 'stars' },
  veteran: { gown: '#4b5320', hair: '#2a2a20', accs: ['beret', 'shades'], extras: ['medal', 'belt'] , fx: 'embers' },
  // ⚔️ Mise à jour des Chevaliers
  squire: { gown: '#7a5a32', hair: '#4a2e1a', accs: ['hood'], extras: ['belt'] },
  knight: { gown: '#3a3f55', hair: '#2a2a2a', accs: ['knighthelm'], extras: ['armor', 'belt'], fx: 'sparks' },
  blackknight: { gown: '#0c0c0e', hair: '#0a0a0a', accs: ['blackhelm'], extras: ['blackarmor', 'cape'], fx: 'flames' },
};

/** Size of a head, so the event hats fit both the human and the creature. */
interface HeadSpec {
  /** centre height, top of the skull, half width, half depth, overall scale */
  cy: number;
  top: number;
  rx: number;
  rz: number;
  s: number;
}
const HUMAN_HEAD: HeadSpec = { cy: 0.125, top: 0.235, rx: 0.09, rz: 0.106, s: 1 };
const MONSTER_HEAD: HeadSpec = { cy: 0.1, top: 0.29, rx: 0.135, rz: 0.16, s: 1.45 };

/** A little heart, standing in the XY plane, centred on the origin. */
const heartGeo = (track: Track, r: number) => {
  const sh = new THREE.Shape();
  sh.moveTo(0, -r);
  sh.bezierCurveTo(r * 1.3, -r * 0.1, r * 1.1, r * 1.1, 0, r * 0.45);
  sh.bezierCurveTo(-r * 1.1, r * 1.1, -r * 1.3, -r * 0.1, 0, -r);
  const geo = new THREE.ExtrudeGeometry(sh, { depth: r * 0.5, bevelEnabled: true, bevelThickness: r * 0.2, bevelSize: r * 0.15, bevelSegments: 2 });
  geo.center();
  return track(geo);
};

/** Event hats & heads (Christmas / Halloween…), shared by both models. Returns false if unknown. */
const buildFestive = (id: string, h: HeadSpec, track: Track, g: THREE.Group): boolean => {
  const { s } = h;
  const cone = (color: number, rimColor: number, height: number, tip: number, tipEmissive = 0) => {
    const pivot = new THREE.Group();
    pivot.position.set(0, h.top - 0.055 * s, -0.012 * s);
    pivot.rotation.x = -0.5;
    g.add(pivot);
    const cloth = std(track, color, { roughness: 0.95 });
    // Two parts so the tip flops backwards
    add(track, pivot, new THREE.CylinderGeometry(h.rx * 0.55, h.rx * 1.02, height * 0.55, 20), cloth, 0, height * 0.27, 0);
    const top = new THREE.Group();
    top.position.y = height * 0.54;
    top.rotation.x = -0.6;
    pivot.add(top);
    add(track, top, new THREE.ConeGeometry(h.rx * 0.55, height * 0.5, 18), cloth, 0, height * 0.24, 0);
    add(track, top, new THREE.SphereGeometry(0.028 * s, 12, 10), std(track, tip, { roughness: 0.9, emissive: tipEmissive, emissiveIntensity: tipEmissive ? 0.6 : 0 }), 0, height * 0.5, 0);
    const rim = add(track, g, new THREE.TorusGeometry(h.rx * 1.02, 0.022 * s, 10, 30), std(track, rimColor, { roughness: 1 }), 0, h.top - 0.06 * s, -0.012 * s);
    rim.rotation.x = Math.PI / 2 - 0.5;
    rim.scale.set(1, h.rz / h.rx, 1);
  };
  switch (id) {
    case 'santahat':
      cone(0xc8102e, 0xf6f6f2, 0.22 * s, 0xffffff);
      return true;
    case 'elfhat':
      cone(0x15803d, 0xc8102e, 0.3 * s, 0xffd21a, 0x806000);
      return true;
    case 'beard': {
      const white = std(track, 0xf4f4f0, { roughness: 1 });
      const beard = add(track, g, new THREE.SphereGeometry(0.075 * s, 16, 12), white, 0, h.cy - 0.065 * s, h.rz * 0.62);
      beard.scale.set(1.05, 1.25, 0.6);
      for (const side of [-1, 1]) {
        const m = add(track, g, new THREE.CapsuleGeometry(0.012 * s, 0.035 * s, 4, 8), white, side * 0.025 * s, h.cy - 0.02 * s, h.rz * 0.98);
        m.rotation.z = side * 1.2;
      }
      return true;
    }
    case 'antlers': {
      const wood = std(track, 0x6b4423, { roughness: 0.8 });
      for (const side of [-1, 1]) {
        const base = new THREE.Group();
        base.position.set(side * h.rx * 0.55, h.top - 0.03 * s, -0.01 * s);
        base.rotation.z = -side * 0.45;
        g.add(base);
        add(track, base, new THREE.CylinderGeometry(0.007 * s, 0.011 * s, 0.15 * s, 6), wood, 0, 0.075 * s, 0);
        for (const [y, len, a] of [[0.06, 0.06, 0.9], [0.11, 0.05, -0.8], [0.14, 0.045, 0.7]]) {
          const b = add(track, base, new THREE.CylinderGeometry(0.005 * s, 0.007 * s, len * s, 6), wood, 0, y * s, 0);
          b.geometry.translate(0, (len * s) / 2, 0);
          b.rotation.z = -side * a;
        }
      }
      // Rudolph's nose
      add(track, g, new THREE.SphereGeometry(0.02 * s, 14, 10), std(track, 0xff1a1a, { emissive: 0xff0000, emissiveIntensity: 0.9, roughness: 0.3 }), 0, h.cy - 0.012 * s, h.rz + 0.012 * s);
      return true;
    }
    case 'witchhat': {
      const felt = std(track, 0x16101e, { roughness: 0.95, side: THREE.DoubleSide });
      const brim = add(track, g, new THREE.CylinderGeometry(h.rx * 2, h.rx * 2, 0.008 * s, 32), felt, 0, h.top - 0.045 * s, 0);
      brim.scale.z = h.rz / h.rx;
      const band = add(track, g, new THREE.CylinderGeometry(h.rx * 0.98, h.rx * 1.0, 0.028 * s, 24), std(track, 0x7c3aed, { roughness: 0.6 }), 0, h.top - 0.025 * s, 0);
      band.scale.z = h.rz / h.rx;
      const pivot = new THREE.Group();
      pivot.position.set(0, h.top - 0.04 * s, 0);
      g.add(pivot);
      add(track, pivot, new THREE.CylinderGeometry(h.rx * 0.45, h.rx * 0.98, 0.16 * s, 20), felt, 0, 0.08 * s, 0);
      const tip = new THREE.Group();
      tip.position.y = 0.155 * s;
      tip.rotation.x = -0.7;
      pivot.add(tip);
      add(track, tip, new THREE.ConeGeometry(h.rx * 0.45, 0.13 * s, 16), felt, 0, 0.06 * s, 0);
      add(track, g, new THREE.BoxGeometry(0.03 * s, 0.024 * s, 0.006 * s), std(track, 0xd4a840, { metalness: 0.9, roughness: 0.3 }), 0, h.top - 0.025 * s, h.rz * 1.0);
      return true;
    }
    case 'pumpkinhead': {
      const R = Math.max(h.rx, h.rz) * 1.32;
      const geo = new THREE.SphereGeometry(R, 32, 20);
      // Ribs
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i);
        const z = p.getZ(i);
        const k = 1 - 0.07 * Math.abs(Math.sin(Math.atan2(z, x) * 5));
        p.setXYZ(i, x * k, p.getY(i) * 0.88, z * k);
      }
      geo.computeVertexNormals();
      const cy = h.cy + 0.01 * s;
      add(track, g, geo, std(track, 0xe8701a, { roughness: 0.55 }), 0, cy, 0);
      add(track, g, new THREE.CylinderGeometry(0.012 * s, 0.018 * s, 0.06 * s, 8), std(track, 0x3f5a1a, { roughness: 0.9 }), 0, cy + R * 0.88 + 0.02 * s, 0).rotation.z = 0.3;
      // Carved face glowing from inside
      const glow = track(new THREE.MeshBasicMaterial({ color: 0xffc040, side: THREE.DoubleSide }));
      const onFace = (geom: THREE.BufferGeometry, x: number, y: number) => {
        const yy = y / 0.88;
        const z = Math.sqrt(Math.max(0, R * R - x * x - yy * yy)) * 0.95 + 0.004 * s;
        const m = add(track, g, geom, glow, x, cy + y, z);
        m.rotation.set(-Math.asin(Math.min(1, yy / R)) * 0.8, Math.asin(Math.min(1, x / R)), 0, 'YXZ');
        m.castShadow = false;
        return m;
      };
      for (const side of [-1, 1]) onFace(new THREE.CircleGeometry(0.028 * s, 3), side * R * 0.36, R * 0.22).rotation.z = Math.PI / 2;
      onFace(new THREE.CircleGeometry(0.02 * s, 3), 0, R * 0.0).rotation.z = Math.PI / 2;
      const mouth = new THREE.Shape();
      const w = R * 0.62;
      mouth.moveTo(-w, 0);
      for (let i = 0; i <= 6; i++) mouth.lineTo(-w + (i * 2 * w) / 6, i % 2 ? -0.012 * s : 0.012 * s);
      mouth.lineTo(w, 0);
      mouth.quadraticCurveTo(0, -0.07 * s, -w, 0);
      onFace(new THREE.ShapeGeometry(mouth), 0, -R * 0.3);
      return true;
    }
    case 'fangs': {
      const tooth = std(track, 0xffffff, { roughness: 0.2 });
      for (const side of [-1, 1]) {
        const f = add(track, g, new THREE.ConeGeometry(0.004 * s, 0.018 * s, 6), tooth, side * 0.012 * s, h.cy - 0.05 * s, h.rz * 0.93);
        f.rotation.x = Math.PI;
      }
      return true;
    }
    case 'bunnyears': {
      const fur = std(track, 0xf4f4f0, { roughness: 1 });
      const pink = std(track, 0xf9a8d4, { roughness: 0.9 });
      for (const side of [-1, 1]) {
        const ear = new THREE.Group();
        ear.position.set(side * h.rx * 0.45, h.top - 0.02 * s, -0.01 * s);
        ear.rotation.set(-0.15, 0, -side * 0.18);
        g.add(ear);
        const outer = add(track, ear, new THREE.CapsuleGeometry(0.026 * s, 0.13 * s, 6, 12), fur, 0, 0.09 * s, 0);
        outer.scale.z = 0.45;
        const inner = add(track, ear, new THREE.CapsuleGeometry(0.015 * s, 0.1 * s, 4, 10), pink, 0, 0.09 * s, 0.009 * s);
        inner.scale.z = 0.3;
        if (side === 1) ear.rotation.x = 0.55; // one ear flops forward
      }
      return true;
    }
    case 'heartshades': {
      const red = std(track, 0xff2a6a, { roughness: 0.3, emissive: 0x600010, emissiveIntensity: 0.4 });
      for (const side of [-1, 1]) {
        const lens = add(track, g, heartGeo(track, 0.022 * s), red, side * 0.032 * s, h.cy + 0.012 * s, h.rz + 0.004 * s);
        lens.scale.z = 0.4;
      }
      add(track, g, new THREE.BoxGeometry(0.02 * s, 0.004 * s, 0.004 * s), red, 0, h.cy + 0.016 * s, h.rz + 0.006 * s);
      return true;
    }
    case 'heartboppers': {
      const band = std(track, 0xff2a6a, { roughness: 0.4 });
      const ring = add(track, g, new THREE.TorusGeometry(h.rx * 1.02, 0.007 * s, 6, 24, Math.PI), band, 0, h.top - 0.07 * s, 0);
      ring.rotation.y = Math.PI / 2;
      ring.scale.set(h.rz / h.rx, 1, 1);
      for (const side of [-1, 1]) {
        const stick = add(track, g, new THREE.CylinderGeometry(0.003 * s, 0.003 * s, 0.11 * s, 5), std(track, 0x222222), side * h.rx * 0.6, h.top + 0.03 * s, 0);
        stick.rotation.z = -side * 0.3;
        const heart = add(track, g, heartGeo(track, 0.03 * s), std(track, 0xff2a6a, { emissive: 0x800020, emissiveIntensity: 0.6 }), side * h.rx * 0.85, h.top + 0.09 * s, 0);
        heart.scale.z = 0.5;
      }
      return true;
    }
    case 'fishhat': {
      const scales = std(track, 0xfb923c, { roughness: 0.45 });
      const pivot = new THREE.Group();
      pivot.position.set(0, h.top + 0.02 * s, 0);
      pivot.rotation.y = Math.PI / 2;
      g.add(pivot);
      const body = add(track, pivot, new THREE.SphereGeometry(0.06 * s, 16, 10), scales, 0, 0, 0);
      body.scale.set(1.8, 0.75, 0.55);
      const tail = add(track, pivot, new THREE.ConeGeometry(0.045 * s, 0.07 * s, 4), scales, -0.13 * s, 0, 0);
      tail.rotation.z = -Math.PI / 2;
      tail.scale.z = 0.3;
      for (const side of [-1, 1]) add(track, pivot, new THREE.SphereGeometry(0.009 * s, 8, 6), std(track, 0x111111), 0.075 * s, 0.012 * s, side * 0.03 * s);
      return true;
    }
    case 'knighthelm':
    case 'blackhelm': {
      // ⚔️ A great helm: a steel bucket with a visor slit and a plume
      const black = id === 'blackhelm';
      const metal = std(track, black ? 0x1c1c22 : 0xb8bcc4, { metalness: 0.9, roughness: black ? 0.45 : 0.28 });
      const slit = std(track, 0x030303, { roughness: 1, emissive: black ? 0xff2a00 : 0x000000, emissiveIntensity: black ? 0.8 : 0 });
      const H = (h.top - h.cy) * 2.25;
      const zs = h.rz / h.rx;
      const body = add(track, g, new THREE.CylinderGeometry(h.rx * 1.2, h.rx * 1.25, H, 22), metal, 0, h.cy - 0.005 * s, 0);
      body.scale.z = zs;
      const dome = add(track, g, new THREE.SphereGeometry(h.rx * 1.2, 22, 10, 0, Math.PI * 2, 0, Math.PI / 2), metal, 0, h.cy - 0.005 * s + H / 2, 0);
      dome.scale.set(1, 0.5, zs);
      add(track, g, new THREE.BoxGeometry(h.rx * 1.7, 0.014 * s, 0.03 * s), slit, 0, h.cy + 0.035 * s, h.rz * 1.22);
      add(track, g, new THREE.BoxGeometry(0.014 * s, H * 0.62, 0.03 * s), metal, 0, h.cy - 0.03 * s, h.rz * 1.24);
      const trim = std(track, black ? 0x8a0a14 : 0xd4a840, { metalness: 0.8, roughness: 0.3 });
      const rim = add(track, g, new THREE.TorusGeometry(h.rx * 1.25, 0.008 * s, 6, 28), trim, 0, h.cy - 0.005 * s - H / 2, 0);
      rim.rotation.x = Math.PI / 2;
      rim.scale.set(1, zs, 1);
      const plume = std(track, black ? 0x8a0a14 : 0x1d4ed8, { roughness: 0.95 });
      const p = add(track, g, new THREE.SphereGeometry(0.05 * s, 10, 8), plume, 0, h.cy + H / 2 + h.rx * 0.55, -0.03 * s);
      p.scale.set(0.45, 1.3, 1.8);
      return true;
    }
    case 'crown': {
      const gold = std(track, 0xe8c040, { metalness: 0.95, roughness: 0.22, emissive: 0x403000, emissiveIntensity: 0.3 });
      const band = add(track, g, new THREE.CylinderGeometry(h.rx * 0.95, h.rx * 0.92, 0.045 * s, 24, 1, true), gold, 0, h.top - 0.005 * s, 0);
      band.scale.z = h.rz / h.rx;
      (band.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
      const gems = [0xe11d48, 0x2563eb, 0x16a34a];
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const x = Math.sin(a) * h.rx * 0.93;
        const z = Math.cos(a) * h.rz * 0.93;
        add(track, g, new THREE.ConeGeometry(0.014 * s, 0.045 * s, 4), gold, x, h.top + 0.04 * s, z);
        add(track, g, new THREE.OctahedronGeometry(0.009 * s), std(track, gems[i % 3], { roughness: 0.1, emissive: gems[i % 3], emissiveIntensity: 0.4 }), x * 1.03, h.top - 0.005 * s, z * 1.03);
      }
      return true;
    }
    case 'nightvision': {
      const body = std(track, 0x1f2a1f, { roughness: 0.5, metalness: 0.4 });
      const strap = std(track, 0x111111, { roughness: 0.9 });
      const ring = add(track, g, new THREE.TorusGeometry(h.rx * 1.02, 0.01 * s, 6, 28), strap, 0, h.cy + 0.04 * s, 0);
      ring.rotation.x = Math.PI / 2;
      ring.scale.set(1, h.rz / h.rx, 1);
      for (const side of [-1, 1]) {
        const tube = add(track, g, new THREE.CylinderGeometry(0.018 * s, 0.021 * s, 0.05 * s, 14), body, side * 0.027 * s, h.cy + 0.06 * s, h.rz + 0.028 * s);
        tube.rotation.x = Math.PI / 2 - 0.5;
        const lens = add(track, g, new THREE.CircleGeometry(0.016 * s, 14), track(new THREE.MeshBasicMaterial({ color: 0x39ff6a })), side * 0.027 * s, h.cy + 0.072 * s, h.rz + 0.05 * s);
        lens.rotation.x = -0.5;
      }
      return true;
    }
    case 'gasmask': {
      const rubber = std(track, 0x1a1a1a, { roughness: 0.7, side: THREE.DoubleSide });
      const m = add(track, g, new THREE.SphereGeometry(h.rx * 1.05, 20, 14, -Math.PI * 0.4, Math.PI * 0.8, Math.PI * 0.25, Math.PI * 0.55), rubber, 0, h.cy, 0.004 * s);
      m.scale.set(1, 1.15, h.rz / h.rx);
      const glass = track(new THREE.MeshPhysicalMaterial({ color: 0x88aacc, transparent: true, opacity: 0.45, roughness: 0.05 }));
      for (const side of [-1, 1]) add(track, g, new THREE.CircleGeometry(0.02 * s, 16), glass, side * 0.03 * s, h.cy + 0.015 * s, h.rz + 0.008 * s);
      const filter = add(track, g, new THREE.CylinderGeometry(0.024 * s, 0.028 * s, 0.04 * s, 14), std(track, 0x3a4a2a, { roughness: 0.6 }), 0, h.cy - 0.045 * s, h.rz + 0.02 * s);
      filter.rotation.x = Math.PI / 2;
      return true;
    }
    case 'beret': {
      const felt = std(track, 0x7a1010, { roughness: 1 });
      const b = add(track, g, new THREE.SphereGeometry(h.rx * 1.08, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2.2), felt, -0.012 * s, h.top - 0.04 * s, 0);
      b.scale.set(1.05, 0.45, (h.rz / h.rx) * 1.02);
      b.rotation.z = 0.18;
      add(track, g, new THREE.CircleGeometry(0.012 * s, 10), std(track, 0xe8c040, { metalness: 0.9, roughness: 0.3 }), -h.rx * 0.5, h.top - 0.01 * s, h.rz * 0.85).rotation.y = -0.4;
      return true;
    }
    case 'impmask': {
      // 🔪 a smooth white theatre mask: black eye slits, thin red grin
      const porcelain = std(track, 0xf2efe8, { roughness: 0.25, metalness: 0.05, side: THREE.DoubleSide });
      const m = add(track, g, new THREE.SphereGeometry(h.rx * 1.06, 22, 16, -Math.PI * 0.42, Math.PI * 0.84, Math.PI * 0.12, Math.PI * 0.66), porcelain, 0, h.cy + 0.005 * s, 0.006 * s);
      m.scale.set(1, 1.18, h.rz / h.rx);
      const black = track(new THREE.MeshBasicMaterial({ color: 0x050505, side: THREE.DoubleSide }));
      for (const side of [-1, 1]) {
        const eye = add(track, g, new THREE.CircleGeometry(0.016 * s, 3), black, side * 0.032 * s, h.cy + 0.02 * s, h.rz * 1.02 + 0.008 * s);
        eye.scale.set(1.5, 0.55, 1);
        eye.rotation.z = side * 0.35;
        eye.castShadow = false;
      }
      const red = track(new THREE.MeshBasicMaterial({ color: 0xb0001a, side: THREE.DoubleSide }));
      const grin = add(track, g, new THREE.TorusGeometry(0.03 * s, 0.0035 * s, 4, 16, Math.PI * 0.8), red, 0, h.cy - 0.018 * s, h.rz * 1.02 + 0.006 * s);
      grin.rotation.z = Math.PI + Math.PI * 0.1;
      grin.castShadow = false;
      return true;
    }
    case 'fedora':
    case 'cowboyhat': {
      // Felt hat: a brim (curled up on the sides for the cowboy) and a pinched crown
      const cow = id === 'cowboyhat';
      const felt = std(track, cow ? 0x8a5a2b : 0x4a3a2a, { roughness: 0.95 });
      const R = h.rx * (cow ? 2.05 : 1.6);
      const brimGeo = new THREE.CylinderGeometry(R, R, 0.012 * s, 40, 1);
      const bp = brimGeo.attributes.position;
      for (let i = 0; i < bp.count; i++) {
        const x = bp.getX(i);
        const z = bp.getZ(i);
        const k = Math.abs(x) / R;
        // cowboy: sides roll up; fedora: front dips a little
        bp.setY(i, bp.getY(i) + (cow ? k * k * k * 0.07 * s : -Math.max(0, z / R) * 0.018 * s));
      }
      brimGeo.computeVertexNormals();
      const brim = add(track, g, track(brimGeo), felt, 0, h.top - 0.045 * s, 0);
      brim.scale.z = h.rz / h.rx;
      const crownGeo = new THREE.CylinderGeometry(h.rx * 0.82, h.rx * 0.98, 0.1 * s, 28, 3);
      const cp = crownGeo.attributes.position;
      for (let i = 0; i < cp.count; i++) {
        const y = cp.getY(i);
        if (y > 0.04 * s) {
          // dent along the top, pinched at the front
          const x = cp.getX(i);
          const z = cp.getZ(i);
          cp.setY(i, y - 0.025 * s * Math.exp(-(x * x) / (0.0016 * s * s)) - Math.max(0, z) * 0.15);
        }
      }
      crownGeo.computeVertexNormals();
      const crown = add(track, g, track(crownGeo), felt, 0, h.top + 0.01 * s, -0.004 * s);
      crown.scale.z = h.rz / h.rx;
      const band = add(track, g, new THREE.CylinderGeometry(h.rx * 0.985, h.rx * 0.99, 0.02 * s, 28, 1, true), std(track, cow ? 0x2a1a10 : 0x111111, { roughness: 0.6, side: THREE.DoubleSide }), 0, h.top - 0.025 * s, -0.004 * s);
      band.scale.z = h.rz / h.rx;
      g.rotation.x = -0.08;
      return true;
    }
    case 'piratehat': {
      // Tricorne: a rounded-triangle brim whose three edges turn up, gold piping,
      // a felt crown and a skull and crossbones on the front point
      const felt = std(track, 0x1c1410, { roughness: 0.85, side: THREE.DoubleSide });
      const gold = std(track, 0xd4a840, { metalness: 0.9, roughness: 0.3 });
      const R = h.rx * 1.85;
      const corner = (k: number, r: number) => {
        const a = -Math.PI / 2 + (k * Math.PI * 2) / 3; // one point to the front (+z once laid flat)
        return new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r);
      };
      const sh = new THREE.Shape();
      const pts: THREE.Vector2[] = [];
      for (let k = 0; k < 3; k++) {
        const c = corner(k, R);
        const n = corner(k + 1, R);
        // each side bows inwards between two corners
        for (let u = 0; u < 12; u++) {
          const t = u / 12;
          const mid = c.clone().lerp(n, t);
          mid.multiplyScalar(1 - 0.22 * Math.sin(t * Math.PI));
          pts.push(mid);
        }
      }
      sh.setFromPoints(pts);
      const brimGeo = new THREE.ExtrudeGeometry(sh, { depth: 0.01 * s, bevelEnabled: false, curveSegments: 1 });
      brimGeo.rotateX(-Math.PI / 2);
      const bp = brimGeo.attributes.position;
      for (let i = 0; i < bp.count; i++) {
        const x = bp.getX(i);
        const z = bp.getZ(i);
        const d = Math.hypot(x, z) / R;
        bp.setY(i, bp.getY(i) + Math.max(0, d - 0.45) ** 1.5 * 0.13 * s); // edges cocked up
      }
      brimGeo.computeVertexNormals();
      const brim = add(track, g, track(brimGeo), felt, 0, h.top - 0.05 * s, 0);
      brim.scale.z = h.rz / h.rx;
      // gold piping along the edge
      const edge = pts.map((p) => {
        const d = p.length() / R;
        return new THREE.Vector3(p.x, h.top - 0.05 * s + 0.011 * s + Math.max(0, d - 0.45) ** 1.5 * 0.13 * s, -p.y * (h.rz / h.rx));
      });
      add(track, g, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(edge, true), 72, 0.0035 * s, 5, true), gold);
      // crown
      add(track, g, new THREE.SphereGeometry(h.rx * 1.0, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), felt, 0, h.top - 0.045 * s, 0).scale.set(1, 0.8, h.rz / h.rx);
      // skull & crossbones on the front point
      const bone = std(track, 0xf2efe6, { roughness: 0.5 });
      const fz = R * (h.rz / h.rx) * 0.62;
      const fy = h.top - 0.04 * s + 0.045 * s;
      add(track, g, new THREE.SphereGeometry(0.014 * s, 10, 8), bone, 0, fy + 0.008 * s, fz);
      for (const r of [0.7, -0.7]) {
        const b = add(track, g, new THREE.CapsuleGeometry(0.003 * s, 0.032 * s, 3, 5), bone, 0, fy - 0.01 * s, fz + 0.002 * s);
        b.rotation.z = r + Math.PI / 2;
      }
      return true;
    }
    case 'eyepatch': {
      const black = std(track, 0x0a0a0a, { roughness: 0.7, side: THREE.DoubleSide });
      const patch = add(track, g, new THREE.SphereGeometry(0.024 * s, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), black, -0.031 * s, h.cy + 0.012 * s, h.rz * 0.93);
      patch.rotation.x = Math.PI / 2;
      patch.scale.set(1.05, 1, 0.45);
      const strap = add(track, g, new THREE.TorusGeometry(h.rx * 1.03, 0.0025 * s, 4, 32), black, 0, h.cy + 0.03 * s, 0);
      strap.rotation.set(Math.PI / 2 - 0.25, 0, 0.2);
      strap.scale.set(1, h.rz / h.rx, 1);
      return true;
    }
    case 'plaguemask': {
      // Plague doctor: a long curved leather beak, round red glass eyes, rivets
      const leather = std(track, 0x2a1d14, { roughness: 0.7 });
      const cap = add(track, g, new THREE.SphereGeometry(h.rx * 1.06, 22, 14, -Math.PI * 0.45, Math.PI * 0.9, Math.PI * 0.15, Math.PI * 0.6), leather, 0, h.cy + 0.01 * s, 0.004 * s);
      cap.scale.set(1, 1.15, h.rz / h.rx);
      (cap.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
      const beakGeo = new THREE.ConeGeometry(0.034 * s, 0.17 * s, 16, 6);
      const bp = beakGeo.attributes.position;
      for (let i = 0; i < bp.count; i++) {
        const y = bp.getY(i); // -0.085 (base) → +0.085 (tip)
        const u = (y / s + 0.085) / 0.17;
        bp.setZ(i, bp.getZ(i) - u * u * 0.04 * s); // curves down at the tip
      }
      beakGeo.computeVertexNormals();
      const beak = add(track, g, track(beakGeo), leather, 0, h.cy - 0.03 * s, h.rz + 0.075 * s);
      beak.rotation.x = Math.PI / 2 + 0.25;
      const glass = track(new THREE.MeshPhysicalMaterial({ color: 0x8a0a0a, roughness: 0.05, clearcoat: 1, emissive: 0x3a0000, emissiveIntensity: 0.6 }));
      const brass = std(track, 0xb08a3a, { metalness: 0.9, roughness: 0.35 });
      for (const side of [-1, 1]) {
        add(track, g, new THREE.CircleGeometry(0.019 * s, 18), glass, side * 0.034 * s, h.cy + 0.022 * s, h.rz * 1.02 + 0.006 * s);
        const rim = add(track, g, new THREE.TorusGeometry(0.02 * s, 0.004 * s, 6, 18), brass, side * 0.034 * s, h.cy + 0.022 * s, h.rz * 1.02 + 0.006 * s);
        rim.scale.z = 0.6;
      }
      for (let i = 0; i < 5; i++) add(track, g, new THREE.SphereGeometry(0.004 * s, 6, 4), brass, -0.02 * s + i * 0.01 * s, h.cy - 0.012 * s, h.rz * 1.06 + 0.02 * s);
      return true;
    }
    case 'royalcrown': {
      const gold = std(track, 0xf0c43a, { metalness: 1, roughness: 0.18, emissive: 0x5a3a00, emissiveIntensity: 0.45 });
      const velvet = std(track, 0x8a0a1e, { roughness: 0.9 });
      const fur = std(track, 0xf8f6f0, { roughness: 1 });
      const y0 = h.top - 0.01 * s;
      // Ermine rim
      const rim = add(track, g, new THREE.TorusGeometry(h.rx * 1.0, 0.02 * s, 10, 30), fur, 0, y0, 0);
      rim.rotation.x = Math.PI / 2;
      rim.scale.set(1, h.rz / h.rx, 1);
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        add(track, g, new THREE.SphereGeometry(0.006 * s, 6, 5), std(track, 0x111111), Math.sin(a) * h.rx * 1.02, y0, Math.cos(a) * h.rz * 1.02);
      }
      // Tall gold band with fleurons
      const band = add(track, g, new THREE.CylinderGeometry(h.rx * 0.98, h.rx * 0.94, 0.07 * s, 28, 1, true), gold, 0, y0 + 0.045 * s, 0);
      band.scale.z = h.rz / h.rx;
      (band.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
      const gems = [0xff1a3a, 0x2a6aff, 0x1aff6a, 0xb34aff];
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const x = Math.sin(a) * h.rx * 0.96;
        const z = Math.cos(a) * h.rz * 0.96;
        add(track, g, new THREE.ConeGeometry(0.016 * s, 0.07 * s, 4), gold, x, y0 + 0.11 * s, z);
        add(track, g, new THREE.SphereGeometry(0.009 * s, 8, 6), gold, x, y0 + 0.15 * s, z);
        const gem = gems[i % 4];
        add(track, g, new THREE.OctahedronGeometry(0.013 * s), std(track, gem, { roughness: 0.05, metalness: 0.2, emissive: gem, emissiveIntensity: 0.9 }), x * 1.04, y0 + 0.045 * s, z * 1.04);
      }
      // Velvet dome + golden arches + orb and cross
      const dome = add(track, g, new THREE.SphereGeometry(h.rx * 0.9, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), velvet, 0, y0 + 0.07 * s, 0);
      dome.scale.set(1, 0.75, h.rz / h.rx);
      for (const r of [0, Math.PI / 2]) {
        const arch = add(track, g, new THREE.TorusGeometry(h.rx * 0.9, 0.008 * s, 6, 24, Math.PI), gold, 0, y0 + 0.07 * s, 0);
        arch.rotation.y = r;
        arch.scale.set(1, 0.75, 1);
      }
      add(track, g, new THREE.SphereGeometry(0.018 * s, 12, 10), gold, 0, y0 + 0.15 * s, 0);
      add(track, g, new THREE.BoxGeometry(0.008 * s, 0.05 * s, 0.008 * s), gold, 0, y0 + 0.19 * s, 0);
      add(track, g, new THREE.BoxGeometry(0.03 * s, 0.008 * s, 0.008 * s), gold, 0, y0 + 0.2 * s, 0);
      return true;
    }
    case 'bellcollar': {
      // Red leather collar with golden sleigh bells, under the chin
      const leather = std(track, 0x7a0c0c, { roughness: 0.7 });
      const collar = add(track, g, new THREE.TorusGeometry(h.rx * 0.85, 0.012 * s, 8, 26), leather, 0, h.cy - 0.12 * s, 0);
      collar.rotation.x = Math.PI / 2;
      collar.scale.set(1, h.rz / h.rx, 1);
      const gold = std(track, 0xd4a017, { metalness: 0.9, roughness: 0.25, emissive: 0x3a2a00, emissiveIntensity: 0.4 });
      for (let i = 0; i < 5; i++) {
        const a = Math.PI / 2 + (i - 2) * 0.45;
        add(track, g, new THREE.SphereGeometry(0.016 * s, 10, 8), gold, Math.cos(a) * h.rx * 0.88, h.cy - 0.14 * s, Math.sin(a) * h.rz * 0.88);
      }
      return true;
    }
    case 'clownnose':
      add(track, g, new THREE.SphereGeometry(0.024 * s, 16, 12), std(track, 0xff1a1a, { roughness: 0.25, emissive: 0x500000, emissiveIntensity: 0.5 }), 0, h.cy - 0.01 * s, h.rz + 0.016 * s);
      return true;
    case 'hood': {
      const cloth = std(track, 0x08080a, { roughness: 1, side: THREE.DoubleSide });
      const hood = add(
        track,
        g,
        new THREE.SphereGeometry(h.rx * 1.35, 24, 16, Math.PI / 2 + 0.75, Math.PI * 2 - 1.5, 0, Math.PI * 0.72),
        cloth,
        0,
        h.cy + 0.01 * s,
        -0.01 * s
      );
      hood.scale.set(1, 1.2, h.rz / h.rx);
      const tip = add(track, g, new THREE.ConeGeometry(h.rx * 0.5, 0.08 * s, 12), cloth, 0, h.top + 0.035 * s, -0.04 * s);
      tip.rotation.x = -0.6;
      return true;
    }
  }
  return false;
};

export const buildHumanAccessory = (id: string, track: Track): THREE.Group => {
  const g = new THREE.Group();
  if (buildFestive(id, HUMAN_HEAD, track, g)) return g;
  switch (id) {
    case 'cap': {
      const fabric = std(track, 0x1d3f8a, { roughness: 0.9 });
      const dome = add(track, g, new THREE.SphereGeometry(0.098, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), fabric, 0, 0.17, -0.004);
      dome.scale.set(0.95, 0.8, 1.12);
      const visor = add(track, g, new THREE.CylinderGeometry(0.075, 0.075, 0.008, 20, 1, false, -Math.PI / 2, Math.PI), fabric, 0, 0.175, 0.085);
      visor.scale.set(1.1, 1, 1.1);
      visor.rotation.x = 0.12;
      add(track, g, new THREE.SphereGeometry(0.01, 8, 6), fabric, 0, 0.25, 0);
      break;
    }
    case 'surgcap': {
      const fabric = std(track, 0x6aaa8a, { roughness: 0.95 });
      const dome = add(track, g, new THREE.SphereGeometry(0.1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), fabric, 0, 0.165, -0.006);
      dome.scale.set(0.96, 0.85, 1.12);
      break;
    }
    case 'beanie': {
      const knit = std(track, 0x2a2a30, { roughness: 1 });
      const dome = add(track, g, new THREE.SphereGeometry(0.102, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2), knit, 0, 0.165, -0.004);
      dome.scale.set(0.96, 1.0, 1.12);
      const rim = add(track, g, new THREE.TorusGeometry(0.093, 0.016, 8, 28), knit, 0, 0.17, -0.004);
      rim.rotation.x = Math.PI / 2;
      rim.scale.set(1, 1.18, 1);
      break;
    }
    case 'glasses':
    case 'shades': {
      const frame = std(track, id === 'shades' ? 0x111111 : 0x3a2a1a, { roughness: 0.3, metalness: 0.4 });
      const lens = track(
        new THREE.MeshPhysicalMaterial({ color: id === 'shades' ? 0x111111 : 0xaaccdd, transparent: true, opacity: id === 'shades' ? 0.85 : 0.25, roughness: 0.05 })
      );
      for (const s of [-1, 1]) {
        const rim = add(track, g, new THREE.TorusGeometry(0.017, 0.0025, 6, 18), frame, s * 0.03, 0.137, 0.112);
        rim.scale.set(1.15, 0.9, 1);
        add(track, g, new THREE.CircleGeometry(0.017, 16), lens, s * 0.03, 0.137, 0.112).scale.set(1.15, 0.9, 1);
        const arm = add(track, g, new THREE.BoxGeometry(0.003, 0.003, 0.1), frame, s * 0.081, 0.14, 0.062);
        arm.rotation.y = s * 0.12;
      }
      add(track, g, new THREE.BoxGeometry(0.022, 0.003, 0.003), frame, 0, 0.14, 0.114);
      break;
    }
    case 'mask': {
      const cloth = std(track, 0x8ac6e8, { roughness: 0.95, side: THREE.DoubleSide });
      const m = add(track, g, new THREE.SphereGeometry(0.09, 20, 12, -Math.PI * 0.32, Math.PI * 0.64, Math.PI * 0.42, Math.PI * 0.32), cloth, 0, 0.115, 0.012);
      m.scale.set(0.95, 1.15, 1.18);
      for (const s of [-1, 1]) {
        const strap = add(track, g, new THREE.BoxGeometry(0.003, 0.003, 0.09), cloth, s * 0.084, 0.11, 0.03);
        strap.rotation.y = s * 0.2;
      }
      break;
    }
    case 'headphones': {
      const plastic = std(track, 0x151515, { roughness: 0.4 });
      const pad = std(track, 0xd8203a, { roughness: 0.7 });
      const band = add(track, g, new THREE.TorusGeometry(0.098, 0.009, 8, 24, Math.PI), plastic, 0, 0.13, 0);
      band.scale.set(0.95, 1.22, 1);
      for (const s of [-1, 1]) {
        const cup = add(track, g, new THREE.CylinderGeometry(0.033, 0.033, 0.026, 18), pad, s * 0.094, 0.125, 0);
        cup.rotation.z = Math.PI / 2;
      }
      break;
    }
    case 'bandana': {
      const red = std(track, 0xc0202a, { roughness: 0.9 });
      const band = add(track, g, new THREE.TorusGeometry(0.087, 0.012, 6, 28), red, 0, 0.185, 0.0);
      band.rotation.x = Math.PI / 2 - 0.12;
      band.scale.set(0.98, 1.2, 1);
      const knot = add(track, g, new THREE.ConeGeometry(0.02, 0.07, 4), red, 0, 0.16, -0.11);
      knot.rotation.x = -2.4;
      break;
    }
    case 'mohawk': {
      const hairMat = std(track, 0xff3aa8, { roughness: 0.5 });
      for (let i = 0; i < 7; i++) {
        const spike = add(track, g, new THREE.ConeGeometry(0.018, 0.09, 6), hairMat, 0, 0.245 - Math.abs(i - 3) * 0.008, 0.07 - i * 0.026);
        spike.rotation.x = -0.2 - i * 0.12;
      }
      g.userData.hairTint = true;
      break;
    }
  }
  return g;
};

/** Body extras (built in the spine's local space). */
export const buildHumanBodyExtra = (id: string, track: Track): THREE.Group => {
  const g = new THREE.Group();
  if (id === 'stethoscope') {
    const rubber = std(track, 0x111111, { roughness: 0.5 });
    const steel = std(track, 0xc8ccd0, { roughness: 0.2, metalness: 1 });
    const ring = add(track, g, new THREE.TorusGeometry(0.095, 0.006, 6, 24, Math.PI * 1.3), rubber, 0, 0.53, 0.02);
    ring.rotation.set(Math.PI / 2 + 0.35, 0, Math.PI * 0.85);
    for (const s of [-1, 1]) {
      const tube = add(track, g, new THREE.CylinderGeometry(0.005, 0.005, 0.22, 6), rubber, s * 0.06, 0.4, 0.13);
      tube.rotation.x = 0.15;
    }
    const chest = add(track, g, new THREE.CylinderGeometry(0.02, 0.02, 0.012, 14), steel, 0.06, 0.28, 0.15);
    chest.rotation.x = Math.PI / 2;
  } else if (id === 'belt') {
    const leather = std(track, 0x111111, { roughness: 0.5 });
    const belt = add(track, g, new THREE.CylinderGeometry(0.222, 0.222, 0.055, 36, 1, true), leather, 0, 0.02, 0);
    belt.scale.set(1.02, 1, 0.82);
    (belt.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
    const buckle = add(track, g, new THREE.TorusGeometry(0.03, 0.007, 6, 4), std(track, 0xe8c040, { metalness: 0.9, roughness: 0.25 }), 0, 0.02, 0.185);
    buckle.rotation.z = Math.PI / 4;
  } else if (id === 'xmasbands') {
    // Ugly Christmas sweater: white and green bands with little "snowflakes"
    const white = std(track, 0xf4f4f0, { roughness: 1, side: THREE.DoubleSide });
    const green = std(track, 0x15803d, { roughness: 1, side: THREE.DoubleSide });
    for (const [y, mat, r] of [[0.3, white, 0.207], [0.22, green, 0.21], [0.0, white, 0.217], [-0.08, green, 0.22]] as const) {
      const band = add(track, g, new THREE.CylinderGeometry(r, r, 0.04, 36, 1, true, 0.32 + Math.PI, Math.PI * 2 - 0.64), mat, 0, y, 0);
      band.scale.set(1.02, 1, 0.8);
    }
    for (let i = 0; i < 5; i++) {
      const a = -0.9 + i * 0.45;
      const flake = add(track, g, new THREE.OctahedronGeometry(0.018, 0), white, Math.sin(a) * 0.205, 0.11, Math.cos(a) * 0.17);
      flake.scale.z = 0.3;
      flake.rotation.y = a;
    }
  } else if (id === 'cape') {
    const black = std(track, 0x0a0a0c, { roughness: 0.8, side: THREE.DoubleSide });
    const lining = std(track, 0x8a0a14, { roughness: 0.6, side: THREE.BackSide });
    for (const mat of [black, lining]) {
      const cape = add(track, g, new THREE.CylinderGeometry(0.2, 0.34, 1.0, 28, 1, true, Math.PI / 2 + 0.25, Math.PI - 0.5), mat, 0, 0.05, -0.02);
      cape.scale.z = 0.9;
    }
    // High collar
    const collar = add(track, g, new THREE.CylinderGeometry(0.2, 0.13, 0.2, 24, 1, true, Math.PI / 2, Math.PI), black, 0, 0.62, -0.01);
    collar.scale.z = 0.9;
  } else if (id === 'wings') {
    // Cupid's little wings on the back
    const feather = std(track, 0xfffaff, { roughness: 0.8, side: THREE.DoubleSide, emissive: 0x302028, emissiveIntensity: 0.3 });
    for (const side of [-1, 1]) {
      const sh = new THREE.Shape();
      sh.moveTo(0, 0);
      sh.quadraticCurveTo(0.12, 0.2, 0.3, 0.16);
      sh.quadraticCurveTo(0.24, 0.06, 0.26, -0.02);
      sh.quadraticCurveTo(0.16, -0.02, 0.18, -0.12);
      sh.quadraticCurveTo(0.08, -0.08, 0, 0);
      const wing = add(track, g, new THREE.ShapeGeometry(sh), feather, side * 0.05, 0.42, -0.19);
      wing.scale.x = side;
      wing.rotation.y = side * 0.5;
    }
  } else if (id === 'medal') {
    const gold = std(track, 0xe8c040, { metalness: 0.95, roughness: 0.25 });
    const ribbon = std(track, 0x1d4ed8, { roughness: 0.8 });
    add(track, g, new THREE.BoxGeometry(0.03, 0.04, 0.004), ribbon, -0.08, 0.36, 0.17);
    const m = add(track, g, new THREE.CylinderGeometry(0.018, 0.018, 0.005, 16), gold, -0.08, 0.32, 0.172);
    m.rotation.x = Math.PI / 2;
  } else if (id === 'armor' || id === 'blackarmor') {
    // ⚔️ Breastplate, shoulder plates and a cross on the chest
    const black = id === 'blackarmor';
    const metal = std(track, black ? 0x1c1c22 : 0xb8bcc4, { metalness: 0.9, roughness: black ? 0.45 : 0.28, side: THREE.DoubleSide });
    const trim = std(track, black ? 0x8a0a14 : 0xd4a840, { metalness: 0.8, roughness: 0.3, emissive: black ? 0x400000 : 0x000000, emissiveIntensity: 0.5 });
    const plate = add(track, g, new THREE.CylinderGeometry(0.218, 0.208, 0.48, 30, 1, true), metal, 0, 0.27, 0);
    plate.scale.set(1.04, 1, 0.84);
    const band = add(track, g, new THREE.CylinderGeometry(0.224, 0.224, 0.04, 30, 1, true), trim, 0, 0.05, 0);
    band.scale.set(1.04, 1, 0.86);
    for (const side of [-1, 1]) {
      const sh = add(track, g, new THREE.SphereGeometry(0.095, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), metal, side * 0.235, 0.5, 0);
      sh.scale.set(1.2, 0.75, 1.1);
    }
    add(track, g, new THREE.BoxGeometry(0.03, 0.2, 0.012), trim, 0, 0.33, 0.183);
    add(track, g, new THREE.BoxGeometry(0.12, 0.03, 0.012), trim, 0, 0.37, 0.183);
  } else if (id === 'stripes') {
    const black = std(track, 0x151515, { roughness: 0.9, side: THREE.DoubleSide });
    for (let i = 0; i < 6; i++) {
      const band = add(track, g, new THREE.CylinderGeometry(0.205 + i * 0.008, 0.205 + i * 0.008, 0.035, 36, 1, true, 0.32 + Math.PI, Math.PI * 2 - 0.64), black, 0, 0.32 - i * 0.12, 0);
      band.scale.set(1.02, 1, 0.8);
    }
  }
  return g;
};

// ---------------------------------------------------------------------------
// Creature (skull centre ≈ (0, 0.1, 0), r 0.14 × (0.95, 1.4, 1.15))
// ---------------------------------------------------------------------------
export interface MonsterOutfit {
  skin?: string;
  eyes?: string;
  gown?: string;
  accs: string[];
  skinFx?: 'bone' | 'inferno' | 'shadow' | 'gold' | 'frost' | 'toxic' | 'abyss';
  /** pieces on the body: cape, sceptre in hand, shoulder armour, tanks on the back */
  body?: MonsterBodyExtra[];
  /** animated effect that comes with the outfit */
  fx?: string;
}

export const MONSTER_OUTFITS: Record<string, MonsterOutfit> = {
  skeleton: { skin: '#e0dccb', eyes: '#ff2010', gown: '#151515', accs: [], skinFx: 'bone' },
  zombie: { skin: '#6f8a4a', eyes: '#ffd21a', gown: '#5a4030', accs: ['bandages'] },
  demon: { skin: '#a01818', eyes: '#ffd21a', gown: '#1a0a0a', accs: ['horns'] },
  inferno: { skin: '#2a1a14', eyes: '#ff8a00', gown: '#1a1010', accs: ['horns'], skinFx: 'inferno', body: ['pauldrons'], fx: 'flames' },
  shadow: { skin: '#0c0c10', eyes: '#c03aff', gown: '#050505', accs: ['hood'], skinFx: 'shadow', fx: 'smoke' },
  goldm: { skin: '#d4a840', eyes: '#ffffff', gown: '#3a2a10', accs: ['chains', 'crown'], skinFx: 'gold', body: ['pauldrons'], fx: 'halo' },
  // 🎄 Noël
  yeti: { skin: '#eef4ff', eyes: '#38bdf8', gown: '#c8d8ee', accs: [], skinFx: 'frost' },
  gingerbread: { skin: '#a0522d', eyes: '#ffffff', gown: '#f4f0e8', accs: [] },
  krampus: { skin: '#3b2a1e', eyes: '#ff2010', gown: '#1a120c', accs: ['horns', 'chains'], body: ['royalcape'], fx: 'smoke' },
  fouettard: { skin: '#2a1e18', eyes: '#ff2a1a', gown: '#100a07', accs: ['hood', 'chains', 'bellcollar'] , fx: 'smoke' },
  // 🎃 Halloween
  mummy: { skin: '#d6cba8', eyes: '#ffd21a', gown: '#c8bc98', accs: ['bandages'] },
  pumpking: { skin: '#1a1208', eyes: '#ff9a00', gown: '#2a1a0a', accs: ['pumpkinhead'], skinFx: 'inferno' , fx: 'embers' },
  // 🐰 Pâques
  chocobunny: { skin: '#5a3018', eyes: '#fde047', gown: '#3a1e0e', accs: ['bunnyears'] , fx: 'stars' },
  // 💘 Saint-Valentin
  lovebeast: { skin: '#f472b6', eyes: '#ff3a8a', gown: '#9d174d', accs: ['heartboppers'] , fx: 'aura' },
  // 🐟 Poisson d'avril
  clownm: { skin: '#f4f4f0', eyes: '#22d3ee', gown: '#7c3aed', accs: ['clownnose'] , fx: 'sparks' },
  // 🏆 Pass de saison / ⭐ niveaux
  toxic: { skin: '#5adf3a', eyes: '#e8ff3a', gown: '#2a3a10', accs: ['gasmask'], skinFx: 'toxic', body: ['tanks'] , fx: 'smoke' },
  abyss: { skin: '#0a1428', eyes: '#38bdf8', gown: '#050a14', accs: ['horns'], skinFx: 'abyss', fx: 'aura' },
  legend: { skin: '#2e2628', eyes: '#ffd21a', gown: '#3a0a4a', accs: ['royalcrown'], body: ['royalcape', 'scepter', 'pauldrons'], fx: 'embers' },
  // 🏆 Histoire : le boss et le chapitre secret
  moreau: { skin: '#cfc8b8', eyes: '#ff1a0a', gown: '#e8e8e2', accs: ['chains'], skinFx: 'bone' , fx: 'sparks' },
  ombre: { skin: '#08080c', eyes: '#ffffff', gown: '#030303', accs: [], skinFx: 'shadow' , fx: 'smoke' },
  // 🛡️ Coffre de clan
  clanbeast: { skin: '#3a3f5a', eyes: '#7dd3fc', gown: '#14182a', accs: ['horns', 'chains'], skinFx: 'abyss', body: ['pauldrons'] , fx: 'aura' },
  // 🏅 Pass classé
  gladiator: { skin: '#6a4a32', eyes: '#ff3a10', gown: '#3a1a0a', accs: ['hockey', 'chains'], skinFx: 'gold', body: ['pauldrons'], fx: 'sparks' },
  // 🦌 Nouvelles créatures
  wendigo: { skin: '#d8d0c0', eyes: '#9ef0ff', gown: '#2a2420', accs: ['antlers'], skinFx: 'bone' , fx: 'smoke' },
  plaguebeast: { skin: '#3a3a30', eyes: '#ff3a10', gown: '#141414', accs: ['plaguemask'] },
  ghostpirate: { skin: '#7ad0c8', eyes: '#e0fff8', gown: '#203a3a', accs: ['piratehat', 'chains'], skinFx: 'frost' , fx: 'aura' },
  // ⚔️ Mise à jour des Chevaliers: Patient Zéro in his cursed armour, and the dragon
  knightpz: { eyes: '#ff2010', gown: '#22222a', accs: ['blackhelm'], body: ['chestplate', 'pauldrons', 'sword'], fx: 'embers' },
  dragon: { skin: '#2f6b2a', eyes: '#ffcc00', gown: '#14301a', accs: ['horns'], body: ['dragonwings'], fx: 'flames' },
  // 🎄 Nuit de Noël
  evilsanta: { skin: '#d8cfc4', eyes: '#ff1a0a', gown: '#9a0c18', accs: ['santahat', 'beard'], body: ['royalcape'], fx: 'embers' },
};

export const buildMonsterAccessory = (id: string, track: Track): THREE.Group => {
  const g = new THREE.Group();
  if (buildFestive(id, MONSTER_HEAD, track, g)) return g;
  switch (id) {
    case 'horns': {
      const horn = std(track, 0x2a1a10, { roughness: 0.4 });
      for (const s of [-1, 1]) {
        const base = new THREE.Group();
        base.position.set(s * 0.09, 0.26, 0.02);
        base.rotation.set(-0.3, 0, -s * 0.5);
        g.add(base);
        for (let i = 0; i < 4; i++) {
          const seg = add(track, base, new THREE.ConeGeometry(0.035 - i * 0.007, 0.08, 8), horn, 0, i * 0.06, -i * i * 0.008);
          seg.rotation.x = -i * 0.25;
        }
      }
      break;
    }
    case 'chains': {
      const steel = std(track, 0x9aa0a4, { roughness: 0.3, metalness: 0.9 });
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const link = add(track, g, new THREE.TorusGeometry(0.02, 0.005, 5, 10), steel, Math.cos(a) * 0.11, -0.12, Math.sin(a) * 0.1);
        link.rotation.set(Math.PI / 2, a, i % 2 ? Math.PI / 2 : 0);
      }
      break;
    }
    case 'bandages': {
      const cloth = std(track, 0xd8d0b8, { roughness: 1 });
      for (let i = 0; i < 4; i++) {
        const b = add(track, g, new THREE.TorusGeometry(0.13 - Math.abs(i - 1.5) * 0.01, 0.014, 6, 24), cloth, 0, 0.06 + i * 0.06, 0.005);
        b.rotation.set(Math.PI / 2 + (i - 1.5) * 0.25, 0.2 * i, 0);
        b.scale.set(1, 1.15, 1);
      }
      break;
    }
    case 'hockey': {
      const white = std(track, 0xeeeee4, { roughness: 0.5, side: THREE.DoubleSide });
      const dark = std(track, 0x111111);
      const m = add(track, g, new THREE.SphereGeometry(0.15, 20, 14, -Math.PI * 0.35, Math.PI * 0.7, Math.PI * 0.18, Math.PI * 0.55), white, 0, 0.11, 0.0);
      m.scale.set(0.95, 1.35, 1.12);
      for (const [x, y] of [[-0.05, 0.14], [0.05, 0.14]]) add(track, g, new THREE.CircleGeometry(0.025, 12), dark, x, y, 0.168);
      for (let i = 0; i < 6; i++) add(track, g, new THREE.CircleGeometry(0.006, 6), dark, -0.04 + (i % 3) * 0.04, 0.04 + Math.floor(i / 3) * 0.03, 0.168);
      const strip = add(track, g, new THREE.BoxGeometry(0.005, 0.02, 0.005), std(track, 0xc01010), 0, 0.2, 0.162);
      strip.scale.y = 3;
      break;
    }
  }
  return g;
};

// ---------------------------------------------------------------------------
// 👑 Creature body pieces (spine space: shoulders at y ≈ 0.6, x ≈ ±0.27; or in the right hand)
// ---------------------------------------------------------------------------
export type MonsterBodyExtra = 'royalcape' | 'scepter' | 'pauldrons' | 'tanks' | 'chestplate' | 'dragonwings' | 'sword';

export const buildMonsterBodyExtra = (id: MonsterBodyExtra, track: Track): { group: THREE.Group; at: 'spine' | 'hand' } | null => {
  const g = new THREE.Group();
  switch (id) {
    case 'royalcape': {
      const velvet = std(track, 0x7a0618, { roughness: 0.85, side: THREE.DoubleSide });
      const lining = std(track, 0xd4a017, { roughness: 0.4, metalness: 0.6, side: THREE.DoubleSide });
      const fur = std(track, 0xf6f3ea, { roughness: 1 });
      // Long mantle hanging from the shoulders, a little curved
      const geo = track(new THREE.PlaneGeometry(0.78, 1.35, 8, 12));
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        pos.setZ(i, -Math.pow(x / 0.39, 2) * 0.12 + (0.675 - y) * 0.05 * Math.sin(x * 9));
        pos.setX(i, x * (1 + (0.675 - y) * 0.25));
      }
      pos.needsUpdate = true;
      geo.computeVertexNormals();
      const cape = new THREE.Mesh(geo, velvet);
      cape.position.set(0, 0.62 - 0.675, -0.16);
      cape.castShadow = true;
      g.add(cape);
      const inner = new THREE.Mesh(geo, lining);
      inner.position.set(0, 0.62 - 0.675, -0.15);
      inner.scale.set(0.97, 0.99, 1);
      g.add(inner);
      // Gold trim along the hem and a golden crest in the middle of the back
      const goldT = std(track, 0xe8b830, { metalness: 0.95, roughness: 0.25, emissive: 0x3a2600, emissiveIntensity: 0.35 });
      const hem = add(track, g, new THREE.BoxGeometry(1.0, 0.05, 0.012), goldT, 0, 0.62 - 1.33, -0.27);
      hem.rotation.x = 0.06;
      for (const side of [-1, 1]) {
        const edge = add(track, g, new THREE.BoxGeometry(0.035, 1.32, 0.012), goldT, side * 0.47, 0.62 - 0.68, -0.2);
        edge.rotation.z = side * 0.12;
      }
      const crest = new THREE.Group();
      crest.position.set(0, 0.2, -0.235);
      crest.rotation.y = Math.PI;
      g.add(crest);
      add(track, crest, new THREE.TorusGeometry(0.09, 0.012, 8, 24), goldT);
      add(track, crest, new THREE.CircleGeometry(0.08, 24), std(track, 0x2a0a3a, { roughness: 0.6, side: THREE.DoubleSide }), 0, 0, -0.002);
      for (let i = 0; i < 5; i++) add(track, crest, new THREE.ConeGeometry(0.012, 0.05, 4), goldT, (i - 2) * 0.025, 0.02 + (i % 2 ? 0 : 0.015), 0.005);
      add(track, crest, new THREE.BoxGeometry(0.11, 0.018, 0.01), goldT, 0, -0.01, 0.005);
      // Ermine collar with black tails, ruby clasp
      const collar = add(track, g, new THREE.TorusGeometry(0.22, 0.055, 10, 24), fur, 0, 0.66, -0.02);
      collar.rotation.x = Math.PI / 2 - 0.15;
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        add(track, g, new THREE.SphereGeometry(0.012, 6, 5), std(track, 0x0a0a0a), Math.cos(a) * 0.23, 0.68, Math.sin(a) * 0.23 - 0.02);
      }
      add(track, g, new THREE.SphereGeometry(0.035, 14, 10), std(track, 0xff1a3a, { roughness: 0.05, emissive: 0xaa0018, emissiveIntensity: 0.9 }), 0, 0.62, 0.2);
      return { group: g, at: 'spine' };
    }
    case 'scepter': {
      const gold = std(track, 0xf0c43a, { metalness: 1, roughness: 0.18, emissive: 0x5a3a00, emissiveIntensity: 0.4 });
      const ruby = std(track, 0xff1a3a, { roughness: 0.05, emissive: 0xff0a2a, emissiveIntensity: 1.6 });
      g.position.set(0, -0.64, 0.03);
      g.rotation.x = 0.25;
      add(track, g, new THREE.CylinderGeometry(0.014, 0.018, 0.95, 10), gold, 0, 0.05, 0);
      for (const y of [-0.25, 0.05, 0.35]) add(track, g, new THREE.TorusGeometry(0.022, 0.007, 6, 14), gold, 0, y, 0).rotation.x = Math.PI / 2;
      add(track, g, new THREE.SphereGeometry(0.06, 16, 12), ruby, 0, 0.6, 0);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        const prong = add(track, g, new THREE.CylinderGeometry(0.006, 0.006, 0.12, 5), gold, Math.cos(a) * 0.05, 0.6, Math.sin(a) * 0.05);
        prong.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
      }
      add(track, g, new THREE.SphereGeometry(0.02, 8, 6), gold, 0, 0.69, 0);
      add(track, g, new THREE.ConeGeometry(0.02, 0.06, 8), gold, 0, -0.45, 0).rotation.x = Math.PI;
      // the orb glows
      const glow = new THREE.PointLight(0xff2a3a, 0.9, 2.2, 2);
      glow.position.set(0, 0.6, 0);
      g.add(glow);
      return { group: g, at: 'hand' };
    }
    case 'pauldrons': {
      const gold = std(track, 0xc8a040, { metalness: 0.95, roughness: 0.25 });
      const dark = std(track, 0x2a2420, { metalness: 0.8, roughness: 0.35 });
      for (const side of [-1, 1]) {
        const p = add(track, g, new THREE.SphereGeometry(0.1, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), gold, side * 0.29, 0.64, 0);
        p.scale.set(1.15, 0.8, 1.1);
        add(track, g, new THREE.TorusGeometry(0.1, 0.012, 6, 20), dark, side * 0.29, 0.645, 0).rotation.x = Math.PI / 2;
        for (let k = 0; k < 3; k++) {
          const spike = add(track, g, new THREE.ConeGeometry(0.02, 0.1, 6), dark, side * (0.29 + (k - 1) * 0.045), 0.73, (k - 1) * 0.02);
          spike.rotation.z = -side * 0.35;
        }
      }
      return { group: g, at: 'spine' };
    }
    case 'chestplate': {
      // Rusty knight's breastplate over the gown
      const rust = std(track, 0x8a8a90, { metalness: 0.85, roughness: 0.5, side: THREE.DoubleSide });
      const stain = std(track, 0x5a3a20, { roughness: 0.9 });
      const plate = add(track, g, new THREE.CylinderGeometry(0.27, 0.24, 0.5, 26, 1, true), rust, 0, 0.36, 0.01);
      plate.scale.set(1, 1, 0.85);
      for (let k = 0; k < 4; k++) add(track, g, new THREE.SphereGeometry(0.03, 8, 6), stain, (k - 1.5) * 0.09, 0.2 + (k % 2) * 0.22, 0.225);
      return { group: g, at: 'spine' };
    }
    case 'dragonwings': {
      const skin = std(track, 0x1f4a1c, { roughness: 0.7, side: THREE.DoubleSide });
      const bone = std(track, 0x2a1a10, { roughness: 0.6 });
      for (const side of [-1, 1]) {
        const sh = new THREE.Shape();
        sh.moveTo(0, 0);
        sh.lineTo(0.55, 0.45);
        sh.lineTo(0.75, 0.05);
        sh.quadraticCurveTo(0.6, 0.0, 0.55, -0.15);
        sh.quadraticCurveTo(0.42, -0.05, 0.35, -0.25);
        sh.quadraticCurveTo(0.22, -0.08, 0.12, -0.2);
        sh.lineTo(0, 0);
        const wing = add(track, g, new THREE.ShapeGeometry(sh), skin, side * 0.08, 0.58, -0.22);
        wing.scale.x = side;
        wing.rotation.y = side * 0.45;
        const arm = add(track, g, new THREE.CylinderGeometry(0.015, 0.02, 0.7, 6), bone, side * 0.3, 0.8, -0.32);
        arm.rotation.z = -side * 0.85;
        arm.rotation.y = side * 0.45;
      }
      return { group: g, at: 'spine' };
    }
    case 'sword': {
      // A big notched sword in the right hand
      const steel = std(track, 0x9a9ea6, { metalness: 0.9, roughness: 0.35 });
      const grip = std(track, 0x2a1a10, { roughness: 0.8 });
      add(track, g, new THREE.BoxGeometry(0.06, 0.95, 0.015), steel, 0, -0.62, 0.05);
      add(track, g, new THREE.BoxGeometry(0.24, 0.04, 0.05), grip, 0, -0.12, 0.05);
      add(track, g, new THREE.CylinderGeometry(0.02, 0.02, 0.16, 8), grip, 0, -0.03, 0.05);
      return { group: g, at: 'hand' };
    }
    case 'tanks': {
      const glass = std(track, 0x3aff2a, { roughness: 0.1, transparent: true, opacity: 0.75, emissive: 0x2aff1a, emissiveIntensity: 0.8 });
      const metal = std(track, 0x4a5040, { metalness: 0.8, roughness: 0.4 });
      for (const side of [-1, 1]) {
        add(track, g, new THREE.CylinderGeometry(0.06, 0.06, 0.38, 14), glass, side * 0.09, 0.38, -0.2);
        add(track, g, new THREE.CylinderGeometry(0.065, 0.065, 0.04, 14), metal, side * 0.09, 0.58, -0.2);
        add(track, g, new THREE.CylinderGeometry(0.065, 0.065, 0.04, 14), metal, side * 0.09, 0.18, -0.2);
        const hose = new THREE.Mesh(
          track(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(side * 0.09, 0.6, -0.2), new THREE.Vector3(side * 0.12, 0.78, -0.1), new THREE.Vector3(side * 0.05, 0.85, 0.08)]), 12, 0.012, 6)),
          metal
        );
        g.add(hose);
      }
      return { group: g, at: 'spine' };
    }
  }
  return null;
};
