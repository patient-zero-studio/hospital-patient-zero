import * as THREE from 'three';
import { ProceduralTextures } from '../textures/ProceduralTextures';
import { sound } from '../audio/SoundSystem';
import { CollisionBox } from './MapBuilder';

const RADIUS = 0.033;
const HALF_H = 0.062;
const G = 9.81;
const MAX_CANS = 10;
/** Angular tolerance (rad) to land upright. */
const UPRIGHT_TOL = 0.5;

export type FlipResult = 'upright' | 'double' | 'fail';

interface Can {
  mesh: THREE.Mesh;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  /** Flip angle around the horizontal axis perpendicular to the throw. */
  angle: number;
  omega: number;
  yaw: number;
  state: 'flying' | 'upright' | 'fallen';
  kind: 'throw' | 'flip';
  bounces: number;
  /** 0 = whole, sleeping on the floor: rolls a little when fallen */
  roll: number;
  rollSpeed: number;
  owner: 'local' | 'remote';
}

export interface CanCallbacks {
  /** Impact noise the creatures can hear. */
  onNoise: (pos: THREE.Vector3, loudness: number) => void;
  /** Bottle-flip outcome (`owner` = who flipped it, in multiplayer). */
  onFlip: (result: FlipResult, owner: 'local' | 'remote') => void;
}

/** Cans thrown or flipped by the player: simple rigid-body-ish physics. */
export class CanSystem {
  private cans: Can[] = [];
  private geo: THREE.CylinderGeometry;
  private mats: THREE.Material[];
  private group = new THREE.Group();
  private tmpQ = new THREE.Quaternion();
  private axisX = new THREE.Vector3(1, 0, 0);
  private axisY = new THREE.Vector3(0, 1, 0);

  constructor(private parent: THREE.Object3D, private cb: CanCallbacks) {
    this.geo = new THREE.CylinderGeometry(RADIUS, RADIUS, HALF_H * 2, 18);
    const metal = new THREE.MeshStandardMaterial({ color: 0xc9cdd2, metalness: 0.9, roughness: 0.3 });
    const label = new THREE.MeshStandardMaterial({ map: ProceduralTextures.getCanTexture(), metalness: 0.5, roughness: 0.35 });
    // Cylinder groups: 0 = side, 1 = top, 2 = bottom
    this.mats = [label, metal, metal];
    parent.add(this.group);
  }

  /** Throw far to make noise elsewhere (lure). */
  public throw(from: THREE.Vector3, yaw: number, pitch: number) {
    const dir = new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
    const vel = dir.multiplyScalar(9.5).add(new THREE.Vector3(0, 2.6, 0));
    this.spawn(from, vel, yaw, 14 + Math.random() * 8, 'throw');
  }

  /**
   * Bottle flip: a short underhand toss with spin. `power` 0..1 sets both
   * the height and the spin, so only the right timing lands it upright.
   */
  public flip(from: THREE.Vector3, yaw: number, power: number, owner: 'local' | 'remote' = 'local') {
    const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    const vel = fwd.multiplyScalar(1.1 + power * 1.3).add(new THREE.Vector3(0, 2.2 + power * 2.6, 0));
    const omega = 4 + power * 9;
    this.spawn(from, vel, yaw, omega, 'flip', owner);
  }

  private spawn(from: THREE.Vector3, vel: THREE.Vector3, yaw: number, omega: number, kind: Can['kind'], owner: Can['owner'] = 'local') {
    const mesh = new THREE.Mesh(this.geo, this.mats);
    mesh.castShadow = true;
    mesh.userData = { isCan: true };
    this.group.add(mesh);
    const can: Can = {
      mesh,
      pos: from.clone(),
      vel,
      angle: 0,
      omega,
      yaw,
      state: 'flying',
      kind,
      bounces: 0,
      roll: 0,
      rollSpeed: 0,
      owner,
    };
    this.cans.push(can);
    while (this.cans.length > MAX_CANS) this.remove(this.cans[0]);
    this.sync(can);
  }

  /** Lowest point of the can above its centre, given its tilt. */
  private lowest(angle: number) {
    return HALF_H * Math.abs(Math.cos(angle)) + RADIUS * Math.abs(Math.sin(angle));
  }

  private insideBox(p: THREE.Vector3, boxes: CollisionBox[]) {
    for (const b of boxes) {
      if (b.disabled) continue;
      if (p.x > b.min.x && p.x < b.max.x && p.z > b.min.z && p.z < b.max.z && p.y < b.max.y) return b;
    }
    return null;
  }

  public update(delta: number, boxes: CollisionBox[]) {
    const steps = 3;
    const dt = delta / steps;
    for (const can of this.cans) {
      if (can.state !== 'flying') {
        if (can.state === 'fallen' && Math.abs(can.rollSpeed) > 0.01) {
          // Roll along the floor (perpendicular to the can's axis), slowing down
          const dir = new THREE.Vector3(Math.cos(can.yaw), 0, -Math.sin(can.yaw));
          const next = can.pos.clone().addScaledVector(dir, can.rollSpeed * delta);
          if (!this.insideBox(next, boxes)) can.pos.copy(next);
          else can.rollSpeed = 0;
          can.roll += (can.rollSpeed * delta) / RADIUS;
          can.rollSpeed *= Math.exp(-2.5 * delta);
          this.sync(can);
        }
        continue;
      }
      for (let s = 0; s < steps && can.state === 'flying'; s++) {
        can.vel.y -= G * dt;
        can.angle += can.omega * dt;
        const prev = can.pos.clone();
        can.pos.addScaledVector(can.vel, dt);

        // Walls / furniture: bounce back horizontally
        const hit = this.insideBox(can.pos, boxes);
        if (hit) {
          can.pos.x = prev.x;
          can.pos.z = prev.z;
          // Reflect on the axis we entered from
          const fromX = prev.x <= hit.min.x || prev.x >= hit.max.x;
          if (fromX) can.vel.x *= -0.35;
          else can.vel.z *= -0.35;
          can.omega *= 0.6;
          if (can.kind === 'throw' && can.bounces === 0) this.impact(can, 0.8);
          can.bounces++;
        }
        // Ceiling
        if (can.pos.y > 3.4) {
          can.pos.y = 3.4;
          can.vel.y = -Math.abs(can.vel.y) * 0.3;
        }
        // Floor
        const low = this.lowest(can.angle);
        if (can.pos.y - low <= 0 && can.vel.y < 0) {
          can.pos.y = low;
          this.land(can);
        }
      }
      this.sync(can);
    }
  }

  private land(can: Can) {
    const speed = can.vel.length();
    if (can.kind === 'flip' && can.bounces === 0) {
      // Bottle flip judgement
      const turns = can.angle / (Math.PI * 2);
      const nearest = Math.round(turns);
      const err = Math.abs(can.angle - nearest * Math.PI * 2);
      if (nearest >= 1 && err < UPRIGHT_TOL) {
        this.standUp(can);
        sound.playCanClank(0.25);
        this.cb.onNoise(can.pos, 4);
        this.cb.onFlip(nearest >= 2 ? 'double' : 'upright', can.owner);
        return;
      }
      this.fallOver(can, 0.6);
      sound.playCanClank(0.6);
      this.cb.onNoise(can.pos, 6);
      this.cb.onFlip('fail', can.owner);
      return;
    }

    // Thrown can: clatter, a couple of small bounces, then it lies down
    if (can.bounces < 2 && speed > 2.5) {
      if (can.bounces === 0) this.impact(can, 1);
      else sound.playCanClank(0.4);
      can.bounces++;
      can.vel.y = Math.abs(can.vel.y) * 0.35;
      can.vel.x *= 0.5;
      can.vel.z *= 0.5;
      can.omega *= 0.5;
      return;
    }
    this.fallOver(can, Math.hypot(can.vel.x, can.vel.z) * 0.5);
  }

  private impact(can: Can, strength: number) {
    sound.playCanClank(strength);
    // Loud metallic clatter: lures the creatures
    this.cb.onNoise(can.pos, 18);
  }

  private standUp(can: Can) {
    can.state = 'upright';
    can.angle = 0;
    can.pos.y = HALF_H;
    can.vel.set(0, 0, 0);
  }

  private fallOver(can: Can, rollSpeed: number) {
    can.state = 'fallen';
    can.angle = Math.PI / 2;
    can.pos.y = RADIUS;
    can.vel.set(0, 0, 0);
    can.yaw += (Math.random() - 0.5) * 1.2; // rolls a bit sideways
    can.rollSpeed = rollSpeed;
  }

  private sync(can: Can) {
    can.mesh.position.copy(can.pos);
    can.mesh.quaternion.setFromAxisAngle(this.axisY, can.yaw);
    this.tmpQ.setFromAxisAngle(this.axisX, -can.angle);
    can.mesh.quaternion.multiply(this.tmpQ);
    if (can.state === 'fallen') {
      this.tmpQ.setFromAxisAngle(this.axisY, can.roll);
      can.mesh.quaternion.multiply(this.tmpQ);
    }
  }

  /** Can mesh → pick it back up. Returns true if a can was removed. */
  public pickUp(mesh: THREE.Object3D): boolean {
    const can = this.cans.find((c) => c.mesh === mesh);
    if (!can || can.state === 'flying') return false;
    this.remove(can);
    return true;
  }

  public get meshes(): THREE.Object3D[] {
    return this.cans.map((c) => c.mesh);
  }

  // ---- Multiplayer -------------------------------------------------------
  /** Host: compact state of every can. */
  public netSnapshot(): number[][] {
    return this.cans.map((c) => {
      const q = c.mesh.quaternion;
      const r = (v: number) => Math.round(v * 1000) / 1000;
      return [r(c.pos.x), r(c.pos.y), r(c.pos.z), r(q.x), r(q.y), r(q.z), r(q.w)];
    });
  }

  /** Guest: show the cans exactly where the host says (no local physics). */
  public netApply(list: number[][]) {
    while (this.cans.length > list.length) this.remove(this.cans[this.cans.length - 1]);
    while (this.cans.length < list.length) {
      const mesh = new THREE.Mesh(this.geo, this.mats);
      mesh.castShadow = true;
      this.group.add(mesh);
      this.cans.push({
        mesh,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        angle: 0,
        omega: 0,
        yaw: 0,
        state: 'upright',
        kind: 'throw',
        bounces: 0,
        roll: 0,
        rollSpeed: 0,
        owner: 'remote',
      });
    }
    list.forEach((v, i) => {
      const c = this.cans[i];
      c.pos.set(v[0], v[1], v[2]);
      c.mesh.position.copy(c.pos);
      c.mesh.quaternion.set(v[3], v[4], v[5], v[6]);
      c.mesh.userData = { isCan: true, canIdx: i };
    });
  }

  /** Index of a can mesh (to ask the host to pick it up). */
  public indexOf(mesh: THREE.Object3D) {
    return this.cans.findIndex((c) => c.mesh === mesh);
  }

  /** Host: pick up the can the guest pointed at. */
  public pickUpIndex(i: number): boolean {
    const can = this.cans[i];
    return can ? this.pickUp(can.mesh) : false;
  }

  private remove(can: Can) {
    this.group.remove(can.mesh);
    this.cans = this.cans.filter((c) => c !== can);
  }

  public clear() {
    for (const c of [...this.cans]) this.remove(c);
  }

  public dispose() {
    this.clear();
    this.parent.remove(this.group);
    this.geo.dispose();
    this.mats.forEach((m, i) => i < 2 && m.dispose());
  }
}
