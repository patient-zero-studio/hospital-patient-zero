import * as THREE from 'three';
import { ProceduralTextures } from '../textures/ProceduralTextures';
import { sound } from '../audio/SoundSystem';

/**
 * "Le Rampant": the creature of the air duct (from the player's drawing).
 * A skull face on a hunched, ribbed body, carried by four long spindly legs
 * ending in blade-like claws. It lives in the duct only.
 *
 *  - It hunts whoever crawls in the duct (a little faster than you crawl).
 *  - It hates light: keep your flashlight ON it and it flees to its nest.
 *  - It never leaves the duct.
 *
 * Host / solo run the AI; a guest only mirrors the host (netApply).
 */
export type CrawlerState = 'LURK' | 'ROAM' | 'HUNT' | 'FLEE';
export const CRAWLER_STATES: CrawlerState[] = ['LURK', 'ROAM', 'HUNT', 'FLEE'];

export interface CrawlerHuman {
  pos: THREE.Vector3;
  /** eye position */
  eye: THREE.Vector3;
  yaw: number;
  pitch: number;
  flashlightOn: boolean;
  inDuct: boolean;
  dead: boolean;
}

interface Leg {
  hip: THREE.Vector3;
  yawG: THREE.Group;
  upper: THREE.Group;
  knee: THREE.Group;
  base: THREE.Vector3;
  phase: number;
  L1: number;
  L2: number;
}

const HUNT_SPEED = 2.05;
const ROAM_SPEED = 0.9;
const FLEE_SPEED = 3.6;

export class VentCrawler {
  public mesh = new THREE.Group();
  public position = new THREE.Vector3();
  public state: CrawlerState = 'LURK';
  public headWorld = new THREE.Vector3();

  private body = new THREE.Group();
  private head = new THREE.Group();
  private jaw!: THREE.Mesh;
  private legs: Leg[] = [];
  private eyeMat: THREE.MeshStandardMaterial;
  private disposables: { dispose: () => void }[] = [];

  // Duct graph
  private nodes: Record<string, THREE.Vector3>;
  private edges: [string, string][];
  private nest: string;
  private next: Record<string, Record<string, string>> = {};
  private dist: Record<string, Record<string, number>> = {};

  private waypoints: THREE.Vector3[] = [];
  private timer = 4;
  private lightTime = 0;
  private gait = 0;
  private speed = 0;
  private soundTimer = 0;
  private growlTimer = 3;
  private animTime = 0;
  /** guest replica target */
  private netTarget: THREE.Vector3 | null = null;
  private netYaw = 0;

  constructor(duct: { nodes: Record<string, THREE.Vector3>; edges: [string, string][]; nest: string }) {
    this.nodes = duct.nodes;
    this.edges = duct.edges;
    this.nest = duct.nest;
    this.buildGraph();
    this.position.copy(this.nodes[this.nest]);
    this.eyeMat = new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff2200, emissiveIntensity: 5 });
    this.buildModel();
    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = Math.PI;
  }

  // ---------------------------------------------------------------------
  // Model
  // ---------------------------------------------------------------------
  private buildModel() {
    const t = <T extends { dispose: () => void }>(o: T) => {
      this.disposables.push(o);
      return o;
    };
    const skinTex = ProceduralTextures.getMonsterSkinTexture();
    const flesh = t(new THREE.MeshStandardMaterial({ map: skinTex, bumpMap: skinTex, bumpScale: 1.2, color: 0x8f8a7c, roughness: 0.75 }));
    const bone = t(new THREE.MeshStandardMaterial({ color: 0xd9d2bf, roughness: 0.55 }));
    const dark = t(new THREE.MeshStandardMaterial({ color: 0x080606, roughness: 0.9 }));
    const blade = t(new THREE.MeshStandardMaterial({ color: 0x1a1414, roughness: 0.3, metalness: 0.4 }));
    const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0) => {
      const m = new THREE.Mesh(t(geo), mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      parent.add(m);
      return m;
    };

    this.body.position.y = 0.5;
    this.mesh.add(this.body);
    // Hunched torso, longer than wide, with ribs showing through
    const torso = mesh(new THREE.CapsuleGeometry(0.17, 0.55, 6, 14), flesh, this.body);
    torso.rotation.x = Math.PI / 2;
    torso.scale.set(1.1, 1, 0.8);
    for (let i = 0; i < 5; i++) {
      const rib = mesh(new THREE.TorusGeometry(0.175, 0.012, 5, 16, Math.PI), bone, this.body, 0, 0.0, 0.2 - i * 0.1);
      rib.scale.set(1.12, 0.95, 1);
    }
    // Spine ridge
    for (let i = 0; i < 8; i++) mesh(new THREE.SphereGeometry(0.035 - i * 0.002, 8, 6), bone, this.body, 0, 0.15, 0.3 - i * 0.09);
    // Neck reaching forward and down
    const neck = mesh(new THREE.CapsuleGeometry(0.06, 0.2, 4, 8), flesh, this.body, 0, -0.02, 0.42);
    neck.rotation.x = Math.PI / 2 + 0.4;

    // Skull face: bone-white, empty sockets with a red glint, gaping mouth
    this.head.position.set(0, -0.08, 0.58);
    this.body.add(this.head);
    const skull = mesh(new THREE.SphereGeometry(0.13, 20, 16), bone, this.head);
    skull.scale.set(0.9, 1.05, 1);
    for (const s of [-1, 1]) {
      const socket = mesh(new THREE.SphereGeometry(0.038, 12, 10), dark, this.head, s * 0.047, 0.03, 0.098);
      socket.scale.set(1, 1.25, 0.6);
      mesh(new THREE.SphereGeometry(0.008, 6, 4), this.eyeMat, this.head, s * 0.047, 0.025, 0.11);
    }
    // Nose hole
    const nose = mesh(new THREE.ConeGeometry(0.018, 0.035, 3), dark, this.head, 0, -0.025, 0.122);
    nose.rotation.x = Math.PI;
    // Gaping mouth with a jaw that drops
    this.jaw = mesh(new THREE.SphereGeometry(0.06, 12, 10), dark, this.head, 0, -0.08, 0.09);
    this.jaw.scale.set(0.9, 1.25, 0.5);
    for (let i = 0; i < 6; i++) {
      const tooth = mesh(new THREE.ConeGeometry(0.008, 0.03, 4), bone, this.head, -0.04 + i * 0.016, -0.05, 0.115);
      tooth.rotation.x = Math.PI;
    }

    // Four long legs: up and out to a high knee, down to a blade claw
    const legDef: [number, number, number, number][] = [
      // hip x, hip z, foot base x, foot base z
      [0.13, 0.25, 0.55, 0.62],
      [-0.13, 0.25, -0.55, 0.62],
      [0.13, -0.25, 0.5, -0.5],
      [-0.13, -0.25, -0.5, -0.5],
    ];
    legDef.forEach(([hx, hz, fx, fz], i) => {
      const front = hz > 0;
      const L1 = 0.5;
      const L2 = front ? 0.7 : 0.62;
      const yawG = new THREE.Group();
      yawG.position.set(hx, 0, hz);
      this.body.add(yawG);
      const upper = new THREE.Group();
      yawG.add(upper);
      const u = mesh(new THREE.CylinderGeometry(0.045, 0.065, L1, 10), flesh, upper, 0, 0, L1 / 2);
      u.rotation.x = Math.PI / 2;
      mesh(new THREE.SphereGeometry(0.045, 8, 6), bone, upper, 0, 0, L1); // knuckle
      const knee = new THREE.Group();
      knee.position.z = L1;
      upper.add(knee);
      const l = mesh(new THREE.CylinderGeometry(0.026, 0.045, L2 * 0.62, 10), flesh, knee, 0, 0, L2 * 0.31);
      l.rotation.x = Math.PI / 2;
      // Scythe-like blade making up the end of the leg
      const b = mesh(new THREE.ConeGeometry(0.04, L2 * 0.45, 4), blade, knee, 0, 0, L2 * 0.62 + L2 * 0.19);
      b.rotation.x = Math.PI / 2;
      b.scale.set(0.5, 1, 1.4);
      this.legs.push({
        hip: new THREE.Vector3(hx, 0.5, hz),
        yawG,
        upper,
        knee,
        base: new THREE.Vector3(fx, 0, fz),
        phase: i === 0 || i === 3 ? 0 : Math.PI,
        L1,
        L2,
      });
    });
  }

  // ---------------------------------------------------------------------
  // Duct graph
  // ---------------------------------------------------------------------
  private buildGraph() {
    const ids = Object.keys(this.nodes);
    for (const a of ids) {
      this.dist[a] = {};
      this.next[a] = {};
      for (const b of ids) {
        this.dist[a][b] = a === b ? 0 : Infinity;
        this.next[a][b] = b;
      }
    }
    for (const [a, b] of this.edges) {
      const d = this.nodes[a].distanceTo(this.nodes[b]);
      this.dist[a][b] = this.dist[b][a] = d;
    }
    for (const k of ids)
      for (const a of ids)
        for (const b of ids)
          if (this.dist[a][k] + this.dist[k][b] < this.dist[a][b]) {
            this.dist[a][b] = this.dist[a][k] + this.dist[k][b];
            this.next[a][b] = this.next[a][k];
          }
  }

  /** Closest point of the duct graph. */
  private project(p: THREE.Vector3) {
    let best = { edge: this.edges[0], point: new THREE.Vector3(), d: Infinity };
    for (const e of this.edges) {
      const a = this.nodes[e[0]];
      const b = this.nodes[e[1]];
      const ab = b.clone().sub(a);
      const t = THREE.MathUtils.clamp(new THREE.Vector3(p.x - a.x, 0, p.z - a.z).dot(ab) / ab.lengthSq(), 0, 1);
      const q = a.clone().addScaledVector(ab, t);
      const d = Math.hypot(p.x - q.x, p.z - q.z);
      if (d < best.d) best = { edge: e, point: q, d };
    }
    return best;
  }

  /** Waypoints along the duct from here to `target`. */
  private route(target: THREE.Vector3): THREE.Vector3[] {
    const me = this.project(this.position);
    const to = this.project(target);
    if (me.edge === to.edge) return [to.point];
    let best: { cost: number; s: string; e: string } | null = null;
    for (const s of me.edge)
      for (const e of to.edge) {
        const cost = this.position.distanceTo(this.nodes[s]) + this.dist[s][e] + this.nodes[e].distanceTo(to.point);
        if (!best || cost < best.cost) best = { cost, s, e };
      }
    const pts: THREE.Vector3[] = [];
    let cur = best!.s;
    pts.push(this.nodes[cur]);
    while (cur !== best!.e) {
      cur = this.next[cur][best!.e];
      pts.push(this.nodes[cur]);
    }
    pts.push(to.point);
    return pts;
  }

  // ---------------------------------------------------------------------
  // AI (host / solo)
  // ---------------------------------------------------------------------
  /**
   * `humans`: everyone it can hunt. Returns the index of the human it caught, or -1.
   * `listener`: the local player's ears.
   */
  public update(delta: number, humans: CrawlerHuman[], listener: { pos: THREE.Vector3; right: THREE.Vector3 }): number {
    this.animTime += delta;
    this.timer -= delta;

    // Light on its face makes it flee
    if (this.state !== 'FLEE') {
      const lit = humans.some((h) => !h.dead && h.flashlightOn && this.isLitBy(h));
      this.lightTime = lit ? this.lightTime + delta : Math.max(0, this.lightTime - delta * 2);
      if (this.lightTime > 0.35) {
        this.state = 'FLEE';
        this.lightTime = 0;
        this.waypoints = this.route(this.nodes[this.nest]);
        this.playSound('screech', listener);
      }
    }

    const prey = humans
      .map((h, i) => ({ h, i }))
      .filter(({ h }) => !h.dead && h.inDuct)
      .sort((a, b) => a.h.pos.distanceTo(this.position) - b.h.pos.distanceTo(this.position))[0];

    let speed = 0;
    switch (this.state) {
      case 'FLEE':
        speed = FLEE_SPEED;
        if (!this.waypoints.length) {
          this.state = 'LURK';
          this.timer = 6; // sulking in the nest, light-shy
        }
        break;
      case 'LURK':
        if (prey && this.timer <= 0) this.state = 'HUNT';
        else if (this.timer <= 0) {
          this.state = 'ROAM';
          const ends = Object.keys(this.nodes).filter((k) => k !== this.nest);
          this.waypoints = this.route(this.nodes[ends[Math.floor(Math.random() * ends.length)]]);
        }
        break;
      case 'ROAM':
        speed = ROAM_SPEED;
        if (prey) this.state = 'HUNT';
        else if (!this.waypoints.length) {
          if (this.position.distanceTo(this.nodes[this.nest]) < 0.3) {
            this.state = 'LURK';
            this.timer = 5 + Math.random() * 7;
          } else {
            this.timer = 1.5;
            this.waypoints = this.route(this.nodes[this.nest]);
          }
        }
        break;
      case 'HUNT':
        speed = HUNT_SPEED;
        if (!prey) {
          this.state = 'ROAM';
          this.waypoints = this.route(this.nodes[this.nest]);
        } else {
          this.waypoints = this.route(prey.h.pos);
          this.growlTimer -= delta;
          if (this.growlTimer <= 0) {
            this.growlTimer = 2 + Math.random() * 2;
            this.playSound('growl', listener);
          }
        }
        break;
    }

    this.moveAlong(delta, speed);
    this.animate(delta, listener);

    // Caught someone?
    if (this.state === 'HUNT' && prey && Math.hypot(prey.h.pos.x - this.position.x, prey.h.pos.z - this.position.z) < 0.85) {
      return prey.i;
    }
    return -1;
  }

  private isLitBy(h: CrawlerHuman) {
    const head = this.headWorld;
    const to = head.clone().sub(h.eye);
    const d = to.length();
    if (d > 7.5 || d < 0.01) return false;
    const look = new THREE.Vector3(-Math.sin(h.yaw) * Math.cos(h.pitch), Math.sin(h.pitch), -Math.cos(h.yaw) * Math.cos(h.pitch));
    // Must be in the same stretch of duct (no light through metal walls)
    const me = this.project(this.position);
    const them = this.project(h.pos);
    const sameLine = me.edge === them.edge || Math.abs(me.point.x - them.point.x) < 0.6 || Math.abs(me.point.z - them.point.z) < 0.6;
    return sameLine && to.normalize().dot(look) > Math.cos(THREE.MathUtils.degToRad(24));
  }

  private moveAlong(delta: number, speed: number) {
    let step = speed * delta;
    const start = this.position.clone();
    while (step > 0 && this.waypoints.length) {
      const wp = this.waypoints[0];
      const dx = wp.x - this.position.x;
      const dz = wp.z - this.position.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.02) {
        this.waypoints.shift();
        continue;
      }
      const k = Math.min(step, d) / d;
      this.position.x += dx * k;
      this.position.z += dz * k;
      step -= Math.min(step, d);
    }
    const moved = this.position.clone().sub(start);
    this.speed = moved.length() / Math.max(delta, 1e-4);
    if (moved.lengthSq() > 1e-8) {
      const want = Math.atan2(moved.x, moved.z);
      this.mesh.rotation.y = this.turn(this.mesh.rotation.y, want, delta * 10);
    }
    this.mesh.position.copy(this.position);
  }

  private turn(from: number, to: number, k: number) {
    let d = to - from;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return from + d * Math.min(1, k);
  }

  // ---------------------------------------------------------------------
  // Guest replica
  // ---------------------------------------------------------------------
  public netApply(x: number, z: number, ry: number, state: CrawlerState) {
    this.netTarget = new THREE.Vector3(x, 0, z);
    this.netYaw = ry;
    this.state = state;
  }

  public netUpdate(delta: number, listener: { pos: THREE.Vector3; right: THREE.Vector3 }) {
    this.animTime += delta;
    if (this.netTarget) {
      const before = this.position.clone();
      this.position.lerp(this.netTarget, 1 - Math.exp(-10 * delta));
      this.speed = before.distanceTo(this.position) / Math.max(delta, 1e-4);
      this.mesh.rotation.y = this.turn(this.mesh.rotation.y, this.netYaw, delta * 10);
      this.mesh.position.copy(this.position);
    }
    if (this.state === 'HUNT') {
      this.growlTimer -= delta;
      if (this.growlTimer <= 0) {
        this.growlTimer = 2 + Math.random() * 2;
        this.playSound('growl', listener);
      }
    }
    this.animate(delta, listener);
  }

  // ---------------------------------------------------------------------
  // Animation & sound
  // ---------------------------------------------------------------------
  private animate(delta: number, listener: { pos: THREE.Vector3; right: THREE.Vector3 }) {
    const moving = this.speed > 0.1;
    this.gait += delta * (moving ? 3 + this.speed * 3.2 : 0.6);
    const stride = moving ? Math.min(0.32, 0.12 + this.speed * 0.08) : 0.03;
    // Low, twitchy body
    const hunting = this.state === 'HUNT';
    this.body.position.y = (hunting ? 0.42 : 0.5) + Math.sin(this.gait * 2) * 0.025;
    this.body.rotation.z = Math.sin(this.gait) * 0.06;
    this.body.rotation.x = hunting ? 0.12 : 0.04;
    for (const leg of this.legs) {
      const ph = this.gait + leg.phase;
      const foot = leg.base.clone();
      foot.z += Math.sin(ph) * stride;
      foot.y = Math.max(0, Math.cos(ph)) * (moving ? 0.14 : 0.02);
      // The body is lower when hunting: feet stay on the floor (y relative to the body)
      foot.y -= this.body.position.y;
      this.solveLeg(leg, foot);
    }
    if (Math.random() < (hunting ? 0.15 : 0.04)) {
      this.head.rotation.z = (Math.random() - 0.5) * 0.8;
      this.head.rotation.y = (Math.random() - 0.5) * 0.5;
    }
    this.head.rotation.x = hunting ? -0.25 : 0.1;
    this.jaw.scale.y = hunting ? 1.6 + Math.sin(this.animTime * 25) * 0.15 : 1.15;
    this.eyeMat.emissiveIntensity = hunting ? 9 : this.state === 'FLEE' ? 1 : 4;
    this.mesh.updateMatrixWorld(true);
    this.head.getWorldPosition(this.headWorld);

    if (moving) {
      this.soundTimer -= delta;
      if (this.soundTimer <= 0) {
        this.soundTimer = Math.max(0.12, 0.42 - this.speed * 0.1);
        this.playSound('step', listener);
      }
    }
  }

  /** Two-bone IK in the leg's vertical plane (knee bends up). */
  private solveLeg(leg: Leg, foot: THREE.Vector3) {
    const hip = new THREE.Vector3(leg.yawG.position.x, 0, leg.yawG.position.z);
    const v = foot.clone().sub(hip);
    const h = Math.hypot(v.x, v.z);
    leg.yawG.rotation.y = Math.atan2(v.x, v.z);
    const D = THREE.MathUtils.clamp(Math.hypot(h, v.y), 0.1, leg.L1 + leg.L2 - 0.01);
    const a = Math.atan2(v.y, h);
    const e1 = a + Math.acos(THREE.MathUtils.clamp((leg.L1 ** 2 + D ** 2 - leg.L2 ** 2) / (2 * leg.L1 * D), -1, 1));
    const kneeAngle = Math.acos(THREE.MathUtils.clamp((leg.L1 ** 2 + leg.L2 ** 2 - D ** 2) / (2 * leg.L1 * leg.L2), -1, 1));
    leg.upper.rotation.x = -e1;
    leg.knee.rotation.x = Math.PI - kneeAngle;
  }

  private playSound(kind: 'step' | 'growl' | 'screech', listener: { pos: THREE.Vector3; right: THREE.Vector3 }) {
    const to = this.position.clone().sub(listener.pos).setY(0);
    const d = to.length();
    if (d > 16) return;
    const pan = d > 0.01 ? THREE.MathUtils.clamp(to.normalize().dot(listener.right), -1, 1) : 0;
    // Inside a metal duct everything rings closer than it is
    const ear = Math.max(0.5, d * 0.6);
    if (kind === 'step') sound.playMonsterFootstep(ear, pan, false);
    else if (kind === 'growl') sound.playMonsterGrowl(ear, pan);
    else {
      sound.playMonsterGrowl(Math.max(0.5, ear * 0.5), pan);
      sound.playMonsterFootstep(ear, pan, true);
    }
  }

  /** Death sequence: rears up and lunges at the camera. */
  public poseLunge(camPos: THREE.Vector3, t: number) {
    const dir = camPos.clone().sub(this.position).setY(0);
    if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
    dir.normalize();
    this.mesh.rotation.y = Math.atan2(dir.x, dir.z);
    const dist = 1.0 - Math.min(t, 0.3) * 1.4;
    this.position.set(camPos.x - dir.x * dist, 0, camPos.z - dir.z * dist);
    this.mesh.position.copy(this.position);
    this.body.position.y = 0.55;
    this.body.rotation.x = -0.55;
    this.head.rotation.set(0.5, 0, Math.sin(t * 40) * 0.2);
    this.jaw.scale.y = 2.2;
    this.eyeMat.emissiveIntensity = 12;
    for (const leg of this.legs) {
      const front = leg.base.z > 0;
      this.solveLeg(leg, new THREE.Vector3(leg.base.x * 0.8, front ? 0.35 + Math.sin(t * 30) * 0.1 : -0.55, front ? 0.75 : leg.base.z));
    }
    this.mesh.updateMatrixWorld(true);
    this.head.getWorldPosition(this.headWorld);
  }

  public dispose() {
    this.disposables.forEach((d) => d.dispose());
    this.eyeMat.dispose();
  }
}
