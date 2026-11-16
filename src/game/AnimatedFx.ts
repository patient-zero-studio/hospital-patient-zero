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
