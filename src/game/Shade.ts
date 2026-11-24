import * as THREE from 'three';

/**
 * 🕯️ L'Éteigneur: a tall, thin shadow with two white pin-point eyes.
 * Only its eyes show while your torch is on; in the dark you see all of it.
 */
export class ShadeBody {
  public group = new THREE.Group();
  private body: THREE.Group;
  private arms: THREE.Group[] = [];
  private bodyMat: THREE.MeshBasicMaterial;
  private eyeMat: THREE.MeshBasicMaterial;
  private disposables: { dispose: () => void }[] = [];
  private t = Math.random() * 10;

  constructor() {
    const tr = <T extends { dispose: () => void }>(o: T) => {
      this.disposables.push(o);
      return o;
    };
    this.bodyMat = tr(new THREE.MeshBasicMaterial({ color: 0x020203, transparent: true, opacity: 0.92, depthWrite: false }));
    this.eyeMat = tr(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1, fog: false }));
    const mesh = (geo: THREE.BufferGeometry, m: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0) => {
      const o = new THREE.Mesh(tr(geo), m);
      o.position.set(x, y, z);
      o.renderOrder = 3;
      parent.add(o);
      return o;
    };
    this.body = new THREE.Group();
    this.group.add(this.body);
    // Long, thin torso that fades into smoke at the bottom
    mesh(new THREE.CapsuleGeometry(0.16, 1.25, 6, 12), this.bodyMat, this.body, 0, 1.35, 0).scale.set(1, 1, 0.7);
    mesh(new THREE.ConeGeometry(0.28, 0.9, 12, 1, true), this.bodyMat, this.body, 0, 0.45, 0).rotation.x = Math.PI;
    // Small head, tilted
    const head = new THREE.Group();
    head.position.set(0, 2.2, 0.02);
    head.rotation.z = 0.25;
    this.body.add(head);
    mesh(new THREE.SphereGeometry(0.15, 14, 10), this.bodyMat, head).scale.set(0.9, 1.25, 0.9);
    for (const s of [-1, 1]) mesh(new THREE.SphereGeometry(0.018, 8, 6), this.eyeMat, head, s * 0.055, 0.03, 0.13);
    // Arms far too long, hanging below the knees
    for (const s of [-1, 1]) {
      const arm = new THREE.Group();
      arm.position.set(s * 0.2, 1.95, 0);
      arm.rotation.z = s * 0.12;
      this.body.add(arm);
      mesh(new THREE.CylinderGeometry(0.035, 0.02, 1.5, 6), this.bodyMat, arm, 0, -0.75, 0);
      for (let f = 0; f < 3; f++) {
        const fing = mesh(new THREE.CylinderGeometry(0.008, 0.003, 0.28, 4), this.bodyMat, arm, (f - 1) * 0.025, -1.6, 0);
        fing.rotation.z = (f - 1) * 0.25;
      }
      this.arms.push(arm);
    }
  }

  /** body: 0..1 how much of it shows (eyes always show when > 0) */
  update(delta: number, body: number, eyes: number) {
    this.t += delta;
    this.bodyMat.opacity = 0.92 * body;
    this.eyeMat.opacity = eyes;
    this.group.visible = body > 0.01 || eyes > 0.01;
    this.body.position.y = Math.sin(this.t * 1.3) * 0.05;
    this.body.rotation.z = Math.sin(this.t * 0.7) * 0.04;
    this.arms.forEach((a, i) => (a.rotation.x = Math.sin(this.t * 1.1 + i * 2) * 0.12));
  }

  dispose() {
    this.group.parent?.remove(this.group);
    this.disposables.forEach((d) => d.dispose());
  }
}
