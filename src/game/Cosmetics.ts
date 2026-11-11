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
  gownFx?: 'gold' | 'neon' | 'white';
  hairFx?: 'neon';
  extras?: ('stethoscope' | 'mohawk' | 'stripes')[];
}

export const HUMAN_OUTFITS: Record<string, HumanOutfit> = {
  surgeon: { gown: '#4f8a6a', accs: ['surgcap', 'mask'] },
  doctor: { gown: '#f2f2ec', accs: ['glasses'], gownFx: 'white', extras: ['stethoscope'] },
  prisoner: { gown: '#e8741a', accs: ['beanie'], extras: ['stripes'] },
  punk: { gown: '#1a1a1e', hair: '#ff3aa8', accs: [], extras: ['mohawk'] },
  gold: { gown: '#d4a840', hair: '#e8c860', accs: ['shades'], gownFx: 'gold' },
  neon: { gown: '#0a1a20', hair: '#ff3ad8', accs: ['headphones'], gownFx: 'neon', hairFx: 'neon' },
};

export const buildHumanAccessory = (id: string, track: Track): THREE.Group => {
  const g = new THREE.Group();
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
  skinFx?: 'bone' | 'inferno' | 'shadow' | 'gold';
}

export const MONSTER_OUTFITS: Record<string, MonsterOutfit> = {
  skeleton: { skin: '#e0dccb', eyes: '#ff2010', gown: '#151515', accs: [], skinFx: 'bone' },
  zombie: { skin: '#6f8a4a', eyes: '#ffd21a', gown: '#5a4030', accs: ['bandages'] },
  demon: { skin: '#a01818', eyes: '#ffd21a', gown: '#1a0a0a', accs: ['horns'] },
  inferno: { skin: '#2a1a14', eyes: '#ff8a00', gown: '#1a1010', accs: ['horns'], skinFx: 'inferno' },
  shadow: { skin: '#0c0c10', eyes: '#c03aff', gown: '#050505', accs: [], skinFx: 'shadow' },
  goldm: { skin: '#d4a840', eyes: '#ffffff', gown: '#3a2a10', accs: ['chains'], skinFx: 'gold' },
};

export const buildMonsterAccessory = (id: string, track: Track): THREE.Group => {
  const g = new THREE.Group();
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
