import * as THREE from 'three';
import type { CollisionBox, MapData } from './MapBuilder';
import type { Season } from '../seasons';

/**
 * Event decorations scattered in the levels: Christmas trees, presents and
 * light garlands for Christmas; jack-o'-lanterns, candles, cobwebs and
 * orange / purple garlands for Halloween. Placed against the walls next to
 * the AI walk graph, so they never block a corridor. No real lights (cheap):
 * glowing materials only.
 */
export const buildSeasonalDecor = (season: Season, map: MapData): { group: THREE.Group; disposables: { dispose: () => void }[] } => {
  const group = new THREE.Group();
  group.name = `decor-${season}`;
  const disposables: { dispose: () => void }[] = [];
  const track = <T extends { dispose: () => void }>(o: T) => {
    disposables.push(o);
    return o;
  };

  // Deterministic: everyone sees the same decorations
  let seed = season === 'noel' ? 1225 : 1031;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  // ---- Shared geometries & materials ----
  const mat = (color: number, opts: THREE.MeshStandardMaterialParameters = {}) => track(new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...opts }));
  const glow = (color: number) => track(new THREE.MeshBasicMaterial({ color }));
  const bulbGeo = track(new THREE.SphereGeometry(0.035, 8, 6));
  const bulbMats = (season === 'noel' ? [0xff2a2a, 0x2aff5a, 0xffd21a, 0x3a8aff, 0xff5ad8] : [0xff7a00, 0xa040ff, 0x7aff2a]).map(glow);

  const mesh = (geo: THREE.BufferGeometry, m: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0) => {
    const o = new THREE.Mesh(geo, m);
    o.position.set(x, y, z);
    parent.add(o);
    return o;
  };

  // ---- Christmas ----
  const treeLeaves = mat(0x1f5a2a, { roughness: 0.9 });
  const trunk = mat(0x4a2e1a, { roughness: 1 });
  const cones = [0.55, 0.45, 0.33].map((r, i) => track(new THREE.ConeGeometry(r, 0.6 - i * 0.08, 10)));
  const trunkGeo = track(new THREE.CylinderGeometry(0.06, 0.08, 0.25, 8));
  const starGeo = track(new THREE.OctahedronGeometry(0.08, 0));
  const ballGeo = track(new THREE.SphereGeometry(0.045, 10, 8));
  const ballMats = [0xc8102e, 0xd4a840, 0x2a6aff, 0xe8e8e8].map((c) => mat(c, { metalness: 0.7, roughness: 0.25 }));
  const tree = (scale: number) => {
    const g = new THREE.Group();
    mesh(trunkGeo, trunk, g, 0, 0.12);
    cones.forEach((geo, i) => mesh(geo, treeLeaves, g, 0, 0.5 + i * 0.36));
    mesh(starGeo, glow(0xffe060), g, 0, 1.42).scale.y = 1.4;
    for (let i = 0; i < 14; i++) {
      const lvl = i % 3;
      const r = [0.5, 0.4, 0.28][lvl];
      const y = 0.32 + lvl * 0.36 + rnd() * 0.1;
      const a = rnd() * Math.PI * 2;
      const m = i % 2 ? ballMats[i % ballMats.length] : bulbMats[i % bulbMats.length];
      mesh(i % 2 ? ballGeo : bulbGeo, m, g, Math.cos(a) * r * 0.85, y, Math.sin(a) * r * 0.85);
    }
    g.scale.setScalar(scale);
    return g;
  };
  const giftGeo = track(new THREE.BoxGeometry(1, 1, 1));
  const giftMats = [0xc8102e, 0x15803d, 0x2a4aaa, 0xd4a840, 0x8a2aaa].map((c) => mat(c, { roughness: 0.7 }));
  const ribbon = mat(0xf4f4f0, { roughness: 0.5 });
  const gifts = () => {
    const g = new THREE.Group();
    const n = 2 + Math.floor(rnd() * 3);
    for (let i = 0; i < n; i++) {
      const w = 0.18 + rnd() * 0.18;
      const h = 0.14 + rnd() * 0.2;
      const box = new THREE.Group();
      box.position.set((rnd() - 0.5) * 0.5, 0, (rnd() - 0.5) * 0.4);
      box.rotation.y = rnd() * Math.PI;
      g.add(box);
      mesh(giftGeo, giftMats[Math.floor(rnd() * giftMats.length)], box, 0, h / 2).scale.set(w, h, w);
      mesh(giftGeo, ribbon, box, 0, h / 2).scale.set(w * 1.02, h * 1.02, 0.03);
      mesh(giftGeo, ribbon, box, 0, h / 2).scale.set(0.03, h * 1.02, w * 1.02);
    }
    return g;
  };

  // ---- Halloween ----
  const pumpkinGeo = (() => {
    const geo = new THREE.SphereGeometry(0.2, 20, 14);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const z = p.getZ(i);
      const k = 1 - 0.08 * Math.abs(Math.sin(Math.atan2(z, x) * 5));
      p.setXYZ(i, x * k, p.getY(i) * 0.78, z * k);
    }
    geo.computeVertexNormals();
    return track(geo);
  })();
  const pumpkinMat = mat(0xe8701a, { roughness: 0.55, emissive: 0x401000, emissiveIntensity: 0.4 });
  const stemGeo = track(new THREE.CylinderGeometry(0.015, 0.025, 0.08, 6));
  const stemMat = mat(0x3f5a1a, { roughness: 0.9 });
  const faceMat = glow(0xffb020);
  const eyeGeo = track(new THREE.CircleGeometry(0.04, 3));
  const mouthGeo = (() => {
    const s = new THREE.Shape();
    s.moveTo(-0.1, 0);
    for (let i = 0; i <= 6; i++) s.lineTo(-0.1 + (i * 0.2) / 6, i % 2 ? -0.018 : 0.018);
    s.lineTo(0.1, 0);
    s.quadraticCurveTo(0, -0.08, -0.1, 0);
    return track(new THREE.ShapeGeometry(s));
  })();
  const pumpkin = (scale: number) => {
    const g = new THREE.Group();
    mesh(pumpkinGeo, pumpkinMat, g, 0, 0.156);
    mesh(stemGeo, stemMat, g, 0, 0.33).rotation.z = 0.3;
    for (const side of [-1, 1]) {
      const e = mesh(eyeGeo, faceMat, g, side * 0.07, 0.2, 0.18);
      e.rotation.set(-0.2, side * 0.35, Math.PI / 2);
    }
    mesh(mouthGeo, faceMat, g, 0, 0.13, 0.195).rotation.x = 0.1;
    g.scale.setScalar(scale);
    return g;
  };
  const candleGeo = track(new THREE.CylinderGeometry(0.025, 0.025, 1, 10));
  const candleMat = mat(0xeee8d0, { roughness: 0.8 });
  const flameGeo = track(new THREE.ConeGeometry(0.014, 0.05, 8));
  const flameMat = glow(0xffc040);
  const candles = () => {
    const g = new THREE.Group();
    for (let i = 0; i < 3 + Math.floor(rnd() * 3); i++) {
      const h = 0.08 + rnd() * 0.22;
      const x = (rnd() - 0.5) * 0.3;
      const z = (rnd() - 0.5) * 0.25;
      mesh(candleGeo, candleMat, g, x, h / 2, z).scale.y = h;
      mesh(flameGeo, flameMat, g, x, h + 0.03, z);
    }
    return g;
  };
  const webTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const ctx = c.getContext('2d')!;
    ctx.strokeStyle = 'rgba(235,235,235,0.75)';
    ctx.lineWidth = 1.6;
    // Corner web: spokes from the top-left corner + sagging threads
    const spokes = 7;
    for (let i = 0; i <= spokes; i++) {
      const a = (i / spokes) * (Math.PI / 2);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * 256, Math.sin(a) * 256);
      ctx.stroke();
    }
    for (let r = 30; r < 250; r += 28) {
      ctx.beginPath();
      for (let i = 0; i <= spokes; i++) {
        const a = (i / spokes) * (Math.PI / 2);
        const sag = i === 0 ? 1 : 0.9;
        const x = Math.cos(a) * r * sag;
        const y = Math.sin(a) * r * sag;
        if (i === 0) ctx.moveTo(x, y);
        else {
          const pa = ((i - 0.5) / spokes) * (Math.PI / 2);
          ctx.quadraticCurveTo(Math.cos(pa) * r * 0.82, Math.sin(pa) * r * 0.82, x, y);
        }
      }
      ctx.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return track(t);
  })();
  const webMat = track(new THREE.MeshBasicMaterial({ map: webTex, transparent: true, depthWrite: false, side: THREE.DoubleSide, opacity: 0.7 }));
  const webGeo = track(new THREE.PlaneGeometry(1.1, 1.1));

  // ---- Garland of bulbs hanging along a wall ----
  const wireMat = mat(season === 'noel' ? 0x1f4a1f : 0x111111, { roughness: 1 });
  const garland = (len: number) => {
    const g = new THREE.Group();
    const n = Math.max(6, Math.round(len / 0.22));
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = (t - 0.5) * len;
      // Two sagging swags
      const y = -Math.abs(Math.sin(t * Math.PI * 2)) * 0.22;
      pts.push(new THREE.Vector3(x, y, 0));
      if (i > 0 && i < n) mesh(bulbGeo, bulbMats[i % bulbMats.length], g, x, y - 0.035, 0.02);
    }
    const tube = track(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), n * 3, 0.008, 4));
    mesh(tube, wireMat, g);
    return g;
  };

  // ---- Where: against a wall, next to the walk graph ----
  const boxes = map.collisionBoxes.filter((b) => !b.doorId && !b.disabled);
  const doors = map.collisionBoxes.filter((b) => b.doorId);
  const inside = (b: CollisionBox, x: number, z: number, pad = 0) => x > b.min.x - pad && x < b.max.x + pad && z > b.min.z - pad && z < b.max.z + pad;
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  const used: THREE.Vector3[] = [];
  const nodes = [...map.navNodes.values()];
  // Shuffle so decorations spread over the whole map
  for (let i = nodes.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [nodes[i], nodes[j]] = [nodes[j], nodes[i]];
  }
  let floorItems = 0;
  let wallItems = 0;
  const MAX_FLOOR = 55;
  const MAX_WALL = 45;
  for (const node of nodes) {
    if (floorItems >= MAX_FLOOR && wallItems >= MAX_WALL) break;
    const p = node.pos;
    const near = boxes.filter((b) => inside(b, p.x, p.z, 4));
    for (const [dx, dz] of dirs) {
      // Distance to the first wall in that direction
      let hit = 0;
      for (let t = 0.3; t <= 4; t += 0.1) {
        const x = p.x + dx * t;
        const z = p.z + dz * t;
        if (near.some((b) => inside(b, x, z))) {
          hit = t;
          break;
        }
      }
      if (hit < 0.9) continue;
      const wx = p.x + dx * (hit - 0.02);
      const wz = p.z + dz * (hit - 0.02);
      // The wall must continue on both sides (not a pillar / furniture edge)
      const along = [-dz, dx];
      const solid = [-0.7, 0.7].every((o) => near.some((b) => inside(b, wx + dx * 0.1 + along[0] * o, wz + dz * 0.1 + along[1] * o)));
      if (!solid) continue;
      // Away from doors and from other decorations
      const spot = new THREE.Vector3(wx, p.y, wz);
      if (doors.some((d) => inside(d, wx, wz, 1.4))) continue;
      if (used.some((u) => u.distanceToSquared(spot) < 9)) continue;
      const facing = Math.atan2(-dx, -dz); // looking away from the wall
      const wantWall = wallItems < MAX_WALL && (floorItems >= MAX_FLOOR || rnd() < 0.45);
      if (wantWall) {
        let deco: THREE.Object3D;
        if (season === 'halloween' && rnd() < 0.4) {
          // Cobweb in the upper corner area of that wall
          deco = new THREE.Mesh(webGeo, webMat);
          deco.position.set(wx - dx * 0.03, p.y + 2.75, wz - dz * 0.03);
          deco.rotation.set(0, facing, rnd() < 0.5 ? 0 : Math.PI / 2);
        } else {
          deco = garland(1.6 + rnd() * 1.2);
          deco.position.set(wx - dx * 0.04, p.y + 2.55, wz - dz * 0.04);
          deco.rotation.y = facing;
        }
        group.add(deco);
        wallItems++;
      } else if (floorItems < MAX_FLOOR) {
        const off = 0.35;
        const fx = wx - dx * off;
        const fz = wz - dz * off;
        // Don't put things inside furniture
        if (near.some((b) => inside(b, fx, fz, 0.25))) continue;
        let deco: THREE.Object3D;
        if (season === 'noel') deco = rnd() < 0.45 ? tree(0.8 + rnd() * 0.5) : gifts();
        else {
          const r = rnd();
          if (r < 0.6) {
            deco = new THREE.Group();
            deco.add(pumpkin(0.9 + rnd() * 0.6));
            if (rnd() < 0.5) {
              const small = pumpkin(0.55);
              small.position.set(0.32, 0, 0.1);
              small.rotation.y = -0.5;
              deco.add(small);
            }
          } else deco = candles();
        }
        deco.position.set(fx, p.y, fz);
        deco.rotation.y = facing + (rnd() - 0.5) * 0.6;
        group.add(deco);
        floorItems++;
      } else continue;
      used.push(spot);
      break;
    }
  }
  group.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = false;
      o.receiveShadow = false;
    }
  });
  return { group, disposables };
};
