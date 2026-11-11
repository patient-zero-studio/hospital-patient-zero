import * as THREE from 'three';
import { ProceduralTextures } from '../textures/ProceduralTextures';
import { MONSTER_OUTFITS, buildMonsterAccessory } from './Cosmetics';
import { MonsterState } from '../types';
import { sound } from '../audio/SoundSystem';
import { CollisionBox, DoorObject, NavNode } from './MapBuilder';

const RADIUS = 0.38;

/** Slab test: does the XZ segment a→b cross the (padded) box? */
export const segmentHitsBox = (ax: number, az: number, bx: number, bz: number, box: CollisionBox, pad = 0): boolean => {
  const minX = box.min.x - pad;
  const maxX = box.max.x + pad;
  const minZ = box.min.z - pad;
  const maxZ = box.max.z + pad;
  const dx = bx - ax;
  const dz = bz - az;
  let t0 = 0;
  let t1 = 1;
  const clip = (p: number, q: number) => {
    if (Math.abs(p) < 1e-9) return q >= 0;
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
    return true;
  };
  return clip(-dx, ax - minX) && clip(dx, maxX - ax) && clip(-dz, az - minZ) && clip(dz, maxZ - az) && t0 <= t1;
};

export interface MonsterSenses {
  playerPos: THREE.Vector3;
  playerHidden: boolean;
  /** 0..1 : how visible the player is (flashlight on, crouching, …). */
  playerVisibility: number;
  /** Camera yaw, used for stereo panning of monster sounds. */
  listenerRight: THREE.Vector3;
  /** Caught players are ignored (multiplayer). */
  dead?: boolean;
}

/** The local player's ears (sounds are positioned relative to them). */
export interface Listener {
  pos: THREE.Vector3;
  right: THREE.Vector3;
}

export class MonsterAI {
  public mesh: THREE.Group;
  public state: MonsterState = 'PATROL';
  public position: THREE.Vector3;
  public headWorld = new THREE.Vector3();

  // Rig
  private hips = new THREE.Group();
  private spine = new THREE.Group();
  private neck = new THREE.Group();
  private head = new THREE.Group();
  private jaw = new THREE.Group();
  private legs: { hip: THREE.Group; knee: THREE.Group }[] = [];
  private arms: { shoulder: THREE.Group; elbow: THREE.Group }[] = [];
  private eyeMat: THREE.MeshStandardMaterial;

  // AI
  private nav: Map<string, NavNode>;
  private route: string[];
  private routeIdx = 0;
  private path: THREE.Vector3[] = [];
  private goal = new THREE.Vector3();
  private repathTimer = 0;
  private stateTimer = 0;
  private lostSightTimer = 0;
  private growlTimer = 6;
  private footstepTimer = 0;
  private animTime = 0;
  private stepPhase = 0;
  private speedNow = 0;
  private lastKnown = new THREE.Vector3();
  private stuckTimer = 0;
  private lastPos = new THREE.Vector3();
  private disposables: { dispose: () => void }[] = [];

  private patrolSpeed = 1.5;
  private investigateSpeed = 2.4;
  private chaseSpeed = 4.5;

  constructor(
    startPos: THREE.Vector3,
    nav: Map<string, NavNode>,
    route: string[],
    private doors: Map<string, DoorObject>,
    private onOpenDoor: (door: DoorObject) => void,
    startRouteIdx = 0
  ) {
    this.routeIdx = startRouteIdx;
    this.position = startPos.clone();
    this.lastPos.copy(startPos);
    this.nav = nav;
    this.route = route;
    this.mesh = new THREE.Group();
    this.mesh.position.copy(this.position);
    this.eyeMat = new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff2a10, emissiveIntensity: 5 });
    this.buildModel();
  }

  // ---------------------------------------------------------------------
  // MODEL — tall, emaciated, hunched creature in a torn hospital gown
  // ---------------------------------------------------------------------
  private buildModel() {
    const t = <T extends { dispose: () => void }>(o: T) => {
      this.disposables.push(o);
      return o;
    };
    const skin = t(
      new THREE.MeshStandardMaterial({
        map: ProceduralTextures.getMonsterSkinTexture(),
        bumpMap: ProceduralTextures.getMonsterSkinTexture(),
        bumpScale: 2,
        roughness: 0.42,
        metalness: 0,
        color: 0x8f968d,
      })
    );
    const gown = t(
      new THREE.MeshStandardMaterial({ map: ProceduralTextures.getGownTexture(), color: 0x6a6a60, roughness: 0.95, side: THREE.DoubleSide })
    );
    const dark = t(new THREE.MeshStandardMaterial({ color: 0x120505, roughness: 0.6 }));
    this.skinMat = skin;
    this.gownMat = gown;
    const teeth = t(new THREE.MeshStandardMaterial({ color: 0xc9c0a0, roughness: 0.4 }));
    const claw = t(new THREE.MeshStandardMaterial({ color: 0x1d1a16, roughness: 0.3, metalness: 0.2 }));

    const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0) => {
      const m = new THREE.Mesh(t(geo), mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      parent.add(m);
      return m;
    };

    // Hips
    this.hips.position.y = 1.08;
    this.mesh.add(this.hips);
    mesh(new THREE.CapsuleGeometry(0.15, 0.22, 4, 10), skin, this.hips).rotation.z = Math.PI / 2;

    // Legs (hip → thigh → knee → shin → foot) total length ≈ 1.05
    for (const side of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(side * 0.14, 0, 0);
      this.hips.add(hip);
      mesh(new THREE.CapsuleGeometry(0.075, 0.38, 4, 10), skin, hip, 0, -0.26, 0);
      const knee = new THREE.Group();
      knee.position.set(0, -0.52, 0);
      hip.add(knee);
      mesh(new THREE.SphereGeometry(0.075, 10, 8), skin, knee);
      mesh(new THREE.CapsuleGeometry(0.055, 0.4, 4, 10), skin, knee, 0, -0.26, 0);
      const foot = mesh(new THREE.BoxGeometry(0.11, 0.06, 0.28), skin, knee, 0, -0.52, 0.07);
      foot.rotation.x = 0.05;
      this.legs.push({ hip, knee });
    }

    // Spine (hunched forward)
    this.spine.rotation.x = 0.38;
    this.hips.add(this.spine);
    mesh(new THREE.CapsuleGeometry(0.17, 0.42, 6, 12), skin, this.spine, 0, 0.32, 0).scale.set(1.15, 1, 0.75);
    // Visible ribs
    for (let i = 0; i < 5; i++) {
      const rib = mesh(new THREE.TorusGeometry(0.17, 0.012, 4, 16, Math.PI), skin, this.spine, 0, 0.18 + i * 0.07, 0.02);
      rib.rotation.set(Math.PI / 2, 0, 0);
      rib.scale.set(1.1, 0.75, 1);
    }
    // Protruding vertebrae
    for (let i = 0; i < 6; i++) {
      mesh(new THREE.SphereGeometry(0.035, 6, 6), skin, this.spine, 0, 0.12 + i * 0.09, -0.13);
    }
    // Torn gown scraps: only around the hips, open on the chest and back
    const gownMesh = mesh(new THREE.CylinderGeometry(0.2, 0.27, 0.5, 18, 4, true, 0.9, Math.PI * 1.2), gown, this.spine, 0, 0.0, -0.01);
    gownMesh.rotation.y = Math.PI;
    const pos = gownMesh.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      // Ragged hem + crumpled cloth
      if (y < -0.2) pos.setY(i, y - Math.random() * 0.22);
      pos.setX(i, pos.getX(i) * (0.92 + Math.random() * 0.16));
      pos.setZ(i, pos.getZ(i) * (0.92 + Math.random() * 0.16));
    }
    pos.needsUpdate = true;
    gownMesh.geometry.computeVertexNormals();

    // Shoulders + arms (abnormally long)
    for (const side of [-1, 1]) {
      const shoulder = new THREE.Group();
      shoulder.position.set(side * 0.27, 0.6, 0);
      this.spine.add(shoulder);
      mesh(new THREE.SphereGeometry(0.08, 10, 8), skin, shoulder);
      mesh(new THREE.CapsuleGeometry(0.05, 0.45, 4, 10), skin, shoulder, 0, -0.29, 0);
      const elbow = new THREE.Group();
      elbow.position.set(0, -0.56, 0);
      shoulder.add(elbow);
      mesh(new THREE.SphereGeometry(0.05, 8, 8), skin, elbow);
      mesh(new THREE.CapsuleGeometry(0.04, 0.5, 4, 10), skin, elbow, 0, -0.3, 0);
      // Hand with long claws
      const hand = new THREE.Group();
      hand.position.set(0, -0.6, 0);
      elbow.add(hand);
      mesh(new THREE.BoxGeometry(0.09, 0.12, 0.04), skin, hand);
      for (let f = 0; f < 4; f++) {
        const finger = mesh(new THREE.ConeGeometry(0.012, 0.24, 5), claw, hand, -0.035 + f * 0.023, -0.17, 0.01);
        finger.rotation.x = Math.PI + 0.2;
        finger.rotation.z = (f - 1.5) * 0.08;
      }
      shoulder.rotation.z = side * 0.12;
      this.arms.push({ shoulder, elbow });
    }

    // Neck & head
    this.neck.position.set(0, 0.7, 0.04);
    this.spine.add(this.neck);
    mesh(new THREE.CapsuleGeometry(0.05, 0.16, 4, 8), skin, this.neck, 0, 0.08, 0);
    this.head.position.set(0, 0.2, 0.02);
    this.head.rotation.x = -0.45; // looks forward despite the hunch
    this.neck.add(this.head);
    const skull = mesh(new THREE.SphereGeometry(0.14, 16, 14), skin, this.head, 0, 0.1, 0);
    skull.scale.set(0.95, 1.4, 1.15);
    // Elongated, bulging cranium at the back
    mesh(new THREE.SphereGeometry(0.12, 14, 12), skin, this.head, 0.02, 0.22, -0.06).scale.set(1, 1.2, 1.2);
    // Cheekbones
    for (const side of [-1, 1]) {
      mesh(new THREE.SphereGeometry(0.04, 8, 6), skin, this.head, side * 0.085, 0.08, 0.08);
    }
    // Sunken eye sockets with glowing pupils
    for (const side of [-1, 1]) {
      mesh(new THREE.SphereGeometry(0.035, 10, 8), dark, this.head, side * 0.05, 0.14, 0.115);
      const eye = new THREE.Mesh(t(new THREE.SphereGeometry(0.014, 8, 6)), this.eyeMat);
      eye.position.set(side * 0.05, 0.14, 0.135);
      this.head.add(eye);
    }
    // Lower jaw (hinged) with teeth
    this.jaw.position.set(0, 0.03, 0.02);
    this.head.add(this.jaw);
    mesh(new THREE.BoxGeometry(0.15, 0.04, 0.13), skin, this.jaw, 0, -0.02, 0.05);
    mesh(new THREE.BoxGeometry(0.12, 0.06, 0.02), dark, this.head, 0, 0.03, 0.12);
    for (let i = 0; i < 6; i++) {
      const tooth = mesh(new THREE.ConeGeometry(0.008, 0.035, 4), teeth, this.head, -0.05 + i * 0.02, 0.035, 0.125);
      tooth.rotation.x = Math.PI;
      const tooth2 = mesh(new THREE.ConeGeometry(0.008, 0.03, 4), teeth, this.jaw, -0.05 + i * 0.02, 0.01, 0.105);
      tooth2.rotation.x = 0;
    }
  }

  // ---------------------------------------------------------------------
  // PATHFINDING
  // ---------------------------------------------------------------------
  private isDoorPassable(doorId?: string) {
    if (!doorId) return true;
    const d = this.doors.get(doorId);
    return !!d && !d.isLocked;
  }

  /** Clear walkable straight line? (unlocked doors count as passable) */
  private walkable(a: THREE.Vector3, b: THREE.Vector3, boxes: CollisionBox[], pad = RADIUS * 0.8) {
    for (const box of boxes) {
      if (box.disabled) continue;
      if (box.doorId && this.isDoorPassable(box.doorId)) continue;
      if (segmentHitsBox(a.x, a.z, b.x, b.z, box, pad)) return false;
    }
    return true;
  }

  private nearestNode(p: THREE.Vector3, boxes: CollisionBox[]): NavNode | null {
    let best: NavNode | null = null;
    let bestD = Infinity;
    let fallback: NavNode | null = null;
    let fallbackD = Infinity;
    for (const n of this.nav.values()) {
      const d = n.pos.distanceToSquared(p);
      if (d < fallbackD) {
        fallbackD = d;
        fallback = n;
      }
      if (d < bestD && this.walkable(p, n.pos, boxes, 0.1)) {
        bestD = d;
        best = n;
      }
    }
    return best ?? fallback;
  }

  /** Dijkstra over the nav graph. Returns world positions (excluding start). */
  private findPath(from: THREE.Vector3, to: THREE.Vector3, boxes: CollisionBox[]): THREE.Vector3[] | null {
    if (this.walkable(from, to, boxes)) return [to.clone()];
    const start = this.nearestNode(from, boxes);
    const end = this.nearestNode(to, boxes);
    if (!start || !end) return null;
    const dist = new Map<string, number>([[start.id, 0]]);
    const prev = new Map<string, string>();
    const open = new Set<string>([start.id]);
    while (open.size) {
      let cur = '';
      let curD = Infinity;
      for (const id of open) {
        const d = dist.get(id)!;
        if (d < curD) {
          curD = d;
          cur = id;
        }
      }
      open.delete(cur);
      if (cur === end.id) break;
      const n = this.nav.get(cur)!;
      for (const l of n.links) {
        if (!this.isDoorPassable(l.doorId)) continue;
        const nd = curD + n.pos.distanceTo(this.nav.get(l.to)!.pos);
        if (nd < (dist.get(l.to) ?? Infinity)) {
          dist.set(l.to, nd);
          prev.set(l.to, cur);
          open.add(l.to);
        }
      }
    }
    if (!dist.has(end.id)) return null;
    const ids: string[] = [];
    for (let c: string | undefined = end.id; c; c = prev.get(c)) ids.unshift(c);
    const pts = ids.map((id) => this.nav.get(id)!.pos.clone());
    pts.push(to.clone());
    // Skip the first node if we can already head to the second one
    while (pts.length > 1 && this.walkable(from, pts[1], boxes)) pts.shift();
    return pts;
  }

  private skinMat!: THREE.MeshStandardMaterial;
  private gownMat!: THREE.MeshStandardMaterial;

  private cosmetic = new THREE.Group();
  private cosmeticDisposables: { dispose: () => void }[] = [];

  /** Player customisation: skin tint, glowing eyes, gown scraps, accessory, outfit. */
  public applyLook(look: { skin: string; eyes: string; gown: string; acc?: string; outfit?: string }) {
    const o = look.outfit ? MONSTER_OUTFITS[look.outfit] : undefined;
    const skin = this.skinMat;
    skin.color.set(o?.skin ?? look.skin);
    this.gownMat.color.set(o?.gown ?? look.gown);
    this.eyeMat.emissive.set(o?.eyes ?? look.eyes);
    const fx = o?.skinFx;
    skin.metalness = fx === 'gold' ? 0.85 : 0;
    skin.roughness = fx === 'gold' ? 0.28 : fx === 'bone' ? 0.6 : 0.42;
    skin.emissive.set(fx === 'inferno' ? 0xff3a00 : fx === 'shadow' ? 0x14002a : 0x000000);
    skin.emissiveMap = fx === 'inferno' ? skin.map : null;
    skin.emissiveIntensity = fx === 'inferno' ? 1.4 : fx === 'shadow' ? 0.6 : 0;
    skin.transparent = fx === 'shadow';
    skin.opacity = fx === 'shadow' ? 0.82 : 1;
    skin.needsUpdate = true;

    this.cosmeticDisposables.forEach((d) => d.dispose());
    this.cosmeticDisposables = [];
    this.cosmetic.clear();
    const track = <T extends { dispose: () => void }>(x: T) => {
      this.cosmeticDisposables.push(x);
      return x;
    };
    for (const id of new Set([...(o?.accs ?? []), ...(look.acc ? [look.acc] : [])])) this.cosmetic.add(buildMonsterAccessory(id, track));
    if (!this.cosmetic.parent) this.head.add(this.cosmetic);
  }

  /** Chapter 2 — "the Blind One": no eyes, bandaged head, terrifying hearing. */
  public blind = false;
  public makeBlind() {
    this.blind = true;
    this.patrolSpeed = 1.25;
    this.investigateSpeed = 3.0;
    this.chaseSpeed = 5.0;
    this.applyLook({ skin: '#cdc6b4', eyes: '#000000', gown: '#2c3329', acc: 'bandages' });
    this.eyeMat.emissiveIntensity = 0;
    this.eyeMat.color.set(0x050505);
  }

  /** Path through the hospital (used to steer the creature player in anti-camping). */
  public planPath(from: THREE.Vector3, to: THREE.Vector3, boxes: CollisionBox[]) {
    return this.findPath(from, to, boxes);
  }

  /** All navigation nodes (to pick a far-away destination). */
  public get navPoints() {
    return [...this.nav.values()].map((n) => n.pos);
  }

  private setGoal(target: THREE.Vector3, boxes: CollisionBox[]) {
    this.goal.copy(target);
    this.path = this.findPath(this.position, target, boxes) ?? [];
    this.repathTimer = 0.5;
  }

  private nextPatrolGoal(boxes: CollisionBox[]) {
    for (let tries = 0; tries < this.route.length; tries++) {
      this.routeIdx = (this.routeIdx + 1) % this.route.length;
      const node = this.nav.get(this.route[this.routeIdx]);
      if (!node) continue;
      const p = this.findPath(this.position, node.pos, boxes);
      if (p) {
        this.goal.copy(node.pos);
        this.path = p;
        return;
      }
    }
    this.path = [];
  }

  // ---------------------------------------------------------------------
  // SENSES
  // ---------------------------------------------------------------------
  /** Set when the last heard noise came from a hidden player (talking in a locker…). */
  private noiseFromHiding = false;

  /** Sedative syringe: knocked out for `seconds`. */
  public stun(seconds: number) {
    this.state = 'STUNNED';
    this.stateTimer = seconds;
    this.path = [];
    this.speedNow = 0;
  }

  public alertNoise(origin: THREE.Vector3, loudness: number, boxes: CollisionBox[], fromHiding = false) {
    if (this.state === 'STUNNED') return;
    if (this.state === 'CHASE' && !this.blind) return;
    const dist = this.position.distanceTo(origin);
    // Walls muffle sound
    const occluded = !this.lineOfSight(this.eye(), new THREE.Vector3(origin.x, 1.2, origin.z), boxes);
    const range = loudness * (occluded ? 0.55 : 1) * (this.blind ? 1.5 : 1);
    if (this.blind && dist < range) {
      // The Blind One hunts by ear: every sound steers it, a loud one close by makes it lunge
      this.noiseFromHiding = fromHiding;
      this.lastKnown.copy(origin);
      if (this.state === 'CHASE') {
        this.lostSightTimer = 0;
        return;
      }
      if (dist < 7 && loudness >= 8 && !fromHiding) {
        this.startChase(origin);
        return;
      }
      if (this.state === 'INVESTIGATE' || this.state === 'SEARCH') {
        this.state = 'INVESTIGATE';
        this.setGoal(origin, boxes);
        return;
      }
      this.state = 'LISTEN';
      this.stateTimer = 0.5 + Math.random() * 0.4;
      this.path = [];
      sound.playMonsterGrowl(dist, 0);
      return;
    }
    if (dist < range) {
      this.noiseFromHiding = fromHiding;
      this.state = 'LISTEN';
      this.stateTimer = 1.2 + Math.random() * 0.6;
      this.lastKnown.copy(origin);
      this.path = [];
      sound.playMonsterGrowl(dist, 0);
    }
  }

  private eye() {
    return new THREE.Vector3(this.position.x, 2.0, this.position.z);
  }

  private lineOfSight(a: THREE.Vector3, b: THREE.Vector3, boxes: CollisionBox[]) {
    for (const box of boxes) {
      if (box.disabled) continue;
      if (box.max.y < 1.3) continue; // low furniture does not block sight
      if (segmentHitsBox(a.x, a.z, b.x, b.z, box, -0.02)) return false;
    }
    return true;
  }

  private canSee(s: MonsterSenses, boxes: CollisionBox[]) {
    if (s.playerHidden) return false;
    const dist = this.position.distanceTo(s.playerPos);
    // Blind: it only "sees" what it brushes against
    if (this.blind) return dist < 1.6;
    // Mostly blind: it sees light and close movement
    const range = 3.5 + 13 * s.playerVisibility;
    if (dist > range) return false;
    if (dist > 2.5) {
      const fwd = new THREE.Vector3(Math.sin(this.mesh.rotation.y), 0, Math.cos(this.mesh.rotation.y));
      const to = s.playerPos.clone().sub(this.position).setY(0).normalize();
      if (fwd.dot(to) < 0.15) return false;
    }
    return this.lineOfSight(this.eye(), s.playerPos, boxes);
  }

  // ---------------------------------------------------------------------
  // UPDATE
  // ---------------------------------------------------------------------
  /** Index of the player currently hunted (multiplayer). */
  private targetIdx = 0;

  /**
   * Several players: hunt the one it can see (keeping its current prey if
   * still in sight), otherwise keep track of the closest one.
   */
  public updateMulti(
    delta: number,
    players: MonsterSenses[],
    listener: Listener,
    boxes: CollisionBox[],
    onCatch: (playerIdx: number) => void
  ) {
    const alive = players.map((p, i) => (p.dead ? -1 : i)).filter((i) => i >= 0);
    if (alive.length === 0) {
      // Nobody left: wander
      const nobody: MonsterSenses = {
        playerPos: new THREE.Vector3(1e4, 0, 1e4),
        playerHidden: true,
        playerVisibility: 0,
        listenerRight: listener.right,
      };
      this.update(delta, nobody, boxes, () => {}, listener);
      return;
    }
    const seen = alive.filter((i) => this.canSee(players[i], boxes));
    const d = (i: number) => this.position.distanceTo(players[i].playerPos);
    let t: number;
    if (this.state === 'CHASE' && alive.includes(this.targetIdx) && (seen.includes(this.targetIdx) || seen.length === 0)) {
      t = this.targetIdx;
    } else if (seen.length) {
      t = seen.reduce((a, b) => (d(a) <= d(b) ? a : b));
    } else {
      t = alive.reduce((a, b) => (d(a) <= d(b) ? a : b));
    }
    this.targetIdx = t;
    this.update(delta, players[t], boxes, () => onCatch(t), listener);
  }

  public update(delta: number, s: MonsterSenses, boxes: CollisionBox[], onCatch: () => void, listener?: Listener) {
    this.animTime += delta;
    this.stateTimer -= delta;
    this.growlTimer -= delta;
    this.footstepTimer -= delta;
    this.repathTimer -= delta;

    const toPlayer = s.playerPos.clone().sub(this.position).setY(0);
    const dist = toPlayer.length();
    // Sounds are heard from the local player's position
    const toEar = (listener?.pos ?? s.playerPos).clone().sub(this.position).setY(0);
    const earDist = toEar.length();
    const pan = earDist > 0.01 ? THREE.MathUtils.clamp(toEar.normalize().dot(listener?.right ?? s.listenerRight) * -1, -1, 1) : 0;

    if (this.growlTimer <= 0) {
      sound.playMonsterGrowl(earDist, pan);
      this.growlTimer = 5 + Math.random() * 7;
    }

    // Sedated: slumped on the floor, harmless until it wakes up
    if (this.state === 'STUNNED') {
      this.speedNow = 0;
      if (this.stateTimer <= 0) {
        this.state = 'SEARCH';
        this.stateTimer = 4;
        this.path = [];
        sound.playMonsterGrowl(earDist, pan);
      }
      this.animate(delta);
      this.head.getWorldPosition(this.headWorld);
      return;
    }

    const sees = this.canSee(s, boxes);
    let speed = 0;

    // It followed your voice to the locker: it rips the door open
    if (
      s.playerHidden &&
      this.noiseFromHiding &&
      (this.state === 'INVESTIGATE' || this.state === 'SEARCH') &&
      dist < 1.8 &&
      this.lastKnown.distanceTo(s.playerPos) < 1.6
    ) {
      onCatch();
      return;
    }
    if (!s.playerHidden) this.noiseFromHiding = false;

    switch (this.state) {
      case 'PATROL':
        if (sees) {
          this.startChase(s.playerPos);
          break;
        }
        if (this.path.length === 0) this.nextPatrolGoal(boxes);
        speed = this.patrolSpeed;
        break;

      case 'LISTEN':
        this.faceToward(this.lastKnown, 3 * delta);
        if (sees) {
          this.startChase(s.playerPos);
          break;
        }
        if (this.stateTimer <= 0) {
          this.state = 'INVESTIGATE';
          this.setGoal(this.lastKnown, boxes);
        }
        break;

      case 'INVESTIGATE':
        if (sees) {
          this.startChase(s.playerPos);
          break;
        }
        speed = this.investigateSpeed;
        if (this.path.length === 0 || this.position.distanceTo(this.lastKnown) < 1.0) {
          this.state = 'SEARCH';
          this.stateTimer = 5;
        }
        break;

      case 'SEARCH':
        if (sees) {
          this.startChase(s.playerPos);
          break;
        }
        this.mesh.rotation.y += Math.sin(this.animTime * 1.7) * 1.6 * delta;
        if (this.stateTimer <= 0) {
          this.state = 'RETURN';
          this.path = [];
        }
        break;

      case 'CHASE': {
        if (s.playerHidden) {
          // It saw you climb into that locker...
          if (dist < 2.6) {
            onCatch();
            return;
          }
          this.state = 'TARGET_LOST';
          this.stateTimer = 4;
          this.path = [];
          break;
        }
        if (sees) {
          this.lostSightTimer = 0;
          this.lastKnown.copy(s.playerPos);
        } else {
          this.lostSightTimer += delta;
          if (this.lostSightTimer > 5) {
            this.state = 'SEARCH';
            this.stateTimer = 5;
            this.setGoal(this.lastKnown, boxes);
            break;
          }
        }
        // Keeps tracking the player for a moment after losing sight (it "smells" you)
        const target = this.lostSightTimer < 1.5 ? s.playerPos : this.lastKnown;
        if (this.repathTimer <= 0 || this.path.length === 0) this.setGoal(target, boxes);
        else if (this.path.length === 1) this.path[0].copy(target);
        speed = this.chaseSpeed;
        if (this.footstepTimer <= 0) {
          sound.playMonsterFootstep(earDist, pan, true);
          this.footstepTimer = 0.27;
        }
        break;
      }

      case 'TARGET_LOST':
        this.mesh.rotation.y += 1.6 * delta;
        if (this.stateTimer <= 0) {
          this.state = 'RETURN';
          this.path = [];
        }
        break;

      case 'RETURN':
        if (sees) {
          this.startChase(s.playerPos);
          break;
        }
        this.state = 'PATROL';
        this.path = [];
        break;
    }

    // Catch
    if (!s.playerHidden && dist < 1.15 && (this.state === 'CHASE' || dist < 0.9)) {
      onCatch();
      return;
    }

    // Slow footsteps while patrolling (audible through walls)
    if (speed > 0 && this.state !== 'CHASE' && this.footstepTimer <= 0) {
      sound.playMonsterFootstep(earDist, pan, false);
      this.footstepTimer = 0.62;
    }

    this.followPath(delta, speed, boxes);
    this.animate(delta);
    this.head.getWorldPosition(this.headWorld);
  }

  // ---------------------------------------------------------------------
  // MULTIPLAYER REPLICA (guest side): the host runs the AI, we only follow
  // ---------------------------------------------------------------------
  private net = { x: 0, z: 0, ry: 0, speed: 0, state: 'PATROL' as MonsterState, has: false };

  public get currentSpeed() {
    return this.speedNow;
  }

  public netApply(x: number, z: number, ry: number, state: MonsterState, speed: number) {
    this.net = { x, z, ry, speed, state, has: true };
  }

  public netUpdate(delta: number, listener: Listener) {
    if (!this.net.has) return;
    this.animTime += delta;
    this.growlTimer -= delta;
    this.footstepTimer -= delta;

    const prev = this.state;
    this.state = this.net.state;
    if (this.state === 'CHASE' && prev !== 'CHASE') sound.playMonsterChaseRoar();

    // Smoothly follow the host's position (teleport if far off)
    const dx = this.net.x - this.position.x;
    const dz = this.net.z - this.position.z;
    if (Math.hypot(dx, dz) > 4) {
      this.position.set(this.net.x, 0, this.net.z);
    } else {
      const k = 1 - Math.exp(-12 * delta);
      this.position.x += dx * k;
      this.position.z += dz * k;
    }
    let dr = this.net.ry - this.mesh.rotation.y;
    dr = Math.atan2(Math.sin(dr), Math.cos(dr));
    this.mesh.rotation.y += dr * (1 - Math.exp(-12 * delta));
    this.mesh.position.copy(this.position);
    this.speedNow = this.net.speed;

    // Local sounds
    const toEar = listener.pos.clone().sub(this.position).setY(0);
    const earDist = toEar.length();
    const pan = earDist > 0.01 ? THREE.MathUtils.clamp(toEar.normalize().dot(listener.right) * -1, -1, 1) : 0;
    if (this.growlTimer <= 0) {
      sound.playMonsterGrowl(earDist, pan);
      this.growlTimer = 5 + Math.random() * 7;
    }
    if (this.speedNow > 0.3 && this.footstepTimer <= 0) {
      const chasing = this.state === 'CHASE';
      sound.playMonsterFootstep(earDist, pan, chasing);
      this.footstepTimer = chasing ? 0.27 : 0.62;
    }

    this.animate(delta);
    this.head.getWorldPosition(this.headWorld);
  }

  private startChase(playerPos: THREE.Vector3) {
    if (this.state !== 'CHASE') {
      sound.playMonsterChaseRoar();
      this.path = [];
    }
    this.state = 'CHASE';
    this.lostSightTimer = 0;
    this.lastKnown.copy(playerPos);
  }

  private followPath(delta: number, speed: number, boxes: CollisionBox[]) {
    this.speedNow = THREE.MathUtils.damp(this.speedNow, speed, 6, delta);
    if (this.path.length === 0 || this.speedNow < 0.05) return;

    const target = this.path[0];
    const dir = target.clone().sub(this.position).setY(0);
    const len = dir.length();
    if (len < 0.45) {
      this.path.shift();
      return;
    }
    dir.divideScalar(len);
    this.faceToward(target, 6 * delta);

    // Open doors that are in the way
    for (const door of this.doors.values()) {
      if (!door.isOpen && !door.isLocked && door.center.distanceTo(this.position) < 1.6) {
        this.onOpenDoor(door);
      }
    }

    const step = dir.multiplyScalar(Math.min(this.speedNow * delta, len));
    this.slide(step, boxes);

    // Unstick: if barely moving, re-plan
    this.stuckTimer += delta;
    if (this.stuckTimer > 1) {
      if (this.position.distanceTo(this.lastPos) < 0.2) {
        this.path = this.findPath(this.position, this.goal, boxes) ?? [];
        if (this.state === 'PATROL') this.nextPatrolGoal(boxes);
      }
      this.lastPos.copy(this.position);
      this.stuckTimer = 0;
    }
  }

  private blocked(x: number, z: number, boxes: CollisionBox[]) {
    for (const b of boxes) {
      if (b.disabled) continue;
      if (b.doorId && this.isDoorPassable(b.doorId)) continue;
      if (x + RADIUS > b.min.x && x - RADIUS < b.max.x && z + RADIUS > b.min.z && z - RADIUS < b.max.z) return true;
    }
    return false;
  }

  private slide(step: THREE.Vector3, boxes: CollisionBox[]) {
    const nx = this.position.x + step.x;
    if (!this.blocked(nx, this.position.z, boxes)) this.position.x = nx;
    const nz = this.position.z + step.z;
    if (!this.blocked(this.position.x, nz, boxes)) this.position.z = nz;
    this.mesh.position.copy(this.position);
  }

  private faceToward(target: THREE.Vector3, maxStep: number) {
    const angle = Math.atan2(target.x - this.position.x, target.z - this.position.z);
    let diff = angle - this.mesh.rotation.y;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.mesh.rotation.y += Math.sign(diff) * Math.min(Math.abs(diff), maxStep);
  }

  // ---------------------------------------------------------------------
  // ANIMATION
  // ---------------------------------------------------------------------
  private animate(delta: number) {
    if (this.state === 'STUNNED') {
      // Slumped on its knees, twitching
      const k = 1 - Math.exp(-6 * delta);
      this.hips.position.y += (0.55 - this.hips.position.y) * k;
      this.spine.rotation.x += (1.15 - this.spine.rotation.x) * k;
      this.legs.forEach((l) => {
        l.hip.rotation.x += (-1.3 - l.hip.rotation.x) * k;
        l.knee.rotation.x += (2.2 - l.knee.rotation.x) * k;
      });
      this.arms.forEach((a) => {
        a.shoulder.rotation.x += (0.3 - a.shoulder.rotation.x) * k;
        a.elbow.rotation.x += (-0.1 - a.elbow.rotation.x) * k;
      });
      this.head.rotation.set(0.6 + Math.sin(this.animTime * 9) * 0.05, 0, 0.4);
      this.jaw.rotation.x = 0.7;
      this.eyeMat.emissiveIntensity = 0.6 + Math.random() * 0.4;
      return;
    }
    const chasing = this.state === 'CHASE';
    const moving = this.speedNow > 0.1;
    this.stepPhase += delta * (moving ? this.speedNow * 2.6 : 0);
    const p = this.stepPhase;
    const amp = moving ? Math.min(1, this.speedNow / 2) : 0;

    // Legs: asymmetric limp
    this.legs.forEach((leg, i) => {
      const ph = p + i * Math.PI;
      const swing = Math.sin(ph) * 0.55 * amp * (i === 0 ? 1 : 0.75);
      leg.hip.rotation.x = THREE.MathUtils.damp(leg.hip.rotation.x, swing, 12, delta);
      const kneeTarget = Math.max(0, -Math.cos(ph)) * 0.9 * amp + 0.08;
      leg.knee.rotation.x = THREE.MathUtils.damp(leg.knee.rotation.x, kneeTarget, 12, delta);
    });

    // Arms: dangle when walking, reach forward when chasing
    this.arms.forEach((arm, i) => {
      const ph = p + i * Math.PI;
      // Arms hang forward from the hunched shoulders, claws dragging near the knees
      const target = chasing ? -1.3 + Math.sin(ph * 2) * 0.25 : -0.35 + Math.sin(ph + Math.PI) * 0.3 * amp;
      arm.shoulder.rotation.x = THREE.MathUtils.damp(arm.shoulder.rotation.x, target, 8, delta);
      arm.elbow.rotation.x = THREE.MathUtils.damp(arm.elbow.rotation.x, chasing ? -0.5 : -0.45, 8, delta);
      arm.shoulder.rotation.z = (i === 0 ? -1 : 1) * (0.18 + Math.sin(this.animTime * 1.3 + i) * 0.05);
    });

    // Body: bob + lean into the chase
    this.hips.position.y = 1.08 - Math.abs(Math.sin(p)) * 0.06 * amp;
    this.spine.rotation.x = THREE.MathUtils.damp(this.spine.rotation.x, chasing ? 0.6 : 0.38, 4, delta);
    this.spine.rotation.z = Math.sin(p) * 0.06 * amp;

    // Head twitches & jaw
    if (Math.random() < (chasing ? 0.12 : 0.04)) {
      this.head.rotation.z = (Math.random() - 0.5) * 0.7;
      this.head.rotation.y = (Math.random() - 0.5) * 0.6;
    }
    const jawTarget = chasing ? 0.55 + Math.sin(this.animTime * 30) * 0.1 : 0.15 + Math.sin(this.animTime * 2) * 0.1;
    this.jaw.rotation.x = THREE.MathUtils.damp(this.jaw.rotation.x, jawTarget, 10, delta);
    this.eyeMat.emissiveIntensity = chasing ? 9 : 4 + Math.sin(this.animTime * 3) * 1;
  }

  /**
   * Scripted movement (chapter 3, the Stalker): walk straight toward `target`
   * at `speed`, sliding along walls, with its footsteps and growls.
   */
  public driveToward(target: THREE.Vector3, speed: number, delta: number, boxes: CollisionBox[], listener: Listener, chasing: boolean) {
    this.animTime += delta;
    this.growlTimer -= delta;
    this.footstepTimer -= delta;
    // Sedated: slumped on its knees (the caller decides when it wakes up)
    if (this.state === 'STUNNED') {
      this.speedNow = 0;
      this.animate(delta);
      this.head.getWorldPosition(this.headWorld);
      return;
    }
    const prev = this.state;
    this.state = chasing ? 'CHASE' : 'INVESTIGATE';
    if (chasing && prev !== 'CHASE') sound.playMonsterChaseRoar();
    this.speedNow = THREE.MathUtils.damp(this.speedNow, speed, 6, delta);
    const dir = target.clone().sub(this.position).setY(0);
    const len = dir.length();
    if (len > 0.05 && this.speedNow > 0.05) {
      this.faceToward(target, 8 * delta);
      dir.divideScalar(len).multiplyScalar(Math.min(this.speedNow * delta, len));
      this.slide(dir, boxes);
    }
    this.mesh.position.copy(this.position);
    const toEar = listener.pos.clone().sub(this.position).setY(0);
    const earDist = toEar.length();
    const pan = earDist > 0.01 ? THREE.MathUtils.clamp(toEar.normalize().dot(listener.right) * -1, -1, 1) : 0;
    if (this.growlTimer <= 0) {
      sound.playMonsterGrowl(earDist, pan);
      this.growlTimer = 4 + Math.random() * 5;
    }
    if (this.speedNow > 0.3 && this.footstepTimer <= 0) {
      sound.playMonsterFootstep(earDist, pan, chasing);
      this.footstepTimer = chasing ? 0.27 : 0.55;
    }
    this.animate(delta);
    this.head.getWorldPosition(this.headWorld);
  }

  /** Teleport (chapter 3: the Stalker catches up along your trail). */
  public placeAt(x: number, z: number) {
    this.position.set(x, 0, z);
    this.mesh.position.copy(this.position);
  }

  /** Cassette film: breathing / hunting idle animation outside of the game. */
  public animateFilm(delta: number, agitated = false) {
    this.animTime += delta;
    this.state = agitated ? 'CHASE' : 'PATROL';
    this.speedNow = 0;
    this.animate(delta);
  }

  /** Death sequence pose: lunges at the camera. */
  public poseLunge(camPos: THREE.Vector3, t: number) {
    const dir = camPos.clone().sub(this.position).setY(0).normalize();
    const angle = Math.atan2(dir.x, dir.z);
    this.mesh.rotation.y = angle;
    const dist = 1.35 - Math.min(t, 0.35) * 1.2;
    this.position.set(camPos.x - dir.x * dist, 0, camPos.z - dir.z * dist);
    this.mesh.position.copy(this.position);
    this.spine.rotation.x = 0.75;
    this.jaw.rotation.x = 0.9;
    this.arms.forEach((a) => {
      a.shoulder.rotation.x = -1.6;
      a.elbow.rotation.x = -0.3;
    });
    this.head.rotation.set(-0.7, 0, Math.sin(t * 40) * 0.15);
    this.eyeMat.emissiveIntensity = 12;
    this.head.getWorldPosition(this.headWorld);
  }

  public dispose() {
    this.disposables.forEach((d) => d.dispose());
    this.eyeMat.dispose();
  }
}
