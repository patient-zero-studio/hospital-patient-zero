import * as THREE from 'three';
import type { CollisionBox, MapData } from './MapBuilder';
import { SEASON_INFO, type Season } from '../seasons';

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
  let seed = { noel: 1225, halloween: 1031, paques: 420, valentin: 214, poisson: 401, chevaliers: 1415 }[season];
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  // ---- Shared geometries & materials ----
  const mat = (color: number, opts: THREE.MeshStandardMaterialParameters = {}) => track(new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...opts }));
  const glow = (color: number) => track(new THREE.MeshBasicMaterial({ color }));
  const bulbGeo = track(new THREE.SphereGeometry(0.035, 8, 6));
  const bulbMats = SEASON_INFO[season].bulbs.map((c) => glow(new THREE.Color(c).getHex()));

  const mesh = (geo: THREE.BufferGeometry, m: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0) => {
    const o = new THREE.Mesh(geo, m);
    o.position.set(x, y, z);
    parent.add(o);
    return o;
  };

  // ---- ⚔️ Knights' tournament: banners on the walls, shields and crossed swords ----
  const bannerColors = [0x1d3a8a, 0x9a0c18, 0x14532d, 0x4a1d6a].map((c) => mat(c, { roughness: 0.9, side: THREE.DoubleSide }));
  const goldTrim = mat(0xd4a840, { metalness: 0.8, roughness: 0.3, emissive: 0x3a2800, emissiveIntensity: 0.4 });
  const steel = mat(0xb8bcc4, { metalness: 0.9, roughness: 0.3 });
  const bannerGeo = track(new THREE.PlaneGeometry(0.7, 1.3));
  const rodGeo = track(new THREE.CylinderGeometry(0.02, 0.02, 0.86, 6));
  const crestGeo = track(new THREE.CircleGeometry(0.16, 6));
  const banner = () => {
    const g = new THREE.Group();
    mesh(bannerGeo, bannerColors[Math.floor(rnd() * bannerColors.length)], g, 0, -0.65, 0);
    mesh(rodGeo, goldTrim, g, 0, 0, 0.01).rotation.z = Math.PI / 2;
    mesh(crestGeo, goldTrim, g, 0, -0.55, 0.01);
    return g;
  };
  const shieldGeo = track(new THREE.CylinderGeometry(0.28, 0.28, 0.05, 6));
  const bladeGeo = track(new THREE.BoxGeometry(0.06, 0.9, 0.015));
  const hiltGeo = track(new THREE.BoxGeometry(0.24, 0.04, 0.04));
  const armory = () => {
    const g = new THREE.Group();
    const sh = mesh(shieldGeo, bannerColors[Math.floor(rnd() * bannerColors.length)], g, 0, 0.32, 0);
    sh.rotation.x = Math.PI / 2 - 0.25;
    const rim = mesh(crestGeo, goldTrim, g, 0, 0.33, 0.04);
    rim.rotation.x = -0.25;
    rim.scale.setScalar(0.5);
    for (const s of [-1, 1]) {
      const sw = new THREE.Group();
      sw.position.set(s * 0.35, 0.5, -0.05);
      sw.rotation.z = s * 0.35;
      mesh(bladeGeo, steel, sw, 0, 0, 0);
      mesh(hiltGeo, goldTrim, sw, 0, -0.38, 0);
      g.add(sw);
    }
    return g;
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

  // ---- Easter: baskets of painted eggs ----
  const eggGeo = track(new THREE.SphereGeometry(0.07, 14, 10));
  const eggMats = [0xfde68a, 0xa7f3d0, 0xfbcfe8, 0xbfdbfe, 0xddd6fe, 0xfca5a5].map((c) => mat(c, { roughness: 0.4 }));
  const basketGeo = track(new THREE.CylinderGeometry(0.26, 0.2, 0.16, 16, 1, true));
  const basketMat = mat(0x9a6a30, { roughness: 1, side: THREE.DoubleSide });
  const grassGeo = track(new THREE.CircleGeometry(0.25, 16));
  const grassMat = mat(0x7ccf5a, { roughness: 1 });
  const handleGeo = track(new THREE.TorusGeometry(0.24, 0.015, 6, 20, Math.PI));
  const eggBasket = () => {
    const g = new THREE.Group();
    mesh(basketGeo, basketMat, g, 0, 0.08);
    mesh(grassGeo, grassMat, g, 0, 0.13).rotation.x = -Math.PI / 2;
    mesh(handleGeo, basketMat, g, 0, 0.15);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + rnd();
      const e = mesh(eggGeo, eggMats[i % eggMats.length], g, Math.cos(a) * 0.12, 0.17, Math.sin(a) * 0.12);
      e.scale.set(0.8, 1.1, 0.8);
      e.rotation.z = (rnd() - 0.5) * 0.8;
    }
    return g;
  };
  const eggsAround = () => {
    const g = new THREE.Group();
    for (let i = 0; i < 3 + Math.floor(rnd() * 3); i++) {
      const e = mesh(eggGeo, eggMats[Math.floor(rnd() * eggMats.length)], g, (rnd() - 0.5) * 0.6, 0.065, (rnd() - 0.5) * 0.4);
      e.scale.set(0.85, 1.15, 0.85);
      e.rotation.set((rnd() - 0.5) * 1.2, 0, (rnd() - 0.5) * 1.2);
    }
    return g;
  };

  // ---- Valentine's day: heart balloons and roses ----
  const heartShape = (() => {
    const sh = new THREE.Shape();
    const r = 0.16;
    sh.moveTo(0, -r);
    sh.bezierCurveTo(r * 1.3, -r * 0.1, r * 1.1, r * 1.1, 0, r * 0.45);
    sh.bezierCurveTo(-r * 1.1, r * 1.1, -r * 1.3, -r * 0.1, 0, -r);
    const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.06, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 3 });
    geo.center();
    return track(geo);
  })();
  const heartMats = [0xe11d48, 0xf472b6, 0xff2a6a].map((c) => mat(c, { roughness: 0.25, metalness: 0.3, emissive: c, emissiveIntensity: 0.15 }));
  const stringGeo = track(new THREE.CylinderGeometry(0.003, 0.003, 1, 4));
  const stringMat = mat(0xdddddd);
  const balloons = () => {
    const g = new THREE.Group();
    for (let i = 0; i < 2 + Math.floor(rnd() * 2); i++) {
      const h = 1.3 + rnd() * 0.6;
      const x = (rnd() - 0.5) * 0.4;
      const z = (rnd() - 0.5) * 0.3;
      mesh(heartShape, heartMats[i % heartMats.length], g, x, h, z).rotation.y = (rnd() - 0.5) * 0.8;
      mesh(stringGeo, stringMat, g, x * 0.5, (h - 0.16) / 2, z * 0.5).scale.y = h - 0.16;
    }
    mesh(giftGeo, mat(0x9d174d, { roughness: 0.7 }), g, 0, 0.04).scale.set(0.12, 0.08, 0.12);
    return g;
  };
  const roseGeo = track(new THREE.SphereGeometry(0.04, 10, 8));
  const roseStemGeo = track(new THREE.CylinderGeometry(0.006, 0.006, 0.35, 5));
  const vaseGeo = track(new THREE.CylinderGeometry(0.07, 0.05, 0.25, 12));
  const vaseMat = mat(0xe8f0f8, { roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.6 });
  const roses = () => {
    const g = new THREE.Group();
    mesh(vaseGeo, vaseMat, g, 0, 0.125);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const st = mesh(roseStemGeo, stemMat, g, Math.cos(a) * 0.03, 0.35, Math.sin(a) * 0.03);
      st.rotation.set(Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25);
      mesh(roseGeo, heartMats[0], g, Math.cos(a) * 0.075, 0.52, Math.sin(a) * 0.075);
    }
    return g;
  };

  // ---- April fools: paper fish stuck on the walls, fishbowls ----
  const fishShape = (() => {
    const sh = new THREE.Shape();
    sh.moveTo(0.22, 0);
    sh.quadraticCurveTo(0.08, 0.13, -0.1, 0.02);
    sh.lineTo(-0.2, 0.1);
    sh.lineTo(-0.17, 0);
    sh.lineTo(-0.2, -0.1);
    sh.lineTo(-0.1, -0.02);
    sh.quadraticCurveTo(0.08, -0.13, 0.22, 0);
    return track(new THREE.ShapeGeometry(sh));
  })();
  const paperMats = [0x38bdf8, 0xfb923c, 0xfacc15, 0xa3e635, 0xf472b6].map((c) => track(new THREE.MeshStandardMaterial({ color: c, roughness: 1, side: THREE.DoubleSide })));
  const bowlGeo = track(new THREE.SphereGeometry(0.2, 18, 14));
  const bowlMat = track(new THREE.MeshStandardMaterial({ color: 0x9fd8ff, roughness: 0.05, transparent: true, opacity: 0.35, depthWrite: false }));
  const fishbowl = () => {
    const g = new THREE.Group();
    mesh(bowlGeo, bowlMat, g, 0, 0.2);
    mesh(fishShape, paperMats[1], g, 0, 0.18, 0).scale.setScalar(0.5);
    const f2 = mesh(fishShape, paperMats[2], g, 0.06, 0.25, 0.05);
    f2.scale.setScalar(0.35);
    f2.rotation.y = 2.5;
    return g;
  };

  // ---- Garland of bulbs hanging along a wall ----
  const wireMat = mat(season === 'noel' ? 0x1f4a1f : season === 'valentin' ? 0x8a1030 : 0x111111, { roughness: 1 });
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
        if (season === 'poisson' && rnd() < 0.6) {
          // April fools paper fish taped to the wall
          deco = new THREE.Mesh(fishShape, paperMats[Math.floor(rnd() * paperMats.length)]);
          deco.position.set(wx - dx * 0.02, p.y + 0.9 + rnd() * 1.1, wz - dz * 0.02);
          deco.rotation.set(0, facing, (rnd() - 0.5) * 0.8);
          deco.scale.setScalar(1.2 + rnd() * 0.6);
        } else if (season === 'chevaliers') {
          deco = banner();
          deco.position.set(wx - dx * 0.03, p.y + 2.6, wz - dz * 0.03);
          deco.rotation.y = facing;
        } else if (season === 'halloween' && rnd() < 0.4) {
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
        else if (season === 'paques') deco = rnd() < 0.5 ? eggBasket() : eggsAround();
        else if (season === 'valentin') deco = rnd() < 0.55 ? balloons() : roses();
        else if (season === 'poisson') deco = rnd() < 0.5 ? fishbowl() : gifts();
        else if (season === 'chevaliers') deco = armory();
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

/** The event treat you pick up in the levels (bonbon, œuf, cœur…): a small glowing model. */
export const buildTreatModel = (season: Season, track: <T extends { dispose: () => void }>(o: T) => T): THREE.Group => {
  const g = new THREE.Group();
  const m = (color: number, emissive = 0.35) => track(new THREE.MeshStandardMaterial({ color, roughness: 0.35, emissive: color, emissiveIntensity: emissive }));
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) => {
    const o = new THREE.Mesh(track(geo), mat);
    o.position.set(x, y, z);
    g.add(o);
    return o;
  };
  const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
  switch (season) {
    case 'halloween': {
      // Wrapped candy
      const c = m(pick([0xff7a00, 0xa040ff, 0x7aff2a]));
      add(new THREE.SphereGeometry(0.07, 14, 10), c).scale.set(1.3, 1, 1);
      for (const side of [-1, 1]) add(new THREE.ConeGeometry(0.05, 0.08, 8), c, side * 0.12, 0, 0).rotation.z = (side * Math.PI) / 2;
      break;
    }
    case 'noel': {
      // Candy cane
      const red = m(0xe11d48);
      const white = m(0xffffff, 0.25);
      for (let i = 0; i < 6; i++) add(new THREE.CylinderGeometry(0.022, 0.022, 0.045, 10), i % 2 ? red : white, 0, -0.12 + i * 0.045, 0);
      add(new THREE.TorusGeometry(0.05, 0.022, 8, 16, Math.PI), red, -0.05, 0.135, 0);
      break;
    }
    case 'paques': {
      add(new THREE.SphereGeometry(0.075, 16, 12), m(pick([0xfde68a, 0xa7f3d0, 0xfbcfe8, 0xbfdbfe]))).scale.set(0.85, 1.15, 0.85);
      add(new THREE.TorusGeometry(0.066, 0.008, 6, 20), m(0x7c3aed, 0.2)).rotation.x = Math.PI / 2;
      break;
    }
    case 'valentin': {
      const sh = new THREE.Shape();
      const r = 0.08;
      sh.moveTo(0, -r);
      sh.bezierCurveTo(r * 1.3, -r * 0.1, r * 1.1, r * 1.1, 0, r * 0.45);
      sh.bezierCurveTo(-r * 1.1, r * 1.1, -r * 1.3, -r * 0.1, 0, -r);
      const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.04, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 2 });
      geo.center();
      add(geo, m(0xff2a6a, 0.5));
      break;
    }
    case 'chevaliers': {
      // A little coat of arms: a shield with a gold rim and a coloured field
      const field = m(pick([0x1d4ed8, 0xc8102e, 0x15803d]), 0.45);
      const gold = m(0xffd04a, 0.6);
      const shield = add(new THREE.CylinderGeometry(0.09, 0.09, 0.025, 6), gold);
      shield.rotation.x = Math.PI / 2;
      shield.scale.set(1, 1, 1.25);
      const inner = add(new THREE.CylinderGeometry(0.072, 0.072, 0.03, 6), field, 0, 0, 0.004);
      inner.rotation.x = Math.PI / 2;
      inner.scale.set(1, 1, 1.25);
      add(new THREE.BoxGeometry(0.02, 0.1, 0.035), gold, 0, 0, 0.01);
      break;
    }
    case 'poisson': {
      const c = m(0xfb923c, 0.4);
      add(new THREE.SphereGeometry(0.06, 14, 10), c).scale.set(1.7, 0.8, 0.6);
      const tail = add(new THREE.ConeGeometry(0.05, 0.08, 4), c, -0.13, 0, 0);
      tail.rotation.z = -Math.PI / 2;
      tail.scale.z = 0.3;
      break;
    }
  }
  return g;
};

/** 🎁 Christmas night present: a wrapped box with a glowing bow. */
export const buildPresentModel = (track: <T extends { dispose: () => void }>(o: T) => T): THREE.Group => {
  const g = new THREE.Group();
  const colors = [0xc8102e, 0x15803d, 0x1d4ed8, 0xd4a840];
  const paper = track(new THREE.MeshStandardMaterial({ color: colors[Math.floor(Math.random() * colors.length)], roughness: 0.5, emissive: 0x200000, emissiveIntensity: 0.3 }));
  const ribbon = track(new THREE.MeshStandardMaterial({ color: 0xffe9a0, roughness: 0.3, metalness: 0.4, emissive: 0x806020, emissiveIntensity: 0.6 }));
  const geo = track(new THREE.BoxGeometry(1, 1, 1));
  const add = (m: THREE.Material, sx: number, sy: number, sz: number, y: number) => {
    const o = new THREE.Mesh(geo, m);
    o.scale.set(sx, sy, sz);
    o.position.y = y;
    g.add(o);
  };
  add(paper, 0.3, 0.26, 0.3, 0.13);
  add(ribbon, 0.31, 0.27, 0.05, 0.13);
  add(ribbon, 0.05, 0.27, 0.31, 0.13);
  for (const s of [-1, 1]) {
    const bow = new THREE.Mesh(track(new THREE.TorusGeometry(0.045, 0.014, 6, 12)), ribbon);
    bow.position.set(s * 0.04, 0.3, 0);
    bow.rotation.y = Math.PI / 2;
    bow.rotation.x = s * 0.5;
    g.add(bow);
  }
  return g;
};

/** 💎 Rare chest (250 treats): a small wooden chest with gold trim and a glow. */
export const buildChestModel = (season: Season, track: <T extends { dispose: () => void }>(o: T) => T): THREE.Group => {
  const g = new THREE.Group();
  const wood = track(new THREE.MeshStandardMaterial({ color: 0x6b3f1d, roughness: 0.8 }));
  const gold = track(new THREE.MeshStandardMaterial({ color: 0xe8c040, metalness: 0.9, roughness: 0.25, emissive: 0x6a4a00, emissiveIntensity: 0.5 }));
  const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number) => {
    const o = new THREE.Mesh(track(new THREE.BoxGeometry(w, h, d)), m);
    o.position.set(x, y, z);
    g.add(o);
    return o;
  };
  box(0.6, 0.32, 0.4, wood, 0, 0.16, 0);
  const lid = new THREE.Mesh(track(new THREE.CylinderGeometry(0.2, 0.2, 0.6, 16, 1, false, 0, Math.PI)), wood);
  lid.rotation.z = Math.PI / 2;
  lid.position.y = 0.32;
  g.add(lid);
  for (const x of [-0.24, 0.24]) box(0.05, 0.34, 0.42, gold, x, 0.17, 0);
  box(0.08, 0.1, 0.03, gold, 0, 0.3, 0.205);
  // Coloured glow of the event around it
  const glow = track(new THREE.MeshBasicMaterial({ color: new THREE.Color(SEASON_INFO[season].color), transparent: true, opacity: 0.4, depthWrite: false, side: THREE.BackSide }));
  const halo = new THREE.Mesh(track(new THREE.SphereGeometry(0.62, 18, 12)), glow);
  halo.position.y = 0.25;
  halo.scale.y = 0.7;
  g.add(halo);
  g.userData.glow = glow;
  return g;
};

/** Where to drop the treats: open floor next to the walk graph. */
export const treatSpots = (map: MapData, count: number): THREE.Vector3[] => {
  const boxes = map.collisionBoxes.filter((b) => !b.disabled);
  const nodes = [...map.navNodes.values()];
  const out: THREE.Vector3[] = [];
  for (let tries = 0; tries < count * 15 && out.length < count && nodes.length; tries++) {
    const n = nodes[Math.floor(Math.random() * nodes.length)];
    const a = Math.random() * Math.PI * 2;
    const r = 0.4 + Math.random() * 1.4;
    const x = n.pos.x + Math.cos(a) * r;
    const z = n.pos.z + Math.sin(a) * r;
    if (boxes.some((b) => x > b.min.x - 0.35 && x < b.max.x + 0.35 && z > b.min.z - 0.35 && z < b.max.z + 0.35)) continue;
    if (out.some((o) => (o.x - x) ** 2 + (o.z - z) ** 2 < 16)) continue;
    out.push(new THREE.Vector3(x, n.pos.y + 0.45, z));
  }
  return out;
};
