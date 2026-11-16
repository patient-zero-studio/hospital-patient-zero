import * as THREE from 'three';
import type { CollisionBox, MapData } from './MapBuilder';
import { MonsterAI, Listener } from './MonsterAI';
import { sound } from '../audio/SoundSystem';
import { GameItem } from '../types';
import type { SiteAction, SitePlayer } from './SiteB';

/**
 * CHAPTER 6 — LE TOIT (epilogue)
 * The roof of Saint-Aurore in a storm. Repair the 3 radio relays, light the
 * helipad beacon, then hold on until the helicopter lands. The rain hides
 * you… until the lightning shows the creature exactly where you are — and
 * shows you to it. Two documents tell what happened to the rescue team.
 */
const OX = 800;
const OZ = 0;
const CELL = 2;
const GX = 34;
const GZ = 24;
const WALL = 1.15;

type Phase = 'relays' | 'beacon' | 'wait' | 'board';
type Mode = 'roam' | 'investigate' | 'chase' | 'search';

export interface RoofNet {
  ph: Phase;
  rel: boolean[];
  wt: number;
  fl: number;
}

const RECTS: [number, number, number, number, string][] = [
  // [gx0, gz0, gx1, gz1, kind]  (inclusive cells)
  [1, 9, 3, 14, 'stairs'],
  [9, 3, 10, 4, 'tank'],
  [9, 19, 10, 20, 'tank'],
  [14, 6, 16, 7, 'ac'],
  [14, 16, 16, 17, 'ac'],
  [21, 2, 22, 3, 'ac'],
  [21, 20, 22, 21, 'ac'],
  [7, 11, 7, 11, 'vent'],
  [18, 12, 18, 12, 'vent'],
  [25, 11, 25, 11, 'vent'],
  [11, 11, 12, 12, 'glass'],
  [20, 9, 21, 10, 'glass'],
  [27, 17, 28, 18, 'mast'],
];

export class Rooftop {
  public readonly start = new THREE.Vector3(0, 1.72, 0);
  public readonly startYaw = -Math.PI / 2;
  public stalker: MonsterAI | null = null;
  public noteDrops: { item: GameItem; pos: THREE.Vector3 }[] = [];
  /** lightning (0..1), read by the engine for the sky light */
  public flash = 0;
  /** no UV lamp up here */
  public uv = false;
  public guest = false;
  public ending: 'ROOFTOP' | null = null;
  public phase: Phase = 'relays';

  private root = new THREE.Group();
  private boxes: CollisionBox[] = [];
  private blocked = new Uint8Array(GX * GZ);
  private disposables: { dispose: () => void }[] = [];
  private r: () => number;
  private relays: { pos: THREE.Vector3; done: boolean; led: THREE.MeshStandardMaterial }[] = [];
  private panel!: { pos: THREE.Vector3; led: THREE.MeshStandardMaterial };
  private pad = new THREE.Vector3();
  private beacons: THREE.MeshStandardMaterial[] = [];
  private repairT = 0;
  private repairing = -1;
  private waitT = 0;
  private waitTotal = 75;
  private boltT = 8;
  private heli = new THREE.Group();
  private rotor!: THREE.Mesh;
  private heliLight!: THREE.SpotLight;
  private rain!: THREE.Points;
  // creature
  private released = false;
  private releaseT = 30;
  private mode: Mode = 'roam';
  private target = new THREE.Vector3();
  private path: THREE.Vector3[] = [];
  private pathT = 0;
  private lostT = 0;
  private searchT = 0;
  private roarCd = 0;
  private seenTip = false;

  constructor(
    private map: MapData,
    private scene: THREE.Scene,
    private difficulty: number,
    private lowEnd: boolean,
    private toast: (msg: string) => void,
    seed: number
  ) {
    let s = Math.max(1, Math.floor(seed * 2147483646));
    this.r = () => {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    };
    this.waitTotal = [60, 60, 70, 80, 90, 100][difficulty] ?? 75;
    this.releaseT = difficulty >= 4 ? 18 : 30;
    this.start.copy(this.w(5, 11.5, 1.72));
    this.build();
    this.makeNotes();
    if (difficulty >= 2) this.spawnCreature();
    sound.setLoop('rain', 0.7);
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
    const n = Math.ceil(d / 0.6);
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const [gx, gz] = this.cellOf(new THREE.Vector3(a.x + (b.x - a.x) * t, 0, a.z + (b.z - a.z) * t));
      if (!this.isFloor(gx, gz)) return false;
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

  // ---------------------------------------------------------------------
  // Building the roof
  // ---------------------------------------------------------------------
  private t<T extends { dispose: () => void }>(o: T) {
    this.disposables.push(o);
    return o;
  }
  private mat(color: number, opts: THREE.MeshStandardMaterialParameters = {}) {
    return this.t(new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...opts }));
  }
  private mesh(geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number) {
    const o = new THREE.Mesh(this.t(geo), m);
    o.position.set(x, y, z);
    o.castShadow = !this.lowEnd;
    o.receiveShadow = true;
    this.root.add(o);
    return o;
  }
  private box(x0: number, z0: number, x1: number, z1: number, h = 3) {
    const b: CollisionBox = { min: new THREE.Vector3(x0, 0, z0), max: new THREE.Vector3(x1, h, z1) };
    this.boxes.push(b);
  }

  private build() {
    const W = GX * CELL;
    const D = GZ * CELL;
    // Wet tar roof (a little shiny), gravel border
    const tar = this.mat(0x202224, { roughness: 0.35, metalness: 0.1 });
    const floor = this.mesh(new THREE.PlaneGeometry(W, D), tar, OX, 0, OZ);
    floor.rotation.x = -Math.PI / 2;
    floor.castShadow = false;
    // Puddles reflecting the lightning
    const puddle = this.mat(0x0b0d10, { roughness: 0.05, metalness: 0.6 });
    for (let i = 0; i < 14; i++) {
      const p = this.mesh(new THREE.CircleGeometry(0.6 + this.r() * 1.2, 18), puddle, OX + (this.r() - 0.5) * (W - 6), 0.01, OZ + (this.r() - 0.5) * (D - 6));
      p.rotation.x = -Math.PI / 2;
      p.scale.y = 0.6 + this.r() * 0.6;
      p.castShadow = false;
    }
    // Parapet all around (you can't fall… or jump)
    const concrete = this.mat(0x5a5d5f, { roughness: 0.95 });
    const t = 0.4;
    for (const [x, z, w, d] of [
      [OX, OZ - D / 2 - t / 2, W + 2 * t, t],
      [OX, OZ + D / 2 + t / 2, W + 2 * t, t],
      [OX - W / 2 - t / 2, OZ, t, D],
      [OX + W / 2 + t / 2, OZ, t, D],
    ] as const) {
      this.mesh(new THREE.BoxGeometry(w, WALL, d), concrete, x, WALL / 2, z);
      this.box(x - w / 2, z - d / 2, x + w / 2, z + d / 2);
    }
    // City lights far below, through the rain
    const cityMat = this.t(new THREE.PointsMaterial({ color: 0xffc070, size: 0.6, sizeAttenuation: true, transparent: true, opacity: 0.7 }));
    const N = 500;
    const arr = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const a = this.r() * Math.PI * 2;
      const rr = 90 + this.r() * 160;
      arr[i * 3] = OX + Math.cos(a) * rr;
      arr[i * 3 + 1] = -30 - this.r() * 10;
      arr[i * 3 + 2] = OZ + Math.sin(a) * rr;
    }
    const cg = this.t(new THREE.BufferGeometry());
    cg.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    this.root.add(new THREE.Points(cg, cityMat));

    // Obstacles
    const metal = this.mat(0x6e767c, { roughness: 0.5, metalness: 0.6 });
    const rust = this.mat(0x6a4630, { roughness: 0.8, metalness: 0.3 });
    const glass = this.t(new THREE.MeshPhysicalMaterial({ color: 0x6a8a9a, roughness: 0.05, transparent: true, opacity: 0.45 }));
    const brick = this.mat(0x4a3a34, { roughness: 1 });
    for (const [gx0, gz0, gx1, gz1, kind] of RECTS) {
      for (let gz = gz0; gz <= gz1; gz++) for (let gx = gx0; gx <= gx1; gx++) this.blocked[gz * GX + gx] = 1;
      const a = this.w(gx0, gz0);
      const b = this.w(gx1, gz1);
      const cx = (a.x + b.x) / 2;
      const cz = (a.z + b.z) / 2;
      const w = (gx1 - gx0 + 1) * CELL;
      const d = (gz1 - gz0 + 1) * CELL;
      this.box(cx - w / 2 + 0.1, cz - d / 2 + 0.1, cx + w / 2 - 0.1, cz + d / 2 - 0.1);
      if (kind === 'stairs') {
        // The stair housing you came out of, with its open door
        this.mesh(new THREE.BoxGeometry(w - 0.2, 3.2, d - 0.2), brick, cx, 1.6, cz);
        this.mesh(new THREE.BoxGeometry(0.1, 2.2, 1.3), this.mat(0x111111), cx + w / 2 - 0.05, 1.1, this.w(0, 11.5).z);
        const lamp = this.mesh(new THREE.SphereGeometry(0.12, 10, 8), this.mat(0xffe0a0, { emissive: 0xffc060, emissiveIntensity: 2 }), cx + w / 2 + 0.1, 2.6, this.w(0, 11.5).z);
        lamp.castShadow = false;
      } else if (kind === 'tank') {
        this.mesh(new THREE.CylinderGeometry(w / 2 - 0.2, w / 2 - 0.2, 3.4, 20), rust, cx, 2.2, cz);
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) this.mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.6, 6), metal, cx + sx * (w / 2 - 0.5), 0.3, cz + sz * (d / 2 - 0.5));
      } else if (kind === 'ac') {
        this.mesh(new THREE.BoxGeometry(w - 0.3, 1.6, d - 0.3), metal, cx, 0.8, cz);
        for (let i = 0; i < 2; i++) {
          const fan = this.mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.06, 18), this.mat(0x222222, { metalness: 0.5 }), cx - w / 4 + i * (w / 2), 1.63, cz);
          fan.castShadow = false;
        }
      } else if (kind === 'vent') {
        this.mesh(new THREE.CylinderGeometry(0.5, 0.6, 1.8, 12), metal, cx, 0.9, cz);
        this.mesh(new THREE.ConeGeometry(0.8, 0.5, 12), metal, cx, 2.0, cz);
      } else if (kind === 'glass') {
        this.mesh(new THREE.BoxGeometry(w - 0.3, 0.5, d - 0.3), metal, cx, 0.25, cz);
        const roof = this.mesh(new THREE.BoxGeometry(w - 0.4, 0.05, d - 0.4), glass, cx, 0.75, cz);
        roof.rotation.z = 0.25;
      } else if (kind === 'mast') {
        // Radio mast with a blinking red light at the top
        this.mesh(new THREE.BoxGeometry(w - 0.6, 0.4, d - 0.6), concrete, cx, 0.2, cz);
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
          const leg = this.mesh(new THREE.CylinderGeometry(0.06, 0.06, 14, 6), metal, cx + sx * 0.6, 7, cz + sz * 0.6);
          leg.rotation.z = -sx * 0.035;
          leg.rotation.x = sz * 0.035;
        }
        this.mesh(new THREE.SphereGeometry(0.2, 10, 8), this.mat(0xff2020, { emissive: 0xff0000, emissiveIntensity: 3 }), cx, 14.2, cz).castShadow = false;
      }
    }

    // Helipad (open area on the east side)
    this.pad.copy(this.w(29, 6));
    const padTex = (() => {
      const c = document.createElement('canvas');
      c.width = c.height = 256;
      const g = c.getContext('2d')!;
      g.fillStyle = '#2a2d2f';
      g.fillRect(0, 0, 256, 256);
      g.strokeStyle = '#e8e2c8';
      g.lineWidth = 10;
      g.beginPath();
      g.arc(128, 128, 112, 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = '#e8e2c8';
      g.font = 'bold 150px sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('H', 128, 136);
      const tx = new THREE.CanvasTexture(c);
      tx.colorSpace = THREE.SRGBColorSpace;
      return this.t(tx);
    })();
    const pad = this.mesh(new THREE.CircleGeometry(5, 40), this.mat(0xffffff, { map: padTex, roughness: 0.4 }), this.pad.x, 0.02, this.pad.z);
    pad.rotation.x = -Math.PI / 2;
    pad.castShadow = false;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const m = this.mat(0x402000, { emissive: 0xff8a00, emissiveIntensity: 0 });
      this.beacons.push(m);
      this.mesh(new THREE.SphereGeometry(0.15, 10, 8), m, this.pad.x + Math.cos(a) * 5.4, 0.15, this.pad.z + Math.sin(a) * 5.4).castShadow = false;
    }

    // Radio relays (repair them) and the beacon control panel
    const relayCells: [number, number][] = [
      [27, 20],
      [8, 21],
      [21, 1],
    ];
    for (const [gx, gz] of relayCells) {
      const p = this.w(gx, gz);
      this.mesh(new THREE.BoxGeometry(0.7, 1.2, 0.5), this.mat(0x8a8f6a, { roughness: 0.6, metalness: 0.4 }), p.x, 0.6, p.z);
      const led = this.mat(0x300000, { emissive: 0xff1a1a, emissiveIntensity: 2 });
      this.mesh(new THREE.SphereGeometry(0.07, 8, 6), led, p.x, 1.28, p.z).castShadow = false;
      this.relays.push({ pos: p, done: false, led });
      this.box(p.x - 0.4, p.z - 0.3, p.x + 0.4, p.z + 0.3, 1.2);
    }
    const pp = this.w(25, 4);
    this.mesh(new THREE.BoxGeometry(0.9, 1.3, 0.4), this.mat(0x2a3a5a, { metalness: 0.5, roughness: 0.4 }), pp.x, 0.65, pp.z);
    const pled = this.mat(0x101010, { emissive: 0x404040, emissiveIntensity: 1 });
    this.mesh(new THREE.BoxGeometry(0.5, 0.25, 0.05), pled, pp.x, 1.05, pp.z + 0.22).castShadow = false;
    this.panel = { pos: pp, led: pled };
    this.box(pp.x - 0.5, pp.z - 0.25, pp.x + 0.5, pp.z + 0.25, 1.3);

    // Helicopter (comes at the end)
    const hb = this.mat(0x2a3a2a, { metalness: 0.4, roughness: 0.5 });
    const body = new THREE.Mesh(this.t(new THREE.CapsuleGeometry(1.2, 3, 6, 12)), hb);
    body.rotation.z = Math.PI / 2;
    this.heli.add(body);
    const tail = new THREE.Mesh(this.t(new THREE.CylinderGeometry(0.2, 0.35, 4, 8)), hb);
    tail.rotation.z = Math.PI / 2;
    tail.position.x = -4;
    this.heli.add(tail);
    this.rotor = new THREE.Mesh(this.t(new THREE.BoxGeometry(9, 0.05, 0.3)), this.mat(0x111111));
    this.rotor.position.y = 1.5;
    this.heli.add(this.rotor);
    this.heliLight = new THREE.SpotLight(0xf0f4ff, 0, 40, 0.5, 0.5, 1);
    this.heliLight.position.set(0, -1, 0);
    this.heli.add(this.heliLight);
    this.heliLight.target.position.copy(this.pad);
    this.root.add(this.heliLight.target);
    this.heli.visible = false;
    this.root.add(this.heli);

    // Rain around the player
    const RN = this.lowEnd ? 900 : 2200;
    const ra = new Float32Array(RN * 3);
    for (let i = 0; i < RN; i++) {
      ra[i * 3] = (Math.random() - 0.5) * 36;
      ra[i * 3 + 1] = Math.random() * 12;
      ra[i * 3 + 2] = (Math.random() - 0.5) * 36;
    }
    const rg = this.t(new THREE.BufferGeometry());
    rg.setAttribute('position', new THREE.BufferAttribute(ra, 3));
    this.rain = new THREE.Points(rg, this.t(new THREE.PointsMaterial({ color: 0xaab8c8, size: 0.05, transparent: true, opacity: 0.6, depthWrite: false })));
    this.rain.frustumCulled = false;
    this.root.add(this.rain);

    this.scene.add(this.root);
    this.map.collisionBoxes.push(...this.boxes);
  }

  private makeNotes() {
    this.noteDrops = [
      {
        item: {
          id: 'note-r-carnet',
          name: 'Carnet de vol — Équipe Hélios',
          type: 'note',
          description: 'Un carnet de pilote, gondolé par la pluie.',
          lore:
            '« 23 h 40. Appel de l\'hôpital Saint-Aurore : « évacuation d\'un patient, toit, discrétion absolue ». Pas de nom. 23 h 58 : posés. Le docteur nous a dit de garder les moteurs allumés. 00 h 07 : des cris dans la cage d\'escalier. Martin est allé voir. Martin n\'est pas revenu. »',
          icon: 'FileText',
        },
        pos: this.w(5, 2, 0.02),
      },
      {
        item: {
          id: 'note-r-message',
          name: 'Message gravé dans la rambarde',
          type: 'note',
          description: 'Des lettres griffées dans la peinture, à hauteur d\'enfant.',
          lore:
            '« Il m\'a promis qu\'un hélicoptère viendrait me chercher. Que je verrais la mer. Je l\'ai attendu ici toute la nuit. L\'hélicoptère est venu. Il est reparti sans moi. — L. »',
          icon: 'FileText',
        },
        pos: this.w(32, 21, 0.02),
      },
    ];
  }

  public supplyDrops(): { item: GameItem; pos: THREE.Vector3 }[] {
    let n = 0;
    const mk = (type: 'battery' | 'food' | 'sedative' | 'medkit'): GameItem => {
      const id = `r6-${type}-${++n}`;
      if (type === 'battery') return { id, name: 'Pile', type, description: 'Recharge 55 % de la batterie de la lampe torche.', icon: 'BatteryCharging' };
      if (type === 'food') return { id, name: 'Barre de céréales', type, description: 'Redonne 40 points d\'endurance.', icon: 'Cookie' };
      if (type === 'sedative') return { id, name: 'Seringue de Sédatif', type, description: 'Immobilise la créature 5 secondes (à moins de 3 m, face à elle).', icon: 'Syringe' };
      return { id, name: 'Adrénaline', type, description: 'Auto-injecteur : endurance au maximum.', icon: 'HeartPulse' };
    };
    const cells: [number, number, 'battery' | 'food' | 'sedative' | 'medkit'][] = [
      [6, 15, 'battery'],
      [13, 9, 'food'],
      [17, 20, 'battery'],
      [24, 14, 'sedative'],
      [30, 13, 'battery'],
      [12, 2, 'medkit'],
    ];
    return cells.map(([gx, gz, k]) => ({ item: mk(k), pos: this.w(gx, gz, 0.02) }));
  }

  /** Free floor spots (event treats). */
  public freeSpots(n: number): THREE.Vector3[] {
    const out: THREE.Vector3[] = [];
    for (let tries = 0; tries < n * 20 && out.length < n; tries++) {
      const gx = Math.floor(Math.random() * GX);
      const gz = Math.floor(Math.random() * GZ);
      if (!this.isFloor(gx, gz)) continue;
      const p = this.w(gx, gz).add(new THREE.Vector3((Math.random() - 0.5) * 1.2, 0, (Math.random() - 0.5) * 1.2));
      if (out.every((o) => o.distanceToSquared(p) > 9)) out.push(p);
    }
    return out;
  }

  // ---------------------------------------------------------------------
  // Interactions
  // ---------------------------------------------------------------------
  public toggleUV() {
    return false;
  }

  public hint(p: THREE.Vector3): string | null {
    const near = (q: THREE.Vector3, d = 1.8) => Math.hypot(q.x - p.x, q.z - p.z) < d;
    if (this.phase === 'relays') {
      const r = this.relays.find((x) => !x.done && near(x.pos));
      if (r) return this.repairing >= 0 ? 'Réparation… restez près du relais' : '[E] Réparer le relais radio';
    }
    if (this.phase === 'beacon' && near(this.panel.pos)) return '[E] Allumer la balise et appeler l\'hélicoptère';
    if (this.phase === 'board' && Math.hypot(this.pad.x - p.x, this.pad.z - p.z) < 3) return '[E] Monter dans l\'hélicoptère';
    return null;
  }

  public interact(p: THREE.Vector3, _who = 0): SiteAction | null {
    const near = (q: THREE.Vector3, d = 1.8) => Math.hypot(q.x - p.x, q.z - p.z) < d;
    if (this.phase === 'relays') {
      const i = this.relays.findIndex((x) => !x.done && near(x.pos));
      if (i >= 0) {
        if (this.repairing >= 0) return { msg: 'Réparation en cours… ne vous éloignez pas.' };
        this.repairing = i;
        this.repairT = 4;
        sound.playStatic(0.5, 0.3);
        this.hear(this.relays[i].pos, 18);
        return { msg: '🔧 Réparation du relais (4 s)… Les étincelles font du bruit. Restez près !' };
      }
    }
    if (this.phase === 'beacon' && near(this.panel.pos)) {
      this.phase = 'wait';
      this.waitT = this.waitTotal;
      this.panel.led.emissive.set(0x20ff40);
      this.panel.led.emissiveIntensity = 2;
      this.beacons.forEach((b) => (b.emissiveIntensity = 3));
      this.hear(this.panel.pos, 40);
      sound.playMonsterChaseRoar();
      return {
        msg: `📡 « Hélios 2, on vous reçoit. Arrivée dans ${Math.round(this.waitTotal)} secondes. Tenez bon. » La balise s'allume… et quelque chose l'a vue aussi.`,
        shake: 0.4,
      };
    }
    if (this.phase === 'board' && Math.hypot(this.pad.x - p.x, this.pad.z - p.z) < 3) {
      this.ending = 'ROOFTOP';
      return { ending: 'ROOFTOP' } as SiteAction;
    }
    return null;
  }

  public objective(): string {
    if (this.phase === 'relays') return `Réparez les relais radio du toit (${this.relays.filter((r) => r.done).length}/3) — les lampes rouges`;
    if (this.phase === 'beacon') return 'Allumez la balise de l\'héliport (panneau bleu, côté est)';
    if (this.phase === 'wait') return `Tenez jusqu'à l'arrivée de l'hélicoptère : ${Math.ceil(this.waitT)} s`;
    return 'L\'hélicoptère est posé : courez jusqu\'à l\'héliport et montez [E] !';
  }

  // ---------------------------------------------------------------------
  // The creature: blind in the rain, until the lightning strikes
  // ---------------------------------------------------------------------
  private spawnCreature() {
    const m = new MonsterAI(new THREE.Vector3(OX, -50, OZ), this.map.navNodes, [], this.map.doors, () => {}, 0);
    m.mesh.visible = false;
    if (this.lowEnd) m.mesh.traverse((o) => (o.castShadow = false));
    this.stalker = m;
    this.scene.add(m.mesh);
  }

  private release(pl: SitePlayer) {
    const s = this.stalker;
    if (!s || this.released) return;
    this.released = true;
    // It climbs over the parapet, as far as possible from you
    let best = this.w(GX - 2, GZ - 2);
    let bd = -1;
    for (let gz = 0; gz < GZ; gz++)
      for (let gx = 0; gx < GX; gx++) {
        if (!this.isFloor(gx, gz) || (gx > 1 && gz > 1 && gx < GX - 2 && gz < GZ - 2)) continue;
        const p = this.w(gx, gz);
        const d = Math.hypot(p.x - pl.pos.x, p.z - pl.pos.z) + this.r() * 8;
        if (d > bd) {
          bd = d;
          best = p;
        }
      }
    s.placeAt(best.x, best.z);
    s.mesh.visible = true;
    this.mode = 'roam';
    this.path = [];
  }

  public hear(origin: THREE.Vector3, loudness: number) {
    const s = this.stalker;
    if (!s || !this.released || this.mode === 'chase') return;
    // The rain covers small noises
    if (origin.distanceTo(s.position) > loudness * 1.8) return;
    this.mode = 'investigate';
    this.target.copy(origin).setY(0);
    this.path = [];
  }

  private speeds() {
    const i = Math.max(0, Math.min(4, this.difficulty - 1));
    return { walk: [1.9, 2.1, 2.35, 2.6, 2.8][i], run: [3.9, 4.3, 4.7, 5.0, 5.3][i] };
  }

  private sees(pl: SitePlayer) {
    const s = this.stalker!;
    const d = Math.hypot(pl.pos.x - s.position.x, pl.pos.z - s.position.z);
    if (d < 2.2) return true;
    if (pl.dead) return false;
    // Lightning: everyone on the roof is visible for an instant
    let range = this.flash > 0.5 ? 60 : pl.flashlight ? 12 : 5;
    if (pl.crouch && this.flash <= 0.5) range *= 0.6;
    if (this.mode === 'chase') range *= 1.4;
    return d < range && this.los(s.position, pl.pos);
  }

  private follow(delta: number, speed: number, listener: Listener, chasing: boolean) {
    const s = this.stalker!;
    this.pathT -= delta;
    if (this.pathT <= 0 || !this.path.length) {
      this.pathT = chasing ? 0.35 : 1;
      this.path = this.findPath(s.position, this.target);
    }
    while (this.path.length > 1 && Math.hypot(this.path[0].x - s.position.x, this.path[0].z - s.position.z) < 0.6) this.path.shift();
    s.driveToward(this.path[0] ?? this.target, speed, delta, [], listener, chasing);
  }

  private updateCreature(delta: number, pls: SitePlayer[], listener: Listener, onCatch: (i: number) => void, onRelease: () => void) {
    const s = this.stalker;
    if (!s) return;
    if (!this.released) {
      this.releaseT -= delta;
      if (this.releaseT <= 0 || this.relays.some((r) => r.done) || this.phase === 'wait') {
        this.release(pls[0]);
        sound.playMonsterChaseRoar();
        onRelease();
      }
      return;
    }
    const sp = this.speeds();
    const dist = (x: SitePlayer) => Math.hypot(x.pos.x - s.position.x, x.pos.z - s.position.z);
    const alive = pls.filter((x) => !x.dead).sort((a, b) => dist(a) - dist(b));
    if (!alive.length || s.state === 'STUNNED') {
      s.driveToward(s.position, 0, delta, [], listener, false);
      return;
    }
    const seen = alive.find((x) => this.sees(x));
    const pl = seen ?? alive[0];
    this.roarCd = Math.max(0, this.roarCd - delta);
    // While waiting for the helicopter, it knows roughly where you are
    if (this.phase === 'wait' && this.waitT < this.waitTotal * 0.5 && this.mode !== 'chase') {
      this.mode = 'investigate';
      this.target.copy(pl.pos).setY(0);
    }
    if (seen) {
      if (this.mode !== 'chase') {
        this.path = [];
        if (this.roarCd <= 0) {
          this.roarCd = 4;
          sound.playMonsterChaseRoar();
        }
        if (!this.seenTip) {
          this.seenTip = true;
          this.toast('Il vous a vu dans l\'éclair ! Cassez la ligne de vue derrière un réservoir ou une clim.');
        }
      }
      this.mode = 'chase';
      this.lostT = 0;
      this.target.copy(pl.pos).setY(0);
    }
    let speed = sp.walk;
    let chasing = false;
    if (this.mode === 'chase') {
      speed = sp.run;
      chasing = true;
      if (!seen) {
        this.lostT += delta;
        if (this.lostT > 3) {
          this.mode = 'search';
          this.searchT = 8;
        }
      }
    } else if (this.mode === 'investigate') {
      speed = sp.walk * 1.3;
      if (Math.hypot(this.target.x - s.position.x, this.target.z - s.position.z) < 1) {
        this.mode = 'search';
        this.searchT = 5;
      }
    } else if (this.mode === 'search') {
      this.searchT -= delta;
      if (Math.hypot(this.target.x - s.position.x, this.target.z - s.position.z) < 1) {
        this.target.copy(s.position).add(new THREE.Vector3((this.r() - 0.5) * 10, 0, (this.r() - 0.5) * 10));
        this.path = [];
      }
      if (this.searchT <= 0) this.mode = 'roam';
    } else {
      // Roam: random open cells
      if (!this.path.length || Math.hypot(this.target.x - s.position.x, this.target.z - s.position.z) < 1) {
        for (let k = 0; k < 20; k++) {
          const gx = Math.floor(this.r() * GX);
          const gz = Math.floor(this.r() * GZ);
          if (this.isFloor(gx, gz)) {
            this.target.copy(this.w(gx, gz));
            break;
          }
        }
        this.path = [];
      }
    }
    this.follow(delta, speed, listener, chasing);
    pls.forEach((x, i) => {
      if (!x.dead && dist(x) < 1.1) onCatch(i);
    });
  }

  // ---------------------------------------------------------------------
  // Per frame
  // ---------------------------------------------------------------------
  public update(delta: number, pls: SitePlayer[], listener: Listener, onCatch: (i: number) => void, onRelease: () => void) {
    const pl = pls[0];
    // Relay repair: stay close for 4 s
    if (this.repairing >= 0) {
      const r = this.relays[this.repairing];
      if (Math.hypot(r.pos.x - pl.pos.x, r.pos.z - pl.pos.z) > 2.6) {
        this.repairing = -1;
        this.toast('Vous vous êtes éloigné : la réparation est interrompue.');
      } else {
        this.repairT -= delta;
        if (Math.random() < delta * 3) this.hear(r.pos, 14);
        if (this.repairT <= 0) {
          r.done = true;
          r.led.emissive.set(0x20ff40);
          this.repairing = -1;
          sound.playItemPickup();
          const n = this.relays.filter((x) => x.done).length;
          if (n >= 3) {
            this.phase = 'beacon';
            this.toast('📻 Les 3 relais marchent ! La radio grésille… Allez au panneau de l\'héliport.');
          } else this.toast(`📻 Relais réparé (${n}/3).`);
        }
      }
    }
    if (this.phase === 'wait') {
      this.waitT -= delta;
      if (this.waitT <= 0) {
        this.phase = 'board';
        this.toast('🚁 L\'hélicoptère se pose sur l\'héliport ! COUREZ !');
      }
    }
    this.visuals(delta, pl.pos);
    this.updateCreature(delta, pls, listener, onCatch, onRelease);
  }

  public mirror(delta: number) {
    if (this.phase === 'wait') this.waitT = Math.max(0, this.waitT - delta);
    this.visuals(delta, null);
  }

  private visuals(delta: number, me: THREE.Vector3 | null) {
    // Lightning, more and more often while you wait
    this.flash = Math.max(0, this.flash - delta * 2.2);
    this.boltT -= delta;
    if (this.boltT <= 0) {
      this.boltT = (this.phase === 'wait' ? 4 : 7) + Math.random() * 7;
      this.flash = 1;
      sound.playThunder(0.3 + Math.random() * 1.5, 0.8 + Math.random() * 0.4);
    }
    // Rain follows the player
    if (me) {
      const a = this.rain.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < a.count; i++) {
        let y = a.getY(i) - delta * 14;
        if (y < 0) y += 12;
        a.setY(i, y);
      }
      a.needsUpdate = true;
      this.rain.position.set(me.x, 0, me.z);
    }
    // Beacons blink
    if (this.phase === 'wait' || this.phase === 'board') {
      const on = Math.floor(performance.now() / 400) % 2 === 0;
      this.beacons.forEach((b) => (b.emissiveIntensity = on ? 3 : 0.5));
    }
    // Relay LEDs blink until repaired
    this.relays.forEach((r) => {
      if (!r.done) r.led.emissiveIntensity = Math.floor(performance.now() / 500) % 2 ? 2.5 : 0.4;
    });
    // Helicopter: arrives during the last 25 s of the wait
    const arriving = this.phase === 'wait' && this.waitT < 25;
    if (arriving || this.phase === 'board') {
      this.heli.visible = true;
      const k = this.phase === 'board' ? 0 : this.waitT / 25;
      this.heli.position.set(this.pad.x + k * 60, 3 + k * 30, this.pad.z - k * 20);
      this.rotor.rotation.y += delta * 25;
      this.heliLight.intensity = 60;
      const d = me ? me.distanceTo(this.heli.position) : 40;
      sound.setLoop('helicopter', 0.15 + 0.7 * Math.pow(Math.max(0, 1 - d / 120), 2));
    }
  }

  public netState(): RoofNet {
    return { ph: this.phase, rel: this.relays.map((r) => r.done), wt: Math.round(this.waitT * 10) / 10, fl: this.flash };
  }

  public netApply(n: RoofNet) {
    if (!n) return;
    this.phase = n.ph;
    n.rel?.forEach((d, i) => {
      const r = this.relays[i];
      if (r && d && !r.done) {
        r.done = true;
        r.led.emissive.set(0x20ff40);
      }
    });
    this.waitT = n.wt;
    if (n.fl > this.flash + 0.3) this.flash = n.fl;
  }

  public dispose() {
    const mine = new Set(this.boxes);
    this.map.collisionBoxes = this.map.collisionBoxes.filter((b) => !mine.has(b));
    this.scene.remove(this.root);
    sound.setLoop('rain', 0);
    sound.setLoop('helicopter', 0);
    this.stalker = null;
    this.disposables.forEach((d) => d.dispose());
  }
}
