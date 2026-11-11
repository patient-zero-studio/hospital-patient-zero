import * as THREE from 'three';
import type { GameItem } from '../types';

/**
 * Realistic little 3D models of the items, used when an item lies in the
 * world (dropped by a player or left on a table). Sizes are real-world.
 * Every model also gets an invisible, bigger hit box so it is easy to aim at.
 */

type Track = <T extends { dispose: () => void }>(o: T) => T;

const add = (track: Track, parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) => {
  const m = new THREE.Mesh(track(geo), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
};
const mat = (track: Track, color: number, p: THREE.MeshStandardMaterialParameters = {}) =>
  track(new THREE.MeshStandardMaterial({ color, roughness: 0.55, ...p }));

/** Label texture (brand names on packs, batteries…). */
const label = (track: Track, bg: string, fg: string, text: string, w = 128, h = 48) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.fillStyle = fg;
  g.font = `bold ${Math.floor(h * 0.42)}px Arial`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2);
  const t = track(new THREE.CanvasTexture(c));
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
};

export const buildItemModel = (item: GameItem, track: Track): THREE.Group => {
  const g = new THREE.Group();
  const kind = item.type;
  switch (kind) {
    case 'battery': {
      // D-cell lying on its side: black body, copper top, + terminal
      const body = new THREE.Group();
      body.rotation.z = Math.PI / 2;
      body.position.y = 0.017;
      g.add(body);
      add(track, body, new THREE.CylinderGeometry(0.017, 0.017, 0.042, 20), mat(track, 0xffffff, { map: label(track, '#111', '#e8b04a', 'POWER+'), roughness: 0.4 }), 0, -0.009, 0);
      add(track, body, new THREE.CylinderGeometry(0.017, 0.017, 0.018, 20), mat(track, 0xc8762a, { metalness: 0.8, roughness: 0.3 }), 0, 0.021, 0);
      add(track, body, new THREE.CylinderGeometry(0.005, 0.005, 0.004, 10), mat(track, 0xd0d0d0, { metalness: 1, roughness: 0.2 }), 0, 0.032, 0);
      break;
    }
    case 'medkit': {
      // Adrenaline auto-injector: yellow pen, blue safety cap, orange tip
      const pen = new THREE.Group();
      pen.rotation.z = Math.PI / 2;
      pen.position.y = 0.012;
      g.add(pen);
      add(track, pen, new THREE.CylinderGeometry(0.012, 0.012, 0.11, 16), mat(track, 0xffffff, { map: label(track, '#f2c81a', '#222', 'ADRÉNALINE', 160, 40) }));
      add(track, pen, new THREE.CylinderGeometry(0.011, 0.012, 0.025, 16), mat(track, 0x2a5ad8), 0, 0.065, 0);
      add(track, pen, new THREE.CylinderGeometry(0.012, 0.009, 0.02, 16), mat(track, 0xff6a10), 0, -0.064, 0);
      break;
    }
    case 'sedative': {
      // Syringe: clear barrel with green liquid, plunger, needle
      const s = new THREE.Group();
      s.rotation.z = Math.PI / 2;
      s.position.y = 0.01;
      g.add(s);
      add(track, s, new THREE.CylinderGeometry(0.008, 0.008, 0.07, 14), track(new THREE.MeshPhysicalMaterial({ color: 0xddeeff, transparent: true, opacity: 0.35, roughness: 0.05 })));
      add(track, s, new THREE.CylinderGeometry(0.0065, 0.0065, 0.045, 12), mat(track, 0x6aff4a, { emissive: 0x1a6a10, emissiveIntensity: 0.6 }), 0, -0.01, 0);
      add(track, s, new THREE.CylinderGeometry(0.002, 0.002, 0.05, 6), mat(track, 0xaaaaaa, { metalness: 1 }), 0, 0.06, 0);
      add(track, s, new THREE.CylinderGeometry(0.0015, 0.0003, 0.03, 6), mat(track, 0xdddddd, { metalness: 1, roughness: 0.1 }), 0, -0.05, 0);
      add(track, s, new THREE.BoxGeometry(0.03, 0.003, 0.012), mat(track, 0xdddddd), 0, 0.034, 0);
      add(track, s, new THREE.CylinderGeometry(0.009, 0.009, 0.003, 12), mat(track, 0xdddddd), 0, 0.086, 0);
      break;
    }
    case 'food': {
      // Cereal bar in its wrapper (crimped ends)
      const wrap = mat(track, 0xffffff, { map: label(track, '#c8321e', '#ffe9a8', 'CÉRÉALES', 160, 48), roughness: 0.35, metalness: 0.3 });
      add(track, g, new THREE.BoxGeometry(0.11, 0.018, 0.035), wrap, 0, 0.009, 0);
      for (const s of [-1, 1]) add(track, g, new THREE.BoxGeometry(0.012, 0.006, 0.033), mat(track, 0xb8b8b8, { metalness: 0.6, roughness: 0.3 }), s * 0.061, 0.009, 0);
      break;
    }
    case 'alarm': {
      // Twin-bell alarm clock
      const red = mat(track, 0xb81818, { roughness: 0.35, metalness: 0.4 });
      const steel = mat(track, 0xc8ccd0, { metalness: 1, roughness: 0.25 });
      const body = add(track, g, new THREE.CylinderGeometry(0.045, 0.045, 0.035, 24), red, 0, 0.06, 0);
      body.rotation.x = Math.PI / 2;
      const face = add(track, g, new THREE.CircleGeometry(0.04, 24), mat(track, 0xf4f0e6, { roughness: 0.8 }), 0, 0.06, 0.0181);
      face.castShadow = false;
      // hands
      add(track, g, new THREE.BoxGeometry(0.003, 0.028, 0.002), mat(track, 0x111111), 0, 0.072, 0.019);
      add(track, g, new THREE.BoxGeometry(0.02, 0.003, 0.002), mat(track, 0x111111), 0.008, 0.06, 0.019).rotation.z = 0.5;
      for (const s of [-1, 1]) {
        const bell = add(track, g, new THREE.SphereGeometry(0.022, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), steel, s * 0.03, 0.1, 0);
        bell.rotation.z = -s * 0.5;
        const leg = add(track, g, new THREE.CylinderGeometry(0.004, 0.006, 0.03, 8), steel, s * 0.03, 0.015, 0);
        leg.rotation.z = s * 0.4;
      }
      add(track, g, new THREE.BoxGeometry(0.004, 0.02, 0.004), steel, 0, 0.11, 0);
      break;
    }
    case 'throwable': {
      const can = add(track, g, new THREE.CylinderGeometry(0.033, 0.033, 0.12, 20), mat(track, 0xffffff, { map: label(track, '#c41a1a', '#fff', 'ZÉRO', 128, 64), metalness: 0.6, roughness: 0.3 }), 0, 0.06, 0);
      can.rotation.y = 1;
      break;
    }
    case 'key': {
      // Brass key: bow ring, shaft, bit
      const brass = mat(track, 0xc8a040, { metalness: 0.9, roughness: 0.3 });
      const k = new THREE.Group();
      k.rotation.x = -Math.PI / 2;
      k.position.y = 0.003;
      g.add(k);
      add(track, k, new THREE.TorusGeometry(0.014, 0.004, 8, 18), brass, -0.035, 0, 0);
      add(track, k, new THREE.BoxGeometry(0.055, 0.007, 0.003), brass, 0.005, 0, 0);
      for (let i = 0; i < 3; i++) add(track, k, new THREE.BoxGeometry(0.005, 0.01 + (i % 2) * 0.005, 0.003), brass, 0.015 + i * 0.008, -0.008, 0);
      break;
    }
    case 'keycard': {
      add(track, g, new THREE.BoxGeometry(0.085, 0.002, 0.054), mat(track, 0xffffff, { map: label(track, '#1e3a8a', '#fff', 'NIVEAU 2', 170, 108), roughness: 0.4 }), 0, 0.001, 0);
      break;
    }
    case 'fuse': {
      // Industrial cartridge fuse: ceramic body, metal end caps
      const f = new THREE.Group();
      f.rotation.z = Math.PI / 2;
      f.position.y = 0.018;
      g.add(f);
      add(track, f, new THREE.CylinderGeometry(0.016, 0.016, 0.07, 16), mat(track, 0xece6d6, { roughness: 0.8 }));
      for (const s of [-1, 1]) add(track, f, new THREE.CylinderGeometry(0.018, 0.018, 0.016, 16), mat(track, 0xb0b4b8, { metalness: 1, roughness: 0.25 }), 0, s * 0.04, 0);
      break;
    }
    case 'tool': {
      const wood = mat(track, 0x8a6a44, { roughness: 0.85 });
      for (let i = 0; i < 3; i++) add(track, g, new THREE.BoxGeometry(1.0, 0.03, 0.12), wood, 0, 0.015 + i * 0.031, (i - 1) * 0.02).rotation.y = (i - 1) * 0.08;
      break;
    }
    case 'coins': {
      // A little pile of coins
      const gold = mat(track, 0xd8b040, { metalness: 0.9, roughness: 0.25 });
      for (let i = 0; i < 6; i++) {
        const coin = add(track, g, new THREE.CylinderGeometry(0.012, 0.012, 0.003, 16), gold, (Math.random() - 0.5) * 0.04, 0.002 + i * 0.0032, (Math.random() - 0.5) * 0.04);
        coin.rotation.x = (Math.random() - 0.5) * 0.1;
      }
      break;
    }
    default:
      add(track, g, new THREE.BoxGeometry(0.08, 0.06, 0.06), mat(track, 0x6b5236, { roughness: 0.95 }), 0, 0.03, 0);
  }
  // Easy-to-aim invisible hit box
  const hit = new THREE.Mesh(track(new THREE.BoxGeometry(0.32, 0.22, 0.32)), track(new THREE.MeshBasicMaterial({ visible: false })));
  hit.position.y = 0.08;
  g.add(hit);
  return g;
};
