import * as THREE from 'three';
import type { CollisionBox, MapData } from './MapBuilder';
import { MonsterAI, Listener } from './MonsterAI';
import { sound } from '../audio/SoundSystem';
import { GameItem } from '../types';
import type { SiteAction, SitePlayer } from './SiteB';

/**
 * SECRET CHAPTER — LE RÊVE DE LUCAS
 * Unlocked by finding every document of chapters 1 to 7. The childhood house
 * of Lucas, the way he remembers it: too big, too quiet, wrapped in a purple
 * dusk. Find his 5 memories, then go out through the garden gate. A Shadow
 * follows you — it only moves when nobody is looking at it.
 */
const OX = 1600;
const OZ = 0;
const CELL = 2;
const MAP = [
  '######################',
  '#bb.....#.....#ff...b#',
  '#.......#.www.#.....b#',
  '#.......#.....#......#',
  '#.......#.....#......#',
  '####.#######.####.####',
  '#....................#',
  '#....................#',
  '####.#####.#####.#####',
  '#kkk...#.......#.....#',
  '#......#..ss...#.....#',
  '#..t...#.......#.....#',
  '#......#.......#.....#',
  '##########.###########',
  'FggggggggggggggggggggF',
  'FgggTggggggggggggggGgF',
  'FFFFFFFFFFFFFFFFFFFFFF',
];
const GX = MAP[0].length;
const GZ = MAP.length;
export const MEMORY_IDS = ['mem-ours', 'mem-lettre', 'mem-dessin', 'mem-photo', 'mem-velo'];

export interface DreamNet {
  w: boolean;
  f: number;
}

export class DreamHouse {
  public readonly start = new THREE.Vector3(0, 1.72, 0);
  /** facing west, down the hallway */
  public readonly startYaw = Math.PI / 2;
  public stalker: MonsterAI | null = null;
  public noteDrops: { item: GameItem; pos: THREE.Vector3 }[] = [];
  public flash = 0;
  public uv = false;
  public guest = false;
  public ending: 'SECRET' | null = null;
  /** memories found (set by the engine from the documents picked up) */
  public found = 0;

  private root = new THREE.Group();
  private boxes: CollisionBox[] = [];
  private blocked = new Uint8Array(GX * GZ);
  private disposables: { dispose: () => void }[] = [];
  private gate = new THREE.Vector3();
  private gateMat!: THREE.MeshStandardMaterial;
  private woke = false;
  private wakeT = 25;
  private path: THREE.Vector3[] = [];
  private pathT = 0;
  private whisperCd = 0;
  private tipped = false;
  private lastFound = 0;

  constructor(
    private map: MapData,
    private scene: THREE.Scene,
    private difficulty: number,
    private lowEnd: boolean,
    private toast: (msg: string) => void,
    _seed: number
  ) {
    this.start.copy(this.w(11, 7, 1.72));
    this.build();
    this.makeNotes();
    if (difficulty >= 2) this.spawnShadow();
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
      // furniture is low: you see over it
      if (ch === '#' || ch === undefined) return false;
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
  // Building the house
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
    this.boxes.push({ min: new THREE.Vector3(x0, 0, z0), max: new THREE.Vector3(x1, h, z1) });
  }

  private build() {
    const houseRows = 14;
    // Floors: old parquet inside, grass in the garden
    const parquet = this.mat(0x6a4a32, { roughness: 0.7 });
    const grass = this.mat(0x2a3a26, { roughness: 1 });
    const inside = this.mesh(new THREE.PlaneGeometry(GX * CELL, houseRows * CELL), parquet, OX, 0, this.w(0, (houseRows - 1) / 2).z);
    inside.rotation.x = -Math.PI / 2;
    inside.castShadow = false;
    const out = this.mesh(new THREE.PlaneGeometry(GX * CELL + 40, (GZ - houseRows) * CELL + 40), grass, OX, -0.01, this.w(0, houseRows + 1.5).z + 18);
    out.rotation.x = -Math.PI / 2;
    out.castShadow = false;
    const ceil = this.mesh(new THREE.PlaneGeometry(GX * CELL, houseRows * CELL), this.mat(0xd8cfc4), OX, 2.8, this.w(0, (houseRows - 1) / 2).z);
    ceil.rotation.x = Math.PI / 2;
    ceil.castShadow = false;

    // Walls (instanced), fence, furniture
    const walls: THREE.Vector3[] = [];
    const fences: THREE.Vector3[] = [];
    const furn: { p: THREE.Vector3; ch: string }[] = [];
    for (let gz = 0; gz < GZ; gz++) {
      for (let gx = 0; gx < GX; gx++) {
        const ch = MAP[gz][gx];
        const p = this.w(gx, gz);
        if (ch === '#') {
          walls.push(p);
          this.blocked[gz * GX + gx] = 1;
          this.box(p.x - 1, p.z - 1, p.x + 1, p.z + 1);
        } else if (ch === 'F') {
          fences.push(p);
          this.blocked[gz * GX + gx] = 1;
          this.box(p.x - 1, p.z - 1, p.x + 1, p.z + 1, 1.2);
        } else if ('bfwkstT'.includes(ch)) {
          furn.push({ p, ch });
          this.blocked[gz * GX + gx] = 1;
        } else if (ch === 'G') this.gate.copy(p);
      }
    }
    const wallMat = this.mat(0x7a6a88, { roughness: 0.95 });
    const wi = new THREE.InstancedMesh(this.t(new THREE.BoxGeometry(CELL, 2.8, CELL)), wallMat, walls.length);
    walls.forEach((p, i) => wi.setMatrixAt(i, new THREE.Matrix4().makeTranslation(p.x, 1.4, p.z)));
    wi.castShadow = !this.lowEnd;
    wi.receiveShadow = true;
    this.root.add(wi);
    const fenceMat = this.mat(0xe8e4dc, { roughness: 0.8 });
    const fi = new THREE.InstancedMesh(this.t(new THREE.BoxGeometry(CELL, 1.1, 0.15)), fenceMat, fences.length);
    fences.forEach((p, i) => fi.setMatrixAt(i, new THREE.Matrix4().makeTranslation(p.x, 0.55, p.z)));
    this.root.add(fi);

    const wood = this.mat(0x7a5236);
    const sheet = this.mat(0xc8d8f0);
    const white = this.mat(0xf4f2ee, { roughness: 0.3 });
    for (const { p, ch } of furn) {
      if (ch === 'b') {
        this.mesh(new THREE.BoxGeometry(1.9, 0.45, 1.9), wood, p.x, 0.22, p.z);
        this.mesh(new THREE.BoxGeometry(1.8, 0.15, 1.8), sheet, p.x, 0.52, p.z);
        this.box(p.x - 0.95, p.z - 0.95, p.x + 0.95, p.z + 0.95, 0.6);
      } else if (ch === 'f') {
        this.mesh(new THREE.BoxGeometry(1.8, 2.2, 0.8), wood, p.x, 1.1, p.z - 0.5);
        this.box(p.x - 0.9, p.z - 0.9, p.x + 0.9, p.z, 2.2);
      } else if (ch === 'w') {
        this.mesh(new THREE.BoxGeometry(1.9, 0.6, 1.2), white, p.x, 0.3, p.z);
        this.box(p.x - 0.95, p.z - 0.6, p.x + 0.95, p.z + 0.6, 0.6);
      } else if (ch === 'k') {
        this.mesh(new THREE.BoxGeometry(1.95, 0.95, 1.2), white, p.x, 0.47, p.z - 0.4);
        this.box(p.x - 1, p.z - 1, p.x + 1, p.z + 0.2, 1);
      } else if (ch === 't') {
        this.mesh(new THREE.BoxGeometry(1.6, 0.08, 1.2), wood, p.x, 0.76, p.z);
        for (const sx of [-0.7, 0.7]) for (const sz of [-0.5, 0.5]) this.mesh(new THREE.BoxGeometry(0.06, 0.74, 0.06), wood, p.x + sx, 0.37, p.z + sz);
        this.box(p.x - 0.8, p.z - 0.6, p.x + 0.8, p.z + 0.6, 0.8);
      } else if (ch === 's') {
        this.mesh(new THREE.BoxGeometry(1.95, 0.5, 0.9), this.mat(0x6a2a3a), p.x, 0.25, p.z);
        this.mesh(new THREE.BoxGeometry(1.95, 0.5, 0.2), this.mat(0x6a2a3a), p.x, 0.75, p.z + 0.35);
        this.box(p.x - 1, p.z - 0.45, p.x + 1, p.z + 0.45, 0.9);
      } else if (ch === 'T') {
        // The tree of the drawing
        this.mesh(new THREE.CylinderGeometry(0.3, 0.45, 4, 10), this.mat(0x4a3022), p.x, 2, p.z);
        const crown = this.mesh(new THREE.SphereGeometry(2.4, 14, 10), this.mat(0x1f3a22), p.x, 5, p.z);
        crown.scale.y = 0.8;
        this.box(p.x - 0.5, p.z - 0.5, p.x + 0.5, p.z + 0.5, 4);
      }
    }
    // The garden gate: glows when every memory is found
    this.gateMat = this.mat(0x2a2030, { emissive: 0xffd080, emissiveIntensity: 0 });
    this.mesh(new THREE.BoxGeometry(1.8, 1.6, 0.12), this.gateMat, this.gate.x, 0.8, this.gate.z + 0.9);

    // Warm lamps, one per room, and a purple dusk outside
    const rooms: [number, number][] = [
      [4, 2],
      [11, 2],
      [18, 2],
      [11, 6],
      [3, 10],
      [11, 10],
      [18, 10],
    ];
    for (const [gx, gz] of rooms) {
      const p = this.w(gx, gz);
      const l = new THREE.PointLight(0xffc88a, 5, 9, 1.7);
      l.position.set(p.x, 2.5, p.z);
      this.root.add(l);
      this.mesh(new THREE.SphereGeometry(0.16, 10, 8), this.mat(0x3a2a10, { emissive: 0xffd090, emissiveIntensity: 2.5 }), p.x, 2.65, p.z).castShadow = false;
    }
    const moon = new THREE.PointLight(0xb08aff, 25, 40, 1.2);
    moon.position.copy(this.w(11, 15, 9));
    this.root.add(moon);

    this.scene.add(this.root);
    this.map.collisionBoxes.push(...this.boxes);
  }

  private makeNotes() {
    const note = (id: string, name: string, description: string, lore: string, gx: number, gz: number) => ({
      item: { id, name, type: 'note' as const, description, lore, icon: 'FileText' },
      pos: this.w(gx, gz, 0.02),
    });
    this.noteDrops = [
      note('mem-ours', 'Souvenir — Monsieur Pompon', 'Un ours en peluche, un œil cousu de travers.', '« Monsieur Pompon dormait toujours à gauche, contre le mur, pour me protéger des monstres. Je ne l\'ai pas emporté à l\'hôpital. Le docteur avait dit que je serais rentré avant mon anniversaire. »', 3, 3),
      note('mem-lettre', 'Souvenir — La lettre de maman', 'Une lettre pliée en quatre, jamais envoyée.', '« Mon Lucas, le docteur Moreau dit que le traitement te rendra fort. Papa et moi venons te voir dimanche. Mange bien. Ne fais pas de bruit la nuit, les infirmières sont fatiguées. On t\'aime plus grand que le ciel. — Maman »', 18, 3),
      note('mem-dessin', 'Souvenir — Le dessin du frigo', 'Un dessin aux feutres, accroché par un aimant.', '« Une maison, un arbre, trois bonshommes qui se tiennent la main. En dessous, une écriture penchée : LUCAS, 6 ANS. QUAND JE SERAI GRAND JE SERAI DOCTEUR. »', 5, 10),
      note('mem-photo', 'Souvenir — La photo de famille', 'Une photo prise devant la maison, un été.', '« Au dos : « Été 1986, avant Saint-Aurore ». Tout le monde sourit. Le petit garçon tient un vélo rouge trop grand pour lui. À côté de ses parents, un homme en blouse blanche pose la main sur son épaule. »', 13, 11),
      note('mem-velo', 'Souvenir — Le vélo rouge', 'Un petit vélo rouge, couché dans l\'herbe.', '« Papa me tenait la selle et puis il a lâché sans le dire. J\'ai roulé tout seul jusqu\'à l\'arbre. C\'est le dernier jour où je me souviens d\'avoir ri. »', 7, 15),
    ];
  }

  public supplyDrops(): { item: GameItem; pos: THREE.Vector3 }[] {
    return [
      { item: { id: 'd8-battery-1', name: 'Pile', type: 'battery', description: 'Recharge 55 % de la batterie de la lampe torche.', icon: 'BatteryCharging' }, pos: this.w(16, 7, 0.02) },
      { item: { id: 'd8-battery-2', name: 'Pile', type: 'battery', description: 'Recharge 55 % de la batterie de la lampe torche.', icon: 'BatteryCharging' }, pos: this.w(10, 3, 0.02) },
      { item: { id: 'd8-food-1', name: 'Barre de céréales', type: 'food', description: 'Redonne 40 points d\'endurance.', icon: 'Cookie' }, pos: this.w(9, 12, 0.02) },
    ];
  }

  public freeSpots(n: number): THREE.Vector3[] {
    const out: THREE.Vector3[] = [];
    for (let tries = 0; tries < n * 30 && out.length < n; tries++) {
      const gx = Math.floor(Math.random() * GX);
      const gz = Math.floor(Math.random() * GZ);
      if (!this.isFloor(gx, gz)) continue;
      const p = this.w(gx, gz);
      if (out.every((o) => o.distanceToSquared(p) > 6)) out.push(p);
    }
    return out;
  }

  // ---------------------------------------------------------------------
  // The Shadow: moves only when nobody looks at it
  // ---------------------------------------------------------------------
  private spawnShadow() {
    const m = new MonsterAI(this.w(19, 11), this.map.navNodes, [], this.map.doors, () => {}, 0);
    m.setFixedLook({ skin: '#0c0c10', eyes: '#ffffff', gown: '#050505', outfit: 'shadow' }, 1.05);
    m.mesh.visible = false;
    if (this.lowEnd) m.mesh.traverse((o) => (o.castShadow = false));
    this.stalker = m;
    this.scene.add(m.mesh);
  }

  private watched(pl: SitePlayer) {
    const s = this.stalker!;
    if (pl.dead) return false;
    const head = s.position.clone().setY(1.6);
    const eye = pl.pos.clone().setY(1.6);
    const to = head.sub(eye);
    const d = to.length();
    if (d > 30) return false;
    const cp = Math.cos(pl.pitch);
    const dir = new THREE.Vector3(-Math.sin(pl.yaw) * cp, Math.sin(pl.pitch), -Math.cos(pl.yaw) * cp);
    if (to.normalize().dot(dir) < 0.7) return false;
    return this.los(pl.pos, s.position);
  }

  public toggleUV() {
    return false;
  }
  public hear(_origin: THREE.Vector3, _loudness: number) {}

  public hint(p: THREE.Vector3): string | null {
    if (Math.hypot(this.gate.x - p.x, this.gate.z - p.z) < 2.4)
      return this.found >= MEMORY_IDS.length ? '[E] Ouvrir le portail et sortir du rêve' : `Le portail ne s'ouvre pas… il manque des souvenirs (${this.found}/${MEMORY_IDS.length})`;
    return null;
  }

  public interact(p: THREE.Vector3, _who = 0): SiteAction | null {
    if (Math.hypot(this.gate.x - p.x, this.gate.z - p.z) < 2.4) {
      if (this.found < MEMORY_IDS.length) return { msg: `Le portail est fermé. Retrouvez les souvenirs de Lucas (${this.found}/${MEMORY_IDS.length}).` };
      this.ending = 'SECRET';
      return { ending: 'SECRET' } as SiteAction;
    }
    return null;
  }

  public objective(): string {
    if (this.found >= MEMORY_IDS.length) return 'Tous les souvenirs sont là. Sortez par le portail du jardin (au fond à droite).';
    return `Retrouvez les souvenirs de Lucas : ${this.found}/${MEMORY_IDS.length}${this.woke ? ' · ne quittez pas l\'Ombre des yeux' : ''}`;
  }

  public update(delta: number, pls: SitePlayer[], listener: Listener, onCatch: (i: number) => void, onRelease: () => void) {
    if (this.found !== this.lastFound) {
      this.lastFound = this.found;
      if (this.found >= MEMORY_IDS.length) this.toast('✨ Tous les souvenirs sont revenus. Le portail du jardin s\'illumine.');
    }
    this.visuals();
    const s = this.stalker;
    if (!s) return;
    if (!this.woke) {
      this.wakeT -= delta;
      if (this.wakeT > 0 && this.found === 0) return;
      this.woke = true;
      // It appears as far as possible from you
      const pl = pls[0];
      let best = this.w(19, 11);
      let bd = -1;
      for (let gz = 0; gz < GZ; gz++)
        for (let gx = 0; gx < GX; gx++) {
          if (!this.isFloor(gx, gz) || MAP[gz][gx] === 'g' || MAP[gz][gx] === 'G') continue;
          const p = this.w(gx, gz);
          const d = Math.hypot(p.x - pl.pos.x, p.z - pl.pos.z);
          if (d > bd) {
            bd = d;
            best = p;
          }
        }
      s.placeAt(best.x, best.z);
      s.mesh.visible = true;
      sound.playMonsterGrowl(20, 0);
      onRelease();
      return;
    }
    const alive = pls.filter((x) => !x.dead);
    if (!alive.length) return;
    const dist = (x: SitePlayer) => Math.hypot(x.pos.x - s.position.x, x.pos.z - s.position.z);
    const pl = alive.sort((a, b) => dist(a) - dist(b))[0];
    this.whisperCd = Math.max(0, this.whisperCd - delta);
    // Watched: perfectly still (no animation at all)
    if (alive.some((x) => this.watched(x))) {
      if (!this.tipped && dist(pl) < 12) {
        this.tipped = true;
        this.toast('Une ombre d\'enfant… immobile. Elle ne bouge que quand personne ne la regarde.');
      }
      if (dist(pl) < 5 && this.whisperCd <= 0) {
        this.whisperCd = 8;
        sound.playStatic(0.6, 0.12);
      }
      return;
    }
    const sp = [3.0, 3.0, 3.4, 3.9, 4.4, 4.9][this.difficulty] ?? 3.6;
    this.pathT -= delta;
    if (this.pathT <= 0 || !this.path.length) {
      this.pathT = 0.4;
      this.path = this.findPath(s.position, pl.pos);
    }
    while (this.path.length > 1 && Math.hypot(this.path[0].x - s.position.x, this.path[0].z - s.position.z) < 0.5) this.path.shift();
    s.driveToward(this.path[0] ?? pl.pos, sp, delta, [], listener, false);
    pls.forEach((x, i) => {
      if (!x.dead && dist(x) < 1.1) onCatch(i);
    });
  }

  public mirror(_delta: number) {
    this.visuals();
  }

  private visuals() {
    const ready = this.found >= MEMORY_IDS.length;
    this.gateMat.emissiveIntensity = ready ? 1.5 + Math.sin(performance.now() * 0.004) * 0.6 : 0;
  }

  public netState(): DreamNet {
    return { w: this.woke, f: this.found };
  }
  public netApply(n: DreamNet) {
    if (!n) return;
    if (n.w && !this.woke && this.stalker) this.stalker.mesh.visible = true;
    this.woke = n.w;
  }

  public dispose() {
    const mine = new Set(this.boxes);
    this.map.collisionBoxes = this.map.collisionBoxes.filter((b) => !mine.has(b));
    this.scene.remove(this.root);
    this.stalker = null;
    this.disposables.forEach((d) => d.dispose());
  }
}
