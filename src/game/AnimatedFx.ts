import * as THREE from 'three';

/**
 * ✨ Animated skins: effects worn around a body (human or creature).
 * Built at the model's feet (y = 0), `height` = top of the head.
 */
type Track = <T extends { dispose: () => void }>(o: T) => T;

export interface FxHandle {
  group: THREE.Group;
  tick(dt: number): void;
  /** "rainbow" eyes: colour for this frame */
  eyes?: () => THREE.Color;
}

const glow = (track: Track, color: number, opacity: number) =>
  track(
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    })
  );

const noShadow = (o: THREE.Object3D) =>
  o.traverse((c) => {
    c.castShadow = false;
    c.receiveShadow = false;
  });

export const buildFx = (id: string, track: Track, height: number, monster: boolean): FxHandle | null => {
  const g = new THREE.Group();
  let t = Math.random() * 10;
  switch (id) {
    case 'aura': {
      const color = monster ? 0xff1a3a : 0x3ae0ff;
      const ring = new THREE.Mesh(track(new THREE.RingGeometry(0.42, 0.62, 40)), glow(track, color, 0.7));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.03;
      const ring2 = new THREE.Mesh(track(new THREE.RingGeometry(0.66, 0.7, 40)), glow(track, color, 0.5));
      ring2.rotation.x = -Math.PI / 2;
      ring2.position.y = 0.04;
      const colMat = glow(track, color, 0.12);
      const col = new THREE.Mesh(track(new THREE.CylinderGeometry(0.5, 0.62, height * 1.05, 28, 1, true)), colMat);
      col.position.y = (height * 1.05) / 2;
      g.add(ring, ring2, col);
      // little lights rising in spirals
      const motes: THREE.Mesh[] = [];
      const moteGeo = track(new THREE.SphereGeometry(0.025, 6, 4));
      const moteMat = glow(track, color, 0.9);
      for (let i = 0; i < 10; i++) {
        const m = new THREE.Mesh(moteGeo, moteMat);
        m.userData.p = i / 10;
        motes.push(m);
        g.add(m);
      }
      noShadow(g);
      return {
        group: g,
        tick(dt) {
          t += dt;
          const pulse = 0.5 + 0.5 * Math.sin(t * 3);
          ring.rotation.z += dt * 1.2;
          ring.scale.setScalar(1 + pulse * 0.12);
          ring2.scale.setScalar(1 + ((t * 0.6) % 1) * 0.6);
          (ring2.material as THREE.MeshBasicMaterial).opacity = 0.5 * (1 - ((t * 0.6) % 1));
          colMat.opacity = 0.07 + pulse * 0.09;
          for (const m of motes) {
            const p = (m.userData.p + t * 0.25) % 1;
            const a = p * Math.PI * 6 + m.userData.p * 20;
            m.position.set(Math.cos(a) * 0.55, p * height * 1.05, Math.sin(a) * 0.55);
            m.scale.setScalar(1 - p * 0.7);
          }
        },
      };
    }
    case 'smoke': {
      const mat = track(
        new THREE.MeshBasicMaterial({ color: monster ? 0x0a0a0c : 0x8a8a90, transparent: true, opacity: 0.4, depthWrite: false })
      );
      const geo = track(new THREE.IcosahedronGeometry(0.12, 1));
      const puffs: { m: THREE.Mesh; mat: THREE.MeshBasicMaterial; p: number; a: number }[] = [];
      for (let i = 0; i < 18; i++) {
        const m2 = track(mat.clone());
        const m = new THREE.Mesh(geo, m2);
        puffs.push({ m, mat: m2, p: i / 18, a: Math.random() * Math.PI * 2 });
        g.add(m);
      }
      noShadow(g);
      return {
        group: g,
        tick(dt) {
          for (const f of puffs) {
            f.p += dt * 0.35;
            if (f.p > 1) {
              f.p -= 1;
              f.a = Math.random() * Math.PI * 2;
            }
            const r = 0.2 + f.p * 0.5;
            f.m.position.set(Math.cos(f.a) * r, 0.15 + f.p * height * 0.9, Math.sin(f.a) * r);
            f.m.scale.setScalar(0.6 + f.p * 2.2);
            f.mat.opacity = (monster ? 0.55 : 0.35) * Math.sin(f.p * Math.PI);
          }
        },
      };
    }
    case 'halo': {
      const gold = track(new THREE.MeshStandardMaterial({ color: 0xffd34a, emissive: 0xffb81a, emissiveIntensity: 1.6, metalness: 0.6, roughness: 0.3 }));
      const halo = new THREE.Mesh(track(new THREE.TorusGeometry(0.14, 0.016, 8, 32)), gold);
      halo.rotation.x = Math.PI / 2;
      const y = height + 0.13;
      halo.position.y = y;
      g.add(halo);
      const sparkGeo = track(new THREE.OctahedronGeometry(0.018));
      const sparkMat = glow(track, 0xfff2b0, 1);
      const sparks: THREE.Mesh[] = [];
      for (let i = 0; i < 5; i++) {
        const s = new THREE.Mesh(sparkGeo, sparkMat);
        sparks.push(s);
        g.add(s);
      }
      noShadow(g);
      return {
        group: g,
        tick(dt) {
          t += dt;
          halo.position.y = y + Math.sin(t * 2) * 0.02;
          halo.rotation.z += dt * 1.5;
          sparks.forEach((s, i) => {
            const a = t * 2.2 + (i / sparks.length) * Math.PI * 2;
            s.position.set(Math.cos(a) * 0.2, halo.position.y + Math.sin(t * 4 + i) * 0.04, Math.sin(a) * 0.2);
            s.rotation.y += dt * 4;
          });
        },
      };
    }
    case 'sparks': {
      const mat = glow(track, 0x8ad8ff, 1);
      const geo = track(new THREE.BoxGeometry(0.012, 0.16, 0.012));
      const bolts: THREE.Mesh[] = [];
      for (let i = 0; i < 12; i++) {
        const b = new THREE.Mesh(geo, mat);
        bolts.push(b);
        g.add(b);
      }
      noShadow(g);
      let next = 0;
      return {
        group: g,
        tick(dt) {
          t += dt;
          next -= dt;
          if (next > 0) return;
          next = 0.05 + Math.random() * 0.07;
          for (const b of bolts) {
            b.visible = Math.random() < 0.45;
            if (!b.visible) continue;
            const a = Math.random() * Math.PI * 2;
            const r = 0.22 + Math.random() * 0.18;
            b.position.set(Math.cos(a) * r, 0.2 + Math.random() * height * 0.9, Math.sin(a) * r);
            b.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
            b.scale.y = 0.5 + Math.random() * 1.5;
          }
        },
      };
    }
    case 'flames': {
      const geo = track(new THREE.ConeGeometry(0.07, 0.3, 8, 1, true));
      const outer = glow(track, 0xff5a10, 0.75);
      const inner = glow(track, 0xffd23a, 0.8);
      const flames: { m: THREE.Mesh; p: number; a: number; r: number }[] = [];
      for (let i = 0; i < 16; i++) {
        const m = new THREE.Mesh(geo, i % 3 === 0 ? inner : outer);
        flames.push({ m, p: Math.random(), a: Math.random() * Math.PI * 2, r: 0.25 + Math.random() * 0.25 });
        g.add(m);
      }
      noShadow(g);
      return {
        group: g,
        tick(dt) {
          for (const f of flames) {
            f.p += dt * (1.2 + Math.random() * 0.4);
            if (f.p > 1) {
              f.p -= 1;
              f.a = Math.random() * Math.PI * 2;
              f.r = 0.25 + Math.random() * 0.25;
            }
            // Mostly around the shoulders and the feet
            const base = f.r > 0.38 ? 0.05 : height * 0.62;
            f.m.position.set(Math.cos(f.a) * f.r, base + f.p * 0.5, Math.sin(f.a) * f.r);
            const s = Math.sin(f.p * Math.PI) * (0.8 + Math.random() * 0.4);
            f.m.scale.set(s, s * 1.3, s);
          }
        },
      };
    }
    case 'embers': {
      // 🛡️ Clan: glowing embers rising around the body
      const geo = track(new THREE.SphereGeometry(0.02, 5, 4));
      const hot = glow(track, 0xff7a1a, 1);
      const warm = glow(track, 0xffc04a, 1);
      const sparks: { m: THREE.Mesh; p: number; a: number; r: number; s: number }[] = [];
      for (let i = 0; i < 26; i++) {
        const m = new THREE.Mesh(geo, i % 3 ? hot : warm);
        sparks.push({ m, p: Math.random(), a: Math.random() * Math.PI * 2, r: 0.2 + Math.random() * 0.35, s: 0.3 + Math.random() * 0.4 });
        g.add(m);
      }
      noShadow(g);
      return {
        group: g,
        tick(dt) {
          t += dt;
          for (const e of sparks) {
            e.p += dt * e.s;
            if (e.p > 1) {
              e.p -= 1;
              e.a = Math.random() * Math.PI * 2;
            }
            const a = e.a + e.p * 2;
            e.m.position.set(Math.cos(a) * e.r, e.p * (height + 0.3), Math.sin(a) * e.r);
            e.m.scale.setScalar((1 - e.p) * (0.8 + Math.sin(t * 20 + e.a) * 0.3));
          }
        },
      };
    }
    case 'snow': {
      // ❄️ Christmas: snowflakes falling and swirling around the body
      const flakeGeo = track(new THREE.OctahedronGeometry(0.022, 0));
      const white = glow(track, 0xffffff, 0.95);
      const blue = glow(track, 0xbfe6ff, 0.9);
      const flakes: { m: THREE.Mesh; p: number; a: number; r: number; s: number }[] = [];
      for (let i = 0; i < 40; i++) {
        const m = new THREE.Mesh(flakeGeo, i % 3 ? white : blue);
        flakes.push({ m, p: Math.random(), a: Math.random() * Math.PI * 2, r: 0.25 + Math.random() * 0.45, s: 0.12 + Math.random() * 0.12 });
        g.add(m);
      }
      noShadow(g);
      return {
        group: g,
        tick(dt) {
          t += dt;
          for (const f of flakes) {
            f.p += dt * f.s;
            if (f.p > 1) {
              f.p -= 1;
              f.a = Math.random() * Math.PI * 2;
            }
            const a = f.a + f.p * 3 + Math.sin(t + f.a) * 0.3;
            f.m.position.set(Math.cos(a) * f.r, (1 - f.p) * (height + 0.4), Math.sin(a) * f.r);
            f.m.rotation.set(t * 2 + f.a, t * 3, 0);
            f.m.scale.setScalar(0.6 + 0.5 * Math.sin(f.p * Math.PI));
          }
        },
      };
    }
    case 'stars': {
      // 🏅 Ranked: golden stars circling the body on two rings
      const geo = track(new THREE.OctahedronGeometry(0.05));
      const mat = glow(track, 0xffd34a, 1);
      const stars: { m: THREE.Mesh; ring: number; a: number }[] = [];
      for (let i = 0; i < 12; i++) {
        const m = new THREE.Mesh(geo, mat);
        m.scale.set(1, 1.6, 1);
        stars.push({ m, ring: i % 2, a: (i / 12) * Math.PI * 2 });
        g.add(m);
      }
      noShadow(g);
      return {
        group: g,
        tick(dt) {
          t += dt;
          for (const s of stars) {
            const dir = s.ring ? 1 : -1;
            const a = s.a + t * 1.4 * dir;
            const y = s.ring ? height * 0.75 : height * 0.3;
            s.m.position.set(Math.cos(a) * 0.5, y + Math.sin(t * 3 + s.a * 4) * 0.06, Math.sin(a) * 0.5);
            s.m.rotation.y += dt * 5;
            s.m.scale.setScalar(0.8 + 0.4 * Math.abs(Math.sin(t * 4 + s.a * 3)));
          }
        },
      };
    }
    case 'rainbow': {
      const c = new THREE.Color();
      return {
        group: g,
        tick(dt) {
          t += dt;
        },
        eyes: () => c.setHSL((t * 0.25) % 1, 1, 0.55),
      };
    }
  }
  return null;
};

/** Canvas sigil: rings, a star and runes, drawn in one colour. */
const sigilTexture = (track: Track, color: string, points: number, runes: number, seed: number) => {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d')!;
  x.strokeStyle = color;
  x.fillStyle = color;
  x.shadowColor = color;
  x.shadowBlur = 10;
  x.translate(128, 128);
  x.lineWidth = 4;
  x.beginPath();
  x.arc(0, 0, 120, 0, Math.PI * 2);
  x.stroke();
  x.lineWidth = 2;
  for (const r of [100, 58]) {
    x.beginPath();
    x.arc(0, 0, r, 0, Math.PI * 2);
    x.stroke();
  }
  // star polygon
  x.beginPath();
  const step = points === 8 ? 3 : 2;
  for (let i = 0; i <= points; i++) {
    const a = ((i * step) / points) * Math.PI * 2 - Math.PI / 2;
    const px = Math.cos(a) * 100;
    const py = Math.sin(a) * 100;
    if (i === 0) x.moveTo(px, py);
    else x.lineTo(px, py);
  }
  x.stroke();
  // runes in the outer band
  let sd = seed;
  const rnd = () => (sd = (sd * 9301 + 49297) % 233280) / 233280;
  x.lineWidth = 2.5;
  for (let i = 0; i < runes; i++) {
    x.save();
    x.rotate((i / runes) * Math.PI * 2);
    x.translate(0, -110);
    x.beginPath();
    const n = 2 + Math.floor(rnd() * 2);
    for (let k = 0; k < n; k++) {
      x.moveTo((rnd() - 0.5) * 10, (rnd() - 0.5) * 12);
      x.lineTo((rnd() - 0.5) * 10, (rnd() - 0.5) * 12);
    }
    x.stroke();
    x.restore();
  }
  // little gems on the inner ring
  for (let i = 0; i < points; i++) {
    const a = (i / points) * Math.PI * 2;
    x.beginPath();
    x.arc(Math.cos(a) * 58, Math.sin(a) * 58, 4, 0, Math.PI * 2);
    x.fill();
  }
  const tex = track(new THREE.CanvasTexture(c));
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
};

const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');

/**
 * 🏅 The rarer the outfit, the more it shines.
 *  rank 2 = Exclusif: a sigil turning slowly under the feet.
 *  rank 3 = Légendaire: a golden double sigil, light shafts and sparks rising.
 */
export const buildPrestige = (rank: number, accent: number, track: Track, height: number): FxHandle | null => {
  if (rank < 2) return null;
  const g = new THREE.Group();
  let t = Math.random() * 10;
  const legend = rank >= 3;
  const mat = (tex: THREE.Texture, opacity: number) =>
    track(new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  const outerR = legend ? 1.0 : 0.78;
  const outerMat = mat(sigilTexture(track, legend ? '#ffc83a' : hex(accent), legend ? 8 : 6, legend ? 24 : 16, legend ? 7 : 3), legend ? 0.85 : 0.6);
  const outer = new THREE.Mesh(track(new THREE.PlaneGeometry(outerR * 2, outerR * 2)), outerMat);
  outer.rotation.x = -Math.PI / 2;
  outer.position.y = 0.025;
  g.add(outer);
  let inner: THREE.Mesh | null = null;
  const shafts: THREE.Mesh[] = [];
  const motes: THREE.Mesh[] = [];
  if (legend) {
    inner = new THREE.Mesh(track(new THREE.PlaneGeometry(1.1, 1.1)), mat(sigilTexture(track, hex(accent), 6, 12, 11), 0.75));
    inner.rotation.x = -Math.PI / 2;
    inner.position.y = 0.035;
    g.add(inner);
    // Light shafts: vertical gradient planes, crossed
    const c = document.createElement('canvas');
    c.width = 8;
    c.height = 128;
    const x = c.getContext('2d')!;
    const grd = x.createLinearGradient(0, 0, 0, 128);
    grd.addColorStop(0, 'rgba(255,200,60,0)');
    grd.addColorStop(0.6, 'rgba(255,200,60,0.35)');
    grd.addColorStop(1, 'rgba(255,220,120,0.9)');
    x.fillStyle = grd;
    x.fillRect(0, 0, 8, 128);
    const tex = track(new THREE.CanvasTexture(c));
    const shaftMat = track(new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    const shaftGeo = track(new THREE.PlaneGeometry(0.12, height * 1.15));
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(shaftGeo, shaftMat);
      m.userData.a = (i / 6) * Math.PI * 2;
      m.position.y = (height * 1.15) / 2;
      shafts.push(m);
      g.add(m);
    }
    // Golden sparks rising
    const moteGeo = track(new THREE.OctahedronGeometry(0.022, 0));
    const moteMat = glow(track, 0xffd25a, 0.95);
    for (let i = 0; i < 16; i++) {
      const m = new THREE.Mesh(moteGeo, moteMat);
      m.userData.p = Math.random();
      m.userData.a = Math.random() * Math.PI * 2;
      m.userData.r = 0.35 + Math.random() * 0.5;
      motes.push(m);
      g.add(m);
    }
  }
  noShadow(g);
  return {
    group: g,
    tick(dt) {
      t += dt;
      const pulse = 0.5 + 0.5 * Math.sin(t * 2.2);
      outer.rotation.z += dt * (legend ? 0.35 : 0.25);
      outerMat.opacity = (legend ? 0.6 : 0.4) + pulse * (legend ? 0.35 : 0.25);
      if (inner) {
        inner.rotation.z -= dt * 0.7;
        inner.scale.setScalar(0.95 + pulse * 0.1);
      }
      for (const s of shafts) {
        const a = s.userData.a + t * 0.4;
        s.position.x = Math.cos(a) * 0.72;
        s.position.z = Math.sin(a) * 0.72;
        s.rotation.y = -a;
        s.scale.x = 0.6 + 0.6 * Math.abs(Math.sin(t * 1.7 + s.userData.a * 3));
      }
      for (const m of motes) {
        const p = (m.userData.p + t * 0.22) % 1;
        m.position.set(Math.cos(m.userData.a) * m.userData.r, p * height * 1.2, Math.sin(m.userData.a) * m.userData.r);
        m.rotation.y += dt * 4;
        m.scale.setScalar((1 - p) * (0.7 + 0.5 * Math.abs(Math.sin(t * 9 + m.userData.a * 5))));
      }
    },
  };
};
