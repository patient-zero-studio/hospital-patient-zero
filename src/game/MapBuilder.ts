import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ProceduralTextures as Tex } from '../textures/ProceduralTextures';
import { GameItem } from '../types';

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

/** 2D (XZ) axis-aligned collision box. Height is only informative. */
export interface CollisionBox {
  min: THREE.Vector3;
  max: THREE.Vector3;
  id?: string;
  /** Set on door boxes so AI knows it can open them. */
  doorId?: string;
  /** Disabled boxes are ignored (e.g. an open door). */
  disabled?: boolean;
}

export interface DoorObject {
  id: string;
  name: string;
  isOpen: boolean;
  isLocked: boolean;
  requiredKeyId?: string;
  requiredKeyName?: string;
  pivot: THREE.Group;
  closedRot: number;
  openRot: number;
  /** Current animated rotation of the pivot. */
  currentRot: number;
  center: THREE.Vector3;
  collision: CollisionBox;
  /** Optional little status LED (blast door). */
  statusLed?: THREE.MeshStandardMaterial;
}

export type ContainerType = 'drawer' | 'locker' | 'nightstand' | 'cabinet' | 'body' | 'safe' | 'crate' | 'desk' | 'shelf';

export interface ContainerObject {
  id: string;
  name: string;
  type: ContainerType;
  searched: boolean;
  itemInside: GameItem | null;
  position: THREE.Vector3;
  mesh: THREE.Object3D;
  locked?: boolean;
  /** Item the player must own to unlock (e.g. the note with a code). */
  requiredItemId?: string;
  lockedMessage?: string;
  unlockMessage?: string;
}

export interface FlickerLight {
  position: THREE.Vector3;
  color: THREE.Color;
  distance: number;
  /** Flicker state 0..1. */
  k: number;
  /** Final light intensity this frame (read by the engine's light pool). */
  current: number;
  fixtureMat: THREE.MeshStandardMaterial;
  baseIntensity: number;
  baseEmissive: number;
  nextFlicker: number;
  flicker: boolean;
  /** Lights that only switch on once the power is restored. */
  needsPower: boolean;
}

export interface HidingSpot {
  id: string;
  name: string;
  kind: 'locker' | 'bed';
  position: THREE.Vector3;
  viewDirection: THREE.Vector3;
}

export interface ScareTrigger {
  id: string;
  position: THREE.Vector3;
  radius: number;
  triggered: boolean;
}

export interface NavNode {
  id: string;
  pos: THREE.Vector3;
  links: { to: string; doorId?: string }[];
}

export interface LowZone {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface MapData {
  sceneGroup: THREE.Group;
  collisionBoxes: CollisionBox[];
  doors: Map<string, DoorObject>;
  containers: Map<string, ContainerObject>;
  lights: FlickerLight[];
  hidingSpots: HidingSpot[];
  scareTriggers: ScareTrigger[];
  interactiveMeshes: THREE.Object3D[];
  navNodes: Map<string, NavNode>;
  patrolRoute: string[];
  playerStart: THREE.Vector3;
  playerStartYaw: number;
  /** Spawn point + starting index in the patrol route, one per possible creature. */
  monsterSpawns: { pos: THREE.Vector3; routeIdx: number }[];
  /** Floor 2 creature patrol + spawn (difficulty ≥ 3). */
  upperRoute: string[];
  upperSpawn: THREE.Vector3;
  /** Where the stairs take you: `up` = arrival on floor 2, `down` = arrival on floor 1. */
  /** Arrival points of every staircase / hatch, by destination id (f1, f2, f2u, f3, b, f1h). */
  stairs: Record<string, { pos: THREE.Vector3; yaw: number }>;
  /** Items lying around at the start (realistic 3D models you pick up). */
  pickups: { item: GameItem; pos: THREE.Vector3; rotY: number }[];
  /** Extra creatures for the basement / floor 3, from a given difficulty. */
  extraMonsters: { pos: THREE.Vector3; route: string[]; minDifficulty: number }[];
  /** Chapter 2: the sewers under the hospital */
  sewer: {
    start: THREE.Vector3;
    startYaw: number;
    spawns: { pos: THREE.Vector3; routeIdx: number }[];
    route: string[];
    /** walking in there splashes (loud) */
    water: LowZone[];
    notes: number;
  };
  /** x above this value = floor 2. */
  upperFloorX: number;
  /** Floor-1 staircase: collapsed until rebuilt with the warehouse planks. */
  stairsRepair: { steps: THREE.Object3D[]; rubble: THREE.Object3D };
  /** Air duct grille in the stairwell lobby (removed with [E]). */
  vent: { grille: THREE.Object3D; collision: CollisionBox };
  /** Low passages: you have to crawl (crouch) to get in. */
  lowZones: LowZone[];
  /** Duct centreline graph, where the Crawler lives. */
  duct: { nodes: Record<string, THREE.Vector3>; edges: [string, string][]; nest: string };
  /** Breaker box status lamp (red → green when power is restored). */
  breakerLed: THREE.MeshStandardMaterial;
  totalNotes: number;
  disposables: { dispose: () => void }[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WALL_H = 3.5;
const WALL_T = 0.3;
const DOOR_W = 1.5;
const DOOR_H = 2.5;
const OPENING = 1.6;
const TEX_H = 2.5; // metres covered by one horizontal texture repeat

/**
 * Rewrites box-geometry UVs from world-space positions so textures keep a
 * constant scale whatever the size of the box (no more stretched walls).
 */
const applyWorldUVs = (geo: THREE.BufferGeometry, offset: THREE.Vector3, horiz = TEX_H, vert = WALL_H, floorScale = TEX_H) => {
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + offset.x;
    const y = pos.getY(i) + offset.y;
    const z = pos.getZ(i) + offset.z;
    const nx = Math.abs(nor.getX(i));
    const ny = Math.abs(nor.getY(i));
    if (ny > 0.5) uv.setXY(i, x / floorScale, -z / floorScale);
    else if (nx > 0.5) uv.setXY(i, z / horiz, y / vert);
    else uv.setXY(i, x / horiz, y / vert);
  }
  uv.needsUpdate = true;
};

export class MapBuilder {
  private static mergeStatic(
    root: THREE.Group,
    dynamicRoots: THREE.Object3D[],
    track: <T extends { dispose: () => void }>(o: T) => T
  ) {
    root.updateMatrixWorld(true);
    const keep = new Set<THREE.Object3D>();
    for (const r of dynamicRoots) r.traverse((o) => keep.add(o));

    const buckets = new Map<string, { mat: THREE.Material; cast: boolean; order: number; geos: THREE.BufferGeometry[] }>();
    const toRemove: THREE.Mesh[] = [];
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || keep.has(mesh) || Array.isArray(mesh.material)) return;
      const mat = mesh.material as THREE.Material;
      const key = `${mat.uuid}_${mesh.castShadow ? 1 : 0}`;
      let g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
      for (const name of Object.keys(g.attributes)) {
        if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
      }
      if (!g.attributes.uv || !g.attributes.normal) return; // keep as-is
      g.applyMatrix4(mesh.matrixWorld);
      let b = buckets.get(key);
      if (!b) {
        b = { mat, cast: mesh.castShadow, order: mesh.renderOrder, geos: [] };
        buckets.set(key, b);
      }
      b.geos.push(g);
      toRemove.push(mesh);
    });

    for (const m of toRemove) m.parent?.remove(m);
    for (const b of buckets.values()) {
      const merged = mergeGeometries(b.geos, false);
      b.geos.forEach((g) => g.dispose());
      if (!merged) continue;
      track(merged);
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, b.mat);
      mesh.castShadow = b.cast;
      mesh.receiveShadow = true;
      mesh.renderOrder = b.order;
      mesh.matrixAutoUpdate = false;
      root.add(mesh);
    }
    // Drop now-empty groups
    const empties: THREE.Object3D[] = [];
    root.traverse((o) => {
      if (o !== root && !(o as THREE.Mesh).isMesh && o.children.length === 0 && !keep.has(o)) empties.push(o);
    });
    empties.forEach((o) => o.parent?.remove(o));
  }

  public static buildHospital(): MapData {
    const sceneGroup = new THREE.Group();
    const collisionBoxes: CollisionBox[] = [];
    const doors = new Map<string, DoorObject>();
    const containers = new Map<string, ContainerObject>();
    const lights: FlickerLight[] = [];
    const hidingSpots: HidingSpot[] = [];
    const scareTriggers: ScareTrigger[] = [];
    const interactiveMeshes: THREE.Object3D[] = [];
    const navNodes = new Map<string, NavNode>();
    const disposables: { dispose: () => void }[] = [];

    const track = <T extends { dispose: () => void }>(o: T): T => {
      disposables.push(o);
      return o;
    };

    // ------------------------------------------------------------------
    // Materials
    // ------------------------------------------------------------------
    const wallTex = Tex.getDirtyWallTexture();
    const wallMat = track(
      new THREE.MeshStandardMaterial({ map: wallTex, bumpMap: wallTex, bumpScale: 1.2, roughness: 0.92, metalness: 0 })
    );
    const floorTex = Tex.getFloorTileTexture();
    const floorMat = track(
      new THREE.MeshStandardMaterial({
        map: floorTex,
        roughnessMap: Tex.getFloorRoughnessTexture(),
        roughness: 0.55,
        metalness: 0.05,
        bumpMap: floorTex,
        bumpScale: 0.6,
      })
    );
    const ceilTex = Tex.getCeilingTexture();
    const ceilingMat = track(new THREE.MeshStandardMaterial({ map: ceilTex, bumpMap: ceilTex, bumpScale: 1.5, roughness: 0.95 }));
    const metalTex = Tex.getRustedMetalTexture();
    const metalMat = track(new THREE.MeshStandardMaterial({ map: metalTex, roughness: 0.55, metalness: 0.65, bumpMap: metalTex, bumpScale: 0.4 }));
    const darkMetalMat = track(new THREE.MeshStandardMaterial({ color: 0x2a2e30, roughness: 0.5, metalness: 0.8 }));
    const chromeMat = track(new THREE.MeshStandardMaterial({ color: 0xb8bcc0, roughness: 0.25, metalness: 1 }));
    const doorMat = track(new THREE.MeshStandardMaterial({ map: Tex.getDoorTexture(), roughness: 0.7, metalness: 0.3 }));
    const blastDoorMat = track(new THREE.MeshStandardMaterial({ map: metalTex, color: 0x9a8a50, roughness: 0.45, metalness: 0.85 }));
    const exitDoorMat = track(new THREE.MeshStandardMaterial({ map: metalTex, color: 0xa04040, roughness: 0.6, metalness: 0.5 }));
    const sheetMat = track(new THREE.MeshStandardMaterial({ color: 0x9a9f98, roughness: 0.95 }));
    const stainedSheetMat = track(new THREE.MeshStandardMaterial({ map: Tex.getGownTexture(), color: 0xbfb8aa, roughness: 0.95 }));
    const woodMat = track(new THREE.MeshStandardMaterial({ color: 0x4a3626, roughness: 0.75 }));
    const glassMat = track(
      new THREE.MeshPhysicalMaterial({
        color: 0x8ab8c8,
        transparent: true,
        opacity: 0.18,
        roughness: 0.05,
        metalness: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
    const blackMat = track(new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 1 }));
    const paperMat = track(new THREE.MeshStandardMaterial({ map: Tex.getPaperTexture(), roughness: 0.9, side: THREE.DoubleSide }));
    const cardboardMat = track(new THREE.MeshStandardMaterial({ color: 0x6b5236, roughness: 0.95 }));
    const decalMat = (map: THREE.Texture, opts: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
      track(
        new THREE.MeshStandardMaterial({
          map,
          transparent: true,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -4,
          roughness: 0.35,
          ...opts,
        })
      );
    // Shared plain-colour materials (one material per colour = fewer draw calls after merging)
    const colorMats = new Map<string, THREE.MeshStandardMaterial>();
    const colorMat = (hex: number, roughness: number) => {
      const key = `${hex}_${roughness}`;
      let m = colorMats.get(key);
      if (!m) {
        m = track(new THREE.MeshStandardMaterial({ color: hex, roughness }));
        colorMats.set(key, m);
      }
      return m;
    };
    const bloodMat = decalMat(Tex.getBloodDecalTexture(0));
    const bloodTrailMat = decalMat(Tex.getBloodDecalTexture(1));

    // ------------------------------------------------------------------
    // Generic helpers
    // ------------------------------------------------------------------
    const addBox = (
      w: number,
      h: number,
      d: number,
      x: number,
      y: number,
      z: number,
      mat: THREE.Material,
      opts: { collide?: boolean; worldUV?: boolean; shadow?: boolean; parent?: THREE.Object3D } = {}
    ) => {
      const geo = track(new THREE.BoxGeometry(w, h, d));
      if (opts.worldUV) applyWorldUVs(geo, new THREE.Vector3(x, y, z));
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      mesh.castShadow = opts.shadow ?? true;
      mesh.receiveShadow = true;
      (opts.parent ?? sceneGroup).add(mesh);
      if (opts.collide) {
        collisionBoxes.push({
          min: new THREE.Vector3(x - w / 2, y - h / 2, z - d / 2),
          max: new THREE.Vector3(x + w / 2, y + h / 2, z + d / 2),
        });
      }
      return mesh;
    };

    const addCollider = (cx: number, cz: number, hw: number, hd: number, h = 2) => {
      const box: CollisionBox = {
        min: new THREE.Vector3(cx - hw, 0, cz - hd),
        max: new THREE.Vector3(cx + hw, h, cz + hd),
      };
      collisionBoxes.push(box);
      return box;
    };

    const addFloorAndCeiling = (x: number, z: number, w: number, d: number) => {
      addBox(w, 0.1, d, x, -0.05, z, floorMat, { worldUV: true, shadow: false });
      addBox(w, 0.1, d, x, WALL_H + 0.05, z, ceilingMat, { worldUV: true, shadow: false });
    };

    /** Door frame trims (jambs + head) around an opening. */
    const addFrame = (axis: 'x' | 'z', wallCoord: number, center: number, mat: THREE.Material = darkMetalMat) => {
      const jw = 0.09;
      const depth = WALL_T + 0.08;
      if (axis === 'x') {
        addBox(depth, DOOR_H + jw, jw, wallCoord, (DOOR_H + jw) / 2, center - OPENING / 2 - jw / 2, mat, { shadow: false });
        addBox(depth, DOOR_H + jw, jw, wallCoord, (DOOR_H + jw) / 2, center + OPENING / 2 + jw / 2, mat, { shadow: false });
        addBox(depth, jw, OPENING + jw * 2, wallCoord, DOOR_H + jw / 2, center, mat, { shadow: false });
      } else {
        addBox(jw, DOOR_H + jw, depth, center - OPENING / 2 - jw / 2, (DOOR_H + jw) / 2, wallCoord, mat, { shadow: false });
        addBox(jw, DOOR_H + jw, depth, center + OPENING / 2 + jw / 2, (DOOR_H + jw) / 2, wallCoord, mat, { shadow: false });
        addBox(OPENING + jw * 2, jw, depth, center, DOOR_H + jw / 2, wallCoord, mat, { shadow: false });
      }
    };

    /**
     * Wall running along Z at constant X, from z0 to z1, with door openings
     * centred at `doorCenters` (an opening is OPENING wide, with a lintel).
     */
    const wallAlongZ = (x: number, z0: number, z1: number, doorCenters: number[] = []) => {
      let cursor = z0 - WALL_T / 2;
      const end = z1 + WALL_T / 2;
      for (const c of [...doorCenters].sort((a, b) => a - b)) {
        const a = c - OPENING / 2;
        const b = c + OPENING / 2;
        if (a > cursor) addBox(WALL_T, WALL_H, a - cursor, x, WALL_H / 2, (cursor + a) / 2, wallMat, { collide: true, worldUV: true, shadow: false });
        addBox(WALL_T, WALL_H - DOOR_H, OPENING, x, (WALL_H + DOOR_H) / 2, c, wallMat, { worldUV: true, shadow: false });
        addFrame('x', x, c);
        cursor = b;
      }
      if (end > cursor) addBox(WALL_T, WALL_H, end - cursor, x, WALL_H / 2, (cursor + end) / 2, wallMat, { collide: true, worldUV: true, shadow: false });
    };

    /** Wall running along X at constant Z. */
    const wallAlongX = (z: number, x0: number, x1: number, doorCenters: number[] = []) => {
      let cursor = x0 - WALL_T / 2;
      const end = x1 + WALL_T / 2;
      for (const c of [...doorCenters].sort((a, b) => a - b)) {
        const a = c - OPENING / 2;
        const b = c + OPENING / 2;
        if (a > cursor) addBox(a - cursor, WALL_H, WALL_T, (cursor + a) / 2, WALL_H / 2, z, wallMat, { collide: true, worldUV: true, shadow: false });
        addBox(OPENING, WALL_H - DOOR_H, WALL_T, c, (WALL_H + DOOR_H) / 2, z, wallMat, { worldUV: true, shadow: false });
        addFrame('z', z, c);
        cursor = b;
      }
      if (end > cursor) addBox(end - cursor, WALL_H, WALL_T, (cursor + end) / 2, WALL_H / 2, z, wallMat, { collide: true, worldUV: true, shadow: false });
    };

    /** Flat decal on a floor or a wall. `normal` is the facing axis. */
    const addDecal = (
      mat: THREE.Material,
      w: number,
      h: number,
      x: number,
      y: number,
      z: number,
      facing: 'up' | '+x' | '-x' | '+z' | '-z',
      rot = 0
    ) => {
      const geo = track(new THREE.PlaneGeometry(w, h));
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      if (facing === 'up') {
        m.rotation.set(-Math.PI / 2, 0, rot);
      } else if (facing === '+x') m.rotation.set(0, Math.PI / 2, rot);
      else if (facing === '-x') m.rotation.set(0, -Math.PI / 2, rot);
      else if (facing === '+z') m.rotation.set(0, 0, rot);
      else m.rotation.set(0, Math.PI, rot);
      m.receiveShadow = true;
      m.renderOrder = 1;
      sceneGroup.add(m);
      return m;
    };

    const addLight = (
      x: number,
      z: number,
      color = 0xffeedd,
      intensity = 9,
      opts: { flicker?: boolean; needsPower?: boolean; distance?: number } = {}
    ) => {
      // No PointLight here: the engine drives a small fixed pool of real lights
      // and assigns them to the fixtures nearest to the player (much cheaper on GPU).

      // Fluorescent fixture: metal housing + emissive diffuser (picked up by bloom)
      addBox(1.3, 0.08, 0.36, x, WALL_H - 0.04, z, darkMetalMat, { shadow: false });
      const fixtureMat = track(
        new THREE.MeshStandardMaterial({
          color: 0x222222,
          emissive: new THREE.Color(color),
          emissiveIntensity: opts.needsPower ? 0 : 2.2,
        })
      );
      addBox(1.2, 0.04, 0.26, x, WALL_H - 0.09, z, fixtureMat, { shadow: false });

      lights.push({
        position: new THREE.Vector3(x, WALL_H - 0.35, z),
        color: new THREE.Color(color),
        distance: opts.distance ?? 13,
        k: 1,
        current: 0,
        fixtureMat,
        baseIntensity: intensity,
        baseEmissive: 2.2,
        nextFlicker: Math.random() * 2 + 1,
        flicker: !!opts.flicker,
        needsPower: !!opts.needsPower,
      });
    };

    const addDoor = (
      id: string,
      name: string,
      axis: 'x' | 'z',
      wallCoord: number,
      center: number,
      swing: 1 | -1,
      opts: { locked?: boolean; keyId?: string; keyName?: string; style?: 'normal' | 'blast' | 'exit'; sub?: string } = {}
    ) => {
      const pivot = new THREE.Group();
      let closedRot: number;
      let openRot: number;
      if (axis === 'x') {
        pivot.position.set(wallCoord, 0, center - DOOR_W / 2);
        closedRot = -Math.PI / 2;
        openRot = swing > 0 ? 0 : -Math.PI;
      } else {
        pivot.position.set(center - DOOR_W / 2, 0, wallCoord);
        closedRot = 0;
        openRot = swing > 0 ? -Math.PI / 2 : Math.PI / 2;
      }
      pivot.rotation.y = closedRot;

      const style = opts.style ?? 'normal';
      const mat = style === 'blast' ? blastDoorMat : style === 'exit' ? exitDoorMat : doorMat;
      const panel = new THREE.Mesh(track(new THREE.BoxGeometry(DOOR_W - 0.02, DOOR_H - 0.02, style === 'blast' ? 0.16 : 0.07)), mat);
      panel.position.set(DOOR_W / 2, DOOR_H / 2, 0);
      panel.castShadow = true;
      panel.receiveShadow = true;
      panel.userData = { isDoor: true, doorId: id };
      pivot.add(panel);

      const thick = style === 'blast' ? 0.09 : 0.045;
      // Name plates on both faces
      const signMat = track(new THREE.MeshStandardMaterial({ map: Tex.getDoorSignTexture(name, opts.sub), roughness: 0.6 }));
      for (const side of [1, -1]) {
        const sign = new THREE.Mesh(track(new THREE.PlaneGeometry(0.62, 0.2)), signMat);
        sign.position.set(0, DOOR_H * 0.2 + 0.05, side * thick);
        if (side < 0) sign.rotation.y = Math.PI;
        panel.add(sign);

        // Handle / push bar
        if (style === 'exit') {
          const bar = new THREE.Mesh(track(new THREE.CylinderGeometry(0.025, 0.025, 1.1, 10)), chromeMat);
          bar.rotation.z = Math.PI / 2;
          bar.position.set(0.05, -0.2, side * (thick + 0.05));
          panel.add(bar);
        } else if (style === 'normal') {
          const handle = new THREE.Mesh(track(new THREE.BoxGeometry(0.16, 0.03, 0.04)), chromeMat);
          handle.position.set(DOOR_W / 2 - 0.18, -0.2, side * (thick + 0.03));
          panel.add(handle);
        }
      }

      if (style === 'normal') {
        // Small wired-glass window
        const win = new THREE.Mesh(track(new THREE.BoxGeometry(0.34, 0.5, 0.075)), glassMat);
        win.position.set(0, 0.55, 0);
        panel.add(win);
        const winFrame = new THREE.Mesh(track(new THREE.BoxGeometry(0.4, 0.56, 0.06)), blackMat);
        winFrame.position.set(0, 0.55, 0);
        winFrame.scale.set(1, 1, 0.9);
        panel.add(winFrame);
      }

      let statusLed: THREE.MeshStandardMaterial | undefined;
      if (style === 'blast') {
        // Hazard stripes + card reader with LED on the corridor side
        const stripeMat = track(new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.6 }));
        for (let i = 0; i < 5; i++) {
          const s = new THREE.Mesh(track(new THREE.BoxGeometry(0.12, 0.6, 0.17)), stripeMat);
          s.position.set(-0.6 + i * 0.3, -DOOR_H / 2 + 0.35, 0);
          s.rotation.z = 0.6;
          panel.add(s);
        }
        statusLed = track(new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff1100, emissiveIntensity: 3 }));
        const reader = new THREE.Mesh(track(new THREE.BoxGeometry(0.16, 0.26, 0.05)), darkMetalMat);
        reader.position.set(DOOR_W / 2 - 0.25, 0, 0.11);
        panel.add(reader);
        const led = new THREE.Mesh(track(new THREE.BoxGeometry(0.06, 0.03, 0.02)), statusLed);
        led.position.set(0, 0.08, 0.03);
        reader.add(led);
      }

      sceneGroup.add(pivot);
      interactiveMeshes.push(panel);

      const c3 = axis === 'x' ? new THREE.Vector3(wallCoord, 0, center) : new THREE.Vector3(center, 0, wallCoord);
      const collision: CollisionBox =
        axis === 'x'
          ? {
              min: new THREE.Vector3(wallCoord - 0.12, 0, center - OPENING / 2),
              max: new THREE.Vector3(wallCoord + 0.12, DOOR_H, center + OPENING / 2),
              id: `door_${id}`,
              doorId: id,
            }
          : {
              min: new THREE.Vector3(center - OPENING / 2, 0, wallCoord - 0.12),
              max: new THREE.Vector3(center + OPENING / 2, DOOR_H, wallCoord + 0.12),
              id: `door_${id}`,
              doorId: id,
            };
      collisionBoxes.push(collision);

      doors.set(id, {
        id,
        name,
        isOpen: false,
        isLocked: !!opts.locked,
        requiredKeyId: opts.keyId,
        requiredKeyName: opts.keyName,
        pivot,
        closedRot,
        openRot,
        currentRot: closedRot,
        center: c3,
        collision,
        statusLed,
      });
    };

    const addContainer = (
      id: string,
      name: string,
      type: ContainerType,
      mesh: THREE.Object3D,
      itemInside: GameItem | null,
      opts: { locked?: boolean; requiredItemId?: string; lockedMessage?: string; unlockMessage?: string } = {}
    ) => {
      mesh.traverse((o) => {
        o.userData = { ...o.userData, isContainer: true, containerId: id };
      });
      interactiveMeshes.push(mesh);
      const p = new THREE.Vector3();
      mesh.getWorldPosition(p);
      containers.set(id, {
        id,
        name,
        type,
        searched: false,
        itemInside,
        position: p,
        mesh,
        ...opts,
      });
    };

    // ------------------------------------------------------------------
    // Furniture builders
    // ------------------------------------------------------------------
    const nightstand = (x: number, z: number, rotY = 0) => {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      g.rotation.y = rotY;
      addBox(0.55, 0.72, 0.5, 0, 0.36, 0, woodMat, { parent: g });
      addBox(0.5, 0.18, 0.02, 0, 0.55, 0.26, track(new THREE.MeshStandardMaterial({ color: 0x3a2a1c, roughness: 0.7 })), { parent: g });
      addBox(0.12, 0.025, 0.03, 0, 0.55, 0.28, chromeMat, { parent: g });
      sceneGroup.add(g);
      addCollider(x, z, 0.3, 0.3, 0.8);
      return g;
    };

    const cabinet = (x: number, z: number, rotY = 0, w = 1.1, h = 1.9, d = 0.5) => {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      g.rotation.y = rotY;
      addBox(w, h, d, 0, h / 2, 0, metalMat, { parent: g });
      // Glass doors front with shelves visible behind
      addBox(w - 0.1, h - 0.15, 0.02, 0, h / 2 + 0.05, d / 2 + 0.01, glassMat, { parent: g, shadow: false });
      for (let i = 1; i < 4; i++) {
        addBox(w - 0.1, 0.03, d - 0.08, 0, (h / 4) * i, 0, chromeMat, { parent: g, shadow: false });
        // Medicine bottles
        for (let b = 0; b < 5; b++) {
          if (Math.random() < 0.35) continue;
          const bottle = new THREE.Mesh(
            track(new THREE.CylinderGeometry(0.035, 0.035, 0.14, 8)),
            colorMat([0x7a4b21, 0xdddddd, 0x2f5a7a][b % 3], 0.3)
          );
          bottle.position.set(-w / 2 + 0.15 + b * ((w - 0.3) / 4), (h / 4) * i + 0.085, 0);
          if (Math.random() < 0.2) {
            bottle.rotation.z = Math.PI / 2;
            bottle.position.y -= 0.04;
          }
          g.add(bottle);
        }
      }
      sceneGroup.add(g);
      const along = Math.abs(Math.sin(rotY)) > 0.5;
      addCollider(x, z, (along ? d : w) / 2 + 0.02, (along ? w : d) / 2 + 0.02, h);
      return g;
    };

    const pendingBeds: { id: string; x: number; z: number; rotY: number }[] = [];
    const hospitalBed = (x: number, z: number, rotY = 0, opts: { body?: boolean; sheetBlood?: boolean } = {}) => {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      g.rotation.y = rotY;
      // Frame + legs with casters
      addBox(1.0, 0.08, 2.1, 0, 0.55, 0, metalMat, { parent: g });
      for (const [lx, lz] of [
        [-0.45, -0.95],
        [0.45, -0.95],
        [-0.45, 0.95],
        [0.45, 0.95],
      ]) {
        addBox(0.05, 0.5, 0.05, lx, 0.3, lz, chromeMat, { parent: g, shadow: false });
        const wheel = new THREE.Mesh(track(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 10)), blackMat);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(lx, 0.05, lz);
        g.add(wheel);
      }
      // Head & foot boards
      addBox(1.02, 0.55, 0.05, 0, 0.85, -1.05, metalMat, { parent: g });
      addBox(1.02, 0.35, 0.05, 0, 0.75, 1.05, metalMat, { parent: g });
      // Mattress & pillow
      const mattress = addBox(0.95, 0.16, 2.0, 0, 0.67, 0, opts.sheetBlood ? stainedSheetMat : sheetMat, { parent: g });
      mattress.rotation.z = 0.01;
      const pillow = new THREE.Mesh(track(new THREE.CapsuleGeometry(0.12, 0.5, 4, 8)), sheetMat);
      pillow.rotation.z = Math.PI / 2;
      pillow.scale.set(1, 1, 0.55);
      pillow.position.set(0, 0.8, -0.78);
      pillow.castShadow = true;
      g.add(pillow);
      // Side rails
      for (const side of [-1, 1]) {
        const rail = new THREE.Mesh(track(new THREE.CylinderGeometry(0.018, 0.018, 1.4, 8)), chromeMat);
        rail.rotation.x = Math.PI / 2;
        rail.position.set(side * 0.5, 0.9, -0.1);
        g.add(rail);
      }
      // You can crawl under any bed to hide (the corpse on top stays searchable)
      const hideId = `bed-${pendingBeds.length + 1}`;
      g.traverse((o) => (o.userData = { isHidingSpot: true, spotId: hideId }));
      interactiveMeshes.push(g);
      pendingBeds.push({ id: hideId, x, z, rotY });

      let bodyMesh: THREE.Object3D | null = null;
      if (opts.body) {
        // Covered corpse: lumpy sheet with a visible hand
        const bodyGroup = new THREE.Group();
        const torso = new THREE.Mesh(track(new THREE.CapsuleGeometry(0.22, 1.2, 6, 12)), stainedSheetMat);
        torso.rotation.x = Math.PI / 2;
        torso.scale.set(1.15, 1, 0.6);
        torso.position.set(0, 0.86, 0.1);
        torso.castShadow = true;
        bodyGroup.add(torso);
        const head = new THREE.Mesh(track(new THREE.SphereGeometry(0.15, 12, 10)), stainedSheetMat);
        head.position.set(0, 0.9, -0.72);
        head.scale.set(1, 0.8, 1.1);
        bodyGroup.add(head);
        const hand = new THREE.Mesh(
          track(new THREE.CapsuleGeometry(0.035, 0.32, 4, 8)),
          track(new THREE.MeshStandardMaterial({ map: Tex.getMonsterSkinTexture(), color: 0xa0a090, roughness: 0.8 }))
        );
        hand.position.set(0.48, 0.62, 0.15);
        hand.rotation.z = 0.25;
        bodyGroup.add(hand);
        g.add(bodyGroup);
        bodyMesh = bodyGroup;
      }
      sceneGroup.add(g);
      const along = Math.abs(Math.sin(rotY)) > 0.5;
      addCollider(x, z, along ? 1.1 : 0.55, along ? 0.55 : 1.1, 1.1);
      return { group: g, body: bodyMesh };
    };

    const locker = (id: string, name: string, x: number, z: number, rotY: number) => {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      g.rotation.y = rotY;
      const body = addBox(0.85, 2.1, 0.6, 0, 1.05, 0, metalMat, { parent: g });
      // Door front with vent slits
      const front = addBox(0.78, 2.0, 0.03, 0, 1.05, 0.31, metalMat, { parent: g });
      for (let i = 0; i < 6; i++) {
        addBox(0.4, 0.025, 0.02, 0, 1.55 + i * 0.06, 0.33, blackMat, { parent: g, shadow: false });
      }
      addBox(0.04, 0.18, 0.04, 0.3, 1.1, 0.34, chromeMat, { parent: g, shadow: false });
      for (const m of [body, front]) {
        m.userData = { isHidingSpot: true, spotId: id };
      }
      g.userData = { isHidingSpot: true, spotId: id };
      interactiveMeshes.push(g);
      sceneGroup.add(g);

      const forward = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotY);
      hidingSpots.push({ id, name, kind: 'locker', position: new THREE.Vector3(x, 1.62, z), viewDirection: forward });
      const along = Math.abs(Math.sin(rotY)) > 0.5;
      addCollider(x, z, along ? 0.32 : 0.45, along ? 0.45 : 0.32, 2.2);
    };

    const ivStand = (x: number, z: number) => {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      const pole = new THREE.Mesh(track(new THREE.CylinderGeometry(0.015, 0.015, 1.9, 8)), chromeMat);
      pole.position.y = 0.95;
      g.add(pole);
      for (let i = 0; i < 5; i++) {
        const leg = new THREE.Mesh(track(new THREE.CylinderGeometry(0.012, 0.012, 0.35, 6)), chromeMat);
        leg.rotation.z = Math.PI / 2;
        leg.rotation.y = (i / 5) * Math.PI * 2;
        leg.position.set(Math.cos((i / 5) * Math.PI * 2) * 0.17, 0.04, -Math.sin((i / 5) * Math.PI * 2) * 0.17);
        g.add(leg);
      }
      const bag = new THREE.Mesh(
        track(new THREE.CapsuleGeometry(0.07, 0.16, 4, 8)),
        track(new THREE.MeshPhysicalMaterial({ color: 0x8a1a12, transparent: true, opacity: 0.75, roughness: 0.2 }))
      );
      bag.position.set(0.1, 1.72, 0);
      bag.scale.set(1, 1, 0.45);
      g.add(bag);
      sceneGroup.add(g);
      addCollider(x, z, 0.18, 0.18, 1.9);
    };

    const wheelchair = (x: number, z: number, rotY: number, tipped = false) => {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      g.rotation.y = rotY;
      for (const side of [-1, 1]) {
        const wheel = new THREE.Mesh(track(new THREE.TorusGeometry(0.3, 0.025, 6, 20)), blackMat);
        wheel.rotation.y = Math.PI / 2;
        wheel.position.set(side * 0.3, 0.32, 0);
        g.add(wheel);
      }
      addBox(0.5, 0.05, 0.45, 0, 0.5, 0, darkMetalMat, { parent: g });
      addBox(0.5, 0.45, 0.04, 0, 0.75, -0.22, darkMetalMat, { parent: g });
      if (tipped) {
        g.rotation.z = Math.PI / 2.2;
        g.position.y = 0.3;
      }
      sceneGroup.add(g);
      addCollider(x, z, 0.4, 0.4, 1);
    };

    const papers = (cx: number, cz: number, count: number, spread = 1) => {
      for (let i = 0; i < count; i++) {
        addDecal(
          paperMat,
          0.21,
          0.28,
          cx + (Math.random() - 0.5) * spread,
          0.004 + i * 0.0005,
          cz + (Math.random() - 0.5) * spread,
          'up',
          Math.random() * Math.PI * 2
        );
      }
    };

    const crate = (x: number, z: number, s = 0.5, rot = 0) => {
      const m = addBox(s, s * 0.8, s, x, (s * 0.8) / 2, z, cardboardMat);
      m.rotation.y = rot;
      addCollider(x, z, s / 2 + 0.05, s / 2 + 0.05, s);
      return m;
    };

    // ------------------------------------------------------------------
    // ARCHITECTURE
    //   Corridor  x[-3,3]  z[-26,10]
    //   Ward      x[-13,-3] z[-10,2]   (Room 104: x[-13,-7] z[-10,-4])
    //   Pharmacy  x[-13,-3] z[-26,-14]
    //   Surgery   x[3,13]  z[-10,2]
    //   Archives  x[3,13]  z[2,10]
    //   Morgue    x[3,13]  z[-26,-14]
    //   Lab       x[-7,7]  z[-42,-26]
    // ------------------------------------------------------------------
    addFloorAndCeiling(0, -8, 6, 36);
    addFloorAndCeiling(-8, -4, 10, 12);
    addFloorAndCeiling(-8, -20, 10, 12);
    addFloorAndCeiling(8, -4, 10, 12);
    addFloorAndCeiling(8, 6, 10, 8);
    addFloorAndCeiling(8, -20, 10, 12);
    addFloorAndCeiling(0, -34, 14, 16);
    // Dead spaces between wings (never visible but keeps the ceiling closed)
    addFloorAndCeiling(-8, -12, 10, 4);
    addFloorAndCeiling(8, -12, 10, 4);

    wallAlongZ(-3, -26, 10, [-18, -1, 6]);
    wallAlongZ(3, -26, 10, [-20, -4, 6]);
    wallAlongZ(-13, -26, 2);
    wallAlongZ(13, -26, 10);
    wallAlongX(10, -3, 13, [0]);
    wallAlongX(2, -13, -3);
    wallAlongX(2, 3, 13);
    wallAlongX(-10, -13, -3);
    wallAlongX(-10, 3, 13);
    wallAlongX(-14, -13, -3);
    wallAlongX(-14, 3, 13);
    wallAlongX(-26, -13, 13, [0]);
    wallAlongZ(-7, -42, -26);
    wallAlongZ(7, -42, -26);
    wallAlongX(-42, -7, 7);
    // Room 104
    wallAlongZ(-7, -10, -4, [-7]);
    wallAlongX(-4, -13, -7);

    // ------------------------------------------------------------------
    // DOORS
    // ------------------------------------------------------------------
    addDoor('door-104', 'CHAMBRE 104', 'x', -7, -7, 1, { locked: true, keyId: 'key-104', keyName: 'Clé de la Chambre 104' });
    addDoor('door-ward', 'AILE DES SOINS A', 'x', -3, -1, -1, { sub: 'Chambres 101 – 104' });
    addDoor('door-pharmacy', 'PHARMACIE', 'x', -3, -18, -1, {
      locked: true,
      keyId: 'note-nurse-code',
      keyName: 'Digicode (4 chiffres)',
      sub: 'Accès restreint',
    });
    addDoor('door-surgery', 'BLOC OPÉRATOIRE', 'x', 3, -4, 1, { sub: 'Salle 2' });
    addDoor('door-archives', 'ARCHIVES', 'x', 3, 6, 1, { sub: 'Direction' });
    addDoor('door-morgue', 'MORGUE', 'x', 3, -20, 1, { sub: 'Personnel uniquement' });
    addDoor('door-lab', 'LABORATOIRE Z', 'z', -26, 0, -1, {
      locked: true,
      keyId: 'keycard-lab',
      keyName: 'Carte Niveau 2 + Courant',
      style: 'blast',
    });
    addDoor('door-exit', 'ISSUE DE SECOURS', 'z', 10, 0, 1, {
      locked: true,
      keyId: 'key-master-exit',
      keyName: 'Clé Principale de Secours',
      style: 'exit',
    });

    // Glowing exit sign above the emergency door
    const exitSign = new THREE.Mesh(
      track(new THREE.PlaneGeometry(0.75, 0.28)),
      track(new THREE.MeshStandardMaterial({ map: Tex.getExitSignTexture(), emissive: 0xffffff, emissiveMap: Tex.getExitSignTexture(), emissiveIntensity: 1.6 }))
    );
    exitSign.position.set(0, 2.95, 9.83);
    exitSign.rotation.y = Math.PI;
    sceneGroup.add(exitSign);
    addBox(0.8, 0.32, 0.06, 0, 2.95, 9.87, darkMetalMat, { shadow: false });

    // ------------------------------------------------------------------
    // LIGHTS
    // ------------------------------------------------------------------
    addLight(0, 6.5, 0xd8f0e0, 7, { flicker: true });
    addLight(0, -2, 0xfff0d0, 7);
    addLight(0, -11, 0xbfe0d0, 6, { flicker: true });
    addLight(0, -20.5, 0xff5544, 6, { flicker: true });
    addLight(-9, -1, 0xd8e8c0, 6, { flicker: true });
    addLight(-10, -7, 0xc8d8b0, 4, { flicker: true, distance: 8 });
    addLight(-8, -20, 0xf0f0ff, 6, { flicker: true });
    addLight(8, -4, 0x9ff6ff, 10, { needsPower: true });
    addLight(8, 6, 0xffe2b0, 5);
    addLight(8, -20, 0x7fb0e0, 6, { flicker: true });
    addLight(0, -30, 0xff2a1a, 7, { flicker: true });
    addLight(0, -38, 0xff2a1a, 7, { flicker: true, needsPower: true });

    // ------------------------------------------------------------------
    // ITEMS (definitions)
    // ------------------------------------------------------------------
    const items: Record<string, GameItem> = {
      key104: {
        id: 'key-104',
        name: 'Clé de la Chambre 104',
        type: 'key',
        description: 'Une vieille clé métallique numérotée 104. Elle ouvre la porte de cette chambre.',
        lore: 'Vous étiez enfermé ici. Pourquoi ?',
        icon: 'Key',
        usableOn: 'door-104',
      },
      flashlight: {
        id: 'item-flashlight',
        name: 'Lampe Torche Tactique',
        type: 'special',
        description: 'Lampe torche d\'intervention. Touche F pour allumer / éteindre. Surveillez la batterie !',
        lore: 'Trouvée sur un plateau médical souillé.',
        icon: 'Flashlight',
      },
      nurseNote: {
        id: 'note-nurse-code',
        name: 'Journal de l\'Infirmière Sarah',
        type: 'note',
        description: 'Note froissée contenant le code de sécurité de la Pharmacie.',
        lore: '« 14 octobre : le sujet de la cuve du sous-sol mute de plus en plus vite. Le Dr Moreau a verrouillé la réserve de la pharmacie. Le digicode d\'urgence est 4821. Que Dieu nous vienne en aide. »',
        icon: 'FileText',
      },
      battery1: {
        id: 'item-battery-1',
        name: 'Pile Haute Capacité',
        type: 'battery',
        description: 'Recharge 55 % de la batterie de la lampe torche.',
        icon: 'BatteryCharging',
      },
      battery2: {
        id: 'item-battery-2',
        name: 'Pile Haute Capacité',
        type: 'battery',
        description: 'Recharge 55 % de la batterie de la lampe torche.',
        icon: 'BatteryCharging',
      },
      battery3: {
        id: 'item-battery-3',
        name: 'Pile Haute Capacité',
        type: 'battery',
        description: 'Recharge 55 % de la batterie de la lampe torche.',
        icon: 'BatteryCharging',
      },
      fuse1: {
        id: 'item-fuse-1',
        name: 'Fusible Industriel (A)',
        type: 'fuse',
        description: 'Fusible lourd 300 A nécessaire pour rétablir le tableau électrique principal.',
        icon: 'Zap',
        usableOn: 'breaker-box',
      },
      fuse2: {
        id: 'item-fuse-2',
        name: 'Fusible Industriel (B)',
        type: 'fuse',
        description: 'Deuxième fusible haute tension requis pour alimenter la porte du Laboratoire.',
        icon: 'Zap',
        usableOn: 'breaker-box',
      },
      medkit: {
        id: 'item-medkit-1',
        name: 'Seringue d\'Adrénaline',
        type: 'medkit',
        description: 'Une dose d\'adrénaline : restaure toute votre endurance.',
        icon: 'HeartPulse',
      },
      dossier1: {
        id: 'note-dossier-1',
        name: 'Rapport Secret : Sujet Zéro',
        type: 'note',
        description: 'Dossier confidentiel portant le tampon CLASSIFIÉ.',
        lore: '« Expérience Aurore — rapport clinique : le sujet a absorbé l\'agent nécrosant. Les tissus musculaires se développent à une vitesse anormale. Sa vue est quasi nulle dans l\'obscurité mais son ouïe s\'est décuplée. Il traque tout bruit de course dans les couloirs. Une source lumineuse l\'attire immédiatement. »',
        icon: 'FileText',
      },
      keycard: {
        id: 'keycard-lab',
        name: 'Carte Magnétique Niveau 2 (Dr Moreau)',
        type: 'keycard',
        description: 'Passe haute sécurité ouvrant la porte blindée du Laboratoire.',
        icon: 'CreditCard',
        usableOn: 'door-lab',
      },
      masterKey: {
        id: 'key-master-exit',
        name: 'Clé Principale de Secours',
        type: 'key',
        description: 'Lourde clé en laiton qui déverrouille l\'Issue de Secours de l\'hôpital.',
        icon: 'KeyRound',
        usableOn: 'door-exit',
      },
      directorNote: {
        id: 'note-director-safe',
        name: 'Note du Directeur Miller',
        type: 'note',
        description: 'Mémo personnel posé sur le bureau.',
        lore: '« Si le confinement est rompu, la clé de l\'issue de secours est dans mon coffre. Le code est l\'année d\'inauguration de l\'Hôpital Saint-Aurore : 1987. Ne laissez pas cette chose s\'échapper. »',
        icon: 'FileText',
      },
      cassette: {
        id: 'cassette-moreau',
        name: 'Cassette — Confession du Dr Moreau',
        type: 'cassette',
        description: 'Bande magnétique contenant les aveux complets de l\'équipe de recherche.',
        lore: '« Enregistrement n° 89 : ce n\'était pas un accident. Le Ministère a financé cette arme biologique. Si quelqu\'un trouve cette cassette, apportez-la aux journalistes… avec les documents d\'origine du labo. »',
        icon: 'Disc',
      },
      truth: {
        id: 'note-dossier-truth',
        name: 'Protocole Aurore — Documents d\'Origine',
        type: 'note',
        description: 'L\'ensemble des preuves gouvernementales et des ordres d\'injection.',
        lore: '« Document ultime : noms des commanditaires, budgets secrets et formule d\'un antidote expérimental incomplet. Tout est documenté ici. »',
        icon: 'FileCheck',
      },
    };

    // ------------------------------------------------------------------
    // ROOM 104 (start)
    // ------------------------------------------------------------------
    hospitalBed(-11.2, -8.4, 0, { sheetBlood: true });
    ivStand(-12.2, -9.3);
    addContainer('drawer-104', 'Table de Chevet', 'nightstand', nightstand(-12.4, -6.6, Math.PI / 2), items.key104);
    const tray = new THREE.Group();
    tray.position.set(-7.75, 0, -9.3);
    addBox(0.7, 0.04, 0.45, 0, 0.85, 0, chromeMat, { parent: tray });
    addBox(0.04, 0.85, 0.04, -0.3, 0.42, 0, chromeMat, { parent: tray, shadow: false });
    addBox(0.04, 0.85, 0.04, 0.3, 0.42, 0, chromeMat, { parent: tray, shadow: false });
    const torchMesh = new THREE.Mesh(track(new THREE.CylinderGeometry(0.03, 0.04, 0.24, 10)), darkMetalMat);
    torchMesh.rotation.z = Math.PI / 2;
    torchMesh.position.set(0.05, 0.9, 0);
    tray.add(torchMesh);
    sceneGroup.add(tray);
    addCollider(-7.75, -9.3, 0.38, 0.25, 1);
    addContainer('desk-104', 'Plateau Médical', 'desk', tray, items.flashlight);
    addDecal(bloodMat, 1.4, 1.4, -9.6, 0.006, -6.2, 'up', 0.7);
    addDecal(decalMat(Tex.getGraffitiTexture('NE COURS PAS')), 2.6, 0.65, -12.84, 2.1, -7.2, '+x');

    // ------------------------------------------------------------------
    // WARD A (west)
    // ------------------------------------------------------------------
    const bodyBed = hospitalBed(-9.5, 0.4, 0, { body: true, sheetBlood: true });
    addContainer('body-ward-patient', 'Corps sous un Drap', 'body', bodyBed.body!, items.nurseNote);
    hospitalBed(-5.8, 0.4, 0);
    ivStand(-8.4, 1.4);
    locker('locker-ward', 'Casier de l\'Aile A', -12.55, -1.2, Math.PI / 2);
    addContainer('cabinet-ward', 'Armoire de Soins', 'cabinet', cabinet(-12.6, -2.9, Math.PI / 2, 1.0, 1.8, 0.45), items.battery1);
    wheelchair(-4.2, -8.8, 0.6);
    addDecal(bloodTrailMat, 3.2, 1.1, -6.5, 0.006, -1.8, 'up', 0.2);
    papers(-5, -5.5, 6, 1.4);

    // ------------------------------------------------------------------
    // MAIN CORRIDOR
    // ------------------------------------------------------------------
    // Gurney abandoned in the corridor
    const gurney = hospitalBed(-2.1, 4.2, 0.08, { sheetBlood: true });
    gurney.group.scale.set(0.85, 0.9, 1);
    wheelchair(2.2, -7.2, 1.2, true);
    locker('locker-corridor', 'Casier du Couloir', 2.55, -13, -Math.PI / 2);

    // Vending machine (west wall, facing the corridor): gives cans to throw / flip
    {
      const vx = -2.45;
      const vz = -7.5;
      const vend = new THREE.Group();
      vend.position.set(vx, 0, vz);
      vend.rotation.y = Math.PI / 2;
      addBox(1.0, 1.95, 0.72, 0, 0.975, 0, track(new THREE.MeshStandardMaterial({ color: 0x8a1016, roughness: 0.45, metalness: 0.4 })), {
        parent: vend,
      });
      const panelMat = track(
        new THREE.MeshStandardMaterial({
          map: Tex.getVendingTexture(),
          emissive: 0xffffff,
          emissiveMap: Tex.getVendingTexture(),
          emissiveIntensity: 1.1,
          roughness: 0.25,
        })
      );
      const panel = new THREE.Mesh(track(new THREE.PlaneGeometry(0.9, 1.76)), panelMat);
      panel.position.set(0, 1.0, 0.362);
      vend.add(panel);
      addBox(0.06, 0.06, 0.05, 0.4, 0.15, 0.38, darkMetalMat, { parent: vend, shadow: false }); // foot
      vend.traverse((o) => (o.userData = { isVending: true }));
      sceneGroup.add(vend);
      interactiveMeshes.push(vend);
      addCollider(vx, vz, 0.38, 0.52, 1.95);
      // Its glow is a real (flickering) light handled by the light pool
      lights.push({
        position: new THREE.Vector3(vx + 0.7, 1.2, vz),
        color: new THREE.Color(0x9fd0ff),
        distance: 5,
        k: 1,
        current: 0,
        fixtureMat: panelMat,
        baseIntensity: 2.5,
        baseEmissive: 1.1,
        nextFlicker: 2,
        flicker: true,
        needsPower: false,
      });
    }
    // Waiting benches
    for (const bz of [1.2, 2.6]) {
      addBox(0.45, 0.06, 1.2, 2.55, 0.48, bz, woodMat);
      addBox(0.06, 0.45, 1.2, 2.82, 0.75, bz, woodMat);
      addBox(0.4, 0.45, 0.05, 2.55, 0.23, bz - 0.55, darkMetalMat, { shadow: false });
      addBox(0.4, 0.45, 0.05, 2.55, 0.23, bz + 0.55, darkMetalMat, { shadow: false });
    }
    addCollider(2.6, 1.9, 0.3, 1.35, 1);
    addDecal(bloodTrailMat, 4.5, 1.3, 0.3, 0.006, -15.5, 'up', Math.PI / 2 + 0.15);
    addDecal(bloodMat, 1.8, 1.8, -0.6, 0.006, -22.5, 'up', 2.1);
    papers(0.8, 2.5, 8, 2.2);
    papers(-1, -9, 5, 1.6);
    const poster = decalMat(Tex.getBiohazardPosterTexture(), { roughness: 0.8 });
    addDecal(poster, 0.6, 0.85, -2.84, 1.7, -23, '+x');
    addDecal(poster, 0.6, 0.85, 2.84, 1.7, -24.2, '-x');
    addDecal(decalMat(Tex.getGraffitiTexture('IL ENTEND TOUT')), 3, 0.75, 2.84, 2.0, -10.5, '-x');

    // ------------------------------------------------------------------
    // PHARMACY (north-west)
    // ------------------------------------------------------------------
    addContainer('shelf-pharmacy-1', 'Étagère à Médicaments', 'cabinet', cabinet(-12.6, -22, Math.PI / 2), items.fuse1);
    addContainer('shelf-pharmacy-3', 'Armoire des Calmants', 'cabinet', cabinet(-12.6, -19.6, Math.PI / 2), {
      id: 'item-sedative-0',
      name: 'Seringue de Sédatif',
      type: 'sedative',
      description: 'Utilisez-la [1-5] tout près du monstre, face à lui : il s\'effondre pendant 5 secondes.',
      icon: 'Syringe',
    });
    addContainer('shelf-pharmacy-2', 'Armoire Réfrigérée', 'cabinet', cabinet(-12.6, -17.2, Math.PI / 2), items.medkit);
    // Pharmacist desk
    const desk = new THREE.Group();
    desk.position.set(-8, 0, -24.8);
    addBox(1.6, 0.06, 0.8, 0, 0.76, 0, woodMat, { parent: desk });
    addBox(0.5, 0.73, 0.75, -0.5, 0.37, 0, woodMat, { parent: desk });
    addBox(0.05, 0.73, 0.75, 0.75, 0.37, 0, woodMat, { parent: desk });
    const folder = addBox(0.3, 0.03, 0.22, 0.2, 0.805, 0.05, track(new THREE.MeshStandardMaterial({ color: 0xa02020, roughness: 0.8 })), { parent: desk });
    folder.rotation.y = 0.3;
    sceneGroup.add(desk);
    addCollider(-8, -24.8, 0.85, 0.45, 1);
    addContainer('desk-pharmacy', 'Bureau du Pharmacien', 'desk', desk, items.dossier1);
    crate(-4.2, -25.2, 0.55, 0.3);
    crate(-4.9, -25.3, 0.5, -0.2);
    crate(-4.5, -24.6, 0.45, 0.8);
    locker('locker-pharmacy', 'Casier de la Pharmacie', -6, -14.5, Math.PI);
    papers(-8.5, -19, 7, 2);
    addDecal(bloodMat, 1.3, 1.3, -6.4, 0.006, -21.4, 'up', 0.4);

    // ------------------------------------------------------------------
    // SURGERY (east) — breaker box
    // ------------------------------------------------------------------
    const table = new THREE.Group();
    table.position.set(9, 0, -5);
    addBox(0.7, 0.08, 2.0, 0, 0.92, 0, chromeMat, { parent: table });
    addBox(0.25, 0.85, 0.35, 0, 0.45, 0, darkMetalMat, { parent: table });
    addBox(0.8, 0.06, 0.8, 0, 0.03, 0, darkMetalMat, { parent: table });
    sceneGroup.add(table);
    addCollider(9, -5, 0.45, 1.05, 1.2);
    // Surgical lamp
    const lampArm = new THREE.Mesh(track(new THREE.CylinderGeometry(0.035, 0.035, 1.1, 8)), chromeMat);
    lampArm.position.set(9, 2.95, -5);
    sceneGroup.add(lampArm);
    const lampHead = new THREE.Mesh(track(new THREE.CylinderGeometry(0.45, 0.3, 0.18, 24)), chromeMat);
    lampHead.position.set(9, 2.35, -5);
    sceneGroup.add(lampHead);
    // Instrument cart with a spare battery
    const cart = new THREE.Group();
    cart.position.set(6.3, 0, -8.6);
    addBox(0.8, 0.03, 0.5, 0, 0.9, 0, chromeMat, { parent: cart });
    addBox(0.8, 0.03, 0.5, 0, 0.4, 0, chromeMat, { parent: cart });
    for (const [lx, lz] of [
      [-0.37, -0.22],
      [0.37, -0.22],
      [-0.37, 0.22],
      [0.37, 0.22],
    ]) {
      addBox(0.025, 0.9, 0.025, lx, 0.45, lz, chromeMat, { parent: cart, shadow: false });
    }
    for (let i = 0; i < 4; i++) {
      const tool = addBox(0.02, 0.01, 0.18, -0.25 + i * 0.12, 0.92, 0, chromeMat, { parent: cart, shadow: false });
      tool.rotation.y = (i - 2) * 0.15;
    }
    sceneGroup.add(cart);
    addCollider(6.3, -8.6, 0.45, 0.3, 1);
    addContainer('cart-surgery', 'Chariot d\'Instruments', 'desk', cart, items.battery2);
    ivStand(10.4, -3.2);
    addDecal(bloodMat, 2.0, 2.0, 9.2, 0.006, -5.6, 'up', 1.3);
    locker('locker-surgery', 'Casier du Bloc', 12.55, 0.6, -Math.PI / 2);

    // Breaker box
    const breaker = new THREE.Group();
    breaker.position.set(12.72, 1.55, -8);
    addBox(0.22, 1.1, 0.8, 0, 0, 0, darkMetalMat, { parent: breaker });
    addBox(0.04, 0.9, 0.6, -0.12, 0, 0, metalMat, { parent: breaker });
    const breakerLed = track(new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff1100, emissiveIntensity: 3 }));
    addBox(0.04, 0.06, 0.06, -0.15, 0.38, 0.2, breakerLed, { parent: breaker, shadow: false });
    // Fuse slots
    addBox(0.05, 0.22, 0.1, -0.15, 0, -0.12, blackMat, { parent: breaker, shadow: false });
    addBox(0.05, 0.22, 0.1, -0.15, 0, 0.12, blackMat, { parent: breaker, shadow: false });
    breaker.traverse((o) => (o.userData = { isBreakerBox: true }));
    sceneGroup.add(breaker);
    interactiveMeshes.push(breaker);
    addDecal(poster, 0.5, 0.7, 12.84, 1.7, -6.6, '-x');

    // ------------------------------------------------------------------
    // ARCHIVES (south-east) — safe, director note, cassette
    // ------------------------------------------------------------------
    for (const sz of [3.9, 7.8]) {
      const shelf = new THREE.Group();
      shelf.position.set(8, 0, sz);
      addBox(5, 0.04, 0.6, 0, 0.05, 0, metalMat, { parent: shelf });
      for (let lvl = 1; lvl <= 4; lvl++) {
        addBox(5, 0.03, 0.6, 0, lvl * 0.55, 0, metalMat, { parent: shelf, shadow: false });
        // Rows of box files
        for (let b = 0; b < 12; b++) {
          if (Math.random() < 0.2) continue;
          const file = addBox(
            0.32,
            0.4,
            0.5,
            -2.25 + b * 0.41,
            lvl * 0.55 - 0.33,
            0,
            colorMat([0x5a4a35, 0x3a4a5a, 0x6a5a40][b % 3], 0.9),
            { parent: shelf, shadow: false }
          );
          file.rotation.z = (Math.random() - 0.5) * 0.15;
        }
      }
      for (const px of [-2.5, 2.5]) addBox(0.05, 2.3, 0.6, px, 1.15, 0, darkMetalMat, { parent: shelf });
      sceneGroup.add(shelf);
      addCollider(8, sz, 2.55, 0.32, 2.3);
    }
    papers(7.5, 5.8, 10, 3);
    // Director desk
    const ddesk = new THREE.Group();
    ddesk.position.set(12.1, 0, 5.6);
    addBox(0.8, 0.06, 1.5, 0, 0.76, 0, woodMat, { parent: ddesk });
    addBox(0.75, 0.73, 0.05, 0, 0.37, -0.7, woodMat, { parent: ddesk });
    addBox(0.75, 0.73, 0.05, 0, 0.37, 0.7, woodMat, { parent: ddesk });
    const memo = new THREE.Mesh(track(new THREE.PlaneGeometry(0.21, 0.28)), paperMat);
    memo.rotation.set(-Math.PI / 2, 0, 0.4);
    memo.position.set(-0.1, 0.795, -0.35);
    ddesk.add(memo);
    sceneGroup.add(ddesk);
    addCollider(12.1, 5.6, 0.45, 0.8, 1);
    // The director's memo (safe code) is now in his office upstairs
    addContainer('desk-director', 'Bureau d\'Archivage', 'desk', ddesk, items.battery3);
    // Tape recorder on a side table
    const recorder = new THREE.Group();
    recorder.position.set(5.6, 0, 9.3);
    addBox(0.7, 0.7, 0.5, 0, 0.35, 0, woodMat, { parent: recorder });
    addBox(0.42, 0.12, 0.3, 0, 0.76, 0, darkMetalMat, { parent: recorder });
    for (const rx of [-0.1, 0.1]) {
      const reel = new THREE.Mesh(track(new THREE.CylinderGeometry(0.07, 0.07, 0.02, 16)), chromeMat);
      reel.position.set(rx, 0.83, 0);
      recorder.add(reel);
    }
    sceneGroup.add(recorder);
    addCollider(5.6, 9.3, 0.4, 0.3, 1);
    addContainer('cassette-recorder', 'Magnétophone à Bande', 'desk', recorder, items.cassette);
    // TV trolley with a VCR: the tape of the Patient Zero experiment
    {
      const tv = new THREE.Group();
      tv.position.set(12.2, 0, 2.75);
      tv.rotation.y = -Math.PI / 2;
      for (const y of [0.25, 0.75]) addBox(0.9, 0.04, 0.55, 0, y, 0, metalMat, { parent: tv, shadow: false });
      for (const [x, z] of [[-0.42, -0.24], [0.42, -0.24], [-0.42, 0.24], [0.42, 0.24]]) addBox(0.04, 0.77, 0.04, x, 0.38, z, darkMetalMat, { parent: tv, shadow: false });
      addBox(0.62, 0.1, 0.38, 0, 0.82, 0, colorMat(0x1a1a1c, 0.5), { parent: tv });
      addBox(0.66, 0.5, 0.5, 0, 1.12, -0.02, colorMat(0x2a2622, 0.6), { parent: tv });
      const screen = new THREE.Mesh(
        track(new THREE.PlaneGeometry(0.5, 0.36)),
        track(new THREE.MeshStandardMaterial({ color: 0x0a0e18, emissive: 0x3050ff, emissiveIntensity: 0.55, roughness: 0.2 }))
      );
      screen.position.set(0, 1.13, 0.235);
      tv.add(screen);
      // The tape sticking out of the VCR
      addBox(0.19, 0.025, 0.1, 0, 0.88, 0.17, colorMat(0x111111, 0.6), { parent: tv, shadow: false });
      sceneGroup.add(tv);
      addCollider(12.2, 2.75, 0.3, 0.47, 1.4);
      addContainer('vhs-tv', 'Téléviseur & Magnétoscope', 'desk', tv, {
        id: 'vhs-experience',
        name: 'Cassette VHS « Sujet 00 »',
        type: 'cassette',
        description: 'Une cassette VHS étiquetée à la main.',
        lore: 'Étiquette écrite au feutre rouge : « SUJET 00 — 14/03/87 — SALLE 0 — NE PAS DIFFUSER ».\n\nLe boîtier est taché de sang séché. Quelqu\'un a voulu la détruire… puis l\'a cachée dans le magnétoscope des archives.\n\nAppuyez sur ▶ Regarder pour lire la bande.',
        icon: 'Disc',
      });
      addDecal(decalMat(Tex.getGraffitiTexture('REGARDE')), 1.6, 0.5, 12.84, 2.2, 2.75, '-x');
    }
    // Wall safe
    const safe = new THREE.Group();
    safe.position.set(12.7, 1.35, 8.9);
    addBox(0.3, 0.6, 0.6, 0, 0, 0, darkMetalMat, { parent: safe });
    const dial = new THREE.Mesh(track(new THREE.CylinderGeometry(0.08, 0.08, 0.04, 20)), chromeMat);
    dial.rotation.z = Math.PI / 2;
    dial.position.set(-0.17, 0.05, 0);
    safe.add(dial);
    addBox(0.04, 0.04, 0.16, -0.17, -0.12, 0, chromeMat, { parent: safe, shadow: false });
    sceneGroup.add(safe);
    addContainer('safe-archives', 'Coffre-fort Mural', 'safe', safe, items.masterKey, {
      locked: true,
      requiredItemId: 'note-director-safe',
      lockedMessage: 'Coffre-fort à combinaison. Le code doit être dans le bureau du directeur, à l\'étage (escalier du couloir).',
      unlockMessage: 'Combinaison 1987 acceptée. Le coffre s\'ouvre.',
    });

    // ------------------------------------------------------------------
    // MORGUE (north-east)
    // ------------------------------------------------------------------
    const slab = hospitalBed(8, -20, Math.PI / 2, { body: true, sheetBlood: true });
    addContainer('body-moreau', 'Corps du Dr Moreau', 'body', slab.body!, items.fuse2);
    // Cold-storage drawers wall
    const cold = new THREE.Group();
    cold.position.set(12.55, 0, -20);
    addBox(0.6, 2.7, 6, 0, 1.35, 0, chromeMat, { parent: cold });
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 6; col++) {
        addBox(0.04, 0.7, 0.85, -0.31, 0.5 + row * 0.85, -2.5 + col * 1.0, metalMat, { parent: cold, shadow: false });
        addBox(0.05, 0.05, 0.25, -0.35, 0.65 + row * 0.85, -2.5 + col * 1.0, darkMetalMat, { parent: cold, shadow: false });
      }
    }
    sceneGroup.add(cold);
    addCollider(12.55, -20, 0.35, 3.05, 2.7);
    // One drawer pulled out (the interactive one)
    const openDrawer = new THREE.Group();
    openDrawer.position.set(11.75, 1.35, -18.5);
    addBox(1.0, 0.08, 0.8, 0, 0, 0, chromeMat, { parent: openDrawer });
    addBox(0.04, 0.7, 0.85, -0.5, 0.0, 0, metalMat, { parent: openDrawer });
    const bag = new THREE.Mesh(track(new THREE.CapsuleGeometry(0.2, 0.5, 4, 10)), blackMat);
    bag.rotation.z = Math.PI / 2;
    bag.scale.set(1, 1, 0.6);
    bag.position.set(0.1, 0.13, 0);
    openDrawer.add(bag);
    sceneGroup.add(openDrawer);
    addCollider(11.75, -18.5, 0.5, 0.42, 1.5);
    addContainer('drawer-morgue-cold', 'Tiroir Mortuaire N°04', 'drawer', openDrawer, items.keycard);
    locker('locker-morgue', 'Casier de la Morgue', 5, -14.55, Math.PI);
    addDecal(bloodTrailMat, 3.6, 1.1, 6, 0.006, -22.5, 'up', -0.3);
    addDecal(bloodMat, 1.5, 1.5, 9.5, 0.006, -17.8, 'up', 0.9);
    scareTriggers.push({ id: 'jumpscare-morgue-corpse', position: new THREE.Vector3(8, 1.2, -18.4), radius: 1.9, triggered: false });

    // ------------------------------------------------------------------
    // LAB (north)
    // ------------------------------------------------------------------
    const podBase = new THREE.Mesh(track(new THREE.CylinderGeometry(1.6, 1.8, 0.5, 32)), darkMetalMat);
    podBase.position.set(0, 0.25, -34);
    podBase.receiveShadow = true;
    sceneGroup.add(podBase);
    const podTop = new THREE.Mesh(track(new THREE.CylinderGeometry(1.6, 1.4, 0.4, 32)), darkMetalMat);
    podTop.position.set(0, 3.1, -34);
    sceneGroup.add(podTop);
    // Shattered glass: a partial open cylinder
    const podGlass = new THREE.Mesh(track(new THREE.CylinderGeometry(1.5, 1.5, 2.4, 32, 1, true, 0.9, Math.PI * 1.45)), glassMat);
    podGlass.position.set(0, 1.7, -34);
    sceneGroup.add(podGlass);
    // Glowing liquid residue
    const goo = track(new THREE.MeshStandardMaterial({ color: 0x0a2a10, emissive: 0x2aff60, emissiveIntensity: 0.6, transparent: true, opacity: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }));
    const gooMesh = new THREE.Mesh(track(new THREE.CircleGeometry(1.45, 32)), goo);
    gooMesh.rotation.x = -Math.PI / 2;
    gooMesh.position.set(0, 0.51, -34);
    sceneGroup.add(gooMesh);
    addDecal(goo, 2.6, 1.4, 1.2, 0.006, -31.4, 'up', 0.5);
    addCollider(0, -34, 1.8, 1.8, 3.2);
    // Cables
    for (let i = 0; i < 6; i++) {
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(Math.cos(i) * 1.6, 3.2, -34 + Math.sin(i) * 1.6),
        new THREE.Vector3(Math.cos(i) * 2.4, 2.6, -34 + Math.sin(i) * 2.4),
        new THREE.Vector3(Math.cos(i) * 3.2, 3.45, -34 + Math.sin(i) * 3.2),
      ]);
      const cable = new THREE.Mesh(track(new THREE.TubeGeometry(curve, 16, 0.03, 6)), blackMat);
      sceneGroup.add(cable);
    }
    // Purge console (ending 2)
    const consoleG = new THREE.Group();
    consoleG.position.set(4, 0, -40.6);
    addBox(1.6, 1.0, 0.7, 0, 0.5, 0, darkMetalMat, { parent: consoleG });
    const panel = addBox(1.5, 0.05, 0.5, 0, 1.08, 0.05, metalMat, { parent: consoleG });
    panel.rotation.x = -0.4;
    const purgeBtnMat = track(new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff2200, emissiveIntensity: 2.5 }));
    const purgeBtn = new THREE.Mesh(track(new THREE.CylinderGeometry(0.09, 0.09, 0.06, 20)), purgeBtnMat);
    purgeBtn.position.set(0, 1.13, 0.1);
    purgeBtn.rotation.x = -0.4;
    consoleG.add(purgeBtn);
    consoleG.traverse((o) => (o.userData = { isPurgeConsole: true }));
    sceneGroup.add(consoleG);
    interactiveMeshes.push(consoleG);
    addCollider(4, -40.6, 0.85, 0.4, 1.2);
    // Data terminal (truth dossier)
    const term = new THREE.Group();
    term.position.set(-4, 0, -40.6);
    addBox(1.6, 0.8, 0.7, 0, 0.4, 0, darkMetalMat, { parent: term });
    addBox(0.7, 0.5, 0.06, 0, 1.15, -0.1, blackMat, { parent: term });
    const screenMat = track(new THREE.MeshStandardMaterial({ color: 0x001a08, emissive: 0x22ff66, emissiveIntensity: 0.9 }));
    addBox(0.62, 0.42, 0.01, 0, 1.15, -0.065, screenMat, { parent: term, shadow: false });
    sceneGroup.add(term);
    addCollider(-4, -40.6, 0.85, 0.4, 1.4);
    addContainer('desk-lab-truth', 'Terminal de Contrôle Central', 'desk', term, items.truth);
    locker('locker-lab', 'Casier du Laboratoire', -6.55, -28.5, Math.PI / 2);
    for (const [px, pz, f] of [
      [-6.84, -33, '+x'],
      [6.84, -33, '-x'],
      [-2.5, -41.84, '+z'],
      [2.5, -41.84, '+z'],
    ] as const) {
      addDecal(poster, 0.6, 0.85, px, 1.7, pz, f);
    }
    addDecal(decalMat(Tex.getGraffitiTexture('PARDONNEZ-NOUS')), 3.4, 0.85, 0, 2.3, -41.84, '+z');
    papers(-2.5, -37, 10, 3);
    addDecal(bloodTrailMat, 4, 1.3, -1.5, 0.006, -28.5, 'up', 0.4);
    scareTriggers.push({ id: 'lab-entry', position: new THREE.Vector3(0, 1.2, -28), radius: 1.6, triggered: false });

    // Corridor scripted scares
    scareTriggers.push({ id: 'ward-exit-slam', position: new THREE.Vector3(-1.2, 1.2, -1), radius: 1.6, triggered: false });
    scareTriggers.push({ id: 'corridor-lights-out', position: new THREE.Vector3(0, 1.2, -15), radius: 1.8, triggered: false });

    // ------------------------------------------------------------------
    // NAVIGATION GRAPH (used by the monster to path around walls)
    // ------------------------------------------------------------------
    const node = (id: string, x: number, z: number) => navNodes.set(id, { id, pos: new THREE.Vector3(x, 0, z), links: [] });
    const link = (a: string, b: string, doorId?: string) => {
      navNodes.get(a)!.links.push({ to: b, doorId });
      navNodes.get(b)!.links.push({ to: a, doorId });
    };
    // Corridor spine
    node('c8', 0, 8);
    node('c6', 0, 6);
    node('c1', 0, -1);
    node('c4', 0, -4);
    node('c10', 0, -10);
    node('c18', 0, -18);
    node('c20', 0, -20);
    node('c24', 0, -24);
    link('c8', 'c6');
    link('c6', 'c1');
    link('c1', 'c4');
    link('c4', 'c10');
    link('c10', 'c18');
    link('c18', 'c20');
    link('c20', 'c24');
    // Ward
    node('w_in', -4.6, -1);
    node('w_a', -5.2, -6.5);
    node('w_b', -11.3, -2.6);
    node('r_in', -9, -6.5);
    link('c1', 'w_in', 'door-ward');
    link('w_in', 'w_a');
    link('w_in', 'w_b');
    link('w_a', 'r_in', 'door-104');
    // Pharmacy
    node('p_in', -4.6, -18);
    node('p_a', -8, -17);
    node('p_b', -9, -22.8);
    link('c18', 'p_in', 'door-pharmacy');
    link('p_in', 'p_a');
    link('p_in', 'p_b');
    link('p_a', 'p_b');
    // Surgery
    node('s_in', 4.6, -4);
    node('s_a', 7, -1.5);
    node('s_b', 11, -1.8);
    node('s_c', 6.2, -7.2);
    link('c4', 's_in', 'door-surgery');
    link('s_in', 's_a');
    link('s_a', 's_b');
    link('s_in', 's_c');
    // Archives
    node('a_in', 4.6, 6);
    node('a_b', 10.6, 6);
    link('c6', 'a_in', 'door-archives');
    link('a_in', 'a_b');
    // Morgue
    node('m_in', 4.6, -20);
    node('m_a', 8, -16.8);
    node('m_b', 8, -23);
    link('c20', 'm_in', 'door-morgue');
    link('m_in', 'm_a');
    link('m_in', 'm_b');
    // Lab
    node('l_in', 0, -27.8);
    node('l_a', -4.5, -30);
    node('l_b', 4.5, -30);
    node('l_c', -4.5, -37.6);
    node('l_d', 4.5, -37.6);
    link('c24', 'l_in', 'door-lab');
    link('l_in', 'l_a');
    link('l_in', 'l_b');
    link('l_a', 'l_c');
    link('l_b', 'l_d');
    link('l_c', 'l_d');

    const patrolRoute = [
      'c10', 's_in', 's_a', 's_b', 's_c', 'c4', 'c1', 'w_b', 'w_a', 'c1', 'c6', 'a_b', 'c8',
      'c10', 'c20', 'm_a', 'm_b', 'c20', 'p_a', 'p_b', 'c18', 'l_a', 'l_c', 'l_d', 'l_b', 'c24',
    ];

    // ==================================================================
    // FLOOR 1 → STAIRWELL LOBBY (west of the corridor, z[2,10])
    // ==================================================================
    addFloorAndCeiling(-5.5, 6, 5, 8);
    // West wall, with the air-duct opening at the bottom (z 3 → 4)
    wallAlongZ(-8, 2, 2.85);
    wallAlongZ(-8, 4.15, 10);
    addBox(WALL_T, WALL_H - 1.3, 1.0, -8, (WALL_H + 1.3) / 2, 3.5, wallMat, { worldUV: true, shadow: false });
    wallAlongX(10, -8, -3);
    addDoor('door-stairs', 'ESCALIER', 'x', -3, 6, -1, { sub: 'Étage 2' });
    addLight(-5.2, 6, 0xd8e0c8, 4, { flicker: true, distance: 8 });

    /** Concrete staircase climbing into the ceiling; interacting with it changes floor. */
    const staircase = (ox: number, dir: 'up' | 'down', broken = false) => {
      const steps: THREE.Object3D[] = [];
      const g = new THREE.Group();
      const concrete = colorMat(0x5a5a55, 0.95);
      for (let i = 0; i < 9; i++) {
        // Collapsed steps come back as nailed planks once repaired
        const mat = broken && i >= 3 ? colorMat(0x8a6a44, 0.85) : concrete;
        const step = addBox(1.6, 0.4 * (i + 1), 0.4, ox - 7.1, 0.2 * (i + 1), 6.6 + i * 0.4, mat, { parent: g });
        // Collapsed: only the first three steps are left
        if (broken && i >= 3) {
          step.visible = false;
          steps.push(step);
        }
      }
      // Railing
      addBox(0.05, 0.05, 3.6, ox - 6.25, 2.2, 8.2, chromeMat, { parent: g, shadow: false });
      g.traverse((o) => (o.userData = { isStairs: true, dir, to: dir === 'up' ? 'f2' : 'f1' }));
      sceneGroup.add(g);
      interactiveMeshes.push(g);
      addCollider(ox - 7.1, 8.2, 0.82, 1.65, 3.5);
      addDecal(
        decalMat(Tex.getDoorSignTexture(dir === 'up' ? 'ÉTAGE 2 ↑' : 'REZ-DE-CHAUSSÉE ↓', 'Escalier de service')),
        0.9,
        0.28,
        ox - 7.84,
        2.2,
        5.2,
        '+x'
      );
      return { group: g, steps };
    };
    const lowerStairs = staircase(0, 'up', true);
    node('st1', -5, 6);
    link('c6', 'st1', 'door-stairs');

    // Collapsed upper flight: broken slabs and rebar on the floor
    const rubble = new THREE.Group();
    const concreteRubble = colorMat(0x5a5a55, 0.95);
    for (const [rx, rz, s, ry, rr] of [
      [-7.4, 8.2, 0.7, 0.4, 0.3],
      [-6.8, 9.1, 0.55, -0.6, -0.4],
      [-7.2, 9.6, 0.8, 1.1, 0.15],
      [-6.6, 8.4, 0.4, 0.2, 0.6],
    ]) {
      const slab = addBox(s * 1.6, 0.18, s, rx, 0.12 + s * 0.12, rz, concreteRubble, { parent: rubble });
      slab.rotation.set(rr, ry, rr * 0.5);
    }
    for (let i = 0; i < 4; i++) {
      const rebar = new THREE.Mesh(track(new THREE.CylinderGeometry(0.012, 0.012, 1.1, 5)), darkMetalMat);
      rebar.position.set(-7.4 + i * 0.25, 1.1 + i * 0.1, 7.9);
      rebar.rotation.set(0.9 + i * 0.2, 0, 0.3 - i * 0.2);
      rubble.add(rebar);
    }
    rubble.traverse((o) => (o.userData = { isStairs: true, dir: 'up', to: 'f2' }));
    sceneGroup.add(rubble);
    interactiveMeshes.push(rubble);
    addDecal(decalMat(Tex.getGraffitiTexture('PLANCHES ? ENTREPÔT')), 1.9, 0.5, -7.84, 1.75, 3.5, '+x');

    // ==================================================================
    // AIR DUCT → WAREHOUSE (west of the building)
    //   Main duct  z[3,4]   x[-21.5,-8]   (entrance: stairwell lobby wall)
    //   Down duct  x[-21.5,-20.5] z[0,3] (into the warehouse)
    //   Nest       x[-14.5,-13.5] z[4,9]  (dead end: the Crawler's lair)
    //   Warehouse  x[-27,-15] z[-12,0]
    // ==================================================================
    const ductMat = track(new THREE.MeshStandardMaterial({ map: metalTex, color: 0x8d9498, roughness: 0.5, metalness: 0.7 }));
    const ductDark = track(new THREE.MeshStandardMaterial({ color: 0x1c1f20, roughness: 0.6, metalness: 0.6 }));
    const DUCT_H = 1.3;
    /** Floor + ceiling plates of a duct section. */
    const ductSection = (x0: number, x1: number, z0: number, z1: number) => {
      const w = x1 - x0;
      const d = z1 - z0;
      addBox(w, 0.06, d, (x0 + x1) / 2, -0.02, (z0 + z1) / 2, ductMat, { shadow: false });
      addBox(w + 0.2, 0.06, d + 0.2, (x0 + x1) / 2, DUCT_H + 0.03, (z0 + z1) / 2, ductMat, { shadow: false });
    };
    /** Solid duct side wall (collides). */
    const ductWall = (x0: number, x1: number, z0: number, z1: number) =>
      addBox(x1 - x0, DUCT_H, z1 - z0, (x0 + x1) / 2, DUCT_H / 2, (z0 + z1) / 2, ductMat, { collide: true, shadow: false });

    ductSection(-21.5, -8.15, 3, 4);
    ductSection(-21.5, -20.5, 0.15, 3);
    ductSection(-14.5, -13.5, 4, 9);
    // Main duct walls (gaps for the nest and the way down)
    ductWall(-21.6, -14.5, 4, 4.1);
    ductWall(-13.5, -8.15, 4, 4.1);
    ductWall(-20.5, -8.15, 2.9, 3);
    ductWall(-21.6, -21.5, 0.15, 4.1);
    ductWall(-20.5, -20.4, 0.15, 3);
    // Nest walls
    ductWall(-14.6, -14.5, 4.1, 9.1);
    ductWall(-13.5, -13.4, 4.1, 9.1);
    ductWall(-14.6, -13.4, 9, 9.1);
    // Rivets / joints every 1.5 m so you feel the distance crawled
    for (let x = -9.5; x > -21; x -= 1.5) addBox(0.06, 0.04, 1.0, x, DUCT_H - 0.02, 3.5, ductDark, { shadow: false });
    for (let z = 5.5; z < 9; z += 1.5) addBox(1.0, 0.04, 0.06, -14, DUCT_H - 0.02, z, ductDark, { shadow: false });
    // The nest: bones, torn gowns, scratches
    addDecal(bloodTrailMat, 3.5, 0.9, -11, 0.012, 3.5, 'up', 0.05);
    addDecal(bloodMat, 1.0, 1.0, -14, 0.012, 8.2, 'up', 0.7);
    for (let i = 0; i < 6; i++) {
      const bone = new THREE.Mesh(track(new THREE.CapsuleGeometry(0.018, 0.22, 3, 6)), colorMat(0xd8d0bc, 0.7));
      bone.position.set(-14 + (Math.random() - 0.5) * 0.7, 0.03, 7.6 + Math.random() * 1.2);
      bone.rotation.set(Math.PI / 2, 0, Math.random() * Math.PI);
      sceneGroup.add(bone);
    }
    addBox(0.5, 0.04, 0.4, -13.9, 0.02, 8.5, stainedSheetMat, { shadow: false });

    // Grille on the lobby side: [E] to pull it off
    const grille = new THREE.Group();
    grille.position.set(-7.82, 0.65, 3.5);
    addBox(0.04, 1.3, 1.0, 0, 0, 0, ductDark, { parent: grille });
    for (let i = 0; i < 8; i++) addBox(0.05, 0.035, 0.94, 0.01, -0.55 + i * 0.157, 0, ductMat, { parent: grille });
    grille.traverse((o) => (o.userData = { isVent: true }));
    sceneGroup.add(grille);
    interactiveMeshes.push(grille);
    const ventCollision: CollisionBox = { min: new THREE.Vector3(-8.15, 0, 3), max: new THREE.Vector3(-7.75, 1.3, 4), id: 'vent-grille' };
    collisionBoxes.push(ventCollision);

    const lowZones: LowZone[] = [
      { minX: -21.5, maxX: -7.7, minZ: 3, maxZ: 4 },
      { minX: -21.5, maxX: -20.5, minZ: -0.35, maxZ: 4 },
      { minX: -14.5, maxX: -13.5, minZ: 3, maxZ: 9 },
    ];

    // ---- Warehouse ----
    addFloorAndCeiling(-21, -6, 12, 12);
    // Bare concrete floor (no hospital tiles here)
    addBox(12, 0.02, 12, -21, 0.005, -6, colorMat(0x45443f, 0.95), { shadow: false });
    wallAlongZ(-27, -12, 0);
    wallAlongZ(-15, -12, 0);
    wallAlongX(-12, -27, -15);
    wallAlongX(0, -27, -21.65);
    wallAlongX(0, -20.35, -15);
    addBox(1.0, WALL_H - 1.3, WALL_T, -21, (WALL_H + 1.3) / 2, 0, wallMat, { worldUV: true, shadow: false });
    addLight(-21, -6, 0xffd9a0, 5, { flicker: true, distance: 11 });
    // The grille fell inside long ago
    const fallen = addBox(1.0, 0.04, 1.3, -20.4, 0.03, -1.3, ductDark, { shadow: false });
    fallen.rotation.y = 0.5;
    // Metal racks with boxes
    for (const rz of [-3, -7.5]) {
      addBox(0.7, 2.4, 3.6, -26.3, 1.2, rz, metalMat, { collide: true });
      for (let i = 0; i < 4; i++) addBox(0.5, 0.4, 0.6, -26.3, 0.45 + (i % 2) * 1.0, rz - 1.2 + i * 0.8, cardboardMat);
    }
    addBox(3.6, 2.4, 0.7, -21, 1.2, -11.3, metalMat, { collide: true });
    crate(-17, -2.5, 0.8, 0.2);
    crate(-17.8, -2.2, 0.6, -0.4);
    crate(-24, -10, 0.7, 0.5);
    crate(-22, -3, 0.5, 0.1);
    // Pallet
    addBox(1.2, 0.14, 1.0, -23.5, 0.07, -6, woodMat, { collide: true });
    // Barricaded service door on the east wall (the way the staff never came back)
    addBox(0.08, DOOR_H, OPENING, -15.2, DOOR_H / 2, -6, doorMat, { shadow: false });
    const plankMat = colorMat(0x8a6a44, 0.85);
    for (const [py, rot] of [[0.7, 0.35], [1.5, -0.3], [2.1, 0.2]]) {
      const b = addBox(0.06, 0.18, 2.0, -15.3, py, -6, plankMat, { shadow: false });
      b.rotation.x = rot;
    }
    addDecal(decalMat(Tex.getGraffitiTexture('ELLE RAMPE')), 2.6, 0.7, -15.16, 2.5, -2.6, '-x');
    addDecal(bloodMat, 1.2, 1.2, -19, 0.006, -1.5, 'up', 1.2);

    // The planks: what you came for
    const planks = new THREE.Group();
    planks.position.set(-18.5, 0, -8.5);
    planks.rotation.y = 0.25;
    for (let layer = 0; layer < 5; layer++) {
      for (let k = 0; k < 3; k++) {
        const pl = addBox(2.2, 0.05, 0.24, (Math.random() - 0.5) * 0.08, 0.03 + layer * 0.055, -0.3 + k * 0.28, plankMat, { parent: planks });
        pl.rotation.y = (Math.random() - 0.5) * 0.06;
      }
    }
    // Box of nails on top
    addBox(0.2, 0.1, 0.14, 0.6, 0.33, 0.1, colorMat(0x6a4a2a, 0.8), { parent: planks });
    sceneGroup.add(planks);
    addCollider(-18.5, -8.5, 1.15, 0.55, 0.4);
    addContainer('planks-pile', 'Pile de Planches', 'shelf', planks, {
      id: 'item-planks',
      name: 'Planches et clous',
      type: 'tool',
      description: 'De quoi reconstruire les marches effondrées de l\'escalier de service.',
      icon: 'Planks',
    });
    const wCrate = addBox(0.7, 0.6, 0.7, -25, 0.3, -1.6, cardboardMat);
    addCollider(-25, -1.6, 0.4, 0.4, 0.7);
    addContainer('crate-warehouse', 'Carton de l\'Entrepôt', 'crate', wCrate, {
      id: 'item-battery-6',
      name: 'Pile Haute Capacité',
      type: 'battery',
      description: 'Recharge 55 % de la batterie de la lampe torche.',
      icon: 'BatteryCharging',
    });

    // ==================================================================
    // FLOOR 2 — built 40 m east (the stairs teleport between floors)
    // Corridor x[OX-3,OX+3] z[-20,10]
    // ==================================================================
    const OX = 40;
    addFloorAndCeiling(OX, -5, 6, 30);
    addFloorAndCeiling(OX - 5.5, 6, 5, 8); // landing
    addFloorAndCeiling(OX - 7, -2, 8, 8); // rest room
    addFloorAndCeiling(OX - 7, -9.5, 8, 7); // director
    addFloorAndCeiling(OX - 7, -16.5, 8, 7); // room 201
    addFloorAndCeiling(OX + 7, 4, 8, 12); // radiology
    addFloorAndCeiling(OX + 7, -6.5, 8, 9); // storage
    addFloorAndCeiling(OX + 7, -15.5, 8, 9); // medical archives

    wallAlongZ(OX - 3, -20, 10, [-16.5, -9.5, -2, 6]);
    wallAlongZ(OX + 3, -20, 10, [-15.5, -6.5, 4]);
    wallAlongX(10, OX - 8, OX + 11);
    wallAlongZ(OX - 8, 2, 10);
    wallAlongX(2, OX - 11, OX - 3);
    wallAlongZ(OX - 11, -20, 2);
    wallAlongX(-6, OX - 11, OX - 3);
    wallAlongX(-13, OX - 11, OX - 3);
    wallAlongX(-20, OX - 11, OX + 11);
    wallAlongZ(OX + 11, -20, 10);
    wallAlongX(-2, OX + 3, OX + 11);
    wallAlongX(-11, OX + 3, OX + 11);

    addDoor('door-stairs-2', 'ESCALIER', 'x', OX - 3, 6, -1, { sub: 'Rez-de-chaussée' });
    addDoor('door-rest', 'SALLE DE REPOS', 'x', OX - 3, -2, -1, { sub: 'Personnel' });
    addDoor('door-director', 'DIRECTION', 'x', OX - 3, -9.5, -1, { sub: 'Dr Miller' });
    addDoor('door-201', 'CHAMBRE 201', 'x', OX - 3, -16.5, -1);
    addDoor('door-radio', 'RADIOLOGIE', 'x', OX + 3, 4, 1, { sub: 'Rayons X' });
    addDoor('door-storage', 'RÉSERVE MÉDICALE', 'x', OX + 3, -6.5, 1, { sub: 'Stock' });
    addDoor('door-medarch', 'ARCHIVES MÉDICALES', 'x', OX + 3, -15.5, 1);

    addLight(OX, 6, 0xd8f0e0, 6, { flicker: true });
    addLight(OX, -4, 0xfff0d0, 6);
    addLight(OX, -14, 0xbfe0d0, 5, { flicker: true });
    addLight(OX - 5.2, 6, 0xd8e0c8, 4, { distance: 8 });
    addLight(OX - 7, -2, 0xffe2b0, 5);
    addLight(OX - 7, -9.5, 0xffe2b0, 5, { flicker: true });
    addLight(OX - 7, -16.5, 0xc8d8b0, 4, { flicker: true });
    addLight(OX + 7, 4, 0x9fd8ff, 6);
    addLight(OX + 7, -6.5, 0xf0f0ff, 5, { flicker: true });
    addLight(OX + 7, -15.5, 0xffe2b0, 4, { flicker: true });

    staircase(OX, 'down');

    // ---- Upstairs items: the further you go, the more you find ----
    const up: Record<string, GameItem> = {
      sedative1: {
        id: 'item-sedative-1',
        name: 'Seringue de Sédatif',
        type: 'sedative',
        description: 'Utilisez-la [1-5] tout près du monstre, face à lui : il s\'effondre pendant 5 secondes.',
        icon: 'Syringe',
      },
      sedative2: {
        id: 'item-sedative-2',
        name: 'Seringue de Sédatif',
        type: 'sedative',
        description: 'Utilisez-la [1-5] tout près du monstre, face à lui : il s\'effondre pendant 5 secondes.',
        icon: 'Syringe',
      },
      battery4: { id: 'item-battery-4', name: 'Pile Haute Capacité', type: 'battery', description: 'Recharge 55 % de la batterie de la lampe torche.', icon: 'BatteryCharging' },
      battery5: { id: 'item-battery-5', name: 'Pile Haute Capacité', type: 'battery', description: 'Recharge 55 % de la batterie de la lampe torche.', icon: 'BatteryCharging' },
      medkit2: {
        id: 'item-medkit-2',
        name: 'Seringue d\'Adrénaline',
        type: 'medkit',
        description: 'Une dose d\'adrénaline : restaure toute votre endurance.',
        icon: 'HeartPulse',
      },
      note201: {
        id: 'note-patient-201',
        name: 'Journal du Patient 201',
        type: 'note',
        description: 'Carnet griffonné, trouvé sous un oreiller.',
        lore: '« Jour 12. Ils m\'ont injecté la même chose qu\'au sous-sol. J\'entends tout. Les pas des infirmières à trois étages. Les cœurs. Si je cours, ça me suit. Si je me tais, ça passe. Je me tais. »',
        icon: 'FileText',
      },
      aurore2: {
        id: 'note-aurore-phase2',
        name: 'Protocole Aurore — Phase 2',
        type: 'note',
        description: 'Rapport tamponné « DESTRUCTION APRÈS LECTURE ».',
        lore: '« Phase 2 : aucun sédatif ne tient plus de quelques secondes, son métabolisme élimine tout. Le Sujet Zéro se déplace désormais entre les étages par l\'escalier de service. Condamner l\'étage 2 au plus vite. »',
        icon: 'FileText',
      },
    };
    Object.assign(items, up);

    // Rest room: lockers, battery
    locker('locker-rest', 'Casier du Personnel', OX - 10.55, 1.0, Math.PI / 2);
    addContainer('cabinet-rest', 'Armoire du Personnel', 'cabinet', cabinet(OX - 10.6, -4.5, Math.PI / 2, 1.0, 1.8, 0.45), up.battery4);
    addBox(1.4, 0.75, 0.8, OX - 6.5, 0.375, -2, woodMat, { collide: true });
    papers(OX - 6.5, -1.5, 5, 1.5);
    addDecal(decalMat(Tex.getGraffitiTexture('IL MONTE AUSSI')), 3, 0.75, OX - 10.84, 2.1, -2.5, '+x');

    // Director's office: the safe code now lives upstairs
    const ddesk2 = new THREE.Group();
    ddesk2.position.set(OX - 7, 0, -11.6);
    addBox(1.6, 0.06, 0.8, 0, 0.76, 0, woodMat, { parent: ddesk2 });
    addBox(0.05, 0.73, 0.75, -0.75, 0.37, 0, woodMat, { parent: ddesk2 });
    addBox(0.05, 0.73, 0.75, 0.75, 0.37, 0, woodMat, { parent: ddesk2 });
    const memo2 = new THREE.Mesh(track(new THREE.PlaneGeometry(0.21, 0.28)), paperMat);
    memo2.rotation.set(-Math.PI / 2, 0, 0.4);
    memo2.position.set(0.2, 0.795, 0);
    ddesk2.add(memo2);
    sceneGroup.add(ddesk2);
    addCollider(OX - 7, -11.6, 0.85, 0.45, 1);
    addContainer('desk-director-2', 'Bureau du Dr Miller', 'desk', ddesk2, items.directorNote);
    addContainer('cabinet-director', 'Armoire Fermée', 'cabinet', cabinet(OX - 10.6, -8, Math.PI / 2, 1.0, 1.8, 0.45), up.sedative1);
    // Moreau's camcorder, still on its tripod, pointed at the empty chair
    {
      const cc = new THREE.Group();
      cc.position.set(OX - 7, 0, -9.6);
      cc.rotation.y = Math.PI;
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        const leg = addBox(0.025, 1.3, 0.025, Math.sin(a) * 0.18, 0.62, Math.cos(a) * 0.18, darkMetalMat, { parent: cc, shadow: false });
        leg.rotation.set(Math.cos(a) * 0.28, 0, -Math.sin(a) * 0.28);
      }
      addBox(0.14, 0.13, 0.3, 0, 1.33, 0, colorMat(0x1a1a1c, 0.5), { parent: cc });
      addBox(0.08, 0.08, 0.08, 0, 1.33, 0.18, colorMat(0x0a0a0a, 0.2), { parent: cc, shadow: false });
      const rec = new THREE.Mesh(track(new THREE.SphereGeometry(0.012, 6, 6)), track(new THREE.MeshBasicMaterial({ color: 0xff2020 })));
      rec.position.set(0.05, 1.41, 0.1);
      cc.add(rec);
      sceneGroup.add(cc);
      addCollider(OX - 7, -9.6, 0.25, 0.25, 1.4);
      addContainer('vhs-camcorder', 'Caméscope sur Trépied', 'desk', cc, {
        id: 'vhs-moreau',
        name: 'Cassette VHS « Dernier message »',
        type: 'cassette',
        description: 'La cassette restée dans le caméscope du Dr Moreau.',
        lore: 'Étiquette griffonnée d\'une main tremblante : « DERNIER MESSAGE — H. MOREAU — 19/03/87 — À REMETTRE À LA PRESSE ».\n\nLe caméscope tournait encore, braqué sur une chaise vide renversée.\n\nAppuyez sur ▶ Regarder pour lire la bande.',
        icon: 'Disc',
      });
    }
    addDecal(bloodMat, 1.4, 1.4, OX - 5, 0.006, -9, 'up', 0.3);

    // Room 201: a bed to hide under, the patient's diary
    hospitalBed(OX - 9, -17, 0, { sheetBlood: true });
    addContainer('drawer-201', 'Table de Chevet 201', 'nightstand', nightstand(OX - 10.4, -14.6, Math.PI / 2), up.note201);
    ivStand(OX - 7.5, -18.8);

    // Radiology: X-ray table & lightbox, battery, locker
    addBox(0.8, 0.9, 2.2, OX + 8.5, 0.45, 4, chromeMat, { collide: true });
    addBox(0.3, 2.6, 0.3, OX + 9.6, 1.3, 4, darkMetalMat, { collide: true });
    const xray = new THREE.Mesh(
      track(new THREE.PlaneGeometry(1.4, 0.9)),
      track(new THREE.MeshStandardMaterial({ color: 0x223040, emissive: 0x9fd8ff, emissiveIntensity: 0.8 }))
    );
    xray.position.set(OX + 10.84, 1.8, 7);
    xray.rotation.y = -Math.PI / 2;
    sceneGroup.add(xray);
    addContainer('cabinet-radio', 'Armoire de Radiologie', 'cabinet', cabinet(OX + 10.6, 0.5, -Math.PI / 2, 1.0, 1.8, 0.45), up.battery5);
    locker('locker-radio', 'Casier de Radiologie', OX + 10.55, 8.6, -Math.PI / 2);

    // Medical storage: the richest room (sedative, adrenaline)
    addContainer('shelf-storage-1', 'Stock de Sédatifs', 'cabinet', cabinet(OX + 10.6, -4, -Math.PI / 2), up.sedative2);
    addContainer('shelf-storage-2', 'Stock d\'Urgence', 'cabinet', cabinet(OX + 10.6, -8.5, -Math.PI / 2), up.medkit2);
    crate(OX + 5, -10, 0.55, 0.2);
    crate(OX + 5.6, -10.2, 0.5, -0.3);

    // Medical archives: Aurore phase 2 report
    for (const sz of [-13.5, -17.5]) {
      addBox(5, 2.2, 0.55, OX + 7.5, 1.1, sz, metalMat, { collide: true });
    }
    const aDesk = new THREE.Group();
    aDesk.position.set(OX + 5, 0, -19.2);
    addBox(1.2, 0.06, 0.7, 0, 0.76, 0, woodMat, { parent: aDesk });
    addBox(1.15, 0.73, 0.05, 0, 0.37, -0.32, woodMat, { parent: aDesk });
    sceneGroup.add(aDesk);
    addCollider(OX + 5, -19.2, 0.65, 0.4, 1);
    addContainer('desk-medarch', 'Bureau des Archives', 'desk', aDesk, up.aurore2);
    papers(OX + 7, -15.5, 8, 3);

    // Corridor dressing
    wheelchair(OX + 2.2, -9, 0.9);
    locker('locker-corridor-2', 'Casier du Couloir (Étage 2)', OX - 2.55, -12.5, Math.PI / 2);
    addDecal(bloodTrailMat, 4, 1.2, OX + 0.4, 0.006, -7, 'up', Math.PI / 2 + 0.2);
    addDecal(poster, 0.6, 0.85, OX + 2.84, 1.7, -0.5, '-x');

    // ---- Floor 2 navigation (for the upstairs creature) ----
    node('u8', OX, 7);
    node('u2', OX, -2);
    node('u9', OX, -9.5);
    node('u16', OX, -16.5);
    node('u4', OX, 4);
    node('u6', OX, -6.5);
    node('u15', OX, -15.5);
    link('u8', 'u4');
    link('u4', 'u2');
    link('u2', 'u6');
    link('u6', 'u9');
    link('u9', 'u15');
    link('u15', 'u16');
    node('ur', OX - 6, -2.5);
    node('ud', OX - 5, -8.5);
    node('u201', OX - 5.5, -16);
    node('ura', OX + 6, 1);
    node('ust', OX + 6.5, -6.5);
    node('uma', OX + 5.5, -15.5);
    node('ul', OX - 5, 6);
    link('u2', 'ur', 'door-rest');
    link('u9', 'ud', 'door-director');
    link('u16', 'u201', 'door-201');
    link('u4', 'ura', 'door-radio');
    link('u6', 'ust', 'door-storage');
    link('u15', 'uma', 'door-medarch');
    link('u8', 'ul', 'door-stairs-2');
    const upperRoute = ['u2', 'ur', 'u2', 'u6', 'ust', 'u6', 'u9', 'ud', 'u9', 'u15', 'uma', 'u15', 'u16', 'u201', 'u16', 'u9', 'u4', 'ura', 'u4', 'u8', 'ul', 'u8'];

    // ==================================================================
    // SHARED BUILDERS FOR THE NEW LEVELS
    // ==================================================================
    const concreteFloor = colorMat(0x4a4945, 0.95);
    const pickups: { item: GameItem; pos: THREE.Vector3; rotY: number }[] = [];
    const extraMonsters: { pos: THREE.Vector3; route: string[]; minDifficulty: number }[] = [];
    let pickupN = 0;
    const coinsItem = (n: number): GameItem => ({
      id: `coins-${++pickupN}`,
      name: `${n} pièces`,
      type: 'coins',
      description: 'De vieilles pièces. Gardées si vous sortez vivant.',
      icon: 'Coins',
      quantity: n,
    });
    const supply = (type: 'battery' | 'food' | 'alarm' | 'sedative' | 'medkit'): GameItem => {
      const n = ++pickupN;
      switch (type) {
        case 'battery':
          return { id: `pick-battery-${n}`, name: 'Pile', type, description: 'Recharge 55 % de la batterie de la lampe torche.', icon: 'BatteryCharging' };
        case 'food':
          return { id: `pick-food-${n}`, name: 'Barre de céréales', type, description: 'Redonne 40 points d\'endurance.', icon: 'Cookie' };
        case 'alarm':
          return { id: `pick-alarm-${n}`, name: 'Réveil', type, description: 'Posez-le : il sonne au bout de 3 s et attire les monstres.', icon: 'AlarmClock' };
        case 'sedative':
          return { id: `pick-sedative-${n}`, name: 'Seringue de Sédatif', type, description: 'Immobilise un monstre 5 secondes (à moins de 3 m, face à lui).', icon: 'Syringe' };
        default:
          return { id: `pick-medkit-${n}`, name: 'Adrénaline', type, description: 'Auto-injecteur : endurance au maximum.', icon: 'HeartPulse' };
      }
    };
    const drop = (item: GameItem, x: number, z: number, y = 0) => pickups.push({ item, pos: new THREE.Vector3(x, y, z), rotY: Math.random() * Math.PI * 2 });
    /** A small table holding a loose object. */
    const sideTable = (x: number, z: number, item?: GameItem) => {
      addBox(0.6, 0.04, 0.45, x, 0.74, z, woodMat);
      for (const [lx, lz] of [[-0.26, -0.18], [0.26, -0.18], [-0.26, 0.18], [0.26, 0.18]]) addBox(0.04, 0.72, 0.04, x + lx, 0.36, z + lz, woodMat, { shadow: false });
      addCollider(x, z, 0.32, 0.25, 0.8);
      if (item) drop(item, x, z, 0.76);
    };
    const signDecal = (text: string, sub: string, x: number, y: number, z: number, f: '+x' | '-x' | '+z' | '-z') =>
      addDecal(decalMat(Tex.getDoorSignTexture(text, sub)), 0.9, 0.28, x, y, z, f);

    /** Staircase running towards -x (landings of floors 2 and 3). */
    const flightX = (x0: number, z: number, dir: 'up' | 'down', to: string, sign: string, sub: string) => {
      const g = new THREE.Group();
      const concrete = colorMat(0x5a5a55, 0.95);
      for (let i = 0; i < 9; i++) addBox(0.4, 0.4 * (i + 1), 1.4, x0 - i * 0.4, 0.2 * (i + 1), z, concrete, { parent: g });
      addBox(3.6, 0.05, 0.05, x0 - 1.6, 2.3, z + 0.72, chromeMat, { parent: g, shadow: false });
      g.traverse((o) => (o.userData = { isStairs: true, dir, to }));
      sceneGroup.add(g);
      interactiveMeshes.push(g);
      addCollider(x0 - 1.6, z, 1.85, 0.72, 3.5);
      signDecal(sign, sub, x0 - 0.6, 2.7, 2.16, '+z');
    };

    // ---- Floor 1: a hatch to the basement in the morgue ----
    const hatch = new THREE.Group();
    hatch.position.set(5.6, 0, -24.5);
    const hole = new THREE.Mesh(track(new THREE.PlaneGeometry(1.1, 1.1)), blackMat);
    hole.rotation.x = -Math.PI / 2;
    hole.position.y = 0.012;
    hatch.add(hole);
    for (const [fx, fz, w, d] of [[0, -0.6, 1.3, 0.1], [0, 0.6, 1.3, 0.1], [-0.6, 0, 0.1, 1.1], [0.6, 0, 0.1, 1.1]]) addBox(w, 0.05, d, fx, 0.025, fz, darkMetalMat, { parent: hatch });
    const lid = addBox(1.1, 0.05, 1.1, 0, 0.55, -0.62, metalMat, { parent: hatch });
    lid.rotation.x = -1.45;
    lid.position.set(0, 0.55, -0.62);
    for (const s of [-1, 1]) addBox(0.04, 0.7, 0.04, s * 0.35, 0.3, 0.45, darkMetalMat, { parent: hatch });
    addBox(0.74, 0.04, 0.04, 0, 0.62, 0.45, darkMetalMat, { parent: hatch });
    hatch.traverse((o) => (o.userData = { isStairs: true, dir: 'down', to: 'b' }));
    sceneGroup.add(hatch);
    interactiveMeshes.push(hatch);
    addCollider(5.6, -24.5, 0.6, 0.6, 0.6);
    addDecal(decalMat(Tex.getGraffitiTexture('EN BAS')), 1.4, 0.4, 3.16, 1.4, -24.5, '+x');

    // ---- Floor 2: stairs up to floor 3 ----
    flightX(OX - 3.8, 3.0, 'up', 'f3', 'ÉTAGE 3 ↑', 'Unité d\'isolement');

    // ---- More things lying around on floors 1 & 2 ----
    drop(coinsItem(8), 2.3, -8.2);
    drop(supply('food'), -11.6, 0.9);
    drop(supply('battery'), 11.6, -15.2);
    drop(coinsItem(10), 9.6, -8.6);
    drop(supply('alarm'), -11.8, -15.4);
    drop(coinsItem(15), 5.4, -40.2);
    drop(coinsItem(6), -1.2, -25);
    drop(coinsItem(12), OX + 5, 8.6);
    drop(supply('food'), OX + 5.4, -3.2);
    drop(coinsItem(8), OX - 9.6, -19.2);
    drop(supply('alarm'), -22.4, -9.9);
    drop(coinsItem(10), -25.2, -6.2);

    // ---- The hobo of the warehouse: he sells things for coins ----
    {
      const hobo = new THREE.Group();
      hobo.position.set(-16.2, 0, -10.9);
      hobo.rotation.y = -0.35;
      const coat = colorMat(0x4a3a26, 0.95);
      const blanket = colorMat(0x3a4a32, 1);
      const skinM = colorMat(0xb88a6a, 0.8);
      const beardM = colorMat(0x5a5248, 1);
      const beanieM = colorMat(0x7a1e1e, 1);
      addBox(1.1, 0.03, 0.9, 0, 0.015, 0.1, cardboardMat, { parent: hobo });
      // Legs under a blanket
      const blanketLump = new THREE.Mesh(track(new THREE.SphereGeometry(0.4, 16, 10)), blanket);
      blanketLump.scale.set(0.75, 0.22, 1.15);
      blanketLump.position.set(0, 0.09, 0.42);
      blanketLump.castShadow = true;
      hobo.add(blanketLump);
      for (const s of [-1, 1]) addBox(0.12, 0.1, 0.16, s * 0.13, 0.06, 0.82, colorMat(0x222018, 0.9), { parent: hobo }); // boots
      // Torso leaning against the wall
      const torso = new THREE.Mesh(track(new THREE.CapsuleGeometry(0.2, 0.38, 6, 12)), coat);
      torso.position.set(0, 0.48, -0.08);
      torso.rotation.x = -0.18;
      torso.scale.set(1.15, 1, 0.8);
      torso.castShadow = true;
      hobo.add(torso);
      // Arms resting on the knees, hands around a paper cup
      for (const s of [-1, 1]) {
        const arm = new THREE.Mesh(track(new THREE.CapsuleGeometry(0.06, 0.34, 4, 8)), coat);
        arm.position.set(s * 0.22, 0.42, 0.12);
        arm.rotation.set(1.1, 0, s * 0.25);
        arm.castShadow = true;
        hobo.add(arm);
        const hand = new THREE.Mesh(track(new THREE.SphereGeometry(0.045, 8, 6)), skinM);
        hand.position.set(s * 0.06, 0.32, 0.33);
        hobo.add(hand);
      }
      const cup = new THREE.Mesh(track(new THREE.CylinderGeometry(0.04, 0.032, 0.1, 12)), colorMat(0xe8e2d0, 0.8));
      cup.position.set(0, 0.36, 0.34);
      hobo.add(cup);
      // Head: face, big grey beard, red beanie
      const head = new THREE.Group();
      head.position.set(0, 0.9, -0.02);
      head.rotation.x = 0.15;
      hobo.add(head);
      const face = new THREE.Mesh(track(new THREE.SphereGeometry(0.11, 16, 12)), skinM);
      face.scale.set(0.9, 1.08, 1);
      head.add(face);
      const beard = new THREE.Mesh(track(new THREE.SphereGeometry(0.1, 14, 10, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.55)), beardM);
      beard.position.set(0, -0.03, 0.03);
      beard.scale.set(1, 1.3, 1);
      head.add(beard);
      const cap = new THREE.Mesh(track(new THREE.SphereGeometry(0.115, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2)), beanieM);
      cap.position.y = 0.03;
      cap.scale.set(1, 1.05, 1.05);
      head.add(cap);
      for (const s of [-1, 1]) {
        const eye = new THREE.Mesh(track(new THREE.SphereGeometry(0.012, 6, 5)), blackMat);
        eye.position.set(s * 0.035, 0.015, 0.098);
        head.add(eye);
      }
      const nose = new THREE.Mesh(track(new THREE.SphereGeometry(0.022, 8, 6)), colorMat(0xb06a5a, 0.7));
      nose.position.set(0, -0.01, 0.11);
      head.add(nose);
      // Shopping cart full of junk + his sign
      const cart = new THREE.Group();
      cart.position.set(0.95, 0, 0.35);
      cart.rotation.y = 0.5;
      addBox(0.55, 0.42, 0.85, 0, 0.62, 0, chromeMat, { parent: cart });
      addBox(0.5, 0.35, 0.8, 0, 0.82, 0, cardboardMat, { parent: cart });
      for (const [wx, wz] of [[-0.24, -0.38], [0.24, -0.38], [-0.24, 0.38], [0.24, 0.38]]) addBox(0.05, 0.4, 0.05, wx, 0.22, wz, chromeMat, { parent: cart, shadow: false });
      hobo.add(cart);
      const sign = new THREE.Mesh(track(new THREE.PlaneGeometry(0.62, 0.32)), decalMat(Tex.getDoorSignTexture('MARCHÉ NOIR', 'Piles · Sédatifs · Skins')));
      sign.position.set(-0.55, 0.32, 0.25);
      sign.rotation.set(-0.3, 0.3, 0);
      hobo.add(sign);
      hobo.traverse((o) => (o.userData = { isHobo: true }));
      sceneGroup.add(hobo);
      interactiveMeshes.push(hobo);
      addCollider(-16.0, -10.6, 0.9, 0.75, 1.2);
      // His burning barrel keeps the corner warm and lit
      const barrel = addBox(0.5, 0.85, 0.5, -17.6, 0.425, -11.2, colorMat(0x3a2a1a, 0.6));
      barrel.rotation.y = 0.4;
      addBox(0.42, 0.06, 0.42, -17.6, 0.86, -11.2, track(new THREE.MeshStandardMaterial({ color: 0x220800, emissive: 0xff6a10, emissiveIntensity: 3 })));
      addCollider(-17.6, -11.2, 0.3, 0.3, 1);
      addLight(-17.6, -10.6, 0xff8a3a, 6, { flicker: true, distance: 9 });
    }

    // ==================================================================
    // BASEMENT — built 60 m west (hatch in the morgue ↔ ladder)
    //   Corridor x[OXB-3,OXB+3] z[-20,10]
    //   West: boiler z[0,10], laundry z[-10,0], incinerator z[-20,-10]
    //   East: generator z[0,10], old archives z[-10,0], "Room 0" z[-20,-10]
    // ==================================================================
    const OXB = -60;
    addFloorAndCeiling(OXB, -5, 6, 30);
    addFloorAndCeiling(OXB - 7, -5, 8, 30);
    addFloorAndCeiling(OXB + 7, -5, 8, 30);
    addBox(22, 0.02, 30, OXB, 0.005, -5, concreteFloor, { shadow: false });
    wallAlongZ(OXB - 3, -20, 10, [5, -5, -15]);
    wallAlongZ(OXB + 3, -20, 10, [5, -5, -15]);
    wallAlongZ(OXB - 11, -20, 10);
    wallAlongZ(OXB + 11, -20, 10);
    wallAlongX(10, OXB - 11, OXB + 11);
    wallAlongX(-20, OXB - 11, OXB + 11);
    wallAlongX(0, OXB - 11, OXB - 3);
    wallAlongX(-10, OXB - 11, OXB - 3);
    wallAlongX(0, OXB + 3, OXB + 11);
    wallAlongX(-10, OXB + 3, OXB + 11);
    addDoor('door-boiler', 'CHAUFFERIE', 'x', OXB - 3, 5, -1, { sub: 'Danger — Vapeur' });
    addDoor('door-laundry', 'BUANDERIE', 'x', OXB - 3, -5, -1);
    addDoor('door-incin', 'INCINÉRATEUR', 'x', OXB - 3, -15, -1, { sub: 'Déchets médicaux' });
    addDoor('door-gen', 'GROUPE ÉLECTROGÈNE', 'x', OXB + 3, 5, 1);
    addDoor('door-cellar', 'CAVE D\'ARCHIVES', 'x', OXB + 3, -5, 1, { sub: '1960 – 1987' });
    addDoor('door-salle0', 'SALLE 0', 'x', OXB + 3, -15, 1, { locked: true, keyId: 'key-salle0', keyName: 'Clé rouillée « 0 » (Chaufferie)', sub: 'Accès interdit' });
    addLight(OXB, 6, 0xffb070, 3, { flicker: true, distance: 9 });
    addLight(OXB, -6, 0xd0c8a0, 2.5, { flicker: true, distance: 9 });
    addLight(OXB, -16, 0xd0c8a0, 2.5, { flicker: true, distance: 9 });
    addLight(OXB - 7, 5, 0xff9a40, 4, { flicker: true, distance: 9 });
    addLight(OXB - 7, -5, 0xe0e8ff, 3, { distance: 9 });
    addLight(OXB - 7, -15, 0xff5020, 4, { flicker: true, distance: 9 });
    addLight(OXB + 7, 5, 0xb8ffb0, 3, { flicker: true, distance: 9 });
    addLight(OXB + 7, -5, 0xffe2b0, 2.5, { distance: 9 });
    addLight(OXB + 7, -15, 0x9ab8ff, 2.5, { flicker: true, distance: 9 });
    // Pipes along the corridor ceiling
    for (const px of [OXB - 2.4, OXB + 2.5]) {
      const pipe = new THREE.Mesh(track(new THREE.CylinderGeometry(0.09, 0.09, 30, 10)), metalMat);
      pipe.rotation.x = Math.PI / 2;
      pipe.position.set(px, 3.1, -5);
      sceneGroup.add(pipe);
    }
    // Ladder up to the morgue hatch
    {
      const ladder = new THREE.Group();
      ladder.position.set(OXB, 0, 9.7);
      for (const s of [-1, 1]) addBox(0.05, 3.5, 0.05, s * 0.25, 1.75, 0, darkMetalMat, { parent: ladder });
      for (let i = 0; i < 11; i++) addBox(0.5, 0.03, 0.03, 0, 0.3 + i * 0.3, 0, darkMetalMat, { parent: ladder, shadow: false });
      const top = new THREE.Mesh(track(new THREE.PlaneGeometry(1.1, 1.1)), blackMat);
      top.rotation.x = Math.PI / 2;
      top.position.set(0, WALL_H - 0.01, -0.5);
      ladder.add(top);
      // Invisible panel so the ladder is easy to aim at
      const ladderHit = new THREE.Mesh(track(new THREE.BoxGeometry(0.7, 3.4, 0.1)), track(new THREE.MeshBasicMaterial({ visible: false })));
      ladderHit.position.y = 1.7;
      ladder.add(ladderHit);
      ladder.traverse((o) => (o.userData = { isStairs: true, dir: 'up', to: 'f1h' }));
      sceneGroup.add(ladder);
      interactiveMeshes.push(ladder);
      addCollider(OXB, 9.7, 0.35, 0.15, 3.5);
      addDecal(decalMat(Tex.getGraffitiTexture('SOUS-SOL')), 2.4, 0.6, OXB, 2.6, 9.84, '-z');
    }
    // Boiler room
    {
      const boiler = new THREE.Mesh(track(new THREE.CylinderGeometry(1.0, 1.0, 2.6, 24)), metalMat);
      boiler.position.set(OXB - 8.2, 1.3, 6.5);
      boiler.castShadow = true;
      sceneGroup.add(boiler);
      addCollider(OXB - 8.2, 6.5, 1.05, 1.05, 2.6);
      for (let i = 0; i < 3; i++) {
        const p = new THREE.Mesh(track(new THREE.CylinderGeometry(0.08, 0.08, 1.2, 8)), darkMetalMat);
        p.position.set(OXB - 8.2 + (i - 1) * 0.5, 3.0, 6.5);
        sceneGroup.add(p);
      }
      const gauge = new THREE.Mesh(track(new THREE.CircleGeometry(0.12, 18)), colorMat(0xf0ead8, 0.5));
      gauge.position.set(OXB - 7.18, 1.6, 6.5);
      gauge.rotation.y = Math.PI / 2;
      sceneGroup.add(gauge);
      const toolbox = addBox(0.6, 0.3, 0.3, OXB - 4.2, 0.15, 9.3, colorMat(0xb02020, 0.5));
      addCollider(OXB - 4.2, 9.3, 0.35, 0.2, 0.4);
      addContainer('toolbox-boiler', 'Caisse à Outils', 'crate', toolbox, {
        id: 'key-salle0',
        name: 'Clé rouillée « 0 »',
        type: 'key',
        description: 'Une vieille clé gravée d\'un zéro. Elle ouvre la Salle 0 du sous-sol.',
        icon: 'Key',
      });
      locker('locker-boiler', 'Casier de la Chaufferie', OXB - 10.55, 1.2, Math.PI / 2);
      drop(coinsItem(10), OXB - 5, 2.0);
      addDecal(bloodMat, 1.2, 1.2, OXB - 6, 0.012, 4, 'up', 0.3);
    }
    // Laundry
    {
      for (let i = 0; i < 3; i++) {
        const z = -2 - i * 2.2;
        addBox(0.75, 0.9, 0.7, OXB - 10.5, 0.45, z, colorMat(0xe8e6e0, 0.5), { collide: true });
        const door = new THREE.Mesh(track(new THREE.CircleGeometry(0.22, 20)), glassMat);
        door.position.set(OXB - 10.11, 0.5, z);
        door.rotation.y = Math.PI / 2;
        sceneGroup.add(door);
        const ring = new THREE.Mesh(track(new THREE.TorusGeometry(0.23, 0.03, 6, 20)), chromeMat);
        ring.position.copy(door.position);
        ring.rotation.y = Math.PI / 2;
        sceneGroup.add(ring);
      }
      const washer = new THREE.Group();
      washer.position.set(OXB - 10.5, 0, -8.6);
      addBox(0.75, 0.9, 0.7, 0, 0.45, 0, colorMat(0xe8e6e0, 0.5), { parent: washer });
      sceneGroup.add(washer);
      addCollider(OXB - 10.5, -8.6, 0.4, 0.38, 1);
      addContainer('washer-4', 'Machine à Laver', 'cabinet', washer, coinsItem(15));
      // Sheets hanging from a line (they sway in the dark)
      for (let i = 0; i < 4; i++) {
        const sheet = new THREE.Mesh(track(new THREE.PlaneGeometry(1.1, 1.6)), track(new THREE.MeshStandardMaterial({ color: 0xd8d4c8, roughness: 1, side: THREE.DoubleSide })));
        sheet.position.set(OXB - 6.5, 1.9, -1.5 - i * 1.9);
        sheet.rotation.y = Math.PI / 2 + (Math.random() - 0.5) * 0.3;
        sceneGroup.add(sheet);
      }
      hospitalBed(OXB - 4.6, -7.6, 0, { sheetBlood: true });
      drop(supply('battery'), OXB - 8.5, -9.4);
    }
    // Incinerator
    {
      addBox(1.6, 2.4, 2.4, OXB - 10.1, 1.2, -15, darkMetalMat, { collide: true });
      const mouth = new THREE.Mesh(track(new THREE.PlaneGeometry(0.9, 0.7)), track(new THREE.MeshStandardMaterial({ color: 0x220800, emissive: 0xff4a10, emissiveIntensity: 2.4 })));
      mouth.position.set(OXB - 9.28, 0.9, -15);
      mouth.rotation.y = Math.PI / 2;
      sceneGroup.add(mouth);
      const chimney = new THREE.Mesh(track(new THREE.CylinderGeometry(0.25, 0.25, 1.2, 12)), darkMetalMat);
      chimney.position.set(OXB - 10.2, 2.9, -15);
      sceneGroup.add(chimney);
      const trolley = new THREE.Group();
      trolley.position.set(OXB - 6.5, 0, -17.5);
      trolley.rotation.y = 0.4;
      addBox(0.7, 0.05, 1.8, 0, 0.8, 0, chromeMat, { parent: trolley });
      const bag = new THREE.Mesh(track(new THREE.CapsuleGeometry(0.22, 1.1, 4, 10)), blackMat);
      bag.rotation.x = Math.PI / 2;
      bag.scale.set(1, 1, 0.6);
      bag.position.y = 0.95;
      trolley.add(bag);
      sceneGroup.add(trolley);
      addCollider(OXB - 6.5, -17.5, 0.6, 0.95, 1);
      addContainer('incin-bag', 'Housse Mortuaire', 'body', trolley, supply('sedative'));
      addDecal(decalMat(Tex.getGraffitiTexture('ILS BRÛLENT LES PREUVES')), 3.2, 0.8, OXB - 3.16, 2.2, -15.8, '-x');
      drop(coinsItem(12), OXB - 5, -11.2);
    }
    // Generator room
    {
      addBox(2.2, 1.3, 1.1, OXB + 8, 0.65, 7, colorMat(0x2f4a2f, 0.5), { collide: true });
      addBox(0.25, 1.5, 0.25, OXB + 9, 2.0, 7, darkMetalMat);
      for (let i = 0; i < 3; i++) addBox(0.3, 0.4, 0.2, OXB + 5 + i * 0.4, 0.2, 9.5, colorMat(0xb01818, 0.5), { collide: true });
      addContainer('gen-cabinet', 'Armoire Électrique', 'cabinet', cabinet(OXB + 10.6, 2.5, -Math.PI / 2, 1.0, 1.8, 0.45), supply('battery'));
      locker('locker-gen', 'Casier Technique', OXB + 10.55, 0.9, -Math.PI / 2);
      drop(supply('food'), OXB + 5.2, 1.0);
    }
    // Old archives cellar
    {
      for (const sz of [-3, -6.5]) addBox(5.5, 2.3, 0.6, OXB + 7.5, 1.15, sz, metalMat, { collide: true });
      for (let i = 0; i < 6; i++) crate(OXB + 5.2 + (i % 3) * 1.6, -1.3 - Math.floor(i / 3) * 7.6, 0.45, i * 0.4);
      const deskB = new THREE.Group();
      deskB.position.set(OXB + 9.5, 0, -8.8);
      addBox(1.2, 0.06, 0.7, 0, 0.76, 0, woodMat, { parent: deskB });
      addBox(1.15, 0.73, 0.05, 0, 0.37, -0.32, woodMat, { parent: deskB });
      sceneGroup.add(deskB);
      addCollider(OXB + 9.5, -8.8, 0.65, 0.4, 1);
      items.noteBasement = {
        id: 'note-basement-keeper',
        name: 'Carnet du Gardien',
        type: 'note',
        description: 'Un carnet humide, écrit au crayon.',
        lore: '« 14 mars 1987. Ils descendent les patients de la Salle 0 la nuit. Le lendemain, l\'incinérateur tourne. On m\'a dit de ne rien voir. Je garde la clé de la Salle 0 dans ma caisse à outils, à la chaufferie. Que Dieu me pardonne. »',
        icon: 'FileText',
      };
      addContainer('desk-cellar', 'Bureau du Gardien', 'desk', deskB, items.noteBasement);
      papers(OXB + 7, -8.5, 10, 3);
      drop(coinsItem(8), OXB + 4.5, -9.2);
    }
    // Room 0
    {
      const chair = new THREE.Group();
      chair.position.set(OXB + 7, 0, -15);
      chair.rotation.y = -Math.PI / 2;
      addBox(0.6, 0.08, 0.6, 0, 0.5, 0, woodMat, { parent: chair });
      addBox(0.6, 0.9, 0.08, 0, 0.95, -0.28, woodMat, { parent: chair });
      for (const [lx, lz] of [[-0.26, -0.26], [0.26, -0.26], [-0.26, 0.26], [0.26, 0.26]]) addBox(0.06, 0.5, 0.06, lx, 0.25, lz, woodMat, { parent: chair });
      for (const s of [-1, 1]) addBox(0.12, 0.04, 0.5, s * 0.33, 0.7, 0, colorMat(0x3a2a1a, 0.8), { parent: chair });
      addBox(0.62, 0.06, 0.06, 0, 1.25, -0.25, colorMat(0x3a2a1a, 0.8), { parent: chair });
      sceneGroup.add(chair);
      addCollider(OXB + 7, -15, 0.4, 0.4, 1.3);
      hospitalBed(OXB + 9.4, -18.2, Math.PI / 2, { sheetBlood: true });
      addContainer('salle0-cabinet', 'Armoire de la Salle 0', 'cabinet', cabinet(OXB + 10.6, -12.3, -Math.PI / 2, 1.0, 1.8, 0.45), coinsItem(40));
      addDecal(decalMat(Tex.getGraffitiTexture('ILS M\'ONT FAIT ÇA')), 3, 0.8, OXB + 10.84, 2.2, -16, '-x');
      addDecal(bloodMat, 1.6, 1.6, OXB + 7, 0.012, -15, 'up', 0.2);
      drop(supply('medkit'), OXB + 4.6, -19.2);
    }
    // Basement navigation & its creature (difficulty 4+)
    node('b_n', OXB, 7.5);
    node('b_5', OXB, 5);
    node('b_m5', OXB, -5);
    node('b_m15', OXB, -15);
    node('b_s', OXB, -18.5);
    link('b_n', 'b_5');
    link('b_5', 'b_m5');
    link('b_m5', 'b_m15');
    link('b_m15', 'b_s');
    node('b_boil', OXB - 5.5, 4);
    node('b_laun', OXB - 6, -4.5);
    node('b_inc', OXB - 6, -13.5);
    node('b_gen', OXB + 5.5, 4);
    node('b_cel', OXB + 5, -4.8);
    node('b_s0', OXB + 5.5, -13);
    link('b_5', 'b_boil', 'door-boiler');
    link('b_m5', 'b_laun', 'door-laundry');
    link('b_m15', 'b_inc', 'door-incin');
    link('b_5', 'b_gen', 'door-gen');
    link('b_m5', 'b_cel', 'door-cellar');
    link('b_m15', 'b_s0', 'door-salle0');
    extraMonsters.push({
      pos: new THREE.Vector3(OXB, 0, -10),
      route: ['b_m5', 'b_laun', 'b_m5', 'b_cel', 'b_m5', 'b_m15', 'b_inc', 'b_m15', 'b_s', 'b_m15', 'b_5', 'b_boil', 'b_5', 'b_gen', 'b_5', 'b_n'],
      minDifficulty: 4,
    });

    // ==================================================================
    // FLOOR 3 — psychiatric isolation unit, built 80 m east
    //   West: padded cells A z[-6,2], B z[-13,-6], electroshock z[-20,-13]
    //   East: chapel z[-2,10], psychiatrist z[-11,-2], secret room z[-20,-11]
    // ==================================================================
    const OX3 = 80;
    addFloorAndCeiling(OX3, -5, 6, 30);
    addFloorAndCeiling(OX3 - 5.5, 6, 5, 8);
    addFloorAndCeiling(OX3 - 7, -2, 8, 8);
    addFloorAndCeiling(OX3 - 7, -9.5, 8, 7);
    addFloorAndCeiling(OX3 - 7, -16.5, 8, 7);
    addFloorAndCeiling(OX3 + 7, 4, 8, 12);
    addFloorAndCeiling(OX3 + 7, -6.5, 8, 9);
    addFloorAndCeiling(OX3 + 7, -15.5, 8, 9);
    wallAlongZ(OX3 - 3, -20, 10, [-16.5, -9.5, -2, 6]);
    wallAlongZ(OX3 + 3, -20, 10, [-15.5, -6.5, 4]);
    wallAlongX(10, OX3 - 8, OX3 + 11);
    wallAlongZ(OX3 - 8, 2, 10);
    wallAlongX(2, OX3 - 11, OX3 - 3);
    wallAlongZ(OX3 - 11, -20, 2);
    wallAlongX(-6, OX3 - 11, OX3 - 3);
    wallAlongX(-13, OX3 - 11, OX3 - 3);
    wallAlongX(-20, OX3 - 11, OX3 + 11);
    wallAlongZ(OX3 + 11, -20, 10);
    wallAlongX(-2, OX3 + 3, OX3 + 11);
    wallAlongX(-11, OX3 + 3, OX3 + 11);
    addDoor('door-stairs-3', 'ESCALIER', 'x', OX3 - 3, 6, -1, { sub: 'Étage 2' });
    addDoor('door-cellA', 'CELLULE A', 'x', OX3 - 3, -2, -1, { sub: 'Isolement' });
    addDoor('door-cellB', 'CELLULE B', 'x', OX3 - 3, -9.5, -1, { sub: 'Isolement' });
    addDoor('door-ect', 'ÉLECTROCHOCS', 'x', OX3 - 3, -16.5, -1, { sub: 'Thérapie' });
    addDoor('door-chapel', 'CHAPELLE', 'x', OX3 + 3, 4, 1);
    addDoor('door-psy', 'PSYCHIATRE', 'x', OX3 + 3, -6.5, 1, { sub: 'Dr Lenoir' });
    addDoor('door-secret', 'SALLE DES DOSSIERS', 'x', OX3 + 3, -15.5, 1, { locked: true, keyId: 'key-secret', keyName: 'Clé du Dr Lenoir (son bureau)', sub: 'Confidentiel' });
    addLight(OX3, 6, 0xe0f0e0, 5, { flicker: true });
    addLight(OX3, -5, 0xf0f0ff, 5);
    addLight(OX3, -15, 0xd0e0d0, 4, { flicker: true });
    addLight(OX3 - 5.2, 6, 0xd8e0c8, 4, { distance: 8 });
    addLight(OX3 - 7, -2, 0xf8f8f0, 4, { flicker: true });
    addLight(OX3 - 7, -9.5, 0xf8f8f0, 3, { flicker: true });
    addLight(OX3 - 7, -16.5, 0xa8c8ff, 4, { flicker: true });
    addLight(OX3 + 7, 4, 0xffc070, 5, { distance: 11 });
    addLight(OX3 + 7, -6.5, 0xffe2b0, 4);
    addLight(OX3 + 7, -15.5, 0xd0ffd0, 4, { flicker: true });
    flightX(OX3 - 3.8, 3.0, 'down', 'f2u', 'ÉTAGE 2 ↓', 'Escalier de service');
    // Padded cells: quilted cushions on the walls
    const pad = colorMat(0xdcd8c8, 1);
    for (const [cz0, cz1] of [[-5.6, 1.6], [-12.6, -6.4]]) {
      for (let row = 0; row < 5; row++) {
        for (let z = cz0 + 0.35; z < cz1; z += 0.62) addBox(0.12, 0.56, 0.56, OX3 - 10.78, 0.4 + row * 0.62, z, pad, { shadow: false });
      }
    }
    // Cell A
    hospitalBed(OX3 - 8.6, -3.2, 0, { sheetBlood: false });
    addBox(0.5, 0.15, 0.9, OX3 - 5.2, 0.075, 0.6, colorMat(0xe8e4d4, 1)); // straitjacket on the floor
    addContainer('drawer-cellA', 'Table de Chevet', 'nightstand', nightstand(OX3 - 10.4, -0.4, Math.PI / 2), coinsItem(12));
    addDecal(decalMat(Tex.getGraffitiTexture('LAISSEZ-MOI SORTIR')), 3, 0.8, OX3 - 7, 2.3, 1.84, '-z');
    // Cell B
    hospitalBed(OX3 - 8.6, -10.4, 0, { sheetBlood: true });
    addContainer('drawer-cellB', 'Table de Chevet', 'nightstand', nightstand(OX3 - 10.4, -7.0, Math.PI / 2), supply('sedative'));
    addDecal(bloodTrailMat, 3, 1, OX3 - 6, 0.006, -9.5, 'up', 1.2);
    drop(supply('alarm'), OX3 - 4.2, -12.2);
    // Electroshock room
    {
      addBox(1.0, 1.1, 0.6, OX3 - 10.4, 0.55, -18.5, colorMat(0x5a6a6a, 0.5), { collide: true });
      for (let i = 0; i < 4; i++) {
        const dial = new THREE.Mesh(track(new THREE.CircleGeometry(0.06, 12)), track(new THREE.MeshStandardMaterial({ color: 0x111111, emissive: i % 2 ? 0xff3010 : 0x30ff60, emissiveIntensity: 1.5 })));
        dial.position.set(OX3 - 9.89, 0.85, -18.8 + i * 0.2);
        dial.rotation.y = Math.PI / 2;
        sceneGroup.add(dial);
      }
      const ect = new THREE.Group();
      ect.position.set(OX3 - 7.5, 0, -17);
      addBox(0.7, 0.08, 1.9, 0, 0.75, 0, chromeMat, { parent: ect });
      addBox(0.68, 0.12, 1.85, 0, 0.84, 0, sheetMat, { parent: ect });
      for (const s of [-1, 1]) addBox(0.06, 0.05, 0.3, s * 0.3, 0.92, -0.5, colorMat(0x3a2a1a, 0.8), { parent: ect });
      sceneGroup.add(ect);
      addCollider(OX3 - 7.5, -17, 0.4, 1.0, 1);
      addContainer('cabinet-ect', 'Armoire de Soins', 'cabinet', cabinet(OX3 - 10.6, -14.2, Math.PI / 2, 1.0, 1.8, 0.45), supply('battery'));
      drop(coinsItem(10), OX3 - 5, -19.2);
    }
    // Chapel
    {
      for (let r = 0; r < 4; r++) {
        for (const s of [-1, 1]) {
          addBox(0.45, 0.45, 1.8, OX3 + 5.2 + r * 1.2, 0.225, 4 + s * 1.6, woodMat, { collide: true });
          addBox(0.08, 0.5, 1.8, OX3 + 5.0 + r * 1.2, 0.65, 4 + s * 1.6, woodMat);
        }
      }
      const altar = new THREE.Group();
      altar.position.set(OX3 + 10.2, 0, 4);
      addBox(0.9, 1.0, 2.0, 0, 0.5, 0, colorMat(0xd8d0c0, 0.7), { parent: altar });
      for (let i = 0; i < 5; i++) {
        const candle = new THREE.Mesh(track(new THREE.CylinderGeometry(0.025, 0.025, 0.2, 8)), colorMat(0xf0ead8, 0.6));
        candle.position.set(-0.2, 1.1, -0.7 + i * 0.35);
        altar.add(candle);
        const flame = new THREE.Mesh(track(new THREE.SphereGeometry(0.018, 6, 5)), track(new THREE.MeshStandardMaterial({ color: 0x220800, emissive: 0xffa040, emissiveIntensity: 4 })));
        flame.position.set(-0.2, 1.23, -0.7 + i * 0.35);
        altar.add(flame);
      }
      sceneGroup.add(altar);
      addCollider(OX3 + 10.2, 4, 0.5, 1.05, 1.1);
      addContainer('altar-chapel', 'Autel', 'desk', altar, coinsItem(25));
      addBox(0.08, 1.4, 0.12, OX3 + 10.84, 2.3, 4, woodMat); // cross
      addBox(0.08, 0.12, 0.8, OX3 + 10.84, 2.6, 4, woodMat);
      addDecal(decalMat(Tex.getGraffitiTexture('PRIEZ POUR NOUS')), 3, 0.8, OX3 + 7, 2.6, 9.84, '-z');
    }
    // Psychiatrist's office
    {
      const pdesk = new THREE.Group();
      pdesk.position.set(OX3 + 8.6, 0, -8.8);
      addBox(1.6, 0.06, 0.8, 0, 0.76, 0, woodMat, { parent: pdesk });
      addBox(0.05, 0.73, 0.75, -0.75, 0.37, 0, woodMat, { parent: pdesk });
      addBox(0.05, 0.73, 0.75, 0.75, 0.37, 0, woodMat, { parent: pdesk });
      sceneGroup.add(pdesk);
      addCollider(OX3 + 8.6, -8.8, 0.85, 0.45, 1);
      addContainer('desk-psy', 'Bureau du Dr Lenoir', 'desk', pdesk, {
        id: 'key-secret',
        name: 'Clé du Dr Lenoir',
        type: 'key',
        description: 'Une petite clé dorée. Elle ouvre la Salle des Dossiers de l\'étage 3.',
        icon: 'KeyRound',
      });
      addBox(2.2, 0.45, 0.8, OX3 + 8.6, 0.225, -2.9, colorMat(0x5a2a2a, 0.9), { collide: true }); // couch
      addBox(0.4, 2.2, 3.0, OX3 + 10.6, 1.1, -6.5, woodMat, { collide: true }); // bookcase
      papers(OX3 + 6, -7, 6, 2);
      sideTable(OX3 + 4.2, -3, supply('food'));
    }
    // Secret records room
    {
      for (const sz of [-13.5, -17.5]) addBox(5, 2.2, 0.55, OX3 + 7.5, 1.1, sz, metalMat, { collide: true });
      const jarMat = track(new THREE.MeshStandardMaterial({ color: 0x103010, emissive: 0x3aff6a, emissiveIntensity: 0.8, transparent: true, opacity: 0.75 }));
      for (let i = 0; i < 6; i++) {
        const jar = new THREE.Mesh(track(new THREE.CylinderGeometry(0.12, 0.12, 0.4, 12)), jarMat);
        jar.position.set(OX3 + 5.6 + i * 0.75, 2.4, -13.5);
        sceneGroup.add(jar);
      }
      const chest = new THREE.Group();
      chest.position.set(OX3 + 9.8, 0, -19.1);
      addBox(1.0, 0.55, 0.6, 0, 0.275, 0, woodMat, { parent: chest });
      addBox(1.04, 0.08, 0.64, 0, 0.6, 0, colorMat(0x8a6a20, 0.4), { parent: chest });
      sceneGroup.add(chest);
      addCollider(OX3 + 9.8, -19.1, 0.55, 0.35, 0.7);
      addContainer('chest-secret', 'Coffre aux Pièces', 'crate', chest, coinsItem(60));
      items.noteFloor3 = {
        id: 'note-floor3-lenoir',
        name: 'Dossier « Sujet 0 »',
        type: 'note',
        description: 'Un dossier tamponné CONFIDENTIEL.',
        lore: '« Le Sujet 0 n\'était pas malade. Il était le premier volontaire du Protocole Aurore. Quand la fièvre a commencé, nous l\'avons enfermé au sous-sol. Il a appris à ramper dans les conduits. Il nous écoute. Il nous imite. »',
        icon: 'FileCheck',
      };
      addContainer('desk-secret', 'Dossiers Confidentiels', 'cabinet', cabinet(OX3 + 4.2, -19.4, 0, 1.0, 1.8, 0.45), items.noteFloor3);
    }
    // Floor 3 navigation & its creature (difficulty 5)
    node('t8', OX3, 7);
    node('t2', OX3, -2);
    node('t9', OX3, -9.5);
    node('t16', OX3, -16.5);
    node('t4', OX3, 4);
    node('t6', OX3, -6.5);
    node('t15', OX3, -15.5);
    link('t8', 't4');
    link('t4', 't2');
    link('t2', 't6');
    link('t6', 't9');
    link('t9', 't15');
    link('t15', 't16');
    node('tA', OX3 - 6, -2.5);
    node('tB', OX3 - 5, -8.5);
    node('tE', OX3 - 5.5, -15.5);
    node('tC', OX3 + 6, 1);
    node('tP', OX3 + 6, -6.5);
    node('tS', OX3 + 5.5, -15.5);
    node('tL', OX3 - 5, 6);
    link('t2', 'tA', 'door-cellA');
    link('t9', 'tB', 'door-cellB');
    link('t16', 'tE', 'door-ect');
    link('t4', 'tC', 'door-chapel');
    link('t6', 'tP', 'door-psy');
    link('t15', 'tS', 'door-secret');
    link('t8', 'tL', 'door-stairs-3');
    extraMonsters.push({
      pos: new THREE.Vector3(OX3, 0, -12),
      route: ['t2', 'tA', 't2', 't6', 'tP', 't6', 't9', 'tB', 't9', 't15', 't16', 'tE', 't16', 't9', 't4', 'tC', 't4', 't8', 'tL', 't8'],
      minDifficulty: 5,
    });

    // ------------------------------------------------------------------
    // REALISM: stagnant water puddles (mirror the flashlight), fallen ceiling
    // tiles and hanging cables
    // ------------------------------------------------------------------
    {
      const S = 256;
      const cv = document.createElement('canvas');
      cv.width = cv.height = S;
      const g = cv.getContext('2d')!;
      g.fillStyle = '#000';
      g.fillRect(0, 0, S, S);
      // Irregular blob made of overlapping soft discs
      for (let i = 0; i < 26; i++) {
        const a = Math.random() * Math.PI * 2;
        const rr = Math.random() * S * 0.22;
        const x = S / 2 + Math.cos(a) * rr;
        const y = S / 2 + Math.sin(a) * rr * 0.7;
        const r = S * (0.08 + Math.random() * 0.14);
        const gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, 'rgba(255,255,255,1)');
        gr.addColorStop(0.7, 'rgba(255,255,255,0.9)');
        gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr;
        g.fillRect(x - r, y - r, r * 2, r * 2);
      }
      const puddleTex = track(new THREE.CanvasTexture(cv));
      const puddleMat = track(
        new THREE.MeshStandardMaterial({
          color: 0x080a0a,
          roughness: 0.04,
          metalness: 0.3,
          transparent: true,
          opacity: 0.92,
          alphaMap: puddleTex,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -3,
        })
      );
      for (const [x, z, s, r] of [
        [1.2, -6, 1.8, 0.4],
        [-1.4, -13.5, 2.4, 1.2],
        [0.9, -21.5, 1.5, 2.2],
        [-3, -33, 2.2, 0.3],
        [10.2, -24.6, 1.6, 0.9],
        [-1.8, 4.5, 1.4, 2.6],
        [OX + 0.6, -12, 2.0, 0.7],
        [OXB - 0.8, -2, 2.6, 1.1],
        [OXB + 1.2, -12.5, 2.0, 0.2],
        [OXB - 6.5, 1.8, 1.8, 1.9],
        [OXB - 7.5, -6.2, 2.2, 0.5],
        [OX3 - 0.5, -8, 1.6, 2.9],
        [-22, -5, 2.2, 0.8],
      ] as const) {
        addDecal(puddleMat, s, s * 0.75, x, 0.008, z, 'up', r);
      }

      // Ceiling tiles that came down, and cables hanging from the holes
      const tileMat = colorMat(0x8a877c, 1);
      const cableMat = colorMat(0x111111, 0.6);
      for (const [x, z, rx, rz] of [
        [-1.6, -9.5, 0.5, 0.2],
        [1.4, -17, -0.3, 0.6],
        [OX - 1.5, -5, 0.4, -0.3],
        [OXB + 1.5, 3, -0.6, 0.2],
        [OX3 + 1, -12, 0.3, 0.5],
      ] as const) {
        const tile = addBox(1.2, 0.025, 0.6, x, 0.04, z, tileMat, { shadow: false });
        tile.rotation.set(rx * 0.1, rz, rx * 0.08);
        // The hole above, and wires dangling from it
        addBox(1.2, 0.01, 0.6, x + 0.2, WALL_H - 0.006, z - 0.3, blackMat, { shadow: false });
        for (let i = 0; i < 3; i++) {
          const len = 0.6 + Math.random() * 1.0;
          const w = new THREE.Mesh(track(new THREE.CylinderGeometry(0.008, 0.008, len, 5)), cableMat);
          w.position.set(x + 0.2 + (i - 1) * 0.18, WALL_H - len / 2, z - 0.3 + (Math.random() - 0.5) * 0.3);
          w.rotation.z = (Math.random() - 0.5) * 0.25;
          sceneGroup.add(w);
        }
      }
    }

    // ==================================================================
    // CHAPTER 2 — THE SEWERS, built 160 m east (never reached in chapter 1)
    //   Start chamber x[OXS-4,OXS+4] z[4,12]   Main tunnel x[OXS-2.5,OXS+2.5] z[-34,4]
    //   West: pump room z[-8,4], workers' locker room z[-20,-8], collector z[-34,-20]
    //   East: tech room z[-8,4] (locked), settling basin z[-20,-8], sluice z[-34,-20] (crank)
    // ==================================================================
    const OXS = 160;
    const sewerBrickTex = Tex.getSewerBrickTexture();
    const brickMat = track(new THREE.MeshStandardMaterial({ map: sewerBrickTex, bumpMap: sewerBrickTex, bumpScale: 1.6, roughness: 0.78, metalness: 0.05 }));
    const sewerFloorTex = Tex.getSewerFloorTexture();
    const sewerFloorMat = track(new THREE.MeshStandardMaterial({ map: sewerFloorTex, bumpMap: sewerFloorTex, bumpScale: 0.8, roughness: 0.55, metalness: 0.05 }));
    const vaultMat = track(new THREE.MeshStandardMaterial({ map: sewerBrickTex, color: 0x9a9080, roughness: 0.85 }));
    const waterMat = track(
      new THREE.MeshStandardMaterial({ color: 0x3e4a34, roughness: 0.08, metalness: 0.2, transparent: true, opacity: 0.72, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })
    );
    const slimeMat = colorMat(0x2c3a18, 0.35);
    const sFloor = (x: number, z: number, w: number, d: number) => {
      addBox(w, 0.1, d, x, -0.05, z, sewerFloorMat, { worldUV: true, shadow: false });
      addBox(w, 0.1, d, x, WALL_H + 0.05, z, vaultMat, { shadow: false });
    };
    const sWall = (axis: 'x' | 'z', c: number, a0: number, a1: number, doors: number[] = []) => {
      let cursor = a0 - WALL_T / 2;
      const end = a1 + WALL_T / 2;
      const seg = (from: number, to: number, y: number, h: number, collide: boolean) => {
        const len = to - from;
        const mid = (from + to) / 2;
        if (axis === 'z') addBox(WALL_T, h, len, c, y, mid, brickMat, { collide, worldUV: true, shadow: false });
        else addBox(len, h, WALL_T, mid, y, c, brickMat, { collide, worldUV: true, shadow: false });
      };
      for (const d of [...doors].sort((p, q) => p - q)) {
        if (d - OPENING / 2 > cursor) seg(cursor, d - OPENING / 2, WALL_H / 2, WALL_H, true);
        seg(d - OPENING / 2, d + OPENING / 2, (WALL_H + DOOR_H) / 2, WALL_H - DOOR_H, false);
        addFrame(axis === 'z' ? 'x' : 'z', c, d, darkMetalMat);
        cursor = d + OPENING / 2;
      }
      if (end > cursor) seg(cursor, end, WALL_H / 2, WALL_H, true);
    };
    const water = (x: number, z: number, w: number, d: number) => {
      addDecal(waterMat, w, d, x, 0.025, z, 'up');
      sewerWater.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
    };
    const sewerWater: LowZone[] = [];
    const sNote = (id: string, name: string, description: string, lore: string): GameItem => ({ id, name, type: 'note', description, lore, icon: 'FileText' });

    sFloor(OXS, 8, 8, 8);
    sFloor(OXS, -15, 5, 38);
    sFloor(OXS - 6.75, -2, 8.5, 12);
    sFloor(OXS - 6.75, -14, 8.5, 12);
    sFloor(OXS - 6.75, -27, 8.5, 14);
    sFloor(OXS + 6.75, -2, 8.5, 12);
    sFloor(OXS + 6.75, -14, 8.5, 12);
    sFloor(OXS + 6.75, -27, 8.5, 14);
    // Start chamber
    sWall('x', 12, OXS - 4, OXS + 4);
    sWall('z', OXS - 4, 4, 12);
    sWall('z', OXS + 4, 4, 12);
    sWall('x', 4, OXS - 11, OXS - 4);
    sWall('x', 4, OXS + 4, OXS + 11);
    sWall('x', 4, OXS - 4, OXS + 4, [OXS]);
    // Tunnel sides and rooms
    sWall('z', OXS - 2.5, -34, 4, [-2, -14, -27]);
    sWall('z', OXS + 2.5, -34, 4, [-2, -14, -27]);
    sWall('z', OXS - 11, -34, 4);
    sWall('z', OXS + 11, -34, 4, [-27]);
    sWall('x', -34, OXS - 11, OXS + 11);
    sWall('x', -8, OXS - 11, OXS - 2.5);
    sWall('x', -20, OXS - 11, OXS - 2.5);
    sWall('x', -8, OXS + 2.5, OXS + 11);
    sWall('x', -20, OXS + 2.5, OXS + 11);
    addDoor('door-s-pump', 'SALLE DES POMPES', 'x', OXS - 2.5, -2, -1, { sub: 'Service des eaux' });
    addDoor('door-s-locker', 'VESTIAIRE', 'x', OXS - 2.5, -14, -1, { sub: 'Égoutiers' });
    addDoor('door-s-tech', 'LOCAL TECHNIQUE', 'x', OXS + 2.5, -2, 1, { locked: true, keyId: 'key-s-tech', keyName: 'Clé du local technique (Vestiaire)', sub: 'Accès réservé' });
    addDoor('door-s-basin', 'BASSIN', 'x', OXS + 2.5, -14, 1, { sub: 'Décantation' });
    addDoor('door-s-sluice', 'ÉCLUSE', 'x', OXS + 2.5, -27, 1, { locked: true, keyName: 'la manivelle de vanne', style: 'blast', sub: 'Vanne n° 3' });
    addDoor('door-s-exit', 'PLAQUE D\'ÉGOUT', 'x', OXS + 11, -27, 1, { locked: true, style: 'exit', sub: 'Sortie — Parc Saint-Aurore' });
    // The collector is a dead end with no door
    addDecal(decalMat(Tex.getGraffitiTexture('COLLECTEUR')), 2.2, 0.6, OXS - 2.66, 2.9, -27, '+x');

    // Light: few, dim, dying bulbs
    addLight(OXS, 8, 0xffd9a0, 7, { flicker: true, distance: 12 });
    addLight(OXS, -6, 0xd8e0b0, 6, { flicker: true, distance: 12 });
    addLight(OXS, -20, 0xd8e0b0, 5.5, { flicker: true, distance: 12 });
    addLight(OXS, -31, 0xff7050, 5.5, { flicker: true, distance: 11 });
    addLight(OXS - 7, -2, 0xffc890, 6, { distance: 12 });
    addLight(OXS - 7, -14, 0xd0e0ff, 5, { flicker: true, distance: 11 });
    addLight(OXS - 7, -29, 0xa0c080, 4, { flicker: true, distance: 10 });
    addLight(OXS + 7, -2, 0xffe0b0, 6, { distance: 12 });
    addLight(OXS + 7, -14, 0xa0d0b0, 5, { flicker: true, distance: 12 });
    addLight(OXS + 7, -27, 0xff5030, 6, { flicker: true, distance: 11 });

    // Water: a channel down the tunnel, the flooded collector and the basin
    water(OXS, -15, 2.2, 38);
    water(OXS - 6.75, -28, 7.8, 11);
    water(OXS + 6.75, -14, 7.8, 9);
    for (const x of [OXS - 1.15, OXS + 1.15]) addBox(0.08, 0.06, 38, x, 0.03, -15, slimeMat, { shadow: false });
    // Pipes along the vault, dripping
    for (const px of [OXS - 2.0, OXS + 2.05]) {
      const pipe = new THREE.Mesh(track(new THREE.CylinderGeometry(0.14, 0.14, 38, 12)), metalMat);
      pipe.rotation.x = Math.PI / 2;
      pipe.position.set(px, 3.05, -15);
      sceneGroup.add(pipe);
    }
    // Start chamber: the emergency staircase you came down, now blocked
    {
      for (let i = 0; i < 6; i++) addBox(2.6, 0.2, 0.4, OXS, 0.1 + i * 0.2, 11.6 - i * 0.02, concreteFloor, { shadow: false });
      for (let i = 0; i < 7; i++) {
        const r = addBox(0.5 + Math.random() * 0.6, 0.3 + Math.random() * 0.4, 0.5 + Math.random() * 0.5, OXS - 1.2 + i * 0.4, 1.3 + Math.random() * 0.4, 10.8 + Math.random() * 0.6, concreteFloor);
        r.rotation.set(Math.random(), Math.random(), Math.random());
      }
      addCollider(OXS, 11, 1.5, 1, 3);
      addDecal(decalMat(Tex.getGraffitiTexture('IL N\'A PAS D\'YEUX')), 3, 0.8, OXS + 3.84, 2.2, 8, '-x');
      addDecal(bloodTrailMat, 1.2, 3.0, OXS + 0.4, 0.012, 5.5, 'up', 0.2);
      drop(supply('battery'), OXS - 3, 9.5);
    }
    // Pump room: big rusted pumps, the first note
    {
      for (const pz of [0.5, -4.5]) {
        const pump = new THREE.Mesh(track(new THREE.CylinderGeometry(0.8, 0.9, 1.6, 20)), metalMat);
        pump.position.set(OXS - 8.4, 0.8, pz);
        pump.castShadow = true;
        sceneGroup.add(pump);
        addCollider(OXS - 8.4, pz, 0.9, 0.9, 1.6);
        addBox(0.25, 1.8, 0.25, OXS - 8.4, 2.5, pz, darkMetalMat);
      }
      locker('s-locker-pump', 'Armoire de la Salle des Pompes', OXS - 4.2, 3.55, Math.PI);
      const bench = addBox(1.6, 0.8, 0.6, OXS - 6.5, 0.4, -7.4, woodMat);
      addCollider(OXS - 6.5, -7.4, 0.8, 0.3, 0.9);
      addContainer('s-bench', 'Établi', 'desk', bench, sNote(
        'note-s-letter',
        'Lettre froissée',
        'Une lettre écrite à la hâte, tachée de boue.',
        '« Si tu lis ça, c\'est que toi aussi tu as fui par l\'escalier de secours. La seule sortie, c\'est la plaque d\'égout derrière l\'ÉCLUSE, au fond du tunnel. Il faut la MANIVELLE du LOCAL TECHNIQUE, et la clé du local est au VESTIAIRE. Marche doucement dans l\'eau. Accroupis-toi. Il ne voit rien. Il ÉCOUTE. »'
      ));
      drop(coinsItem(8), OXS - 5, -5.5);
    }
    // Workers' locker room: hiding places, the key, a report
    {
      locker('s-locker-1', 'Casier d\'égoutier', OXS - 10.55, -10.5, Math.PI / 2);
      locker('s-locker-2', 'Casier d\'égoutier', OXS - 10.55, -12, Math.PI / 2);
      locker('s-locker-3', 'Casier d\'égoutier', OXS - 10.55, -17.5, Math.PI / 2);
      addContainer('s-cab-key', 'Armoire du Contremaître', 'cabinet', cabinet(OXS - 6.5, -19.45, 0, 1.0, 1.8, 0.45), {
        id: 'key-s-tech',
        name: 'Clé du local technique',
        type: 'key',
        description: 'Une grosse clé sur un anneau rouillé. Étiquette : « TECH — ÉCLUSE ».',
        icon: 'KeyRound',
      });
      const desk = new THREE.Group();
      desk.position.set(OXS - 4.2, 0, -9);
      addBox(1.1, 0.06, 0.6, 0, 0.76, 0, woodMat, { parent: desk });
      addBox(1.05, 0.73, 0.05, 0, 0.37, 0.27, woodMat, { parent: desk });
      sceneGroup.add(desk);
      addCollider(OXS - 4.2, -9, 0.6, 0.35, 1);
      addContainer('s-desk-report', 'Bureau du Contremaître', 'desk', desk, sNote(
        'note-s-report',
        'Rapport d\'équipe — 1987',
        'Un rapport tapé à la machine, jamais envoyé.',
        '« Les gars refusent de descendre au collecteur. Il y a quelque chose là-dessous. Ça n\'a pas d\'yeux. Ça entend une goutte tomber à cinquante mètres. Martin a couru : on l\'a entendu crier une seule fois. Consigne : quand tu l\'entends respirer, tu ne bouges plus. Tu ne cours JAMAIS dans l\'eau. »'
      ));
      papers(OXS - 5.5, -13, 6, 1.5);
      drop(supply('food'), OXS - 8, -15.5);
    }
    // Collector: flooded dead end, a body and the truth about the creature
    {
      const body = new THREE.Group();
      body.position.set(OXS - 8.6, 0, -31.5);
      const bag = new THREE.Mesh(track(new THREE.CapsuleGeometry(0.22, 1.2, 4, 10)), track(new THREE.MeshStandardMaterial({ color: 0x3a4a2a, roughness: 0.8 })));
      bag.rotation.z = Math.PI / 2;
      bag.position.y = 0.22;
      body.add(bag);
      sceneGroup.add(body);
      addContainer('s-body', 'Corps d\'un égoutier', 'body', body, sNote(
        'note-s-transfer',
        'Bon de transfert — Protocole Aurore',
        'Un document officiel plastifié, encore lisible.',
        '« Sujet 07, dit « l\'Aveugle ». Échec de la phase 2 : cécité totale, hypertrophie auditive extrême. Transféré dans le réseau d\'évacuation sous l\'hôpital. Ne pas nourrir. Ne pas éclairer inutilement. NE FAIRE AUCUN BRUIT. — Dr É. Moreau »'
      ));
      addDecal(decalMat(Tex.getGraffitiTexture('CHUT')), 2, 0.8, OXS - 10.84, 2.2, -24, '+x');
      drop(coinsItem(15), OXS - 5, -32.5);
      drop(supply('medkit'), OXS - 9.8, -22);
    }
    // Tech room (locked): the crank
    {
      const toolbox = addBox(0.7, 0.35, 0.35, OXS + 9.8, 0.18, -7.3, colorMat(0xb02020, 0.5));
      addCollider(OXS + 9.8, -7.3, 0.4, 0.22, 0.4);
      addContainer('s-toolbox', 'Caisse à Outils', 'crate', toolbox, {
        id: 'item-crank',
        name: 'Manivelle de vanne',
        type: 'key',
        description: 'Une lourde manivelle en fonte. Elle ouvre l\'écluse au fond du tunnel.',
        icon: 'Wrench',
      });
      addBox(0.4, 1.4, 1.6, OXS + 10.6, 0.7, 1.5, colorMat(0x3a4a3a, 0.5), { collide: true });
      locker('s-locker-tech', 'Armoire Technique', OXS + 10.55, -3, -Math.PI / 2);
      drop(supply('sedative'), OXS + 5, 2.8);
      drop(coinsItem(10), OXS + 7, -6.5);
    }
    // Settling basin: catwalk around foul water
    {
      for (const s of [-1, 1]) addBox(7.8, 0.9, 0.05, OXS + 6.75, 0.45, -14 + s * 4.4, chromeMat, { shadow: false });
      locker('s-locker-basin', 'Casier de Maintenance', OXS + 10.55, -18.8, -Math.PI / 2);
      crate(OXS + 4, -9, 0.6, 0.3);
      crate(OXS + 4.7, -9.2, 0.45, 1.1);
      drop(coinsItem(12), OXS + 9.5, -9.4);
      drop(supply('alarm'), OXS + 3.6, -18.6);
    }
    // Sluice: the way out (opened with the crank)
    {
      addBox(0.6, 2.8, 4, OXS + 6.75, 1.4, -32.6, darkMetalMat, { collide: true });
      const wheel = new THREE.Mesh(track(new THREE.TorusGeometry(0.4, 0.05, 8, 24)), colorMat(0xa02020, 0.5));
      wheel.position.set(OXS + 6.75, 1.5, -32.25);
      sceneGroup.add(wheel);
      const ladder = new THREE.Group();
      ladder.position.set(OXS + 10.6, 0, -24.5);
      for (const s of [-1, 1]) addBox(0.05, 3.5, 0.05, 0, 1.75, s * 0.25, darkMetalMat, { parent: ladder });
      for (let i = 0; i < 11; i++) addBox(0.03, 0.03, 0.5, 0, 0.3 + i * 0.3, 0, darkMetalMat, { parent: ladder, shadow: false });
      sceneGroup.add(ladder);
      addDecal(decalMat(Tex.getGraffitiTexture('LA LUMIÈRE')), 2.4, 0.6, OXS + 10.84, 2.9, -30.5, '-x');
    }
    // Navigation for the Blind One
    node('s_start', OXS, 7);
    node('s_n', OXS, 2);
    node('s_m2', OXS, -2);
    node('s_m14', OXS, -14);
    node('s_m27', OXS, -27);
    node('s_end', OXS, -32);
    link('s_start', 's_n');
    link('s_n', 's_m2');
    link('s_m2', 's_m14');
    link('s_m14', 's_m27');
    link('s_m27', 's_end');
    node('s_pump', OXS - 6, -2.5);
    node('s_lock', OXS - 6, -14);
    node('s_coll', OXS - 6, -27);
    node('s_coll2', OXS - 8, -31);
    node('s_tech', OXS + 6, -2.5);
    node('s_basin', OXS + 6.5, -14);
    node('s_sluice', OXS + 6, -27);
    link('s_m2', 's_pump', 'door-s-pump');
    link('s_m14', 's_lock', 'door-s-locker');
    link('s_m27', 's_coll');
    link('s_coll', 's_coll2');
    link('s_m2', 's_tech', 'door-s-tech');
    link('s_m14', 's_basin', 'door-s-basin');
    link('s_m27', 's_sluice', 'door-s-sluice');
    const sewerRoute = ['s_m2', 's_pump', 's_m2', 's_m14', 's_lock', 's_m14', 's_basin', 's_m14', 's_m27', 's_coll', 's_coll2', 's_coll', 's_m27', 's_end', 's_m27', 's_m14', 's_m2', 's_n', 's_start', 's_n'];
    const sewer = {
      start: new THREE.Vector3(OXS, 1.72, 7.6),
      startYaw: 0, // facing down the tunnel (-z)
      spawns: [
        { pos: new THREE.Vector3(OXS, 0, -27), routeIdx: 9 },
        { pos: new THREE.Vector3(OXS + 6.5, 0, -14), routeIdx: 6 },
        { pos: new THREE.Vector3(OXS - 6, 0, -14), routeIdx: 4 },
      ],
      route: sewerRoute,
      water: sewerWater,
      notes: 3,
    };

    // ------------------------------------------------------------------
    // BED HIDING SPOTS: crawl in / out on the side of the bed that is free
    // ------------------------------------------------------------------
    const isFree = (px: number, pz: number, r = 0.36) =>
      !collisionBoxes.some((b) => !b.doorId && px + r > b.min.x && px - r < b.max.x && pz + r > b.min.z && pz - r < b.max.z);
    for (const bed of pendingBeds) {
      // Bed's long axis is local Z, so its sides are along local X
      const side = new THREE.Vector3(Math.cos(bed.rotY), 0, -Math.sin(bed.rotY));
      const offset = 1.0; // bed half-width 0.55 + player radius
      let dir = side;
      if (!isFree(bed.x + side.x * offset, bed.z + side.z * offset)) {
        const other = side.clone().negate();
        if (isFree(bed.x + other.x * offset, bed.z + other.z * offset)) dir = other;
      }
      hidingSpots.push({
        id: bed.id,
        name: 'Sous le lit',
        kind: 'bed',
        position: new THREE.Vector3(bed.x, 0.32, bed.z),
        viewDirection: dir.clone(),
      });
    }

    // ------------------------------------------------------------------
    // PERFORMANCE: merge every static mesh sharing a material into one
    // draw call. Interactive objects and doors stay separate.
    // ------------------------------------------------------------------
    MapBuilder.mergeStatic(sceneGroup, [...interactiveMeshes, ...[...doors.values()].map((d) => d.pivot)], track);

    const totalNotes = Object.values(items).filter((i) => i.type === 'note' || i.type === 'cassette').length;

    return {
      sceneGroup,
      collisionBoxes,
      doors,
      containers,
      lights,
      hidingSpots,
      scareTriggers,
      interactiveMeshes,
      navNodes,
      patrolRoute,
      playerStart: new THREE.Vector3(-10, 1.72, -6.2),
      playerStartYaw: -Math.PI / 2, // facing the door of room 104 (+x)
      // Spread across the floor, each starting at a different point of the patrol loop
      monsterSpawns: [
        { pos: new THREE.Vector3(0, 0, -12), routeIdx: 0 }, // main corridor
        { pos: new THREE.Vector3(8, 0, -23), routeIdx: 16 }, // morgue
        { pos: new THREE.Vector3(10.6, 0, 6), routeIdx: 11 }, // archives
        { pos: new THREE.Vector3(11, 0, -1.8), routeIdx: 3 }, // surgery
      ],
      breakerLed,
      totalNotes,
      disposables,
      upperRoute,
      upperSpawn: new THREE.Vector3(OX, 0, -9.5),
      stairs: {
        f2: { pos: new THREE.Vector3(OX - 5.2, 1.72, 5.2), yaw: -Math.PI / 2 },
        f1: { pos: new THREE.Vector3(-5.2, 1.72, 5.2), yaw: -Math.PI / 2 },
        f3: { pos: new THREE.Vector3(OX3 - 5.2, 1.72, 6), yaw: -Math.PI / 2 },
        f2u: { pos: new THREE.Vector3(OX - 4.5, 1.72, 5.0), yaw: -Math.PI / 2 },
        b: { pos: new THREE.Vector3(OXB, 1.72, 8.4), yaw: 0 },
        f1h: { pos: new THREE.Vector3(7.0, 1.72, -23.0), yaw: Math.PI / 2 },
      },
      pickups,
      extraMonsters,
      sewer,
      upperFloorX: 20,
      stairsRepair: { steps: lowerStairs.steps, rubble },
      vent: { grille, collision: ventCollision },
      lowZones,
      duct: {
        nodes: {
          E: new THREE.Vector3(-8.5, 0, 3.5),
          J: new THREE.Vector3(-14, 0, 3.5),
          C: new THREE.Vector3(-21, 0, 3.5),
          H: new THREE.Vector3(-21, 0, 0.4),
          N: new THREE.Vector3(-14, 0, 8.5),
        },
        edges: [
          ['E', 'J'],
          ['J', 'C'],
          ['C', 'H'],
          ['J', 'N'],
        ],
        nest: 'N',
      },
    };
  }
}
