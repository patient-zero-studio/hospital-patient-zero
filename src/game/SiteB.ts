import * as THREE from 'three';
import { ProceduralTextures as Tex } from '../textures/ProceduralTextures';
import type { CollisionBox, FlickerLight, MapData } from './MapBuilder';
import { MonsterAI, Listener } from './MonsterAI';
import { sound } from '../audio/SoundSystem';
import { GameItem } from '../types';

/**
 * CHAPTER 5 — LE SITE B (finale)
 * The underground lab where Patient Zero was made. Power up 3 UV ramps
 * (Archives: keycard + console, Reactor: hold the lever, Wiring: 3 breakers),
 * then start the purge in the central chamber: the boss fight. The UV lamp [R]
 * burns the creature (and eats the battery). Find the 3 documents and you can
 * call it by its real name when it falls…
 */
const OX = -400;
const OZ = 0;
const CELL = 3;
const G = 30;
const H = 4.5;

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

/** Carved areas, in cells (x0, z0, x1, z1 inclusive). */
const AREAS: [number, number, number, number][] = [
  [11, 10, 18, 17], // central chamber
  [13, 24, 16, 27], // lift room (start)
  [14, 18, 15, 23], // south corridor
  [1, 10, 7, 17], // archives (west)
  [8, 13, 10, 14], // west corridor
  [22, 10, 28, 17], // reactor (east)
  [19, 13, 21, 14], // east corridor
  [14, 6, 15, 9], // north corridor
  [2, 5, 27, 6], // north hall
  [2, 1, 7, 4], // wiring room A
  [12, 1, 17, 4], // wiring room B
  [22, 1, 27, 4], // wiring room C
  [3, 7, 4, 9], // archives → hall
  [25, 7, 26, 9], // reactor → hall
];

export interface SitePlayer {
  pos: THREE.Vector3;
  yaw: number;
  pitch: number;
  flashlight: boolean;
  crouch: boolean;
  /** that player's lamp is in UV mode */
  uv: boolean;
  dead?: boolean;
}

/** Host → guest: what changed in Site B. */
export interface SiteNet {
  ph: string;
  hp: number;
  pt: number;
  dt: number;
  r: [boolean, boolean, boolean];
  card: boolean;
  cab: boolean[];
  ca: boolean;
  lv: boolean;
  ht: number;
  fu: boolean[];
  rel: boolean;
}

export interface SiteAction {
  msg?: string;
  shake?: number;
  ending?: 'LUCAS';
}

type Phase = 'wings' | 'ready' | 'boss' | 'down' | 'over';
type Mode = 'roam' | 'investigate' | 'chase' | 'search' | 'flee';

interface Spot {
  pos: THREE.Vector3;
  done: boolean;
  mesh?: THREE.Object3D;
  mat?: THREE.MeshStandardMaterial;
}

export class SiteB {
  public readonly start = new THREE.Vector3(OX + 14.5 * CELL, 1.72, OZ + 26 * CELL);
  public readonly startYaw = 0;
  public stalker: MonsterAI | null = null;
  public noteDrops: { item: GameItem; pos: THREE.Vector3 }[] = [];
  /** Purge flash (0..1): the engine adds it to the room light. */
  public flash = 0;
  /** UV mode of the flashlight. */
  public uv = false;
  public phase: Phase = 'wings';
  public hp = 100;
  /** Set when the run should end ('DESTROY' after the purge). */
  public ending: 'DESTROY' | null = null;
  public uvUsed = false;

  /** Co-op guest: the host runs the level, this one only mirrors it. */
  public guest = false;
  private r: () => number;
  /** Who holds the reactor lever (index in the players list). */
  private holder = 0;
  private floor = new Uint8Array(G * G);
  private root = new THREE.Group();
  private disposables: { dispose: () => void }[] = [];
  private ownLights: FlickerLight[] = [];
  private boxes: CollisionBox[] = [];

  // Tasks
  private cabinets: Spot[] = [];
  private cardIn = 0;
  private card = false;
  private consoleA!: Spot;
  private lever!: Spot;
  private holdT = 0;
  private holdNoise = 0;
  private fuses: Spot[] = [];
  private ramps = { a: false, b: false, c: false };
  private rampMats: THREE.MeshStandardMaterial[] = [];
  private rampLights: FlickerLight[] = [];
  private wingLights: Record<'a' | 'b' | 'c', FlickerLight[]> = { a: [], b: [], c: [] };
  private center = new THREE.Vector3(OX + 14.5 * CELL, 0, OZ + 13.5 * CELL);
  private consoleC!: Spot;
  private consoleScreen!: THREE.MeshStandardMaterial;
  private pulseT = 10;
  private warned = false;
  private downT = 0;
  private raged = false;

  // Creature
  private released = false;
  private releaseT: number;
  private mode: Mode = 'roam';
  private target = new THREE.Vector3();
  private path: THREE.Vector3[] = [];
  private pathT = 0;
  private lostT = 0;
  private fleeT = 0;
  private lingerT = 0;
  private stunT = 0;
  private roarCd = 0;
  private sizzleCd = 0;
  private uvTip = false;
  private seenTip = false;

  constructor(
    private map: MapData,
    private scene: THREE.Scene,
    private difficulty: number,
    private lowEnd: boolean,
    private toast: (msg: string) => void,
    private hasDocs: () => boolean,
    seed: number
  ) {
    this.r = rng(seed);
    for (const [x0, z0, x1, z1] of AREAS) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) this.floor[z * G + x] = 1;
    this.releaseT = [30, 25, 20, 16, 12][Math.max(0, Math.min(4, difficulty - 1))] ?? 20;
    this.buildShell();
    this.buildLights();
    this.buildStart();
    this.buildArchives();
    this.buildReactor();
    this.buildWiring();
    this.buildCenter();
    this.makeNotes();
    this.scene.add(this.root);
    this.map.collisionBoxes.push(...this.boxes);
    if (difficulty >= 2) this.spawnCreature();
  }

  // ---------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------
  private track<X extends { dispose: () => void }>(o: X) {
    this.disposables.push(o);
    return o;
  }
  private w(gx: number, gz: number, y = 0) {
    return new THREE.Vector3(OX + gx * CELL, y, OZ + gz * CELL);
  }
  private isFloor(gx: number, gz: number) {
    return gx >= 0 && gz >= 0 && gx < G && gz < G && this.floor[gz * G + gx] === 1;
  }
  private cellOf(p: THREE.Vector3): [number, number] {
    return [Math.round((p.x - OX) / CELL), Math.round((p.z - OZ) / CELL)];
  }
  private mat(color: number, rough = 0.7, metal = 0.2, extra: THREE.MeshStandardMaterialParameters = {}) {
    return this.track(new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra }));
  }
  private box(parent: THREE.Object3D, w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, solid = false) {
    const mesh = new THREE.Mesh(this.track(new THREE.BoxGeometry(w, h, d)), m);
    mesh.position.set(x, y, z);
    mesh.castShadow = !this.lowEnd;
    mesh.receiveShadow = true;
    parent.add(mesh);
    if (solid) this.boxes.push({ min: new THREE.Vector3(x - w / 2, 0, z - d / 2), max: new THREE.Vector3(x + w / 2, Math.max(1, y + h / 2), z + d / 2) });
    return mesh;
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
      baseEmissive: 2.2,
      nextFlicker: Math.random() * 2,
      flicker,
      needsPower: false,
    };
    this.map.lights.push(l);
    this.ownLights.push(l);
    return l;
  }

  // ---------------------------------------------------------------------
  // Level
  // ---------------------------------------------------------------------
  private buildShell() {
    const wallTex = Tex.getDirtyWallTexture().clone();
    wallTex.wrapS = wallTex.wrapT = THREE.RepeatWrapping;
    wallTex.repeat.set(1, 1.4);
    wallTex.needsUpdate = true;
    this.disposables.push(wallTex);
    const floorTex = Tex.getFloorTileTexture().clone();
    floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
    floorTex.repeat.set(G * CELL / 2.5, G * CELL / 2.5);
    floorTex.needsUpdate = true;
    this.disposables.push(floorTex);
    const ceilTex = Tex.getCeilingTexture().clone();
    ceilTex.wrapS = ceilTex.wrapT = THREE.RepeatWrapping;
    ceilTex.repeat.set(G * CELL / 3, G * CELL / 3);
    ceilTex.needsUpdate = true;
    this.disposables.push(ceilTex);
    const wallMat = this.mat(0xd0d4d0, 0.85, 0.05, { map: wallTex });
    const geo = this.track(new THREE.BoxGeometry(CELL, H, CELL).translate(0, H / 2, 0));
    const walls: THREE.Vector3[] = [];
    for (let gz = 0; gz < G; gz++)
      for (let gx = 0; gx < G; gx++) {
        if (this.isFloor(gx, gz)) continue;
        let near = false;
        for (let dz = -1; dz <= 1 && !near; dz++) for (let dx = -1; dx <= 1; dx++) if (this.isFloor(gx + dx, gz + dz)) near = true;
        if (!near) continue;
        const p = this.w(gx, gz);
        walls.push(p);
        this.boxes.push({ min: new THREE.Vector3(p.x - CELL / 2, 0, p.z - CELL / 2), max: new THREE.Vector3(p.x + CELL / 2, H, p.z + CELL / 2) });
      }
    const inst = new THREE.InstancedMesh(geo, wallMat, walls.length);
    const m4 = new THREE.Matrix4();
    walls.forEach((p, i) => inst.setMatrixAt(i, m4.makeTranslation(p.x, 0, p.z)));
    inst.receiveShadow = true;
    inst.computeBoundingSphere();
    this.disposables.push({ dispose: () => inst.dispose() });
    this.root.add(inst);
    const size = G * CELL;
    const mid = this.w((G - 1) / 2, (G - 1) / 2);
    const plane = this.track(new THREE.PlaneGeometry(size, size));
    const fl = new THREE.Mesh(plane, this.mat(0x8a8e8a, 0.55, 0.1, { map: floorTex }));
    fl.rotation.x = -Math.PI / 2;
    fl.position.set(mid.x, 0, mid.z);
    fl.receiveShadow = true;
    this.root.add(fl);
    const ce = new THREE.Mesh(plane, this.mat(0x6a6e70, 0.9, 0, { map: ceilTex }));
    ce.rotation.x = Math.PI / 2;
    ce.position.set(mid.x, H, mid.z);
    this.root.add(ce);
    // Yellow/black hazard stripes on the floor of the central chamber
    // (it glows a little: you must see where the purge strikes, even in the dark)
    const ring = new THREE.Mesh(
      this.track(new THREE.RingGeometry(8.4, 9, 48)),
      this.mat(0x8a7010, 0.6, 0.1, { polygonOffset: true, polygonOffsetFactor: -2, emissive: 0xffc020, emissiveIntensity: 0.35 })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(this.center).setY(0.02);
    this.root.add(ring);
  }

  /** Red emergency lights everywhere; a wing turns white when its ramp is on. */
  private buildLights() {
    const lampGeo = this.track(new THREE.BoxGeometry(0.5, 0.1, 0.25));
    const put = (gx: number, gz: number, wing: 'a' | 'b' | 'c' | null, color = 0xff4030, intensity = 7) => {
      const m = this.mat(0x221010, 0.5, 0, { emissive: color, emissiveIntensity: 2 });
      const lamp = new THREE.Mesh(lampGeo, m);
      const p = this.w(gx, gz, H - 0.06);
      lamp.position.copy(p);
      this.root.add(lamp);
      const l = this.light(p.clone().setY(H - 0.4), color, intensity, 15, m, true);
      if (wing) this.wingLights[wing].push(l);
    };
    put(14.5, 25.5, null, 0xd8e0ff, 7);
    put(14.5, 20.5, null);
    put(3, 12, 'a');
    put(6, 16, 'a');
    put(9, 13.5, 'a');
    put(24, 12, 'b');
    put(27, 16, 'b');
    put(20, 13.5, 'b');
    put(4.5, 2.5, 'c');
    put(14.5, 2.5, 'c');
    put(24.5, 2.5, 'c');
    put(9, 5.5, 'c');
    put(20, 5.5, 'c');
    put(14.5, 7.5, 'c');
    put(3.5, 8, 'a');
    put(25.5, 8, 'b');
    put(12, 11, null, 0xff4030, 5);
    put(17, 16, null, 0xff4030, 5);
    put(12, 16, null, 0xff4030, 5);
    put(17, 11, null, 0xff4030, 5);
  }

  /** The freight lift you came down in. */
  private buildStart() {
    const steel = this.mat(0x5a6066, 0.4, 0.8);
    const p = this.w(14.5, 27);
    for (const s of [-1, 1]) this.box(this.root, 1.5, 3.4, 0.15, steel, p.x + s * 0.78, 1.7, p.z + 1.3);
    this.box(this.root, 3.2, 0.6, 0.3, this.mat(0x2a2a2a, 0.6, 0.5), p.x, 3.7, p.z + 1.3);
    const lit = this.mat(0x200000, 0.5, 0, { emissive: 0xff2010, emissiveIntensity: 2 });
    this.box(this.root, 0.4, 0.15, 0.05, lit, p.x, 3.7, p.z + 1.12);
    // Crates
    this.box(this.root, 1.2, 1, 1.2, this.mat(0x5a4630, 0.9), p.x - 4, 0.5, p.z - 1, true);
    this.box(this.root, 1, 0.8, 1, this.mat(0x5a4630, 0.9), p.x - 4.2, 1.4, p.z - 1);
  }

  private buildArchives() {
    const metal = this.mat(0x4e5a52, 0.5, 0.6);
    const cells: [number, number][] = [
      [0.8, 11],
      [0.8, 14.5],
      [5, 17.3],
    ];
    this.cardIn = Math.floor(this.r() * 3);
    for (const [gx, gz] of cells) {
      const p = this.w(gx, gz);
      const m = this.box(this.root, 1.0, 2.0, 0.7, metal, p.x, 1.0, p.z, true);
      for (let k = 0; k < 4; k++) this.box(this.root, 0.9, 0.04, 0.02, this.mat(0x2a2a2a, 0.5, 0.5), p.x, 0.3 + k * 0.48, p.z + (gz > 16 ? -0.36 : 0.36));
      this.cabinets.push({ pos: p, done: false, mesh: m });
    }
    // Shelves of files
    for (let k = 0; k < 3; k++) {
      const sp = this.w(4.2, 11.8 + k * 2.2);
      this.box(this.root, 0.5, 2.4, 2.4, this.mat(0x5a4a34, 0.9), sp.x, 1.2, sp.z, true);
    }
    const scr = this.mat(0x101418, 0.3, 0.2, { emissive: 0xff3020, emissiveIntensity: 0.8 });
    const cp = this.w(6.5, 10.6);
    this.box(this.root, 1.4, 0.9, 0.7, this.mat(0x3a3e42, 0.5, 0.5), cp.x, 0.45, cp.z, true);
    this.box(this.root, 0.7, 0.45, 0.05, scr, cp.x, 1.2, cp.z - 0.2);
    this.consoleA = { pos: cp, done: false, mat: scr };
  }

  private buildReactor() {
    const p = this.w(25, 13.5);
    const core = this.mat(0x10202a, 0.2, 0.5, { emissive: 0x2a80ff, emissiveIntensity: 0.45 });
    const c = new THREE.Mesh(this.track(new THREE.CylinderGeometry(1.4, 1.4, H, 20)), core);
    c.position.set(p.x, H / 2, p.z);
    this.root.add(c);
    this.boxes.push({ min: new THREE.Vector3(p.x - 1.5, 0, p.z - 1.5), max: new THREE.Vector3(p.x + 1.5, H, p.z + 1.5) });
    for (const y of [0.6, 2.2, 3.8]) {
      const rim = new THREE.Mesh(this.track(new THREE.TorusGeometry(1.45, 0.08, 6, 24)), this.mat(0x3a3a3a, 0.4, 0.8));
      rim.rotation.x = Math.PI / 2;
      rim.position.set(p.x, y, p.z);
      this.root.add(rim);
    }
    this.light(new THREE.Vector3(p.x, 2.5, p.z + 2), 0x4a90ff, 3, 10, core, true);
    const lp = this.w(23, 16.8);
    this.box(this.root, 1.2, 1.6, 0.4, this.mat(0x4a4e52, 0.5, 0.6), lp.x, 0.8, lp.z + 0.3, true);
    const handleMat = this.mat(0xc01818, 0.4, 0.3, { emissive: 0x400000, emissiveIntensity: 0.6 });
    const handle = this.box(this.root, 0.12, 0.7, 0.12, handleMat, lp.x, 1.7, lp.z);
    this.lever = { pos: lp, done: false, mesh: handle, mat: handleMat };
  }

  private buildWiring() {
    for (const [gx, gz] of [
      [4.5, 0.75],
      [14.5, 0.75],
      [24.5, 0.75],
    ] as const) {
      const p = this.w(gx, gz);
      this.box(this.root, 1.0, 1.3, 0.3, this.mat(0x5a5e48, 0.6, 0.5), p.x, 1.5, p.z - 0.5);
      const led = this.mat(0x200000, 0.5, 0, { emissive: 0xff2010, emissiveIntensity: 2 });
      this.box(this.root, 0.12, 0.12, 0.04, led, p.x + 0.3, 1.9, p.z - 0.33);
      this.fuses.push({ pos: p, done: false, mat: led });
      // Cable bundles along the wall
      this.box(this.root, 4, 0.15, 0.15, this.mat(0x111111, 0.6, 0.2), p.x, 3.2, p.z - 0.55);
    }
  }

  private buildCenter() {
    const c = this.center;
    // Console on a pedestal
    const scr = this.mat(0x101418, 0.3, 0.2, { emissive: 0x7a40ff, emissiveIntensity: 0.3 });
    this.box(this.root, 1.6, 1.0, 1.0, this.mat(0x3a3e42, 0.5, 0.6), c.x, 0.5, c.z, true);
    this.box(this.root, 1.2, 0.5, 0.05, scr, c.x, 1.3, c.z - 0.35);
    this.consoleScreen = scr;
    this.consoleC = { pos: c.clone(), done: false };
    // Three UV ramps under the ceiling
    const spots = [new THREE.Vector3(-5, 0, -3), new THREE.Vector3(5, 0, -3), new THREE.Vector3(0, 0, 5)];
    for (const s of spots) {
      const m = this.mat(0x1a1020, 0.3, 0.3, { emissive: 0x9a50ff, emissiveIntensity: 0 });
      const bar = this.box(this.root, 4, 0.18, 0.4, m, c.x + s.x, H - 0.3, c.z + s.z);
      bar.castShadow = false;
      this.rampMats.push(m);
      const l = this.light(new THREE.Vector3(c.x + s.x, H - 0.8, c.z + s.z), 0xa060ff, 0, 20, m, false);
      l.baseEmissive = 0;
      this.rampLights.push(l);
    }
    // A cold work lamp above the console, always on (dim)
    const workMat = this.mat(0x202428, 0.4, 0.2, { emissive: 0xc8d8ff, emissiveIntensity: 1.5 });
    this.box(this.root, 0.8, 0.08, 0.3, workMat, c.x, H - 0.05, c.z).castShadow = false;
    this.light(new THREE.Vector3(c.x, H - 0.5, c.z), 0xb8c8ff, 5, 17, workMat, true);
    // Restraint chair in the middle, torn open
    const chairMat = this.mat(0x2a2a2a, 0.6, 0.5);
    this.box(this.root, 0.8, 0.1, 0.9, chairMat, c.x + 3, 0.6, c.z + 2.5, true);
    this.box(this.root, 0.8, 1.1, 0.1, chairMat, c.x + 3, 1.1, c.z + 2.95);
  }

  private makeNotes() {
    const at = (gx: number, gz: number) => this.w(gx, gz, 0.02);
    this.noteDrops = [
      {
        item: {
          id: 'note-b-dossier',
          name: 'Dossier S-00 — admission',
          type: 'note',
          description: 'Un dossier médical cartonné, tamponné CONFIDENTIEL.',
          lore:
            '« SUJET 00. Nom : MOREAU, Lucas. Âge à l\'admission : 12 ans. Responsable : Dr É. Moreau (père). Protocole AURORE, phase 1. Le sujet a accepté de « jouer au jeu du docteur ». Remarque manuscrite : il a demandé si sa mère viendrait le chercher. Je lui ai dit oui. »',
          icon: 'FileText',
        },
        pos: at(2.5, 16.5),
      },
      {
        item: {
          id: 'note-b-journal',
          name: 'Journal du Dr Moreau',
          type: 'note',
          description: 'Un cahier taché, coincé derrière la console du réacteur.',
          lore:
            '« Phase 6. Il ne parle plus. Il ne ressent plus la douleur, sauf sous les UV. Mais quand je l\'appelle par son prénom, il s\'arrête. Une seconde. Ses yeux changent. Il me reconnaît encore. J\'ai fait installer les rampes de purge au cas où. Je n\'aurai jamais le courage d\'appuyer. »',
          icon: 'FileText',
        },
        pos: at(27.5, 11),
      },
      {
        item: {
          id: 'note-b-dessin',
          name: 'Dessin d\'enfant',
          type: 'note',
          description: 'Une feuille pliée en quatre, dessinée au feutre.',
          lore:
            'Une maison, un arbre, deux bonshommes qui se tiennent la main. Au-dessus, en lettres maladroites : « PAPA ET MOI ». En dessous, écrit plus tard, d\'une main qui tremble : « je veux rentrer. appelle-moi lucas. pas zéro. »',
          icon: 'FileText',
        },
        pos: at(16.5, 3.5),
      },
    ];
  }

  public supplyDrops(): { item: GameItem; pos: THREE.Vector3 }[] {
    const r = this.r;
    let n = 0;
    const out: { item: GameItem; pos: THREE.Vector3 }[] = [];
    const supply = (type: 'battery' | 'food' | 'sedative' | 'medkit'): GameItem => {
      const id = `b5-${type}-${++n}`;
      if (type === 'battery') return { id, name: 'Pile', type, description: 'Recharge 55 % de la batterie. La lampe UV en dévore beaucoup.', icon: 'BatteryCharging' };
      if (type === 'food') return { id, name: 'Barre de céréales', type, description: 'Redonne 40 points d\'endurance.', icon: 'Cookie' };
      if (type === 'sedative') return { id, name: 'Seringue de Sédatif', type, description: 'Immobilise le Patient Zéro 5 secondes (à moins de 3 m, face à lui).', icon: 'Syringe' };
      return { id, name: 'Adrénaline', type, description: 'Auto-injecteur : endurance au maximum.', icon: 'HeartPulse' };
    };
    const kinds: ('battery' | 'food' | 'sedative' | 'medkit')[] = ['battery', 'battery', 'battery', 'battery', 'battery', 'battery', 'food', 'food', 'food', 'sedative', 'sedative', 'medkit'];
    const busy = (x: number, z: number) =>
      this.boxes.some((b) => x > b.min.x - 0.5 && x < b.max.x + 0.5 && z > b.min.z - 0.5 && z < b.max.z + 0.5);
    const free: THREE.Vector3[] = [];
    for (let gz = 0; gz < G; gz++)
      for (let gx = 0; gx < G; gx++) {
        if (!this.isFloor(gx, gz) || gz >= 24) continue;
        const p = this.w(gx, gz, 0.02).add(new THREE.Vector3((r() - 0.5) * 1.6, 0, (r() - 0.5) * 1.6));
        if (!busy(p.x, p.z) && p.distanceTo(this.center) > 3) free.push(p);
      }
    free.sort(() => r() - 0.5);
    const picked: THREE.Vector3[] = [];
    const take = () => {
      const p = free.find((f) => picked.every((q) => q.distanceTo(f) > 7));
      const q = p ?? free[0];
      if (!q) return this.start.clone().setY(0.02);
      picked.push(q);
      free.splice(free.indexOf(q), 1);
      return q;
    };
    // Two batteries in the lift room, for the UV lamp
    out.push({ item: supply('battery'), pos: this.w(13.4, 25, 0.02) });
    for (const k of kinds) out.push({ item: supply(k), pos: take() });
    for (let i = 0; i < 6; i++) {
      const q = 8 + Math.floor(r() * 12);
      out.push({ item: { id: `b5-coins-${++n}`, name: `${q} pièces`, type: 'coins', description: 'Gardées si vous sortez du Site B.', icon: 'Coins', quantity: q }, pos: take() });
    }
    return out;
  }

  // ---------------------------------------------------------------------
  // Grid navigation & sight
  // ---------------------------------------------------------------------
  private findPath(from: THREE.Vector3, to: THREE.Vector3): THREE.Vector3[] {
    const [sx, sz] = this.cellOf(from);
    let [tx, tz] = this.cellOf(to);
    if (!this.isFloor(tx, tz)) {
      // nearest floor cell
      let best: [number, number] | null = null;
      for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) if (this.isFloor(tx + dx, tz + dz) && (!best || Math.abs(dx) + Math.abs(dz) < Math.abs(best[0] - tx) + Math.abs(best[1] - tz))) best = [tx + dx, tz + dz];
      if (!best) return [];
      [tx, tz] = best;
    }
    const prev = new Int32Array(G * G).fill(-1);
    const start = sz * G + sx;
    if (start < 0 || start >= G * G) return [];
    prev[start] = start;
    const q = [start];
    const goal = tz * G + tx;
    for (let h = 0; h < q.length; h++) {
      const c = q[h];
      if (c === goal) break;
      const x = c % G;
      const z = Math.floor(c / G);
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = x + dx;
        const nz = z + dz;
        if (!this.isFloor(nx, nz)) continue;
        const n = nz * G + nx;
        if (prev[n] !== -1) continue;
        prev[n] = c;
        q.push(n);
      }
    }
    if (prev[goal] === -1) return [];
    const out: THREE.Vector3[] = [];
    for (let c = goal; c !== start; c = prev[c]) out.push(this.w(c % G, Math.floor(c / G)));
    out.reverse();
    if (out.length) out[out.length - 1] = to.clone().setY(0);
    return out;
  }

  private los(a: THREE.Vector3, b: THREE.Vector3) {
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    const n = Math.ceil(d / 0.6);
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const [gx, gz] = this.cellOf(new THREE.Vector3(a.x + (b.x - a.x) * t, 0, a.z + (b.z - a.z) * t));
      if (!this.isFloor(gx, gz)) return false;
    }
    return true;
  }

  // ---------------------------------------------------------------------
  // The creature
  // ---------------------------------------------------------------------
  private spawnCreature() {
    const m = new MonsterAI(new THREE.Vector3(OX, -50, OZ), this.map.navNodes, [], this.map.doors, () => {}, 0);
    m.mesh.visible = false;
    if (this.lowEnd) m.mesh.traverse((o) => (o.castShadow = false));
    this.stalker = m;
    this.scene.add(m.mesh);
  }

  /** Far from the player, in the level. */
  private release(pl: SitePlayer) {
    const s = this.stalker;
    if (!s || this.released) return;
    this.released = true;
    let best: THREE.Vector3 | null = null;
    let bd = -1;
    for (let gz = 0; gz < G; gz++)
      for (let gx = 0; gx < G; gx++) {
        if (!this.isFloor(gx, gz)) continue;
        const p = this.w(gx, gz);
        const d = Math.hypot(p.x - pl.pos.x, p.z - pl.pos.z) + this.r() * 6;
        if (d > bd && !this.los(p, pl.pos)) {
          bd = d;
          best = p;
        }
      }
    const p = best ?? this.center;
    s.placeAt(p.x, p.z);
    s.mesh.visible = true;
    this.mode = 'roam';
    this.path = [];
  }

  public hear(origin: THREE.Vector3, loudness: number) {
    const s = this.stalker;
    if (!s || !this.released || this.mode === 'chase' || this.mode === 'flee' || this.phase === 'boss' || this.phase === 'down') return;
    if (origin.distanceTo(s.position) > loudness * 2.4) return;
    this.mode = 'investigate';
    this.target.copy(origin).setY(0);
    this.path = [];
    this.lingerT = 3;
  }

  private speeds() {
    const i = Math.max(0, Math.min(4, this.difficulty - 1));
    return { walk: [1.9, 2.2, 2.45, 2.7, 2.9][i], run: [4.0, 4.5, 4.9, 5.2, 5.5][i] };
  }

  /** The UV beam is on it. */
  private burning(pl: SitePlayer) {
    const s = this.stalker!;
    if (!pl.uv || !pl.flashlight || pl.dead) return false;
    const dx = s.position.x - pl.pos.x;
    const dz = s.position.z - pl.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > 11 || d < 0.3) return false;
    const fx = -Math.sin(pl.yaw);
    const fz = -Math.cos(pl.yaw);
    const cos = (dx * fx + dz * fz) / d;
    return cos > Math.cos(0.32) && this.los(pl.pos, s.position);
  }

  private sees(pl: SitePlayer) {
    const s = this.stalker!;
    const d = Math.hypot(pl.pos.x - s.position.x, pl.pos.z - s.position.z);
    if (d < 2.5) return true;
    if (pl.dead) return false;
    let range = pl.flashlight ? (pl.uv ? 18 : 14) : 6;
    if (pl.crouch) range *= 0.6;
    if (this.mode === 'chase') range *= 1.4;
    return d < range && this.los(s.position, pl.pos);
  }

  private stun(sec: number) {
    const s = this.stalker!;
    s.stun(sec);
    this.stunT = sec;
  }

  private updateCreature(delta: number, pls: SitePlayer[], listener: Listener, onCatch: (i: number) => void, onRelease: () => void) {
    const s = this.stalker;
    if (!s) return;
    if (!this.released) {
      this.releaseT -= delta;
      if (this.releaseT <= 0 || this.phase === 'boss') {
        this.release(pls[0]);
        sound.playMonsterChaseRoar();
        onRelease();
      }
      return;
    }
    const sp = this.speeds();
    // Co-op: it goes for whoever it sees, else the nearest one
    const dist = (x: SitePlayer) => Math.hypot(x.pos.x - s.position.x, x.pos.z - s.position.z);
    const alive = pls.filter((x) => !x.dead).sort((a, b) => dist(a) - dist(b));
    if (!alive.length) {
      s.driveToward(s.position, 0, delta, [], listener, false);
      return;
    }
    const seenP = alive.find((x) => this.sees(x));
    const burnP = alive.find((x) => this.burning(x));
    const pl = this.phase === 'boss' ? alive[0] : (seenP ?? alive[0]);
    const dPlayer = dist(pl);
    const catchAny = () =>
      pls.forEach((x, i) => {
        if (!x.dead && dist(x) < 1.1) onCatch(i);
      });
    this.roarCd = Math.max(0, this.roarCd - delta);
    this.sizzleCd = Math.max(0, this.sizzleCd - delta);

    // Stunned (sedative, purge, or it fell)
    if (s.state === 'STUNNED') {
      if (this.stunT <= 0) this.stunT = 5;
      this.stunT -= delta;
      if (this.phase === 'down' || this.stunT > 0) {
        s.driveToward(s.position, 0, delta, [], listener, false);
        return;
      }
      this.stunT = 0;
      s.state = 'SEARCH';
      this.mode = this.phase === 'boss' ? 'chase' : 'search';
      this.target.copy(pl.pos).setY(0);
      this.path = [];
    }

    const burn = !!burnP;
    if (burn) {
      if (this.sizzleCd <= 0) {
        this.sizzleCd = 0.35;
        sound.playStatic(0.2, 0.06);
      }
      if (!this.uvTip) {
        this.uvTip = true;
        this.toast('La lumière UV le brûle ! Il recule… mais votre batterie fond à vue d\'œil.');
      }
    }

    // --- Boss: it knows where you are, the UV slows and hurts it ---
    if (this.phase === 'boss') {
      if (burn) {
        this.hp = Math.max(0, this.hp - delta * 4);
        if (this.roarCd <= 0) {
          this.roarCd = 2.5;
          sound.playMonsterGrowl(dPlayer, 0);
        }
      }
      this.mode = 'chase';
      this.target.copy(pl.pos).setY(0);
      // Burned up close it staggers on the spot; further away it only slows down
      const dBurn = burnP ? dist(burnP) : 99;
      const rage = this.hp < 50 ? 1.15 : 1;
      this.follow(delta, burn ? (dBurn < 5 ? 0 : sp.run * 0.3 * rage) : sp.run * 0.88 * rage, listener, true);
      catchAny();
      return;
    }

    // --- Before the purge: hide-and-seek in the wings ---
    if (burn && this.mode !== 'flee') {
      this.mode = 'flee';
      this.fleeT = 3;
      this.path = [];
      if (this.roarCd <= 0) {
        this.roarCd = 3;
        sound.playMonsterChaseRoar();
      }
    }
    const see = this.mode !== 'flee' && !!seenP;
    if (see) {
      if (this.mode !== 'chase' && !this.seenTip) {
        this.seenTip = true;
        this.toast('Il vous a vu ! Brûlez-le à la lampe UV [R] ou cassez la ligne de vue.');
      }
      if (this.mode !== 'chase') this.path = [];
      this.mode = 'chase';
      this.lostT = 0;
    }
    let speed = sp.walk;
    let chasing = false;
    switch (this.mode) {
      case 'flee': {
        this.fleeT -= delta;
        speed = sp.run;
        if (!this.path.length) {
          // A cell away from the player
          const [cx, cz] = this.cellOf(s.position);
          let best: THREE.Vector3 | null = null;
          let bd = -1;
          for (let dz = -6; dz <= 6; dz++)
            for (let dx = -6; dx <= 6; dx++) {
              if (!this.isFloor(cx + dx, cz + dz)) continue;
              const p = this.w(cx + dx, cz + dz);
              const from = burnP ?? pl;
              const d = Math.hypot(p.x - from.pos.x, p.z - from.pos.z);
              if (d > bd) {
                bd = d;
                best = p;
              }
            }
          if (best) this.target.copy(best);
          this.path = this.findPath(s.position, this.target);
        }
        if (this.fleeT <= 0) {
          this.mode = 'roam';
          this.path = [];
        }
        break;
      }
      case 'chase':
        chasing = true;
        speed = sp.run;
        if (see) this.target.copy(pl.pos).setY(0);
        else {
          this.lostT += delta;
          if (this.lostT > 4) {
            this.mode = 'search';
            this.lingerT = 4;
            this.target.set(pl.pos.x + (Math.random() - 0.5) * 8, 0, pl.pos.z + (Math.random() - 0.5) * 8);
            this.path = [];
          }
        }
        break;
      case 'investigate':
      case 'search':
        speed = sp.walk * 1.4;
        if (Math.hypot(this.target.x - s.position.x, this.target.z - s.position.z) < 1.4) {
          speed = 0;
          this.lingerT -= delta;
          if (this.lingerT <= 0) {
            this.mode = 'roam';
            this.path = [];
          }
        }
        break;
      default:
        if (!this.path.length || Math.hypot(this.target.x - s.position.x, this.target.z - s.position.z) < 1.5) {
          // Somewhere not too far from the player
          const [px, pz] = this.cellOf(pl.pos);
          for (let k = 0; k < 20; k++) {
            const gx = px + Math.round((Math.random() - 0.5) * 16);
            const gz = pz + Math.round((Math.random() - 0.5) * 16);
            if (this.isFloor(gx, gz)) {
              this.target.copy(this.w(gx, gz));
              break;
            }
          }
          this.path = [];
        }
    }
    this.follow(delta, speed, listener, chasing);
    catchAny();
  }

  /** Walk along the grid path toward `target` (re-planned now and then). */
  private follow(delta: number, speed: number, listener: Listener, chasing: boolean) {
    const s = this.stalker!;
    this.pathT -= delta;
    if (this.pathT <= 0 || !this.path.length) {
      this.pathT = chasing ? 0.35 : 1;
      this.path = this.findPath(s.position, this.target);
    }
    while (this.path.length > 1 && Math.hypot(this.path[0].x - s.position.x, this.path[0].z - s.position.z) < 0.6) this.path.shift();
    const next = this.path[0] ?? this.target;
    s.driveToward(next, speed, delta, [], listener, chasing);
  }

  // ---------------------------------------------------------------------
  // Per frame
  // ---------------------------------------------------------------------
  /** Host / solo: everything. `pls[0]` is the local player, `pls[1]` the co-op partner. */
  public update(delta: number, pls: SitePlayer[], listener: Listener, onCatch: (i: number) => void, onRelease: () => void) {
    this.visuals(delta);
    const pl = pls[this.holder] ?? pls[0];
    // Lever held: 10 s of overload, don't step away
    if (this.holdT > 0) {
      this.holdT -= delta;
      this.holdNoise -= delta;
      if (this.holdNoise <= 0) {
        this.holdNoise = 2;
        sound.playAlarmRing(Math.max(1, pl.pos.distanceTo(this.lever.pos)));
        this.hear(this.lever.pos, 30);
      }
      if (Math.hypot(this.lever.pos.x - pl.pos.x, this.lever.pos.z - pl.pos.z) > 3.2) {
        this.holdT = 0;
        this.toast('Vous avez lâché le levier : la surcharge retombe. Il faut le tenir 10 s.');
      } else if (this.holdT <= 0) {
        this.lever.done = true;
        this.lever.mat!.emissive.set(0x20ff40);
        this.rampOn('b');
      }
    }

    if (this.phase === 'boss') this.updateBoss(delta, pls[0]);
    if (this.phase === 'down') {
      this.downT -= delta;
      if (this.downT <= 0) this.finalPurge();
    }
    this.updateCreature(delta, pls, listener, onCatch, onRelease);
  }

  /** Co-op guest: only what you see and hear; the state comes from the host. */
  public mirror(delta: number) {
    if (this.holdT > 0) this.holdT = Math.max(0, this.holdT - delta);
    if (this.phase === 'boss') this.pulseT = Math.max(0, this.pulseT - delta);
    if (this.phase === 'down') this.downT = Math.max(0, this.downT - delta);
    this.visuals(delta);
  }

  private visuals(delta: number) {
    // Final fight music (faster and harsher once it is enraged)
    sound.setBossMusic(this.phase === 'boss', 1.5, this.hp < 50);
    this.flash = Math.max(0, this.flash - delta * 2.5);
    this.lever.mesh!.rotation.x = this.holdT > 0 || this.lever.done ? -0.9 : 0;
    // Ramp bars pulse once charged
    const k = 0.5 + 0.5 * Math.sin(performance.now() / 300);
    this.rampMats.forEach((m, i) => {
      const on = [this.ramps.a, this.ramps.b, this.ramps.c][i];
      if (on) m.emissiveIntensity = this.phase === 'boss' && this.pulseT < 1.6 ? 2 + k * 6 : 2.2 + this.flash * 4;
    });
  }

  public netState(): SiteNet {
    const r1 = (v: number) => Math.round(v * 10) / 10;
    return {
      ph: this.phase,
      hp: r1(this.hp),
      pt: r1(this.pulseT),
      dt: r1(this.downT),
      r: [this.ramps.a, this.ramps.b, this.ramps.c],
      card: this.card,
      cab: this.cabinets.map((c) => c.done),
      ca: this.consoleA.done,
      lv: this.lever.done,
      ht: r1(this.holdT),
      fu: this.fuses.map((f) => f.done),
      rel: this.released,
    };
  }

  public netApply(n: SiteNet) {
    const was = this.phase;
    const oldPulse = this.pulseT;
    n.cab.forEach((d, i) => {
      const c = this.cabinets[i];
      if (c && d && !c.done) {
        c.done = true;
        sound.playDrawerOpen();
      }
    });
    this.card = n.card;
    if (n.ca && !this.consoleA.done) {
      this.consoleA.done = true;
      this.consoleA.mat!.emissive.set(0x30ff60);
    }
    if (n.lv && !this.lever.done) {
      this.lever.done = true;
      this.lever.mat!.emissive.set(0x20ff40);
    }
    this.holdT = n.ht;
    n.fu.forEach((d, i) => {
      const f = this.fuses[i];
      if (f && d && !f.done) {
        f.done = true;
        f.mat!.emissive.set(0x20ff40);
        sound.playBreakerClunk();
      }
    });
    (['a', 'b', 'c'] as const).forEach((w, i) => {
      if (n.r[i] && !this.ramps[w]) this.rampOn(w);
    });
    this.phase = n.ph as Phase;
    this.hp = n.hp;
    this.pulseT = n.pt;
    this.downT = n.dt;
    if (this.phase === 'boss' && was !== 'boss') {
      this.consoleScreen.emissive.set(0xff3020);
      sound.playAlarmRing(1);
    }
    // A purge went off (the countdown jumped back up)
    if ((this.phase === 'boss' || this.phase === 'down') && this.pulseT > oldPulse + 4) {
      this.flash = 1;
      sound.playPowerUp();
      sound.playThunder(0, 0.5);
    }
    if (this.phase === 'over' && was !== 'over') {
      this.flash = 1;
      sound.playPowerUp();
    }
    if (n.rel && !this.released && this.stalker) {
      this.released = true;
      this.stalker.mesh.visible = true;
    }
  }

  private rampOn(w: 'a' | 'b' | 'c') {
    if (this.ramps[w]) return;
    this.ramps[w] = true;
    const i = w === 'a' ? 0 : w === 'b' ? 1 : 2;
    this.rampMats[i].emissiveIntensity = 2.2;
    this.rampLights[i].baseIntensity = 13;
    this.rampLights[i].baseEmissive = 2.2;
    for (const l of this.wingLights[w]) {
      l.color.set(0xe0e8ff);
      l.fixtureMat.emissive.set(0xe0e8ff);
      l.baseIntensity = 8;
      l.flicker = false;
    }
    sound.playPowerUp();
    sound.playBreakerClunk();
    const n = Number(this.ramps.a) + Number(this.ramps.b) + Number(this.ramps.c);
    if (n >= 3) {
      this.phase = 'ready';
      this.consoleScreen.emissiveIntensity = 2.5;
      if (!this.guest) this.toast('Les 3 rampes UV sont chargées ! Allez à la console de la salle centrale pour lancer la purge.');
    } else if (!this.guest) this.toast(`Rampe UV ${n}/3 chargée. Une lumière violette s\'allume dans la salle centrale.`);
  }

  private updateBoss(delta: number, pl: SitePlayer) {
    const s = this.stalker;
    this.pulseT -= delta;
    if (this.pulseT < 1.6 && !this.warned) {
      this.warned = true;
      sound.playAlarmRing(2);
    }
    if (this.pulseT <= 0) {
      this.pulseT = 10;
      this.warned = false;
      this.flash = 1;
      sound.playPowerUp();
      sound.playThunder(0, 0.5);
      if (s && s.position.distanceTo(this.center) < 9 && s.state !== 'STUNNED') {
        this.hp = Math.max(0, this.hp - 25);
        this.stun(2.5);
        sound.playMonsterChaseRoar();
        this.toast(this.hp > 0 ? `La purge le frappe de plein fouet ! (${Math.round(this.hp)} %)` : 'La purge le frappe de plein fouet !');
      } else if (s) this.toast('Raté : il était hors du cercle. Attirez-le sous les rampes !');
    }
    if (!s && this.pulseT === 10) this.hp = Math.max(0, this.hp - 34);
    // Half dead: it goes berserk
    if (this.hp < 50 && this.hp > 0 && !this.raged) {
      this.raged = true;
      this.flash = 0.8;
      sound.playMonsterChaseRoar();
      sound.playDistantSlam(0);
      this.toast('Il hurle et se redresse, fou de rage ! Il est plus rapide… tenez bon, encore deux purges.');
    }
    if (this.hp <= 0) {
      this.phase = 'down';
      if (s) this.stun(999);
      const talk = this.hasDocs() && !!s;
      this.downT = talk ? 12 : 3;
      sound.playMonsterGrowl(Math.max(1, s ? s.position.distanceTo(pl.pos) : 5), 0);
      this.toast(
        talk
          ? 'Il s\'effondre et vous regarde… Approchez-vous et appelez-le par son nom [E] — ou laissez la purge finir.'
          : 'Il s\'effondre sous la lumière violette… La dernière purge se charge.'
      );
    }
  }

  private finalPurge() {
    this.phase = 'over';
    this.flash = 1;
    sound.playPowerUp();
    sound.playThunder(0, 1);
    sound.playMonsterChaseRoar();
    if (this.stalker) this.stalker.mesh.visible = false;
    this.ending = 'DESTROY';
  }

  // ---------------------------------------------------------------------
  // Interaction
  // ---------------------------------------------------------------------
  private near(p: THREE.Vector3, q: THREE.Vector3, d: number) {
    return Math.hypot(p.x - q.x, p.z - q.z) < d;
  }
  private nearCreature(p: THREE.Vector3) {
    return !!this.stalker && this.near(p, this.stalker.position, 3.2);
  }

  public hint(p: THREE.Vector3): string | null {
    if (this.phase === 'down' && this.hasDocs() && this.nearCreature(p)) return '[E] Appeler « Lucas »';
    const cab = this.cabinets.find((c) => !c.done && this.near(p, c.pos, 1.7));
    if (cab) return '[E] Fouiller l\'armoire à dossiers';
    if (!this.consoleA.done && this.near(p, this.consoleA.pos, 1.8)) return this.card ? '[E] Insérer la carte d\'accès — rampe UV ouest' : 'Console des archives — carte d\'accès requise';
    if (!this.lever.done && this.near(p, this.lever.pos, 1.8)) return this.holdT > 0 ? `Tenez la position… ${Math.ceil(this.holdT)} s` : '[E] Abaisser le levier de surcharge (10 s, bruyant)';
    const f = this.fuses.find((x) => !x.done && this.near(p, x.pos, 1.8));
    if (f) return '[E] Réarmer le disjoncteur';
    if (this.near(p, this.consoleC.pos, 2)) {
      if (this.phase === 'ready') return '[E] LANCER LA PURGE UV (combat final)';
      if (this.phase === 'wings') return 'Console de purge — les 3 rampes UV doivent être chargées';
    }
    return null;
  }

  /** `who`: 0 = the local player, 1 = the co-op partner (host side). */
  public interact(p: THREE.Vector3, who = 0): SiteAction | null {
    if (this.phase === 'down' && this.hasDocs() && this.nearCreature(p)) {
      this.phase = 'over';
      return { ending: 'LUCAS' };
    }
    const cab = this.cabinets.find((c) => !c.done && this.near(p, c.pos, 1.7));
    if (cab) {
      cab.done = true;
      sound.playDrawerOpen();
      if (this.cabinets.indexOf(cab) === this.cardIn) {
        this.card = true;
        sound.playItemPickup();
        return { msg: 'Une carte d\'accès magnétique « S-B / ARCHIVES » ! La console des archives est près de l\'entrée.' };
      }
      return { msg: 'Des dossiers moisis… rien d\'utile ici.' };
    }
    if (!this.consoleA.done && this.near(p, this.consoleA.pos, 1.8)) {
      if (!this.card) return { msg: 'ACCÈS REFUSÉ. Il faut une carte d\'accès — fouillez les armoires des archives.' };
      this.consoleA.done = true;
      this.consoleA.mat!.emissive.set(0x30ff60);
      this.rampOn('a');
      return { shake: 0.2 };
    }
    if (!this.lever.done && this.near(p, this.lever.pos, 1.8)) {
      if (this.holdT > 0) return null;
      this.holdT = 10;
      this.holder = who;
      this.holdNoise = 0;
      sound.playBreakerClunk();
      return { msg: 'Surcharge lancée ! Restez près du levier 10 secondes… l\'alarme résonne partout.', shake: 0.3 };
    }
    const f = this.fuses.find((x) => !x.done && this.near(p, x.pos, 1.8));
    if (f) {
      f.done = true;
      f.mat!.emissive.set(0x20ff40);
      sound.playBreakerClunk();
      this.hear(f.pos, 12);
      const n = this.fuses.filter((x) => x.done).length;
      if (n >= 3) this.rampOn('c');
      else return { msg: `Disjoncteur réarmé (${n}/3).` };
      return { shake: 0.2 };
    }
    if (this.phase === 'ready' && this.near(p, this.consoleC.pos, 2)) {
      this.phase = 'boss';
      this.pulseT = 10;
      this.consoleScreen.emissive.set(0xff3020);
      sound.playAlarmRing(1);
      sound.playMonsterChaseRoar();
      return {
        msg: this.stalker
          ? 'PURGE ARMÉE. Une décharge toutes les 10 s dans le cercle jaune. Il arrive — gardez-le sous les rampes ! [R] lampe UV.'
          : 'PURGE ARMÉE. Les décharges vont nettoyer la salle (Exploration : il ne viendra pas).',
        shake: 0.6,
      };
    }
    return null;
  }

  /** [R]: switch the flashlight between white and UV. */
  public toggleUV(): boolean {
    this.uv = !this.uv;
    if (this.uv) this.uvUsed = true;
    return this.uv;
  }

  public objective(): string {
    const uvTag = '[R] lampe UV' + (this.uv ? ' (ON)' : '');
    if (this.phase === 'boss') {
      const bars = Math.ceil(this.hp / 10);
      return `PATIENT ZÉRO ${'█'.repeat(bars)}${'░'.repeat(10 - bars)} ${Math.ceil(this.hp)} % — gardez-le dans le cercle · purge dans ${Math.max(0, Math.ceil(this.pulseT))} s · ${uvTag}`;
    }
    if (this.phase === 'down' || this.phase === 'over')
      return this.hasDocs() ? `Il ne bouge plus… appelez-le par son nom [E] (${Math.max(0, Math.ceil(this.downT))} s)` : 'La dernière purge se charge…';
    if (this.phase === 'ready') return `Rampes UV 3/3 — lancez la purge à la console centrale · ${uvTag}`;
    const ok = (b: boolean) => (b ? '✓' : '✗');
    const fus = this.fuses.filter((f) => f.done).length;
    const n = Number(this.ramps.a) + Number(this.ramps.b) + Number(this.ramps.c);
    const a = this.ramps.a ? '✓' : this.card ? 'carte ✓ → console' : 'carte ?';
    const b = this.lever.done ? '✓' : this.holdT > 0 ? `levier ${Math.ceil(this.holdT)} s` : ok(false);
    const c = this.ramps.c ? '✓' : `${fus}/3`;
    return `Rampes UV ${n}/3 — Archives (ouest) ${a} · Réacteur (est) ${b} · Câblage (nord) ${c} · ${uvTag}`;
  }

  public dispose() {
    const mine = new Set(this.boxes);
    this.map.collisionBoxes = this.map.collisionBoxes.filter((b) => !mine.has(b));
    const own = new Set(this.ownLights);
    this.map.lights = this.map.lights.filter((l) => !own.has(l));
    this.scene.remove(this.root);
    sound.setBossMusic(false, 0.5);
    this.stalker = null;
    this.disposables.forEach((d) => d.dispose());
  }
}
