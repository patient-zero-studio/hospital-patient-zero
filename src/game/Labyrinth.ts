import * as THREE from 'three';
import { ProceduralTextures as Tex } from '../textures/ProceduralTextures';
import type { CollisionBox, FlickerLight, LowZone, MapData } from './MapBuilder';
import { MonsterAI, Listener } from './MonsterAI';
import { sound } from '../audio/SoundSystem';
import { GameItem } from '../types';

/**
 * CHAPTER 3 — LE DÉDALE
 * An endless maze of sewer tunnels, generated chunk by chunk around the player
 * (chunks far behind are dropped). Three valves to open, then a manhole appears.
 * The Stalker follows your exact trail; running or making noise makes it sprint.
 */
const OX = 400;
const OZ = 0;
const CELL = 4;
const N = 6; // cells per chunk side
const CH = CELL * N;
const H = 3.5;
const T = 0.3;
const LOAD_R = 1; // chunks loaded around the player (3x3)

const hashN = (...n: number[]) => {
  let h = 2166136261 >>> 0;
  for (const v of n) {
    h = Math.imul(h ^ (v | 0), 16777619);
    h ^= h >>> 13;
    h = Math.imul(h, 0x5bd1e995);
    h ^= h >>> 15;
  }
  return (h >>> 0) / 4294967296;
};
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

interface ChunkMaze {
  /** passage from local cell (i,j) to (i+1,j) */
  e: Uint8Array;
  /** passage from local cell (i,j) to (i,j+1) */
  s: Uint8Array;
}
interface Chunk {
  group: THREE.Group;
  boxes: CollisionBox[];
  lights: FlickerLight[];
  water: LowZone[];
  disposables: { dispose: () => void }[];
}
interface Gate {
  key: string;
  x: number;
  z: number;
  /** wall axis: 'x' = the gate spans along x (passage north/south) */
  axis: 'x' | 'z';
  closed: boolean;
  broken: boolean;
  mesh: THREE.Group | null;
  box: CollisionBox | null;
  drop: number;
}
interface Valve {
  gx: number;
  gz: number;
  pos: THREE.Vector3;
  wheel: THREE.Mesh;
  open: boolean;
  spin: number;
  light: FlickerLight;
}

const GRAFFITI = [
  ['TU TOURNES EN ROND', 'IL TE SUIT', 'NE COURS PAS', 'LUCAS ?', 'SORTIE →'],
  ['IL TE SUIT', 'NE T\'ARRÊTE PAS', '← SORTIE', 'TOUJOURS LÀ', 'TU TOURNES EN ROND'],
  ['IL EST DERRIÈRE TOI', 'TOUJOURS LÀ', 'IL ENTEND TOUT', 'PARDON LUCAS', 'NE T\'ARRÊTE PAS'],
  ['IL EST DERRIÈRE TOI', 'MONTE', 'LA LUMIÈRE', 'COURS', 'IL EST DERRIÈRE TOI'],
];

export class Labyrinth {
  public readonly start = new THREE.Vector3(OX, 1.72, OZ);
  /** Facing an open passage of the start cell */
  public startYaw = Math.PI;
  public stalker: MonsterAI | null = null;
  public valvesOpen = 0;
  public exitOpen = false;
  public gatesDropped = 0;
  public noteDrops: { item: GameItem; pos: THREE.Vector3 }[] = [];

  private seed: number;
  private mazes = new Map<string, ChunkMaze>();
  private chunks = new Map<string, Chunk>();
  private gates = new Map<string, Gate>();
  private valves: Valve[] = [];
  private exit: { pos: THREE.Vector3; group: THREE.Group; light: FlickerLight } | null = null;
  private root = new THREE.Group();
  private disposables: { dispose: () => void }[] = [];
  private brickMat: THREE.MeshStandardMaterial;
  private floorMat: THREE.MeshStandardMaterial;
  private vaultMat: THREE.MeshStandardMaterial;
  private waterMat: THREE.MeshStandardMaterial;
  private metalMat: THREE.MeshStandardMaterial;
  private rustMat: THREE.MeshStandardMaterial;
  private wallGeo: THREE.BoxGeometry;
  private planeGeo: THREE.PlaneGeometry;
  private graffitiMats = new Map<string, THREE.MeshStandardMaterial>();
  private graffitiGeo: THREE.PlaneGeometry;
  private puddleGeo: THREE.CircleGeometry;
  private lampGeo: THREE.BoxGeometry;
  private barGeo: THREE.CylinderGeometry;
  private curChunk = '';
  /** Cells on the way start → valve 1 → 2 → 3 (the exit is never back there). */
  private usedPath = new Set<string>();

  // Stalker
  private trail: THREE.Vector3[] = [];
  private trailIdx = 0;
  private releaseT: number;
  private released = false;
  private frenzy = 0;
  private bashT = 0;
  private bashing: Gate | null = null;
  private stunT = 0;
  private lagCheck = 0;

  constructor(
    private map: MapData,
    private scene: THREE.Scene,
    private difficulty: number
  ) {
    this.seed = Math.random();
    const brickTex = Tex.getSewerBrickTexture();
    const floorTex = Tex.getSewerFloorTexture();
    const t = <X extends { dispose: () => void }>(o: X) => {
      this.disposables.push(o);
      return o;
    };
    this.brickMat = t(new THREE.MeshStandardMaterial({ map: brickTex, bumpMap: brickTex, bumpScale: 1.6, roughness: 0.8, metalness: 0.05 }));
    this.floorMat = t(new THREE.MeshStandardMaterial({ map: floorTex, bumpMap: floorTex, bumpScale: 0.8, roughness: 0.55, metalness: 0.05 }));
    this.vaultMat = t(new THREE.MeshStandardMaterial({ map: brickTex, color: 0x8a8070, roughness: 0.85 }));
    this.waterMat = t(
      new THREE.MeshStandardMaterial({ color: 0x3e4a34, roughness: 0.08, metalness: 0.2, transparent: true, opacity: 0.72, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })
    );
    this.metalMat = t(new THREE.MeshStandardMaterial({ color: 0x4a4e52, roughness: 0.45, metalness: 0.8 }));
    this.rustMat = t(new THREE.MeshStandardMaterial({ color: 0x5a3020, roughness: 0.7, metalness: 0.5 }));

    // Wall: one 4.3 m brick panel, UVs scaled so the bricks keep their size (2.5 m per repeat)
    this.wallGeo = t(new THREE.BoxGeometry(CELL + T, H, T));
    this.wallGeo.translate(0, H / 2, 0);
    {
      const uv = this.wallGeo.attributes.uv as THREE.BufferAttribute;
      const faces: [number, number][] = [
        [T, H],
        [T, H],
        [CELL + T, T],
        [CELL + T, T],
        [CELL + T, H],
        [CELL + T, H],
      ];
      faces.forEach(([w, h], f) => {
        for (let k = 0; k < 4; k++) {
          const i = f * 4 + k;
          uv.setXY(i, (uv.getX(i) * w) / 2.5, (uv.getY(i) * h) / 2.5);
        }
      });
    }
    this.planeGeo = t(new THREE.PlaneGeometry(CH, CH));
    {
      const uv = this.planeGeo.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * CH) / 3, (uv.getY(i) * CH) / 3);
    }
    this.graffitiGeo = t(new THREE.PlaneGeometry(2.6, 0.75));
    this.puddleGeo = t(new THREE.CircleGeometry(1.25, 24));
    this.lampGeo = t(new THREE.BoxGeometry(0.35, 0.08, 0.2));
    this.barGeo = t(new THREE.CylinderGeometry(0.035, 0.035, H - 0.2, 6));

    this.scene.add(this.root);
    this.releaseT = [16, 13, 10, 8, 6][difficulty - 1] ?? 10;
    // forward = (-sin yaw, -cos yaw)
    this.startYaw = this.openS(0, 0) ? Math.PI : this.openE(0, 0) ? -Math.PI / 2 : this.openE(-1, 0) ? Math.PI / 2 : 0;
    this.placeValves();
    this.streamAround(this.start);
    this.buildStart();
    this.trail.push(new THREE.Vector3(OX, 0, OZ));
    // Exploration (difficulty 1): no creature, like the other chapters
    if (difficulty >= 2) this.spawnStalker();
  }

  // ---------------------------------------------------------------------
  // Maze topology (deterministic per run, infinite)
  // ---------------------------------------------------------------------
  private chunkMaze(cx: number, cz: number): ChunkMaze {
    const key = `${cx},${cz}`;
    const hit = this.mazes.get(key);
    if (hit) return hit;
    const r = rng(hashN(Math.floor(this.seed * 1e9), cx, cz, 1));
    const e = new Uint8Array(N * N);
    const s = new Uint8Array(N * N);
    const seen = new Uint8Array(N * N);
    const stack = [Math.floor(r() * N * N)];
    seen[stack[0]] = 1;
    while (stack.length) {
      const c = stack[stack.length - 1];
      const i = c % N;
      const j = Math.floor(c / N);
      const nb: [number, 'e' | 's' | 'w' | 'n'][] = [];
      if (i < N - 1 && !seen[c + 1]) nb.push([c + 1, 'e']);
      if (i > 0 && !seen[c - 1]) nb.push([c - 1, 'w']);
      if (j < N - 1 && !seen[c + N]) nb.push([c + N, 's']);
      if (j > 0 && !seen[c - N]) nb.push([c - N, 'n']);
      if (!nb.length) {
        stack.pop();
        continue;
      }
      const [n, d] = nb[Math.floor(r() * nb.length)];
      if (d === 'e') e[c] = 1;
      else if (d === 'w') e[n] = 1;
      else if (d === 's') s[c] = 1;
      else s[n] = 1;
      seen[n] = 1;
      stack.push(n);
    }
    // A few loops: you really can go round in circles
    for (let c = 0; c < N * N; c++) {
      if (c % N < N - 1 && !e[c] && r() < 0.1) e[c] = 1;
      if (Math.floor(c / N) < N - 1 && !s[c] && r() < 0.1) s[c] = 1;
    }
    const m = { e, s };
    this.mazes.set(key, m);
    return m;
  }

  private sd() {
    return Math.floor(this.seed * 1e9);
  }

  /** Passage between global cells (gx,gz) and (gx+1,gz). */
  public openE(gx: number, gz: number) {
    const cx = Math.floor(gx / N);
    const cz = Math.floor(gz / N);
    const i = gx - cx * N;
    const j = gz - cz * N;
    if (i < N - 1) return this.chunkMaze(cx, cz).e[j * N + i] === 1;
    const r1 = Math.floor(hashN(this.sd(), cx, cz, 7) * N);
    const r2 = Math.floor(hashN(this.sd(), cx, cz, 8) * N);
    return j === r1 || (hashN(this.sd(), cx, cz, 9) < 0.65 && j === r2);
  }

  /** Passage between global cells (gx,gz) and (gx,gz+1). */
  public openS(gx: number, gz: number) {
    const cx = Math.floor(gx / N);
    const cz = Math.floor(gz / N);
    const i = gx - cx * N;
    const j = gz - cz * N;
    if (j < N - 1) return this.chunkMaze(cx, cz).s[j * N + i] === 1;
    const r1 = Math.floor(hashN(this.sd(), cx, cz, 17) * N);
    const r2 = Math.floor(hashN(this.sd(), cx, cz, 18) * N);
    return i === r1 || (hashN(this.sd(), cx, cz, 19) < 0.65 && i === r2);
  }

  private neighbours(gx: number, gz: number): [number, number][] {
    const out: [number, number][] = [];
    if (this.openE(gx, gz)) out.push([gx + 1, gz]);
    if (this.openE(gx - 1, gz)) out.push([gx - 1, gz]);
    if (this.openS(gx, gz)) out.push([gx, gz + 1]);
    if (this.openS(gx, gz - 1)) out.push([gx, gz - 1]);
    return out;
  }

  /** Breadth-first distances (in cells) from a cell, up to `max`. */
  private bfs(gx: number, gz: number, max: number) {
    const dist = new Map<string, number>();
    const q: [number, number][] = [[gx, gz]];
    dist.set(`${gx},${gz}`, 0);
    for (let h = 0; h < q.length; h++) {
      const [x, z] = q[h];
      const d = dist.get(`${x},${z}`)!;
      if (d >= max) continue;
      for (const [nx, nz] of this.neighbours(x, z)) {
        const k = `${nx},${nz}`;
        if (dist.has(k)) continue;
        dist.set(k, d + 1);
        q.push([nx, nz]);
      }
    }
    return dist;
  }

  private cellOf(p: THREE.Vector3): [number, number] {
    return [Math.round((p.x - OX) / CELL), Math.round((p.z - OZ) / CELL)];
  }
  private cellPos(gx: number, gz: number, y = 0) {
    return new THREE.Vector3(OX + gx * CELL, y, OZ + gz * CELL);
  }

  // ---------------------------------------------------------------------
  // Valves (placed at the start of the run, further and further away)
  // ---------------------------------------------------------------------
  /** BFS that never enters the `avoid` cells; returns distances + parents. */
  private bfsAvoid(gx: number, gz: number, max: number, avoid: Set<string>) {
    const dist = new Map<string, number>();
    const parent = new Map<string, string>();
    const q: [number, number][] = [[gx, gz]];
    dist.set(`${gx},${gz}`, 0);
    for (let h = 0; h < q.length; h++) {
      const [x, z] = q[h];
      const k0 = `${x},${z}`;
      const d = dist.get(k0)!;
      if (d >= max) continue;
      for (const [nx, nz] of this.neighbours(x, z)) {
        const k = `${nx},${nz}`;
        if (dist.has(k) || avoid.has(k)) continue;
        dist.set(k, d + 1);
        parent.set(k, k0);
        q.push([nx, nz]);
      }
    }
    return { dist, parent };
  }

  /**
   * Each valve is further on, reachable WITHOUT going back along the way you
   * came (the Stalker is on that path). Valve 1 is never a dead end.
   */
  private placeValves() {
    const r = rng(hashN(this.sd(), 99));
    const placed: [number, number][] = [];
    const used = new Set<string>(['0,0']);
    let from: [number, number] = [0, 0];
    const wanted = [10, 10, 11];
    wanted.forEach((d, idx) => {
      const avoid = new Set(used);
      avoid.delete(`${from[0]},${from[1]}`);
      const { dist, parent } = this.bfsAvoid(from[0], from[1], d + 6, avoid);
      const all = [...dist.entries()].map(([k, v]) => [...(k.split(',').map(Number) as [number, number]), v] as [number, number, number]);
      let cands = all.filter(([, , v]) => v >= d && v <= d + 2);
      // The next valve must be reachable onwards: not a dead end
      if (idx < 2) {
        const open = cands.filter(([x, z]) => this.neighbours(x, z).length >= 2);
        if (open.length) cands = open;
      }
      const far = cands.filter(([x, z]) => placed.every(([px, pz]) => Math.hypot(px - x, pz - z) >= 4));
      if (far.length) cands = far;
      if (!cands.length) cands = all.sort((a, b) => b[2] - a[2]).slice(0, 3);
      const pick = cands[Math.floor(r() * cands.length)];
      const [gx, gz] = pick ? [pick[0], pick[1]] : [from[0] + 5, from[1] + 3];
      // Mark the way there as "used"
      let k: string | undefined = `${gx},${gz}`;
      while (k) {
        used.add(k);
        k = parent.get(k);
      }
      from = [gx, gz];
      placed.push([gx, gz]);
      this.buildValve(gx, gz);
    });
    this.usedPath = used;
    // Two documents: near the first and the last valve
    const near = (gx: number, gz: number) => {
      const nb = this.neighbours(gx, gz)[0] ?? [gx, gz];
      return this.cellPos(nb[0], nb[1], 0.02).add(new THREE.Vector3(0.6, 0, -0.5));
    };
    this.noteDrops = [
      {
        item: {
          id: 'note-m-lucas',
          name: 'Page de journal — « Lucas »',
          type: 'note',
          description: 'Une page arrachée, collée au mur par l\'humidité.',
          lore:
            '« Jour 41. Ils m\'ont redescendu ici. Je compte les virages pour ne pas devenir fou : gauche, gauche, droite… mais les murs bougent. Je le sais. Je reconnais les inscriptions et elles ne disent plus la même chose. Quelqu\'un marche derrière moi depuis des heures. Quand je m\'arrête, il s\'arrête. Quand je cours, il court. — L. »',
          icon: 'FileText',
        },
        pos: near(placed[0][0], placed[0][1]),
      },
      {
        item: {
          id: 'note-m-plan',
          name: 'Plan du Réseau 9 — annoté',
          type: 'note',
          description: 'Un plan trempé, couvert de croix au crayon rouge.',
          lore:
            '« RÉSEAU 9 — ZONE D\'ISOLEMENT. Le dédale a été conçu pour qu\'un sujet évadé ne retrouve JAMAIS la surface. Trois vannes de délestage ouvrent la plaque de maintenance. Le Traqueur (Sujet 09) suit l\'odeur et le bruit. Il ne s\'arrête pas. Il ne dort pas. Ne jamais revenir sur ses pas. — Dr É. Moreau »',
          icon: 'FileText',
        },
        pos: near(placed[2][0], placed[2][1]),
      },
    ];
  }

  /** A wall of the cell to mount something on: [nx, nz] = direction into the cell. */
  private wallSide(gx: number, gz: number): [number, number] | null {
    if (!this.openE(gx - 1, gz)) return [1, 0];
    if (!this.openE(gx, gz)) return [-1, 0];
    if (!this.openS(gx, gz - 1)) return [0, 1];
    if (!this.openS(gx, gz)) return [0, -1];
    return null;
  }

  private redLight(pos: THREE.Vector3, color: number, intensity: number, distance: number, mat: THREE.MeshStandardMaterial, flicker = true): FlickerLight {
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
    return l;
  }

  private buildValve(gx: number, gz: number) {
    const c = this.cellPos(gx, gz);
    const side = this.wallSide(gx, gz) ?? [0, 1];
    const wallOff = CELL / 2 - T / 2;
    const base = c.clone().add(new THREE.Vector3(-side[0] * wallOff, 0, -side[1] * wallOff));
    const g = new THREE.Group();
    g.position.copy(base);
    g.rotation.y = Math.atan2(side[0], side[1]);
    // Big vertical pipe + the red wheel
    const pipe = new THREE.Mesh(this.trackGeo(new THREE.CylinderGeometry(0.22, 0.22, H, 14)), this.rustMat);
    pipe.position.set(0, H / 2, 0.3);
    g.add(pipe);
    const box = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(0.7, 0.5, 0.4)), this.metalMat);
    box.position.set(0, 1.3, 0.45);
    g.add(box);
    const wheelMat = this.trackMat(new THREE.MeshStandardMaterial({ color: 0xb01818, roughness: 0.4, metalness: 0.4, emissive: 0x400000, emissiveIntensity: 0.6 }));
    const wheel = new THREE.Mesh(this.trackGeo(new THREE.TorusGeometry(0.38, 0.045, 8, 24)), wheelMat);
    wheel.position.set(0, 1.3, 0.7);
    for (let k = 0; k < 3; k++) {
      const spoke = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(0.74, 0.04, 0.04)), wheelMat);
      spoke.rotation.z = (k * Math.PI) / 3;
      wheel.add(spoke);
    }
    g.add(wheel);
    // Warning lamp above it
    const lampMat = this.trackMat(new THREE.MeshStandardMaterial({ color: 0x300000, emissive: 0xff2010, emissiveIntensity: 2.5 }));
    const lamp = new THREE.Mesh(this.trackGeo(new THREE.SphereGeometry(0.1, 10, 8)), lampMat);
    lamp.position.set(0, 2.6, 0.25);
    g.add(lamp);
    this.root.add(g);
    const pos = c.clone().add(new THREE.Vector3(-side[0] * (wallOff - 0.7), 0, -side[1] * (wallOff - 0.7)));
    const light = this.redLight(new THREE.Vector3(pos.x, 2.5, pos.z), 0xff2a10, 5, 9, lampMat);
    this.valves.push({ gx, gz, pos, wheel, open: false, spin: 0, light });
    // Collision for the pipe & box
    const w = new THREE.Vector3(0, 0, 0.45).applyAxisAngle(new THREE.Vector3(0, 1, 0), g.rotation.y).add(base);
    this.map.collisionBoxes.push({ min: new THREE.Vector3(w.x - 0.4, 0, w.z - 0.4), max: new THREE.Vector3(w.x + 0.4, H, w.z + 0.4) });
  }

  private trackGeo<G extends THREE.BufferGeometry>(g: G) {
    this.disposables.push(g);
    return g;
  }
  private trackMat<M extends THREE.Material>(m: M) {
    this.disposables.push(m);
    return m;
  }

  /** Start cell: the broken ladder you came down. */
  private buildStart() {
    const g = new THREE.Group();
    g.position.set(OX, 0, OZ - 1.6);
    for (const s of [-1, 1]) {
      const rail = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(0.05, 2.2, 0.05)), this.rustMat);
      rail.position.set(s * 0.25, 2.4, 0);
      g.add(rail);
    }
    for (let i = 0; i < 6; i++) {
      const rung = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(0.5, 0.03, 0.03)), this.rustMat);
      rung.position.set(0, 1.5 + i * 0.32, 0);
      g.add(rung);
    }
    const fallen = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(0.5, 0.05, 1.4)), this.rustMat);
    fallen.position.set(0.6, 0.05, 0.6);
    fallen.rotation.y = 0.5;
    g.add(fallen);
    this.root.add(g);
  }

  // ---------------------------------------------------------------------
  // Streaming
  // ---------------------------------------------------------------------
  private streamAround(p: THREE.Vector3) {
    const cx = Math.floor(((p.x - OX) / CELL + 0.5) / N);
    const cz = Math.floor(((p.z - OZ) / CELL + 0.5) / N);
    const key = `${cx},${cz}`;
    if (key === this.curChunk) return;
    this.curChunk = key;
    const want = new Set<string>();
    for (let dx = -LOAD_R; dx <= LOAD_R; dx++) for (let dz = -LOAD_R; dz <= LOAD_R; dz++) want.add(`${cx + dx},${cz + dz}`);
    for (const [k, ch] of this.chunks) if (!want.has(k)) this.unloadChunk(k, ch);
    for (const k of want) if (!this.chunks.has(k)) {
      const [x, z] = k.split(',').map(Number);
      this.chunks.set(k, this.buildChunk(x, z));
    }
  }

  private unloadChunk(k: string, ch: Chunk) {
    this.root.remove(ch.group);
    const boxes = new Set(ch.boxes);
    this.map.collisionBoxes = this.map.collisionBoxes.filter((b) => !boxes.has(b));
    const lights = new Set(ch.lights);
    this.map.lights = this.map.lights.filter((l) => !lights.has(l));
    const water = new Set(ch.water);
    this.map.sewer.water = this.map.sewer.water.filter((w) => !water.has(w));
    ch.disposables.forEach((d) => d.dispose());
    for (const g of this.gates.values()) if (g.mesh && g.mesh.parent === ch.group) g.mesh = null;
    this.chunks.delete(k);
  }

  private graffitiMat(text: string) {
    let m = this.graffitiMats.get(text);
    if (!m) {
      m = this.trackMat(
        new THREE.MeshStandardMaterial({ map: Tex.getGraffitiTexture(text), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, roughness: 0.35 })
      );
      this.graffitiMats.set(text, m);
    }
    return m;
  }

  private buildChunk(cx: number, cz: number): Chunk {
    const group = new THREE.Group();
    const boxes: CollisionBox[] = [];
    const lights: FlickerLight[] = [];
    const water: LowZone[] = [];
    const disposables: { dispose: () => void }[] = [];
    const walls: THREE.Matrix4[] = [];
    const q = new THREE.Quaternion();
    const one = new THREE.Vector3(1, 1, 1);
    const up = new THREE.Vector3(0, 1, 0);
    const sd = this.sd();
    const phase = Math.min(3, this.valvesOpen + (this.exitOpen ? 1 : 0));

    for (let j = 0; j < N; j++)
      for (let i = 0; i < N; i++) {
        const gx = cx * N + i;
        const gz = cz * N + j;
        const x0 = OX + gx * CELL;
        const z0 = OZ + gz * CELL;
        const westClosed = !this.openE(gx - 1, gz);
        const northClosed = !this.openS(gx, gz - 1);
        if (westClosed) {
          const x = x0 - CELL / 2;
          walls.push(new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z0), q.clone().setFromAxisAngle(up, Math.PI / 2), one));
          boxes.push({ min: new THREE.Vector3(x - T / 2, 0, z0 - CELL / 2 - T / 2), max: new THREE.Vector3(x + T / 2, H, z0 + CELL / 2 + T / 2) });
        }
        if (northClosed) {
          const z = z0 - CELL / 2;
          walls.push(new THREE.Matrix4().compose(new THREE.Vector3(x0, 0, z), q.clone().identity(), one));
          boxes.push({ min: new THREE.Vector3(x0 - CELL / 2 - T / 2, 0, z - T / 2), max: new THREE.Vector3(x0 + CELL / 2 + T / 2, H, z + T / 2) });
        }
        // Graffiti on a wall of this cell (it changes as you open valves…)
        const hg = hashN(sd, gx, gz, 41);
        if (hg < 0.11 && (westClosed || northClosed) && !(gx === 0 && gz === 0)) {
          const list = GRAFFITI[phase];
          const text = list[Math.floor(hashN(sd, gx, gz, 42) * list.length)];
          const d = new THREE.Mesh(this.graffitiGeo, this.graffitiMat(text));
          if (westClosed) {
            d.position.set(x0 - CELL / 2 + T / 2 + 0.01, 1.9 + hashN(sd, gx, gz, 43) * 0.6, z0);
            d.rotation.y = Math.PI / 2;
          } else {
            d.position.set(x0, 1.9 + hashN(sd, gx, gz, 43) * 0.6, z0 - CELL / 2 + T / 2 + 0.01);
          }
          group.add(d);
        }
        // Stagnant water
        if (hashN(sd, gx, gz, 51) < 0.17 && !(gx === 0 && gz === 0)) {
          const pd = new THREE.Mesh(this.puddleGeo, this.waterMat);
          pd.rotation.x = -Math.PI / 2;
          pd.rotation.z = hashN(sd, gx, gz, 52) * Math.PI;
          pd.scale.set(0.8 + hashN(sd, gx, gz, 53) * 0.35, 0.55 + hashN(sd, gx, gz, 54) * 0.35, 1);
          pd.position.set(x0, 0.025, z0);
          group.add(pd);
          water.push({ minX: x0 - 0.9, maxX: x0 + 0.9, minZ: z0 - 0.9, maxZ: z0 + 0.9 });
        }
        // A dying bulb
        if (hashN(sd, gx, gz, 61) < 0.16 || (gx === 0 && gz === 0)) {
          const mat = new THREE.MeshStandardMaterial({ color: 0x222018, emissive: 0xffd9a0, emissiveIntensity: 2 });
          disposables.push(mat);
          const lamp = new THREE.Mesh(this.lampGeo, mat);
          lamp.position.set(x0, H - 0.05, z0);
          group.add(lamp);
          const warm = hashN(sd, gx, gz, 62) < 0.6;
          const l: FlickerLight = {
            position: new THREE.Vector3(x0, H - 0.35, z0),
            color: new THREE.Color(warm ? 0xffc890 : 0xb8d0a0),
            distance: 10,
            k: 1,
            current: 0,
            fixtureMat: mat,
            baseIntensity: 4.2,
            baseEmissive: 2,
            nextFlicker: Math.random() * 3,
            flicker: hashN(sd, gx, gz, 63) < 0.7,
            needsPower: false,
          };
          lights.push(l);
          this.map.lights.push(l);
        }
        // Grilles (portcullis) in some passages: drop them behind you
        for (const axis of ['e', 's'] as const) {
          const open = axis === 'e' ? this.openE(gx, gz) : this.openS(gx, gz);
          if (!open || hashN(sd, gx, gz, axis === 'e' ? 71 : 72) > 0.07 || (Math.abs(gx) + Math.abs(gz) < 2)) continue;
          const key = `${gx},${gz},${axis}`;
          let gate = this.gates.get(key);
          if (!gate) {
            gate = {
              key,
              x: axis === 'e' ? x0 + CELL / 2 : x0,
              z: axis === 'e' ? z0 : z0 + CELL / 2,
              axis: axis === 'e' ? 'z' : 'x',
              closed: false,
              broken: false,
              mesh: null,
              box: null,
              drop: 0,
            };
            this.gates.set(key, gate);
          }
          gate.mesh = this.buildGateMesh(gate);
          group.add(gate.mesh);
          if (gate.closed && !gate.broken && gate.box) boxes.push(gate.box);
        }
      }

    if (walls.length) {
      const inst = new THREE.InstancedMesh(this.wallGeo, this.brickMat, walls.length);
      walls.forEach((m, i) => inst.setMatrixAt(i, m));
      inst.instanceMatrix.needsUpdate = true;
      inst.computeBoundingSphere();
      disposables.push({ dispose: () => inst.dispose() });
      group.add(inst);
    }
    const minX = OX + (cx * N - 0.5) * CELL;
    const minZ = OZ + (cz * N - 0.5) * CELL;
    const floor = new THREE.Mesh(this.planeGeo, this.floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(minX + CH / 2, 0, minZ + CH / 2);
    floor.receiveShadow = true;
    group.add(floor);
    const ceil = new THREE.Mesh(this.planeGeo, this.vaultMat);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(minX + CH / 2, H, minZ + CH / 2);
    group.add(ceil);

    this.root.add(group);
    this.map.collisionBoxes.push(...boxes);
    this.map.sewer.water.push(...water);
    return { group, boxes, lights, water, disposables };
  }

  private buildGateMesh(g: Gate) {
    const m = new THREE.Group();
    m.position.set(g.x, 0, g.z);
    if (g.axis === 'z') m.rotation.y = Math.PI / 2;
    const bars = new THREE.Group();
    for (let k = -4; k <= 4; k++) {
      const b = new THREE.Mesh(this.barGeo, this.rustMat);
      b.position.set(k * 0.42, (H - 0.2) / 2, 0);
      bars.add(b);
    }
    for (const y of [0.4, 1.6, 2.8]) {
      const cross = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(CELL - 0.3, 0.06, 0.06)), this.rustMat);
      cross.position.set(0, y, 0);
      bars.add(cross);
    }
    bars.position.y = g.closed ? 0 : H - 0.45;
    if (g.broken) {
      bars.rotation.x = 1.2;
      bars.position.set(0, 0.2, 0.9);
    }
    bars.name = 'bars';
    m.add(bars);
    // Frame
    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(0.16, H, 0.25)), this.metalMat);
      post.position.set(s * (CELL / 2 - 0.15), H / 2, 0);
      m.add(post);
    }
    return m;
  }

  private dropGate(g: Gate) {
    g.closed = true;
    g.drop = 0.35;
    const half = CELL / 2;
    g.box =
      g.axis === 'x'
        ? { min: new THREE.Vector3(g.x - half, 0, g.z - 0.12), max: new THREE.Vector3(g.x + half, H, g.z + 0.12) }
        : { min: new THREE.Vector3(g.x - 0.12, 0, g.z - half), max: new THREE.Vector3(g.x + 0.12, H, g.z + half) };
    this.map.collisionBoxes.push(g.box);
    const ch = [...this.chunks.values()].find((c) => g.mesh && c.group.children.includes(g.mesh));
    ch?.boxes.push(g.box);
    sound.playDoorSlam();
    sound.playCanClank(1.4);
    this.gatesDropped++;
  }

  private breakGate(g: Gate) {
    g.broken = true;
    if (g.box) {
      const b = g.box;
      this.map.collisionBoxes = this.map.collisionBoxes.filter((x) => x !== b);
      for (const c of this.chunks.values()) c.boxes = c.boxes.filter((x) => x !== b);
    }
    g.box = null;
    const bars = g.mesh?.getObjectByName('bars');
    if (bars) {
      bars.rotation.x = 1.2;
      bars.position.set(0, 0.2, 0.9);
    }
    sound.playDoorSlam();
    sound.playCanClank(1.6, 0.1);
  }

  // ---------------------------------------------------------------------
  // The Stalker
  // ---------------------------------------------------------------------
  private spawnStalker() {
    const m = new MonsterAI(new THREE.Vector3(OX, -50, OZ), this.map.navNodes, [], this.map.doors, () => {}, 0);
    m.makeBlind();
    m.mesh.visible = false;
    this.stalker = m;
    this.scene.add(m.mesh);
  }

  /** A noise: running, splashing, a dropped grille, a valve… makes it sprint. */
  public hear(origin: THREE.Vector3, loudness: number) {
    const s = this.stalker;
    if (!s || !this.released) return;
    const d = origin.distanceTo(s.position);
    if (d < loudness * 2.4) this.frenzy = Math.max(this.frenzy, loudness >= 30 ? 7 : 3.5);
  }

  public stun(seconds: number) {
    this.stunT = Math.max(this.stunT, seconds);
  }

  private speeds() {
    const i = Math.max(0, Math.min(4, this.difficulty - 1));
    return { walk: [2.0, 2.35, 2.6, 2.85, 3.05][i], run: [3.8, 4.4, 4.9, 5.25, 5.6][i] };
  }

  /** Returns true if the player got caught. */
  private updateStalker(delta: number, player: THREE.Vector3, listener: Listener, onCatch: () => void, onRelease: () => void) {
    const s = this.stalker;
    if (!s) return;
    // Record the player's trail
    const last = this.trail[this.trail.length - 1];
    if (Math.hypot(player.x - last.x, player.z - last.z) > 0.5) this.trail.push(new THREE.Vector3(player.x, 0, player.z));

    if (!this.released) {
      this.releaseT -= delta;
      if (this.releaseT <= 0) {
        this.released = true;
        s.placeAt(OX, OZ - 1.2);
        s.mesh.visible = true;
        sound.playDoorSlam();
        sound.playMonsterChaseRoar();
        onRelease();
      }
      return;
    }
    // Sedative syringe: 5 s on its knees
    if (s.state === 'STUNNED') {
      if (this.stunT <= 0) this.stunT = 5;
      this.stunT -= delta;
      if (this.stunT <= 0) {
        this.stunT = 0;
        s.state = 'SEARCH';
        this.frenzy = 3;
      } else {
        s.driveToward(s.position, 0, delta, [], listener, false);
        return;
      }
    }
    this.frenzy = Math.max(0, this.frenzy - delta);

    // Bashing a grille
    if (this.bashing) {
      this.bashT -= delta;
      s.driveToward(new THREE.Vector3(this.bashing.x, 0, this.bashing.z), 0, delta, this.map.collisionBoxes, listener, true);
      if (Math.random() < delta * 2.2) {
        sound.playDoorSlam();
        sound.playCanClank(1.2);
      }
      if (this.bashT <= 0) {
        this.breakGate(this.bashing);
        this.bashing = null;
        this.frenzy = 4;
      }
      return;
    }

    // Follow the trail
    let target = this.trail[Math.min(this.trailIdx, this.trail.length - 1)];
    while (this.trailIdx < this.trail.length - 1 && Math.hypot(target.x - s.position.x, target.z - s.position.z) < 0.45) {
      this.trailIdx++;
      target = this.trail[this.trailIdx];
    }
    const dPlayer = Math.hypot(player.x - s.position.x, player.z - s.position.z);
    if (this.trailIdx >= this.trail.length - 1) target = new THREE.Vector3(player.x, 0, player.z);

    // A closed grille on its way: it stops and tears it out
    for (const g of this.gates.values()) {
      if (!g.closed || g.broken) continue;
      if (Math.hypot(g.x - s.position.x, g.z - s.position.z) < 1.1) {
        this.bashing = g;
        this.bashT = [7, 6, 5, 4.5, 4][Math.max(0, Math.min(4, this.difficulty - 1))];
        sound.playMonsterChaseRoar();
        return;
      }
    }

    const sp = this.speeds();
    // Close behind you: it smells you and lunges
    const speed = this.frenzy > 0 || dPlayer < 6 ? sp.run : sp.walk;
    // (no collisions: your own trail is always a free path)
    s.driveToward(target, speed, delta, [], listener, this.frenzy > 0 || dPlayer < 9);

    // Never too far behind: it catches up along your trail out of sight
    this.lagCheck -= delta;
    if (this.lagCheck <= 0) {
      this.lagCheck = 1;
      let rest = 0;
      for (let i = this.trail.length - 1; i > this.trailIdx; i--) rest += this.trail[i].distanceTo(this.trail[i - 1]);
      const maxLag = [70, 58, 48, 42, 36][Math.max(0, Math.min(4, this.difficulty - 1))];
      if (rest > maxLag && dPlayer > 26) {
        let acc = 0;
        let i = this.trail.length - 1;
        while (i > this.trailIdx + 1 && acc < maxLag * 0.7) {
          acc += this.trail[i].distanceTo(this.trail[i - 1]);
          i--;
        }
        // Don't jump past a closed grille
        const blockedBy = [...this.gates.values()].some((g) => g.closed && !g.broken && this.trail.slice(this.trailIdx, i).some((p) => Math.hypot(p.x - g.x, p.z - g.z) < 1.2));
        if (!blockedBy) {
          this.trailIdx = i;
          s.placeAt(this.trail[i].x, this.trail[i].z);
        }
      }
      // Forget the oldest part of the trail
      if (this.trailIdx > 400) {
        this.trail.splice(0, 300);
        this.trailIdx -= 300;
      }
    }

    if (dPlayer < 1.05) onCatch();
  }

  // ---------------------------------------------------------------------
  // Per frame
  // ---------------------------------------------------------------------
  public update(delta: number, player: THREE.Vector3, listener: Listener, onCatch: () => void, onRelease: () => void) {
    this.streamAround(player);
    for (const v of this.valves) {
      if (v.spin > 0) {
        v.spin = Math.max(0, v.spin - delta);
        v.wheel.rotation.z += delta * 7;
      }
    }
    for (const g of this.gates.values()) {
      if (g.drop > 0 && g.mesh) {
        g.drop = Math.max(0, g.drop - delta);
        const bars = g.mesh.getObjectByName('bars');
        if (bars && !g.broken) bars.position.y = (g.drop / 0.35) * (H - 0.45);
      }
    }
    this.beacon(delta, listener);
    this.updateStalker(delta, player, listener, onCatch, onRelease);
  }

  private nearestValve(p: THREE.Vector3) {
    let best: Valve | null = null;
    let bd = Infinity;
    for (const v of this.valves) {
      if (v.open) continue;
      const d = Math.hypot(v.pos.x - p.x, v.pos.z - p.z);
      if (d < bd) {
        bd = d;
        best = v;
      }
    }
    return best ? { v: best, d: bd } : null;
  }

  private nearGate(p: THREE.Vector3) {
    for (const g of this.gates.values()) if (!g.closed && !g.broken && Math.hypot(g.x - p.x, g.z - p.z) < 1.7) return g;
    return null;
  }

  public hint(p: THREE.Vector3): string | null {
    if (this.exit && Math.hypot(this.exit.pos.x - p.x, this.exit.pos.z - p.z) < 1.8) return '[E] Grimper à l\'échelle — SORTIE';
    const v = this.nearestValve(p);
    if (v && v.d < 1.9) return '[E] Tourner la vanne (bruyant !)';
    if (this.nearGate(p)) return '[E] Abaisser la grille derrière vous (bruyant)';
    return null;
  }

  /** [E] near a maze object. 'exit' = climb out. */
  public interact(p: THREE.Vector3, yaw: number): 'exit' | 'valve' | 'gate' | null {
    if (this.exit && Math.hypot(this.exit.pos.x - p.x, this.exit.pos.z - p.z) < 1.8) return 'exit';
    const v = this.nearestValve(p);
    if (v && v.d < 1.9) {
      v.v.open = true;
      v.v.spin = 1.6;
      v.v.light.color.set(0x30ff60);
      v.v.light.fixtureMat.emissive.set(0x20ff40);
      v.v.light.flicker = false;
      this.valvesOpen++;
      sound.playBreakerClunk();
      sound.playDistantSlam(0);
      // The whole network hears it
      this.frenzy = Math.max(this.frenzy, 6);
      if (this.valvesOpen >= 3) this.openExit(p, yaw);
      return 'valve';
    }
    const g = this.nearGate(p);
    if (g) {
      this.dropGate(g);
      return 'gate';
    }
    return null;
  }

  private openExit(p: THREE.Vector3, _yaw: number) {
    this.exitOpen = true;
    const [gx, gz] = this.cellOf(p);
    // Onwards only: never back along the way you came (that's where it is)
    const avoid = new Set(this.usedPath);
    avoid.delete(`${gx},${gz}`);
    let fromP = this.bfsAvoid(gx, gz, 14, avoid).dist;
    if (![...fromP.values()].some((d) => d >= 6)) fromP = this.bfs(gx, gz, 14);
    const s = this.stalker ? this.cellOf(this.stalker.position) : [0, 0];
    const fromS = this.bfs(s[0], s[1], 26);
    let best: [number, number] | null = null;
    let score = -Infinity;
    for (const [k, d] of fromP) {
      if (d < 6 || d > 10) continue;
      const [x, z] = k.split(',').map(Number);
      const sc = (fromS.get(k) ?? 30) + Math.random() * 2;
      if (sc > score) {
        score = sc;
        best = [x, z];
      }
    }
    const [ex, ez] = best ?? [gx + 6, gz];
    const pos = this.cellPos(ex, ez);
    const group = new THREE.Group();
    group.position.copy(pos);
    // Ladder up to an open manhole, a shaft of pale moonlight
    for (const sx of [-0.25, 0.25]) {
      const rail = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(0.05, H, 0.05)), this.metalMat);
      rail.position.set(sx, H / 2, 0);
      group.add(rail);
    }
    for (let i = 0; i < 10; i++) {
      const rung = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(0.5, 0.03, 0.03)), this.metalMat);
      rung.position.set(0, 0.3 + i * 0.32, 0);
      group.add(rung);
    }
    const beamMat = this.trackMat(new THREE.MeshBasicMaterial({ color: 0xbfd4ff, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide }));
    const beam = new THREE.Mesh(this.trackGeo(new THREE.CylinderGeometry(0.7, 1.1, H, 20, 1, true)), beamMat);
    beam.position.y = H / 2;
    group.add(beam);
    const holeMat = this.trackMat(new THREE.MeshStandardMaterial({ color: 0x223040, emissive: 0x9fb8ff, emissiveIntensity: 2.2 }));
    const hole = new THREE.Mesh(this.trackGeo(new THREE.CircleGeometry(0.7, 20)), holeMat);
    hole.rotation.x = Math.PI / 2;
    hole.position.y = H - 0.01;
    group.add(hole);
    this.root.add(group);
    const light = this.redLight(new THREE.Vector3(pos.x, H - 0.4, pos.z), 0xa8c0ff, 9, 14, holeMat, false);
    this.exit = { pos, group, light };
    // Everything written on the walls changes now
    this.refreshGraffiti(p);
  }

  /** Rebuild loaded chunks so the graffiti read differently (keeps gates). */
  private refreshGraffiti(p: THREE.Vector3) {
    for (const [k, ch] of [...this.chunks]) this.unloadChunk(k, ch);
    this.curChunk = '';
    this.streamAround(p);
  }

  // ---------------------------------------------------------------------
  // Chalk: [R] draws an arrow on the floor, pointing where you look
  // ---------------------------------------------------------------------
  private marks: THREE.Mesh[] = [];
  private chalkMat: THREE.MeshStandardMaterial | null = null;
  private chalkGeo: THREE.PlaneGeometry | null = null;
  public chalkLeft = 40;

  public chalk(p: THREE.Vector3, yaw: number): boolean {
    if (this.chalkLeft <= 0) return false;
    if (!this.chalkMat) {
      const c = document.createElement('canvas');
      c.width = 128;
      c.height = 128;
      const g = c.getContext('2d')!;
      g.strokeStyle = 'rgba(235,235,225,0.92)';
      g.lineWidth = 11;
      g.lineCap = 'round';
      g.lineJoin = 'round';
      // An arrow pointing "up" in the texture (= forward on the floor)
      g.beginPath();
      g.moveTo(64, 112);
      g.lineTo(64, 22);
      g.moveTo(30, 54);
      g.lineTo(64, 20);
      g.lineTo(98, 54);
      g.stroke();
      // Chalk grain
      g.globalCompositeOperation = 'destination-out';
      for (let i = 0; i < 900; i++) g.fillRect(Math.random() * 128, Math.random() * 128, 1.5, 1.5);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      this.disposables.push(tex);
      this.chalkMat = this.trackMat(
        new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, roughness: 0.9, emissive: 0x303030, emissiveIntensity: 0.4 })
      );
      this.chalkGeo = this.trackGeo(new THREE.PlaneGeometry(0.9, 0.9));
    }
    const m = new THREE.Mesh(this.chalkGeo!, this.chalkMat);
    m.rotation.order = 'YXZ';
    m.rotation.set(-Math.PI / 2, yaw, 0);
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    m.position.set(p.x + fx * 0.9, 0.03, p.z + fz * 0.9);
    this.root.add(m);
    this.marks.push(m);
    this.chalkLeft--;
    sound.playChalk();
    return true;
  }

  // ---------------------------------------------------------------------
  // Supplies & coins scattered in the first part of the maze
  // ---------------------------------------------------------------------
  public supplyDrops(): { item: GameItem; pos: THREE.Vector3 }[] {
    const r = rng(hashN(this.sd(), 123));
    const dist = this.bfs(0, 0, 34);
    const valveCells = new Set(this.valves.map((v) => `${v.gx},${v.gz}`));
    const cells = [...dist.entries()].filter(([k, d]) => d >= 3 && !valveCells.has(k)).map(([k]) => k.split(',').map(Number) as [number, number]);
    const out: { item: GameItem; pos: THREE.Vector3 }[] = [];
    const taken = new Set<string>();
    let n = 0;
    const put = (item: GameItem) => {
      for (let tries = 0; tries < 20; tries++) {
        const c = cells[Math.floor(r() * cells.length)];
        if (!c || taken.has(`${c[0]},${c[1]}`)) continue;
        taken.add(`${c[0]},${c[1]}`);
        out.push({ item, pos: this.cellPos(c[0], c[1], 0.02).add(new THREE.Vector3((r() - 0.5) * 1.6, 0, (r() - 0.5) * 1.6)) });
        return;
      }
    };
    const supply = (type: 'battery' | 'food' | 'sedative' | 'medkit'): GameItem => {
      const id = `m3-${type}-${++n}`;
      if (type === 'battery') return { id, name: 'Pile', type, description: 'Recharge 55 % de la batterie de la lampe torche.', icon: 'BatteryCharging' };
      if (type === 'food') return { id, name: 'Barre de céréales', type, description: 'Redonne 40 points d\'endurance.', icon: 'Cookie' };
      if (type === 'sedative') return { id, name: 'Seringue de Sédatif', type, description: 'Immobilise le Traqueur 5 secondes (à moins de 3 m, face à lui).', icon: 'Syringe' };
      return { id, name: 'Adrénaline', type, description: 'Auto-injecteur : endurance au maximum.', icon: 'HeartPulse' };
    };
    (['battery', 'battery', 'battery', 'battery', 'food', 'food', 'food', 'sedative', 'sedative', 'medkit'] as const).forEach((t) => put(supply(t)));
    for (let i = 0; i < 7; i++) {
      const q = 5 + Math.floor(r() * 9);
      put({ id: `m3-coins-${++n}`, name: `${q} pièces`, type: 'coins', description: 'De vieilles pièces. Gardées si vous sortez vivant.', icon: 'Coins', quantity: q });
    }
    return out;
  }

  // ---------------------------------------------------------------------
  // Beacon: the next valve's pipe rings now and then (direction by ear)
  // ---------------------------------------------------------------------
  private beaconT = 4;
  private beacon(delta: number, listener: Listener) {
    this.beaconT -= delta;
    if (this.beaconT > 0) return;
    this.beaconT = 7 + Math.random() * 3;
    const target = this.exit?.pos ?? this.valves.find((v) => !v.open)?.pos;
    if (!target) return;
    const to = target.clone().sub(listener.pos).setY(0);
    const d = to.length();
    if (d < 3) return;
    const pan = THREE.MathUtils.clamp(to.normalize().dot(listener.right), -1, 1);
    sound.playPipeKnock(pan, 1 - Math.min(1, d / 90) * 0.85);
  }

  public objective(p: THREE.Vector3, yaw: number): string {
    const dirWord = (tx: number, tz: number) => {
      const dx = tx - p.x;
      const dz = tz - p.z;
      const fx = -Math.sin(yaw);
      const fz = -Math.cos(yaw);
      const rx = Math.cos(yaw);
      const rz = -Math.sin(yaw);
      const f = dx * fx + dz * fz;
      const r = dx * rx + dz * rz;
      const a = Math.atan2(r, f);
      if (Math.abs(a) < Math.PI / 4) return 'devant vous';
      if (Math.abs(a) > (3 * Math.PI) / 4) return 'derrière vous';
      return a > 0 ? 'sur votre droite' : 'sur votre gauche';
    };
    if (this.exit) {
      const d = Math.round(Math.hypot(this.exit.pos.x - p.x, this.exit.pos.z - p.z));
      return `La plaque s'est ouverte ! Sortie à ~${d} m, ${dirWord(this.exit.pos.x, this.exit.pos.z)} (lumière bleue)`;
    }
    // Always point at the next valve in the chain (they lead onwards, never back)
    const v = this.valves.find((x) => !x.open);
    if (!v) return 'Trouvez la sortie.';
    const d = Math.round(Math.hypot(v.pos.x - p.x, v.pos.z - p.z));
    return `Vannes ouvertes : ${this.valvesOpen}/3 — prochaine vanne à ~${d} m, ${dirWord(v.pos.x, v.pos.z)} (lampe rouge) · [R] craie : ${this.chalkLeft}`;
  }

  public dispose() {
    for (const [k, ch] of [...this.chunks]) this.unloadChunk(k, ch);
    const own = new Set<FlickerLight>(this.valves.map((v) => v.light));
    if (this.exit) own.add(this.exit.light);
    this.map.lights = this.map.lights.filter((l) => !own.has(l));
    this.scene.remove(this.root);
    // (the Stalker is in the engine's monster list, which disposes it)
    this.stalker = null;
    this.disposables.forEach((d) => d.dispose());
  }
}
