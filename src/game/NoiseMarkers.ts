import * as THREE from 'three';

/**
 * Versus, creature side: every noise the survivor makes shows up as a red
 * expanding ring, visible through walls (the creature "hears" the world).
 */
export class NoiseMarkers {
  private group = new THREE.Group();
  private tex: THREE.CanvasTexture;
  private pool: { sprite: THREE.Sprite; mat: THREE.SpriteMaterial; age: number; life: number; size: number }[] = [];

  constructor(private parent: THREE.Object3D) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(64, 64, 20, 64, 64, 62);
    g.addColorStop(0, 'rgba(255,40,20,0)');
    g.addColorStop(0.55, 'rgba(255,40,20,0.15)');
    g.addColorStop(0.8, 'rgba(255,60,30,1)');
    g.addColorStop(1, 'rgba(255,40,20,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = 'rgba(255,90,60,1)';
    ctx.beginPath();
    ctx.arc(64, 64, 7, 0, Math.PI * 2);
    ctx.fill();
    this.tex = new THREE.CanvasTexture(c);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    parent.add(this.group);
  }

  /** `loudness` (metres of hearing range) sets the size of the ring. */
  public add(pos: THREE.Vector3, loudness: number) {
    let slot = this.pool.find((p) => p.age >= p.life);
    if (!slot) {
      if (this.pool.length >= 24) return;
      const mat = new THREE.SpriteMaterial({
        map: this.tex,
        transparent: true,
        depthTest: false, // seen through walls
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.renderOrder = 20;
      this.group.add(sprite);
      slot = { sprite, mat, age: 0, life: 1, size: 1 };
      this.pool.push(slot);
    }
    slot.sprite.position.set(pos.x, 1.0, pos.z);
    slot.age = 0;
    slot.life = 1.6 + Math.min(2, loudness / 10);
    slot.size = 0.8 + Math.min(4, loudness / 5);
    slot.sprite.visible = true;
  }

  public update(delta: number) {
    for (const p of this.pool) {
      if (p.age >= p.life) {
        p.sprite.visible = false;
        continue;
      }
      p.age += delta;
      const t = p.age / p.life;
      const s = p.size * (0.4 + t * 1.2);
      p.sprite.scale.set(s, s, 1);
      p.mat.opacity = (1 - t) * 0.9;
    }
  }

  public dispose() {
    this.parent.remove(this.group);
    this.pool.forEach((p) => p.mat.dispose());
    this.tex.dispose();
  }
}
