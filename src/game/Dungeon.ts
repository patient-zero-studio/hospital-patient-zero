import * as THREE from 'three';
import type { CollisionBox, MapData } from './MapBuilder';
import { MonsterAI, Listener } from './MonsterAI';
import { sound } from '../audio/SoundSystem';
import { GameItem } from '../types';
import { DEFAULT_APPEARANCE } from '../appearance';
import type { SiteAction, SitePlayer } from './SiteB';

/**
 * ⚔️ CHAPITRE 10 — LE DONJON
 * Under Saint-Aurore, an old crypt nobody remembered. Patient Zéro found a
 * suit of armour down there and put it on: the light doesn't scare him any
 * more. Find the 3 coats of arms of the kingdom, pull the lever, lower the
 * drawbridge and run. Two portcullises can trap him for a while.
 */
const OX = 2400;
const OZ = 0;
const CELL = 2;
const H = 3.4;
// g = the sleeping dragon (east wing), S = secret wall, $ = treasure, X = the sword in the stone
const MAP = [
  '##############################',
  '#t...#t........t#...t#t......#',
  '#.B..#..p....p..#..c.#.......#',
  '#....H..........H........gg..#',
  '#.c..#..p....p..#..B.#...gg..#',
  '##.###..........###.##.......#',
  '#....................#########',
  '#.c.......t........c.#########',
  '#..X.................#########',
  '####.#####..#####.############',
  '#t..........c.......t#.....###',
  '#..c..p.........p..c.S..$..###',
  '#........B...........#.....###',
  '#t..p...........p...t#########',
  '#########.L..#################',
  '#########.DD.#################',
  '#########~~~~#################',
];
const GX = MAP[0].length;
const GZ = MAP.length;
export const BLASON_IDS = ['don-blason-lion', 'don-blason-aigle', 'don-blason-dragon'];
/** 📜 the 5 scrolls: all of them open the secret wall to the treasure */
export const PARCH_IDS = ['don-parch-1', 'don-parch-2', 'don-parch-3', 'don-parch-4', 'don-parch-5'];
/** ⚔️ duel (two players): points per document picked up */
export const duelPoints = (id: string) => (BLASON_IDS.includes(id) ? 3 : PARCH_IDS.includes(id) ? 1 : 0);

export interface DungeonNet {
  w: boolean;
  b: boolean;
  h: number[];
  /** dragon: 0 asleep, 1 waking, 2 breathing fire (+ direction) */
  d: number;
  da: number;
  /** secret wall open, treasure taken, sword taken */
  s: boolean;
  t: boolean;
  /** who holds the sword (-2 = still in the stone) */
  so: number;
  /** duel scores (host, guest) */
  sc: [number, number];
}

interface Portcullis {
  gx: number;
  gz: number;
  pos: THREE.Vector3;
  mesh: THREE.Group;
  box: CollisionBox;
  /** 0 = up, 1 = down */
  k: number;
  down: number;
  cool: number;
}

export class Dungeon {
  public readonly start = new THREE.Vector3(0, 1.72, 0);
  public readonly startYaw = Math.PI;
  public stalker: MonsterAI | null = null;
  public noteDrops: { item: GameItem; pos: THREE.Vector3 }[] = [];
  public flash = 0;
  public uv = false;
  public guest = false;
  public ending: 'DONJON' | null = null;
  /** coats of arms found (set by the engine from the documents picked up) */
  public found = 0;
  /** set by the engine: the knight got trapped under a portcullis */
  public onTrap: (() => void) | null = null;
  /** scrolls found (set by the engine) */
  public parch = 0;
  /** ⚔️ two players: it's a duel (scores: host, guest) */
  public duel = false;
  public score: [number, number] = [0, 0];

  // 🐉 the dragon
  private dragon!: THREE.Group;
  private dragonPos = new THREE.Vector3();
  private dragonBody!: THREE.Object3D;
  private dragonHead!: THREE.Group;
  private dragonEyes!: THREE.MeshStandardMaterial;
  private dragonNoise = 0;
  /** 0 asleep, 1 waking up, 2 breathing fire */
  private dragonState = 0;
  private dragonT = 0;
  private dragonCd = 0;
  private fireDir = 0;
  private fireLight!: THREE.PointLight;
  private fire: { m: THREE.Mesh; t: number; v: THREE.Vector3 }[] = [];
  private fireMat!: THREE.MeshBasicMaterial;
  private burnT = [0, 0];
  private knightBurnt = false;
  // ⚔️ the sword in the stone
  private stone = new THREE.Vector3();
  private stoneSword!: THREE.Object3D;
  private pulls = 0;
  /** who holds the sword (0 host, 1 guest) */
  private swordOf: number | null = null;
  // 🧱 secret wall and treasure
  private secret = new THREE.Vector3();
  private secretMesh!: THREE.Mesh;
  private secretBox!: CollisionBox;
  private secretCell = 0;
  private secretOpen = false;
  private secretK = 0;
  private chest = new THREE.Vector3();
  private chestLid!: THREE.Object3D;
  private chestTaken = false;

  private root = new THREE.Group();
  private boxes: CollisionBox[] = [];
  private blocked = new Uint8Array(GX * GZ);
  private disposables: { dispose: () => void }[] = [];
  private lever = new THREE.Vector3();
  private leverArm!: THREE.Object3D;
  private bridge = new THREE.Vector3();
  private bridgePivot!: THREE.Group;
  private bridgeBox!: CollisionBox;
  private bridgeK = 0;
  private bridgeDown = false;
  private gates: Portcullis[] = [];
  private flames: { mat: THREE.MeshBasicMaterial; light?: THREE.PointLight; base: number; ph: number }[] = [];
  private woke = false;
  private wakeT = 22;
  private mode: 'patrol' | 'hunt' = 'patrol';
  private target = new THREE.Vector3();
  private lostT = 0;
  private stunT = 0;
  private stepT = 0;
  private path: THREE.Vector3[] = [];
  private pathT = 0;
  private lastFound = 0;
  private rage = false;
  private tipped = false;

  constructor(
    private map: MapData,
    private scene: THREE.Scene,
    private difficulty: number,
    private lowEnd: boolean,
    private toast: (msg: string) => void,
    _seed: number
  ) {
    this.start.copy(this.w(11, 6, 1.72));
    this.build();
    this.makeNotes();
    if (difficulty >= 2) this.spawnKnight();
  }

  // ---------------------------------------------------------------------
  // Grid helpers
  // ---------------------------------------------------------------------
  private w(gx: number, gz: number, y = 0) {
    return new THREE.Vector3(OX + (gx - GX / 2 + 0.5) * CELL, y, OZ + (gz - GZ / 2 + 0.5) * CELL);
  }
  private cellOf(p: THREE.Vector3): [number, number] {
    return [Math.floor((p.x - OX) / CELL + GX / 2), Math.floor((p.z - OZ) / CELL + GZ / 2)];
  }
  private isFloor(gx: number, gz: number) {
    return gx >= 0 && gz >= 0 && gx < GX && gz < GZ && !this.blocked[gz * GX + gx];
  }
  private los(a: THREE.Vector3, b: THREE.Vector3) {
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    const n = Math.ceil(d / 0.5);
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const [gx, gz] = this.cellOf(new THREE.Vector3(a.x + (b.x - a.x) * t, 0, a.z + (b.z - a.z) * t));
      const ch = MAP[gz]?.[gx];
      // coffins are low: you see over them. Pillars and a closed portcullis… you see through the bars
      if (ch === '#' || ch === 'p' || ch === undefined) return false;
    }
    return true;
  }
  private findPath(from: THREE.Vector3, to: THREE.Vector3): THREE.Vector3[] {
    const [sx, sz] = this.cellOf(from);
    const [tx, tz] = this.cellOf(to);
    if (!this.isFloor(tx, tz) || !this.isFloor(sx, sz)) return [to.clone().setY(0)];
    const start = sz * GX + sx;
    const goal = tz * GX + tx;
    const prev = new Int32Array(GX * GZ).fill(-1);
    prev[start] = start;
    const q = [start];
    while (q.length) {
      const c = q.shift()!;
      if (c === goal) break;
      const x = c % GX;
      const z = Math.floor(c / GX);
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = x + dx;
        const nz = z + dz;
        if (!this.isFloor(nx, nz)) continue;
        const n = nz * GX + nx;
        if (prev[n] !== -1) continue;
        prev[n] = c;
        q.push(n);
      }
    }
    if (prev[goal] === -1) return [];
    const out: THREE.Vector3[] = [];
    for (let c = goal; c !== start; c = prev[c]) out.push(this.w(c % GX, Math.floor(c / GX)));
    out.reverse();
    if (out.length) out[out.length - 1] = to.clone().setY(0);
    return out;
  }
  private randomFloor(): THREE.Vector3 {
    for (let i = 0; i < 200; i++) {
      const gx = Math.floor(Math.random() * GX);
      const gz = Math.floor(Math.random() * GZ);
      if (this.isFloor(gx, gz) && MAP[gz][gx] !== 'D') return this.w(gx, gz);
    }
    return this.w(11, 7);
  }

  // ---------------------------------------------------------------------
  // Building the crypt
  // ---------------------------------------------------------------------
  private t<T extends { dispose: () => void }>(o: T) {
    this.disposables.push(o);
    return o;
  }
  private mat(color: number, opts: THREE.MeshStandardMaterialParameters = {}) {
    return this.t(new THREE.MeshStandardMaterial({ color, roughness: 0.9, ...opts }));
  }
  private mesh(geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = this.root) {
    const o = new THREE.Mesh(this.t(geo), m);
    o.position.set(x, y, z);
    o.castShadow = !this.lowEnd;
    o.receiveShadow = true;
    parent.add(o);
    return o;
  }
  private box(x0: number, z0: number, x1: number, z1: number, h = H) {
    const b: CollisionBox = { min: new THREE.Vector3(x0, 0, z0), max: new THREE.Vector3(x1, h, z1) };
    this.boxes.push(b);
    return b;
  }
  /** cobblestone texture, drawn once */
  private stoneTex(base: string, dark: string, rows = 6) {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d')!;
    g.fillStyle = dark;
    g.fillRect(0, 0, 256, 256);
    const h = 256 / rows;
    for (let r = 0; r < rows; r++) {
      const off = r % 2 ? h * 0.8 : 0;
      for (let x = -off; x < 256; x += h * 1.6) {
        const l = 0.75 + Math.random() * 0.3;
        g.fillStyle = base;
        g.globalAlpha = l;
        g.fillRect(x + 3, r * h + 3, h * 1.6 - 6, h - 6);
      }
    }
    g.globalAlpha = 1;
    const tex = this.t(new THREE.CanvasTexture(c));
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  private build() {
    const floorTex = this.stoneTex('#8a8276', '#3a3530', 8);
    floorTex.repeat.set(GX / 2, GZ / 2);
    const floor = this.mesh(new THREE.PlaneGeometry(GX * CELL, GZ * CELL), this.mat(0xffffff, { map: floorTex }), OX, 0, OZ);
    floor.rotation.x = -Math.PI / 2;
    floor.castShadow = false;
    const moat = this.mesh(new THREE.PlaneGeometry(10, 6), this.mat(0x0a1420, { emissive: 0x0a1a3a, emissiveIntensity: 0.6, roughness: 0.1, metalness: 0.4 }), this.w(10.5, 16).x, -0.3, this.w(10.5, 16).z + 1);
    moat.rotation.x = -Math.PI / 2;
    moat.castShadow = false;
    const ceil = this.mesh(new THREE.PlaneGeometry(GX * CELL, GZ * CELL), this.mat(0x1a1816), OX, H, OZ);
    ceil.rotation.x = Math.PI / 2;
    ceil.castShadow = false;

    const walls: THREE.Vector3[] = [];
    const things: { p: THREE.Vector3; ch: string; gx: number; gz: number }[] = [];
    for (let gz = 0; gz < GZ; gz++) {
      for (let gx = 0; gx < GX; gx++) {
        const ch = MAP[gz][gx];
        const p = this.w(gx, gz);
        if (ch === '#') {
          walls.push(p);
          this.blocked[gz * GX + gx] = 1;
          this.box(p.x - 1, p.z - 1, p.x + 1, p.z + 1);
        } else if (ch === '~') {
          // the moat, beyond the drawbridge
          this.blocked[gz * GX + gx] = 1;
          this.box(p.x - 1, p.z - 1, p.x + 1, p.z + 1);
        } else if (ch === 'p' || ch === 'c' || ch === 'X' || ch === 'g' || ch === 'S') {
          this.blocked[gz * GX + gx] = 1;
          things.push({ p, ch, gx, gz });
        } else if ('tBHLD$'.includes(ch)) things.push({ p, ch, gx, gz });
      }
    }
    const wallTex = this.stoneTex('#958a7a', '#3e3832', 6);
    const wi = new THREE.InstancedMesh(this.t(new THREE.BoxGeometry(CELL, H, CELL)), this.mat(0xffffff, { map: wallTex }), walls.length);
    walls.forEach((p, i) => wi.setMatrixAt(i, new THREE.Matrix4().makeTranslation(p.x, H / 2, p.z)));
    wi.castShadow = !this.lowEnd;
    wi.receiveShadow = true;
    this.root.add(wi);

    const stone = this.mat(0x5a5650);
    const darkStone = this.mat(0x3a3632);
    const iron = this.mat(0x2a2a2e, { metalness: 0.8, roughness: 0.5 });
    const wood = this.mat(0x4a3020);
    let lights = 0;
    for (const { p, ch, gx, gz } of things) {
      if (ch === 'p') {
        this.mesh(new THREE.CylinderGeometry(0.45, 0.55, H, 10), stone, p.x, H / 2, p.z);
        this.box(p.x - 0.5, p.z - 0.5, p.x + 0.5, p.z + 0.5);
      } else if (ch === 'c') {
        // A stone coffin with a knight carved on the lid
        this.mesh(new THREE.BoxGeometry(1.0, 0.7, 1.9), darkStone, p.x, 0.35, p.z);
        this.mesh(new THREE.BoxGeometry(1.1, 0.12, 2.0), stone, p.x, 0.76, p.z);
        this.mesh(new THREE.BoxGeometry(0.4, 0.12, 1.3), stone, p.x, 0.88, p.z);
        this.box(p.x - 0.55, p.z - 1, p.x + 0.55, p.z + 1, 0.9);
      } else if (ch === 't') {
        // A torch on the nearest wall
        let dx = 0;
        let dz = 0;
        if (MAP[gz][gx - 1] === '#') dx = -1;
        else if (MAP[gz][gx + 1] === '#') dx = 1;
        else if (MAP[gz - 1]?.[gx] === '#') dz = -1;
        else dz = 1;
        const tx = p.x + dx * 0.85;
        const tz = p.z + dz * 0.85;
        this.mesh(new THREE.CylinderGeometry(0.04, 0.03, 0.5, 6), wood, tx, 1.9, tz).rotation.set(dz * 0.4, 0, -dx * 0.4);
        const fm = this.t(new THREE.MeshBasicMaterial({ color: 0xffa040 }));
        const flame = this.mesh(new THREE.ConeGeometry(0.09, 0.28, 8), fm, tx - dx * 0.08, 2.25, tz - dz * 0.08);
        flame.castShadow = false;
        let light: THREE.PointLight | undefined;
        if (lights < (this.lowEnd ? 4 : 7)) {
          light = new THREE.PointLight(0xff8a3a, 14, 13, 1.4);
          light.position.set(tx - dx * 0.4, 2.3, tz - dz * 0.4);
          this.root.add(light);
          lights++;
        }
        this.flames.push({ mat: fm, light, base: 14, ph: Math.random() * 10 });
      } else if (ch === 'H') {
        // Portcullis in the doorway (up at first)
        const g = new THREE.Group();
        g.position.set(p.x, 0, p.z);
        for (let i = -3; i <= 3; i++) this.mesh(new THREE.BoxGeometry(0.06, H, 0.06), iron, 0, H / 2, i * 0.28, g);
        for (let j = 0; j < 5; j++) this.mesh(new THREE.BoxGeometry(0.06, 0.06, 2), iron, 0, 0.3 + j * 0.75, 0, g);
        for (let i = -3; i <= 3; i++) this.mesh(new THREE.ConeGeometry(0.05, 0.18, 4), iron, 0, -0.08, i * 0.28, g).rotation.x = Math.PI;
        g.position.y = H - 0.25;
        this.root.add(g);
        const b = this.box(p.x - 0.15, p.z - 1, p.x + 0.15, p.z + 1);
        b.disabled = true;
        this.gates.push({ gx, gz, pos: p, mesh: g, box: b, k: 0, down: 0, cool: 0 });
      } else if (ch === 'L') {
        // The drawbridge lever
        this.lever.copy(p);
        this.mesh(new THREE.BoxGeometry(0.5, 1.0, 0.3), iron, p.x, 0.5, p.z + 0.7);
        const arm = new THREE.Group();
        arm.position.set(p.x, 0.9, p.z + 0.5);
        this.mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.8, 8), wood, 0, 0.4, 0, arm);
        this.mesh(new THREE.SphereGeometry(0.08, 10, 8), this.mat(0x8a1a14, { emissive: 0x4a0000, emissiveIntensity: 0.6 }), 0, 0.8, 0, arm);
        arm.rotation.x = -0.6;
        this.root.add(arm);
        this.leverArm = arm;
        this.box(p.x - 0.3, p.z + 0.5, p.x + 0.3, p.z + 0.9, 1);
      } else if (ch === 'D' && !this.bridgePivot) {
        // The drawbridge: two cells wide, raised (a wooden wall) until the lever is pulled
        const mid = this.w(gx + 0.5, gz);
        this.bridge.copy(mid);
        const pivot = new THREE.Group();
        pivot.position.set(mid.x, 0, mid.z + 1);
        for (let i = 0; i < 7; i++) this.mesh(new THREE.BoxGeometry(0.55, 3.6, 0.16), wood, -1.65 + i * 0.55, 1.8, 0, pivot);
        for (const y of [0.6, 1.8, 3.0]) this.mesh(new THREE.BoxGeometry(3.9, 0.12, 0.2), iron, 0, y, 0.05, pivot);
        this.root.add(pivot);
        this.bridgePivot = pivot;
        this.bridgeBox = this.box(mid.x - 2, mid.z + 0.7, mid.x + 2, mid.z + 1.3);
        // Night light behind the bridge
        const moon = new THREE.PointLight(0x8aa0ff, 6, 12, 1.4);
        moon.position.set(mid.x, 2.5, mid.z + 3);
        this.root.add(moon);
      } else if (ch === 'X') {
        // ⚔️ The sword in the stone
        this.stone.copy(p);
        const rock = this.mesh(new THREE.DodecahedronGeometry(0.7, 0), this.mat(0x6a645a, { flatShading: true }), p.x, 0.35, p.z);
        rock.scale.set(1.2, 0.7, 1.1);
        const sw = new THREE.Group();
        sw.position.set(p.x, 0.75, p.z);
        sw.rotation.z = 0.08;
        const steel = this.mat(0xd8dce4, { metalness: 1, roughness: 0.2, emissive: 0x203040, emissiveIntensity: 0.5 });
        const gold = this.mat(0xd4a840, { metalness: 0.9, roughness: 0.3 });
        this.mesh(new THREE.BoxGeometry(0.07, 0.9, 0.02), steel, 0, 0.35, 0, sw);
        this.mesh(new THREE.BoxGeometry(0.3, 0.05, 0.06), gold, 0, 0.82, 0, sw);
        this.mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.2, 8), this.mat(0x3a2010), 0, 0.95, 0, sw);
        this.mesh(new THREE.SphereGeometry(0.04, 8, 6), gold, 0, 1.06, 0, sw);
        this.root.add(sw);
        this.stoneSword = sw;
        this.box(p.x - 0.8, p.z - 0.8, p.x + 0.8, p.z + 0.8, 0.7);
      } else if (ch === 'S') {
        // 🧱 A wall like the others… that sinks into the floor once the 5 scrolls are found
        this.secret.copy(p);
        this.secretCell = gz * GX + gx;
        this.secretMesh = this.mesh(new THREE.BoxGeometry(CELL, H, CELL), this.mat(0xffffff, { map: wallTex }), p.x, H / 2, p.z);
        this.secretBox = this.box(p.x - 1, p.z - 1, p.x + 1, p.z + 1);
      } else if (ch === '$') {
        // 💰 The treasure chest, among heaps of gold
        this.chest.copy(p);
        const woodC = this.mat(0x5a3418);
        const goldC = this.mat(0xffcc33, { metalness: 0.9, roughness: 0.25, emissive: 0x5a3a00, emissiveIntensity: 0.8 });
        this.mesh(new THREE.BoxGeometry(1.0, 0.55, 0.65), woodC, p.x, 0.28, p.z);
        const lid = new THREE.Group();
        lid.position.set(p.x, 0.55, p.z - 0.32);
        const top = this.mesh(new THREE.CylinderGeometry(0.33, 0.33, 1.0, 14, 1, false, 0, Math.PI), woodC, 0, 0, 0.32, lid);
        top.rotation.z = Math.PI / 2;
        this.root.add(lid);
        this.chestLid = lid;
        for (const x of [-0.4, 0.4]) this.mesh(new THREE.BoxGeometry(0.06, 0.6, 0.68), goldC, p.x + x, 0.3, p.z);
        for (let i = 0; i < 14; i++) {
          const a = Math.random() * Math.PI * 2;
          const r = 0.7 + Math.random() * 0.9;
          this.mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.02, 10), goldC, p.x + Math.cos(a) * r, 0.02 + Math.random() * 0.05, p.z + Math.sin(a) * r).rotation.set(Math.random(), 0, Math.random());
        }
        const glow = new THREE.PointLight(0xffc040, 3, 6, 1.5);
        glow.position.set(p.x, 1.2, p.z);
        this.root.add(glow);
        this.box(p.x - 0.5, p.z - 0.35, p.x + 0.5, p.z + 0.35, 0.8);
      } else if (ch === 'g') {
        if (!this.dragon) this.buildDragon(this.w(gx + 0.5, gz + 0.5));
      } else if (ch === 'B') {
        // A pedestal where a coat of arms lies
        this.mesh(new THREE.CylinderGeometry(0.3, 0.38, 0.8, 10), stone, p.x, 0.4, p.z);
        this.box(p.x - 0.35, p.z - 0.35, p.x + 0.35, p.z + 0.35, 0.8);
      }
    }
    this.scene.add(this.root);
    this.map.collisionBoxes.push(...this.boxes);
  }

  // ---------------------------------------------------------------------
  // 🐉 The sleeping dragon: a big body curled on the floor, head on its paws
  // ---------------------------------------------------------------------
  private buildDragon(c: THREE.Vector3) {
    this.dragonPos.copy(c);
    const g = new THREE.Group();
    g.position.set(c.x, 0, c.z);
    // the head looks west, toward the way in
    g.rotation.y = Math.PI / 2;
    const scale = this.mat(0x1f4a1c, { roughness: 0.6, metalness: 0.2 });
    const belly = this.mat(0x7a6a32, { roughness: 0.8 });
    const horn = this.mat(0x2a1a10, { roughness: 0.5 });
    this.dragonEyes = this.mat(0x101000, { emissive: 0xffcc00, emissiveIntensity: 0 });
    const body = this.mesh(new THREE.SphereGeometry(1, 18, 12), scale, 0, 0.85, 0.4, g);
    body.scale.set(1.3, 0.85, 1.8);
    this.dragonBody = body;
    this.mesh(new THREE.SphereGeometry(0.9, 14, 10), belly, 0, 0.55, 0.5, g).scale.set(1.1, 0.5, 1.6);
    // spikes along the back
    for (let i = 0; i < 7; i++) this.mesh(new THREE.ConeGeometry(0.12, 0.4, 5), horn, 0, 1.6 - Math.abs(i - 3) * 0.08, 1.5 - i * 0.45, g).rotation.x = -0.3;
    // tail curled around
    const tail = this.mesh(new THREE.TorusGeometry(1.6, 0.22, 8, 20, Math.PI * 1.2), scale, 0.2, 0.25, 0.8, g);
    tail.rotation.set(Math.PI / 2, 0, 0.6);
    // folded wings
    for (const s of [-1, 1]) {
      const sh = new THREE.Shape();
      sh.moveTo(0, 0);
      sh.lineTo(1.4, 0.9);
      sh.lineTo(1.9, -0.1);
      sh.quadraticCurveTo(1.2, 0.1, 0.9, -0.5);
      sh.quadraticCurveTo(0.5, -0.1, 0, 0);
      const wing = this.mesh(new THREE.ShapeGeometry(sh), this.mat(0x163a14, { side: THREE.DoubleSide, roughness: 0.7 }), s * 0.9, 1.3, 0.6, g);
      wing.rotation.set(-0.4, s > 0 ? -Math.PI / 2 + 0.3 : Math.PI / 2 - 0.3, s * 0.5);
    }
    // neck + head (the head can rise)
    const neck = this.mesh(new THREE.CylinderGeometry(0.32, 0.45, 1.6, 10), scale, 0, 0.75, -1.4, g);
    neck.rotation.x = Math.PI / 2 - 0.2;
    const head = new THREE.Group();
    head.position.set(0, 0.55, -2.3);
    g.add(head);
    this.mesh(new THREE.BoxGeometry(0.7, 0.5, 0.8), scale, 0, 0, 0, head);
    this.mesh(new THREE.BoxGeometry(0.5, 0.3, 0.7), scale, 0, -0.08, -0.65, head);
    for (const s of [-1, 1]) {
      this.mesh(new THREE.SphereGeometry(0.08, 8, 6), this.dragonEyes, s * 0.25, 0.12, -0.38, head);
      const h = this.mesh(new THREE.ConeGeometry(0.08, 0.6, 6), horn, s * 0.25, 0.3, 0.25, head);
      h.rotation.x = 0.9;
    }
    this.dragonHead = head;
    this.dragon = g;
    this.root.add(g);
    this.box(c.x - 2, c.z - 2, c.x + 2, c.z + 2, 2);
    // the fire (always there, hidden: the number of lights never changes)
    this.fireMat = this.t(new THREE.MeshBasicMaterial({ color: 0xff6a10, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
    const fg = this.t(new THREE.SphereGeometry(0.3, 8, 6));
    for (let i = 0; i < 40; i++) {
      const m = new THREE.Mesh(fg, this.fireMat);
      m.visible = false;
      this.root.add(m);
      this.fire.push({ m, t: 0, v: new THREE.Vector3() });
    }
    this.fireLight = new THREE.PointLight(0xff6a10, 0, 14, 1.4);
    this.fireLight.position.set(c.x - 2.5, 1.2, c.z);
    this.root.add(this.fireLight);
  }

  /** where the fire comes out */
  private mouth() {
    return new THREE.Vector3(this.dragonPos.x - 2.9, 0.9, this.dragonPos.z);
  }

  private updateDragon(delta: number, pls: SitePlayer[], onCatch: (i: number) => void) {
    if (!this.dragon) return;
    const now = performance.now() * 0.001;
    // breathing while asleep
    this.dragonBody.scale.y = 0.85 + Math.sin(now * 1.3) * 0.03;
    const awake = this.dragonState > 0;
    this.dragonHead.position.y = THREE.MathUtils.damp(this.dragonHead.position.y, awake ? 1.3 : 0.55, 4, delta);
    this.dragonEyes.emissiveIntensity = THREE.MathUtils.damp(this.dragonEyes.emissiveIntensity, awake ? 3 : 0, 5, delta);
    // fire particles
    for (const f of this.fire) {
      if (!f.m.visible) continue;
      f.t -= delta;
      f.m.position.addScaledVector(f.v, delta);
      f.m.scale.setScalar(1 + (0.9 - f.t) * 2.5);
      if (f.t <= 0) f.m.visible = false;
    }
    if (this.guest) return;
    this.dragonCd = Math.max(0, this.dragonCd - delta);
    if (this.dragonState === 0) {
      // footsteps that don't tiptoe wake it up
      for (const pl of pls) {
        if (pl.dead) continue;
        const d = Math.hypot(pl.pos.x - this.dragonPos.x, pl.pos.z - this.dragonPos.z);
        if (d < 9 && !pl.crouch) this.dragonNoise += delta * (d < 5 ? 0.9 : 0.45);
      }
      this.dragonNoise = Math.max(0, this.dragonNoise - delta * 0.15);
      if (this.dragonNoise >= 3 && this.dragonCd <= 0) {
        this.dragonState = 1;
        this.dragonT = 1.3;
        sound.playMonsterGrowl(4, 0);
        sound.playDragonRoar();
        this.toast('🐉 LE DRAGON SE RÉVEILLE ! Sors de sa ligne de feu !');
      }
      return;
    }
    this.dragonT -= delta;
    if (this.dragonState === 1) {
      // aims at the nearest player
      const pl = pls.filter((x) => !x.dead).sort((a, b) => a.pos.distanceToSquared(this.dragonPos) - b.pos.distanceToSquared(this.dragonPos))[0];
      const m = this.mouth();
      this.fireDir = pl ? Math.atan2(pl.pos.z - m.z, pl.pos.x - m.x) : Math.PI;
      if (this.dragonT <= 0) {
        this.dragonState = 2;
        this.dragonT = 3.2;
        this.knightBurnt = false;
        sound.playFireBreath();
      }
      return;
    }
    // breathing fire
    const m = this.mouth();
    this.fireLight.intensity = 18 + Math.random() * 8;
    this.fireLight.position.set(m.x + Math.cos(this.fireDir) * 3, 1.2, m.z + Math.sin(this.fireDir) * 3);
    for (let k = 0; k < 3; k++) {
      const f = this.fire.find((x) => !x.m.visible);
      if (!f) break;
      const a = this.fireDir + (Math.random() - 0.5) * 0.3;
      f.m.visible = true;
      f.t = 0.9;
      f.m.position.copy(m);
      f.v.set(Math.cos(a) * 13, (Math.random() - 0.4) * 1.2, Math.sin(a) * 13);
    }
    const inFire = (p: THREE.Vector3) => {
      const dx = p.x - m.x;
      const dz = p.z - m.z;
      const d = Math.hypot(dx, dz);
      if (d > 12.5) return false;
      let da = Math.atan2(dz, dx) - this.fireDir;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      return Math.abs(da) < 0.22 + 0.6 / Math.max(1, d) && this.los(m, p);
    };
    pls.forEach((pl, i) => {
      if (pl.dead) return;
      if (inFire(pl.pos)) {
        this.burnT[i] = (this.burnT[i] ?? 0) + delta;
        if (this.burnT[i] > 0.35) onCatch(i);
      } else this.burnT[i] = 0;
    });
    // Even Patient Zéro is afraid of the dragon's fire
    const k = this.stalker;
    if (k && this.woke && !this.knightBurnt && inFire(k.position)) {
      this.knightBurnt = true;
      this.stunT = 8;
      k.stun(8);
      this.mode = 'patrol';
      this.path = [];
      this.toast('🔥 Le Chevalier recule devant les flammes du dragon !');
    }
    if (this.dragonT <= 0) {
      this.dragonState = 0;
      this.dragonNoise = 0;
      this.dragonCd = 20;
      this.fireLight.intensity = 0;
      this.toast('🐉 Le dragon se rendort… Ne le réveille plus.');
    }
  }

  private makeNotes() {
    const note = (id: string, name: string, description: string, lore: string, gx: number, gz: number) => ({
      item: { id, name, type: 'note' as const, description, lore, icon: 'Shield' },
      // blasons on their pedestal, scrolls on the floor
      pos: this.w(gx, gz, id.startsWith('don-parch') ? 0.02 : 0.82),
    });
    this.noteDrops = [
      note('don-blason-lion', 'Blason — Le Lion', 'Un blason rouge, un lion d\'or dressé.', '« Gravé au dos : « Au premier chevalier de Saint-Aurore, gardien des malades. Que sa lumière ne s\'éteigne jamais. » La peinture est écaillée. Quelqu\'un a griffé le lion, longtemps, avec rage. »', 2, 2),
      note('don-blason-aigle', 'Blason — L\'Aigle', 'Un blason bleu, un aigle aux ailes ouvertes.', '« Une note glissée derrière : « Les moines soignaient les fiévreux ici, bien avant l\'hôpital. Ceux qui ne guérissaient pas, on les descendait dans la crypte. Avec leur armure. » »', 19, 4),
      note('don-blason-dragon', 'Blason — Le Dragon', 'Un blason noir, un dragon qui crache du feu.', '« Le dernier blason est encore chaud. Sur le bord, une écriture d\'enfant, gravée à la pointe : « LUCAS CHEVALIER ». À côté, un petit bonhomme en armure qui tient une épée trop grande pour lui. »', 9, 12),
      // 📜 the 5 scrolls: the story of the cursed armour
      note('don-parch-1', 'Parchemin I — Le chevalier guérisseur', 'Un parchemin roulé, cacheté de cire rouge.', '« L\'an 1347, la peste entra dans la ville. Messire Aurèle, chevalier de l\'ordre, ôta son épée et soigna les fiévreux de ses mains. On bâtit pour lui un hospice sur cette colline : Sainte-Aurore. »', 8, 1),
      note('don-parch-2', 'Parchemin II — Le serment', 'Un parchemin taché de cire.', '« Messire Aurèle jura de ne jamais quitter les malades tant qu\'un seul resterait dans le noir. Il fit forger une armure pour garder la crypte, et dit : « Qui la portera ne craindra plus la lumière, ni la mort. » »', 19, 8),
      note('don-parch-3', 'Parchemin III — La malédiction', 'Un parchemin brûlé sur un bord.', '« Quand Aurèle mourut, l\'armure resta debout. Les moines l\'entendaient marcher la nuit, d\'un cercueil à l\'autre, comme s\'il comptait encore ses malades. On scella la crypte. On oublia la crypte. »', 23, 1),
      note('don-parch-4', 'Parchemin IV — Le gardien', 'Un parchemin griffé de traces de crocs.', '« Pour garder le trésor de l\'ordre, les moines laissèrent un dragon endormi dans l\'aile est. Il ne se réveille qu\'au bruit. Les sages traversent sa salle à pas de loup. Les autres finissent en cendres. »', 14, 12),
      note('don-parch-5', 'Parchemin V — Le passage', 'Le dernier parchemin, très ancien.', '« Celui qui lira les cinq parchemins saura où frapper : derrière le dernier cercueil, à l\'est, le mur cède. Le trésor de l\'ordre y dort encore. Et l\'épée, dans la pierre, attend une main assez brave. »', 4, 10),
    ];
  }

  public supplyDrops(): { item: GameItem; pos: THREE.Vector3 }[] {
    return [
      { item: { id: 'd10-battery-1', name: 'Pile', type: 'battery', description: 'Recharge 55 % de la batterie de la lampe torche.', icon: 'BatteryCharging' }, pos: this.w(14, 8, 0.02) },
      { item: { id: 'd10-battery-2', name: 'Pile', type: 'battery', description: 'Recharge 55 % de la batterie de la lampe torche.', icon: 'BatteryCharging' }, pos: this.w(19, 12, 0.02) },
      { item: { id: 'd10-food-1', name: 'Barre de céréales', type: 'food', description: 'Redonne 40 points d\'endurance.', icon: 'Cookie' }, pos: this.w(3, 7, 0.02) },
    ];
  }

  public freeSpots(n: number): THREE.Vector3[] {
    const out: THREE.Vector3[] = [];
    for (let tries = 0; tries < n * 30 && out.length < n; tries++) {
      const gx = Math.floor(Math.random() * GX);
      const gz = Math.floor(Math.random() * GZ);
      if (!this.isFloor(gx, gz) || 'HLD'.includes(MAP[gz][gx])) continue;
      const p = this.w(gx, gz);
      if (out.every((o) => o.distanceToSquared(p) > 6)) out.push(p);
    }
    return out;
  }

  // ---------------------------------------------------------------------
  // Patient Zéro, in his cursed armour
  // ---------------------------------------------------------------------
  private spawnKnight() {
    const m = new MonsterAI(this.w(3, 12), this.map.navNodes, [], this.map.doors, () => {}, 0);
    const d = DEFAULT_APPEARANCE.monster;
    m.setFixedLook({ skin: d.skin, eyes: '#ff2010', gown: '#22222a', outfit: 'knightpz' }, 1.08);
    m.mesh.visible = false;
    if (this.lowEnd) m.mesh.traverse((o) => (o.castShadow = false));
    this.stalker = m;
    this.scene.add(m.mesh);
  }

  private sees(pl: SitePlayer) {
    const s = this.stalker!;
    if (pl.dead) return false;
    const d = Math.hypot(pl.pos.x - s.position.x, pl.pos.z - s.position.z);
    // The lamp gives you away from far; crouching in the dark, only up close
    const range = pl.flashlight ? 18 : pl.crouch ? 4 : 8;
    return d < range && this.los(s.position, pl.pos);
  }

  public toggleUV() {
    return false;
  }

  public hear(origin: THREE.Vector3, loudness: number) {
    const s = this.stalker;
    if (!s || !this.woke) return;
    if (Math.hypot(origin.x - s.position.x, origin.z - s.position.z) > loudness * 1.6) return;
    this.mode = 'hunt';
    this.target.copy(origin).setY(0);
    this.lostT = Math.max(this.lostT, 4);
    this.pathT = 0;
  }

  private nearGate(p: THREE.Vector3) {
    return this.gates.find((g) => Math.hypot(g.pos.x - p.x, g.pos.z - p.z) < 2.6);
  }

  public hint(p: THREE.Vector3): string | null {
    if (!this.chestTaken && this.secretOpen && Math.hypot(this.chest.x - p.x, this.chest.z - p.z) < 1.8) return '[E] Ouvrir le trésor de l\'ordre';
    if (this.swordOf === null && Math.hypot(this.stone.x - p.x, this.stone.z - p.z) < 1.9) return `[E] Tirer l'épée de la pierre (${this.pulls}/3) — ça fait du bruit !`;
    if (this.bridgeDown && Math.hypot(this.bridge.x - p.x, this.bridge.z - p.z) < 2.8) return '[E] Traverser le pont-levis et fuir le donjon';
    if (Math.hypot(this.lever.x - p.x, this.lever.z - p.z) < 2.2)
      return this.bridgeDown ? 'Le pont-levis est baissé : fuyez !' : this.found >= BLASON_IDS.length ? '[E] Tirer le levier du pont-levis' : `Levier bloqué : il faut les 3 blasons (${this.found}/${BLASON_IDS.length})`;
    const g = this.nearGate(p);
    if (g) return g.k > 0.5 ? 'Herse baissée…' : g.cool > 0 ? `La herse remonte… (${Math.ceil(g.cool)} s)` : '[E] Faire tomber la herse';
    return null;
  }

  public interact(p: THREE.Vector3, who = 0): SiteAction | null {
    if (!this.chestTaken && this.secretOpen && Math.hypot(this.chest.x - p.x, this.chest.z - p.z) < 1.8) {
      this.chestTaken = true;
      sound.playChestOpen(3);
      if (this.duel) this.score[who] += 2;
      return { msg: '💰 Le trésor de l\'ordre ! Des pièces d\'or anciennes plein les poches.', coins: 150, shake: 0.2 };
    }
    if (this.swordOf === null && Math.hypot(this.stone.x - p.x, this.stone.z - p.z) < 1.9) {
      this.pulls++;
      sound.playBreakerClunk();
      // the effort is loud: the knight (and the dragon) hear it
      this.hear(p, 12);
      this.dragonNoise += 1;
      if (this.pulls < 3) return { msg: this.pulls === 1 ? '⚔️ Tu tires de toutes tes forces… elle bouge un peu ! (1/3)' : '⚔️ Encore… la pierre craque ! (2/3)', shake: 0.25 };
      this.swordOf = who;
      this.stoneSword.visible = false;
      sound.playChestOpen(2);
      return { msg: '⚔️ Tu as arraché l\'épée de la pierre ! Elle te protégera UNE fois du Chevalier.', shake: 0.4 };
    }
    if (this.bridgeDown && this.bridgeK > 0.9 && Math.hypot(this.bridge.x - p.x, this.bridge.z - p.z) < 2.8) {
      this.ending = 'DONJON';
      if (this.duel) {
        const [a, b] = this.score;
        this.toast(a === b ? `⚔️ Duel : égalité, ${a} à ${b} !` : `🏆 Duel gagné par ${a > b ? "l'hôte" : "l'invité"} : ${Math.max(a, b)} à ${Math.min(a, b)} !`);
      }
      return { ending: 'DONJON' } as SiteAction;
    }
    if (Math.hypot(this.lever.x - p.x, this.lever.z - p.z) < 2.2) {
      if (this.bridgeDown) return { msg: 'Le pont-levis descend… Fuyez !' };
      if (this.found < BLASON_IDS.length) return { msg: `Le levier ne bouge pas. Il porte 3 encoches vides : retrouvez les blasons du royaume (${this.found}/${BLASON_IDS.length}).` };
      this.bridgeDown = true;
      sound.playBreakerClunk();
      sound.playPortcullis(true);
      // The noise of the chains: he knows where you are, and he's furious
      this.rage = true;
      if (this.stalker && this.woke) {
        this.mode = 'hunt';
        this.target.copy(p).setY(0);
        this.lostT = 30;
      }
      return { msg: '⚙️ Les chaînes grincent… Le pont-levis s\'abaisse ! Le vacarme résonne dans toute la crypte.', shake: 0.5 };
    }
    const g = this.nearGate(p);
    if (g) {
      if (g.k > 0.5 || g.down > 0) return { msg: 'La herse est déjà baissée.' };
      if (g.cool > 0) return { msg: `Le mécanisme est encore bloqué… (${Math.ceil(g.cool)} s)` };
      if (Math.hypot(g.pos.x - p.x, g.pos.z - p.z) < 0.9) return { msg: 'Écartez-vous de la herse avant de la lâcher !' };
      g.down = 12;
      sound.playPortcullis(false);
      const s = this.stalker;
      if (s && this.woke && Math.hypot(g.pos.x - s.position.x, g.pos.z - s.position.z) < 2.3) {
        this.stunT = 10;
        s.stun(10);
        this.onTrap?.();
        return { msg: '⚔️ La herse s\'écrase sur le Chevalier ! Il est coincé pour quelques secondes… FUYEZ !', shake: 0.6 };
      }
      return { msg: 'La herse tombe dans un fracas de fer. Le passage est bloqué pendant 12 secondes.', shake: 0.3 };
    }
    return null;
  }

  public objective(): string {
    const duel = this.duel ? ` · ⚔️ Duel : toi ${this.score[this.guest ? 1 : 0]} – ami ${this.score[this.guest ? 0 : 1]}` : '';
    return this.baseObjective() + duel + (this.parch > 0 && this.parch < PARCH_IDS.length ? ` · 📜 ${this.parch}/${PARCH_IDS.length}` : '') + (this.swordHeld() ? ' · ⚔️ épée' : '');
  }
  private swordHeld() {
    return this.swordOf === (this.guest ? 1 : 0);
  }
  private baseObjective(): string {
    if (this.bridgeDown) return 'Le pont-levis est baissé : fuyez par la sortie au sud !';
    if (this.found >= BLASON_IDS.length) return 'Les 3 blasons sont là. Tirez le levier du pont-levis (au fond de la crypte, au sud).';
    return `Trouvez les 3 blasons du royaume : ${this.found}/${BLASON_IDS.length}${this.woke ? ' · les herses [E] peuvent le bloquer' : ''}`;
  }

  public update(delta: number, pls: SitePlayer[], listener: Listener, onCatch: (i: number) => void, onRelease: () => void) {
    if (this.found !== this.lastFound) {
      this.lastFound = this.found;
      if (this.found >= BLASON_IDS.length) this.toast('🛡️ Les 3 blasons du royaume sont réunis. Le levier du pont-levis peut bouger.');
      else this.toast(`🛡️ Blason ${this.found}/${BLASON_IDS.length}.`);
    }
    this.visuals(delta);
    this.updateDragon(delta, pls, onCatch);
    if (this.parch >= PARCH_IDS.length && !this.secretOpen) {
      this.secretOpen = true;
      sound.playPortcullis(true);
      this.toast('🧱 Les 5 parchemins sont réunis… Un mur de la crypte s\'enfonce dans le sol, à l\'est : un passage secret !');
    }
    const s = this.stalker;
    sound.setDungeonMusic(true, !!s && this.woke && this.mode === 'hunt');
    if (!s) return;
    if (!this.woke) {
      this.wakeT -= delta;
      if (this.wakeT > 0 && this.found === 0) return;
      this.woke = true;
      const pl = pls[0];
      let best = this.w(3, 12);
      let bd = -1;
      for (const [gx, gz] of [
        [3, 12],
        [19, 12],
        [2, 2],
        [19, 2],
      ]) {
        const p = this.w(gx, gz);
        const d = Math.hypot(p.x - pl.pos.x, p.z - pl.pos.z);
        if (d > bd) {
          bd = d;
          best = p;
        }
      }
      s.placeAt(best.x, best.z);
      s.mesh.visible = true;
      sound.playMonsterGrowl(18, 0);
      sound.playPortcullis(false);
      this.toast('⚔️ Un fracas d\'armure résonne dans la crypte… Le Patient Zéro s\'est relevé, en armure. Ta lampe ne lui fait plus peur.');
      onRelease();
      return;
    }
    const alive = pls.filter((x) => !x.dead);
    if (!alive.length) return;
    const dist = (x: SitePlayer) => Math.hypot(x.pos.x - s.position.x, x.pos.z - s.position.z);
    const pl = alive.sort((a, b) => dist(a) - dist(b))[0];
    // Trapped under a portcullis
    if (this.stunT > 0) {
      this.stunT -= delta;
      return;
    }
    const seen = alive.find((x) => this.sees(x));
    if (seen) {
      if (this.mode !== 'hunt' && !this.tipped && dist(seen) > 4) {
        this.tipped = true;
        this.toast('Il ne fuit pas la lumière… Cache-toi, ou fais tomber une herse [E] devant lui.');
      }
      this.mode = 'hunt';
      this.target.copy(seen.pos).setY(0);
      this.lostT = this.rage ? 30 : 5;
    } else if (this.mode === 'hunt') {
      this.lostT -= delta;
      if (this.lostT <= 0) {
        this.mode = 'patrol';
        this.path = [];
      }
    }
    const hunting = this.mode === 'hunt';
    if (!hunting && (!this.path.length || Math.hypot(this.target.x - s.position.x, this.target.z - s.position.z) < 1)) {
      this.target.copy(this.randomFloor());
      this.pathT = 0;
    }
    const sp = hunting ? ([2.4, 2.6, 3.0, 3.4, 3.8, 4.2][this.difficulty] ?? 3.2) * (this.rage ? 1.1 : 1) : 1.6;
    this.pathT -= delta;
    if (this.pathT <= 0 || !this.path.length) {
      this.pathT = 0.4;
      this.path = this.findPath(s.position, this.target);
      // A lowered portcullis in the way: wait behind it, rattling the bars
      if (!this.path.length && hunting) this.path = [];
    }
    while (this.path.length > 1 && Math.hypot(this.path[0].x - s.position.x, this.path[0].z - s.position.z) < 0.5) this.path.shift();
    if (this.path.length) s.driveToward(this.path[0], sp, delta, [], listener, hunting);
    // Heavy metal footsteps
    this.stepT -= delta;
    if (this.stepT <= 0 && this.path.length) {
      this.stepT = hunting ? 0.36 : 0.6;
      sound.playArmorStep(dist(pls[0]));
    }
    pls.forEach((x, i) => {
      if (x.dead || dist(x) >= 1.1) return;
      // ⚔️ the sword from the stone: one parry, then it breaks
      if (this.swordOf === i) {
        this.swordOf = -1;
        this.stunT = 7;
        s.stun(7);
        const away = Math.atan2(s.position.z - x.pos.z, s.position.x - x.pos.x);
        const back = new THREE.Vector3(s.position.x + Math.cos(away) * 2, 0, s.position.z + Math.sin(away) * 2);
        const [bx, bz] = this.cellOf(back);
        if (this.isFloor(bx, bz)) s.placeAt(back.x, back.z);
        sound.playArmorStep(0);
        sound.playBreakerClunk();
        this.toast('⚔️ CLANG ! Tu repousses le Chevalier avec l\'épée… qui se brise en deux. FUIS !');
        return;
      }
      onCatch(i);
    });
  }

  public mirror(delta: number) {
    this.visuals(delta);
    this.updateDragon(delta, [], () => {});
    sound.setDungeonMusic(true, !!this.stalker && this.woke && this.mode === 'hunt');
  }

  private visuals(delta: number) {
    const now = performance.now() * 0.001;
    for (const f of this.flames) {
      const k = 0.8 + Math.sin(now * 13 + f.ph) * 0.1 + Math.sin(now * 7.3 + f.ph * 2) * 0.1;
      f.mat.color.setRGB(1, 0.35 + k * 0.15, 0.05);
      if (f.light) f.light.intensity = f.base * k;
    }
    for (const g of this.gates) {
      if (g.down > 0) {
        g.down -= delta;
        if (g.down <= 0) {
          g.cool = 15;
          sound.playPortcullis(false);
        }
      } else if (g.cool > 0) g.cool -= delta;
      const want = g.down > 0 ? 1 : 0;
      // falls fast, rises slowly
      g.k = want > g.k ? Math.min(1, g.k + delta * 5) : Math.max(0, g.k - delta * 0.6);
      g.mesh.position.y = (H - 0.25) * (1 - g.k);
      const closed = g.k > 0.6;
      g.box.disabled = !closed;
      this.blocked[g.gz * GX + g.gx] = closed ? 1 : 0;
    }
    if (this.secretOpen && this.secretK < 1) {
      this.secretK = Math.min(1, this.secretK + delta * 0.4);
      this.secretMesh.position.y = H / 2 - this.secretK * (H + 0.1);
      if (this.secretK > 0.7) {
        this.secretBox.disabled = true;
        this.blocked[this.secretCell] = 0;
      }
    }
    if (this.chestTaken && this.chestLid.rotation.x > -1.6) this.chestLid.rotation.x -= delta * 3;
    if (this.bridgeDown && this.bridgeK < 1) {
      this.bridgeK = Math.min(1, this.bridgeK + delta * 0.35);
      this.bridgePivot.rotation.x = (this.bridgeK * Math.PI) / 2;
      this.leverArm.rotation.x = -0.6 + this.bridgeK * 1.2;
      if (this.bridgeK > 0.6) this.bridgeBox.disabled = true;
    }
  }

  public netState(): DungeonNet {
    return {
      w: this.woke,
      b: this.bridgeDown,
      h: this.gates.map((g) => Math.max(0, g.down)),
      d: this.dragonState,
      da: this.fireDir,
      s: this.secretOpen,
      t: this.chestTaken,
      so: this.swordOf ?? -2,
      sc: this.score,
    };
  }
  public netApply(n: DungeonNet) {
    if (!n) return;
    // the guest sees the dragon and its fire
    if (n.d === 2 && this.dragonState !== 2) sound.playFireBreath();
    this.dragonState = n.d ?? 0;
    this.fireDir = n.da ?? 0;
    if (this.dragonState === 2) {
      const m = this.mouth();
      this.fireLight.intensity = 20;
      for (let k = 0; k < 3; k++) {
        const f = this.fire.find((x) => !x.m.visible);
        if (!f) break;
        const a = this.fireDir + (Math.random() - 0.5) * 0.3;
        f.m.visible = true;
        f.t = 0.9;
        f.m.position.copy(m);
        f.v.set(Math.cos(a) * 13, 0, Math.sin(a) * 13);
      }
    } else this.fireLight.intensity = 0;
    this.secretOpen = n.s;
    this.chestTaken = n.t;
    this.swordOf = n.so === -2 || n.so === undefined ? null : n.so;
    this.stoneSword.visible = this.swordOf === null;
    if (n.sc) this.score = n.sc;
    if (n.w && !this.woke && this.stalker) this.stalker.mesh.visible = true;
    this.woke = n.w;
    this.bridgeDown = n.b;
    n.h?.forEach((d, i) => this.gates[i] && (this.gates[i].down = d));
  }

  public dispose() {
    sound.setDungeonMusic(false);
    const mine = new Set(this.boxes);
    this.map.collisionBoxes = this.map.collisionBoxes.filter((b) => !mine.has(b));
    this.scene.remove(this.root);
    this.stalker = null;
    this.disposables.forEach((d) => d.dispose());
  }
}
