import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { CollisionBox, FlickerLight, MapData } from './MapBuilder';
import { MonsterAI, Listener } from './MonsterAI';
import { sound } from '../audio/SoundSystem';
import { GameItem } from '../types';

/**
 * CHAPTER 4 — LA FORÊT
 * Out of the maze, into the woods behind Saint-Aurore, at night, in the rain.
 * Reach the radio tower (red light above the trees), find 2 jerrycans in the
 * cabins, start the generator, call for help, light the 3 flares of the clearing
 * and hold on until the helicopter lands. The Beast hunts BY SIGHT: a lit
 * flashlight is seen from far away; crouched in the ferns, torch off, you are
 * almost invisible.
 */
const CX = 0;
const CZ = 600;
const S = 80; // half size of the playable square

const rng = (seed: number) => {
  let a = Math.floor(seed * 4294967296) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export interface ForestPlayer {
  pos: THREE.Vector3;
  yaw: number;
  flashlight: boolean;
  crouch: boolean;
  sprint: boolean;
  dead?: boolean;
}

/** Host → guest: what changed in the forest. */
export interface ForestNet {
  ph: string;
  fuel: number;
  cf: boolean[];
  gen: boolean;
  fl: boolean[];
  wl: number;
  h: boolean;
  ht: number;
  hy: number;
  rel: boolean;
  sdw: boolean;
}

type Phase = 'tower' | 'fuel' | 'refuel' | 'radio' | 'wait' | 'board';
type Mode = 'roam' | 'investigate' | 'chase' | 'search';

interface Cabin {
  pos: THREE.Vector3;
  hasFuel: boolean;
  fuelMesh: THREE.Object3D | null;
  fuelPos: THREE.Vector3;
  visited: boolean;
}
interface Flare {
  pos: THREE.Vector3;
  lit: boolean;
  light: FlickerLight;
  headMat: THREE.MeshStandardMaterial;
}
interface Spot {
  x: number;
  z: number;
  r: number;
}

export interface ForestAction {
  rescue?: boolean;
  msg?: string;
  shake?: number;
}

export class Forest {
  public readonly start: THREE.Vector3;
  public readonly startYaw = 0;
  public stalker: MonsterAI | null = null;
  public noteDrops: { item: GameItem; pos: THREE.Vector3 }[] = [];
  /** Lightning (0..1): the engine adds it to the sky light. */
  public flash = 0;
  /** Seen by the Beast while waiting for the helicopter (achievement). */
  public seenDuringWait = false;
  public phase: Phase = 'tower';
  public fuel = 0;

  /** Co-op guest: the host runs the level, this one only mirrors it. */
  public guest = false;
  private r: () => number;
  private root = new THREE.Group();
  private disposables: { dispose: () => void }[] = [];
  private ownLights: FlickerLight[] = [];
  private staticBoxes: CollisionBox[] = [];
  private grid = new Map<string, CollisionBox[]>();
  private bushGrid = new Map<string, Spot[]>();
  private trunks: Spot[] = [];
  private trunkGrid = new Map<string, Spot[]>();
  private activeBoxes: CollisionBox[] = [];
  private lastRefresh = new THREE.Vector3(1e9, 0, 1e9);
  private clears: Spot[] = [];

  private tower: THREE.Vector3;
  private towerLamp!: THREE.MeshBasicMaterial;
  private shack: THREE.Vector3;
  private radioPos: THREE.Vector3;
  private radioMat!: THREE.MeshStandardMaterial;
  private shackLight!: FlickerLight;
  private gen: THREE.Vector3;
  private genMesh!: THREE.Group;
  private genRunning = false;
  private genNoiseT = 0;
  private flood!: FlickerLight;
  private clearing: THREE.Vector3;
  private cabins: Cabin[] = [];
  private flares: Flare[] = [];
  private waitLeft = 0;
  private waitTotal: number;

  // Helicopter
  private heli: THREE.Group | null = null;
  private heliT = 0;
  private heliRotor: THREE.Object3D | null = null;
  private heliTail: THREE.Object3D | null = null;
  private heliLight: FlickerLight | null = null;
  private ladder: THREE.Group | null = null;
  private heliY = 18;
  private heliWarned = false;

  // Rain & weather
  private rain: THREE.LineSegments;
  private rainPos: Float32Array;
  private thunderT = 12;
  private flashSeq: number[] = [];
  private prevFog: THREE.Fog | THREE.FogExp2 | null;
  private prevBg: THREE.Color | THREE.Texture | null;

  // The Beast
  private released = false;
  private releaseT: number;
  private mode: Mode = 'roam';
  private target = new THREE.Vector3();
  private lastSeen = new THREE.Vector3();
  private lostT = 0;
  private lingerT = 0;
  private roamT = 0;
  private stunT = 0;
  private sniffT = 8;
  private stuckT = 0;
  private stuckFrom = new THREE.Vector3();
  private ghostT = 0;
  private bushTip = false;
  private seenTip = false;

  constructor(
    private map: MapData,
    private scene: THREE.Scene,
    private difficulty: number,
    private lowEnd: boolean,
    private toast: (msg: string) => void,
    seed: number
  ) {
    this.r = rng(seed);
    const r = this.r;
    this.start = new THREE.Vector3(CX + (r() - 0.5) * 20, 1.72, CZ + S - 10);
    this.tower = new THREE.Vector3(CX + (r() - 0.5) * 60, 0, CZ - S + 26);
    this.shack = this.tower.clone().add(new THREE.Vector3(5, 0, 3.5));
    this.radioPos = this.shack.clone().add(new THREE.Vector3(0, 0, -0.6));
    this.gen = this.tower.clone().add(new THREE.Vector3(-4, 0, 4));
    const side = this.tower.x > CX ? -1 : 1;
    this.clearing = this.tower.clone().add(new THREE.Vector3(side * 30, 0, 16));
    this.waitTotal = [60, 75, 85, 95, 105][Math.max(0, Math.min(4, difficulty - 1))];
    this.releaseT = [28, 24, 20, 16, 12][Math.max(0, Math.min(4, difficulty - 1))] ?? 20;

    this.clears = [
      { x: this.start.x, z: this.start.z, r: 7 },
      { x: this.tower.x + 1, z: this.tower.z + 2, r: 11 },
      { x: this.clearing.x, z: this.clearing.z, r: 15 },
    ];
    this.pickCabins();

    this.prevFog = scene.fog as THREE.Fog | THREE.FogExp2 | null;
    this.prevBg = scene.background as THREE.Color | null;
    // Pale night mist: the trees stand out as black silhouettes against it
    scene.fog = new THREE.FogExp2(0x1c2430, 0.036);
    scene.background = new THREE.Color(0x1c2430);

    this.buildGround();
    this.buildTrees();
    this.buildStart();
    this.buildTower();
    this.buildShack();
    this.buildGenerator();
    this.cabins.forEach((c) => this.buildCabin(c));
    this.buildClearing();
    this.buildBounds();
    this.makeNotes();

    // Rain: streaks around the camera
    const n = lowEnd ? 600 : 1100;
    this.rainPos = new Float32Array(n * 6);
    for (let i = 0; i < n; i++) {
      const x = (Math.random() - 0.5) * 36;
      const y = Math.random() * 16;
      const z = (Math.random() - 0.5) * 36;
      this.rainPos.set([x, y, z, x + 0.05, y + 0.55, z], i * 6);
    }
    const rg = this.track(new THREE.BufferGeometry());
    rg.setAttribute('position', new THREE.BufferAttribute(this.rainPos, 3));
    this.rain = new THREE.LineSegments(rg, this.track(new THREE.LineBasicMaterial({ color: 0x9aaabb, transparent: true, opacity: 0.3, depthWrite: false })));
    this.rain.frustumCulled = false;
    this.root.add(this.rain);

    this.scene.add(this.root);
    sound.setLoop('rain', 0.55);
    if (difficulty >= 2) this.spawnBeast();
  }

  private track<X extends { dispose: () => void }>(o: X) {
    this.disposables.push(o);
    return o;
  }

  private key(x: number, z: number) {
    return `${Math.floor(x / 8)},${Math.floor(z / 8)}`;
  }

  private isClear(x: number, z: number, pad = 0) {
    return this.clears.every((c) => Math.hypot(c.x - x, c.z - z) > c.r + pad);
  }

  private light(pos: THREE.Vector3, color: number, intensity: number, distance: number, mat: THREE.MeshStandardMaterial, flicker: boolean): FlickerLight {
    const l: FlickerLight = {
      position: pos.clone(),
      color: new THREE.Color(color),
      distance,
      k: 1,
      current: 0,
      fixtureMat: mat,
      baseIntensity: intensity,
      baseEmissive: 2.5,
      nextFlicker: Math.random() * 2,
      flicker,
      needsPower: false,
    };
    this.map.lights.push(l);
    this.ownLights.push(l);
    return l;
  }

  /** Static solid box (always collides). */
  private solid(minX: number, minZ: number, maxX: number, maxZ: number, h = 3) {
    const b = { min: new THREE.Vector3(minX, 0, minZ), max: new THREE.Vector3(maxX, h, maxZ) };
    this.staticBoxes.push(b);
    this.map.collisionBoxes.push(b);
    return b;
  }

  /** A tree / rock collider, only active near the player. */
  private gridBox(x: number, z: number, half: number) {
    const b = { min: new THREE.Vector3(x - half, 0, z - half), max: new THREE.Vector3(x + half, 4, z + half) };
    const k = this.key(x, z);
    const list = this.grid.get(k);
    if (list) list.push(b);
    else this.grid.set(k, [b]);
  }

  private boxesNear(x: number, z: number, rad: number) {
    const out: CollisionBox[] = [];
    for (let gx = Math.floor((x - rad) / 8); gx <= Math.floor((x + rad) / 8); gx++)
      for (let gz = Math.floor((z - rad) / 8); gz <= Math.floor((z + rad) / 8); gz++) {
        const l = this.grid.get(`${gx},${gz}`);
        if (l) out.push(...l);
      }
    return out;
  }

  private spotsNear(g: Map<string, Spot[]>, x: number, z: number, rad: number) {
    const out: Spot[] = [];
    for (let gx = Math.floor((x - rad) / 8); gx <= Math.floor((x + rad) / 8); gx++)
      for (let gz = Math.floor((z - rad) / 8); gz <= Math.floor((z + rad) / 8); gz++) {
        const l = g.get(`${gx},${gz}`);
        if (l) out.push(...l);
      }
    return out;
  }

  private addSpot(g: Map<string, Spot[]>, s: Spot) {
    const k = this.key(s.x, s.z);
    const l = g.get(k);
    if (l) l.push(s);
    else g.set(k, [s]);
  }

  // ---------------------------------------------------------------------
  // Layout
  // ---------------------------------------------------------------------
  private pickCabins() {
    const r = this.r;
    const cands: THREE.Vector3[] = [];
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2 + r() * 0.4;
      const rad = 36 + r() * 24;
      const p = new THREE.Vector3(CX + Math.cos(a) * rad, 0, CZ + Math.sin(a) * rad);
      if (Math.abs(p.x - CX) > S - 10 || Math.abs(p.z - CZ) > S - 10) continue;
      if (p.distanceTo(new THREE.Vector3(this.start.x, 0, this.start.z)) < 26) continue;
      if (p.distanceTo(this.tower) < 28 || p.distanceTo(this.clearing) < 24) continue;
      cands.push(p);
    }
    // Shuffle, keep 4 far enough from each other
    cands.sort(() => r() - 0.5);
    for (const p of cands) {
      if (this.cabins.length >= 4) break;
      if (this.cabins.some((c) => c.pos.distanceTo(p) < 22)) continue;
      this.cabins.push({ pos: p, hasFuel: false, fuelMesh: null, fuelPos: p.clone(), visited: false });
    }
    while (this.cabins.length < 3) {
      const p = new THREE.Vector3(CX + (this.cabins.length - 1) * 45, 0, CZ + 10);
      this.cabins.push({ pos: p, hasFuel: false, fuelMesh: null, fuelPos: p.clone(), visited: false });
    }
    const idx = this.cabins.map((_, i) => i).sort(() => r() - 0.5);
    this.cabins[idx[0]].hasFuel = true;
    this.cabins[idx[1]].hasFuel = true;
    for (const c of this.cabins) this.clears.push({ x: c.pos.x, z: c.pos.z, r: 5.5 });
  }

  private canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, rx: number, ry: number) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    draw(c.getContext('2d')!);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rx, ry);
    t.anisotropy = 4;
    this.disposables.push(t);
    return t;
  }

  private buildGround() {
    const size = S * 2 + 60;
    const tex = this.canvasTex(
      256,
      256,
      (g) => {
        g.fillStyle = '#4c5038';
        g.fillRect(0, 0, 256, 256);
        for (let i = 0; i < 260; i++) {
          const c = ['#5a5c40', '#3e4430', '#5e4c36', '#48583a', '#665a3e'][i % 5];
          g.fillStyle = c;
          g.globalAlpha = 0.5;
          g.beginPath();
          g.ellipse(Math.random() * 256, Math.random() * 256, 4 + Math.random() * 16, 3 + Math.random() * 10, Math.random() * 3, 0, Math.PI * 2);
          g.fill();
        }
        g.globalAlpha = 0.7;
        for (let i = 0; i < 900; i++) {
          g.strokeStyle = ['#6a7c46', '#6a6038', '#52683a'][i % 3];
          const x = Math.random() * 256;
          const y = Math.random() * 256;
          g.beginPath();
          g.moveTo(x, y);
          g.lineTo(x + (Math.random() - 0.5) * 3, y - 2 - Math.random() * 4);
          g.stroke();
        }
      },
      size / 5,
      size / 5
    );
    const mat = this.track(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.75, metalness: 0 }));
    const geo = this.track(new THREE.PlaneGeometry(size, size));
    const m = new THREE.Mesh(geo, mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(CX, 0, CZ);
    m.receiveShadow = true;
    this.root.add(m);
  }

  private buildTrees() {
    const r = this.r;
    const bark = this.canvasTex(
      64,
      256,
      (g) => {
        g.fillStyle = '#5a4838';
        g.fillRect(0, 0, 64, 256);
        for (let i = 0; i < 70; i++) {
          g.fillStyle = ['#3a2c22', '#6e5a46', '#4a3a2c'][i % 3];
          g.fillRect(Math.random() * 64, Math.random() * 256, 2 + Math.random() * 4, 20 + Math.random() * 60);
        }
      },
      1,
      2
    );
    const trunkMat = this.track(new THREE.MeshStandardMaterial({ map: bark, roughness: 0.95 }));
    const crownMat = this.track(new THREE.MeshStandardMaterial({ color: 0x2f4a32, roughness: 1, flatShading: true }));
    const bushMat = this.track(new THREE.MeshStandardMaterial({ color: 0x3a5434, roughness: 1, flatShading: true }));
    const rockMat = this.track(new THREE.MeshStandardMaterial({ color: 0x6a6a6c, roughness: 0.9, flatShading: true }));
    const trunkGeo = this.track(new THREE.CylinderGeometry(0.15, 0.27, 8, 6).translate(0, 4, 0));
    const parts = [
      new THREE.ConeGeometry(2.1, 4.2, 7).translate(0, 4.7, 0),
      new THREE.ConeGeometry(1.6, 3.4, 7).translate(0, 6.6, 0),
      new THREE.ConeGeometry(1.05, 2.6, 7).translate(0, 8.4, 0),
    ];
    const crownGeo = this.track(mergeGeometries(parts)!);
    parts.forEach((p) => p.dispose());

    const trees: { x: number; z: number; s: number; a: number }[] = [];
    const step = 3.3;
    for (let x = CX - S - 6; x <= CX + S + 6; x += step)
      for (let z = CZ - S - 6; z <= CZ + S + 6; z += step) {
        const px = x + (r() - 0.5) * 2.4;
        const pz = z + (r() - 0.5) * 2.4;
        const edge = Math.abs(px - CX) > S - 7 || Math.abs(pz - CZ) > S - 7;
        if (r() > (edge ? 0.92 : 0.4)) continue;
        if (!this.isClear(px, pz)) continue;
        trees.push({ x: px, z: pz, s: 0.8 + r() * 0.55, a: r() * Math.PI * 2 });
      }
    const tm = new THREE.InstancedMesh(trunkGeo, trunkMat, trees.length);
    const cm = new THREE.InstancedMesh(crownGeo, crownMat, trees.length);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    trees.forEach((t, i) => {
      q.setFromAxisAngle(up, t.a);
      m4.compose(new THREE.Vector3(t.x, 0, t.z), q, new THREE.Vector3(t.s, t.s * (0.9 + (i % 5) * 0.06), t.s));
      tm.setMatrixAt(i, m4);
      cm.setMatrixAt(i, m4);
      this.gridBox(t.x, t.z, 0.24 * t.s);
      const sp = { x: t.x, z: t.z, r: 0.25 * t.s };
      this.trunks.push(sp);
      this.addSpot(this.trunkGrid, sp);
    });
    tm.castShadow = !this.lowEnd;
    tm.receiveShadow = true;
    cm.receiveShadow = true;
    tm.computeBoundingSphere();
    cm.computeBoundingSphere();
    this.disposables.push({ dispose: () => tm.dispose() }, { dispose: () => cm.dispose() });
    this.root.add(tm, cm);

    // Ferns / bushes: crouch inside one with the torch off and it won't see you
    const bushGeo = this.track(new THREE.IcosahedronGeometry(1, 0));
    const bushes: Spot[] = [];
    for (let i = 0; i < 260; i++) {
      const x = CX + (r() - 0.5) * (S * 2 - 10);
      const z = CZ + (r() - 0.5) * (S * 2 - 10);
      if (!this.isClear(x, z, -2)) continue;
      bushes.push({ x, z, r: 0.9 + r() * 0.5 });
    }
    // A few right next to the main places
    for (const c of [...this.cabins.map((c) => c.pos), this.tower, this.clearing]) {
      for (let k = 0; k < 3; k++) {
        const a = r() * Math.PI * 2;
        const d = c === this.clearing ? 16 + r() * 3 : 7 + r() * 3;
        bushes.push({ x: c.x + Math.cos(a) * d, z: c.z + Math.sin(a) * d, r: 1.1 + r() * 0.3 });
      }
    }
    const bm = new THREE.InstancedMesh(bushGeo, bushMat, bushes.length);
    bushes.forEach((b, i) => {
      q.setFromAxisAngle(up, r() * 6);
      m4.compose(new THREE.Vector3(b.x, 0.25, b.z), q, new THREE.Vector3(b.r * 1.15, b.r * 0.62, b.r));
      bm.setMatrixAt(i, m4);
      this.addSpot(this.bushGrid, b);
    });
    bm.receiveShadow = true;
    bm.computeBoundingSphere();
    this.disposables.push({ dispose: () => bm.dispose() });
    this.root.add(bm);

    // Rocks
    const rockGeo = this.track(new THREE.DodecahedronGeometry(1, 0));
    const rocks: Spot[] = [];
    for (let i = 0; i < 60; i++) {
      const x = CX + (r() - 0.5) * (S * 2 - 8);
      const z = CZ + (r() - 0.5) * (S * 2 - 8);
      if (!this.isClear(x, z, 1)) continue;
      rocks.push({ x, z, r: 0.4 + r() * 1.0 });
    }
    const rm = new THREE.InstancedMesh(rockGeo, rockMat, rocks.length);
    rocks.forEach((b, i) => {
      q.setFromEuler(new THREE.Euler(r(), r() * 6, r()));
      m4.compose(new THREE.Vector3(b.x, b.r * 0.25, b.z), q, new THREE.Vector3(b.r, b.r * 0.7, b.r * 0.9));
      rm.setMatrixAt(i, m4);
      if (b.r > 0.6) this.gridBox(b.x, b.z, b.r * 0.75);
    });
    rm.castShadow = !this.lowEnd;
    rm.computeBoundingSphere();
    this.disposables.push({ dispose: () => rm.dispose() });
    this.root.add(rm);
  }

  private mat(color: number, rough = 0.85, metal = 0.05, extra: THREE.MeshStandardMaterialParameters = {}) {
    return this.track(new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra }));
  }

  private box(parent: THREE.Object3D, w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number) {
    const mesh = new THREE.Mesh(this.track(new THREE.BoxGeometry(w, h, d)), m);
    mesh.position.set(x, y, z);
    mesh.castShadow = !this.lowEnd;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  /** The concrete culvert you crawled out of. */
  private buildStart() {
    const g = new THREE.Group();
    g.position.set(this.start.x, 0, this.start.z + 3.2);
    const concrete = this.mat(0x5a5a56, 0.95);
    const pipe = new THREE.Mesh(this.track(new THREE.CylinderGeometry(1.3, 1.3, 3, 18, 1, true)), this.mat(0x4a4a46, 0.9, 0.05, { side: THREE.DoubleSide }));
    pipe.rotation.x = Math.PI / 2;
    pipe.position.set(0, 1.1, 0.6);
    g.add(pipe);
    const dark = new THREE.Mesh(this.track(new THREE.CircleGeometry(1.25, 18)), this.track(new THREE.MeshBasicMaterial({ color: 0x000000 })));
    dark.position.set(0, 1.1, 0.35);
    dark.rotation.y = Math.PI;
    g.add(dark);
    this.box(g, 9, 3, 2.4, concrete, 0, 1.5, 1.6);
    this.root.add(g);
    this.solid(g.position.x - 4.5, g.position.z - 0.95, g.position.x + 4.5, g.position.z + 2.9, 3);
    // The grate you pushed out, lying in the mud
    const grate = this.box(g, 2.2, 0.05, 1.6, this.mat(0x3a2a20, 0.6, 0.6), 2.4, 0.05, -2.0);
    grate.rotation.y = 0.4;
  }

  /** A unit cylinder stretched between two points (tower lattice). */
  private beam(parent: THREE.Object3D, geo: THREE.BufferGeometry, m: THREE.Material, a: THREE.Vector3, b: THREE.Vector3, rad: number) {
    const mesh = new THREE.Mesh(geo, m);
    const d = b.clone().sub(a);
    mesh.scale.set(rad, d.length(), rad);
    mesh.position.copy(a).addScaledVector(d, 0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    parent.add(mesh);
  }

  private buildTower() {
    const g = new THREE.Group();
    g.position.copy(this.tower);
    const steel = this.mat(0x6a6e72, 0.6, 0.7);
    const geo = this.track(new THREE.CylinderGeometry(1, 1, 1, 5));
    const H = 26;
    const corner = (y: number, i: number) => {
      const w = 1.6 - (y / H) * 1.05;
      return new THREE.Vector3(i === 0 || i === 3 ? -w : w, y, i < 2 ? -w : w);
    };
    for (let i = 0; i < 4; i++) this.beam(g, geo, steel, corner(0, i), corner(H, i), 0.08);
    for (let y = 0; y < H; y += 3.25) {
      for (let i = 0; i < 4; i++) {
        const j = (i + 1) % 4;
        this.beam(g, geo, steel, corner(y + 3.25, i), corner(y + 3.25, j), 0.04);
        this.beam(g, geo, steel, corner(y, i), corner(y + 3.25, j), 0.03);
      }
    }
    // Antenna + the red warning light, seen above the trees (and through the fog)
    this.beam(g, geo, steel, new THREE.Vector3(0, H, 0), new THREE.Vector3(0, H + 5, 0), 0.06);
    this.towerLamp = this.track(new THREE.MeshBasicMaterial({ color: 0xff2a1a, fog: false }));
    const lamp = new THREE.Mesh(this.track(new THREE.SphereGeometry(0.35, 10, 8)), this.towerLamp);
    lamp.position.set(0, H + 5.2, 0);
    g.add(lamp);
    const glow = new THREE.Mesh(
      this.track(new THREE.SphereGeometry(2.4, 10, 8)),
      this.track(new THREE.MeshBasicMaterial({ color: 0xff2a1a, fog: false, transparent: true, opacity: 0.25, depthWrite: false }))
    );
    glow.position.copy(lamp.position);
    glow.name = 'glow';
    g.add(glow);
    // Concrete footing
    this.box(g, 4, 0.3, 4, this.mat(0x55554f, 0.95), 0, 0.15, 0);
    this.root.add(g);
    for (let i = 0; i < 4; i++) {
      const c = corner(0, i).add(this.tower);
      this.solid(c.x - 0.25, c.z - 0.25, c.x + 0.25, c.z + 0.25, 4);
    }
    // Floodlight on the tower, powered by the generator
    const floodMat = this.mat(0x202020, 0.5, 0.3, { emissive: 0xfff2d0, emissiveIntensity: 0 });
    this.box(g, 0.5, 0.35, 0.3, floodMat, 0, 5, 1.6);
    this.flood = this.light(this.tower.clone().add(new THREE.Vector3(0, 4.6, 3)), 0xfff0d0, 0, 18, floodMat, false);
    this.flood.baseEmissive = 0;
  }

  private buildShack() {
    const g = new THREE.Group();
    g.position.copy(this.shack);
    const wall = this.mat(0x6b6a62, 0.95);
    const W = 3.6;
    const H = 2.7;
    const t = 0.18;
    // North, east, west walls; south wall with a door gap (1.2 m)
    this.box(g, W, H, t, wall, 0, H / 2, -W / 2);
    this.box(g, t, H, W, wall, -W / 2, H / 2, 0);
    this.box(g, t, H, W, wall, W / 2, H / 2, 0);
    this.box(g, (W - 1.2) / 2, H, t, wall, -(W / 2 - (W - 1.2) / 4), H / 2, W / 2);
    this.box(g, (W - 1.2) / 2, H, t, wall, W / 2 - (W - 1.2) / 4, H / 2, W / 2);
    this.box(g, W + 0.4, 0.15, W + 0.4, this.mat(0x3a3a38, 0.9), 0, H + 0.07, 0);
    // Desk + radio
    const desk = this.mat(0x4a3826, 0.85);
    this.box(g, 1.6, 0.08, 0.7, desk, 0, 0.85, -W / 2 + 0.5);
    for (const sx of [-0.7, 0.7]) this.box(g, 0.06, 0.85, 0.6, desk, sx, 0.42, -W / 2 + 0.5);
    this.radioMat = this.mat(0x1a1d1a, 0.5, 0.4, { emissive: 0x30ff60, emissiveIntensity: 0 });
    this.box(g, 0.7, 0.32, 0.35, this.mat(0x2a2e2a, 0.5, 0.5), 0, 1.05, -W / 2 + 0.45);
    this.box(g, 0.5, 0.12, 0.02, this.radioMat, 0, 1.08, -W / 2 + 0.64);
    const mic = this.box(g, 0.06, 0.14, 0.06, this.mat(0x111111, 0.4, 0.6), 0.45, 0.96, -W / 2 + 0.6);
    mic.rotation.z = 0.3;
    // Light over the door (on with the generator)
    const bulbMat = this.mat(0x222018, 0.5, 0, { emissive: 0xffd9a0, emissiveIntensity: 0 });
    this.box(g, 0.3, 0.08, 0.2, bulbMat, 0, H - 0.08, 0);
    this.shackLight = this.light(this.shack.clone().add(new THREE.Vector3(0, H - 0.4, 0)), 0xffd0a0, 0, 9, bulbMat, true);
    this.shackLight.baseEmissive = 0;
    this.root.add(g);
    const x = this.shack.x;
    const z = this.shack.z;
    this.solid(x - W / 2 - t, z - W / 2 - t, x + W / 2 + t, z - W / 2 + t);
    this.solid(x - W / 2 - t, z - W / 2, x - W / 2 + t, z + W / 2);
    this.solid(x + W / 2 - t, z - W / 2, x + W / 2 + t, z + W / 2);
    this.solid(x - W / 2, z + W / 2 - t, x - 0.6, z + W / 2 + t);
    this.solid(x + 0.6, z + W / 2 - t, x + W / 2, z + W / 2 + t);
    this.solid(x - 0.8, z - W / 2, x + 0.8, z - W / 2 + 0.85, 1);
  }

  private buildGenerator() {
    const g = new THREE.Group();
    g.position.copy(this.gen);
    const paint = this.mat(0x8a7420, 0.55, 0.4);
    const dark = this.mat(0x222222, 0.6, 0.6);
    this.box(g, 1.3, 0.75, 0.8, paint, 0, 0.55, 0);
    this.box(g, 1.45, 0.08, 0.95, dark, 0, 0.12, 0);
    this.box(g, 0.5, 0.25, 0.5, dark, -0.35, 1.05, 0);
    this.box(g, 0.08, 0.5, 0.08, dark, 0.5, 1.15, -0.25);
    this.box(g, 0.2, 0.2, 0.05, this.mat(0xb02020, 0.4, 0.3), 0.66, 0.6, 0.41);
    this.genMesh = g;
    this.root.add(g);
    this.solid(this.gen.x - 0.8, this.gen.z - 0.55, this.gen.x + 0.8, this.gen.z + 0.55, 1.2);
  }

  /** Wooden hut, door towards the middle of the forest, lantern inside. */
  private buildCabin(c: Cabin) {
    const r = this.r;
    const g = new THREE.Group();
    g.position.copy(c.pos);
    // Door faces the center (rounded to a quarter turn so colliders stay axis-aligned)
    const to = Math.atan2(CX - c.pos.x, CZ - c.pos.z);
    const yaw = Math.round(to / (Math.PI / 2)) * (Math.PI / 2);
    g.rotation.y = yaw;
    const wood = this.mat(0x4a3424, 0.95);
    const dark = this.mat(0x2e2016, 0.95);
    const W = 4.2;
    const H = 2.5;
    const t = 0.16;
    // Local frame: door in the +z wall
    const parts: [number, number, number, number][] = [
      // cx, cz, w, d (local)
      [0, -W / 2, W, t],
      [-W / 2, 0, t, W],
      [W / 2, 0, t, W],
      [-(W / 2 - (W - 1.2) / 4), W / 2, (W - 1.2) / 2, t],
      [W / 2 - (W - 1.2) / 4, W / 2, (W - 1.2) / 2, t],
    ];
    for (const [x, z, w, d] of parts) {
      this.box(g, w, H, d, wood, x, H / 2, z);
      // World collider (quarter turns: swap sizes)
      const wp = new THREE.Vector3(x, 0, z).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw).add(c.pos);
      const swap = Math.abs(Math.sin(yaw)) > 0.5;
      const hw = (swap ? d : w) / 2;
      const hd = (swap ? w : d) / 2;
      this.solid(wp.x - hw, wp.z - hd, wp.x + hw, wp.z + hd);
    }
    // Pitched roof
    for (const s of [-1, 1]) {
      const roof = this.box(g, W + 0.6, 0.1, W / 2 + 0.5, dark, 0, H + 0.55, s * (W / 4 + 0.05));
      roof.rotation.x = s * 0.45;
    }
    // Table, bed frame, shelves
    this.box(g, 1.2, 0.06, 0.7, wood, -1.1, 0.8, -1.3);
    for (const sx of [-1.6, -0.6]) this.box(g, 0.06, 0.8, 0.06, wood, sx, 0.4, -1.3);
    this.box(g, 0.9, 0.35, 1.9, dark, 1.4, 0.18, -0.9);
    this.box(g, 0.05, 0.7, 0.6, wood, 1.92, 1.4, 0.8);
    // Lantern on the table: a warm landmark in the fog
    const lanternMat = this.mat(0x302010, 0.4, 0.2, { emissive: 0xffb050, emissiveIntensity: 2.4 });
    this.box(g, 0.16, 0.24, 0.16, lanternMat, -1.2, 0.95, -1.3);
    const lp = new THREE.Vector3(-1.2, 1.3, -1.0).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw).add(c.pos);
    this.light(lp, 0xffb060, 3.4, 10, lanternMat, true);
    // The jerrycan
    if (c.hasFuel) {
      const can = new THREE.Group();
      const red = this.mat(0xa01c14, 0.45, 0.3);
      this.box(can, 0.36, 0.46, 0.18, red, 0, 0.23, 0);
      this.box(can, 0.22, 0.05, 0.05, this.mat(0x111111, 0.6, 0.4), 0, 0.5, 0);
      this.box(can, 0.05, 0.12, 0.05, this.mat(0x9a9a9a, 0.4, 0.8), 0.14, 0.52, 0);
      const local = new THREE.Vector3(0.4 + r() * 0.6, 0, -0.2 + r() * 0.8);
      can.position.copy(local);
      can.rotation.y = r() * 3;
      g.add(can);
      c.fuelMesh = can;
      c.fuelPos = local.applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw).add(c.pos);
    }
    this.root.add(g);
  }

  private buildClearing() {
    const r = this.r;
    // Old helipad marking: a pale H on trampled grass
    const pad = new THREE.Mesh(
      this.track(new THREE.CircleGeometry(6, 32)),
      this.mat(0x55574a, 1, 0, { polygonOffset: true, polygonOffsetFactor: -2 })
    );
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(this.clearing.x, 0.015, this.clearing.z);
    this.root.add(pad);
    const paint = this.mat(0x8a8a80, 0.9, 0, { polygonOffset: true, polygonOffsetFactor: -4 });
    for (const [w, d, x] of [
      [0.5, 4, -1.2],
      [0.5, 4, 1.2],
      [2.4, 0.5, 0],
    ] as const) {
      const m = new THREE.Mesh(this.track(new THREE.PlaneGeometry(w, d)), paint);
      m.rotation.x = -Math.PI / 2;
      m.position.set(this.clearing.x + x, 0.02, this.clearing.z);
      this.root.add(m);
    }
    // 3 flares on stakes around it
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + r() * 0.5;
      const pos = this.clearing.clone().add(new THREE.Vector3(Math.cos(a) * 8, 0, Math.sin(a) * 8));
      const g = new THREE.Group();
      g.position.copy(pos);
      this.box(g, 0.08, 0.9, 0.08, this.mat(0x5a4630, 0.9), 0, 0.45, 0);
      const headMat = this.mat(0x6a1010, 0.5, 0.1, { emissive: 0xff2010, emissiveIntensity: 0 });
      this.box(g, 0.1, 0.32, 0.1, headMat, 0, 1.05, 0);
      this.root.add(g);
      const light = this.light(pos.clone().setY(1.4), 0xff3018, 0, 15, headMat, true);
      light.baseEmissive = 0;
      this.flares.push({ pos, lit: false, light, headMat });
    }
  }

  private buildBounds() {
    const e = S + 2;
    this.solid(CX - e - 2, CZ - e - 2, CX + e + 2, CZ - e, 4);
    this.solid(CX - e - 2, CZ + e, CX + e + 2, CZ + e + 2, 4);
    this.solid(CX - e - 2, CZ - e, CX - e, CZ + e, 4);
    this.solid(CX + e, CZ - e, CX + e + 2, CZ + e, 4);
  }

  private makeNotes() {
    const plain = this.cabins.find((c) => !c.hasFuel) ?? this.cabins[0];
    const yawPos = (c: Cabin, x: number, z: number) => {
      const to = Math.atan2(CX - c.pos.x, CZ - c.pos.z);
      const yaw = Math.round(to / (Math.PI / 2)) * (Math.PI / 2);
      return new THREE.Vector3(x, 0.02, z).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw).add(c.pos);
    };
    this.noteDrops = [
      {
        item: {
          id: 'note-f-garde',
          name: 'Carnet du garde forestier',
          type: 'note',
          description: 'Un carnet gondolé par la pluie, oublié sur la table.',
          lore:
            '« 3 novembre. Elle est revenue rôder près des cabanes. Ce n\'est pas un animal. Elle ne chasse que ce qui brille : ma lampe, mon briquet, les phares du camion. La nuit, je coupe tout et je m\'accroupis dans les fougères. Elle est passée à deux mètres sans me voir. Ne jamais courir avec une lumière. Jamais. — J. Marchal, garde de la forêt domaniale »',
          icon: 'FileText',
        },
        pos: yawPos(plain, -0.6, -1.0),
      },
      {
        item: {
          id: 'note-f-telex',
          name: 'Télex — Saint-Aurore',
          type: 'note',
          description: 'Une bande de papier sortie du téléscripteur du poste radio.',
          lore:
            '« SAINT-AURORE À POSTE FORESTIER 9 — URGENT. Sujet 00 évadé vers le massif. Aucun secours à envoyer avant confirmation de capture. Le sujet est attiré par la lumière ; il ne voit presque pas dans le noir complet. En cas de contact : canal de détresse, puis 3 fusées sur l\'ancienne hélisurface. Détruire ce message. — Dr É. Moreau »',
          icon: 'FileText',
        },
        pos: this.shack.clone().add(new THREE.Vector3(-1.0, 0.02, 0.3)),
      },
    ];
  }

  // ---------------------------------------------------------------------
  // Supplies: in the cabins, at the tower, along the way
  // ---------------------------------------------------------------------
  public supplyDrops(): { item: GameItem; pos: THREE.Vector3 }[] {
    const r = this.r;
    const out: { item: GameItem; pos: THREE.Vector3 }[] = [];
    let n = 0;
    const supply = (type: 'battery' | 'food' | 'sedative' | 'medkit'): GameItem => {
      const id = `f4-${type}-${++n}`;
      if (type === 'battery') return { id, name: 'Pile', type, description: 'Recharge 55 % de la batterie de la lampe torche.', icon: 'BatteryCharging' };
      if (type === 'food') return { id, name: 'Barre de céréales', type, description: 'Redonne 40 points d\'endurance.', icon: 'Cookie' };
      if (type === 'sedative') return { id, name: 'Seringue de Sédatif', type, description: 'Immobilise la Bête 5 secondes (à moins de 3 m, face à elle).', icon: 'Syringe' };
      return { id, name: 'Adrénaline', type, description: 'Auto-injecteur : endurance au maximum.', icon: 'HeartPulse' };
    };
    const coins = (): GameItem => {
      const q = 6 + Math.floor(r() * 10);
      return { id: `f4-coins-${++n}`, name: `${q} pièces`, type: 'coins', description: 'De vieilles pièces. Gardées si vous êtes secouru.', icon: 'Coins', quantity: q };
    };
    const inCabin = (c: Cabin, k: number) => {
      const to = Math.atan2(CX - c.pos.x, CZ - c.pos.z);
      const yaw = Math.round(to / (Math.PI / 2)) * (Math.PI / 2);
      const local = [new THREE.Vector3(1.3, 0.4, -0.8), new THREE.Vector3(-1.4, 0.02, 0.6), new THREE.Vector3(0.9, 0.02, 1.2)][k % 3];
      return local.applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw).add(c.pos);
    };
    const kinds: ('battery' | 'food' | 'sedative' | 'medkit')[] = ['battery', 'food', 'sedative', 'battery'];
    this.cabins.forEach((c, i) => {
      out.push({ item: supply(kinds[i % kinds.length]), pos: inCabin(c, 0) });
      out.push({ item: coins(), pos: inCabin(c, 1) });
    });
    // At the tower and in the radio shack
    out.push({ item: supply('battery'), pos: this.shack.clone().add(new THREE.Vector3(1.1, 0.02, -0.8)) });
    out.push({ item: supply('medkit'), pos: this.tower.clone().add(new THREE.Vector3(0.6, 0.32, 0.4)) });
    out.push({ item: supply('sedative'), pos: this.gen.clone().add(new THREE.Vector3(1.2, 0.02, 0.5)) });
    // Along the forest, out in the open
    const loose: ('battery' | 'food')[] = ['food', 'food', 'battery'];
    for (let k = 0; k < 5; k++) {
      for (let tries = 0; tries < 30; tries++) {
        const x = CX + (r() - 0.5) * (S * 2 - 20);
        const z = CZ + (r() - 0.5) * (S * 2 - 20);
        if (this.boxesNear(x, z, 1).some((b) => x > b.min.x - 0.4 && x < b.max.x + 0.4 && z > b.min.z - 0.4 && z < b.max.z + 0.4)) continue;
        out.push({ item: k < 3 ? supply(loose[k]) : coins(), pos: new THREE.Vector3(x, 0.02, z) });
        break;
      }
    }
    return out;
  }

  // ---------------------------------------------------------------------
  // The Beast: hunts by sight (light!), investigates noises
  // ---------------------------------------------------------------------
  private spawnBeast() {
    const m = new MonsterAI(new THREE.Vector3(CX, -50, CZ), this.map.navNodes, [], this.map.doors, () => {}, 0);
    m.mesh.visible = false;
    if (this.lowEnd) m.mesh.traverse((o) => (o.castShadow = false));
    this.stalker = m;
    this.scene.add(m.mesh);
  }

  public hear(origin: THREE.Vector3, loudness: number) {
    const s = this.stalker;
    if (!s || !this.released || this.mode === 'chase') return;
    const d = origin.distanceTo(s.position);
    if (d > loudness * 2.4) return;
    const spread = loudness >= 25 ? 1.5 : 4;
    this.mode = 'investigate';
    this.target.set(origin.x + (Math.random() - 0.5) * spread * 2, 0, origin.z + (Math.random() - 0.5) * spread * 2);
    this.lingerT = 3;
  }

  private speeds() {
    const i = Math.max(0, Math.min(4, this.difficulty - 1));
    return { walk: [1.9, 2.2, 2.45, 2.7, 2.95][i], run: [4.1, 4.6, 5.0, 5.35, 5.7][i] };
  }

  private inBush(p: THREE.Vector3) {
    return this.spotsNear(this.bushGrid, p.x, p.z, 2).some((b) => Math.hypot(b.x - p.x, b.z - p.z) < b.r * 0.95);
  }

  /** Is the player standing in a bright place (flares, floodlight, helicopter)? */
  private litAt(p: THREE.Vector3) {
    if (this.flares.some((f) => f.lit && f.pos.distanceTo(p.clone().setY(0)) < 6)) return true;
    if (this.genRunning && Math.hypot(this.tower.x - p.x, this.tower.z + 3 - p.z) < 9) return true;
    if (this.phase === 'board' && Math.hypot(this.clearing.x - p.x, this.clearing.z - p.z) < 9) return true;
    return false;
  }

  /** Line of sight between the Beast and the player (tree trunks block it). */
  private los(a: THREE.Vector3, b: THREE.Vector3) {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    if (len < 1) return true;
    const mx = (a.x + b.x) / 2;
    const mz = (a.z + b.z) / 2;
    for (const t of this.spotsNear(this.trunkGrid, mx, mz, len / 2 + 1)) {
      const u = ((t.x - a.x) * dx + (t.z - a.z) * dz) / (len * len);
      if (u < 0.04 || u > 0.96) continue;
      const px = a.x + dx * u - t.x;
      const pz = a.z + dz * u - t.z;
      if (px * px + pz * pz < (t.r + 0.12) * (t.r + 0.12)) return false;
    }
    return true;
  }

  private sees(pl: ForestPlayer) {
    const s = this.stalker!;
    const d = Math.hypot(pl.pos.x - s.position.x, pl.pos.z - s.position.z);
    if (d < 2.5) return true;
    let range = pl.flashlight ? 22 : 10;
    if (pl.crouch) range *= 0.55;
    if (pl.crouch && !pl.flashlight && this.inBush(pl.pos)) range = 2;
    if (pl.sprint) range *= 1.25;
    if (this.litAt(pl.pos)) range = Math.max(range, 20);
    // In the chase it keeps you in sight a bit further
    if (this.mode === 'chase') range *= 1.3;
    return d < range && this.los(s.position, pl.pos);
  }

  private clampIn(v: THREE.Vector3) {
    v.x = THREE.MathUtils.clamp(v.x, CX - S + 3, CX + S - 3);
    v.z = THREE.MathUtils.clamp(v.z, CZ - S + 3, CZ + S - 3);
    return v;
  }

  /** Put it somewhere behind the player, out of sight. */
  private placeBehind(pl: ForestPlayer, dist: number) {
    const s = this.stalker!;
    // Behind first, then further round: the first spot that stays inside the woods
    const tries = [0, 0.5, -0.5, 1.0, -1.0, 1.5, -1.5, 2.2, -2.2, Math.PI];
    let best: THREE.Vector3 | null = null;
    for (const off of tries) {
      const a = pl.yaw + off + (Math.random() - 0.5) * 0.4;
      const p = new THREE.Vector3(pl.pos.x + Math.sin(a) * dist, 0, pl.pos.z + Math.cos(a) * dist);
      const c = this.clampIn(p.clone());
      if (c.distanceTo(p) < 1) {
        best = c;
        break;
      }
      if (!best || Math.hypot(c.x - pl.pos.x, c.z - pl.pos.z) > Math.hypot(best.x - pl.pos.x, best.z - pl.pos.z)) best = c;
    }
    s.placeAt(best!.x, best!.z);
  }

  private updateBeast(delta: number, pls: ForestPlayer[], listener: Listener, onCatch: (i: number) => void, onRelease: () => void) {
    const s = this.stalker;
    if (!s) return;
    if (!this.released) {
      this.releaseT -= delta;
      if (this.releaseT <= 0) {
        this.released = true;
        this.placeBehind(pls[0], 42);
        s.mesh.visible = true;
        this.mode = 'roam';
        this.roamT = 0;
        sound.playMonsterChaseRoar();
        onRelease();
      }
      return;
    }
    // Sedative: 5 s on its knees
    if (s.state === 'STUNNED') {
      if (this.stunT <= 0) this.stunT = 5;
      this.stunT -= delta;
      if (this.stunT <= 0) {
        this.stunT = 0;
        s.state = 'SEARCH';
        this.mode = 'search';
        this.target.copy(pls[0].pos).setY(0);
      } else {
        s.driveToward(s.position, 0, delta, [], listener, false);
        return;
      }
    }

    // Co-op: it hunts whoever it sees (the nearest one), else the nearest one
    const dist = (x: ForestPlayer) => Math.hypot(x.pos.x - s.position.x, x.pos.z - s.position.z);
    const alive = pls.filter((x) => !x.dead).sort((a, b) => dist(a) - dist(b));
    if (!alive.length) {
      s.driveToward(s.position, 0, delta, [], listener, false);
      return;
    }
    const seenP = alive.find((x) => this.sees(x));
    const pl = seenP ?? alive[0];
    const dPlayer = dist(pl);
    const see = !!seenP;
    if (see) {
      if (this.mode !== 'chase' && !this.seenTip) {
        this.seenTip = true;
        this.toast(pl.flashlight ? 'Elle vous a vu ! Votre lampe vous trahit — éteignez-la [F] et cassez la ligne de vue.' : 'Elle vous a vu ! Courez, cassez la ligne de vue derrière les arbres.');
      }
      this.mode = 'chase';
      this.lastSeen.copy(pl.pos).setY(0);
      this.lostT = 0;
      if (this.phase === 'wait' || this.phase === 'board') this.seenDuringWait = true;
    }

    // It smells you now and then: never too far away
    this.sniffT -= delta;
    if (this.sniffT <= 0 && this.mode !== 'chase') {
      this.sniffT = this.phase === 'wait' || this.phase === 'board' ? 7 : 14;
      if (this.mode === 'roam' && dPlayer > 18) {
        this.mode = 'investigate';
        this.target.set(pl.pos.x + (Math.random() - 0.5) * 14, 0, pl.pos.z + (Math.random() - 0.5) * 14);
        this.clampIn(this.target);
        this.lingerT = 2;
      }
    }
    // The generator thumps: it goes and looks
    if (this.genRunning) {
      this.genNoiseT -= delta;
      if (this.genNoiseT <= 0) {
        this.genNoiseT = 9;
        if (this.mode === 'roam') this.hear(this.gen, 22);
      }
    }

    const sp = this.speeds();
    let speed = sp.walk;
    let chasing = false;
    switch (this.mode) {
      case 'chase':
        if (!see) {
          this.lostT += delta;
          this.target.copy(this.lastSeen);
          if (this.lostT > 4 || Math.hypot(this.lastSeen.x - s.position.x, this.lastSeen.z - s.position.z) < 1.2) {
            this.mode = 'search';
            this.lingerT = 4;
            // A good guess of where you went
            this.target.set(pl.pos.x + (Math.random() - 0.5) * 10, 0, pl.pos.z + (Math.random() - 0.5) * 10);
            this.clampIn(this.target);
          }
        } else this.target.copy(pl.pos).setY(0);
        speed = sp.run;
        chasing = true;
        break;
      case 'investigate':
      case 'search':
        speed = sp.walk * 1.35;
        if (Math.hypot(this.target.x - s.position.x, this.target.z - s.position.z) < 1.3) {
          speed = 0;
          this.lingerT -= delta;
          if (this.lingerT <= 0) {
            this.mode = 'roam';
            this.roamT = 0;
          }
        }
        break;
      default: {
        this.roamT -= delta;
        if (this.roamT <= 0 || Math.hypot(this.target.x - s.position.x, this.target.z - s.position.z) < 1.5) {
          this.roamT = 10 + Math.random() * 6;
          const near = this.phase === 'wait' || this.phase === 'board';
          const a = Math.random() * Math.PI * 2;
          const d = near ? 8 + Math.random() * 12 : 14 + Math.random() * 18;
          this.target.set(pl.pos.x + Math.cos(a) * d, 0, pl.pos.z + Math.sin(a) * d);
          this.clampIn(this.target);
        }
        if (this.phase === 'board') speed = sp.walk * 1.3;
      }
    }

    // Too far away (and not chasing): it reappears behind you
    if (this.mode !== 'chase' && dPlayer > 58) {
      this.placeBehind(pl, 34);
      this.mode = 'roam';
      this.roamT = 0;
    }

    // Stuck on a tree: let it slip through for a moment
    this.stuckT += delta;
    if (this.stuckT > 1.6) {
      if (speed > 0.5 && s.position.distanceTo(this.stuckFrom) < 0.5) this.ghostT = 1.2;
      this.stuckT = 0;
      this.stuckFrom.copy(s.position);
    }
    this.ghostT = Math.max(0, this.ghostT - delta);
    const boxes = this.ghostT > 0 || dPlayer > 30 ? [] : [...this.staticBoxes, ...this.boxesNear(s.position.x, s.position.z, 3)];
    s.driveToward(this.target, speed, delta, boxes, listener, chasing);
    this.clampIn(s.position);

    pls.forEach((x, i) => {
      if (!x.dead && dist(x) < 1.1) onCatch(i);
    });
  }

  // ---------------------------------------------------------------------
  // Per frame
  // ---------------------------------------------------------------------
  /** Host / solo: everything. `pls[0]` is the local player, `pls[1]` the co-op partner. */
  public update(delta: number, pls: ForestPlayer[], listener: Listener, onCatch: (i: number) => void, onRelease: () => void) {
    this.visuals(delta, pls[0], listener);
    // Phases (any of the players)
    const near = (v: THREE.Vector3, d: number) => pls.some((x) => Math.hypot(v.x - x.pos.x, v.z - x.pos.z) < d);
    if (this.phase === 'tower' && near(this.tower, 12)) {
      this.phase = 'fuel';
      this.toast('Le poste radio de la tour est sans courant et le groupe électrogène est à sec. Il faut 2 jerricans : fouillez les cabanes (les lanternes dans la brume).');
    }
    for (const c of this.cabins) if (!c.visited && near(c.pos, 3.5)) c.visited = true;
    if (this.phase === 'wait') {
      this.waitLeft = Math.max(0, this.waitLeft - delta);
      if (this.waitLeft <= 14 && !this.heli) this.spawnHeli();
    }
    this.updateBeast(delta, pls, listener, onCatch, onRelease);
  }

  /** Co-op guest: only what you see and hear; the state comes from the host. */
  public mirror(delta: number, pl: ForestPlayer, listener: Listener) {
    if (this.phase === 'wait') this.waitLeft = Math.max(0, this.waitLeft - delta);
    for (const c of this.cabins) if (!c.visited && Math.hypot(c.pos.x - pl.pos.x, c.pos.z - pl.pos.z) < 3.5) c.visited = true;
    this.visuals(delta, pl, listener);
  }

  public netState(): ForestNet {
    return {
      ph: this.phase,
      fuel: this.fuel,
      cf: this.cabins.map((c) => c.hasFuel && !c.fuelMesh),
      gen: this.genRunning,
      fl: this.flares.map((f) => f.lit),
      wl: Math.round(this.waitLeft * 10) / 10,
      h: !!this.heli,
      ht: Math.round(this.heliT * 10) / 10,
      hy: Math.round(this.heliY * 10) / 10,
      rel: this.released,
      sdw: this.seenDuringWait,
    };
  }

  public netApply(n: ForestNet) {
    this.phase = n.ph as Phase;
    this.fuel = n.fuel;
    n.cf.forEach((taken, i) => {
      const c = this.cabins[i];
      if (c && taken && c.fuelMesh) {
        c.fuelMesh.parent?.remove(c.fuelMesh);
        c.fuelMesh = null;
        sound.playItemPickup();
      }
    });
    if (n.gen && !this.genRunning) this.startGenerator();
    n.fl.forEach((lit, i) => {
      const f = this.flares[i];
      if (f && lit && !f.lit) this.lightFlare(f);
    });
    this.waitLeft = n.wl;
    if (n.h && !this.heli) this.spawnHeli();
    if (this.heli) {
      if (Math.abs(this.heliT - n.ht) > 0.5) this.heliT = n.ht;
      this.heliY = n.hy;
      // Joined late / lagging: it is already over the clearing on the host's screen
      const g = this.heli;
      if (this.heliT >= 14 && Math.hypot(g.position.x - this.clearing.x, g.position.z - this.clearing.z) > 8) {
        g.position.set(this.clearing.x, this.heliY, this.clearing.z);
        this.ladder?.position.set(g.position.x, g.position.y - 1.2, g.position.z);
      }
      if (this.phase === 'board' && !this.ladder) this.dropLadder();
    }
    if (n.rel && !this.released && this.stalker) {
      this.released = true;
      this.stalker.mesh.visible = true;
    }
    this.seenDuringWait = n.sdw;
  }

  private visuals(delta: number, pl: ForestPlayer, listener: Listener) {
    const p = pl.pos;
    // Tree colliders around the player
    if (Math.hypot(p.x - this.lastRefresh.x, p.z - this.lastRefresh.z) > 2) {
      this.lastRefresh.copy(p);
      const old = new Set(this.activeBoxes);
      this.map.collisionBoxes = this.map.collisionBoxes.filter((b) => !old.has(b));
      this.activeBoxes = this.boxesNear(p.x, p.z, 14);
      this.map.collisionBoxes.push(...this.activeBoxes);
    }

    // Rain follows the camera
    const a = this.rainPos;
    const fall = delta * 20;
    for (let i = 0; i < a.length; i += 6) {
      let y = a[i + 1] - fall;
      if (y < 0) y += 16;
      a[i + 1] = y;
      a[i + 4] = y + 0.55;
    }
    this.rain.position.set(p.x, 0, p.z);
    (this.rain.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;

    // Lightning & thunder
    this.thunderT -= delta;
    if (this.thunderT <= 0) {
      this.thunderT = 16 + Math.random() * 22;
      this.flashSeq = [0, 0.12, 0.25].slice(0, 1 + Math.floor(Math.random() * 3));
      sound.playThunder(0.6 + Math.random() * 2, 0.7 + Math.random() * 0.4);
    }
    if (this.flashSeq.length) {
      this.flashSeq = this.flashSeq.map((t) => t - delta);
      if (this.flashSeq[0] <= 0) {
        this.flash = 1;
        this.flashSeq.shift();
      }
    }
    this.flash = Math.max(0, this.flash - delta * 5);

    // Tower light blinks
    const blink = Math.sin(performance.now() / 260) > 0.2;
    this.towerLamp.color.setHex(blink ? 0xff2a1a : 0x300806);
    const glow = this.root.getObjectByName('glow');
    if (glow) glow.visible = blink;

    // Generator: rattles and thumps
    if (this.genRunning) {
      this.genMesh.position.set(this.gen.x + (Math.random() - 0.5) * 0.015, (Math.random() - 0.5) * 0.01, this.gen.z);
      const to = this.gen.clone().sub(listener.pos).setY(0);
      const d = to.length();
      const pan = d > 0.1 ? to.normalize().dot(listener.right) : 0;
      sound.setLoop('generator', Math.max(0, 0.5 * (1 - d / 45)), pan);
    }

    if (this.heli) this.updateHeli(delta, listener);

    // Ferns tip, once (personal: shown on this screen only)
    if (!this.bushTip && this.released && pl.crouch && !pl.flashlight && this.inBush(p)) {
      this.bushTip = true;
      this.localToast?.('Accroupi dans les fougères, lampe éteinte : elle ne vous voit presque plus.');
    }
  }

  /** A message for this screen only (set by the engine). */
  public localToast: ((msg: string) => void) | null = null;

  // ---------------------------------------------------------------------
  // Helicopter
  // ---------------------------------------------------------------------
  private spawnHeli() {
    const g = new THREE.Group();
    const body = this.mat(0x2e3a2a, 0.5, 0.4);
    const dark = this.mat(0x141414, 0.5, 0.5);
    this.box(g, 2.0, 1.7, 4.2, body, 0, 0, 0);
    this.box(g, 1.8, 1.0, 1.2, this.mat(0x1a2a3a, 0.1, 0.6, { emissive: 0x203040, emissiveIntensity: 0.6 }), 0, 0.15, -2.4);
    this.box(g, 0.45, 0.45, 5.5, body, 0, 0.35, 4.6);
    this.box(g, 0.1, 1.4, 0.8, body, 0, 0.9, 7.2);
    for (const s of [-1, 1]) this.box(g, 0.12, 0.1, 4, dark, s * 1.1, -1.25, 0);
    const rotor = new THREE.Group();
    const bladeMat = this.mat(0x111111, 0.6, 0.3);
    this.box(rotor, 11, 0.06, 0.35, bladeMat, 0, 0, 0);
    this.box(rotor, 0.35, 0.06, 11, bladeMat, 0, 0, 0);
    rotor.position.set(0, 1.15, 0);
    g.add(rotor);
    const tail = new THREE.Group();
    this.box(tail, 0.04, 1.6, 0.18, bladeMat, 0, 0, 0);
    tail.position.set(0.15, 0.9, 7.3);
    g.add(tail);
    // Searchlight cone + navigation lights
    const beam = new THREE.Mesh(
      this.track(new THREE.CylinderGeometry(0.25, 3.2, 16, 18, 1, true).translate(0, -8, 0)),
      this.track(new THREE.MeshBasicMaterial({ color: 0xdfe8ff, transparent: true, opacity: 0.09, depthWrite: false, side: THREE.DoubleSide, fog: false }))
    );
    beam.position.set(0, -0.9, -1.5);
    beam.rotation.x = 0.2;
    g.add(beam);
    for (const [x, c] of [
      [-1.1, 0xff2020],
      [1.1, 0x20ff40],
    ] as const) {
      const nl = new THREE.Mesh(this.track(new THREE.SphereGeometry(0.12, 6, 5)), this.track(new THREE.MeshBasicMaterial({ color: c, fog: false })));
      nl.position.set(x, 0, 0.5);
      g.add(nl);
    }
    g.position.copy(this.clearing).add(new THREE.Vector3(0, 40, -150));
    this.root.add(g);
    this.heli = g;
    this.heliRotor = rotor;
    this.heliTail = tail;
    this.heliT = 0;
    const lm = this.mat(0x000000, 1, 0, { emissive: 0xffffff, emissiveIntensity: 0 });
    this.heliLight = this.light(this.clearing.clone().setY(3), 0xe8f0ff, 0, 22, lm, false);
    this.heliLight.baseEmissive = 0;
    if (!this.guest) this.toast('Un grondement au nord, au-dessus des arbres… L\'hélicoptère arrive !');
  }

  private updateHeli(delta: number, listener: Listener) {
    const g = this.heli!;
    this.heliT += delta;
    this.heliRotor!.rotation.y += delta * 28;
    this.heliTail!.rotation.x += delta * 40;
    const lit = this.flares.filter((f) => f.lit).length;
    const arrive = Math.min(1, this.heliT / 14);
    const e = arrive * arrive * (3 - 2 * arrive);
    const from = this.clearing.clone().add(new THREE.Vector3(0, 40, -150));
    const over = this.clearing.clone().add(new THREE.Vector3(0, this.heliY, 0));
    if (arrive < 1) g.position.lerpVectors(from, over, e);
    else {
      if (lit >= 3 && this.waitLeft <= 0) {
        // Comes down to a hover, the rope ladder drops
        this.heliY = Math.max(6.5, this.heliY - delta * 2.4);
        if (this.heliY <= 6.5 && this.phase !== 'board' && !this.guest) {
          this.phase = 'board';
          this.dropLadder();
          this.toast('L\'hélicoptère est en vol stationnaire ! Courez à la clairière et montez à l\'échelle [E] !');
        }
      } else if (!this.heliWarned && this.waitLeft <= 0 && !this.guest) {
        this.heliWarned = true;
        this.toast('Le pilote ne trouve pas la zone d\'atterrissage ! Allumez les 3 fusées de la clairière !');
      }
      // Circles a little while it waits, steady once it hovers
      const t = this.heliT;
      const wob = this.phase === 'board' ? 0.4 : 6;
      const tgt = new THREE.Vector3(this.clearing.x + Math.sin(t * 0.35) * wob, this.heliY + Math.sin(t * 1.3) * 0.25, this.clearing.z + Math.cos(t * 0.35) * wob);
      g.position.lerp(tgt, 1 - Math.exp(-delta * 1.2));
    }
    g.rotation.z = Math.sin(this.heliT * 0.9) * 0.04;
    if (this.heliLight) {
      this.heliLight.position.set(g.position.x, Math.max(2.5, g.position.y - 4), g.position.z - 1);
      this.heliLight.baseIntensity = arrive >= 1 ? 9 : 0;
    }
    if (this.ladder) this.ladder.position.set(g.position.x, g.position.y - 1.2, g.position.z);
    const to = g.position.clone().sub(listener.pos).setY(0);
    const d = to.length();
    const pan = d > 0.1 ? to.normalize().dot(listener.right) : 0;
    sound.setLoop('helicopter', 0.12 + 0.75 * Math.pow(Math.max(0, 1 - d / 170), 2), pan);
  }

  private dropLadder() {
    const g = new THREE.Group();
    const rope = this.mat(0x8a7a5a, 0.9);
    const len = 5.3;
    for (const s of [-0.25, 0.25]) this.box(g, 0.04, len, 0.04, rope, s, -len / 2, 0);
    for (let i = 0; i < 12; i++) this.box(g, 0.5, 0.04, 0.05, rope, 0, -0.4 - i * 0.42, 0);
    this.root.add(g);
    this.ladder = g;
  }

  // ---------------------------------------------------------------------
  // Interaction
  // ---------------------------------------------------------------------
  private nearFuel(p: THREE.Vector3) {
    return this.cabins.find((c) => c.fuelMesh && Math.hypot(c.fuelPos.x - p.x, c.fuelPos.z - p.z) < 1.6) ?? null;
  }
  private nearFlare(p: THREE.Vector3) {
    return this.flares.find((f) => !f.lit && Math.hypot(f.pos.x - p.x, f.pos.z - p.z) < 1.7) ?? null;
  }
  private nearLadder(p: THREE.Vector3) {
    return !!this.ladder && Math.hypot(this.ladder.position.x - p.x, this.ladder.position.z - p.z) < 2.4;
  }
  private dist2(a: THREE.Vector3, p: THREE.Vector3) {
    return Math.hypot(a.x - p.x, a.z - p.z);
  }

  public hint(p: THREE.Vector3): string | null {
    if (this.nearLadder(p)) return '[E] Monter à l\'échelle de corde — SECOURS';
    if (this.nearFuel(p)) return '[E] Prendre le jerrican d\'essence';
    if (this.dist2(this.gen, p) < 2.1) {
      if (this.genRunning) return 'Groupe électrogène (en marche)';
      return this.fuel >= 2 ? '[E] Faire le plein et démarrer (TRÈS bruyant)' : `[E] Groupe électrogène — réservoir vide (${this.fuel}/2 jerricans)`;
    }
    if (this.dist2(this.radioPos, p) < 1.9 && this.phase !== 'wait' && this.phase !== 'board') return '[E] Poste radio — appeler les secours';
    if (this.phase === 'wait' && this.nearFlare(p)) return '[E] Allumer la fusée de détresse';
    if (this.nearFlare(p) && this.phase !== 'board') return 'Fusée de détresse (attendez le contact radio)';
    return null;
  }

  public interact(p: THREE.Vector3): ForestAction | null {
    if (this.nearLadder(p)) return { rescue: true };
    const c = this.nearFuel(p);
    if (c && c.fuelMesh) {
      c.fuelMesh.parent?.remove(c.fuelMesh);
      c.fuelMesh = null;
      this.fuel++;
      sound.playItemPickup();
      sound.playSplash(0.3);
      if (this.phase === 'tower') this.phase = 'fuel';
      if (this.fuel >= 2) {
        this.phase = 'refuel';
        return { msg: 'Deuxième jerrican ! Retournez au groupe électrogène, au pied de la tour radio.' };
      }
      return { msg: `Jerrican d'essence récupéré (${this.fuel}/2). Il en reste un dans une autre cabane.` };
    }
    if (this.dist2(this.gen, p) < 2.1) {
      if (this.genRunning) return null;
      if (this.fuel < 2) {
        if (this.phase === 'tower') this.phase = 'fuel';
        return { msg: `Réservoir vide. Il faut 2 jerricans d'essence (${this.fuel}/2) — cherchez dans les cabanes.` };
      }
      this.startGenerator();
      this.phase = 'radio';
      // That racket carries across the whole forest
      this.hear(this.gen, 45);
      this.genNoiseT = 6;
      return { msg: 'Le moteur tousse… et démarre ! Le vacarme résonne dans toute la forêt. Vite, la radio du cabanon !', shake: 0.4 };
    }
    if (this.dist2(this.radioPos, p) < 1.9 && this.phase !== 'wait' && this.phase !== 'board') {
      if (!this.genRunning) {
        sound.playStatic(0.3, 0.05);
        return { msg: 'La radio est morte. Il faut démarrer le groupe électrogène dehors.' };
      }
      this.phase = 'wait';
      this.waitLeft = this.waitTotal;
      sound.playStatic(1.6, 0.16);
      return {
        msg: `« …krrr… Ici Sierra-4, on vous reçoit ! Tenez ${this.waitTotal} secondes… allumez les 3 fusées sur la clairière… krrr… »`,
      };
    }
    if (this.phase === 'wait') {
      const f = this.nearFlare(p);
      if (f) {
        this.lightFlare(f);
        this.hear(f.pos, 14);
        const n = this.flares.filter((x) => x.lit).length;
        return {
          msg:
            n >= 3
              ? 'Les 3 fusées brûlent ! La clairière est balisée. Tenez bon jusqu\'à l\'hélicoptère…'
              : `Fusée allumée (${n}/3). Sa lumière rouge se voit de loin… elle aussi la voit.`,
        };
      }
    }
    return null;
  }

  private startGenerator() {
    this.genRunning = true;
    sound.playEngineStart();
    this.flood.baseIntensity = 7;
    this.flood.baseEmissive = 2.5;
    this.shackLight.baseIntensity = 3.2;
    this.shackLight.baseEmissive = 2;
    this.radioMat.emissiveIntensity = 2;
  }

  private lightFlare(f: Flare) {
    f.lit = true;
    f.light.baseIntensity = 9;
    f.light.baseEmissive = 3;
    f.headMat.emissiveIntensity = 3;
    sound.playFlickerHum();
    sound.playSplash(0.2);
  }

  // ---------------------------------------------------------------------
  // HUD objective
  // ---------------------------------------------------------------------
  public objective(p: THREE.Vector3, yaw: number): string {
    const dirWord = (t: THREE.Vector3) => {
      const dx = t.x - p.x;
      const dz = t.z - p.z;
      const f = dx * -Math.sin(yaw) + dz * -Math.cos(yaw);
      const r = dx * Math.cos(yaw) + dz * -Math.sin(yaw);
      const a = Math.atan2(r, f);
      if (Math.abs(a) < Math.PI / 4) return 'devant vous';
      if (Math.abs(a) > (3 * Math.PI) / 4) return 'derrière vous';
      return a > 0 ? 'sur votre droite' : 'sur votre gauche';
    };
    const at = (t: THREE.Vector3) => `~${Math.round(this.dist2(t, p))} m, ${dirWord(t)}`;
    switch (this.phase) {
      case 'tower':
        return `Rejoignez la tour radio (lumière rouge au-dessus des arbres) — ${at(this.tower)}`;
      case 'fuel': {
        const left = this.cabins.filter((c) => !c.visited || c.fuelMesh);
        const unvisited = left.filter((c) => !c.visited);
        const pool = unvisited.length ? unvisited : left;
        const near = pool.sort((a, b) => this.dist2(a.pos, p) - this.dist2(b.pos, p))[0];
        return near
          ? `Jerricans : ${this.fuel}/2 — fouillez les cabanes (lanterne) · la plus proche à ${at(near.pos)}`
          : `Jerricans : ${this.fuel}/2`;
      }
      case 'refuel':
        return `Jerricans : 2/2 — faites le plein du groupe électrogène (${at(this.gen)})`;
      case 'radio':
        return `Lancez l'appel radio dans le cabanon au pied de la tour (${at(this.radioPos)})`;
      case 'wait': {
        const lit = this.flares.filter((f) => f.lit).length;
        const s = Math.ceil(this.waitLeft);
        const time = s > 0 ? `Secours dans ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : 'L\'hélicoptère cherche la zone !';
        return `${time} — fusées : ${lit}/3 (clairière, ${at(this.clearing)}) · lampe éteinte = invisible`;
      }
      case 'board':
        return `L'hélicoptère attend ! Montez à l'échelle — ${at(this.clearing)}`;
    }
  }

  public dispose() {
    const mine = new Set([...this.activeBoxes, ...this.staticBoxes]);
    this.map.collisionBoxes = this.map.collisionBoxes.filter((b) => !mine.has(b));
    const own = new Set(this.ownLights);
    this.map.lights = this.map.lights.filter((l) => !own.has(l));
    this.scene.remove(this.root);
    this.scene.fog = this.prevFog;
    this.scene.background = this.prevBg;
    sound.setLoop('rain', 0);
    sound.setLoop('generator', 0);
    sound.setLoop('helicopter', 0);
    this.stalker = null;
    this.disposables.forEach((d) => d.dispose());
  }
}
