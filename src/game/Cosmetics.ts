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
  extras?: ('stethoscope' | 'mohawk' | 'stripes' | 'belt' | 'xmasbands' | 'cape')[];
}

export const HUMAN_OUTFITS: Record<string, HumanOutfit> = {
  surgeon: { gown: '#4f8a6a', accs: ['surgcap', 'mask'] },
  doctor: { gown: '#f2f2ec', accs: ['glasses'], gownFx: 'white', extras: ['stethoscope'] },
  prisoner: { gown: '#e8741a', accs: ['beanie'], extras: ['stripes'] },
  punk: { gown: '#1a1a1e', hair: '#ff3aa8', accs: [], extras: ['mohawk'] },
  gold: { gown: '#d4a840', hair: '#e8c860', accs: ['shades'], gownFx: 'gold' },
  neon: { gown: '#0a1a20', hair: '#ff3ad8', accs: ['headphones'], gownFx: 'neon', hairFx: 'neon' },
  // 🎄 Noël
  santa: { gown: '#c8102e', hair: '#f4f4f4', accs: ['santahat', 'beard'], extras: ['belt'] },
  elf: { gown: '#15803d', accs: ['elfhat'], extras: ['belt'] },
  sweater: { gown: '#b91c1c', accs: [], extras: ['xmasbands'] },
  // 🎃 Halloween
  witch: { gown: '#1e1430', hair: '#7c3aed', accs: ['witchhat'] },
  vampire: { gown: '#0c0c0e', hair: '#0a0a0a', accs: ['fangs'], extras: ['cape'] },
  reaper: { gown: '#08080a', hair: '#08080a', accs: ['hood'], gownFx: 'ghost', extras: ['cape'] },
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

/** Event hats & heads (Christmas / Halloween), shared by both models. Returns false if unknown. */
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
  skinFx?: 'bone' | 'inferno' | 'shadow' | 'gold' | 'frost';
}

export const MONSTER_OUTFITS: Record<string, MonsterOutfit> = {
  skeleton: { skin: '#e0dccb', eyes: '#ff2010', gown: '#151515', accs: [], skinFx: 'bone' },
  zombie: { skin: '#6f8a4a', eyes: '#ffd21a', gown: '#5a4030', accs: ['bandages'] },
  demon: { skin: '#a01818', eyes: '#ffd21a', gown: '#1a0a0a', accs: ['horns'] },
  inferno: { skin: '#2a1a14', eyes: '#ff8a00', gown: '#1a1010', accs: ['horns'], skinFx: 'inferno' },
  shadow: { skin: '#0c0c10', eyes: '#c03aff', gown: '#050505', accs: [], skinFx: 'shadow' },
  goldm: { skin: '#d4a840', eyes: '#ffffff', gown: '#3a2a10', accs: ['chains'], skinFx: 'gold' },
  // 🎄 Noël
  yeti: { skin: '#eef4ff', eyes: '#38bdf8', gown: '#c8d8ee', accs: [], skinFx: 'frost' },
  gingerbread: { skin: '#a0522d', eyes: '#ffffff', gown: '#f4f0e8', accs: [] },
  krampus: { skin: '#3b2a1e', eyes: '#ff2010', gown: '#1a120c', accs: ['horns', 'chains'] },
  // 🎃 Halloween
  mummy: { skin: '#d6cba8', eyes: '#ffd21a', gown: '#c8bc98', accs: ['bandages'] },
  pumpking: { skin: '#1a1208', eyes: '#ff9a00', gown: '#2a1a0a', accs: ['pumpkinhead'], skinFx: 'inferno' },
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
