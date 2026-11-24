import * as THREE from 'three';

export type CatPose = 'sit' | 'walk' | 'run' | 'hiss' | 'scratch';

/** 🐈‍⬛ The hospital's black cat (faces +z). */
export class CatBody {
  public group = new THREE.Group();
  private root = new THREE.Group();
  private body: THREE.Mesh;
  private head = new THREE.Group();
  private legs: THREE.Group[] = [];
  private tail: THREE.Group[] = [];
  private disposables: { dispose: () => void }[] = [];
  private t = Math.random() * 10;
  private fur: THREE.MeshStandardMaterial;

  constructor() {
    const tr = <T extends { dispose: () => void }>(o: T) => {
      this.disposables.push(o);
      return o;
    };
    this.fur = tr(new THREE.MeshStandardMaterial({ color: 0x0c0c0e, roughness: 0.85 }));
    const eye = tr(new THREE.MeshStandardMaterial({ color: 0xd8c020, emissive: 0xb89a10, emissiveIntensity: 1.2 }));
    const pupil = tr(new THREE.MeshBasicMaterial({ color: 0x000000 }));
    const pink = tr(new THREE.MeshStandardMaterial({ color: 0x8a4a50, roughness: 0.6 }));
    const mesh = (geo: THREE.BufferGeometry, m: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0) => {
      const o = new THREE.Mesh(tr(geo), m);
      o.position.set(x, y, z);
      o.castShadow = true;
      parent.add(o);
      return o;
    };
    this.group.add(this.root);
    this.body = mesh(new THREE.CapsuleGeometry(0.075, 0.2, 6, 12), this.fur, this.root, 0, 0.2, 0);
    this.body.rotation.x = Math.PI / 2;
    // Head
    this.head.position.set(0, 0.27, 0.17);
    this.root.add(this.head);
    mesh(new THREE.SphereGeometry(0.068, 16, 12), this.fur, this.head).scale.set(1.05, 0.92, 0.95);
    mesh(new THREE.SphereGeometry(0.03, 10, 8), this.fur, this.head, 0, -0.018, 0.055).scale.set(1.2, 0.8, 0.9);
    mesh(new THREE.SphereGeometry(0.008, 6, 5), pink, this.head, 0, -0.008, 0.083);
    for (const s of [-1, 1]) {
      const ear = mesh(new THREE.ConeGeometry(0.026, 0.06, 4), this.fur, this.head, s * 0.04, 0.06, -0.005);
      ear.rotation.z = -s * 0.25;
      mesh(new THREE.SphereGeometry(0.014, 10, 8), eye, this.head, s * 0.028, 0.012, 0.058).scale.set(1, 1.1, 0.6);
      mesh(new THREE.BoxGeometry(0.004, 0.02, 0.004), pupil, this.head, s * 0.028, 0.012, 0.067);
    }
    // Legs
    for (const [x, z] of [
      [-0.04, 0.12],
      [0.04, 0.12],
      [-0.04, -0.1],
      [0.04, -0.1],
    ]) {
      const leg = new THREE.Group();
      leg.position.set(x, 0.17, z);
      this.root.add(leg);
      mesh(new THREE.CylinderGeometry(0.016, 0.012, 0.17, 6), this.fur, leg, 0, -0.085, 0);
      this.legs.push(leg);
    }
    // Tail: a chain of segments
    let parent: THREE.Object3D = this.root;
    let pos = new THREE.Vector3(0, 0.22, -0.16);
    for (let i = 0; i < 6; i++) {
      const seg = new THREE.Group();
      seg.position.copy(pos);
      parent.add(seg);
      mesh(new THREE.CylinderGeometry(0.013 - i * 0.0012, 0.015 - i * 0.0012, 0.06, 6), this.fur, seg, 0, 0.03, 0);
      this.tail.push(seg);
      parent = seg;
      pos = new THREE.Vector3(0, 0.055, 0);
    }
  }

  update(delta: number, pose: CatPose, speed: number) {
    this.t += delta;
    const t = this.t;
    const k = 1 - Math.exp(-10 * delta);
    // Body height / arch
    const arch = pose === 'hiss' ? 1 : 0;
    const sit = pose === 'sit' || pose === 'scratch' ? 1 : 0;
    this.root.position.y += (arch * 0.05 - sit * 0.03 - this.root.position.y) * k;
    this.body.scale.y += ((arch ? 0.85 : 1) - this.body.scale.y) * k;
    this.root.rotation.x += ((sit ? -0.35 : 0) - this.root.rotation.x) * k;
    // Legs
    const gait = pose === 'run' ? 14 : 8;
    this.legs.forEach((l, i) => {
      let r = 0;
      if (pose === 'walk' || pose === 'run') r = Math.sin(t * gait * Math.min(1.5, speed + 0.3) + (i % 2 === (i < 2 ? 0 : 1) ? 0 : Math.PI)) * 0.6;
      if (pose === 'scratch' && i < 2) r = -1.2 + Math.sin(t * 16 + i * Math.PI) * 0.5;
      if (pose === 'sit' && i >= 2) r = 1.1;
      l.rotation.x += (r - l.rotation.x) * Math.min(1, k * 2);
    });
    // Tail: lazy swish, straight up and bristly when hissing
    this.tail.forEach((s, i) => {
      const up = arch ? 0.25 : -0.55 + i * 0.08;
      s.rotation.x += ((i === 0 ? (arch ? -1.2 : -0.9) : up) - s.rotation.x) * k;
      s.rotation.z = Math.sin(t * (arch ? 18 : 1.6) + i * 0.5) * (arch ? 0.05 : 0.18);
      s.scale.setScalar(arch ? 1.35 : 1);
    });
    // Head: looks around, flattens when hissing
    this.head.rotation.y = pose === 'hiss' ? 0 : Math.sin(t * 0.7) * 0.35;
    this.head.rotation.x = pose === 'scratch' ? 0.4 : pose === 'hiss' ? -0.15 : 0;
  }

  dispose() {
    this.group.parent?.remove(this.group);
    this.disposables.forEach((d) => d.dispose());
  }
}
