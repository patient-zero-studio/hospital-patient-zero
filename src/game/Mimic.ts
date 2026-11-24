import * as THREE from 'three';

/**
 * 🧟 The Mimic: a pale, long-limbed thing that hides in lockers and imitates
 * sounds. It only shows itself when it bursts out (it faces +z).
 */
export class MimicBody {
  public group = new THREE.Group();
  private disposables: { dispose: () => void }[] = [];
  private jaw: THREE.Group;
  private head: THREE.Group;
  private spine: THREE.Group;
  private arms: { root: THREE.Group; mid: THREE.Group; s: number }[] = [];
  private t = 0;

  constructor() {
    const tr = <T extends { dispose: () => void }>(o: T) => {
      this.disposables.push(o);
      return o;
    };
    const skin = tr(new THREE.MeshStandardMaterial({ color: 0x857f70, roughness: 0.75, metalness: 0.02 }));
    const dark = tr(new THREE.MeshStandardMaterial({ color: 0x1a0606, roughness: 0.4 }));
    const tooth = tr(new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.3 }));
    const gum = tr(new THREE.MeshStandardMaterial({ color: 0x4a0c0c, roughness: 0.35 }));
    const mesh = (geo: THREE.BufferGeometry, m: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0) => {
      const o = new THREE.Mesh(tr(geo), m);
      o.position.set(x, y, z);
      o.castShadow = true;
      parent.add(o);
      return o;
    };

    // Hunched body: pelvis low, spine bent forward
    const hips = new THREE.Group();
    hips.position.y = 0.95;
    this.group.add(hips);
    mesh(new THREE.SphereGeometry(0.15, 12, 10), skin, hips).scale.set(1.2, 0.8, 0.9);
    this.spine = new THREE.Group();
    this.spine.rotation.x = 0.75;
    hips.add(this.spine);
    const chest = mesh(new THREE.CapsuleGeometry(0.15, 0.55, 6, 12), skin, this.spine, 0, 0.38, 0);
    chest.scale.set(1.15, 1, 0.75);
    // Ribs showing through the skin
    for (let i = 0; i < 5; i++) {
      const rib = mesh(new THREE.TorusGeometry(0.15, 0.012, 5, 14, Math.PI), skin, this.spine, 0, 0.25 + i * 0.07, 0.02);
      rib.rotation.y = Math.PI / 2;
      rib.rotation.z = Math.PI / 2;
      rib.scale.set(1, 1.15, 0.8);
    }
    // Spine knobs on the back
    for (let i = 0; i < 7; i++) mesh(new THREE.SphereGeometry(0.03, 6, 5), skin, this.spine, 0, 0.12 + i * 0.09, -0.11);

    // Head: long, eyeless, with a mouth far too wide
    this.head = new THREE.Group();
    this.head.position.set(0, 0.78, 0.05);
    this.head.rotation.x = -0.9;
    this.spine.add(this.head);
    mesh(new THREE.SphereGeometry(0.15, 16, 12), skin, this.head, 0, 0.08, 0).scale.set(0.95, 1.35, 1.05);
    // Sunken eye pits
    for (const s of [-1, 1]) mesh(new THREE.SphereGeometry(0.03, 8, 6), dark, this.head, s * 0.06, 0.14, 0.13).scale.set(1.2, 0.7, 0.5);
    // Upper teeth on the skull, lower teeth on the jaw
    const upper = new THREE.Group();
    upper.position.set(0, -0.02, 0.1);
    this.head.add(upper);
    mesh(new THREE.TorusGeometry(0.11, 0.02, 6, 18, Math.PI), gum, upper).rotation.x = Math.PI / 2;
    for (let i = 0; i < 11; i++) {
      const a = (i / 10) * Math.PI;
      const c = mesh(new THREE.ConeGeometry(0.012, 0.055, 4), tooth, upper, Math.cos(a) * 0.11, -0.025, Math.sin(a) * 0.11 - 0.02);
      c.rotation.x = Math.PI;
    }
    this.jaw = new THREE.Group();
    this.jaw.position.set(0, -0.05, 0.02);
    this.head.add(this.jaw);
    mesh(new THREE.SphereGeometry(0.12, 12, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), skin, this.jaw, 0, 0.02, 0.04).scale.set(1, 0.9, 1.2);
    mesh(new THREE.CircleGeometry(0.1, 16), dark, this.jaw, 0, 0.021, 0.06).rotation.x = -Math.PI / 2;
    const lower = new THREE.Group();
    lower.position.set(0, 0.02, 0.08);
    this.jaw.add(lower);
    mesh(new THREE.TorusGeometry(0.1, 0.018, 6, 18, Math.PI), gum, lower).rotation.x = Math.PI / 2;
    for (let i = 0; i < 10; i++) {
      const a = ((i + 0.5) / 10) * Math.PI;
      mesh(new THREE.ConeGeometry(0.011, 0.05, 4), tooth, lower, Math.cos(a) * 0.1, 0.025, Math.sin(a) * 0.1 - 0.02);
    }

    // Arms: far too long, with long fingers
    for (const s of [-1, 1]) {
      const root = new THREE.Group();
      root.position.set(s * 0.2, 0.68, 0);
      this.spine.add(root);
      mesh(new THREE.CapsuleGeometry(0.04, 0.55, 4, 8), skin, root, 0, -0.3, 0);
      const mid = new THREE.Group();
      mid.position.y = -0.6;
      root.add(mid);
      mesh(new THREE.CapsuleGeometry(0.035, 0.55, 4, 8), skin, mid, 0, -0.3, 0);
      const hand = new THREE.Group();
      hand.position.y = -0.62;
      mid.add(hand);
      mesh(new THREE.SphereGeometry(0.045, 8, 6), skin, hand).scale.set(1, 0.6, 1.2);
      for (let f = 0; f < 4; f++) {
        const fing = mesh(new THREE.CylinderGeometry(0.01, 0.004, 0.2, 5), skin, hand, (f - 1.5) * 0.025, -0.1, 0.02);
        fing.rotation.x = 0.3;
        fing.rotation.z = (f - 1.5) * 0.12;
      }
      this.arms.push({ root, mid, s });
    }
    // Legs: folded like a spider's
    for (const s of [-1, 1]) {
      const thigh = new THREE.Group();
      thigh.position.set(s * 0.13, 0, 0);
      thigh.rotation.set(-1.2, 0, s * 0.35);
      hips.add(thigh);
      mesh(new THREE.CapsuleGeometry(0.05, 0.5, 4, 8), skin, thigh, 0, -0.28, 0);
      const shin = new THREE.Group();
      shin.position.y = -0.55;
      shin.rotation.x = 2.1;
      thigh.add(shin);
      mesh(new THREE.CapsuleGeometry(0.04, 0.55, 4, 8), skin, shin, 0, -0.3, 0);
    }
  }

  /** scream: mouth wide open, arms reaching, the whole body shaking */
  update(delta: number, scream: boolean) {
    this.t += delta;
    const t = this.t;
    const k = 1 - Math.exp(-14 * delta);
    const open = scream ? 0.95 + Math.sin(t * 40) * 0.08 : 0.25 + Math.sin(t * 3) * 0.1;
    this.jaw.rotation.x += (open - this.jaw.rotation.x) * k;
    this.head.rotation.z = Math.sin(t * (scream ? 31 : 5)) * (scream ? 0.12 : 0.05);
    this.head.rotation.y = Math.sin(t * 2.3) * 0.15;
    this.spine.rotation.x = 0.75 + (scream ? -0.25 : 0) + Math.sin(t * 17) * 0.02;
    for (const a of this.arms) {
      const reach = scream ? -1.6 : -0.4 + Math.sin(t * 6 + a.s) * 0.5;
      a.root.rotation.x += (reach - a.root.rotation.x) * k;
      a.root.rotation.z = a.s * (scream ? 0.5 : 0.2);
      a.mid.rotation.x += ((scream ? -0.3 : -0.9) - a.mid.rotation.x) * k;
    }
  }

  dispose() {
    this.group.parent?.remove(this.group);
    this.disposables.forEach((d) => d.dispose());
  }
}
