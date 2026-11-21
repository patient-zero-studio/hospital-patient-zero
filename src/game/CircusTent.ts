import * as THREE from 'three';
import type { CollisionBox, MapData } from './MapBuilder';
import { MonsterAI, Listener } from './MonsterAI';
import { sound } from '../audio/SoundSystem';
import { GameItem } from '../types';
import type { SiteAction, SitePlayer } from './SiteB';

/**
 * 🎪 MODE « LA NUIT DU CIRQUE » (2 players, online)
 * Behind Saint-Aurore, an abandoned circus. Survive 3 nights against the
 * clowns. Every morning, one of the two players secretly receives a deal from
 * the Ringmaster: hand over your partner and walk out free. Refuse, and the
 * next night is harder. Accept, and the chase begins: the clowns ignore the
 * traitor and hunt the other one, who must reach the exit to win.
 */
const OX = 2000;
const OZ = 0;
const CELL = 1.5;
const G = 28;
const R = 19;
export const CIRCUS_NIGHTS = 3;
const NIGHT_TIME = 110;
const MORNING_TIME = 18;
const PACT_TIME = 10;
const CHASE_TIME = 60;

type Phase = 'night' | 'morning' | 'chase' | 'over';
/** who won: both stayed loyal / the traitor / the betrayed one escaped */
export type CircusResult = 'trust' | 'traitor' | 'escaped' | 'dead';
type Side = 'host' | 'guest';

export interface CircusNet {
  ph: Phase;
  n: number;
  t: number;
  of: Side | null;
  ot: number;
  tr: Side | null;
  res: CircusResult | null;
  act: number;
}

export class CircusTent {
  public readonly start = new THREE.Vector3(0, 1.72, 0);
  public readonly startYaw = 0;
  /** the first clown (the engine treats it as the level's creature) */
  public stalker: MonsterAI | null = null;
  public clowns: MonsterAI[] = [];
  public noteDrops: { item: GameItem; pos: THREE.Vector3 }[] = [];
  /** daylight (0 = night, 1 = full morning light), read by the engine */
  public flash = 0;
  public uv = false;
  public guest = false;
  public ending: null = null;
  public phase: Phase = 'night';
  public night = 1;
  public timer = NIGHT_TIME;
  /** morning: who received the Ringmaster's offer, and the seconds left to answer */
  public offerTo: Side | null = null;
  public offerT = 0;
  public traitor: Side | null = null;
  public result: CircusResult | null = null;
  /** how many clowns are hunting */
  private active = 1;

  private root = new THREE.Group();
  private boxes: CollisionBox[] = [];
  private blocked = new Uint8Array(G * G);
  private disposables: { dispose: () => void }[] = [];
  private r: () => number;
  private exit = new THREE.Vector3();
  private exitMat!: THREE.MeshStandardMaterial;
  private bulbs: THREE.MeshStandardMaterial[] = [];
  private brains: { target: THREE.Vector3; path: THREE.Vector3[]; pathT: number; roar: number }[] = [];
  private lastOffer: Side | null = null;

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
    this.start.copy(this.w(14, 6, 1.72));
    this.build();
    this.spawnClowns();
    this.timer = NIGHT_TIME;
  }

  // ---------------------------------------------------------------------
  // Grid helpers
  // ---------------------------------------------------------------------
  private w(gx: number, gz: number, y = 0) {
    return new THREE.Vector3(OX + (gx - G / 2 + 0.5) * CELL, y, OZ + (gz - G / 2 + 0.5) * CELL);
  }
  private cellOf(p: THREE.Vector3): [number, number] {
    return [Math.floor((p.x - OX) / CELL + G / 2), Math.floor((p.z - OZ) / CELL + G / 2)];
  }
  private isFloor(gx: number, gz: number) {
    return gx >= 0 && gz >= 0 && gx < G && gz < G && !this.blocked[gz * G + gx];
  }
  private los(a: THREE.Vector3, b: THREE.Vector3) {
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    const n = Math.ceil(d / 0.5);
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
    const start = sz * G + sx;
    const goal = tz * G + tx;
    const prev = new Int32Array(G * G).fill(-1);
    prev[start] = start;
    const q = [start];
    while (q.length) {
      const c = q.shift()!;
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

  // ---------------------------------------------------------------------
  // Building the big top
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
  private box(x0: number, z0: number, x1: number, z1: number, h = 4) {
    this.boxes.push({ min: new THREE.Vector3(x0, 0, z0), max: new THREE.Vector3(x1, h, z1) });
  }
  private blockRect(gx0: number, gz0: number, gx1: number, gz1: number, h = 4) {
    for (let gz = gz0; gz <= gz1; gz++) for (let gx = gx0; gx <= gx1; gx++) if (gx >= 0 && gz >= 0 && gx < G && gz < G) this.blocked[gz * G + gx] = 1;
    const a = this.w(gx0, gz0);
    const b = this.w(gx1, gz1);
    this.box(a.x - CELL / 2 + 0.05, a.z - CELL / 2 + 0.05, b.x + CELL / 2 - 0.05, b.z + CELL / 2 - 0.05, h);
  }

  private build() {
    // Outside the round tent is blocked
    for (let gz = 0; gz < G; gz++)
      for (let gx = 0; gx < G; gx++) {
        const p = this.w(gx, gz);
        if (Math.hypot(p.x - OX, p.z - OZ) > R - 1) this.blocked[gz * G + gx] = 1;
      }
    // Sawdust floor and the red ring
    const floor = this.mesh(new THREE.CircleGeometry(R, 64), this.mat(0x8a6a3a, { roughness: 1 }), OX, 0, OZ);
    floor.rotation.x = -Math.PI / 2;
    floor.castShadow = false;
    const ring = this.mesh(new THREE.RingGeometry(5.6, 6.2, 48), this.mat(0x8a1010, { roughness: 0.6 }), OX, 0.02, OZ);
    ring.rotation.x = -Math.PI / 2;
    ring.castShadow = false;
    // Striped canvas walls and the pointed roof
    const stripes = (() => {
      const c = document.createElement('canvas');
      c.width = 512;
      c.height = 64;
      const g = c.getContext('2d')!;
      for (let i = 0; i < 16; i++) {
        g.fillStyle = i % 2 ? '#6a0c10' : '#cfc6b0';
        g.fillRect(i * 32, 0, 32, 64);
      }
      const tx = new THREE.CanvasTexture(c);
      tx.wrapS = THREE.RepeatWrapping;
      tx.repeat.set(4, 1);
      tx.colorSpace = THREE.SRGBColorSpace;
      return this.t(tx);
    })();
    const wall = this.mesh(new THREE.CylinderGeometry(R, R, 6, 64, 1, true), this.mat(0xffffff, { map: stripes, side: THREE.BackSide, roughness: 1 }), OX, 3, OZ);
    wall.castShadow = false;
    const roof = this.mesh(new THREE.ConeGeometry(R, 9, 64, 1, true), this.mat(0xffffff, { map: stripes, side: THREE.BackSide, roughness: 1 }), OX, 10.5, OZ);
    roof.castShadow = false;
    this.mesh(new THREE.CylinderGeometry(0.15, 0.15, 15, 8), this.mat(0x5a4030), OX, 7.5, OZ).castShadow = false;
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      this.box(OX + Math.cos(a) * (R + 0.5) - 1.6, OZ + Math.sin(a) * (R + 0.5) - 1.6, OX + Math.cos(a) * (R + 0.5) + 1.6, OZ + Math.sin(a) * (R + 0.5) + 1.6);
    }

    // Bleachers (4 blocks, with gaps to run through)
    const wood = this.mat(0x4a3020, { roughness: 0.9 });
    for (const [gx0, gz0, gx1, gz1] of [
      [3, 9, 5, 12],
      [22, 9, 24, 12],
      [3, 15, 5, 18],
      [22, 15, 24, 18],
    ] as const) {
      this.blockRect(gx0, gz0, gx1, gz1, 2.2);
      const a = this.w(gx0, gz0);
      const b = this.w(gx1, gz1);
      for (let k = 0; k < 3; k++) {
        const h = 0.6 + k * 0.6;
        const inner = gx0 < 10 ? b.x + CELL / 2 - (k + 1) * 1.4 : a.x - CELL / 2 + (k + 1) * 1.4;
        this.mesh(new THREE.BoxGeometry(1.4, h, b.z - a.z + CELL), wood, inner + (gx0 < 10 ? 0.7 : -0.7), h / 2, (a.z + b.z) / 2);
      }
    }
    // Cages and wagons: cover to break the line of sight
    const iron = this.mat(0x2a2a2e, { metalness: 0.7, roughness: 0.5 });
    const paint = [0x2a4a8a, 0x8a6a1a, 0x1a6a3a, 0x7a1a5a];
    const props: [number, number, 'cage' | 'wagon'][] = [
      [9, 6, 'cage'],
      [17, 6, 'wagon'],
      [9, 21, 'wagon'],
      [17, 21, 'cage'],
      [13, 13, 'cage'],
    ];
    props.forEach(([gx, gz, kind], i) => {
      this.blockRect(gx, gz, gx + 1, gz + 1, 2.6);
      const p = this.w(gx, gz).add(new THREE.Vector3(CELL / 2, 0, CELL / 2));
      if (kind === 'cage') {
        this.mesh(new THREE.BoxGeometry(2.8, 0.2, 2.8), iron, p.x, 0.1, p.z);
        this.mesh(new THREE.BoxGeometry(2.8, 0.2, 2.8), iron, p.x, 2.4, p.z);
        for (let b = 0; b < 8; b++) {
          const t = b / 7;
          for (const [dx, dz] of [
            [-1.35 + t * 2.7, -1.35],
            [-1.35 + t * 2.7, 1.35],
            [-1.35, -1.35 + t * 2.7],
            [1.35, -1.35 + t * 2.7],
          ])
            this.mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.3, 5), iron, p.x + dx, 1.25, p.z + dz).castShadow = false;
        }
      } else {
        this.mesh(new THREE.BoxGeometry(2.8, 2.2, 2.6), this.mat(paint[i % paint.length], { roughness: 0.7 }), p.x, 1.4, p.z);
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
          const wheel = this.mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.12, 12), wood, p.x + sx * 1.1, 0.35, p.z + sz * 1.35);
          wheel.rotation.x = Math.PI / 2;
        }
      }
    });
    // The exit curtain (south): only opens for the chase
    this.exit.copy(this.w(14, 26));
    this.exitMat = this.mat(0x3a0a0a, { emissive: 0xffd080, emissiveIntensity: 0 });
    this.mesh(new THREE.BoxGeometry(3, 3.2, 0.2), this.exitMat, this.exit.x, 1.6, this.exit.z + 1);
    // Strings of light bulbs around the ring
    const bulbGeo = this.t(new THREE.SphereGeometry(0.1, 8, 6));
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      const m = this.mat(0x302010, { emissive: [0xffd060, 0xff3030, 0x60a0ff][i % 3], emissiveIntensity: 1.2 });
      this.bulbs.push(m);
      const b = new THREE.Mesh(bulbGeo, m);
      b.position.set(OX + Math.cos(a) * 9, 4.6 + Math.sin(i * 1.3) * 0.15, OZ + Math.sin(a) * 9);
      this.root.add(b);
    }
    const spot = new THREE.PointLight(0xffc890, 10, 26, 1.4);
    spot.position.set(OX, 7, OZ);
    this.root.add(spot);
    this.scene.add(this.root);
    this.map.collisionBoxes.push(...this.boxes);
  }

  public supplyDrops(): { item: GameItem; pos: THREE.Vector3 }[] {
    const mk = (id: string, type: 'battery' | 'food' | 'medkit'): GameItem =>
      type === 'battery'
        ? { id, name: 'Pile', type, description: 'Recharge 55 % de la batterie de la lampe torche.', icon: 'BatteryCharging' }
        : type === 'food'
          ? { id, name: 'Barre de céréales', type, description: 'Redonne 40 points d\'endurance.', icon: 'Cookie' }
          : { id, name: 'Adrénaline', type, description: 'Auto-injecteur : endurance au maximum + 6 s de sprint illimité.', icon: 'HeartPulse' };
    return [
      { item: mk('cx-battery-1', 'battery'), pos: this.w(7, 13, 0.02) },
      { item: mk('cx-battery-2', 'battery'), pos: this.w(20, 14, 0.02) },
      { item: mk('cx-food-1', 'food'), pos: this.w(14, 18, 0.02) },
      { item: mk('cx-medkit-1', 'medkit'), pos: this.w(14, 9, 0.02) },
    ];
  }

  public freeSpots(n: number): THREE.Vector3[] {
    const out: THREE.Vector3[] = [];
    for (let tries = 0; tries < n * 30 && out.length < n; tries++) {
      const gx = Math.floor(Math.random() * G);
      const gz = Math.floor(Math.random() * G);
      if (!this.isFloor(gx, gz)) continue;
      const p = this.w(gx, gz);
      if (out.every((o) => o.distanceToSquared(p) > 6)) out.push(p);
    }
    return out;
  }

  // ---------------------------------------------------------------------
  // The clowns
  // ---------------------------------------------------------------------
  private spawnClowns() {
    const spots = [this.w(14, 22), this.w(4, 14), this.w(24, 14)];
    for (let i = 0; i < 3; i++) {
      const m = new MonsterAI(spots[i].clone(), this.map.navNodes, [], this.map.doors, () => {}, 0);
      m.setFixedLook({ skin: '#f4f4f0', eyes: '#22d3ee', gown: ['#7c3aed', '#dc2626', '#16a34a'][i], acc: 'clownnose' }, 1.05);
      if (this.lowEnd) m.mesh.traverse((o) => (o.castShadow = false));
      this.clowns.push(m);
      this.scene.add(m.mesh);
      this.brains.push({ target: spots[i].clone(), path: [], pathT: 0, roar: 0 });
      if (i > 0) this.park(m);
    }
    this.stalker = this.clowns[0];
    if (this.difficulty < 2) this.clowns.forEach((c) => this.park(c));
  }
  /** off duty: far away, hidden */
  private park(m: MonsterAI) {
    m.placeAt(OX, OZ + 200);
    m.mesh.visible = false;
  }
  private wake(i: number) {
    const m = this.clowns[i];
    const spots = [this.w(14, 22), this.w(4, 14), this.w(24, 14)];
    m.placeAt(spots[i].x, spots[i].z);
    m.mesh.visible = true;
    this.brains[i].path = [];
  }
  public owns(m: MonsterAI) {
    return this.clowns.includes(m);
  }

  public toggleUV() {
    return false;
  }
  public hear(origin: THREE.Vector3, loudness: number) {
    for (let i = 0; i < this.active; i++) {
      const m = this.clowns[i];
      if (origin.distanceTo(m.position) < loudness * 1.4) this.brains[i].target.copy(origin).setY(0);
    }
  }

  public hint(p: THREE.Vector3): string | null {
    if (this.phase === 'chase' && Math.hypot(this.exit.x - p.x, this.exit.z - p.z) < 3) return '[E] Fuir par le rideau de sortie';
    return null;
  }
  public interact(_p: THREE.Vector3, _who = 0): SiteAction | null {
    return null;
  }

  public objective(): string {
    const t = Math.max(0, Math.ceil(this.timer));
    if (this.difficulty < 2) return `🎪 Exploration — nuit ${this.night}/${CIRCUS_NIGHTS} · aube dans ${t} s`;
    if (this.phase === 'night') return `🌙 Nuit ${this.night}/${CIRCUS_NIGHTS} — survivez ensemble jusqu'à l'aube : ${t} s`;
    if (this.phase === 'morning') return this.offerTo ? '☀️ Le matin… quelqu\'un a reçu un message du Directeur.' : `☀️ Le matin — la nuit suivante tombe dans ${t} s`;
    if (this.phase === 'chase') return `🔪 TRAHISON ! La victime doit atteindre le rideau de sortie (au sud) : ${t} s`;
    return 'Le spectacle est terminé.';
  }

  // ---------------------------------------------------------------------
  // The Ringmaster's deal
  // ---------------------------------------------------------------------
  /** the player who received the offer answers (host / solo side decides) */
  public answer(who: Side, yes: boolean) {
    if (this.phase !== 'morning' || this.offerTo !== who) return;
    this.offerTo = null;
    this.offerT = 0;
    if (yes) {
      this.traitor = who;
      this.phase = 'chase';
      this.timer = CHASE_TIME;
      for (let i = 0; i < this.clowns.length; i++) this.wake(i);
      this.active = this.clowns.length;
      sound.playMonsterChaseRoar();
      this.toast(`🔪 TRAHISON ! ${who === 'host' ? 'L\'hôte' : 'L\'invité'} a livré son partenaire au Directeur. Les clowns ne chassent plus que la victime !`);
    } else {
      this.toast('🤝 Le marché a été refusé… La nuit suivante sera plus dure.');
      this.timer = Math.min(this.timer, 4);
    }
  }

  // ---------------------------------------------------------------------
  // Per frame (host / solo)
  // ---------------------------------------------------------------------
  public update(delta: number, pls: SitePlayer[], listener: Listener, onCatch: (i: number, m?: MonsterAI) => void, _onRelease: () => void) {
    if (this.phase === 'over') return;
    const sides: Side[] = ['host', 'guest'];
    const alive = pls.map((p, i) => ({ p, i, side: sides[i] })).filter((x) => !x.p.dead);
    this.timer -= delta;
    if (this.phase === 'night') {
      this.flash = Math.max(0, this.flash - delta * 0.5);
      if (this.timer <= 0) this.dawn(alive.length);
    } else if (this.phase === 'morning') {
      this.flash = Math.min(0.8, this.flash + delta * 0.6);
      if (this.offerTo) {
        this.offerT -= delta;
        if (this.offerT <= 0) this.answer(this.offerTo, false);
      } else if (this.timer <= 0) this.nightfall();
    } else if (this.phase === 'chase') {
      this.flash = 0.25;
      const victim = alive.find((x) => x.side !== this.traitor);
      if (!victim) this.finish('traitor');
      else if (Math.hypot(this.exit.x - victim.p.pos.x, this.exit.z - victim.p.pos.z) < 2.5) this.finish('escaped');
      else if (this.timer <= 0) this.finish('escaped');
    }
    if (!alive.length && (this.phase as Phase) !== 'chase' && (this.phase as Phase) !== 'over') this.finish('dead');
    this.visuals();
    if (this.difficulty < 2 || (this.phase as Phase) === 'morning' || (this.phase as Phase) === 'over') {
      for (let i = 0; i < this.active; i++) this.clowns[i].driveToward(this.clowns[i].position, 0, delta, [], listener, false);
      return;
    }
    // Prey: everyone at night, only the betrayed player during the chase
    const prey = alive.filter((x) => this.phase !== 'chase' || x.side !== this.traitor);
    const speed = [3.4, 3.4, 3.7, 4.1, 4.5, 4.9][this.difficulty] ?? 3.8;
    for (let i = 0; i < this.active; i++) {
      const m = this.clowns[i];
      const b = this.brains[i];
      if (m.state === 'STUNNED') {
        m.driveToward(m.position, 0, delta, [], listener, false);
        continue;
      }
      const dist = (x: SitePlayer) => Math.hypot(x.pos.x - m.position.x, x.pos.z - m.position.z);
      const seen = prey
        .filter((x) => {
          const d = dist(x.p);
          const range = this.phase === 'chase' ? 40 : x.p.flashlight ? 14 : 7;
          return d < 2 || (d < range && this.los(m.position, x.p.pos));
        })
        .sort((a, c) => dist(a.p) - dist(c.p))[0];
      if (seen) b.target.copy(seen.p.pos).setY(0);
      else if (Math.hypot(b.target.x - m.position.x, b.target.z - m.position.z) < 1) {
        for (let k = 0; k < 20; k++) {
          const gx = Math.floor(this.r() * G);
          const gz = Math.floor(this.r() * G);
          if (this.isFloor(gx, gz)) {
            b.target.copy(this.w(gx, gz));
            break;
          }
        }
        b.path = [];
      }
      b.roar = Math.max(0, b.roar - delta);
      if (seen && b.roar <= 0) {
        b.roar = 7;
        sound.playMonsterChaseRoar();
      }
      b.pathT -= delta;
      if (b.pathT <= 0 || !b.path.length) {
        b.pathT = seen ? 0.35 : 1;
        b.path = this.findPath(m.position, b.target);
      }
      while (b.path.length > 1 && Math.hypot(b.path[0].x - m.position.x, b.path[0].z - m.position.z) < 0.5) b.path.shift();
      const chase = this.phase === 'chase';
      m.driveToward(b.path[0] ?? b.target, seen ? speed * (chase ? 1.05 : 1) + this.night * 0.15 : speed * 0.55, delta, [], listener, !!seen);
      for (const x of prey) {
        if (dist(x.p) < 1.1) {
          if (this.phase === 'chase') this.finish('traitor');
          else onCatch(x.i, m);
        }
      }
    }
  }

  private dawn(alive: number) {
    sound.playItemPickup();
    if (this.night >= CIRCUS_NIGHTS) {
      this.finish('trust');
      return;
    }
    this.phase = 'morning';
    this.timer = MORNING_TIME;
    for (let i = 1; i < this.clowns.length; i++) this.park(this.clowns[i]);
    this.active = 1;
    this.park(this.clowns[0]);
    // The Ringmaster writes to one of the two (only if both are still alive)
    if (alive >= 2 && this.difficulty >= 2) {
      // never the same player twice in a row
      this.offerTo = this.lastOffer ? (this.lastOffer === 'host' ? 'guest' : 'host') : this.r() < 0.5 ? 'host' : 'guest';
      this.lastOffer = this.offerTo;
      this.offerT = PACT_TIME;
    }
    this.toast(`☀️ L'aube de la nuit ${this.night}. Les clowns retournent dans l'ombre… pour l'instant.`);
  }

  private nightfall() {
    this.night++;
    this.phase = 'night';
    this.timer = NIGHT_TIME;
    this.active = Math.min(this.clowns.length, this.night);
    for (let i = 0; i < this.active; i++) this.wake(i);
    sound.playMonsterGrowl(10, 0);
    this.toast(`🌙 La nuit ${this.night} tombe. ${this.active} clown${this.active > 1 ? 's' : ''} rôde${this.active > 1 ? 'nt' : ''} sous le chapiteau.`);
  }

  private finish(res: CircusResult) {
    if (this.phase === 'over') return;
    this.phase = 'over';
    this.result = res;
    this.offerTo = null;
  }

  public mirror(delta: number) {
    if (this.phase !== 'over') this.timer = Math.max(0, this.timer - delta);
    if (this.offerTo) this.offerT = Math.max(0, this.offerT - delta);
    this.flash = this.phase === 'morning' ? Math.min(0.8, this.flash + delta * 0.6) : this.phase === 'chase' ? 0.25 : Math.max(0, this.flash - delta * 0.5);
    this.visuals();
  }

  private visuals() {
    const now = performance.now();
    this.bulbs.forEach((b, i) => (b.emissiveIntensity = this.phase === 'chase' ? (Math.floor(now / 200 + i) % 2 ? 3 : 0.2) : 1 + Math.sin(now * 0.003 + i) * 0.4));
    this.exitMat.emissiveIntensity = this.phase === 'chase' ? 1.4 + Math.sin(now * 0.008) * 0.6 : 0;
  }

  public netState(): CircusNet {
    return { ph: this.phase, n: this.night, t: Math.round(this.timer * 10) / 10, of: this.offerTo, ot: Math.round(this.offerT * 10) / 10, tr: this.traitor, res: this.result, act: this.active };
  }
  public netApply(n: CircusNet) {
    if (!n) return;
    if (n.ph === 'chase' && this.phase !== 'chase') sound.playMonsterChaseRoar();
    this.phase = n.ph;
    this.night = n.n;
    this.timer = n.t;
    this.offerTo = n.of;
    this.offerT = n.ot;
    this.traitor = n.tr;
    this.result = n.res;
    // clowns off duty are hidden on this screen too
    this.active = n.act;
    this.clowns.forEach((c, i) => (c.mesh.visible = i < n.act && n.ph !== 'morning'));
  }

  public dispose() {
    const mine = new Set(this.boxes);
    this.map.collisionBoxes = this.map.collisionBoxes.filter((b) => !mine.has(b));
    this.scene.remove(this.root);
    this.stalker = null;
    this.disposables.forEach((d) => d.dispose());
  }
}
