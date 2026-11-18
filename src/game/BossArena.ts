import * as THREE from 'three';
import type { CollisionBox, MapData } from './MapBuilder';
import { MonsterAI, Listener } from './MonsterAI';
import { sound } from '../audio/SoundSystem';
import { GameItem } from '../types';
import type { SiteAction, SitePlayer } from './SiteB';

/**
 * CHAPTER 7 — LE CŒUR (final boss)
 * Under Saint-Aurore, the round hall where the Protocole Aurore was born.
 * Dr Moreau injected himself with the original strain: he is the real
 * Patient Zéro. Three phases:
 *  1. he hunts you: burn him with the UV lamp [R];
 *  2. the lights die: arm the 4 UV projectors on the walls and lure him
 *     into their beam;
 *  3. he vanishes and reappears right behind you: turn around and burn him.
 * At 0 he collapses: inject the antidote [E] before he gets up again.
 */
const OX = 1200;
const OZ = 400;
const CELL = 1.5;
const G = 24;
const R = 16.5;
const MAX_HP = 100;

type Phase = 'hunt' | 'dark' | 'fury' | 'down' | 'over';

export interface CoreNet {
  ph: Phase;
  hp: number;
  pj: number[];
  dn: number;
}

interface Projector {
  pos: THREE.Vector3;
  dir: THREE.Vector3;
  /** 0 = off, 1 = arming, 2 = armed, 3 = burnt out */
  state: number;
  lens: THREE.MeshStandardMaterial;
  light: THREE.SpotLight;
  beam: THREE.Mesh;
}

export class BossArena {
  public readonly start = new THREE.Vector3(0, 1.72, 0);
  public readonly startYaw = 0;
  public stalker: MonsterAI | null = null;
  public noteDrops: { item: GameItem; pos: THREE.Vector3 }[] = [];
  /** used by the engine for the ambient light (0..1 flashes) */
  public flash = 0;
  /** the player's lamp in UV mode */
  public uv = false;
  public guest = false;
  public ending: 'MOREAU' | null = null;
  public phase: Phase = 'hunt';
  public hp = MAX_HP;

  private root = new THREE.Group();
  private boxes: CollisionBox[] = [];
  private blocked = new Uint8Array(G * G);
  private disposables: { dispose: () => void }[] = [];
  private r: () => number;
  private projectors: Projector[] = [];
  private arming = -1;
  private armT = 0;
  private lamps: THREE.PointLight[] = [];
  private center = new THREE.Vector3(OX, 0, OZ);
  private target = new THREE.Vector3();
  private path: THREE.Vector3[] = [];
  private pathT = 0;
  private roarCd = 0;
  private hissCd = 0;
  private blinkT = 8;
  private blinking = 0;
  private dazed = 0;
  private downT = 0;
  private awake = 0;
  private hitTips = new Set<string>();
  /** level stalkers are woken up by their level, not by MonsterAI */
  private stunT = 0;
  private stunBoss(t: number) {
    this.stalker?.stun(t);
    this.stunT = t;
  }

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
    this.start.copy(this.w(12, 19, 1.72));
    this.build();
    this.makeNotes();
    this.spawnBoss();
    // He wakes up a few seconds after you come in (sooner when it's harder)
    this.awake = difficulty >= 2 ? [0, 0, 7, 6, 5, 4][difficulty] ?? 6 : 1e9;
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
        [1, 1],
        [-1, 1],
        [1, -1],
        [-1, -1],
      ]) {
        const nx = x + dx;
        const nz = z + dz;
        if (!this.isFloor(nx, nz)) continue;
        // no corner cutting
        if (dx && dz && (!this.isFloor(x + dx, z) || !this.isFloor(x, z + dz))) continue;
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
  // Building the hall
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
  private blockRect(gx0: number, gz0: number, gx1: number, gz1: number) {
    for (let gz = gz0; gz <= gz1; gz++) for (let gx = gx0; gx <= gx1; gx++) this.blocked[gz * G + gx] = 1;
    const a = this.w(gx0, gz0);
    const b = this.w(gx1, gz1);
    this.box(a.x - CELL / 2 + 0.05, a.z - CELL / 2 + 0.05, b.x + CELL / 2 - 0.05, b.z + CELL / 2 - 0.05);
  }

  private build() {
    // Everything outside the round hall is wall
    for (let gz = 0; gz < G; gz++)
      for (let gx = 0; gx < G; gx++) {
        const p = this.w(gx, gz);
        if (Math.hypot(p.x - OX, p.z - OZ) > R - 1) this.blocked[gz * G + gx] = 1;
      }
    // Floor: old white tiles, stained
    const tile = (() => {
      const c = document.createElement('canvas');
      c.width = c.height = 256;
      const g = c.getContext('2d')!;
      g.fillStyle = '#6a6c66';
      g.fillRect(0, 0, 256, 256);
      g.strokeStyle = '#3a3c38';
      g.lineWidth = 3;
      for (let i = 0; i <= 256; i += 32) {
        g.beginPath();
        g.moveTo(i, 0);
        g.lineTo(i, 256);
        g.moveTo(0, i);
        g.lineTo(256, i);
        g.stroke();
      }
      for (let i = 0; i < 18; i++) {
        g.fillStyle = `rgba(${60 + this.r() * 40},0,0,${0.15 + this.r() * 0.3})`;
        g.beginPath();
        g.arc(this.r() * 256, this.r() * 256, 6 + this.r() * 26, 0, Math.PI * 2);
        g.fill();
      }
      const tx = new THREE.CanvasTexture(c);
      tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
      tx.repeat.set(6, 6);
      tx.colorSpace = THREE.SRGBColorSpace;
      return this.t(tx);
    })();
    const floor = this.mesh(new THREE.CircleGeometry(R, 64), this.mat(0xffffff, { map: tile, roughness: 0.6 }), OX, 0, OZ);
    floor.rotation.x = -Math.PI / 2;
    floor.castShadow = false;
    // Round wall + ceiling
    const wall = this.mesh(new THREE.CylinderGeometry(R, R, 8, 64, 1, true), this.mat(0x3a3e3c, { side: THREE.BackSide, roughness: 0.95 }), OX, 4, OZ);
    wall.castShadow = false;
    const ceil = this.mesh(new THREE.CircleGeometry(R, 64), this.mat(0x1a1c1b), OX, 8, OZ);
    ceil.rotation.x = Math.PI / 2;
    ceil.castShadow = false;
    // Wall colliders (ring of boxes)
    for (let i = 0; i < 32; i++) {
      const a = (i / 32) * Math.PI * 2;
      const x = OX + Math.cos(a) * (R + 0.4);
      const z = OZ + Math.sin(a) * (R + 0.4);
      this.box(x - 1.8, z - 1.8, x + 1.8, z + 1.8);
    }
    // The broken cuve in the middle (where it all started)
    this.blockRect(11, 11, 12, 12);
    const glassM = this.t(new THREE.MeshPhysicalMaterial({ color: 0x4a8a6a, roughness: 0.05, transparent: true, opacity: 0.35 }));
    const metal = this.mat(0x5a6066, { metalness: 0.7, roughness: 0.4 });
    this.mesh(new THREE.CylinderGeometry(1.4, 1.6, 0.6, 24), metal, OX, 0.3, OZ);
    const tube = this.mesh(new THREE.CylinderGeometry(1.2, 1.2, 3, 24, 1, true), glassM, OX, 2.1, OZ);
    tube.castShadow = false;
    this.mesh(new THREE.CylinderGeometry(1.4, 1.4, 0.4, 24), metal, OX, 3.8, OZ);
    const goo = this.mesh(new THREE.CircleGeometry(2.6, 24), this.mat(0x1a3a10, { emissive: 0x2a8a1a, emissiveIntensity: 0.6, roughness: 0.2 }), OX + 1.2, 0.015, OZ + 0.8);
    goo.rotation.x = -Math.PI / 2;
    goo.castShadow = false;
    // 4 pillars for cover
    const concrete = this.mat(0x55585a, { roughness: 0.95 });
    for (const [gx, gz] of [
      [6, 6],
      [16, 6],
      [6, 16],
      [16, 16],
    ]) {
      this.blockRect(gx, gz, gx + 1, gz + 1);
      const p = this.w(gx, gz).add(new THREE.Vector3(CELL / 2, 0, CELL / 2));
      this.mesh(new THREE.BoxGeometry(CELL * 2 - 0.2, 8, CELL * 2 - 0.2), concrete, p.x, 4, p.z);
    }
    // Red emergency lights (die in phase 2)
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const l = new THREE.PointLight(0xff2a1a, 24, 24, 1.5);
      l.position.set(OX + Math.cos(a) * 10, 6.5, OZ + Math.sin(a) * 10);
      this.root.add(l);
      this.lamps.push(l);
      this.mesh(new THREE.SphereGeometry(0.18, 10, 8), this.mat(0x400000, { emissive: 0xff2010, emissiveIntensity: 3 }), l.position.x, 6.9, l.position.z).castShadow = false;
    }
    // 4 UV projectors on the wall, aimed at the middle
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const pos = new THREE.Vector3(OX + Math.cos(a) * (R - 1.6), 0, OZ + Math.sin(a) * (R - 1.6));
      const dir = this.center.clone().sub(pos).setY(0).normalize();
      this.mesh(new THREE.BoxGeometry(0.9, 1.4, 0.9), this.mat(0x2a2a3a, { metalness: 0.6, roughness: 0.4 }), pos.x, 0.7, pos.z);
      const lens = this.mat(0x100018, { emissive: 0x7a2aff, emissiveIntensity: 0.3 });
      const head = this.mesh(new THREE.CylinderGeometry(0.35, 0.45, 0.5, 16), lens, pos.x + dir.x * 0.3, 1.6, pos.z + dir.z * 0.3);
      head.rotation.x = Math.PI / 2;
      head.rotation.z = -Math.atan2(dir.x, dir.z);
      const light = new THREE.SpotLight(0x9a4aff, 0, 22, 0.32, 0.4, 1.2);
      light.position.set(pos.x, 1.7, pos.z);
      light.target.position.copy(this.center).setY(1);
      this.root.add(light, light.target);
      const beamGeo = new THREE.ConeGeometry(2.2, 14, 20, 1, true);
      beamGeo.translate(0, -7, 0);
      beamGeo.rotateX(-Math.PI / 2);
      const beam = new THREE.Mesh(
        this.t(beamGeo),
        this.t(new THREE.MeshBasicMaterial({ color: 0x8a3aff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }))
      );
      beam.position.set(pos.x, 1.6, pos.z);
      beam.lookAt(this.center.x, 1.0, this.center.z);
      beam.rotateY(Math.PI);
      this.root.add(beam);
      this.projectors.push({ pos, dir, state: 0, lens, light, beam });
      this.box(pos.x - 0.5, pos.z - 0.5, pos.x + 0.5, pos.z + 0.5, 1.6);
    }
    this.scene.add(this.root);
    this.map.collisionBoxes.push(...this.boxes);
  }

  private makeNotes() {
    this.noteDrops = [
      {
        item: {
          id: 'note-c-journal',
          name: 'Dernière page du Dr Moreau',
          type: 'note',
          description: 'Une page couverte d\'une écriture qui tremble de plus en plus.',
          lore:
            '« Lucas guérit. Lucas guérit et je ne le supporte pas : c\'était MON protocole. Alors je me suis injecté la souche d\'origine, celle d\'avant les essais. Si quelqu\'un lit ceci, ne me tuez pas avec la lumière. Ou si. Je ne sais plus ce que je veux. J\'ai si faim. — É. M. »',
          icon: 'FileText',
        },
        pos: this.w(4, 13, 0.02),
      },
      {
        item: {
          id: 'note-c-antidote',
          name: 'Formule de l\'antidote',
          type: 'note',
          description: 'Une fiche de laboratoire tachée de vert.',
          lore:
            '« PROTOCOLE AURORE — INVERSION. La souche ne meurt pas : elle s\'endort. Affaiblir le sujet aux UV jusqu\'à l\'effondrement, puis injecter la dose inverse dans les 10 secondes. Sinon il se relève, plus fort. Trois seringues préparées. Il n\'en reste qu\'une. »',
          icon: 'FileText',
        },
        pos: this.w(19, 12, 0.02),
      },
    ];
  }

  public supplyDrops(): { item: GameItem; pos: THREE.Vector3 }[] {
    let n = 0;
    const mk = (type: 'battery' | 'food' | 'medkit'): GameItem => {
      const id = `c7-${type}-${++n}`;
      if (type === 'battery') return { id, name: 'Pile', type, description: 'Recharge 55 % de la batterie de la lampe torche.', icon: 'BatteryCharging' };
      if (type === 'food') return { id, name: 'Barre de céréales', type, description: 'Redonne 40 points d\'endurance.', icon: 'Cookie' };
      return { id, name: 'Adrénaline', type, description: 'Auto-injecteur : endurance au maximum + 6 s de sprint illimité.', icon: 'HeartPulse' };
    };
    const cells: [number, number, 'battery' | 'food' | 'medkit'][] = [
      [8, 4, 'battery'],
      [15, 4, 'battery'],
      [4, 9, 'battery'],
      [19, 9, 'battery'],
      [4, 15, 'battery'],
      [19, 15, 'battery'],
      [9, 19, 'battery'],
      [14, 19, 'battery'],
      [11, 3, 'medkit'],
      [12, 20, 'food'],
    ];
    return cells.map(([gx, gz, k]) => ({ item: mk(k), pos: this.w(gx, gz, 0.02) }));
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
  // The boss
  // ---------------------------------------------------------------------
  private spawnBoss() {
    const m = new MonsterAI(this.w(12, 5), this.map.navNodes, [], this.map.doors, () => {}, 0);
    m.setFixedLook({ skin: '#cfc8b8', eyes: '#ff1a0a', gown: '#e8e8e2', acc: 'chains' }, 1.22);
    if (this.lowEnd) m.mesh.traverse((o) => (o.castShadow = false));
    this.stalker = m;
    this.scene.add(m.mesh);
    if (this.difficulty < 2) {
      // Exploration: he sleeps in the middle of the hall
      m.placeAt(OX + 2.5, OZ - 2.5);
      this.stunBoss(1e9);
    }
  }

  public toggleUV() {
    this.uv = !this.uv;
    return this.uv;
  }

  public hear(origin: THREE.Vector3, _loudness: number) {
    if (this.phase === 'hunt' || this.phase === 'dark') this.target.copy(origin).setY(0);
  }

  private speeds() {
    const i = Math.max(0, Math.min(4, this.difficulty - 1));
    const base = { walk: [1.8, 2.1, 2.3, 2.5, 2.7][i], run: [3.6, 4.1, 4.5, 4.9, 5.2][i] };
    if (this.phase === 'dark') return { walk: base.walk * 1.1, run: base.run * 1.1 };
    if (this.phase === 'fury') return { walk: base.walk * 1.15, run: base.run * 1.18 };
    return base;
  }

  /** Is that player's UV beam on him? */
  private burning(pl: SitePlayer) {
    const s = this.stalker!;
    if (!pl.uv || !pl.flashlight || pl.dead) return false;
    const dx = s.position.x - pl.pos.x;
    const dz = s.position.z - pl.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > 12 || d < 0.3) return false;
    const cos = (dx * -Math.sin(pl.yaw) + dz * -Math.cos(pl.yaw)) / d;
    return cos > Math.cos(0.34) && this.los(pl.pos, s.position);
  }

  private damage(n: number, why: string) {
    if (this.phase === 'down' || this.phase === 'over') return;
    const before = this.hp;
    this.hp = Math.max(0, this.hp - n);
    if (!this.hitTips.has(why)) {
      this.hitTips.add(why);
      if (why === 'uv') this.toast('🟣 La lumière UV le brûle ! Gardez-le dans le faisceau… mais surveillez la batterie.');
    }
    // Phase changes
    if (before > 66 && this.hp <= 66) {
      this.phase = 'dark';
      this.lamps.forEach((l) => (l.intensity = 0));
      sound.playMonsterChaseRoar();
      this.toast(
        '⚡ PHASE 2 — Il arrache les câbles : les lumières s\'éteignent ! Activez les projecteurs UV sur les murs [E] (3 s), puis attirez-le dans leur faisceau.'
      );
      this.flash = 1;
    } else if (before > 33 && this.hp <= 33) {
      this.phase = 'fury';
      this.blinkT = 5;
      sound.playMonsterChaseRoar();
      this.toast('💢 PHASE 3 — Il disparaît… et réapparaît DANS VOTRE DOS. Quand il hurle, retournez-vous et brûlez-le !');
      this.flash = 1;
    }
    if (this.hp <= 0) {
      this.phase = 'down';
      this.downT = 10;
      this.stunBoss(1e9);
      sound.playMonsterGrowl(3, 0);
      this.toast('💉 Il s\'effondre ! Vite : approchez-vous et injectez l\'antidote [E] avant qu\'il ne se relève (10 s) !');
    }
  }

  // ---------------------------------------------------------------------
  // Interactions
  // ---------------------------------------------------------------------
  public hint(p: THREE.Vector3): string | null {
    const s = this.stalker;
    if (this.phase === 'down' && s && Math.hypot(s.position.x - p.x, s.position.z - p.z) < 2.6) return '[E] Injecter l\'antidote';
    const i = this.projectors.findIndex((x) => x.state === 0 && Math.hypot(x.pos.x - p.x, x.pos.z - p.z) < 2.2);
    if (i >= 0 && this.phase !== 'down') return this.arming === i ? 'Activation… restez près du projecteur' : '[E] Activer le projecteur UV (3 s)';
    return null;
  }

  public interact(p: THREE.Vector3, _who = 0): SiteAction | null {
    const s = this.stalker;
    if (this.phase === 'down' && s && Math.hypot(s.position.x - p.x, s.position.z - p.z) < 2.6) {
      this.phase = 'over';
      this.ending = 'MOREAU';
      return { ending: 'MOREAU' } as SiteAction;
    }
    const i = this.projectors.findIndex((x) => x.state === 0 && Math.hypot(x.pos.x - p.x, x.pos.z - p.z) < 2.2);
    if (i >= 0) {
      if (this.arming >= 0) return { msg: 'Un projecteur est déjà en cours d\'activation.' };
      this.arming = i;
      this.armT = 3;
      this.projectors[i].state = 1;
      sound.playBreakerClunk();
      return { msg: '🔦 Activation du projecteur UV (3 s)… restez près !' };
    }
    return null;
  }

  public objective(): string {
    const bars = Math.ceil(this.hp / 10);
    const bar = `DR MOREAU ${'█'.repeat(bars)}${'░'.repeat(10 - bars)} ${Math.ceil(this.hp)} %`;
    const uv = '[R] lampe UV' + (this.uv ? ' (ON)' : '');
    if (this.difficulty < 2) return 'CHAPITRE 7 (Exploration) — Il dort au centre. Lisez les documents, puis approchez-vous et injectez l\'antidote [E].';
    if (this.phase === 'down') return `Il est à terre ! Injectez l'antidote [E] : ${Math.max(0, Math.ceil(this.downT))} s`;
    if (this.phase === 'hunt') return `${bar} — brûlez-le à la lumière UV · ${uv}`;
    if (this.phase === 'dark') {
      const armed = this.projectors.filter((x) => x.state === 2).length;
      const left = this.projectors.filter((x) => x.state < 3).length;
      return `${bar} — projecteurs UV armés : ${armed} (${left} utilisables) · attirez-le dans un faisceau · ${uv}`;
    }
    return `${bar} — il apparaît dans votre dos : retournez-vous quand il hurle · ${uv}`;
  }

  // ---------------------------------------------------------------------
  // Per frame (host / solo)
  // ---------------------------------------------------------------------
  public update(delta: number, pls: SitePlayer[], listener: Listener, onCatch: (i: number) => void, onRelease: () => void) {
    const pl = pls[0];
    // Exploration: the sleeping doctor can be injected once you got close
    if (this.difficulty < 2) {
      if (this.phase === 'hunt' && this.stalker && Math.hypot(this.stalker.position.x - pl.pos.x, this.stalker.position.z - pl.pos.z) < 3) {
        this.phase = 'down';
        this.downT = 1e9;
      }
      this.visuals(delta);
      return;
    }
    // Arming a projector: stay close 3 s
    if (this.arming >= 0) {
      const pj = this.projectors[this.arming];
      if (Math.hypot(pj.pos.x - pl.pos.x, pj.pos.z - pl.pos.z) > 3) {
        pj.state = 0;
        this.arming = -1;
        this.toast('Vous vous êtes éloigné : le projecteur s\'éteint.');
      } else {
        this.armT -= delta;
        if (this.armT <= 0) {
          pj.state = 2;
          this.arming = -1;
          sound.playPowerUp();
          this.toast('🟣 Projecteur armé ! Quand il passera dans le faisceau… CLAC.');
        }
      }
    }
    if (this.phase === 'down') {
      this.downT -= delta;
      if (this.downT <= 0) {
        // Too late: he gets back up
        this.hp = 25;
        this.phase = 'fury';
        this.blinkT = 3;
        this.stunT = 0;
        if (this.stalker) this.stalker.state = 'CHASE';
        sound.playMonsterChaseRoar();
        this.toast('Trop tard… il se relève, plus enragé que jamais !');
      }
    }
    this.visuals(delta);
    this.updateBoss(delta, pls, listener, onCatch, onRelease);
  }

  private woke = false;
  private updateBoss(delta: number, pls: SitePlayer[], listener: Listener, onCatch: (i: number) => void, onRelease: () => void) {
    const s = this.stalker;
    if (!s || this.phase === 'over') return;
    if (!this.woke) {
      this.awake -= delta;
      if (this.awake > 0) {
        s.driveToward(s.position, 0, delta, [], listener, false);
        return;
      }
      this.woke = true;
      sound.playMonsterChaseRoar();
      onRelease();
    }
    const dist = (x: SitePlayer) => Math.hypot(x.pos.x - s.position.x, x.pos.z - s.position.z);
    const alive = pls.filter((x) => !x.dead).sort((a, b) => dist(a) - dist(b));
    // Stunned (projector, sedative…): he gets up when the time is over
    if (s.state === 'STUNNED') {
      if (this.stunT <= 0) this.stunT = 5;
      this.stunT -= delta;
      if (this.stunT <= 0 && this.phase !== 'down') s.state = 'CHASE';
    }
    if (!alive.length || s.state === 'STUNNED') {
      s.driveToward(s.position, 0, delta, [], listener, false);
      return;
    }
    const pl = alive[0];
    this.roarCd = Math.max(0, this.roarCd - delta);
    this.hissCd = Math.max(0, this.hissCd - delta);
    this.dazed = Math.max(0, this.dazed - delta);

    // UV lamps of everyone
    const burnt = alive.filter((x) => this.burning(x)).length;
    if (burnt) {
      this.damage(delta * 6 * burnt * (this.dazed > 0 ? 2 : 1), 'uv');
      if (this.hissCd <= 0) {
        this.hissCd = 0.5;
        sound.playHiss(0.4);
      }
    }
    // Armed projectors: big hit when he walks into the beam
    for (const pj of this.projectors) {
      if (pj.state !== 2) continue;
      const to = s.position.clone().sub(pj.pos).setY(0);
      const d = to.length();
      if (d < 16 && d > 0.5 && to.normalize().dot(pj.dir) > Math.cos(0.17)) {
        pj.state = 3;
        this.damage(this.phase === 'hunt' ? 15 : 22, 'projector');
        this.stunBoss(2.5);
        this.flash = 1;
        sound.playMonsterChaseRoar();
        this.toast('💥 Le projecteur le frappe de plein fouet ! Il est sonné.');
      }
    }

    // Phase 3: he vanishes and comes back behind the closest player
    if (this.phase === 'fury') {
      this.blinkT -= delta;
      if (this.blinking > 0) {
        this.blinking -= delta;
        if (this.blinking <= 0) {
          const back = new THREE.Vector3(Math.sin(pl.yaw), 0, Math.cos(pl.yaw));
          let spot = pl.pos.clone().addScaledVector(back, 3.2).setY(0);
          const [gx, gz] = this.cellOf(spot);
          if (!this.isFloor(gx, gz)) spot = pl.pos.clone().addScaledVector(back, -3.2).setY(0);
          s.placeAt(spot.x, spot.z);
          s.mesh.visible = true;
          this.dazed = 1.6;
          sound.playMonsterChaseRoar();
          this.flash = 0.6;
        } else {
          s.driveToward(s.position, 0, delta, [], listener, false);
          return;
        }
      } else if (this.blinkT <= 0) {
        this.blinkT = Math.max(5, 9 - this.difficulty);
        this.blinking = 1;
        s.mesh.visible = false;
        sound.playMonsterGrowl(4, 0);
        this.toast('… il a disparu. Écoutez.');
      }
    }

    // Hunt: he always knows where you are in his hall
    this.target.copy(pl.pos).setY(0);
    const sp = this.speeds();
    let speed = sp.run * (burnt ? 0.45 : 1);
    if (this.dazed > 0) speed = 0;
    if (this.roarCd <= 0 && dist(pl) < 9) {
      this.roarCd = 6;
      sound.playMonsterChaseRoar();
    }
    this.pathT -= delta;
    if (this.pathT <= 0 || !this.path.length) {
      this.pathT = 0.3;
      this.path = this.findPath(s.position, this.target);
    }
    while (this.path.length > 1 && Math.hypot(this.path[0].x - s.position.x, this.path[0].z - s.position.z) < 0.5) this.path.shift();
    s.driveToward(this.path[0] ?? this.target, speed || sp.walk * 0.01, delta, [], listener, true);
    pls.forEach((x, i) => {
      if (!x.dead && dist(x) < 1.2 && this.dazed <= 0) onCatch(i);
    });
  }

  public mirror(delta: number) {
    if (this.phase === 'down') this.downT = Math.max(0, this.downT - delta);
    this.visuals(delta);
  }

  private visuals(delta: number) {
    this.flash = Math.max(0, this.flash - delta * 1.5);
    // Projectors: dim purple when off, glowing when armed, dead when used
    const now = performance.now();
    for (const pj of this.projectors) {
      const bm = pj.beam.material as THREE.MeshBasicMaterial;
      if (pj.state === 2) {
        pj.lens.emissiveIntensity = 3;
        pj.light.intensity = 40;
        bm.opacity = 0.09 + Math.sin(now * 0.01) * 0.02;
      } else if (pj.state === 1) {
        pj.lens.emissiveIntensity = Math.floor(now / 150) % 2 ? 2 : 0.4;
        pj.light.intensity = 0;
        bm.opacity = 0;
      } else {
        pj.lens.emissiveIntensity = pj.state === 3 ? 0 : 0.3;
        pj.light.intensity = 0;
        bm.opacity = 0;
      }
    }
    // Emergency lights flicker in phase 1, are dead in phases 2-3
    if (this.phase === 'hunt') this.lamps.forEach((l, i) => (l.intensity = Math.random() < 0.02 ? 3 : 24 + Math.sin(now * 0.003 + i) * 3));
    else if (this.phase === 'down' || this.phase === 'over') this.lamps.forEach((l) => (l.intensity = 6));
    else this.lamps.forEach((l) => (l.intensity = Math.random() < 0.01 ? 8 : 0));
  }

  public netState(): CoreNet {
    return { ph: this.phase, hp: Math.round(this.hp * 10) / 10, pj: this.projectors.map((p) => p.state), dn: Math.round(this.downT * 10) / 10 };
  }

  public netApply(n: CoreNet) {
    if (!n) return;
    if (n.ph !== this.phase && (n.ph === 'dark' || n.ph === 'fury')) this.flash = 1;
    this.phase = n.ph;
    this.hp = n.hp;
    this.downT = n.dn;
    n.pj?.forEach((st, i) => {
      if (this.projectors[i]) this.projectors[i].state = st;
    });
  }

  public dispose() {
    const mine = new Set(this.boxes);
    this.map.collisionBoxes = this.map.collisionBoxes.filter((b) => !mine.has(b));
    this.scene.remove(this.root);
    this.stalker = null;
    this.disposables.forEach((d) => d.dispose());
  }
}
