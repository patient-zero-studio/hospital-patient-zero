import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { FlashlightBeam, makeFlashlightCookie } from './FlashlightBeam';

import { Chapter, ControlSettings, GameEnding, GameItem, MonsterState, Objective } from '../types';
import { sound } from '../audio/SoundSystem';
import { SMOKES } from './MonsterAI';
import { DoorObject, MapBuilder, MapData } from './MapBuilder';
import { PlayerController } from './PlayerController';
import { MonsterAI } from './MonsterAI';
import { Labyrinth } from './Labyrinth';
import { Forest, ForestNet, ForestPlayer } from './Forest';
import { SiteB, SiteNet, SitePlayer } from './SiteB';
import { Rooftop } from './Rooftop';
import { BossArena } from './BossArena';
import { DreamHouse, MEMORY_IDS } from './DreamHouse';
import { CircusTent } from './CircusTent';
import { Dungeon, BLASON_IDS, PARCH_IDS, duelPoints } from './Dungeon';
import { buildRoomDecor, roomShowKey, type RoomShow } from './RoomDecor';
import { buildPet, PET_INFO } from './RoomExtras';
import { GameState } from './GameState';
import { ProceduralTextures } from '../textures/ProceduralTextures';
import { MicListener, MicStatus } from '../audio/MicListener';
import { VoiceChat } from '../audio/VoiceChat';
import type { StatKey } from '../achievements';
import type { ChallengeId } from '../challenges';
import { Difficulty, difficultyInfo } from './Difficulty';
import { CanSystem, FlipResult } from './CanSystem';
import { RemotePlayer } from './RemotePlayer';
import { MimicBody } from './Mimic';
import { ShadeBody } from './Shade';
import { CatBody, CatPose } from './Cat';
const CAT_POSES: CatPose[] = ['sit', 'walk', 'run', 'hiss', 'scratch'];
import { lampOf } from '../lamps';
import { upgradeEffects } from '../upgrades';
import type { RunStats } from '../stars';
import type { CollisionBox, ContainerObject, FlickerLight, HidingSpot } from './MapBuilder';
import { BEASTS } from '../bestiary';
import { GALLERY_DOCS } from '../galleryDocs';
import { NoiseMarkers } from './NoiseMarkers';
import { VentCrawler, CRAWLER_STATES, CrawlerHuman } from './VentCrawler';
import { buildItemModel } from './ItemModels';
import { GamepadInput } from './Gamepad';
import type { SupplyKind } from '../economy';
import { SEASON_INFO, Season, getActiveSeason } from '../seasons';
import { buildChestModel, buildPresentModel, buildSeasonalDecor, buildTreatModel, treatSpots } from './SeasonalDecor';
import { TREATS_PER_CHEST, XMAS_PRESENTS } from '../economy';

/** Anything that can kill the player (and play the death lunge). */
type Killer = { poseLunge: (camPos: THREE.Vector3, t: number) => void; headWorld: THREE.Vector3 };
import { segmentHitsBox } from './MonsterAI';
import { Appearance, DEFAULT_APPEARANCE } from '../appearance';

/** Versus: the survivor has this long to escape. */
const VERSUS_TIME = 12 * 60;
/** 🫣 Hide-and-seek: the seeker counts, then has 3 minutes */
const HIDE_COUNT = 30;
const HIDE_TIME = 3 * 60;
import type { MonsterSenses } from './MonsterAI';
import { IMP_SAY, ImpostorGame, ImpEvent, IMP_RANGE } from './Impostor';
import { EMOTES, GameLink, GameMsg, InteractRequest, MONSTER_STATES, PlayerNetState, WorldSnapshot } from '../net/protocol';

/** Voice level above which the creature can hear you. */
export const MIC_THRESHOLD = 0.3;

const smooth01 = (x: number) => {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
};

/** Campaign: what goes with you into the next chapter. */
export interface CampaignCarry {
  inv: GameItem[];
  battery: number;
}

/** Opening shot of chapters 2-5: lines at [seconds, text], sounds at [seconds, kind]. */
interface ChapterCard {
  len: number;
  /** starting head tilt (radians, + = looking down) */
  pitch: number;
  lines: [number, string][];
  fx: [number, 'slam' | 'distant' | 'thunder' | 'lift' | 'growl'][];
}
const CHAPTER_CARDS: Record<number, ChapterCard | undefined> = {
  2: {
    len: 8,
    pitch: -0.25,
    lines: [
      [1.2, 'L\'escalier s\'effondre derrière toi dans un fracas de béton.'],
      [3.6, 'L\'eau froide monte jusqu\'aux chevilles. Quelque chose respire, plus loin.'],
      [5.8, 'Il n\'a pas d\'yeux. Il écoute.'],
    ],
    fx: [
      [0.3, 'slam'],
      [5.4, 'growl'],
    ],
  },
  3: {
    len: 8,
    pitch: 0.5,
    lines: [
      [1.2, 'Un barreau de l\'échelle cède. Tu tombes dans le noir.'],
      [3.6, 'Des couloirs de briques, à perte de vue. Tous identiques.'],
      [5.8, 'Là-haut, quelque chose commence à descendre.'],
    ],
    fx: [
      [0.3, 'slam'],
      [5.4, 'distant'],
    ],
  },
  4: {
    len: 8,
    pitch: -0.3,
    lines: [
      [1.2, 'Tu rampes hors du tuyau. La pluie. L\'air libre, enfin.'],
      [3.6, 'Au-dessus des arbres, une lumière rouge clignote : une tour radio.'],
      [5.8, 'Entre les troncs, quelque chose te regarde. Puis disparaît.'],
    ],
    fx: [
      [0.9, 'thunder'],
      [5.6, 'growl'],
    ],
  },
  5: {
    len: 8,
    pitch: 0.1,
    lines: [
      [1.2, 'Le monte-charge s\'arrête. Moins quatre-vingts mètres.'],
      [3.6, 'Site B. C\'est ici qu\'ils ont fabriqué le Patient Zéro.'],
      [5.8, 'Tout est éteint… sauf une lueur violette, au fond.'],
    ],
    fx: [
      [0.6, 'lift'],
      [5.4, 'growl'],
    ],
  },
};

/** Does segment A→B (top view) cross the rectangle? (slab test) */
function segHitsRect(ax: number, az: number, bx: number, bz: number, x0: number, z0: number, x1: number, z1: number) {
  // Ends inside the box (standing in a doorway frame…) don't count as a wall
  if ((ax > x0 && ax < x1 && az > z0 && az < z1) || (bx > x0 && bx < x1 && bz > z0 && bz < z1)) return false;
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
  return clip(-dx, ax - x0) && clip(dx, x1 - ax) && clip(-dz, az - z0) && clip(dz, z1 - az) && t0 <= t1;
}

export type MapMarkKind = 'danger' | 'item' | 'hide';
/** 🗺️ What the [M] map draws */
export interface MapSnapshot {
  minX: number;
  minZ: number;
  cell: number;
  w: number;
  h: number;
  /** 1 = explored */
  grid: Uint8Array;
  /** minX, minZ, maxX, maxZ, 1 = wall / 0 = furniture */
  walls: Float32Array;
  doors: { x: number; z: number; open: boolean; locked: boolean }[];
  marks: { x: number; z: number; kind: MapMarkKind }[];
  me: { x: number; z: number; yaw: number };
  peers: { x: number; z: number; name: string }[];
}

export interface HudSnapshot {
  /** 🎪 the Ringmaster's deal is for me: seconds left to answer */
  pact: number | null;
  /** 🔪 Imposteur mode */
  imp: {
    me: 'imp' | 'doc' | 'det' | 'crew';
    self: string;
    ph: 'night' | 'morning' | 'over';
    /** 🩺 Medic: my pick for the coming night, and who I can't pick again */
    prot: string | null;
    lastProt: string | null;
    /** 🔍 Detective: the one investigation (used = true), and its result */
    invUsed: boolean;
    inv: string | null;
    /** 🗣 this morning's talk */
    chat: string[];
    n: number;
    nights: number;
    t: number;
    cd: number;
    dead: boolean;
    alive: string[];
    voted: string | null;
    nvoted: number;
    near: boolean;
    log: string;
  } | null;
  /** 🫣 hide-and-seek: the seeker is still counting */
  hideCount: number | null;
  /** 🎡 the emote wheel is open */
  emoteWheel: boolean;
  /** 🔮 secret passage countdown */
  secretLeft: number | null;
  /** 🩸 wounded: bleeding, limping, bandage being applied (0..1) */
  wound: { bleed: boolean; limp: boolean; band: number | null } | null;
  /** 📸 photo mode */
  photo: { filter: string; help: boolean; msg: string | null } | null;
  /** 💃 victory dance on screen: no HUD */
  dancing: boolean;
  /** 👀 watching a friend's game */
  watching: boolean;
  /** ⏱️ Speedrun chrono (setting on) */
  speedrun: { time: number; best: number | null } | null;
  battery: number;
  flashlightOn: boolean;
  stamina: number;
  crouching: boolean;
  sprinting: boolean;
  hidden: boolean;
  hint: string | null;
  objective: string;
  toast: string | null;
  monsterState: MonsterState;
  monsterDistance: number;
  fear: number;
  fearFlashText: string | null;
  dying: boolean;
  /** 0..1 stress gauge: climbs fast when the creature is near, calms down slowly. */
  stress: number;
  micLevel: number;
  micStatus: MicStatus;
  /** True for a moment after the creature heard your voice. */
  micHeard: boolean;
  /** Full-screen screamer face is showing. */
  screamer: boolean;
  /** Bottle-flip charge 0..1 while B is held, else null. */
  flipCharge: number | null;
  flipMsg: string | null;
  flipBest: number;
  /** Where the player is hiding, if anywhere. */
  hideKind: 'locker' | 'bed' | null;
  /** Hotbar contents. */
  items: GameItem[];
  maxSlots: number;
  /** Multiplayer partner (null when solo). */
  partnerName: string | null;
  partnerDead: boolean;
  /** Dead online, watching the partner. */
  spectating: boolean;
  freeLook: boolean;
  /** Versus: what the local player is (null in solo / coop). */
  versusRole: 'monster' | 'survivor' | null;
  /** Versus: seconds left for the survivor. */
  timeLeft: number | null;
  /** Race mode (first one out wins). */
  race: boolean;
  /** Versus survivor: the creature is camping, [G] blinds it. */
  canBlind: boolean;
  /** Versus creature: seconds left blinded. */
  blindLeft: number;
  /** Coins found this run (banked when you get out). */
  runCoins: number;
  /** Event treats picked up this run (bonbons, œufs…) + their emoji */
  runTreats: number;
  /** 🎄 Christmas night: presents found (null = not that mode) */
  presents: number | null;
  /** 🧟 Survival: wave + seconds survived (null = not that mode) */
  survival: { wave: number; time: number } | null;
  treatEmoji: string | null;
  /** Selected hotbar slot ([X] drops it, mouse wheel changes it). */
  selectedSlot: number;
  /** Online proximity voice chat (null solo / turned off). */
  voice: { on: boolean; muted: boolean; self: boolean; partner: boolean } | null;
  /** Opening cinematic running (letterbox, no HUD) */
  intro: boolean;
  /** Thought shown in the middle of the screen */
  introText: string | null;
}

export interface EngineCallbacks {
  onHud: (s: HudSnapshot) => void;
  onGameOver: () => void;
  onVictory: (ending: GameEnding) => void;
  onPointerUnlock: () => void;
  /** Versus: the round is over (not used for the survivor's escape, which shows the ending). */
  onVersusEnd: (won: boolean, text: string, hide?: { hider: string; seconds: number }) => void;
  /** Talking to the hobo in the warehouse (opens his shop). */
  onHobo: () => void;
  /** Achievement unlocked during play (the account may already have it). */
  onAchievement?: (id: string) => void;
  /** 🧩 the code safe's keypad must open */
  onKeypad?: () => void;
  /** Progress counter for counter achievements. */
  onStat?: (key: StatKey, n: number) => void;
}

/** 2D: does the segment (ax,az)→(bx,bz) cross the box footprint? */
const segBox = (ax: number, az: number, bx: number, bz: number, b: { min: THREE.Vector3; max: THREE.Vector3 }) => {
  let t0 = 0;
  let t1 = 1;
  const dx = bx - ax;
  const dz = bz - az;
  for (const [p, d, lo, hi] of [
    [ax, dx, b.min.x, b.max.x],
    [az, dz, b.min.z, b.max.z],
  ]) {
    if (Math.abs(d) < 1e-9) {
      if (p < lo || p > hi) return false;
    } else {
      let a = (lo - p) / d;
      let c = (hi - p) / d;
      if (a > c) [a, c] = [c, a];
      t0 = Math.max(t0, a);
      t1 = Math.min(t1, c);
      if (t0 > t1) return false;
    }
  }
  return true;
};

/** Final full-screen pass: chromatic aberration, vignette, grain, colour grade, damage flash. */
const HorrorShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    time: { value: 0 },
    fear: { value: 0 },
    damage: { value: 0 },
    blackout: { value: 0 },
    resolution: { value: new THREE.Vector2(1, 1) },
    exposure: { value: 1.05 },
    monster: { value: 0 },
    pzFilter: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float time;
    uniform float fear;
    uniform float damage;
    uniform float blackout;
    uniform vec2 resolution;
    varying vec2 vUv;

    uniform float exposure;
    uniform float pzFilter;
    uniform float monster;

    // Same ACES fit as three.js, done here so we save a full-screen pass
    vec3 pzRRTAndODTFit(vec3 v) {
      vec3 a = v * (v + 0.0245786) - 0.000090537;
      vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
      return a / b;
    }
    vec3 pzAcesTonemap(vec3 color) {
      const mat3 ACESInputMat = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
      const mat3 ACESOutputMat = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
      color *= exposure / 0.6;
      color = ACESInputMat * color;
      color = pzRRTAndODTFit(color);
      color = ACESOutputMat * color;
      return clamp(color, 0.0, 1.0);
    }
    vec3 pzToSRGB(vec3 c) {
      return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
    }

    float hash(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }

    void main() {
      vec2 c = vUv - 0.5;
      float d = length(c);

      // Heartbeat pulse distorts the image when the creature is near
      float pulse = fear * (0.5 + 0.5 * sin(time * 9.0)) * 0.006;
      // Slight barrel distortion of a real wide lens
      vec2 uv = 0.5 + c * (1.0 - 0.035 * d * d) - c * pulse;

      float ab = (0.0012 + fear * 0.007 + damage * 0.02) * d;
      vec3 col;
      col.r = texture2D(tDiffuse, uv + c * ab * 2.0).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - c * ab * 2.0).b;
      col = pzToSRGB(pzAcesTonemap(col));

      // Cold, slightly desaturated grade
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(l), col, 0.8 - fear * 0.25);
      col *= vec3(0.97, 1.02, 1.0);
      col = (col - 0.5) * 1.06 + 0.5;

      // Creature's eyes: blood-red, near-monochrome vision
      float ml = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(col, vec3(ml * 1.35 + 0.03, ml * 0.32, ml * 0.26), monster * 0.88);

      // 📸 Photo mode filters: 1 black & white, 2 sepia, 3 VHS, 4 night vision
      if (pzFilter > 0.5) {
        float fl = dot(col, vec3(0.299, 0.587, 0.114));
        if (pzFilter < 1.5) col = vec3(clamp((fl - 0.5) * 1.3 + 0.5, 0.0, 1.0));
        else if (pzFilter < 2.5) col = vec3(fl * 1.07 + 0.05, fl * 0.86 + 0.03, fl * 0.62);
        else if (pzFilter < 3.5) {
          float wob = sin(vUv.y * 140.0 + time * 9.0) * 0.0015 + step(0.985, fract(vUv.y * 3.0 - time * 0.4)) * 0.006;
          vec2 vu = uv + vec2(wob, 0.0);
          vec3 v = vec3(texture2D(tDiffuse, vu + vec2(0.004, 0.0)).r, texture2D(tDiffuse, vu).g, texture2D(tDiffuse, vu - vec2(0.004, 0.0)).b);
          v = pzToSRGB(pzAcesTonemap(v));
          col = mix(col, v, 0.85) * vec3(1.05, 0.98, 1.1);
          col *= 0.9 + 0.1 * sin(vUv.y * resolution.y * 0.8);
          col = (col - 0.5) * 0.9 + 0.52;
        } else {
          col = vec3(0.12, 1.0, 0.3) * (pow(max(fl, 0.0), 0.6) * 1.5 + 0.04);
        }
      }

      // Vignette, tightening with fear
      float vig = smoothstep(0.82 - fear * 0.18, 0.2, d);
      col *= mix(0.25, 1.0, vig);
      col = mix(col, col * vec3(1.6, 0.35, 0.3), fear * (1.0 - vig) * 0.85);

      // Film grain: stronger in the shadows, like a real sensor pushed in the dark
      float lum = dot(col, vec3(0.299, 0.587, 0.114));
      float g = hash(vUv * resolution + fract(time * 13.7) * 91.0) - 0.5;
      float g2 = hash(vUv * resolution * 0.5 + fract(time * 7.3) * 53.0) - 0.5;
      col += (g * 0.7 + g2 * 0.3) * (0.03 + 0.06 * (1.0 - smoothstep(0.0, 0.5, lum)) + fear * 0.03);
      // Soft highlight bloom tint (warm halation around bright lights)
      col += max(lum - 0.75, 0.0) * vec3(0.06, 0.02, 0.0);
      // Dithering: no colour banding in the dark gradients
      col += (hash(vUv * resolution + 17.0) - 0.5) / 255.0;

      // Faint scanline flicker
      col *= 0.985 + 0.015 * sin(vUv.y * resolution.y * 1.5 + time * 30.0);

      col = mix(col, vec3(0.55, 0.0, 0.0), damage * 0.55);
      col *= 1.0 - blackout;
      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }
  `,
};

type InteractTarget =
  | { kind: 'door'; door: DoorObject }
  | { kind: 'container'; id: string }
  | { kind: 'hide'; id: string }
  | { kind: 'breaker' }
  | { kind: 'purge' }
  | { kind: 'vending' }
  | { kind: 'vent' }
  | { kind: 'repair' }
  | { kind: 'can'; mesh: THREE.Object3D }
  | { kind: 'pickup'; uid: number }
  | { kind: 'hobo' }
  | { kind: 'generator' }
  | { kind: 'stairs'; dir: 'up' | 'down'; to: string };

/** An item lying in the world (dropped, or left on a table). */
const SMOKE_ITEM: Omit<GameItem, 'id'> = { name: 'Fumigène', type: 'smoke', description: 'Un épais nuage pendant 12 s : les monstres ne vous voient plus à travers.', icon: 'CloudFog' };
const UV_ITEM: Omit<GameItem, 'id'> = {
  name: 'Lampe UV',
  type: 'uvlamp',
  description: 'Utilisez-la : votre lampe passe en lumière UV et révèle les messages cachés sur les murs… et d\'autres traces. Elle use la batterie plus vite.',
  icon: 'FlashlightUv',
};
const TALKIE_ITEM: Omit<GameItem, 'id'> = {
  name: 'Talkie-walkie',
  type: 'talkie',
  description: 'Coop : vous entendez l\'équipe partout, comme à la radio (le grésillement peut attirer les monstres). Utilisez-le pour appeler vos coéquipiers.',
  icon: 'Radio',
};
/** 🔮 Messages written in UV ink on the walls */
const UV_TEXTS = [
  'IL N\'A PAS D\'YEUX',
  'NE COURS PAS',
  'ILS IMITENT NOS VOIX',
  'PAS DANS CE CASIER',
  'LA SORTIE EST UN MENSONGE',
  'COMPTE JUSQU\'À 10',
  'J\'AI VU LE PATIENT ZÉRO',
  'LE CASIER RESPIRE',
  'ÉTEINS TA LAMPE',
  'ILS NOUS ÉCOUTENT',
];
/** 2D ray (origin, unit direction along x or z) against a box: distance or null */
const rayBox2D = (ox: number, oz: number, dx: number, dz: number, b: { min: THREE.Vector3; max: THREE.Vector3 }) => {
  let tmin = 0;
  let tmax = Infinity;
  for (const [o, d, lo, hi] of [
    [ox, dx, b.min.x, b.max.x],
    [oz, dz, b.min.z, b.max.z],
  ]) {
    if (d === 0) {
      if (o < lo || o > hi) return null;
    } else {
      const t1 = (lo - o) / d;
      const t2 = (hi - o) / d;
      tmin = Math.max(tmin, Math.min(t1, t2));
      tmax = Math.min(tmax, Math.max(t1, t2));
    }
  }
  return tmax >= tmin && tmin > 0.05 ? tmin : null;
};
type UvMark = { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; text: string | null; found: boolean };

const BANDAGE_ITEM: Omit<GameItem, 'id'> = { name: 'Bandage', type: 'bandage', description: 'Soigne une blessure : arrête le saignement et la boiterie. Restez immobile 3 s pour le poser.', icon: 'Bandage' };
const TRAP_ITEM: Omit<GameItem, 'id'> = { name: 'Piège à mâchoires', type: 'trap', description: 'Posez-le par terre : le premier monstre qui marche dessus reste bloqué 6 s.', icon: 'Cog' };

interface WorldItem {
  uid: number;
  item: GameItem;
  mesh: THREE.Group;
  /** falling animation */
  vy: number;
  restY: number;
  /** alarm clock: seconds before it rings (-1 = idle) */
  alarm: number;
  /** jaw trap put down: armed */
  trap?: boolean;
  disposables: { dispose: () => void }[];
}

export class GameEngine {
  public renderer: THREE.WebGLRenderer;
  public scene = new THREE.Scene();
  public camera: THREE.PerspectiveCamera;
  public player: PlayerController;
  /** Creatures roaming the floor (0 to 4 depending on difficulty). */
  public monsters: MonsterAI[] = [];
  /** The creature that caught the player (death sequence). */
  private killer: Killer | null = null;
  /** The creature of the air duct (difficulty 2+, not in versus). */
  private crawler: VentCrawler | null = null;
  /** Chapter 3: the endless maze and its Stalker. */
  private maze: Labyrinth | null = null;
  /** Chapter 4: the forest, the radio tower and the Beast. */
  private forest: Forest | null = null;
  /** Chapter 5: Site B, the UV ramps and the final fight. */
  /** Chapter 5 (Site B) or chapter 6 (the roof): same kind of scripted level */
  private site: SiteB | Rooftop | BossArena | DreamHouse | CircusTent | Dungeon | null = null;
  /** Battery drain before the UV lamp multiplies it. */
  private baseDrain = 1;
  /** Co-op: the forest / lab layout seed shared by both players (null = random, solo). */
  public levelSeed: number | null = null;
  /** Floor-1 staircase rebuilt with the warehouse planks. */
  private stairsBuilt = false;
  /** Duct grille pulled off. */
  private ventOpen = false;
  private ductWarned = false;
  public difficulty: Difficulty = 2;
  /** Difficulty the current world was built with. */
  public builtDifficulty: Difficulty = 2;
  /** Chapter to build on the next reset() (1 = hospital, 2 = sewers). */
  public chapter: Chapter = 1;
  public builtChapter: Chapter = 1;
  public map!: MapData;
  public state = new GameState();

  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private fx: ShaderPass;
  private dust: THREE.Points;
  private beam!: FlashlightBeam;
  private remoteBeam!: FlashlightBeam;
  private dustVel: Float32Array;
  private hemi: THREE.HemisphereLight;

  private running = false;
  private paused = false;
  private dying = false;
  private deathT = 0;
  private finished = false;
  private rafId = 0;
  private lastTime = performance.now();
  private elapsed = 0;

  private hudTimer = 0;
  private hintTimer = 0;
  private heartTimer = 0;
  private breathTimer = 0;
  private hint: string | null = null;
  private fear = 0;
  private damage = 0;
  private blackout = 0;
  private lightsOutTimer = 0;
  private fearFlashText: string | null = null;
  private fearFlashTimer = 0;
  private victoryTimer = 0;
  private pendingEnding: GameEnding | null = null;

  private listeners: [EventTarget, string, EventListener][] = [];
  private resizeObserver: ResizeObserver | null = null;

  // Multiplayer
  private net: GameLink | null = null;
  /** 👥 the other players (co-op: up to 7), in the room's order */
  private peers: { name: string; remote: RemotePlayer | null; caught: boolean; look: Appearance | null }[] = [];
  /** the peer `remote` / `remoteCaught` / `partnerLook` refer to: a message's sender, else the one you follow */
  private cur = 0;
  /** Host: the guest a personal reply (toast, coins, caught…) is meant for */
  private replyTo: string | null = null;
  private extraLights: { l: THREE.SpotLight; t: THREE.Object3D }[] = [];
  private get remote(): RemotePlayer | null {
    return this.peers[this.cur]?.remote ?? null;
  }
  private get remoteCaught() {
    return this.peers[this.cur]?.caught ?? false;
  }
  private set remoteCaught(v: boolean) {
    const q = this.peers[this.cur];
    if (q) q.caught = v;
  }
  private get partnerLook(): Appearance | null {
    return this.peers[this.cur]?.look ?? null;
  }
  private set partnerLook(v: Appearance | null) {
    const q = this.peers[this.cur];
    if (q) q.look = v;
  }
  private get peerName() {
    return this.peers[this.cur]?.name ?? this.net?.partnerName ?? 'votre partenaire';
  }
  /** Alive peers' states, with their index */
  private livePeers() {
    const out: { s: PlayerNetState; i: number; caught: boolean }[] = [];
    if (!this.net || this.partnerGone) return out;
    this.peers.forEach((q, i) => {
      const st = q.remote?.state;
      if (st) out.push({ s: st, i, caught: q.caught });
    });
    return out;
  }
  /** Flashlights of the 2nd and 3rd partners are real; beyond, a light that is never drawn */
  private peerLight(i: number) {
    while (this.extraLights.length < i) {
      const k = this.extraLights.length + 1;
      const l = new THREE.SpotLight(0xfff1dc, 0, 22, Math.PI / 6.2, 0.55, 2);
      l.castShadow = false;
      const t = new THREE.Object3D();
      l.target = t;
      if (k < 3) this.scene.add(l, t);
      this.extraLights.push({ l, t });
    }
    return this.extraLights[i - 1];
  }
  private disposePeers() {
    this.peers.forEach((q) => q.remote?.dispose());
    this.peers = [];
    this.cur = 0;
  }
  // 🔪 Imposteur
  private imp: ImpostorGame | null = null;
  private impSendT = 0;
  private impPrev = '';
  private impGhoul: MonsterAI | null = null;
  private impDone = false;
  private impMyVote: string | null = null;
  private impMyProt: string | null = null;
  private impLastProt: string | null = null;
  private impInv: string | null = null;
  /** 🗣 what was said this morning */
  private impChat: { n: number; line: string }[] = [];
  private impSayT = 0;
  private get impRole() {
    return this.imp && this.net?.selfName ? this.imp.roleOf(this.net.selfName) : 'crew';
  }
  private get amImp() {
    return !!this.imp && this.imp.impostor === this.net?.selfName;
  }
  private static PERSONAL = new Set(['toast', 'used', 'fx', 'coins', 'ach', 'caught']);
  /** Partner's flashlight: always in the scene (constant light count = no shader recompiles). */
  private remoteLight: THREE.SpotLight;
  private remoteLightTarget = new THREE.Object3D();
  private netSendTimer = 0;
  private snapTimer = 0;
  private lastNotesSent = -1;
  /** Local player died in multiplayer and now watches the partner. */
  private spectating = false;
  private partnerGone = false;
  /** Who is performing the interaction being processed on the host. */
  private actor: 'local' | 'remote' = 'local';
  /** Menu open in multiplayer (the world keeps running). */
  private menuOpen = false;

  // Versus ("Chasse": one player is the creature)
  /** The creature's body: the local player's (monster side) or the partner's (survivor side). */
  private puppet: MonsterAI | null = null;
  private markers: NoiseMarkers | null = null;
  private timeLeft = VERSUS_TIME;
  private vsOver = false;
  private pounceCooldown = 0;
  private pounceAnim = 0;
  private baseHemi = { color: new THREE.Color(), ground: new THREE.Color(), intensity: 0 };
  /** Chapter 4: sky light before the lightning is added. */
  private forestHemi = 0;

  // Customisation
  private localLook: Appearance = DEFAULT_APPEARANCE;

  /** The local player's colours (from the account). Applied from the next reset. */
  public setLocalLook(a: Appearance) {
    this.localLook = a;
    if (!this.vsRole) this.monsters.forEach((m) => m.applyLook(a.monster));
  }

  /** Apply everyone's colours to the current bodies. */
  // -----------------------------------------------------------------------
  // 💃 Victory dance: a few seconds seen from the outside
  // -----------------------------------------------------------------------
  private static DANCE_TIME = 4.2;
  private danceT = -1;
  private danceModel: RemotePlayer | null = null;
  private danceLight: THREE.PointLight | null = null;
  private danceYaw = 0;
  private canDance() {
    return !this.watchOnly && !this.survival && !this.vsRole && this.net?.mode !== 'race' && !this.player.isHidden;
  }
  private startDance() {
    const p = this.player;
    this.danceT = 0;
    p.flashlightOn = false;
    const m = new RemotePlayer('', new THREE.SpotLight(0xffffff, 0), new THREE.Object3D());
    m.showName = false;
    m.applyLook(this.localLook.human);
    m.group.visible = true;
    m.group.position.set(p.position.x, 0, p.position.z);
    // Turned towards the camera (which stands in front of the player)
    m.group.rotation.y = p.yaw + Math.PI;
    this.scene.add(m.group);
    this.danceModel = m;
    const l = new THREE.PointLight(0xffe2b0, 14, 9, 1.6);
    // Light on the camera side, so the face is lit
    l.position.set(p.position.x - Math.sin(p.yaw) * 1.4, 2.3, p.position.z - Math.cos(p.yaw) * 1.4);
    this.scene.add(l);
    this.danceLight = l;
    this.danceYaw = p.yaw;
    this.peers.forEach((q) => q.remote && (q.remote.forceHidden = false));
    this.pushHud();
  }
  private updateDance(delta: number) {
    this.danceT += delta;
    const m = this.danceModel;
    if (!m) return;
    m.dance(delta);
    // The partner dances too (if they made it out next to you)
    for (const q of this.peers) {
      const r = q.remote;
      if (r?.state && !r.state.dead && r.position.distanceTo(m.group.position) < 10) r.dance(delta);
    }
    // Camera slowly turning in front of you
    const a = this.danceYaw + Math.sin(this.danceT * 0.6) * 0.5;
    const c = m.group.position;
    this.camera.position.set(c.x - Math.sin(a) * 2.7, 1.45, c.z - Math.cos(a) * 2.7);
    this.camera.lookAt(c.x, 1.05, c.z);
    // Fade in, then fade out at the end
    const t = this.danceT;
    this.blackout = t < 0.5 ? 1 - t / 0.5 : t > GameEngine.DANCE_TIME - 0.6 ? Math.min(1, (t - (GameEngine.DANCE_TIME - 0.6)) / 0.6) : 0;
  }
  private endDance() {
    if (this.danceModel) {
      this.scene.remove(this.danceModel.group);
      this.danceModel.dispose();
    }
    if (this.danceLight) {
      this.scene.remove(this.danceLight);
      this.danceLight.dispose();
    }
    this.danceModel = null;
    this.danceLight = null;
    this.blackout = 1;
    this.danceT = -1;
    this.pushHud();
  }

  // -----------------------------------------------------------------------
  // 🎪 La Nuit du Cirque: the Ringmaster's deal and the end of the show
  // -----------------------------------------------------------------------
  private circusDone = false;
  private get mySide(): 'host' | 'guest' {
    return this.net?.role ?? 'host';
  }
  /** O / N: answer the deal (only the player who received it) */
  private answerPact(yes: boolean) {
    const s = this.site;
    if (!(s instanceof CircusTent) || s.phase !== 'morning' || s.offerTo !== this.mySide || this.finished) return;
    if (this.net?.role === 'guest') {
      this.net.send({ k: 'pact', yes });
      s.offerTo = null;
    } else s.answer(this.mySide, yes);
    this.state.showToast(yes ? '🔪 Marché conclu. Les clowns vont s\'occuper de votre « ami ».' : '🤝 Vous avez refusé. Votre partenaire n\'en saura rien.');
  }
  // -----------------------------------------------------------------------
  // 🔪 Imposteur
  // -----------------------------------------------------------------------
  private setupImp() {
    if (this.impGhoul) {
      this.scene.remove(this.impGhoul.mesh);
      this.impGhoul.dispose();
      this.impGhoul = null;
    }
    this.impDone = false;
    this.impPrev = 'night|1';
    this.impMyVote = null;
    this.impMyProt = null;
    this.impLastProt = null;
    this.impInv = null;
    this.impChat = [];
    this.impSendT = 0;
    const pl = this.net?.imp ? this.net.players : undefined;
    this.imp = pl && pl.length >= 2 ? new ImpostorGame(pl, this.levelSeed ?? 0.5) : null;
    if (!this.imp) return;
    this.queueChapterToast(
      this.amImp
        ? `🔪 VOUS ÊTES L'IMPOSTEUR. Personne ne le sait. La nuit, approchez-vous d'un joueur et appuyez sur [K] pour le tuer. Le matin, votez comme les autres… sans vous faire démasquer.`
        : `🧍 L'un de vous ${pl!.length} est un monstre déguisé. Survivez ${this.imp.nights} nuits. Chaque matin, votez pour bannir le suspect.` +
            (this.impRole === 'doc'
              ? ' 🩺 VOUS ÊTES LE MÉDECIN : chaque matin, choisissez qui protéger la nuit suivante (pas deux fois de suite le même).'
              : this.impRole === 'det'
                ? " 🔍 VOUS ÊTES LE DÉTECTIVE : une fois dans la partie, un matin, découvrez si quelqu'un est l'imposteur."
                : '')
    );
  }

  /** Where a player stands (us or a partner) */
  private impPosOf(name: string): THREE.Vector3 | null {
    if (name === this.net?.selfName) return this.player.position.clone();
    const s = this.peers.find((q) => q.name === name)?.remote?.state;
    return s ? new THREE.Vector3(s.x, 0, s.z) : null;
  }

  /** Impostor: the closest living player in reach */
  private impTarget(): string | null {
    const g = this.imp;
    if (!g) return null;
    let best: string | null = null;
    let bd = IMP_RANGE;
    for (const q of this.peers) {
      const s = q.remote?.state;
      if (!s || s.dead || g.dead.has(q.name)) continue;
      const d = Math.hypot(s.x - this.player.position.x, s.z - this.player.position.z);
      if (d < bd) {
        bd = d;
        best = q.name;
      }
    }
    return best;
  }

  private impTryKill() {
    const g = this.imp;
    if (!g || !this.net || !this.amImp || !this.running || this.spectating || this.dying || this.finished) return;
    if (g.ph !== 'night') return this.state.showToast('🌅 Il fait jour : attendez la nuit pour frapper.');
    if (g.cooldown > 0) return this.state.showToast(`🔪 Pas encore… encore ${Math.ceil(g.cooldown)} s.`);
    const t = this.impTarget();
    if (!t) return this.state.showToast('🔪 Personne à portée : approchez-vous (moins de 2,5 m).');
    if (this.net.role === 'host') this.applyImpEvents(g.kill(t));
    else this.net.send({ k: 'ikill', t });
    sound.playMonsterChaseRoar();
  }

  private impVote(target: string) {
    const g = this.imp;
    const me = this.net?.selfName;
    if (!g || !this.net || !me || g.ph !== 'morning' || this.spectating || g.dead.has(me)) return;
    this.impMyVote = target;
    if (this.net.role === 'host') {
      g.vote(me, target);
      this.impSendT = 0;
    } else this.net.send({ k: 'ivote', t: target });
    this.state.showToast(`🗳 Vous votez contre : ${target === 'skip' ? 'personne' : target}.`);
    this.pushHud();
  }

  /** 🩺 Medic: protect someone for the coming night */
  private impProtect(target: string) {
    const g = this.imp;
    const me = this.net?.selfName;
    if (!g || !this.net || !me || g.ph !== 'morning' || this.impRole !== 'doc' || this.spectating || g.dead.has(me)) return;
    if (target === this.impLastProt) return this.state.showToast('🩺 Pas deux nuits de suite la même personne.');
    this.impMyProt = target;
    if (this.net.role === 'host') g.protectFor(me, target);
    else this.net.send({ k: 'iprot', t: target });
    this.state.showToast(`🩺 Cette nuit, vous veillez sur ${target === me ? 'vous-même' : target}.`);
    this.pushHud();
  }

  /** 🗣 Morning talk: say a quick sentence to everyone */
  private impSay(i: number, target?: string) {
    const g = this.imp;
    const me = this.net?.selfName;
    const p = IMP_SAY[i];
    if (!g || !this.net || !me || !p || g.ph !== 'morning' || this.spectating || g.dead.has(me)) return;
    if (p.who && (!target || !g.isAlive(target) || target === me)) return;
    const now = performance.now();
    if (now < this.impSayT) return;
    this.impSayT = now + 1500;
    this.net.send({ k: 'isay', i, t: p.who ? target : undefined });
    this.impHear(me, i, target);
  }
  private impHear(from: string, i: number, target?: string) {
    const g = this.imp;
    const p = IMP_SAY[i];
    if (!g || !p || g.ph !== 'morning' || !g.isAlive(from)) return;
    if (p.who && (!target || !g.isAlive(target))) return;
    const text = p.text(target ?? '');
    this.impChat = [...this.impChat, { n: g.n, line: `${from} : ${text}` }].slice(-8);
    if (from !== this.net?.selfName) this.peers.find((q) => q.name === from)?.remote?.showEmote(text.length > 22 ? text.slice(0, 21) + '…' : text);
    this.pushHud();
  }

  /** 🔍 Detective: one look behind a mask, once per game */
  private impInvestigate(target: string) {
    const g = this.imp;
    const me = this.net?.selfName;
    if (!g || !me || g.ph !== 'morning' || this.impRole !== 'det' || this.impInv || this.spectating || g.dead.has(me)) return;
    const res = target === g.impostor ? `🔍 ${target} EST l'imposteur !` : `🔍 ${target} n'est pas l'imposteur.`;
    this.impInv = res;
    this.state.showToast(res);
    this.pushHud();
  }

  /** Host: carry out what the game decided. */
  private applyImpEvents(evs: ImpEvent[]) {
    const g = this.imp;
    if (!g || !this.net || !evs.length) return;
    for (const ev of evs) {
      if (ev.e === 'kill') {
        const at = this.impPosOf(g.impostor) ?? this.player.position.clone();
        if (ev.victim === this.net.selfName) this.impDie(at.x, at.z);
        else this.net.send({ k: 'imkill', x: at.x, z: at.z, to: ev.victim } as unknown as GameMsg);
      } else if (ev.e === 'saved') {
        const toV = '🩺 Quelque chose vous a frôlé dans le noir… le médecin vous a sauvé !';
        const toI = `🩺 ${ev.victim} était protégé par le médecin ! Attendez avant de retenter.`;
        if (ev.victim === this.net.selfName) this.state.showToast(toV);
        else this.net.send({ k: 'toast', msg: toV, to: ev.victim } as unknown as GameMsg);
        if (g.impostor === this.net.selfName) this.state.showToast(toI);
        else this.net.send({ k: 'toast', msg: toI, to: g.impostor } as unknown as GameMsg);
      } else if (ev.e === 'banish') {
        if (ev.victim === this.net.selfName) this.impOut();
        else this.net.send({ k: 'imout', to: ev.victim } as unknown as GameMsg);
      }
    }
    this.net.send({ k: 'imps', s: g.netState() });
    this.impSendT = 0.5;
  }

  private updateImp(delta: number) {
    const g = this.imp;
    if (!g || !this.net) return;
    if (this.net.role === 'host' && !this.impDone) {
      this.applyImpEvents(g.update(delta));
      this.impSendT -= delta;
      if (this.impSendT <= 0) {
        this.impSendT = 0.5;
        this.net.send({ k: 'imps', s: g.netState() });
      }
    } else if (g.ph !== 'over') g.t = Math.max(0, g.t - delta);
    // Mornings are bright: everyone sees everyone
    this.hemi.intensity = THREE.MathUtils.damp(this.hemi.intensity, this.baseHemi.intensity * (g.ph === 'morning' ? 5 : 1), 2, delta);
    if (this.impGhoul && !this.dying) this.impGhoul.mesh.visible = false;
    const key = `${g.ph}|${g.n}`;
    if (key === this.impPrev) return;
    this.impPrev = key;
    this.impMyVote = null;
    if (g.ph === 'night') {
      this.impLastProt = this.impMyProt;
      this.impMyProt = null;
    }
    if (g.ph === 'morning') {
      // a new morning: yesterday's talk goes (what was already said this morning stays)
      this.impChat = this.impChat.filter((c) => c.n === g.n);
      this.state.showToast(`${g.log} 🌅 Le jour se lève : votez ! Qui est l'imposteur ?`);
      document.exitPointerLock?.();
      sound.playDistantSlam(0.4);
    } else if (g.ph === 'night') {
      this.state.showToast(`🌙 Nuit ${g.n}/${g.nights}. ${g.log}`);
      sound.playDistantSlam(0.7);
    } else this.impEnd();
    this.pushHud();
  }

  /** Killed by the impostor: its true face, then the ghost view. */
  private impDie(x: number, z: number) {
    if (this.dying || this.spectating || this.finished) return;
    if (!this.impGhoul) {
      const m = new MonsterAI(new THREE.Vector3(x, 0, z), this.map.navNodes, this.map.patrolRoute, this.map.doors, () => {}, 0);
      this.scene.add(m.mesh);
      this.impGhoul = m;
    }
    const look = this.peers.find((q) => q.name === this.imp?.impostor)?.look;
    if (look) this.impGhoul.applyLook(look.monster);
    this.impGhoul.position.set(x, 0, z);
    this.impGhoul.mesh.position.set(x, 0, z);
    this.impGhoul.mesh.visible = true;
    this.startDeath(this.impGhoul);
  }

  /** Banished by the vote: you watch the rest as a ghost. */
  private impOut() {
    if (this.spectating || this.finished) return;
    this.spectating = true;
    this.player.inputEnabled = false;
    this.player.flashlightOn = false;
    this.state.showToast(this.amImp ? '🗳 Démasqué ! Les autres vous ont banni.' : '🗳 Vous avez été banni… alors que vous étiez innocent. Vous regardez la suite en fantôme.');
    this.pushHud();
  }

  private impEnd() {
    const g = this.imp;
    if (!g || this.impDone) return;
    this.impDone = true;
    const crew = g.res === 'crew';
    const me = this.amImp;
    const won = me ? !crew : crew;
    const who = g.impostor;
    const caught = g.dead.has(who);
    const left = g.crewAlive();
    const names = left.join(', ');
    const many = left.length > 1;
    let text: string;
    if (me) {
      text = won
        ? '🔪 Vous étiez l\'imposteur… et plus personne n\'est debout. Victoire du monstre !'
        : caught
          ? '🗳 Démasqué ! Les autres vous ont banni avant la fin des nuits.'
          : `🌅 Les ${g.nights} nuits sont passées : ${names} ${many ? 'vous ont' : 'vous a'} échappé.`;
    } else if (crew && g.impLeft) {
      text = `🚪 ${who} a quitté la partie… c'était l'imposteur ! Victoire des survivants.`;
    } else if (crew) {
      text = caught
        ? `🗳 ${who} était l'imposteur… et vous l'avez démasqué !`
        : `🌅 Les ${g.nights} nuits sont passées ! ${who} était l'imposteur, mais ${names} ${many ? 'ont' : 'a'} survécu.`;
    } else text = `🔪 ${who} était l'imposteur. Le monstre a eu tout le monde.`;
    if (g.doctor) text += ` 🩺 Médecin : ${g.doctor}.`;
    if (g.detective) text += ` 🔍 Détective : ${g.detective}.`;
    if (won) this.ach(me ? 'imp_win' : 'imp_crew');
    // 📊 profile counters
    this.stat('impGames');
    if (me) this.stat('impAsImp');
    if (won) {
      this.stat(me ? 'impWins' : 'crewWins');
      this.stat('impWon');
    }
    if (me && caught) this.stat('impCaught');
    this.finished = true;
    this.running = false;
    this.player.inputEnabled = false;
    sound.setHeartbeat(60, false);
    document.exitPointerLock?.();
    this.cb.onVersusEnd(won, text);
  }

  private circusCheck(s: CircusTent) {
    if (!s.result || this.circusDone) return;
    this.circusDone = true;
    // The host stops right after: send the final state now so the guest sees the end too
    if (this.net?.role === 'host') this.net.send({ k: 'snap', w: this.buildSnapshot() });
    const me = this.mySide;
    const partner = this.net?.partnerName ?? 'votre partenaire';
    let won = false;
    let text = '';
    if (s.result === 'trust') {
      won = true;
      text = `🤝 Trois nuits, aucune trahison. ${partner} et vous sortez ensemble du cirque. Le Directeur range ses contrats… pour cette fois.`;
      this.ach('circus_trust');
    } else if (s.result === 'traitor') {
      won = me === s.traitor;
      text = won
        ? `Les clowns ont attrapé ${partner}. Le Directeur tient parole : vous êtes libre… et seul.`
        : `Trahi ! ${partner} vous a livré au Directeur, et les clowns vous ont rattrapé.`;
      if (won) this.ach('circus_traitor');
    } else if (s.result === 'escaped') {
      won = me !== s.traitor;
      text = won ? `Vous avez échappé aux clowns… et à ${partner}, qui vous avait vendu.` : `${partner} s'est enfui par le rideau. Le Directeur n'aime pas les marchés ratés.`;
      if (won) this.ach('circus_escape');
    } else text = 'Les clowns ont eu raison de vous deux. Le spectacle continue sans vous.';
    this.finished = true;
    this.running = false;
    this.player.inputEnabled = false;
    sound.setHeartbeat(60, false);
    document.exitPointerLock?.();
    this.cb.onVersusEnd(won, text);
  }

  private nurseWarned = false;
  private spawnNurse(pos: THREE.Vector3, route: string[], routeIdx = 0) {
    const m = new MonsterAI(pos, this.map.navNodes, route, this.map.doors, (door) => this.setDoorOpen(door, true, true), routeIdx);
    m.makeNurse();
    if (this.lowEndGpu) m.mesh.traverse((o) => (o.castShadow = false));
    this.monsters.push(m);
    this.scene.add(m.mesh);
    return m;
  }

  /** 👩‍⚕️ Does a living player have the nurse in view right now? */
  private nurseObserved(m: MonsterAI) {
    const head = m.position.clone().setY(1.7);
    const views: { eye: THREE.Vector3; dir: THREE.Vector3 }[] = [];
    if (!this.dying && !this.spectating && !this.player.isHidden && !this.finished) {
      const dir = new THREE.Vector3();
      this.camera.getWorldDirection(dir);
      views.push({ eye: this.camera.position.clone(), dir });
    }
    for (const { s: rs, caught } of this.livePeers()) {
      if (rs.dead || rs.hid || caught) continue;
      const cp = Math.cos(rs.pitch);
      views.push({ eye: new THREE.Vector3(rs.x, 1.6, rs.z), dir: new THREE.Vector3(-Math.sin(rs.yaw) * cp, Math.sin(rs.pitch), -Math.cos(rs.yaw) * cp) });
    }
    return views.some((v) => {
      const to = head.clone().sub(v.eye);
      const d = to.length();
      if (d > 35) return false;
      if (to.normalize().dot(v.dir) < 0.7) return false;
      return m.visibleFrom(v.eye, this.map.collisionBoxes);
    });
  }

  private applyLooks() {
    const vs = this.vsRole;
    // AI creatures wear the local player's monster colours
    this.monsters.forEach((m) => m.applyLook(this.localLook.monster));
    if (this.puppet) {
      if (vs === 'monster') this.puppet.applyLook(this.localLook.monster);
      else if (this.partnerLook) this.puppet.applyLook(this.partnerLook.monster);
    }
    for (const q of this.peers) if (q.remote && q.look) q.remote.applyLook(q.look.human);
  }

  /** Versus role of the local player (null in solo / coop). */
  /** 🫣 Hide-and-seek round: seconds the seeker still counts */
  private hideCount = 0;
  private get hideSeek() {
    return this.net?.mode === 'versus' && !!this.net.hide;
  }
  private get vsRole(): 'monster' | 'survivor' | null {
    return this.net?.mode === 'versus' ? this.net.versusRole : null;
  }

  // Microphone & stress
  public mic = new MicListener();
  /** Online proximity voice chat (shares the microphone with the "the monster hears you" mechanic). */
  public voice = new VoiceChat();
  private voiceOccl = 0;
  private voiceOcclTimer = 0;
  private stress = 0;
  private micCooldown = 0;
  private micHeardTimer = 0;

  /** Only this many real point lights exist; they follow the nearest fixtures. */
  private static LIGHT_POOL = 4;
  private lightPool: THREE.PointLight[] = [];

  // Adaptive resolution
  private maxPixelRatio = 1;
  private pixelRatio = 1;
  private perfFrames = 0;
  private perfTime = 0;
  private perfCooldown = 3;
  private settings: ControlSettings;
  private softwareGl: boolean;

  constructor(private container: HTMLElement, private cb: EngineCallbacks, settings: ControlSettings) {
    this.settings = { ...settings };
    this.softwareGl = GameEngine.detectSoftwareGl();
    this.lowEndGpu = this.softwareGl || GameEngine.detectLowEndGpu();
    if (this.softwareGl) {
      this.settings.performanceMode = true;
      this.settings.shadowsEnabled = false;
    }

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = this.settings.shadowsEnabled;
    // Hardware-filtered PCF: much cheaper than PCFSoft on integrated GPUs
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.domElement.style.display = 'block';
    container.appendChild(this.renderer.domElement);

    // Scene
    this.scene.background = new THREE.Color(0x030405);
    this.scene.fog = new THREE.FogExp2(0x030405, 0.07);
    // Very faint image-based lighting: chrome, glass, wet floors and metal catch real reflections
    if (!this.softwareGl) {
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      this.scene.environmentIntensity = this.lowEndGpu ? 0.04 : 0.07;
      pmrem.dispose();
    }
    this.hemi = new THREE.HemisphereLight(0x52605c, 0x120d0a, 0.55);
    this.scene.add(this.hemi);
    this.baseHemi = { color: this.hemi.color.clone(), ground: this.hemi.groundColor.clone(), intensity: this.hemi.intensity };

    this.camera = new THREE.PerspectiveCamera(72, container.clientWidth / container.clientHeight, 0.05, 60);

    for (let i = 0; i < GameEngine.LIGHT_POOL; i++) {
      const pl = new THREE.PointLight(0xffffff, 0, 13, 2);
      pl.castShadow = false;
      this.lightPool.push(pl);
      this.scene.add(pl);
    }
    this.remoteLight = new THREE.SpotLight(0xfff1dc, 0, 22, Math.PI / 6.2, 0.55, 2);
    this.remoteLight.castShadow = false;
    this.remoteLight.target = this.remoteLightTarget;
    this.scene.add(this.remoteLight, this.remoteLightTarget);

    // Post-processing
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(container.clientWidth, container.clientHeight), 0.6, 0.55, 0.85);
    this.composer.addPass(this.bloom);
    // Tone mapping + sRGB are done inside the horror pass (one full-screen pass instead of two)
    this.fx = new ShaderPass(HorrorShader);
    this.composer.addPass(this.fx);

    // World
    this.buildWorld();
    this.player = new PlayerController(this.camera, this.map.playerStart, this.map.playerStartYaw);
    this.player.settings = this.settings;
    this.player.flashlight.castShadow = this.settings.shadowsEnabled;
    if (this.lowEndGpu) this.player.flashlight.shadow.mapSize.set(512, 512);
    this.scene.add(this.player.flashlight, this.player.flashlightTarget);
    // Real torch light pattern (hot spot + reflector ring), visible beams in the dusty air
    this.player.flashlight.map = makeFlashlightCookie();
    this.beam = new FlashlightBeam();
    this.remoteBeam = new FlashlightBeam(8);
    this.scene.add(this.beam.mesh, this.remoteBeam.mesh);

    // Dust motes floating around the player
    const DUST = 450;
    const pos = new Float32Array(DUST * 3);
    this.dustVel = new Float32Array(DUST * 3);
    for (let i = 0; i < DUST; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 14;
      pos[i * 3 + 1] = Math.random() * 3.3;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 14;
      this.dustVel[i * 3] = (Math.random() - 0.5) * 0.04;
      this.dustVel[i * 3 + 1] = (Math.random() - 0.5) * 0.02;
      this.dustVel[i * 3 + 2] = (Math.random() - 0.5) * 0.04;
    }
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.dust = new THREE.Points(
      dustGeo,
      new THREE.PointsMaterial({
        map: ProceduralTextures.getDustSprite(),
        color: 0xc8d0c0,
        size: 0.035,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    this.dust.frustumCulled = false;
    this.scene.add(this.dust);

    this.applySettings(this.settings);
    this.onResize();
    this.precompile();

    // Events
    this.listen(window, 'resize', () => this.onResize());
    // Bottle flip: hold B to charge, release to flip
    this.listen(window, 'keydown', ((e: KeyboardEvent) => {
      if (e.code === 'KeyP' && !e.repeat) {
        this.togglePhoto();
        return;
      }
      if (this.photo) {
        this.photoKeys.add(e.code);
        if (e.code === 'KeyF' && !e.repeat) {
          this.photoFilter = (this.photoFilter + 1) % GameEngine.PHOTO_FILTERS.length;
          this.pushHud();
        }
        if ((e.code === 'Enter' || e.code === 'NumpadEnter') && !e.repeat) this.photoShot = true;
        if (e.code === 'KeyH' && !e.repeat) {
          this.photoHelp = !this.photoHelp;
          this.pushHud();
        }
        e.preventDefault();
        return;
      }
      if (e.code === 'KeyB' && !e.repeat) this.startFlipCharge();
      if (e.code === 'KeyG' && !e.repeat) this.tryBlind();
      if (e.code === 'KeyX' && !e.repeat) this.dropSlot(this.selectedSlot);
      if (e.code === 'KeyV' && !e.repeat) this.toggleVoiceMute();
      if (e.code === 'KeyR' && !e.repeat) this.drawChalk();
      const em = ['Digit6', 'Digit7', 'Digit8', 'Digit9'].indexOf(e.code);
      if (em >= 0 && !e.repeat) this.sendEmote(em);
      if (e.code === 'KeyT' && !e.repeat) this.toggleEmoteWheel();
      if (e.code === 'Escape' && this.emoteWheel) this.toggleEmoteWheel(false);
      if ((e.code === 'Space' || e.code === 'Enter') && this.intro) this.skipIntro();
      if (e.code === 'KeyO' && !e.repeat) this.answerPact(true);
      if (e.code === 'KeyN' && !e.repeat) this.answerPact(false);
      if (e.code === 'KeyK' && !e.repeat) this.impTryKill();
    }) as EventListener);
    this.listen(window, 'pz-vote', ((e: CustomEvent<string>) => this.impVote(String(e.detail))) as EventListener);
    this.listen(window, 'pz-say', ((e: CustomEvent<{ i: number; t?: string }>) => this.impSay(Number(e.detail?.i), e.detail?.t)) as EventListener);
    this.listen(window, 'pz-emote', ((e: CustomEvent<number>) => this.pickEmote(Number(e.detail))) as EventListener);
    this.listen(window, 'pz-prot', ((e: CustomEvent<string>) => this.impProtect(String(e.detail))) as EventListener);
    this.listen(window, 'pz-inv', ((e: CustomEvent<string>) => this.impInvestigate(String(e.detail))) as EventListener);
    this.mic.onPcm = (s, r) => this.voice.onMic(s, r);
    // Phones keep audio asleep until a touch
    this.listen(window, 'pointerdown', (() => {
      this.mic.resume();
      if (this.intro && this.running) this.skipIntro();
    }) as EventListener);
    this.listen(window, 'keyup', ((e: KeyboardEvent) => {
      this.photoKeys.delete(e.code);
      if (e.code === 'KeyB') this.releaseFlip();
    }) as EventListener);
    // Mouse wheel: pick the hotbar slot that [X] drops
    this.listen(window, 'wheel', ((e: WheelEvent) => {
      if (this.photo) {
        this.photoCam.fov = THREE.MathUtils.clamp(this.photoCam.fov + (e.deltaY > 0 ? 4 : -4), 20, 100);
        return;
      }
      if (!this.running || this.vsRole === 'monster') return;
      this.selectedSlot = (this.selectedSlot + (e.deltaY > 0 ? 1 : 4)) % 5;
      this.pushHud();
    }) as EventListener);
    this.resizeObserver = new ResizeObserver(() => this.onResize());
    this.resizeObserver.observe(container);
    // 📸 Photo mode: the mouse moves the free camera
    this.listen(window, 'mousemove', ((e: MouseEvent) => {
      if (!this.photo || document.pointerLockElement !== this.renderer.domElement) return;
      const c = this.photoCam;
      const sens = 0.0022 * (c.fov / 72);
      c.yaw -= e.movementX * sens;
      c.pitch = THREE.MathUtils.clamp(c.pitch - e.movementY * sens, -1.5, 1.5);
    }) as EventListener);
    this.listen(document, 'pointerlockchange', () => {
      const locked = document.pointerLockElement === this.renderer.domElement;
      if (!locked && this.photo) this.togglePhoto(false);
      this.player.isLocked = locked;
      if (locked) this.player.freeLook = false;
      // The emote wheel and the Imposteur morning vote free the mouse on purpose: no pause menu over them
      const voting = !!this.imp && this.imp.ph === 'morning' && !this.spectating;
      if (!locked && this.running && !this.dying && !this.finished && !this.emoteWheel && !voting) this.cb.onPointerUnlock();
    });

    this.rafId = requestAnimationFrame(this.tick);
  }

  private static gpuName(): string | null {
    try {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return null;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const gpu = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return gpu;
    } catch {
      return '';
    }
  }

  private static detectSoftwareGl() {
    const gpu = GameEngine.gpuName();
    return gpu === null || /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  }

  /** Integrated / mobile GPUs: limited fill rate, so start lighter. */
  private static detectLowEndGpu() {
    const gpu = GameEngine.gpuName() ?? '';
    return /Intel|UHD|Iris|Mali|Adreno|PowerVR|Apple GPU|Radeon\(TM\) (Vega |R\d )?Graphics|Radeon Graphics/i.test(gpu);
  }

  public readonly lowEndGpu: boolean;

  private listen(target: EventTarget, type: string, fn: EventListener) {
    target.addEventListener(type, fn);
    this.listeners.push([target, type, fn]);
  }

  // -----------------------------------------------------------------------
  // World lifecycle
  // -----------------------------------------------------------------------
  private decor: { season: string; group: THREE.Group; disposables: { dispose: () => void }[] } | null = null;
  /** 🎄 / 🎃 Event decorations: (re)built when the event changes (menu background included). */
  public refreshSeasonDecor() {
    if (!this.map) return;
    const season = getActiveSeason();
    if ((this.decor?.season ?? null) === season) return;
    if (this.decor) {
      this.decor.group.removeFromParent();
      this.decor.disposables.forEach((d) => d.dispose());
      this.decor = null;
    }
    if (!season) return;
    try {
      const d = buildSeasonalDecor(season, this.map);
      this.map.sceneGroup.add(d.group);
      this.decor = { season, ...d };
    } catch (e) {
      console.warn('[decor]', e);
    }
  }

  private buildWorld() {
    this.map = MapBuilder.buildHospital();
    if (this.lowEndGpu) {
      // Bump mapping is ~35% of the frame on integrated GPUs
      this.map.sceneGroup.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
        if (m && 'bumpMap' in m && m.bumpMap) {
          m.bumpMap = null;
          m.needsUpdate = true;
        }
      });
    }
    this.scene.add(this.map.sceneGroup);
    this.refreshSeasonDecor();

    this.builtDifficulty = this.difficulty;
    this.builtChapter = this.chapter;
    this.builtSeason = getActiveSeason();
    this.monsters = [];
    this.crawler = null;
    if (this.chapter >= 5) this.spawnSite();
    else if (this.chapter === 4) this.spawnForest();
    else if (this.chapter === 3) this.spawnMaze();
    else if (this.chapter === 2) this.spawnSewerMonsters();
    else this.spawnHospitalMonsters();
    // Daily challenge "La Horde": one more creature
    if (this.challenge === 'horde' && this.net?.mode !== 'versus' && this.chapter <= 2) {
      const sewers = this.chapter === 2;
      const spawns = sewers ? this.map.sewer.spawns : this.map.monsterSpawns;
      const s = spawns[this.monsters.length % spawns.length];
      const m = new MonsterAI(s.pos.clone().add(new THREE.Vector3(0.8, 0, 0.8)), this.map.navNodes, sewers ? this.map.sewer.route : this.map.patrolRoute, this.map.doors, (door) => this.setDoorOpen(door, true, true), s.routeIdx);
      if (sewers) m.makeBlind();
      if (this.lowEndGpu) m.mesh.traverse((o) => (o.castShadow = false));
      this.monsters.push(m);
      this.scene.add(m.mesh);
    }
    this.spawnFouettard();
    this.finishWorld();
    this.tuneMonsters();
    this.setupMap();
  }

  /** 🔔 December: the Père Fouettard roams the hospital (chapter 1, Normal and up, solo) */
  /** event that was on when the world was built (Père Fouettard, golden gifts…) */
  public builtSeason: string | null = null;
  private spawnFouettard() {
    if (getActiveSeason() !== 'noel' || this.chapter !== 1 || this.difficulty < 2) return;
    if (this.survival || this.xmasNight || this.imp || this.vsRole || (this.net && this.net.mode !== 'coop')) return;
    const spawns = this.map.monsterSpawns;
    const s = spawns[(this.monsters.length + 1) % spawns.length];
    if (!s) return;
    const m = new MonsterAI(s.pos.clone().add(new THREE.Vector3(-0.8, 0, 0.8)), this.map.navNodes, this.map.patrolRoute, this.map.doors, (door) => this.setDoorOpen(door, true, true), s.routeIdx);
    m.setFixedLook({ skin: '#2a1e18', eyes: '#ff2a1a', gown: '#100a07', outfit: 'fouettard' }, 1.04);
    m.bells = true;
    if (this.lowEndGpu) m.mesh.traverse((o) => (o.castShadow = false));
    this.monsters.push(m);
    this.scene.add(m.mesh);
    this.queueChapterToast('🔔 Des clochettes tintent au loin… Cette nuit, le Père Fouettard rôde dans l\'hôpital. Quand tu les entends, cache-toi.');
  }

  /**
   * Daily challenge speed/size, and 🐢 a gentler chapter 1: in Normal the creature
   * is slow, half-blind and gives up quickly (a bit less so in Difficile).
   */
  private tuneMonsters() {
    const ch = this.challenge;
    const gentle = this.chapter === 1 && !this.survival && !this.vsRole && !this.imp && this.net?.mode !== 'versus' ? (this.difficulty <= 2 ? 2 : this.difficulty === 3 ? 1 : 0) : 0;
    for (const m of this.monsters) {
      m.speedMul = (ch === 'fast' ? 1.4 : 1) * (gentle === 2 ? 0.7 : gentle === 1 ? 0.85 : 1) * (m.bells ? 0.9 : 1);
      m.senseMul = gentle === 2 ? 0.75 : gentle === 1 ? 0.9 : 1;
      m.chaseGiveUp = gentle === 2 ? 3 : gentle === 1 ? 4 : 5;
      m.mesh.scale.setScalar(ch === 'giant' ? 1.35 : 1);
    }
  }

  // -----------------------------------------------------------------------
  // Opening cinematic (chapter 1): waking up strapped to the bed of room 104
  // -----------------------------------------------------------------------
  private intro: { t: number; fired: Set<string>; standPos: THREE.Vector3; standYaw: number; card?: ChapterCard } | null = null;
  private introText: string | null = null;
  private introTextTimer = 0;
  private static INTRO_LEN = 9.2;

  private introPlayed = false;
  /** Once per fresh world: chapter 1, solo or co-op. */
  public maybeIntro() {
    if (this.introPlayed) return;
    this.introPlayed = true;
    // A spectator arrives in the middle of the game: no opening shot
    if (this.watchOnly) {
      this.blackout = 0;
      return;
    }
    if (this.net && this.net.mode !== 'coop') return;
    if (this.chapter === 1 && !this.survival) this.startIntro();
    else if (CHAPTER_CARDS[this.chapter]) this.startCard(CHAPTER_CARDS[this.chapter]!);
  }

  /** Chapters 2-5: a short opening shot (black → fade in, three lines, letterbox). */
  private startCard(card: ChapterCard) {
    this.intro = { t: 0, fired: new Set(), standPos: this.player.position.clone(), standYaw: this.player.yaw, card };
    this.player.flashlightOn = false;
    this.blackout = 1;
  }

  private updateCard(delta: number) {
    const it = this.intro!;
    const card = it.card!;
    it.t += delta;
    const t = it.t;
    this.blackout = 1 - smooth01((t - 0.8) / 1.8);
    // Slow look around, settling on the way forward
    const k = smooth01(t / card.len);
    const yaw = it.standYaw + 0.45 * (1 - k) * Math.cos(t * 0.4);
    const pitch = card.pitch * (1 - k) + Math.sin(t * 0.9) * 0.015;
    const shake = this.player.shake;
    this.player.shake = Math.max(0, shake - delta * 1.5);
    this.camera.position.set(
      it.standPos.x + (Math.random() - 0.5) * shake * 0.05,
      it.standPos.y - 0.02 + Math.sin(t * 1.6) * 0.02,
      it.standPos.z + (Math.random() - 0.5) * shake * 0.05
    );
    this.camera.rotation.set(pitch, yaw, 0, 'YXZ');
    for (const [at, text] of card.lines) {
      const key = 'l' + at;
      if (t >= at && !it.fired.has(key)) {
        it.fired.add(key);
        this.say(text, 2.4);
      }
    }
    for (const [at, fx] of card.fx) {
      const key = 'f' + at;
      if (t >= at && !it.fired.has(key)) {
        it.fired.add(key);
        if (fx === 'slam') {
          sound.playDoorSlam();
          this.player.shake = 0.8;
        } else if (fx === 'distant') sound.playDistantSlam(0);
        else if (fx === 'thunder') {
          sound.playThunder(0, 1);
          this.player.shake = 0.3;
        } else if (fx === 'lift') {
          sound.playBreakerClunk();
          sound.playDoorOpen();
          this.player.shake = 0.5;
        } else if (fx === 'growl') sound.playMonsterGrowl(14, 0.4);
      }
    }
    if (t >= card.len) this.finishIntro();
  }

  private startIntro() {
    this.intro = { t: 0, fired: new Set(), standPos: this.player.position.clone(), standYaw: this.player.yaw };
    this.player.flashlightOn = false;
    this.blackout = 1;
  }

  /** [Space] / [Enter] / click / tap: skip the cinematic. */
  public skipIntro() {
    if (this.intro && this.intro.t > 0.5) this.finishIntro();
  }

  private say(text: string, seconds = 2.6) {
    this.introText = text;
    this.introTextTimer = seconds;
  }

  private updateIntro(delta: number) {
    if (this.intro?.card) {
      this.updateCard(delta);
      return;
    }
    const it = this.intro!;
    it.t += delta;
    const t = it.t;
    const once = (key: string, at: number, fn: () => void) => {
      if (t >= at && !it.fired.has(key)) {
        it.fired.add(key);
        fn();
      }
    };
    const smooth = (a: number, b: number) => smooth01((t - a) / (b - a));

    // Eyes: black, then heavy blinks, then open
    let eyes: number;
    if (t < 1.6) eyes = 1;
    else if (t < 2.4) eyes = 1 - 0.7 * smooth(1.6, 2.4);
    else if (t < 2.7) eyes = 0.3 + 0.65 * smooth(2.4, 2.7);
    else if (t < 3.3) eyes = 0.95 - 0.85 * smooth(2.7, 3.3);
    else if (t < 3.55) eyes = 0.1 + 0.8 * smooth(3.3, 3.55);
    else eyes = 0.9 * (1 - smooth(3.55, 4.1));
    this.blackout = eyes;

    // Camera: lying on the bed, staring at the ceiling → turn to the door → sit up → stand
    const bed = new THREE.Vector3(-11.2, 1.0, -9.0);
    const sit = new THREE.Vector3(-10.6, 1.25, -8.3);
    const stand = it.standPos;
    const lookYaw = Math.PI;
    let pos: THREE.Vector3;
    let yaw: number;
    let pitch: number;
    let roll = 0;
    if (t < 4.4) {
      pos = bed.clone();
      yaw = lookYaw;
      pitch = 1.3 + Math.sin(t * 0.7) * 0.03;
      roll = 0.12;
    } else if (t < 6.6) {
      pos = bed.clone();
      const k = smooth(4.4, 5.6);
      yaw = lookYaw + (it.standYaw - lookYaw) * k;
      pitch = 1.3 + (0.35 - 1.3) * k;
      roll = 0.12 * (1 - k);
    } else {
      const k1 = smooth(6.6, 7.6);
      const k2 = smooth(7.6, 8.7);
      pos = bed.clone().lerp(sit, k1).lerp(new THREE.Vector3(stand.x, 1.72, stand.z), k2);
      yaw = it.standYaw;
      pitch = 0.35 * (1 - smooth(6.6, 8.7));
    }
    const shake = this.player.shake;
    this.player.shake = Math.max(0, shake - delta * 1.5);
    this.camera.position.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * shake * 0.05, (Math.random() - 0.5) * shake * 0.05, 0));
    this.camera.rotation.set(pitch, yaw, roll, 'YXZ');

    once('heart', 0.15, () => sound.setHeartbeat(105, true));
    once('t1', 1.9, () => this.say('…Où… où suis-je ?'));
    once('breath', 2.2, () => sound.playBreath?.(0.6));
    once('t2', 3.9, () => this.say('Chambre 104. Les sangles du lit ont été arrachées.'));
    once('flicker', 4.2, () => (this.lightsOutTimer = 0.4));
    once('bang', 5.2, () => {
      sound.playDoorSlam();
      this.player.shake = 1;
      this.lightsOutTimer = 0.7;
      this.fear = Math.max(this.fear, 0.8);
      this.say('Quelque chose frappe à la porte…', 2.2);
    });
    once('growl', 5.7, () => sound.playMonsterGrowl(2.5, 0.6));
    once('bang2', 6.1, () => {
      sound.playDoorSlam();
      this.player.shake = 0.6;
    });
    once('t3', 7.4, () => this.say('Ne fais aucun bruit. Trouve la clé.', 2.8));
    // The door of room 104 rattles in its frame
    const door = this.map.doors.get('door-104');
    if (door && !door.isOpen) {
      const rattle = (t > 5.2 && t < 6.0) || (t > 6.1 && t < 6.6) ? Math.sin(t * 70) * 0.025 : 0;
      door.pivot.rotation.y = door.closedRot + rattle;
    }
    if (t >= GameEngine.INTRO_LEN) this.finishIntro();
  }

  private finishIntro() {
    const it = this.intro;
    if (!it) return;
    this.intro = null;
    this.blackout = 0;
    const door = this.map.doors.get('door-104');
    if (door && !door.isOpen) door.pivot.rotation.y = door.closedRot;
    this.player.position.set(it.standPos.x, it.standPos.y, it.standPos.z);
    this.player.yaw = it.standYaw;
    this.player.pitch = 0;
    this.player.flashlightOn = true;
    sound.setHeartbeat(60, false);
    if (!it.card && !this.introText) this.say('Ne fais aucun bruit. Trouve la clé.', 2.5);
    // The chapter's objective toast, now that you can see
    if (it.card && this.chapterToast) {
      this.state.showToast(this.chapterToast);
      this.chapterToast = null;
    }
    this.pushHud();
  }

  // -----------------------------------------------------------------------
  // Campaign: what you take from one chapter to the next
  // -----------------------------------------------------------------------
  /** Consumables and the torch battery (keys and chapter tools stay behind). */
  public campaignCarry(): CampaignCarry {
    const keep = new Set(['battery', 'food', 'sedative', 'medkit', 'throwable', 'alarm', 'bandage']);
    return {
      inv: this.state.inventory.filter((i) => keep.has(i.type)).map((i) => ({ ...i, id: `cp-${i.type}-${Math.random().toString(36).slice(2, 8)}` })),
      battery: Math.max(25, Math.round(this.player.flashlightBattery)),
    };
  }

  /** Right after reset(): start this chapter with what you carried. */
  public applyCampaignCarry(c: CampaignCarry | null) {
    if (!c) return;
    this.state.inventory = c.inv.slice(0, this.state.maxInventorySlots).map((i) => ({ ...i }));
    this.player.flashlightBattery = c.battery;
    this.pushHud();
  }

  /** Chapters 2-5: shown at the end of the opening shot (or 1.2 s in, without one). */
  private chapterToast: string | null = null;
  private queueChapterToast(msg: string) {
    this.chapterToast = msg;
    setTimeout(() => {
      // No opening shot (versus / race): show it now
      if (this.chapterToast === msg && !this.intro && this.running && !this.finished) {
        this.state.showToast(msg);
        this.chapterToast = null;
      }
    }, 1200);
  }

  /** Daily challenge switched on for this run (solo only). */
  public challenge: ChallengeId | null = null;
  /** 👀 Watching a friend's game: no body, no input, nothing sent */
  public watchOnly = false;
  /** ⏱️ Personal bests, "chapter-difficulty" → seconds (set by the app) */
  public speedBests: Record<string, number> = {};
  /** Seconds played this run (escape time for the leaderboard). */
  public get runTime() {
    return this.run.time;
  }

  /** Chapter 3, [R]: a chalk arrow on the floor so you know where you've been. */
  public drawChalk() {
    const p = this.player;
    if ((this.site instanceof SiteB || this.site instanceof BossArena) && this.running && !this.paused && !this.dying && !this.finished && !this.intro) {
      const on = this.site.toggleUV();
      if (on && !p.flashlightOn && p.flashlightBattery > 0) p.flashlightOn = true;
      sound.playFlashlightToggle(on);
      this.state.showToast(on ? '🟣 Lampe UV : elle le brûle (visez-le), mais la batterie fond 6× plus vite.' : 'Lampe normale.');
      this.pushHud();
      return;
    }
    if (!this.maze || !this.running || this.paused || this.dying || this.finished || this.pendingEnding || this.intro || p.isHidden) return;
    if (!this.maze.chalk(p.position, p.yaw)) this.state.showToast('Plus de craie… Fiez-vous à votre mémoire.');
    else if (this.maze.chalkLeft === 39) this.state.showToast('Flèche à la craie tracée. Si vous la revoyez, c\'est que vous tournez en rond.');
    this.pushHud();
  }

  /** Chapter 3: the endless maze, 400 m east; the Stalker is always there (solo only). */
  private spawnMaze() {
    if (this.player) this.player.lowZones = this.map.lowZones;
    this.stairsBuilt = true;
    this.ventOpen = false;
    this.ductWarned = true;
    this.maze = new Labyrinth(this.map, this.scene, this.difficulty);
    const s = this.maze.stalker;
    if (s) {
      if (this.lowEndGpu) s.mesh.traverse((o) => (o.castShadow = false));
      this.monsters.push(s);
    }
  }

  /** Chapter 4: the forest, 600 m south; the Beast hunts by sight (solo only). */
  private spawnForest() {
    if (this.player) this.player.lowZones = this.map.lowZones;
    this.stairsBuilt = true;
    this.ventOpen = false;
    this.ductWarned = true;
    this.forest = new Forest(this.map, this.scene, this.difficulty, this.lowEndGpu, (msg) => this.shout(msg), this.levelSeed ?? Math.random());
    this.forest.guest = this.net?.role === 'guest';
    this.forest.localToast = (msg) => this.state?.showToast(msg);
    const s = this.forest.stalker;
    if (s) this.monsters.push(s);
  }

  /** Chapter 5: Site B, 400 m west (solo only). */
  private spawnSite() {
    if (this.player) this.player.lowZones = this.map.lowZones;
    this.stairsBuilt = true;
    this.ventOpen = false;
    this.ductWarned = true;
    if (this.chapter === 10) {
      this.site = new Dungeon(this.map, this.scene, this.difficulty, this.lowEndGpu, (msg) => this.shout(msg), this.levelSeed ?? Math.random());
      this.site.onTrap = () => this.ach('king_herse');
      // ⚔️ two players in the Dungeon: a duel for the blasons and scrolls
      this.site.duel = this.net?.mode === 'coop';
      this.site.guest = this.net?.role === 'guest';
      if (this.site.stalker) this.monsters.push(this.site.stalker);
      return;
    }
    if (this.chapter === 9) {
      this.site = new CircusTent(this.map, this.scene, this.difficulty, this.lowEndGpu, (msg) => this.shout(msg), this.levelSeed ?? Math.random());
      this.site.guest = this.net?.role === 'guest';
      this.monsters.push(...this.site.clowns);
      return;
    }
    if (this.chapter === 8) {
      this.site = new DreamHouse(this.map, this.scene, this.difficulty, this.lowEndGpu, (msg) => this.shout(msg), this.levelSeed ?? Math.random());
      this.site.guest = this.net?.role === 'guest';
      if (this.site.stalker) this.monsters.push(this.site.stalker);
      return;
    }
    if (this.chapter === 7) {
      this.site = new BossArena(this.map, this.scene, this.difficulty, this.lowEndGpu, (msg) => this.shout(msg), this.levelSeed ?? Math.random());
      this.site.guest = this.net?.role === 'guest';
      if (this.site.stalker) this.monsters.push(this.site.stalker);
      return;
    }
    if (this.chapter === 6) {
      this.site = new Rooftop(this.map, this.scene, this.difficulty, this.lowEndGpu, (msg) => this.shout(msg), this.levelSeed ?? Math.random());
      this.site.guest = this.net?.role === 'guest';
      if (this.site.stalker) this.monsters.push(this.site.stalker);
      return;
    }
    const ids = ['note-b-dossier', 'note-b-journal', 'note-b-dessin'];
    this.site = new SiteB(
      this.map,
      this.scene,
      this.difficulty,
      this.lowEndGpu,
      (msg) => this.shout(msg),
      () => ids.every((id) => this.state.notesCollected.some((n) => n.id === id)),
      this.levelSeed ?? Math.random()
    );
    this.site.guest = this.net?.role === 'guest';
    const s = this.site.stalker;
    if (s) this.monsters.push(s);
  }

  /** Chapter 2: the Blind Ones (one per difficulty step, none in Exploration or versus). */
  private spawnSewerMonsters() {
    const sw = this.map.sewer;
    if (this.player) this.player.lowZones = this.map.lowZones;
    this.stairsBuilt = true;
    this.ventOpen = false;
    this.ductWarned = true;
    if (this.net?.mode === 'versus') return;
    const count = Math.min([0, 0, 1, 1, 2, 3][this.difficulty] ?? 1, sw.spawns.length);
    for (let i = 0; i < count; i++) {
      const s = sw.spawns[i];
      const m = new MonsterAI(s.pos, this.map.navNodes, sw.route, this.map.doors, (door) => this.setDoorOpen(door, true, true), s.routeIdx);
      m.makeBlind();
      if (this.lowEndGpu && count > 1) m.mesh.traverse((o) => (o.castShadow = false));
      this.monsters.push(m);
      this.scene.add(m.mesh);
    }
  }

  private spawnHospitalMonsters() {
    // Versus: the creature is a player, no AI ones
    const count = this.net?.mode === 'versus' ? 0 : Math.min(difficultyInfo(this.difficulty).monsters, this.map.monsterSpawns.length);
    for (let i = 0; i < count; i++) {
      const spawn = this.map.monsterSpawns[i];
      const m = new MonsterAI(
        spawn.pos,
        this.map.navNodes,
        this.map.patrolRoute,
        this.map.doors,
        (door) => this.setDoorOpen(door, true, true),
        spawn.routeIdx
      );
      // Many creatures on an integrated GPU: only the big body parts cast shadows
      if (this.lowEndGpu && count > 1) m.mesh.traverse((o) => (o.castShadow = false));
      this.monsters.push(m);
      this.scene.add(m.mesh);
    }
    // Difficulty 3+: one more creature haunts floor 2 (never in versus)
    if (this.net?.mode !== 'versus' && this.difficulty >= 3) {
      const up = new MonsterAI(this.map.upperSpawn, this.map.navNodes, this.map.upperRoute, this.map.doors, (door) =>
        this.setDoorOpen(door, true, true)
      );
      if (this.lowEndGpu) up.mesh.traverse((o) => (o.castShadow = false));
      this.monsters.push(up);
      this.scene.add(up.mesh);
    }
    // 👩‍⚕️ Difficulty 3+: the Nurse walks the ground floor
    if (this.net?.mode !== 'versus' && this.difficulty >= 3 && this.map.monsterSpawns.length) {
      const s = this.map.monsterSpawns[this.map.monsterSpawns.length - 1];
      this.spawnNurse(s.pos.clone().add(new THREE.Vector3(-1.2, 0, 1.2)), this.map.patrolRoute, s.routeIdx);
    }
    // The Crawler lives in the air duct (never in Exploration nor versus)
    this.crawler = null;
    if (this.net?.mode !== 'versus' && this.difficulty >= 2) {
      this.crawler = new VentCrawler(this.map.duct);
      this.scene.add(this.crawler.mesh);
    }
    if (this.player) this.player.lowZones = this.map.lowZones;
    this.stairsBuilt = false;
    this.ventOpen = false;
    this.ductWarned = false;
    // Basement (difficulty 4+) and floor 3 (difficulty 5) have their own creature
    if (this.net?.mode !== 'versus') {
      for (const ex of this.map.extraMonsters) {
        if (this.difficulty < ex.minDifficulty) continue;
        const m = new MonsterAI(ex.pos, this.map.navNodes, ex.route, this.map.doors, (door) => this.setDoorOpen(door, true, true));
        if (this.lowEndGpu) m.mesh.traverse((o) => (o.castShadow = false));
        this.monsters.push(m);
        this.scene.add(m.mesh);
      }
    }
  }

  private finishWorld() {
    this.killer = null;
    this.state = new GameState(this.chapter);
    // + the two VHS tapes (archives, director's office)
    if (this.chapter === 1) this.state.totalNotes = this.map.totalNotes + 2;
    // Items lying around (same order everywhere = same ids for host and guest)
    this.worldItems = [];
    this.worldUid = 0;
    this.worldVersion++;
    this.lastWorldSent = -1;
    this.selectedSlot = 0;
    for (const p of this.map.pickups) this.spawnWorldItem(p.item, p.pos, p.rotY, false);
    if (this.maze) for (const n of [...this.maze.noteDrops, ...this.maze.supplyDrops()]) this.spawnWorldItem(n.item, n.pos, Math.random() * Math.PI, false);
    if (this.forest) for (const n of [...this.forest.noteDrops, ...this.forest.supplyDrops()]) this.spawnWorldItem(n.item, n.pos, Math.random() * Math.PI, false);
    if (this.site) for (const n of [...this.site.noteDrops, ...this.site.supplyDrops()]) this.spawnWorldItem(n.item, n.pos, Math.random() * Math.PI, false);
    this.clearSmokes();
    this.spawnGadgets();
    this.setupUv();
    this.setupSecret();
    this.setupMimic();
    this.setupShade();
    this.setupCat();
    this.setupPuzzle();

    // Cans live inside the level group so interactions can raycast them
    this.cans = new CanSystem(this.map.sceneGroup, {
      onNoise: (pos, loud) => this.alertAll(pos, loud),
      onFlip: (r, owner) => {
        // Host: the guest's flip result goes back to them
        if (owner === 'remote') this.net?.send({ k: 'fx', name: 'flipResult', result: r });
        else this.onFlipResult(r, owner);
      },
    });
    this.flipCharging = false;
    this.flipStreak = 0;
    this.flipMsg = null;
  }

  private destroyWorld() {
    this.maze?.dispose();
    this.maze = null;
    this.forest?.dispose();
    this.forest = null;
    this.site?.dispose();
    this.site = null;
    this.cans.dispose();
    this.scene.remove(this.map.sceneGroup);
    this.map.disposables.forEach((d) => d.dispose());
    this.decor?.disposables.forEach((d) => d.dispose());
    this.decor = null;
    this.clearTreats();
    for (const m of this.monsters) {
      this.scene.remove(m.mesh);
      m.dispose();
    }
    this.monsters = [];
    for (const w of this.worldItems) w.disposables.forEach((d) => d.dispose());
    this.worldItems = [];
    if (this.crawler) {
      this.scene.remove(this.crawler.mesh);
      this.crawler.dispose();
      this.crawler = null;
    }
    this.state.dispose();
  }

  /** Changes difficulty; the hospital is rebuilt on the next reset. */
  public setDifficulty(d: Difficulty) {
    this.difficulty = d;
  }

  // -----------------------------------------------------------------------
  // Vending machine, cans & bottle flip
  // -----------------------------------------------------------------------
  private cans!: CanSystem;
  private canCounter = 0;
  private vendCooldown = 0;
  private flipCharging = false;
  private flipT = 0;
  private flipStreak = 0;
  private flipBest = 0;
  private flipMsg: string | null = null;
  private flipMsgTimer = 0;

  private makeCan(): GameItem {
    this.canCounter++;
    return {
      id: `can-${this.canCounter}`,
      name: 'Canette de ZÉRO Cola',
      type: 'throwable',
      description: 'Lancez-la pour faire diversion… ou tentez un bottle flip (maintenir B).',
      icon: 'CupSoda',
    };
  }

  /** Charge goes 0 → 1 → 0 … while B is held: timing is everything. */
  private get flipPower() {
    const x = (this.flipT / 1.15) % 2;
    return 1 - Math.abs(x - 1);
  }

  private canInHand() {
    return this.state.inventory.find((i) => i.type === 'throwable');
  }

  private canAct() {
    return (
      this.running &&
      !this.paused &&
      !this.dying &&
      !this.finished &&
      !this.pendingEnding &&
      this.player.inputEnabled &&
      !this.player.isHidden &&
      this.vsRole !== 'monster' // the creature carries nothing
    );
  }

  private startFlipCharge() {
    if (!this.canAct()) return;
    if (!this.canInHand()) {
      this.state.showToast('Il vous faut une canette pour un bottle flip (distributeur du couloir).');
      return;
    }
    this.flipCharging = true;
    this.flipT = 0;
  }

  private releaseFlip() {
    if (!this.flipCharging) return;
    this.flipCharging = false;
    const item = this.canInHand();
    if (!item || !this.canAct()) return;
    if (this.net?.role === 'guest') {
      // The host throws it for us (shared physics)
      this.net.send({ k: 'flip', power: this.flipPower });
      return;
    }
    this.state.removeItem(item.id);
    const p = this.player;
    const fwd = new THREE.Vector3(-Math.sin(p.yaw), 0, -Math.cos(p.yaw));
    const from = this.camera.position.clone().addScaledVector(fwd, 0.35);
    from.y = Math.max(0.5, this.camera.position.y - 0.5);
    this.cans.flip(from, p.yaw, this.flipPower);
    this.pushHud();
  }

  private throwCan(item: GameItem) {
    this.tut.cans++;
    this.state.removeItem(item.id);
    const p = this.player;
    const fwd = new THREE.Vector3(-Math.sin(p.yaw), 0, -Math.cos(p.yaw));
    const from = this.camera.position.clone().addScaledVector(fwd, 0.3);
    from.y -= 0.15;
    this.cans.throw(from, p.yaw, p.pitch);
    sound.playPaperRustle();
  }

  private onFlipResult(r: FlipResult, _owner: 'local' | 'remote' = 'local') {
    if (r === 'fail') {
      this.flipStreak = 0;
      this.flipMsg = 'Raté…';
      this.flipMsgTimer = 1.2;
      return;
    }
    this.flipStreak++;
    this.stat('flips');
    this.flipBest = Math.max(this.flipBest, this.flipStreak);
    this.flipMsg = `${r === 'double' ? 'DOUBLE FLIP !!' : 'FLIP RÉUSSI !'}${this.flipStreak > 1 ? `  x${this.flipStreak}` : ''}`;
    this.flipMsgTimer = 2;
    sound.playFlipSuccess(r === 'double');
  }

  // -----------------------------------------------------------------------
  // Screamer (morgue corpse)
  // -----------------------------------------------------------------------
  private screamerDone = false;
  private screamerTimer = 0;
  private screamerT = 0;
  private screamerBody: THREE.Object3D | null = null;
  private screamerBase = { y: 0, rx: 0 };

  /** `mine`: this player searched the body (full-screen face). Otherwise you only hear the shriek. */
  private triggerScreamer(body: THREE.Object3D, mine = true) {
    this.screamerDone = true;
    this.screamerT = 0;
    this.screamerBody = body;
    this.screamerBase = { y: body.position.y, rx: body.rotation.x };
    sound.playScreamer();
    if (mine) {
      this.ach('screamer');
      this.screamerTimer = 0.9;
      this.player.shake = 1;
      this.damage = 0.8;
      this.lightsOutTimer = 1.4;
      this.fear = 1;
      this.stress = 1;
    } else {
      this.player.shake = Math.max(this.player.shake, 0.35);
      this.stress = Math.max(this.stress, 0.6);
    }
    // The shriek echoes through the whole floor
    const origin = new THREE.Vector3();
    body.getWorldPosition(origin);
    // 80 m (≈ 44 m through walls): reaches every room of the floor (host decides)
    if (this.net?.role !== 'guest') this.alertAll(origin, 80);
    setTimeout(() => {
      if (!this.dying && this.running) {
        this.state.showToast(
          this.monsters.length === 0
            ? 'Le cri résonne dans tout l\'étage… puis plus rien.'
            : 'Le cri a résonné dans tout l\'étage… Quelque chose arrive. Cachez-vous !'
        );
      }
    }, 1000);
  }

  /** Corpse jerks up, then stays sitting, twitching. */
  private updateScreamer(delta: number) {
    if (this.screamerTimer > 0) this.screamerTimer -= delta;
    const b = this.screamerBody;
    if (!b) return;
    this.screamerT += delta;
    const k = Math.min(1, this.screamerT / 0.18); // violent, 180 ms
    b.position.y = this.screamerBase.y + 0.18 * k;
    b.rotation.x = this.screamerBase.rx + 0.55 * k + (Math.random() - 0.5) * (this.screamerT < 2 ? 0.12 : 0.02);
    b.rotation.z = (Math.random() - 0.5) * (this.screamerT < 2 ? 0.1 : 0.015);
  }

  /** Where the player stands up after leaving a hiding spot. */
  private hideExit(spot: { kind: 'locker' | 'bed'; position: THREE.Vector3; viewDirection: THREE.Vector3 }) {
    return spot.position.clone().addScaledVector(spot.viewDirection, spot.kind === 'bed' ? 1.0 : 0.85);
  }

  /** The creature closest to the player (null in Exploration mode). */
  private nearestMonster(): { m: MonsterAI; dist: number } | null {
    let best: { m: MonsterAI; dist: number } | null = null;
    // Versus: the partner's creature counts too (for fear, stress, heartbeat)
    const all = this.vsRole === 'survivor' && this.puppet ? [...this.monsters, this.puppet] : this.monsters;
    for (const m of all) {
      const dist = this.player.position.distanceTo(m.position);
      if (!best || dist < best.dist) best = { m, dist };
    }
    return best;
  }

  /** A noise every creature may hear (on a guest, the host decides). */
  private waterWarned = false;
  private inSewerWater(p: THREE.Vector3) {
    return this.map.sewer.water.some((w) => p.x > w.minX && p.x < w.maxX && p.z > w.minZ && p.z < w.maxZ);
  }

  private alertAll(origin: THREE.Vector3, loudness: number, fromHiding = false) {
    // Versus: noises are what the creature player "sees"
    const vs = this.vsRole;
    if (vs === 'monster') {
      this.markers?.add(origin, loudness);
      return;
    }
    if (vs === 'survivor') {
      this.net?.send({ k: 'noise', x: origin.x, z: origin.z, loud: loudness, hid: fromHiding });
      return;
    }
    if (this.net?.role === 'guest') {
      this.net.send({ k: 'noise', x: origin.x, z: origin.z, loud: loudness, hid: fromHiding });
      return;
    }
    this.maze?.hear(origin, loudness);
    this.forest?.hear(origin, loudness);
    this.site?.hear(origin, loudness);
    for (const m of this.monsters) if (m !== this.maze?.stalker && m !== this.forest?.stalker && m !== this.site?.stalker)m.alertNoise(origin, loudness, this.map.collisionBoxes, fromHiding);
  }

  /** Full restart: rebuilds the hospital, the creature and the inventory. */
  public reset() {
    this.destroyWorld();
    this.buildWorld();
    this.run = { time: 0, light: 0, hid: false, chased: false, voiced: false, crawler: 'LURK', dist: 0, lx: NaN, lz: NaN, hides: 0, wasHid: false, hits: 0, chases: 0, inChase: false, sprinted: false, catT: 0, uv: 0 };
    this.waterWarned = false;
    // Online, the guest wakes up a little further in room 104 (not inside the host)
    const sewers = this.chapter === 2;
    const base = sewers ? this.map.sewer.start : this.map.playerStart;
    // 👥 3+ players: each guest a little apart
    const seat = this.net?.role === 'guest' ? Math.max(1, this.net.seat ?? 1) : 0;
    const SEATS: [number, number][] = [[0, 0], [1.4, 1.0], [0.7, -0.6], [1.4, -0.2], [0.2, 1.0], [0.7, 0.4], [-0.4, 0.4], [1.0, -1.2]];
    const [sx, sz] = SEATS[seat % SEATS.length];
    const start = seat ? base.clone().add(sewers ? new THREE.Vector3(sx, 0, -sz - 0.2) : new THREE.Vector3(sx, 0, sz)) : base;
    if (this.maze) this.player.reset(this.maze.start.clone(), this.maze.startYaw);
    else if (this.forest || this.site) {
      const lv = (this.forest ?? this.site)!;
      // Co-op: the guest stands a little to the side
      const off = seat ? new THREE.Vector3(seat === 1 ? 1.4 : sx, 0, seat === 1 ? 0 : sz) : new THREE.Vector3();
      this.player.reset(lv.start.clone().add(off), lv.startYaw);
    } else this.player.reset(start, sewers ? this.map.sewer.startYaw : this.map.playerStartYaw);
    this.applyRoomDecor();
    this.applyPet();
    this.chapterToast = null;
    if (this.site instanceof CircusTent)
      this.queueChapterToast(
        '🎪 LA NUIT DU CIRQUE. Survivez ensemble à 3 nuits sous le chapiteau. Mais chaque matin, le Directeur écrit en secret à l\'un de vous : « Livre-moi ton ami… et tu sortiras libre. »'
      );
    else if (this.site instanceof Dungeon)
      this.queueChapterToast(
        this.difficulty >= 2
          ? '⚔️ CHAPITRE 10 — LE DONJON. Une crypte oubliée sous Saint-Aurore. Retrouvez les 3 blasons du royaume, puis baissez le pont-levis. Le Patient Zéro dort ici, dans une armure… et la lumière ne lui fait plus peur. Les herses [E] peuvent le bloquer.'
          : '⚔️ CHAPITRE 10 — LE DONJON (Exploration). Retrouvez les 3 blasons du royaume, puis baissez le pont-levis.'
      );
    else if (this.site instanceof DreamHouse)
      this.queueChapterToast(
        this.difficulty >= 2
          ? 'CHAPITRE SECRET — LE RÊVE DE LUCAS. Sa maison d\'enfance, comme il s\'en souvient. Retrouvez ses 5 souvenirs, puis sortez par le portail du jardin. Une ombre vous suit… elle ne bouge que quand personne ne la regarde.'
          : 'CHAPITRE SECRET — LE RÊVE DE LUCAS (Exploration). Retrouvez ses 5 souvenirs, puis sortez par le portail du jardin.'
      );
    else if (this.site instanceof BossArena)
      this.queueChapterToast(
        this.difficulty >= 2
          ? 'CHAPITRE 7 — LE CŒUR. Le vrai Patient Zéro, c\'est lui : le Dr Moreau s\'est injecté la souche d\'origine. [R] passe votre lampe en UV : brûlez-le, survivez à ses 3 phases… puis injectez l\'antidote [E].'
          : 'CHAPITRE 7 — LE CŒUR (Exploration). Le Dr Moreau dort au centre de la salle. Lisez ses notes, puis injectez-lui l\'antidote [E].'
      );
    else if (this.site instanceof Rooftop)
      this.queueChapterToast(
        this.site.stalker
          ? 'CHAPITRE 6 — LE TOIT. La tempête cache vos pas… mais chaque éclair vous montre à lui. Réparez les 3 relais radio, allumez la balise de l\'héliport, puis tenez jusqu\'à l\'hélicoptère.'
          : 'CHAPITRE 6 — LE TOIT (Exploration). Réparez les 3 relais radio, allumez la balise de l\'héliport et attendez l\'hélicoptère. Rien ne rôde… cette fois.'
      );
    else if (this.site)
      this.queueChapterToast(
        this.site.stalker
          ? 'CHAPITRE 5 — LE SITE B. Chargez les 3 rampes UV (archives, réacteur, câblage), puis lancez la purge au centre. [R] passe votre lampe en UV : ça le brûle… et vide la batterie.'
          : 'CHAPITRE 5 — LE SITE B (Exploration). Chargez les 3 rampes UV puis lancez la purge au centre. [R] lampe UV. Il ne viendra pas… cette fois.'
      );
    if (this.forest)
      this.queueChapterToast(
        this.forest.stalker
          ? 'CHAPITRE 4 — LA FORÊT. Rejoignez la tour radio (lumière rouge) et appelez les secours. Quelque chose rôde entre les arbres : elle chasse À LA VUE. Votre lampe se voit de loin.'
          : 'CHAPITRE 4 — LA FORÊT (Exploration). Rejoignez la tour radio (lumière rouge) et appelez les secours. Rien ne rôde… cette fois.'
      );
    if (this.maze)
      this.queueChapterToast(
        this.maze.stalker
          ? 'CHAPITRE 3 — LE DÉDALE. Ouvrez 3 vannes (écoutez les tuyaux qui tintent). [R] trace une flèche à la craie. Quelque chose descend derrière vous… Ne vous arrêtez pas.'
          : 'CHAPITRE 3 — LE DÉDALE (Exploration). Ouvrez 3 vannes (écoutez les tuyaux qui tintent). [R] trace une flèche à la craie. Rien ne vous suit… cette fois.'
      );
    if (sewers) this.queueChapterToast('CHAPITRE 2 — LES ÉGOUTS. L\'escalier s\'est effondré derrière vous. Quelque chose respire dans le noir… Il n\'a pas d\'yeux : il ÉCOUTE.');
    this.player.lowZones = this.map.lowZones;
    this.spawnTreats();
    this.tut = { cans: 0, interacts: 0 };
    // Daily challenge modifiers
    const ch = this.challenge;
    this.player.batteryDrainMul = ch === 'dim' ? 3 : ch === 'dive' ? 2 : 1;
    this.baseDrain = this.player.batteryDrainMul;
    this.player.flashlight.color.setHex(this.lampHex());
    this.player.noSprint = ch === 'nosprint';
    if (ch === 'pack3') this.state.maxInventorySlots = 3;
    // Mutators
    this.player.invertStrafe = ch === 'inverted';
    if (ch === 'nolamp') this.player.flashlightBattery = 15;
    (this.scene.fog as THREE.FogExp2).density = ch === 'fog' ? 0.22 : 0.07;
    this.tuneMonsters();
    this.precompile();
    this.stress = 0;
    this.micHeardTimer = 0;
    this.screamerDone = false;
    this.screamerTimer = 0;
    this.screamerBody = null;
    this.stairsFade = 0;
    this.dying = false;
    this.finished = false;
    this.deathT = 0;
    this.damage = 0;
    this.fear = 0;
    this.blackout = 0;
    this.lightsOutTimer = 0;
    this.endOutage(true);
    this.revT = 100 + Math.random() * 60;
    this.fogEvt = 0;
    this.resetWounds();
    this.setupMap();
    this.hintT = 0;
    this.hintLevel = 0;
    this.hintSig = '';
    this.fearFlashText = null;
    this.pendingEnding = null;
    this.hint = null;
    // Multiplayer state (a spectator only ever watches)
    this.spectating = this.watchOnly;
    this.nurseWarned = false;
    this.circusDone = false;
    if (this.danceT >= 0) this.endDance();
    this.danceT = -1;
    this.partnerGone = false;
    this.menuOpen = false;
    this.lastNotesSent = -1;
    const looks = new Map(this.peers.map((q) => [q.name, q.look]));
    this.disposePeers();
    if (this.net) {
      const names = this.net.peers?.length ? this.net.peers : [this.net.partnerName];
      names.forEach((name, i) => {
        const lt = i === 0 ? { l: this.remoteLight, t: this.remoteLightTarget } : this.peerLight(i);
        const r = new RemotePlayer(name, lt.l, lt.t);
        // Player vs player: no name above the opponent's head
        r.showName = this.net!.mode === 'coop';
        this.scene.add(r.group);
        this.peers.push({ name, remote: r, caught: false, look: looks.get(name) ?? null });
      });
    }
    this.setupVersus();
    this.setupRace();
    this.setupImp();
    this.applyLooks();
    if (this.net) {
      // Tell the partner what we look like (twice, in case their game wasn't ready yet)
      const send = () => this.net?.send({ k: 'look', a: this.localLook });
      send();
      setTimeout(send, 1500);
    }
    sound.setHeartbeat(60, false);
    // Chapter 1 opens with the wake-up cinematic (started by maybeIntro when the run begins)
    this.intro = null;
    this.introText = null;
    this.introPlayed = false;
    this.pushHud();
  }

  // -----------------------------------------------------------------------
  // Versus ("Chasse")
  // -----------------------------------------------------------------------
  private setupVersus() {
    if (this.puppet) {
      this.scene.remove(this.puppet.mesh);
      this.puppet.dispose();
      this.puppet = null;
    }
    this.markers?.dispose();
    this.markers = null;
    this.vsOver = false;
    this.timeLeft = this.hideSeek ? HIDE_TIME : VERSUS_TIME;
    this.hideCount = this.hideSeek ? HIDE_COUNT : 0;
    if (this.hideSeek)
      this.queueChapterToast(
        this.vsRole === 'monster'
          ? '🫣 CACHE-CACHE — Vous cherchez. Comptez jusqu\'à 30 les yeux fermés… puis trouvez-le en 3 minutes : fouillez les casiers et les lits [E], ou touchez-le.'
          : '🫣 CACHE-CACHE — Vous vous cachez ! Vous avez 30 secondes : casier, lit, recoin sombre… Il aura ensuite 3 minutes pour vous trouver.'
      );
    this.pounceCooldown = 0;
    this.pounceAnim = 0;
    this.monsterStunTimer = 0;
    this.campTimer = 0;
    this.blindCooldown = 0;
    this.blindTimer = 0;
    this.blindPath = [];
    this.campWarned = false;
    this.player.setMonsterMode(false);
    this.hemi.color.copy(this.baseHemi.color);
    this.hemi.groundColor.copy(this.baseHemi.ground);
    this.hemi.intensity = this.baseHemi.intensity;
    // Sewers: no windows, no white paint… a bit more fill light so the torch reveals the bricks
    if (this.chapter === 10) {
      // The crypt: torchlight on old stones
      this.hemi.intensity = this.baseHemi.intensity * 3.2;
      this.hemi.color.set(0x9a7a5a);
      this.hemi.groundColor.set(0x120a06);
    } else if (this.chapter === 9) {
      // Under the big top at night: warm bulbs, deep shadows
      this.hemi.intensity = this.baseHemi.intensity * 2.4;
      this.hemi.color.set(0xb08a6a);
      this.hemi.groundColor.set(0x1a0a08);
    } else if (this.chapter === 8) {
      // A dream at dusk: soft purple light
      this.hemi.intensity = this.baseHemi.intensity * 2.2;
      this.hemi.color.set(0x9a80c0);
      this.hemi.groundColor.set(0x2a1a20);
    } else if (this.chapter === 7) {
      // The core: dark, cold, a little green from the cuve
      this.hemi.intensity = this.baseHemi.intensity * 3.4;
      this.hemi.color.set(0x6a8a7a);
      this.hemi.groundColor.set(0x100808);
    } else if (this.chapter === 6) {
      // Storm clouds over the city
      this.hemi.intensity = this.baseHemi.intensity * 4.5;
      this.hemi.color.set(0x5a6a8a);
      this.hemi.groundColor.set(0x101418);
    } else if (this.chapter === 5) {
      // Clinical concrete under red emergency lights
      this.hemi.intensity = this.baseHemi.intensity * 3.5;
      this.hemi.color.set(0x8a8494);
    } else if (this.chapter === 4) {
      // Moonlight through rain clouds
      this.hemi.intensity = this.baseHemi.intensity * 5;
      this.hemi.color.set(0x6a7a9a);
      this.hemi.groundColor.set(0x141812);
    } else if (this.chapter >= 2) {
      this.hemi.intensity = this.baseHemi.intensity * 2.3;
      this.hemi.color.set(0x6a7a62);
    }
    this.forestHemi = this.hemi.intensity;

    const role = this.vsRole;
    if (!role) return;
    const sewers = this.chapter === 2;
    const spawn = sewers ? this.map.sewer.spawns[0] : this.map.monsterSpawns[0];
    this.puppet = new MonsterAI(spawn.pos, this.map.navNodes, sewers ? this.map.sewer.route : this.map.patrolRoute, this.map.doors, () => {}, 0);
    if (sewers) this.puppet.makeBlind();
    this.scene.add(this.puppet.mesh);

    if (role === 'monster') {
      // You are Patient Zero: start in the corridor, the survivor is locked in room 104
      this.player.reset(new THREE.Vector3(spawn.pos.x, 1.72, spawn.pos.z), Math.PI);
      this.player.setMonsterMode(true);
      // Faint red glow on our own body so we can see it from behind in the dark
      this.puppet.mesh.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
        if (m && 'emissive' in m && m.emissive.getHex() === 0) {
          m.emissive.setHex(0x2a0a08);
          m.emissiveIntensity = 1;
        }
      });
      this.markers = new NoiseMarkers(this.scene);
      // Dim red "night vision" so the creature can find its way
      this.hemi.color.setHex(0x8a3a30);
      this.hemi.groundColor.setHex(0x200806);
      this.hemi.intensity = 1.5;
      this.state.objectives.forEach((o) => (o.isCurrent = false));
    } else if (this.remote) {
      // The partner is drawn as the creature, not as a human
      this.remote.forceHidden = true;
    }
  }

  /** Who is acting right now is the creature (host-side check for guest requests too). */
  private actorIsMonster() {
    const r = this.vsRole;
    if (!r) return false;
    return this.actor === 'local' ? r === 'monster' : r === 'survivor';
  }

  private updateVersus(delta: number) {
    const role = this.vsRole;
    const puppet = this.puppet;
    if (!role || !puppet) return;
    const p = this.player;
    const right = new THREE.Vector3(Math.cos(p.yaw), 0, -Math.sin(p.yaw));
    const listener = { pos: p.position, right };
    this.markers?.update(delta);
    this.pounceCooldown = Math.max(0, this.pounceCooldown - delta);
    this.pounceAnim = Math.max(0, this.pounceAnim - delta);

    if (role === 'monster') {
      // Sedated: frozen until the drug wears off
      if (this.monsterStunTimer > 0) {
        this.monsterStunTimer = Math.max(0, this.monsterStunTimer - delta);
        this.player.inputEnabled = false;
        if (this.monsterStunTimer === 0) {
          this.player.inputEnabled = !this.menuOpen && this.blindTimer <= 0;
          this.state.showToast('Le sédatif ne fait plus effet. Reprenez la traque !');
        }
      }
      const speed = Math.hypot(p.velocity.x, p.velocity.z);
      const st =
        this.monsterStunTimer > 0 ? 'STUNNED' : this.pounceAnim > 0 ? 'CHASE' : p.isSprinting ? 'INVESTIGATE' : 'PATROL';
      this.updateBlind(delta);
      puppet.netApply(p.position.x, p.position.z, p.yaw + Math.PI, st, this.blindTimer > 0 ? 2.6 : speed);
      puppet.netUpdate(delta, listener);
      this.thirdPersonCamera();
    } else {
      const s = this.remote?.state;
      if (s) {
        const st = s.st ? 'STUNNED' : s.sp ? 'INVESTIGATE' : 'PATROL';
        puppet.netApply(s.x, s.z, s.yaw + Math.PI, st, this.remote!.speed);
      }
      if (!(this.dying && this.killer === puppet)) puppet.netUpdate(delta, listener);
      this.updateCampWatch(delta, puppet, !!s?.st);
    }

    // 🫣 Hide-and-seek: the seeker counts to 30 with the eyes closed
    if (this.hideSeek && this.hideCount > 0) {
      this.hideCount = Math.max(0, this.hideCount - delta);
      if (this.vsRole === 'monster') {
        this.player.inputEnabled = false;
        this.blackout = 1;
      }
      if (this.hideCount <= 0) {
        if (this.vsRole === 'monster') {
          this.player.inputEnabled = true;
          this.blackout = 0;
          sound.playMonsterChaseRoar();
          this.state.showToast('« Prêt ou pas… j\'arrive ! » Trouvez-le en 3 minutes.');
        } else this.state.showToast('⏱️ Il a fini de compter… Ne faites plus un bruit.');
      }
      return;
    }
    // The host keeps the clock
    if (this.net?.role === 'host' && !this.vsOver && !this.pendingEnding) {
      this.timeLeft = Math.max(0, this.timeLeft - delta);
      // Hide-and-seek: still hidden when the time is up → the hider wins
      if (this.timeLeft <= 0) this.versusEnd(this.hideSeek ? 'survivor' : 'monster', 'timeout', undefined, true);
    }
  }

  /** Over-the-shoulder camera behind the creature, pulled in when a wall is in the way. */
  private thirdPersonCamera() {
    const p = this.player;
    const head = new THREE.Vector3(p.position.x, 2.05, p.position.z);
    const back = new THREE.Vector3(Math.sin(p.yaw), 0, Math.cos(p.yaw));
    const want = 2.4;
    let dist = want;
    for (let d = 0.3; d <= want; d += 0.1) {
      const q = head.clone().addScaledVector(back, d);
      const hit = this.map.collisionBoxes.some(
        (b) => !b.disabled && b.max.y > 1.5 && q.x > b.min.x - 0.15 && q.x < b.max.x + 0.15 && q.z > b.min.z - 0.15 && q.z < b.max.z + 0.15
      );
      if (hit) {
        dist = Math.max(0.25, d - 0.25);
        break;
      }
    }
    const cosP = Math.cos(p.pitch);
    const cam = this.camera.position;
    cam.copy(head).addScaledVector(back, dist * cosP);
    cam.y = THREE.MathUtils.clamp(head.y + 0.35 - Math.sin(p.pitch) * dist, 0.4, 3.3);
  }

  /** Creature side: is the survivor right in front of us and catchable? */
  private survivorInReach(): boolean {
    const s = this.remote?.state;
    if (!s || s.dead || s.hid) return false;
    const p = this.player;
    const to = new THREE.Vector3(s.x - p.position.x, 0, s.z - p.position.z);
    const d = to.length();
    if (d > 1.9) return false;
    const fwd = new THREE.Vector3(-Math.sin(p.yaw), 0, -Math.cos(p.yaw));
    if (d > 0.6 && to.normalize().dot(fwd) < 0.2) return false;
    return !this.map.collisionBoxes.some(
      (b) => !b.disabled && b.max.y > 1.3 && segmentHitsBox(p.position.x, p.position.z, s.x, s.z, b, -0.02)
    );
  }

  private pounce() {
    if (this.pounceCooldown > 0) return;
    this.pounceCooldown = 1.5;
    this.pounceAnim = 1.2;
    this.player.shake = 0.6;
    this.net?.send({ k: 'pounce' });
  }

  /** Creature side interaction: catch, search a hiding spot, open / close doors. */
  private monsterInteract() {
    if (this.monsterStunTimer > 0 || this.blindTimer > 0) return; // sedated / blinded
    if (this.survivorInReach()) {
      this.pounce();
      return;
    }
    const t = this.findTarget();
    if (!t) return;
    const gs = this.state;
    switch (t.kind) {
      case 'door': {
        if (t.door.isLocked) {
          sound.playDoorLocked();
          gs.showToast('Verrouillée. Vos griffes glissent sur le métal…');
          return;
        }
        if (this.net?.role === 'guest') this.net.send({ k: 'act', req: { kind: 'door', id: t.door.id } });
        else this.setDoorOpen(t.door, !t.door.isOpen);
        break;
      }
      case 'stairs':
        this.useStairs(t.to);
        break;
      case 'hide': {
        const s = this.remote?.state;
        if (s && s.hid && !s.dead && s.hs === t.id) {
          this.pounce(); // found you
        } else {
          sound.playDoorOpen();
          gs.showToast('Vide… L\'odeur est pourtant là.');
        }
        break;
      }
      default:
        gs.showToast('Le Patient Zéro ne s\'intéresse pas à ça. Il chasse.');
    }
  }

  /**
   * Ends a versus round. `cause`: caught | escape | timeout | forfeit.
   * `broadcast`: also tell the other player.
   */
  private versusEnd(winner: 'monster' | 'survivor', cause: string, ending: GameEnding | undefined, broadcast: boolean) {
    if (this.vsOver) return;
    this.vsOver = true;
    if (broadcast) this.net?.send({ k: 'vsEnd', winner, reason: cause, ending, left: this.timeLeft });
    const me = this.vsRole;
    const iWon = winner === me;
    const partner = this.net?.partnerName ?? 'votre adversaire';
    if (iWon && cause !== 'forfeit') this.ach(me === 'monster' ? 'vs_monster' : 'vs_survivor');
    if (iWon && ending) {
      // Survivor escaped: play the real ending
      this.pendingEnding = ending;
      this.victoryTimer = 1.2;
      this.player.inputEnabled = false;
      return;
    }
    let text: string;
    if (this.hideSeek) {
      const secs = Math.round(HIDE_TIME - this.timeLeft);
      const t = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
      if (cause === 'caught') text = me === 'monster' ? `Trouvé ! ${partner} est resté caché ${t}.` : `${partner} vous a trouvé après ${t}.`;
      else if (cause === 'timeout') text = me === 'monster' ? `${partner} est resté introuvable pendant 3 minutes !` : 'Introuvable ! Vous avez tenu les 3 minutes.';
      else text = `${partner} a quitté la partie.`;
      this.finished = true;
      this.running = false;
      this.player.inputEnabled = false;
      sound.setHeartbeat(60, false);
      document.exitPointerLock?.();
      const hider = me === 'monster' ? partner : (this.net?.selfName ?? 'vous');
      this.cb.onVersusEnd(iWon, text, cause === 'forfeit' ? undefined : { hider, seconds: cause === 'timeout' ? HIDE_TIME : secs });
      return;
    }
    if (cause === 'caught') text = me === 'monster' ? `Vous avez dévoré ${partner} !` : `Le Patient Zéro (${partner}) a mis fin à votre fuite.`;
    else if (cause === 'escape') text = me === 'monster' ? `Le survivant (${partner}) a quitté l'hôpital.` : 'Vous avez réussi à fuir !';
    else if (cause === 'timeout')
      text = me === 'monster' ? `Le temps est écoulé : ${partner} ne quittera jamais Saint-Aurore.` : 'Le temps est écoulé… l\'hôpital vous a englouti.';
    else text = `${partner} a quitté la partie.`;
    this.finished = true;
    this.running = false;
    this.player.inputEnabled = false;
    sound.setHeartbeat(60, false);
    document.exitPointerLock?.();
    this.cb.onVersusEnd(iWon, text);
  }

  // -----------------------------------------------------------------------
  // Multiplayer
  // -----------------------------------------------------------------------
  /** Connects the engine to a partner (or back to solo with null). Call before reset(). */
  public setNet(link: GameLink | null) {
    this.net?.setHandler(null);
    this.net = link;
    this.disposePeers(); // the (new) partners will send their looks
    if (link) {
      // Host: personal replies carry who they are for (several guests read the same stream)
      const raw = link.send;
      link.send = (m: GameMsg) => raw(this.replyTo && GameEngine.PERSONAL.has(m.k) && !("to" in m) ? ({ ...m, to: this.replyTo } as unknown as GameMsg) : m);
    }
    link?.setHandler((msg, from) => this.onNetMsg(msg, from));
    this.voice.attach(link);
    this.voice.enabled = this.settings.voiceChat !== false;
  }

  public get isOnline() {
    return !!this.net;
  }

  /** Partner left the room. */
  public partnerLeft(name?: string) {
    if (!this.net) return;
    // 👥 One of several partners left: the game goes on with the others
    const i = name ? this.peers.findIndex((q) => q.name === name) : -1;
    if (this.imp && name && this.net.role === 'host') this.applyImpEvents(this.imp.leave(name));
    if (this.peers.length > 1 && i >= 0) {
      this.peers[i].remote?.dispose();
      this.peers.splice(i, 1);
      this.cur = 0;
      this.state.showToast(`${name} a quitté la partie.`);
      if (this.spectating && !this.partnerAlive()) this.endGameOver();
      return;
    }
    const who = name ?? this.net.partnerName;
    this.partnerGone = true;
    this.disposePeers();
    this.voice.update(0, 0, 0, 1000);
    this.state.showToast(`${who} a quitté la partie.`);
    // Race: the rival gave up
    if (this.net.mode === 'race' && !this.vsOver && !this.pendingEnding) {
      this.vsOver = true;
      this.finished = true;
      this.running = false;
      this.player.inputEnabled = false;
      document.exitPointerLock?.();
      this.cb.onVersusEnd(true, `Votre rival (${who}) a abandonné la course.`);
      return;
    }
    // Versus: the one who stays wins by forfeit
    const me = this.vsRole;
    if (me) {
      this.versusEnd(me, 'forfeit', undefined, false);
      return;
    }
    if (this.spectating) this.endGameOver();
  }

  private partnerAlive() {
    return !this.partnerGone && this.peers.some((q) => !!q.remote?.state && !q.remote.state.dead);
  }

  private localNetState(): PlayerNetState {
    const p = this.player;
    const r = (v: number) => Math.round(v * 100) / 100;
    return {
      x: r(p.position.x),
      y: r(this.camera.position.y),
      z: r(p.position.z),
      yaw: r(p.yaw),
      pitch: r(p.pitch),
      fl: p.flashlightOn,
      cr: p.isCrouching,
      hid: p.isHidden,
      vis: r(p.visibility),
      dead: this.dying || this.spectating || (this.finished && !this.vsRole),
      sp: p.isSprinting,
      hs: p.isHidden ? (p.currentHidingSpotId ?? '') : '',
      st: this.monsterStunTimer > 0,
      uv: this.site?.uv || undefined,
      fe: this.fear > 0.05 ? Math.round(this.fear * 10) / 10 : undefined,
      wd: this.wounded || undefined,
    };
  }

  private buildSnapshot(): WorldSnapshot {
    const r = (v: number) => Math.round(v * 100) / 100;
    const w: WorldSnapshot = {
      monsters: this.monsters.map((m) => [r(m.position.x), r(m.position.z), r(m.mesh.rotation.y), MONSTER_STATES.indexOf(m.state), r(m.currentSpeed)]),
      doors: [...this.map.doors.values()].map((d) => [d.id, d.isOpen, d.isLocked]),
      containers: [...this.map.containers.values()].map((c) => [c.id, c.searched, !!c.locked]),
      power: this.state.powerRestored,
      // Race: the guest has its own pockets and objectives
      inv: this.raceKit ? this.raceKit.inventory : this.state.inventory,
      objectives: this.raceKit ? this.raceKit.objectives : this.state.objectives,
      cans: this.cans.netSnapshot(),
    };
    if (this.vsRole) w.timeLeft = Math.round(this.timeLeft);
    if (this.crawler) {
      const c = this.crawler;
      w.cr = [r(c.position.x), r(c.position.z), r(c.mesh.rotation.y), CRAWLER_STATES.indexOf(c.state)];
    }
    if (this.stairsBuilt) w.stairs = true;
    if (this.ventOpen) w.vent = true;
    if (this.worldVersion !== this.lastWorldSent) {
      this.lastWorldSent = this.worldVersion;
      w.wi = this.worldItems.map((x) => [x.uid, r(x.mesh.position.x), r(x.mesh.position.z), r(x.mesh.rotation.y), x.item]);
    }
    if (this.forest) w.lv = this.forest.netState();
    if (this.site) w.lv = this.site.netState();
    if (this.shade) {
      const sh = this.shade;
      const off: number[] = [];
      this.map.lights.forEach((l, i) => this.shadeOff.has(l) && off.push(i));
      w.sh = [r(sh.pos.x), r(sh.pos.z), sh.state === 'gone' ? 0 : sh.state === 'feed' ? 1 : 2, ...off];
    }
    if (this.cat) {
      const c = this.cat;
      w.cat = [r(c.pos.x), r(c.pos.z), r(c.yaw), CAT_POSES.indexOf(c.pose), c.state === 'away' ? 0 : 1, c.golden ? 1 : 0];
    }
    const notes = this.raceKit ? this.raceKit.notes : this.state.notesCollected;
    if (notes.length !== this.lastNotesSent) {
      w.notes = notes;
      this.lastNotesSent = notes.length;
    }
    return w;
  }

  /** Guest: mirror the host's world. */
  private applySnapshot(w: WorldSnapshot) {
    if (w.sh && this.shade) {
      const s = this.shade;
      s.pos.set(w.sh[0], 0, w.sh[1]);
      s.state = w.sh[2] === 0 ? 'gone' : w.sh[2] === 1 ? 'feed' : 'stalk';
      const before = this.shadeOff.size;
      this.shadeOff.clear();
      for (const i of w.sh.slice(3)) {
        const l = this.map.lights[i];
        if (l) this.shadeOff.set(l, 2);
      }
      if (this.shadeOff.size > before && !this.shadeWarn.lights && Math.hypot(s.pos.x - this.player.position.x, s.pos.z - this.player.position.z) < 26) {
        this.shadeWarn.lights = true;
        sound.playFlickerHum();
        this.state.showToast('Les lumières s\'éteignent une à une, tout près… Quelque chose aime le noir.');
      }
    }
    if (w.cat && this.cat) {
      const c = this.cat;
      c.pos.set(w.cat[0], 0, w.cat[1]);
      c.yaw = w.cat[2];
      c.netPose = CAT_POSES[w.cat[3]] ?? 'sit';
      c.state = w.cat[4] ? 'follow' : 'away';
      if (!!w.cat[5] !== c.golden) {
        c.golden = !!w.cat[5];
        c.body.setGolden(c.golden);
      }
    }
    w.monsters.forEach((v, i) => this.monsters[i]?.netApply(v[0], v[1], v[2], MONSTER_STATES[v[3]] ?? 'PATROL', v[4]));
    for (const [id, open, locked] of w.doors) {
      const d = this.map.doors.get(id);
      if (!d) continue;
      if (d.isOpen !== open) {
        d.isOpen = open;
        d.collision.disabled = open;
        if (open) sound.playDoorOpen();
        else sound.playDoorSlam();
      }
      if (d.isLocked !== locked) {
        d.isLocked = locked;
        this.updateDoorLed(d);
      }
    }
    for (const [id, searched, locked] of w.containers) {
      const c = this.map.containers.get(id);
      if (!c) continue;
      c.searched = searched;
      c.locked = locked;
      if (searched) c.itemInside = null;
    }
    if (w.power && !this.state.powerRestored) {
      this.state.powerRestored = true;
      this.map.breakerLed.emissive.setHex(0x22ff44);
      this.updateDoorLed(this.map.doors.get('door-lab')!);
    }
    this.state.inventory = w.inv;
    this.state.objectives = w.objectives;
    if (w.notes) this.state.notesCollected = w.notes;
    if (w.timeLeft !== undefined) this.timeLeft = w.timeLeft;
    if (w.cr && this.crawler) this.crawler.netApply(w.cr[0], w.cr[1], w.cr[2], CRAWLER_STATES[w.cr[3]] ?? 'LURK');
    if (w.stairs && !this.stairsBuilt) this.buildStairs();
    if (w.vent && !this.ventOpen) this.openVent();
    if (w.wi) {
      const keep = new Set(w.wi.map((x) => x[0]));
      for (const x of [...this.worldItems]) if (!keep.has(x.uid)) this.removeWorldItem(x.uid);
      for (const [uid, x, z, ry, item] of w.wi) {
        if (!this.worldItems.some((wi) => wi.uid === uid)) this.spawnWorldItem(item, new THREE.Vector3(x, 0, z), ry, true, uid);
      }
    }
    this.cans.netApply(w.cans);
    if (w.lv) {
      this.forest?.netApply(w.lv as ForestNet);
      this.site?.netApply(w.lv as never);
    }
  }

  // -----------------------------------------------------------------------
  // Achievements
  // -----------------------------------------------------------------------
  /** What happened during this run (for the escape achievements). */
  private run = { time: 0, light: 0, hid: false, chased: false, voiced: false, crawler: 'LURK' as string, dist: 0, lx: NaN, lz: NaN, hides: 0, wasHid: false, hits: 0, chases: 0, inChase: false, sprinted: false, catT: 0, uv: 0 };
  /** ⭐ End-of-run numbers (stars + the victory screen) */
  public runStats(): RunStats {
    const r = this.run;
    return { time: r.time, distance: Math.round(r.dist), hides: r.hides, hits: r.hits, chases: r.chases, docs: this.state.notesCollected.length };
  }
  /** 📋 extra numbers for the daily quests */
  public questNumbers() {
    const r = this.run;
    return { sprinted: r.sprinted, cat: Math.round(r.catT), uv: r.uv, gifts: this.runGold };
  }

  private ach(id: string) {
    this.cb.onAchievement?.(id);
  }
  private stat(key: StatKey, n = 1) {
    if (n > 0) this.cb.onStat?.(key, n);
  }
  /** Host side: reward whoever did it (us, or the guest through the network). */
  private achActor(id: string) {
    if (this.actor === 'remote') this.net?.send({ k: 'ach', id });
    else this.ach(id);
  }

  /** Every frame while playing. */
  private trackRun(delta: number) {
    const p = this.player;
    const r = this.run;
    if (this.vsRole === 'monster' || this.dying || this.spectating) return;
    r.time += delta;
    if (p.flashlightOn) r.light += delta;
    if (p.isHidden) r.hid = true;
    // ⭐ Stats: distance walked (teleports ignored), hiding spots used, chases you got away from
    if (!isNaN(r.lx)) {
      const d = Math.hypot(p.position.x - r.lx, p.position.z - r.lz);
      if (d < 3) r.dist += d;
    }
    r.lx = p.position.x;
    r.lz = p.position.z;
    if (p.isHidden && !r.wasHid) r.hides++;
    if (p.isSprinting) r.sprinted = true;
    // 🐈‍⬛ the cat walking with you
    const cat = this.cat;
    if (cat && cat.state !== 'away' && Math.hypot(cat.pos.x - p.position.x, cat.pos.z - p.position.z) < 6) {
      r.catT += delta;
      // ✨ The golden cat (1 game in 50) brings luck once it has walked with you for 30 s
      if (cat.golden && !this.goldenDone && r.catT >= 30) {
        this.goldenDone = true;
        this.ach('golden_cat');
        sound.playMeow(1, 0, false);
        this.state.showToast('✨ Le chat doré se frotte contre ta jambe et ronronne… Ça porte chance ! (succès secret)', 7000);
      }
    }
    r.wasHid = p.isHidden;
    const chasing = this.monsters.some((m) => m.state === 'CHASE' && Math.hypot(m.position.x - p.position.x, m.position.z - p.position.z) < 18);
    if (chasing) {
      if (!r.inChase) this.buzz(70);
      r.inChase = true;
    } else if (r.inChase) {
      r.inChase = false;
      r.chases++;
    }
    if (!r.chased) {
      const near = (v: THREE.Vector3) => Math.hypot(v.x - p.position.x, v.z - p.position.z) < 18;
      if (this.monsters.some((m) => m.state === 'CHASE' && near(m.position))) r.chased = true;
      if (this.puppet && this.puppet.state === 'CHASE' && near(this.puppet.position)) r.chased = true;
      if (this.crawler && this.crawler.state === 'HUNT' && p.inDuct) r.chased = true;
    }
    // The Crawler flees from OUR light
    const cs = this.crawler?.state ?? 'LURK';
    if (cs === 'FLEE' && r.crawler !== 'FLEE' && p.inDuct && p.flashlightOn) this.ach('crawler');
    r.crawler = cs;
    if (!r.voiced && this.voice.selfTalking && this.remote && !this.partnerGone) {
      r.voiced = true;
      this.ach('voice');
    }
  }

  /** You got out of the hospital (not counted in Exploration). */
  private achEscape(ending: GameEnding) {
    if (this.vsRole === 'monster' || this.difficulty < 2) return;
    const r = this.run;
    this.stat('escapes');
    this.stat('coinsFound', this.state.runCoins);
    this.ach('first_escape');
    if (ending === 'DONJON') {
      this.ach('ch10_end');
      if (this.difficulty >= 3) this.ach('king_hard');
      if (this.runTime < 360) this.ach('king_fast');
    } else if (ending === 'SECRET') {
      this.ach('ch8_end');
    } else if (ending === 'MOREAU') {
      this.ach('ch7_end');
      if (this.state.notesCollected.length >= 2) this.ach('ch7_notes');
    } else if (ending === 'ROOFTOP') {
      this.ach('ch6_escape');
      if (this.state.notesCollected.length >= 2) this.ach('ch6_notes');
    } else if (ending === 'DESTROY' || ending === 'LUCAS') {
      this.ach('ch5_end');
      if (ending === 'LUCAS') this.ach('ch5_lucas');
      if (this.state.notesCollected.length >= 3) this.ach('ch5_notes');
    } else if (ending === 'RESCUE') {
      this.ach('ch4_escape');
      if (this.state.notesCollected.length >= 2) this.ach('ch4_notes');
      if (this.forest && !this.forest.seenDuringWait) this.ach('ch4_unseen');
    } else if (ending === 'MAZE') {
      this.ach('ch3_escape');
      if (this.state.notesCollected.length >= 2) this.ach('ch3_notes');
      if ((this.maze?.gatesDropped ?? 0) === 0) this.ach('ch3_nogate');
    } else if (ending === 'SEWER') {
      this.ach('ch2_escape');
      if (this.state.notesCollected.length >= 3) this.ach('ch2_notes');
      if (!r.chased) this.ach('ch2_silent');
    } else this.ach(ending === 'PURGE' ? 'end_purge' : ending === 'TRUTH' ? 'end_truth' : 'end_survival');
    if (this.difficulty >= 5) this.ach('nightmare');
    if (r.time < 300) this.ach('speed5');
    if (r.time < 180) this.ach('speed3');
    if (r.light < 90) this.ach('dark');
    if (!r.hid) this.ach('no_hide');
    if (!r.chased && !this.vsRole) this.ach('ghost');
    if (this.net?.mode === 'coop' && this.partnerAlive()) this.ach('duo');
  }

  /** [V]: stop / resume sending your voice to the partner. */
  public toggleVoiceMute() {
    if (!this.net) return;
    if (this.mic.status !== 'on') {
      this.startMic();
      return;
    }
    this.voice.muted = !this.voice.muted;
    this.state.showToast(this.voice.muted ? '🔇 Micro coupé — votre partenaire ne vous entend plus.' : '🎙 Micro rallumé — parlez, il vous entend… s\'il est proche.');
    this.pushHud();
  }

  /** Proximity voice: loud when close, fades with distance, muffled through walls and floors. */
  private updateVoice(delta: number) {
    const s = this.remote?.state;
    if (!s || this.partnerGone) {
      this.voice.update(delta, 0, 0, 1000);
      return;
    }
    // Dead / spectating: you talk like ghosts on a radio, wherever you are
    if (this.spectating || s.dead || this.remoteCaught) {
      this.voice.update(delta, 0.85, 0, 3400, 0.05);
      return;
    }
    const cam = this.camera.position;
    const dx = s.x - cam.x;
    const dy = s.y - cam.y;
    const dz = s.z - cam.z;
    const dist = Math.hypot(dx, dz) + Math.abs(dy) * 2.5;
    // Walls between the two players (2D segment vs boxes, refreshed 5× per second)
    this.voiceOcclTimer -= delta;
    if (this.voiceOcclTimer <= 0) {
      this.voiceOcclTimer = 0.2;
      this.voiceOccl = dist > 34 ? 0 : this.countWalls(cam.x, cam.z, s.x, s.z);
    }
    const walls = Math.min(3, this.voiceOccl);
    const MAX = 30;
    let vol = dist < 2 ? 1 : Math.pow(2 / dist, 0.85);
    vol *= 1 - smooth01((dist - MAX * 0.7) / (MAX * 0.3));
    vol *= Math.pow(0.5, walls);
    if (s.hid) vol *= 0.7; // talking from inside a locker
    let cutoff = 7000 - Math.min(1, dist / MAX) * 4200;
    if (walls > 0) cutoff = Math.min(cutoff, 1300 / walls);
    // Pan: where the partner is relative to where you look
    const yaw = this.camera.rotation.y;
    const rx = Math.cos(yaw);
    const rz = -Math.sin(yaw);
    const pan = dist < 0.5 ? 0 : ((dx * rx + dz * rz) / Math.max(0.5, Math.hypot(dx, dz))) * 0.85;
    // 📻 Walkie-talkie: far away, the voice comes through the radio (and it crackles where you stand)
    if (this.hasTalkie() && dist > 6 && vol < 0.6) {
      const talking = this.voice.partnerTalking;
      if (talking) {
        if (!this.radioWasTalking) sound.playStatic(0.2, 0.06);
        this.radioNoiseT -= delta;
        if (this.radioNoiseT <= 0) {
          this.radioNoiseT = 1.5;
          this.alertAll(this.player.position.clone().setY(1.2), 5);
        }
      }
      this.radioWasTalking = talking;
      this.voice.update(delta, Math.max(vol, 0.65), 0, 2600, 0.04);
      return;
    }
    this.radioWasTalking = false;
    this.voice.update(delta, vol, pan, cutoff, 0.12 + Math.min(1, dist / MAX) * 0.35);
  }

  private countWalls(ax: number, az: number, bx: number, bz: number) {
    let n = 0;
    for (const b of this.map.collisionBoxes) {
      if (b.disabled) continue;
      if (b.max.y < 1.2 || b.min.y > 1.8) continue; // furniture / ceiling: voices pass over
      if (segHitsRect(ax, az, bx, bz, b.min.x, b.min.z, b.max.x, b.max.z)) {
        n++;
        if (n >= 3) break;
      }
    }
    return n;
  }

  private netTick(delta: number) {
    if (!this.net) return;
    this.updateImp(delta);
    for (const q of this.peers) q.remote?.update(delta);
    // The one you follow (spectator camera, HUD): stay on them while they live
    const alive = (i: number) => !!this.peers[i]?.remote?.state && !this.peers[i].remote!.state!.dead && !this.peers[i].caught;
    if (!alive(this.cur)) {
      const j = this.peers.findIndex((_, i) => alive(i));
      this.cur = j >= 0 ? j : Math.min(this.cur, Math.max(0, this.peers.length - 1));
    }
    this.updateVoice(delta);
    this.netSendTimer -= delta;
    if (this.netSendTimer <= 0) {
      this.netSendTimer = 1 / 15;
      this.net.send({ k: 'p', s: this.localNetState() });
    }
    if (this.net.role === 'host') {
      this.snapTimer -= delta;
      if (this.snapTimer <= 0) {
        this.snapTimer = 0.1;
        this.net.send({ k: 'snap', w: this.buildSnapshot() });
      }
      // Both players caught → game over for everyone
      if ((this.spectating || this.finished) && !this.partnerAlive() && !this.pendingEnding) {
        if (this.spectating) this.endGameOver();
      }
    }
  }

  private endGameOver() {
    if (this.finished && !this.spectating) return;
    // 🔪 Imposteur: the game ends only with its own result screen
    if (this.imp && !this.impDone) return;
    this.spectating = false;
    this.finished = true;
    this.running = false;
    this.blackout = 1;
    if (this.net?.role === 'host') this.net.send({ k: 'gameover' });
    this.cb.onGameOver();
  }

  // -----------------------------------------------------------------------
  // 🌩️ Random events (solo, and the host in co-op): power cut, alarm, fog, a door that slams
  // -----------------------------------------------------------------------
  private revT = 100;
  private fogEvt = 0;
  private fogBase = 0.07;
  private get revAllowed() {
    return !this.imp && !this.vsRole && !this.watchOnly && !this.survival && !this.intro && !this.pendingEnding && !this.photo && (!this.net || (this.net.mode === 'coop' && this.net.role === 'host'));
  }
  private updateRandomEvents(delta: number) {
    // The fog comes in over 3 s, stays, then fades out
    if (this.fogEvt > 0) {
      this.fogEvt -= delta;
      const f = this.scene.fog;
      if (f instanceof THREE.FogExp2) {
        const k = Math.max(0, Math.min(1, (30 - this.fogEvt) / 3, this.fogEvt / 3));
        f.density = this.fogBase + (Math.max(this.fogBase * 2.6, 0.17) - this.fogBase) * k;
        if (this.fogEvt <= 0) f.density = this.fogBase;
      }
    }
    if (!this.revAllowed) return;
    this.revT -= delta;
    if (this.revT > 0) return;
    this.revT = 90 + Math.random() * 80;
    const p = this.player.position;
    const opts = ['alarm'];
    if (this.map.lights.length > 4) opts.push('power');
    if (this.challenge !== 'fog' && this.fogEvt <= 0 && this.scene.fog instanceof THREE.FogExp2) opts.push('fog');
    const near = [...this.map.doors.values()].filter((d) => !d.isLocked && d.center.distanceTo(p) > 3 && d.center.distanceTo(p) < 16);
    if (near.length) opts.push('door');
    const e = opts[Math.floor(Math.random() * opts.length)];
    let x = p.x;
    let z = p.z;
    if (e === 'door') {
      const d = near[Math.floor(Math.random() * near.length)];
      this.setDoorOpen(d, !d.isOpen, true);
      x = d.center.x;
      z = d.center.z;
    } else if (e === 'alarm') {
      // Somewhere in a room nearby (a light fixture), else just around
      const spots = this.map.lights.filter((l) => {
        const dd = Math.hypot(l.position.x - p.x, l.position.z - p.z);
        return dd > 12 && dd < 30;
      });
      if (spots.length) {
        const l = spots[Math.floor(Math.random() * spots.length)];
        x = l.position.x;
        z = l.position.z;
      } else {
        const a = Math.random() * Math.PI * 2;
        x = p.x + Math.cos(a) * 16;
        z = p.z + Math.sin(a) * 16;
      }
      const at = new THREE.Vector3(x, 1.2, z);
      this.alertAll(at, 30);
      setTimeout(() => this.running && this.alertAll(at, 25), 1500);
    }
    this.applyRandomEvent(e, x, z);
    this.net?.send({ k: 'rev', e, x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10 });
  }
  // -----------------------------------------------------------------------
  // 🏚️ Your room 104: the decor chosen in Personnaliser + your collection
  // -----------------------------------------------------------------------
  /** set by the app (null = nothing to show); applied right away if a game is on */
  private _roomShow: RoomShow | null = null;
  public get roomShow() {
    return this._roomShow;
  }
  public set roomShow(v: RoomShow | null) {
    this._roomShow = v;
    if (this.map && this.player) {
      this.applyRoomDecor();
      if ((this.pet?.kind ?? '') !== (v?.pet ?? '')) this.applyPet();
    }
  }
  private roomDecor: ReturnType<typeof buildRoomDecor> | null = null;
  private roomDecorKey = '';
  private roomDecorMap: unknown = null;
  private applyRoomDecor() {
    const want = this.chapter === 1 && !this.survival && !this.vsRole && !this.imp && !this.watchOnly && this.net?.mode !== 'versus' ? this.roomShow : null;
    const key = roomShowKey(want);
    if (key === this.roomDecorKey && this.roomDecorMap === this.map) return;
    if (this.roomDecor) {
      this.scene.remove(this.roomDecor.group);
      const mine = new Set(this.roomDecor.boxes);
      this.map.collisionBoxes = this.map.collisionBoxes.filter((b) => !mine.has(b));
      this.roomDecor.dispose();
      this.roomDecor = null;
    }
    this.roomDecorKey = key;
    this.roomDecorMap = this.map;
    if (!want) return;
    this.roomDecor = buildRoomDecor(want);
    // in the scene (not the level group): it never gets in the way of [E]
    this.scene.add(this.roomDecor.group);
    this.map.collisionBoxes.push(...this.roomDecor.boxes);
  }

  // -----------------------------------------------------------------------
  // 🐾 Your pet: asleep on the bed of room 104, wakes up when you walk away,
  // then follows you everywhere and warns you when a creature comes close.
  // -----------------------------------------------------------------------
  private pet: { kind: string; group: THREE.Group; tick: (s: number, moving: boolean, asleep?: boolean) => void; dispose: () => void } | null = null;
  private petAsleep = false;
  private petWarnCd = 0;
  private petVel = new THREE.Vector3();
  private applyPet() {
    if (this.pet) {
      this.scene.remove(this.pet.group);
      this.pet.dispose();
      this.pet = null;
    }
    const kind = this.roomShow?.pet;
    if (!kind || !PET_INFO[kind] || this.survival || this.vsRole || this.imp || this.watchOnly || this.net?.mode === 'versus') return;
    const disposables: { dispose: () => void }[] = [];
    const built = buildPet(kind, (o) => {
      disposables.push(o);
      return o;
    });
    this.pet = { kind, ...built, dispose: () => disposables.forEach((d) => d.dispose()) };
    this.pet.group.scale.setScalar(1.6);
    this.scene.add(this.pet.group);
    this.petWarnCd = 20;
    // room 104 (chapter 1): curled up on the bed; elsewhere: right next to you
    this.petAsleep = this.chapter === 1;
    if (this.petAsleep) {
      this.pet.group.position.set(-11.2, kind === 'raven' ? 0.84 : 0.8, -8.0);
      this.pet.group.rotation.y = 0.8;
    } else {
      const p = this.player.position;
      this.pet.group.position.set(p.x + 0.8, kind === 'raven' ? 1.9 : 0, p.z + 0.8);
    }
  }
  private updatePet(delta: number) {
    const pet = this.pet;
    if (!pet || !this.running) return;
    const s = performance.now() * 0.001;
    const p = this.player.position;
    const g = pet.group.position;
    const flyer = pet.kind === 'raven';
    if (this.petAsleep) {
      pet.tick(s, false, true);
      // wakes up when you walk away from the bed
      if (Math.hypot(p.x - g.x, p.z - g.z) > 2.6) {
        this.petAsleep = false;
        sound.playPetCall(pet.kind);
      }
      return;
    }
    // follow: catch up when you're more than ~1.8 m away, then stop next to you
    // (it doesn't glue itself behind you: turn around and you'll see it)
    const dx = g.x - p.x;
    const dz = g.z - p.z;
    const dist = Math.hypot(dx, dz) || 1;
    const keep = 1.3;
    const back = new THREE.Vector3(p.x + (dx / dist) * keep, flyer ? 1.9 + Math.sin(s * 2) * 0.15 : 0, p.z + (dz / dist) * keep);
    const to = back.clone().sub(g);
    const d = dist > 1.8 ? Math.hypot(to.x, to.z) : 0;
    if (dist > 15) g.copy(back);
    const moving = d > 0.3;
    if (moving) {
      const sp = Math.min(9, d * 3);
      g.x += (to.x / d) * sp * delta;
      g.z += (to.z / d) * sp * delta;
      pet.group.rotation.y = Math.atan2(-to.x, -to.z);
    }
    g.y = THREE.MathUtils.damp(g.y, back.y, 6, delta);
    pet.tick(s, moving);
    // 🐾 warning: a creature within 12 m
    this.petWarnCd -= delta;
    if (this.petWarnCd > 0) return;
    const near = this.monsters.some((m) => m.mesh.visible && m.mesh.position.distanceTo(p) < 12);
    if (near) {
      this.petWarnCd = 25;
      sound.playPetCall(pet.kind);
      this.state.showToast(PET_INFO[pet.kind].warn, 3500);
    }
  }

  // -----------------------------------------------------------------------
  // ⚡ Big power cut, scheduled by an admin: the whole place goes dark until
  // someone restarts the generator (3 pulls on the starter cord).
  // -----------------------------------------------------------------------
  /** set by the app: the scheduled power cut (local clock) */
  public outage: { id: string; at: number } | null = null;
  /** set by the app: pays the reward, returns the coins won */
  public onOutageFixed: ((id: string) => Promise<number>) | null = null;
  private outageDone = new Set<string>();
  /** id of the power cut going on ('net' = the co-op host's) */
  private outageOn: string | null = null;
  private gen: THREE.Group | null = null;
  private genLed: THREE.MeshStandardMaterial | null = null;
  private genPulls = 0;
  private genT = 0;
  private updateOutage(delta: number) {
    if (this.outageOn) {
      this.lightsOutTimer = Math.max(this.lightsOutTimer, 0.3);
      this.genT += delta;
      if (this.genLed) this.genLed.emissiveIntensity = Math.sin(this.genT * 6) > 0 ? 4 : 0.2;
      return;
    }
    const o = this.outage;
    if (!o || this.outageDone.has(o.id) || !this.running || !this.revAllowed || this.map.lights.length < 4) return;
    const now = Date.now();
    if (now < o.at || now > o.at + 10 * 60000) return;
    this.startOutage(o.id);
  }
  private startOutage(id: string) {
    this.outageDone.add(id);
    this.outageOn = id;
    this.genPulls = 0;
    // The generator: in a room 10–28 m away (under a light fixture)
    const p = this.player.position;
    const lights = this.map.lights;
    const far = lights.filter((l) => {
      const d = Math.hypot(l.position.x - p.x, l.position.z - p.z);
      return d > 10 && d < 28;
    });
    const pool = far.length ? far : lights;
    const spot = pool.length ? pool[Math.floor(Math.random() * pool.length)].position : p;
    const g = new THREE.Group();
    const metal = new THREE.MeshStandardMaterial({ color: 0x8a6a12, roughness: 0.6, metalness: 0.5 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.8 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.7, 0.7), metal);
    body.position.y = 0.55;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.12, 0.8), dark);
    frame.position.y = 0.14;
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.9, 12), new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.5 }));
    tank.rotation.z = Math.PI / 2;
    tank.position.y = 1.05;
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 8), dark);
    pipe.position.set(-0.4, 1.2, -0.2);
    this.genLed = new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff2200, emissiveIntensity: 4 });
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), this.genLed);
    led.position.set(0.35, 0.95, 0.36);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), this.genLed);
    beacon.position.set(0.45, 1.35, 0);
    g.add(body, frame, tank, pipe, led, beacon);
    g.position.set(spot.x, 0, spot.z);
    g.traverse((o) => (o.userData.isGenerator = true));
    g.userData.isGenerator = true;
    this.map.sceneGroup.add(g);
    this.gen = g;
    sound.playBreakerClunk();
    sound.playFlickerHum();
    this.player.shake = Math.max(this.player.shake, 0.25);
    this.state.showToast("⚡ GRANDE PANNE ! Tout est plongé dans le noir… Trouve le générateur (sa lumière rouge clignote) et relance-le !", 7000);
    this.net?.send({ k: 'rev', e: 'outage', x: Math.round(spot.x * 10) / 10, z: Math.round(spot.z * 10) / 10 });
  }
  private endOutage(silent: boolean) {
    const id = this.outageOn;
    if (!id) return;
    this.outageOn = null;
    this.lightsOutTimer = 0;
    if (this.gen) {
      this.gen.parent?.remove(this.gen);
      this.gen.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          (o.material as THREE.Material).dispose();
        }
      });
      this.gen = null;
      this.genLed = null;
    }
    if (silent) return;
    sound.playPowerUp();
    this.player.shake = Math.max(this.player.shake, 0.3);
    this.state.showToast('⚡ Le générateur démarre ! Le courant est rétabli.');
    if (id !== 'net') this.net?.send({ k: 'rev', e: 'outageEnd', x: 0, z: 0 });
    const claim = id === 'net' ? this.outage?.id : id;
    if (claim && this.onOutageFixed)
      this.onOutageFixed(claim).then((n) => {
        if (n > 0 && this.running) this.state.showToast(`⚡ Courant rétabli : +${n} pièces !`);
      });
  }

  private applyRandomEvent(e: string, x: number, z: number) {
    const d = Math.hypot(x - this.player.position.x, z - this.player.position.z);
    switch (e) {
      case 'outage':
        // (co-op guest) the host's generator is somewhere in the dark
        if (!this.outageOn) {
          this.outageOn = 'net';
          sound.playBreakerClunk();
          this.state.showToast("⚡ GRANDE PANNE ! Ton coéquipier doit relancer le générateur… ou va l'aider !", 7000);
        }
        break;
      case 'outageEnd':
        this.endOutage(false);
        break;
      case 'power':
        this.lightsOutTimer = Math.max(this.lightsOutTimer, 7);
        sound.playBreakerClunk();
        sound.playFlickerHum();
        this.state.showToast('⚡ Panne de courant ! Les lumières vont revenir… normalement.');
        break;
      case 'alarm':
        sound.playAlarmRing(d);
        setTimeout(() => this.running && sound.playAlarmRing(d), 1500);
        this.state.showToast('🚨 Une alarme se déclenche quelque part… Ça va attirer du monde.');
        break;
      case 'fog': {
        const f = this.scene.fog;
        if (f instanceof THREE.FogExp2) {
          if (this.fogEvt <= 0) this.fogBase = f.density;
          this.fogEvt = 30;
        }
        this.state.showToast('🌫️ Un brouillard épais envahit les lieux… On n\'y voit plus rien.');
        break;
      }
      case 'door':
        // (the host already heard the slam when the door moved)
        if (this.net?.role === 'guest' && d < 25) sound.playDoorSlam();
        if (d < 8) this.player.shake = Math.max(this.player.shake, 0.3);
        this.state.showToast('🚪 Une porte a claqué toute seule… Il n\'y avait personne.');
        break;
    }
  }

  // -----------------------------------------------------------------------
  // 🔦 UV lamp: hidden messages on the walls (and the Mimic's handprints)
  // -----------------------------------------------------------------------
  private uvOn = false;
  private uvMarks: UvMark[] = [];
  private uvFound = 0;
  private uvTotal = 0;
  private uvTmp = new THREE.Vector3();
  private uvTmp2 = new THREE.Vector3();
  private setUv(on: boolean, quiet = false) {
    this.uvOn = on;
    const p = this.player;
    p.flashlight.color.setHex(on ? 0x8a5cff : this.lampHex());
    p.batteryDrainMul = this.baseDrain * (on ? 1.6 : 1);
    if (quiet) return;
    sound.playFlashlightToggle(on);
    this.state.showToast(
      on
        ? p.flashlightOn
          ? '🔦 Lumière UV : balayez les murs… des messages invisibles peuvent apparaître.'
          : '🔦 Lumière UV prête : allumez la lampe [F] et balayez les murs.'
        : '🔦 Lampe normale.'
    );
    this.pushHud();
  }
  private uvTexture(text: string | null) {
    if (text === '__secret') return this.secretGlyph();
    const c = document.createElement('canvas');
    c.width = text ? 512 : 256;
    c.height = text ? 128 : 256;
    const g = c.getContext('2d')!;
    g.shadowColor = '#b48cff';
    g.shadowBlur = 16;
    g.fillStyle = '#ece0ff';
    if (text) {
      g.font = 'bold 52px "Courier New", monospace';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(text, 256, 58, 492);
      // Drips under the letters
      for (let i = 0; i < 12; i++) g.fillRect(40 + Math.random() * 430, 78, 3, 8 + Math.random() * 30);
    } else {
      // Hands pressed against the door… from the inside
      const hand = (x: number, y: number, r: number, s: number) => {
        g.save();
        g.translate(x, y);
        g.rotate(r);
        g.scale(s, 1);
        g.beginPath();
        g.ellipse(0, 0, 22, 26, 0, 0, Math.PI * 2);
        g.fill();
        for (let f = 0; f < 4; f++) {
          g.beginPath();
          g.ellipse(-15 + f * 10, -40 - (f === 1 || f === 2 ? 6 : 0), 4.5, 17, (f - 1.5) * 0.12, 0, Math.PI * 2);
          g.fill();
        }
        g.beginPath();
        g.ellipse(26, 2, 5, 14, -0.8, 0, Math.PI * 2);
        g.fill();
        g.restore();
      };
      hand(80, 90, -0.3, 1);
      hand(175, 80, 0.25, -1);
      hand(110, 190, -0.1, 1);
      hand(190, 185, 0.4, -1);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  private makeUvMark(text: string | null, w: number, h: number): UvMark {
    const mat = new THREE.MeshBasicMaterial({
      map: this.uvTexture(text),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      toneMapped: false,
      blending: THREE.AdditiveBlending,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    mesh.renderOrder = 5;
    this.map.sceneGroup.add(mesh);
    return { mesh, mat, text, found: false };
  }
  private disposeUvMark(m: UvMark | null) {
    if (!m) return;
    m.mesh.parent?.remove(m.mesh);
    m.mesh.geometry.dispose();
    m.mat.map?.dispose();
    m.mat.dispose();
  }
  private setupUv() {
    this.uvMarks.forEach((m) => this.disposeUvMark(m));
    this.uvMarks = [];
    this.uvFound = 0;
    this.uvTotal = 0;
    this.uvOn = false;
    if (this.maze || this.forest || this.site || this.vsRole || this.imp || this.watchOnly) return;
    const texts = [...UV_TEXTS].sort(() => Math.random() - 0.5).slice(0, 6);
    const walls = this.map.collisionBoxes.filter((b) => !b.disabled && !b.doorId && b.min.y < 1.0 && b.max.y > 2.0);
    const dirs: [number, number][] = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];
    for (const s of treatSpots(this.map, 16)) {
      if (this.uvMarks.length >= texts.length) break;
      let best: { t: number; dx: number; dz: number; b: (typeof walls)[number] } | null = null;
      for (const [dx, dz] of dirs)
        for (const b of walls) {
          const t = rayBox2D(s.x, s.z, dx, dz, b);
          if (t !== null && t < 4 && (!best || t < best.t)) best = { t, dx, dz, b };
        }
      if (!best) continue;
      const b = best.b;
      // A wide enough wall face, the text kept inside it
      const along = best.dx !== 0 ? b.max.z - b.min.z : b.max.x - b.min.x;
      if (along < 1.9) continue;
      let x = s.x + best.dx * (best.t - 0.025);
      let z = s.z + best.dz * (best.t - 0.025);
      if (best.dx !== 0) z = THREE.MathUtils.clamp(z, b.min.z + 0.9, b.max.z - 0.9);
      else x = THREE.MathUtils.clamp(x, b.min.x + 0.9, b.max.x - 0.9);
      if (this.uvMarks.some((m) => Math.hypot(m.mesh.position.x - x, m.mesh.position.z - z) < 5)) continue;
      const m = this.makeUvMark(texts[this.uvMarks.length], 1.6, 0.4);
      m.mesh.position.set(x, 1.35 + Math.random() * 0.3, z);
      m.mesh.lookAt(x - best.dx, m.mesh.position.y, z - best.dz);
      m.mesh.rotation.z += (Math.random() - 0.5) * 0.12;
      this.uvMarks.push(m);
    }
    this.uvTotal = this.uvMarks.length;
  }
  private updateUv(delta: number) {
    if (this.uvOn && !this.state.inventory.some((i) => i.type === 'uvlamp')) this.setUv(false, true);
    const all = [...this.uvMarks];
    if (this.mimicMark) all.push(this.mimicMark);
    if (this.secret && this.secret.state === 'hidden') all.push(this.secret.mark);
    if (!all.length) return;
    const p = this.player;
    const lit = this.uvOn && p.flashlightOn && p.flashlightBattery > 0 && !p.isHidden;
    const cam = this.camera.position;
    const fwd = this.camera.getWorldDirection(this.uvTmp);
    for (const m of all) {
      let target = 0;
      if (lit && m.mesh.visible) {
        const d = m.mesh.position.distanceTo(cam);
        if (d < 9) {
          const c = this.uvTmp2.copy(m.mesh.position).sub(cam).normalize().dot(fwd);
          if (c > 0.9) target = Math.min(1, (c - 0.9) / 0.05) * (1 - smooth01((d - 6) / 3));
        }
      }
      m.mat.opacity = THREE.MathUtils.damp(m.mat.opacity, target, 6, delta);
      if (!m.found && m.mat.opacity > 0.6) {
        m.found = true;
        this.onUvFound(m);
      }
    }
  }
  private onUvFound(m: UvMark) {
    this.run.uv++;
    if (m === this.secret?.mark) {
      sound.playHiss(0.8);
      this.state.showToast('👁 Un symbole étrange sur le mur… Gardez la lumière UV dessus.');
      return;
    }
    if (!m.text) {
      sound.playHiss(1.2);
      this.state.showToast('🖐 Des traces de mains sur ce casier… de l\'INTÉRIEUR. Quelque chose s\'y cache. N\'y entrez pas.');
      return;
    }
    this.uvFound++;
    const all = this.uvFound >= this.uvTotal;
    const n = all ? 25 : 5;
    if (this.net?.role === 'guest') this.net.send({ k: 'coins', n });
    else this.state.runCoins += n;
    sound.playItemPickup();
    this.state.showToast(
      all
        ? `🔮 « ${m.text} » — Tous les messages cachés trouvés (${this.uvTotal}/${this.uvTotal}) ! +${n} 🪙`
        : `🔮 Message caché (${this.uvFound}/${this.uvTotal}) : « ${m.text} »  +${n} 🪙`
    );
  }

  // -----------------------------------------------------------------------
  // 📖 Bestiary: creatures met, item kinds found (sent to the account at the end of the run)
  // -----------------------------------------------------------------------
  public seenBeasts = new Set<string>();
  public seenItems = new Set<string>();
  /** what the account already knows (the toast only shows new creatures) */
  public knownBeasts = new Set<string>();
  public knownDocs = new Set<string>();
  private seenT = 0;
  private markSeen(id: string) {
    if (this.seenBeasts.has(id) || this.watchOnly) return;
    this.seenBeasts.add(id);
    if (this.knownBeasts.has(id)) return;
    const b = BEASTS.find((x) => x.id === id);
    if (b) setTimeout(() => this.running && this.state.showToast(`📖 Nouvelle créature dans le Bestiaire : ${b.emoji} ${b.name}`), 2500);
  }
  private beastId(m: MonsterAI) {
    if (m.bells) return 'fouettard';
    if (m.nurse) return 'infirmiere';
    if (m.blind) return 'aveugle';
    if (this.maze) return 'traqueur';
    if (this.forest) return 'foret';
    const s = this.site;
    if (s instanceof CircusTent) return 'clowns';
    if (s instanceof DreamHouse) return 'cauchemar';
    if (s instanceof BossArena) return 'moreau';
    if (s instanceof Rooftop) return 'toit';
    if (s instanceof SiteB) return 'sujet00';
    return 'patient0';
  }
  private trackSeen(delta: number) {
    this.seenT -= delta;
    if (this.seenT > 0) return;
    this.seenT = 0.5;
    if (this.vsRole || this.watchOnly) return;
    for (const i of this.state.inventory) if (i.type !== 'note' && i.type !== 'cassette' && i.type !== 'special') this.seenItems.add(i.type);
    if (this.state.runCoins > 0) this.seenItems.add('coins');
    const p = this.player.position;
    for (const m of this.monsters) {
      if (!m.mesh.visible || m.position.distanceTo(p) > 14) continue;
      this.markSeen(this.beastId(m));
    }
    if (this.crawler && this.crawler.position.distanceTo(p) < 10) this.markSeen('rampant');
  }

  // -----------------------------------------------------------------------
  // 🔮 Hidden room: a UV symbol on a wall; light it 1.5 s and a passage opens for 2 minutes
  // (the room is a pocket outside the map: the creatures can't get in)
  // -----------------------------------------------------------------------
  private secret: {
    mark: UvMark;
    door: THREE.Mesh;
    at: THREE.Vector3;
    dir: THREE.Vector3;
    exitAt: THREE.Vector3;
    inward: THREE.Vector3;
    room: THREE.Group;
    boxes: CollisionBox[];
    fixture: FlickerLight;
    lit: number;
    state: 'hidden' | 'open' | 'closed';
    timeLeft: number;
    inside: boolean;
    visited: boolean;
    warned: number;
  } | null = null;
  private secretFade = 0;
  private secretGlyph() {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 256;
    const g = c.getContext('2d')!;
    g.shadowColor = '#b48cff';
    g.shadowBlur = 18;
    g.strokeStyle = '#ece0ff';
    g.fillStyle = '#ece0ff';
    g.lineWidth = 7;
    // An eye inside a triangle, with arrows pointing at the wall
    g.beginPath();
    g.moveTo(128, 30);
    g.lineTo(230, 210);
    g.lineTo(26, 210);
    g.closePath();
    g.stroke();
    g.beginPath();
    g.ellipse(128, 145, 46, 26, 0, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.arc(128, 145, 13, 0, Math.PI * 2);
    g.fill();
    g.font = 'bold 30px "Courier New", monospace';
    g.textAlign = 'center';
    g.fillText('▼ POUSSE ▼', 128, 246);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  private setupSecret() {
    const old = this.secret;
    if (old) {
      // (the same map can be rebuilt: take the room's walls and light back out of it)
      for (const b of old.boxes) {
        const bi = this.map.collisionBoxes.indexOf(b);
        if (bi >= 0) this.map.collisionBoxes.splice(bi, 1);
      }
      const li = this.map.lights.indexOf(old.fixture);
      if (li >= 0) this.map.lights.splice(li, 1);
      this.disposeUvMark(old.mark);
      old.door.parent?.remove(old.door);
      old.room.parent?.remove(old.room);
      old.room.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.geometry.dispose();
          (m.material as THREE.Material).dispose();
        }
      });
      old.door.geometry.dispose();
      (old.door.material as THREE.Material).dispose();
    }
    this.secret = null;
    this.secretFade = 0;
    if (this.maze || this.forest || this.site || this.vsRole || this.imp || this.watchOnly || this.net?.mode === 'race') return;
    const walls = this.map.collisionBoxes.filter((b) => !b.disabled && !b.doorId && b.min.y < 1.0 && b.max.y > 2.2);
    const dirs: [number, number][] = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];
    let pick: { x: number; z: number; dx: number; dz: number } | null = null;
    for (const s of treatSpots(this.map, 20)) {
      if (s.y > 1) continue; // ground floor only
      if (this.uvMarks.some((m) => Math.hypot(m.mesh.position.x - s.x, m.mesh.position.z - s.z) < 4)) continue;
      for (const [dx, dz] of dirs) {
        for (const b of walls) {
          const t = rayBox2D(s.x, s.z, dx, dz, b);
          if (t === null || t > 3) continue;
          const along = dx !== 0 ? b.max.z - b.min.z : b.max.x - b.min.x;
          if (along < 2.2) continue;
          let x = s.x + dx * (t - 0.025);
          let z = s.z + dz * (t - 0.025);
          if (dx !== 0) z = THREE.MathUtils.clamp(z, b.min.z + 0.8, b.max.z - 0.8);
          else x = THREE.MathUtils.clamp(x, b.min.x + 0.8, b.max.x - 0.8);
          pick = { x, z, dx, dz };
          break;
        }
        if (pick) break;
      }
      if (pick) break;
    }
    if (!pick) return;
    const dir = new THREE.Vector3(-pick.dx, 0, -pick.dz); // out of the wall, toward the corridor
    const at = new THREE.Vector3(pick.x, 0, pick.z);
    const mark = this.makeUvMark('__secret', 0.9, 0.9);
    mark.mesh.position.set(at.x, 1.45, at.z);
    mark.mesh.lookAt(at.x + dir.x, 1.45, at.z + dir.z);
    // The opening (shown once the wall slides)
    const dc = document.createElement('canvas');
    dc.width = 128;
    dc.height = 256;
    const dg = dc.getContext('2d')!;
    const grad = dg.createRadialGradient(64, 128, 10, 64, 128, 130);
    grad.addColorStop(0, '#000');
    grad.addColorStop(0.75, '#05010a');
    grad.addColorStop(1, '#3a1a6a');
    dg.fillStyle = grad;
    dg.fillRect(0, 0, 128, 256);
    dg.strokeStyle = '#a070ff';
    dg.lineWidth = 6;
    dg.strokeRect(3, 3, 122, 250);
    const dt = new THREE.CanvasTexture(dc);
    dt.colorSpace = THREE.SRGBColorSpace;
    const door = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 2.1), new THREE.MeshBasicMaterial({ map: dt, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -3 }));
    door.position.set(at.x + dir.x * 0.01, 1.05, at.z + dir.z * 0.01);
    door.lookAt(door.position.x + dir.x, 1.05, door.position.z + dir.z);
    door.visible = false;
    this.map.sceneGroup.add(door);

    // ---- The pocket room, far east of everything
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const b of this.map.collisionBoxes) {
      maxX = Math.max(maxX, b.max.x);
      minZ = Math.min(minZ, b.min.z);
      maxZ = Math.max(maxZ, b.max.z);
    }
    const cx = maxX + 40;
    const cz = (minZ + maxZ) / 2;
    const W = 5;
    const H = 2.8;
    const room = new THREE.Group();
    const stone = new THREE.MeshStandardMaterial({ color: 0x575060, roughness: 0.9 });
    const box = (w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material = stone) => {
      const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      o.position.set(x, y, z);
      o.receiveShadow = true;
      room.add(o);
      return o;
    };
    box(W, 0.1, W, cx, -0.05, cz);
    box(W, 0.1, W, cx, H + 0.05, cz);
    box(0.2, H, W, cx - W / 2, H / 2, cz);
    box(0.2, H, W, cx + W / 2, H / 2, cz);
    box(W, H, 0.2, cx, H / 2, cz - W / 2);
    box(W, H, 0.2, cx, H / 2, cz + W / 2);
    // Glowing UV tubes along the walls, a table in the middle
    const tube = new THREE.MeshStandardMaterial({ color: 0x6a40ff, emissive: 0x7a4cff, emissiveIntensity: 2.4 });
    // A real (dim, violet) light: the engine's light pool picks it up like any fixture
    const fixture: FlickerLight = {
      position: new THREE.Vector3(cx, H - 0.3, cz),
      color: new THREE.Color(0xc0a8ff),
      distance: 10,
      k: 1,
      current: 0,
      fixtureMat: tube,
      baseIntensity: 8,
      baseEmissive: 2.4,
      nextFlicker: 1,
      flicker: true,
      needsPower: false,
    };
    this.map.lights.push(fixture);
    box(W - 0.4, 0.05, 0.05, cx, H - 0.15, cz - W / 2 + 0.14, tube);
    box(W - 0.4, 0.05, 0.05, cx, H - 0.15, cz + W / 2 - 0.14, tube);
    box(1.4, 0.06, 0.8, cx, 0.78, cz, new THREE.MeshStandardMaterial({ color: 0x4a3626, roughness: 0.8 }));
    for (const [lx, lz] of [
      [-0.62, -0.32],
      [0.62, -0.32],
      [-0.62, 0.32],
      [0.62, 0.32],
    ])
      box(0.05, 0.76, 0.05, cx + lx, 0.38, cz + lz, new THREE.MeshStandardMaterial({ color: 0x3a2a1e }));
    // Writing on the walls, visible here without UV
    const wallText = (text: string, x: number, z: number, ry: number) => {
      const m = this.makeUvMark(text, 1.8, 0.45);
      m.mesh.removeFromParent();
      m.mat.opacity = 0.85;
      m.found = true;
      m.mesh.position.set(x, 1.6, z);
      m.mesh.rotation.y = ry;
      room.add(m.mesh);
    };
    wallText('ICI ILS NE VIENNENT PAS', cx, cz + W / 2 - 0.11, Math.PI);
    wallText('LE MUR SE REFERME', cx - W / 2 + 0.11, cz, Math.PI / 2);
    wallText('NE TRAÎNE PAS', cx + W / 2 - 0.11, cz, -Math.PI / 2);
    // Way out: on the south wall
    const exitDoor = door.clone();
    exitDoor.visible = true;
    exitDoor.position.set(cx, 1.05, cz - W / 2 + 0.11);
    exitDoor.rotation.set(0, 0, 0);
    room.add(exitDoor);
    this.map.sceneGroup.add(room);
    const mkBox = (x0: number, x1: number, z0: number, z1: number): CollisionBox => ({ min: new THREE.Vector3(x0, 0, z0), max: new THREE.Vector3(x1, H, z1) });
    const boxes = [
      mkBox(cx - W / 2 - 0.1, cx - W / 2 + 0.1, cz - W / 2, cz + W / 2),
      mkBox(cx + W / 2 - 0.1, cx + W / 2 + 0.1, cz - W / 2, cz + W / 2),
      mkBox(cx - W / 2, cx + W / 2, cz - W / 2 - 0.1, cz - W / 2 + 0.1),
      mkBox(cx - W / 2, cx + W / 2, cz + W / 2 - 0.1, cz + W / 2 + 0.1),
      mkBox(cx - 0.7, cx + 0.7, cz - 0.4, cz + 0.4),
    ];
    this.map.collisionBoxes.push(...boxes);
    // Loot on the table (the host decides, like every item in the world)
    if (this.net?.role !== 'guest') {
      const r = Math.random;
      const defs: Omit<GameItem, 'id'>[] = [
        [
          { name: 'Pile', type: 'battery', description: 'Recharge 55 % de la batterie de la lampe torche.', icon: 'BatteryCharging' },
          { name: 'Adrénaline', type: 'medkit', description: 'Auto-injecteur : endurance au maximum + 6 s de sprint illimité.', icon: 'HeartPulse' },
          { name: 'Seringue de Sédatif', type: 'sedative', description: 'Immobilise un monstre 5 secondes (à moins de 3 m, face à lui).', icon: 'Syringe' },
          BANDAGE_ITEM,
        ][Math.floor(r() * 4)] as Omit<GameItem, 'id'>,
        r() < 0.5 ? SMOKE_ITEM : TRAP_ITEM,
      ];
      const tapes = GALLERY_DOCS.filter((d) => d.chapter === 9);
      const fresh = tapes.filter((d) => !this.knownDocs.has(d.id));
      const tape = (fresh.length ? fresh : tapes)[Math.floor(r() * (fresh.length || tapes.length))];
      if (tape) defs.push({ name: tape.name, type: 'cassette', description: tape.text, lore: tape.text, icon: 'Disc', id: tape.id } as unknown as Omit<GameItem, 'id'>);
      defs.forEach((d, i) => {
        const id = (d as unknown as { id?: string }).id ?? `secret-${i}-${Math.floor(r() * 1e6)}`;
        this.spawnWorldItem({ ...d, id } as GameItem, new THREE.Vector3(cx - 0.45 + i * 0.45, 0.81, cz), r() * Math.PI, false);
      });
    }
    this.secret = {
      mark,
      door,
      at,
      dir,
      exitAt: new THREE.Vector3(cx, 0, cz - W / 2 + 0.15),
      inward: new THREE.Vector3(0, 0, 1),
      room,
      boxes,
      fixture,
      lit: 0,
      state: 'hidden',
      timeLeft: 0,
      inside: false,
      visited: false,
      warned: 999,
    };
  }
  private secretTeleport(pos: THREE.Vector3, face: THREE.Vector3) {
    this.player.teleport(pos, Math.atan2(-face.x, -face.z));
    this.secretFade = 0.5;
    this.blackout = 1;
    sound.playStairs();
  }
  private updateSecret(delta: number) {
    if (this.secretFade > 0) {
      this.secretFade -= delta;
      this.blackout = Math.max(0, this.secretFade / 0.5);
    }
    const s = this.secret;
    if (!s) return;
    const p = this.player;
    if (s.state === 'hidden') {
      if (s.mark.mat.opacity > 0.6) s.lit += delta;
      else s.lit = Math.max(0, s.lit - delta * 0.5);
      if (s.lit >= 1.5) {
        s.state = 'open';
        s.timeLeft = 120;
        s.door.visible = true;
        s.mark.mesh.visible = false;
        sound.playBreakerClunk();
        sound.playDistantSlam(0);
        p.shake = Math.max(p.shake, 0.35);
        this.state.showToast('🔮 Le mur glisse : un passage secret s\'ouvre ! Il se refermera dans 2 minutes.');
        this.pushHud();
      }
      return;
    }
    if (s.state !== 'open') return;
    s.timeLeft -= delta;
    const pos = p.position;
    // (no new trigger while the screen is still fading after a passage)
    if (this.secretFade > 0) {
      /* wait */
    } else if (!s.inside) {
      if (!p.isHidden && Math.hypot(pos.x - (s.at.x + s.dir.x * 0.35), pos.z - (s.at.z + s.dir.z * 0.35)) < 0.6) {
        s.inside = true;
        this.secretTeleport(s.exitAt.clone().addScaledVector(s.inward, 1.0), s.inward);
        if (!s.visited) {
          s.visited = true;
          const n = 30;
          if (this.net?.role === 'guest') this.net.send({ k: 'coins', n });
          else this.state.runCoins += n;
          this.state.showToast('🔮 Une salle cachée ! Ici, les monstres ne peuvent pas entrer. +30 🪙 — sortez avant que le mur se referme.');
        } else this.state.showToast('🔮 Vous revoilà dans la salle cachée. Surveillez le temps !');
      }
    } else {
      if (s.timeLeft <= 60 && s.warned > 60) this.state.showToast('⏳ Plus qu\'une minute avant que le passage se referme !');
      if (s.timeLeft <= 30 && s.warned > 30) this.state.showToast('⏳ 30 secondes ! Le mur commence à trembler…');
      if (s.timeLeft <= 10 && s.warned > 10) this.state.showToast('⏳ 10 secondes ! SORTEZ !');
      s.warned = Math.min(s.warned, s.timeLeft);
      if (Math.hypot(pos.x - s.exitAt.x, pos.z - s.exitAt.z) < 0.6) {
        s.inside = false;
        this.secretTeleport(s.at.clone().addScaledVector(s.dir, 1.4), s.dir);
      }
    }
    if (s.timeLeft <= 0) {
      s.state = 'closed';
      s.door.visible = false;
      sound.playDistantSlam(0);
      if (s.inside) {
        s.inside = false;
        this.secretTeleport(s.at.clone().addScaledVector(s.dir, 1.4), s.dir);
        p.shake = Math.max(p.shake, 0.6);
        this.state.showToast('🔮 Le passage se referme… Le mur vous recrache dans le couloir !');
      } else if (Math.hypot(pos.x - s.at.x, pos.z - s.at.z) < 25) this.state.showToast('🔮 Le passage secret s\'est refermé.');
      this.pushHud();
    }
  }

  // -----------------------------------------------------------------------
  // 📻 Walkie-talkie (co-op)
  // -----------------------------------------------------------------------
  private radioT = 0;
  private radioNoiseT = 0;
  private radioWasTalking = false;
  private hasTalkie() {
    return this.state.inventory.some((i) => i.type === 'talkie');
  }
  private radioCall() {
    if (!this.net || this.net.mode !== 'coop' || this.partnerGone) {
      sound.playStatic(0.4, 0.08);
      this.state.showToast('📻 Grrzzz… Personne au bout du fil. (Le talkie sert en coop.)');
      return;
    }
    const now = performance.now();
    if (now < this.radioT) return;
    this.radioT = now + 4000;
    const p = this.player.position;
    this.net.send({ k: 'radio', x: Math.round(p.x * 10) / 10, z: Math.round(p.z * 10) / 10 });
    sound.playStatic(0.35, 0.1);
    this.state.showToast('📻 Appel radio envoyé : l\'équipe sait où vous êtes.');
  }
  private hearRadio(from: string, x: number, z: number) {
    sound.playStatic(0.5, 0.12);
    const cam = this.camera.position;
    const dx = x - cam.x;
    const dz = z - cam.z;
    const d = Math.hypot(dx, dz);
    const yaw = this.camera.rotation.y;
    const f = (dx * -Math.sin(yaw) + dz * -Math.cos(yaw)) / Math.max(0.01, d);
    const r = (dx * Math.cos(yaw) + dz * -Math.sin(yaw)) / Math.max(0.01, d);
    const side = r > 0 ? 'à droite' : 'à gauche';
    const where = d < 3 ? 'juste à côté de vous' : `à ${Math.round(d)} m, ${f > 0.75 ? 'devant vous' : f < -0.75 ? 'derrière vous' : f > 0.3 ? `devant ${side}` : f < -0.3 ? `derrière ${side}` : `sur votre ${r > 0 ? 'droite' : 'gauche'}`}`;
    this.state.showToast(`📻 ${from} vous appelle : ${where}.`);
    // The radio crackles where you stand
    if (!this.spectating) this.alertAll(this.player.position.clone().setY(1.2), 5);
  }

  // -----------------------------------------------------------------------
  // 🧟 The Mimic: hides in a locker, imitates sounds, bursts out screaming
  // (each player has their own: it only shows itself to its victim)
  // -----------------------------------------------------------------------
  private mimic: {
    spot: HidingSpot;
    t: number;
    near: number;
    cool: number;
    burstT: number;
    body: MimicBody | null;
    from: THREE.Vector3;
    to: THREE.Vector3;
    dir: THREE.Vector3;
  } | null = null;
  private mimicMark: UvMark | null = null;
  private mimicMet = false;
  // -----------------------------------------------------------------------
  // 🕯️ L'Éteigneur (chapter 1, Difficile and up, solo): snuffs out the lights,
  // drinks your torch, and when it touches you the Patient Zero hears it.
  // The UV lamp and the power coming back make it flee.
  // -----------------------------------------------------------------------
  private shade: {
    body: ShadeBody;
    pos: THREE.Vector3;
    state: 'gone' | 'feed' | 'stalk';
    t: number;
    body01: number;
    eyes01: number;
    power: boolean;
  } | null = null;
  private shadeOff = new Map<FlickerLight, number>();
  private shadeWarn = { lights: false, drink: false, seen: false };
  private shadeGuestCd = 0;

  /** Host: the player the shadow drifts towards (closest one still standing) */
  private shadeTarget(from: THREE.Vector3) {
    const p = this.player;
    const cands: { x: number; z: number; hid: boolean }[] = [];
    if (!this.dying && !this.spectating) cands.push({ x: p.position.x, z: p.position.z, hid: p.isHidden });
    for (const { s, caught } of this.livePeers()) if (!s.dead && !caught) cands.push({ x: s.x, z: s.z, hid: s.hid });
    let best: { x: number; z: number; hid: boolean; d: number } | null = null;
    for (const c of cands) {
      const d = Math.hypot(c.x - from.x, c.z - from.z);
      if (!best || d < best.d) best = { ...c, d };
    }
    return best;
  }

  /** Guest: the host moves it; here we only draw it and feel it (torch, touch, UV) */
  private updateShadeGuest(delta: number) {
    const s = this.shade!;
    const p = this.player;
    const pp = p.position;
    this.shadeGuestCd -= delta;
    const dx = pp.x - s.pos.x;
    const dz = pp.z - s.pos.z;
    const d = Math.hypot(dx, dz);
    const fade = (cur: number, want: number) => cur + (want - cur) * (1 - Math.exp(-5 * delta));
    const alive = !this.dying && !this.spectating && !this.finished;
    if (alive && s.state === 'stalk') {
      if (d < 8 && p.flashlightOn) {
        p.flashlightBattery = Math.max(0, p.flashlightBattery - delta * 3);
        if (!this.shadeWarn.drink) {
          this.shadeWarn.drink = true;
          this.state.showToast('Ta lampe faiblit à vue d\'œil… quelque chose la boit. Éteins-la, ou trouve de la lumière.');
        }
      }
      if (d < 1.1 && this.shadeGuestCd <= 0) {
        this.shadeGuestCd = 5;
        p.flashlightBattery = Math.max(0, p.flashlightBattery - 40);
        this.lightsOutTimer = Math.max(this.lightsOutTimer, 3);
        this.fear = 1;
        this.damage = Math.max(this.damage, 0.5);
        p.shake = Math.max(p.shake, 0.7);
        sound.playStatic(1.2, 0.3);
        this.buzz([90, 40, 90]);
        this.net?.send({ k: 'noise', x: pp.x, z: pp.z, loud: 40, hid: false });
        this.net?.send({ k: 'shadeHit' } as GameMsg);
        this.state.showToast('Une main glacée te traverse… ta lampe meurt. Au loin, quelque chose t\'a entendu. Cache-toi !');
      }
      if (this.uvOn && p.flashlightOn && d < 10 && this.shadeGuestCd <= 0) {
        const fx = -Math.sin(p.yaw);
        const fz = -Math.cos(p.yaw);
        if ((-dx * fx + -dz * fz) / (d || 1) > 0.8) {
          this.shadeGuestCd = 3;
          this.net?.send({ k: 'shadeBurn' } as GameMsg);
          this.ach('uv_shade');
        }
      }
    }
    const show = s.state !== 'gone' && d < 18 && alive;
    s.body01 = fade(s.body01, show && !p.flashlightOn ? 1 : 0);
    s.eyes01 = fade(s.eyes01, show && d < 16 ? 1 : 0);
    s.body.group.position.copy(s.pos);
    s.body.group.rotation.y = Math.atan2(dx, dz);
    s.body.update(delta, s.body01, s.eyes01);
    if ((s.body01 > 0.5 || s.eyes01 > 0.5) && d < 10) this.markSeen('eteigneur');
  }

  // -----------------------------------------------------------------------
  // 🐈‍⬛ The hospital's black cat: follows you for a while, hisses when a
  // creature comes, scratches the furniture that hides something… and if you
  // run, it bolts with a yowl the creatures hear.
  // -----------------------------------------------------------------------
  private cat: {
    body: CatBody;
    pos: THREE.Vector3;
    yaw: number;
    state: 'away' | 'follow' | 'hiss' | 'scratch' | 'flee';
    t: number;
    stay: number;
    stuck: number;
    hissCd: number;
    scratchCd: number;
    goal: ContainerObject | null;
    speed: number;
    fleeDir: THREE.Vector3;
    /** pose drawn this frame (sent to the guests) / received from the host */
    pose: CatPose;
    netPose: CatPose;
    /** ✨ 1 game in 50: a golden cat */
    golden: boolean;
  } | null = null;
  private goldenDone = false;
  private catScratched = new Set<string>();
  private catWarn = { seen: false, hiss: false, scratch: false, flee: false };

  private setupCat() {
    this.cat?.body.dispose();
    this.cat = null;
    this.catScratched.clear();
    this.catWarn = { seen: false, hiss: false, scratch: false, flee: false };
    if (this.chapter > 2 || this.maze || this.forest || this.site || this.imp || this.vsRole || this.watchOnly || this.survival) return;
    const body = new CatBody();
    body.group.visible = false;
    this.scene.add(body.group);
    this.cat = { body, pos: new THREE.Vector3(), yaw: 0, state: 'away', t: 35 + Math.random() * 40, stay: 0, stuck: 0, hissCd: 0, scratchCd: 4, goal: null, speed: 0, fleeDir: new THREE.Vector3(), pose: 'sit', netPose: 'sit', golden: false };
    this.goldenDone = false;
    if (this.net?.role !== 'guest' && Math.random() < 0.02) {
      this.cat.golden = true;
      body.setGolden(true);
    }
  }

  private catBlocked(x: number, z: number) {
    const r = 0.12;
    return this.map.collisionBoxes.some((b) => !b.disabled && b.min.y < 0.45 && b.max.y > 0.08 && x > b.min.x - r && x < b.max.x + r && z > b.min.z - r && z < b.max.z + r);
  }

  /** Moves the cat towards (tx, tz), sliding along obstacles. Returns false when stuck. */
  private catStep(tx: number, tz: number, speed: number, delta: number) {
    const c = this.cat!;
    const dx = tx - c.pos.x;
    const dz = tz - c.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.05) return true;
    const step = Math.min(d, speed * delta);
    const nx = c.pos.x + (dx / d) * step;
    const nz = c.pos.z + (dz / d) * step;
    c.yaw = Math.atan2(dx, dz);
    if (!this.catBlocked(nx, nz)) c.pos.set(nx, 0, nz);
    else if (!this.catBlocked(nx, c.pos.z)) c.pos.x = nx;
    else if (!this.catBlocked(c.pos.x, nz)) c.pos.z = nz;
    else return false;
    return true;
  }

  /** Pops the cat up somewhere near you (cats do that) */
  private catAppear(near: THREE.Vector3, minD: number, maxD: number) {
    const c = this.cat!;
    for (let i = 0; i < 30; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = minD + Math.random() * (maxD - minD);
      const x = near.x + Math.cos(a) * d;
      const z = near.z + Math.sin(a) * d;
      if (this.catBlocked(x, z)) continue;
      // Same room / corridor: nothing tall between you and it
      if (this.map.collisionBoxes.some((b) => !b.disabled && b.max.y > 1.3 && b.min.y < 1 && segBox(near.x, near.z, x, z, b))) continue;
      c.pos.set(x, 0, z);
      return true;
    }
    return false;
  }

  /** Guest: the host moves the cat; here we draw it and hear it */
  private updateCatGuest(delta: number) {
    const c = this.cat!;
    const p = this.player;
    const d = Math.hypot(p.position.x - c.pos.x, p.position.z - c.pos.z);
    const was = c.pose;
    const now = c.netPose;
    c.body.group.visible = c.state !== 'away';
    if (c.state !== 'away' && now !== was) {
      if (now === 'hiss' && d < 18) {
        sound.playHiss(0.9);
        if (!this.catWarn.hiss && d < 14) {
          this.catWarn.hiss = true;
          this.state.showToast('😾 Le chat se hérisse et feule vers le couloir… Quelque chose approche. Cache-toi !');
        }
      }
      if (now === 'run' && was !== 'walk' && d < 20) sound.playMeow(d, 0, true);
      if (now === 'scratch' && !this.catWarn.scratch && d < 12) {
        this.catWarn.scratch = true;
        this.state.showToast('🐈‍⬛ Le chat gratte un meuble en miaulant doucement… Il y a peut-être quelque chose dedans.');
      }
    }
    if (c.state !== 'away' && !this.catWarn.seen && d < 10) {
      this.catWarn.seen = true;
      this.markSeen('chat');
      this.state.showToast('🐈‍⬛ Un chat noir vous suit… Ne courez pas près de lui, il hurlerait.');
    }
    c.pose = now;
    c.body.group.position.copy(c.pos);
    c.body.group.rotation.y = c.yaw;
    c.body.update(delta, now, now === 'run' ? 1 : 0.5);
  }

  /** Host: the team mate the cat follows (closest one still standing) */
  private catLeader() {
    const c = this.cat!;
    const p = this.player;
    const list: { x: number; z: number; yaw: number; sprint: boolean; hid: boolean }[] = [];
    if (!this.dying && !this.spectating) list.push({ x: p.position.x, z: p.position.z, yaw: p.yaw, sprint: p.isSprinting, hid: p.isHidden });
    for (const { s, caught } of this.livePeers()) if (!s.dead && !caught) list.push({ x: s.x, z: s.z, yaw: s.yaw, sprint: !!s.sp, hid: s.hid });
    let best = list[0] ?? null;
    for (const l of list) if (Math.hypot(l.x - c.pos.x, l.z - c.pos.z) < Math.hypot(best!.x - c.pos.x, best!.z - c.pos.z)) best = l;
    return { best, all: list };
  }

  private updateCat(delta: number) {
    const c = this.cat;
    if (!c) return;
    if (this.net?.role === 'guest') return this.updateCatGuest(delta);
    const p = this.player;
    const pp = p.position;
    c.t -= delta;
    c.hissCd -= delta;
    c.scratchCd -= delta;
    let pose: CatPose = 'sit';
    const dx = pp.x - c.pos.x;
    const dz = pp.z - c.pos.z;
    const d = Math.hypot(dx, dz);
    const pan = () => {
      const right = new THREE.Vector3(Math.cos(p.yaw), 0, -Math.sin(p.yaw));
      return Math.max(-1, Math.min(1, (-dx * right.x + -dz * right.z) / (d || 1)));
    };
    if (this.dying || this.finished || this.intro) {
      c.body.group.visible = c.state !== 'away' && !this.intro;
      c.body.update(delta, 'sit', 0);
      return;
    }

    if (c.state === 'away') {
      c.body.group.visible = false;
      if (c.t <= 0) {
        if (!p.isHidden && this.catAppear(pp, 4, 8)) {
          c.state = 'follow';
          c.stay = 60 + Math.random() * 40;
          c.stuck = 0;
          c.body.group.visible = true;
          sound.playMeow(Math.hypot(pp.x - c.pos.x, pp.z - c.pos.z), 0, false);
          this.markSeen('chat');
          if (c.golden) this.state.showToast('✨ Un chat… DORÉ ?! Il brille dans le noir. Laisse-le te suivre un moment, on dit qu\'il porte chance.', 7000);
          else if (!this.catWarn.seen) {
            this.catWarn.seen = true;
            this.state.showToast('🐈‍⬛ Un chat noir te fixe de ses yeux jaunes… Il a l\'air de vouloir te suivre. Ne cours pas, tu lui ferais peur.');
          }
        } else c.t = 6;
      }
      return;
    }
    c.body.group.visible = true;

    // 🏃 Someone runs near it: it bolts with a yowl the creatures hear
    const team = this.catLeader();
    const runner = team.all.find((q) => q.sprint && Math.hypot(q.x - c.pos.x, q.z - c.pos.z) < 4.5);
    if (c.state !== 'flee' && runner) {
      c.state = 'flee';
      c.t = 2.5;
      c.fleeDir.set(c.pos.x - runner.x, 0, c.pos.z - runner.z).normalize();
      sound.playMeow(d, pan(), true);
      this.alertAll(c.pos.clone().setY(0.5), 15);
      if (!this.catWarn.flee) {
        this.catWarn.flee = true;
        this.state.showToast('🐈‍⬛ MRRAAOOW ! Le chat s\'enfuit en hurlant… Ça s\'entend de loin.');
      }
    }

    // 😾 A creature is coming: it arches and hisses
    if (c.state === 'follow' || c.state === 'scratch') {
      const threat = this.monsters.find((m) => m.state !== 'STUNNED' && Math.hypot(m.position.x - c.pos.x, m.position.z - c.pos.z) < 11);
      if (threat && c.hissCd <= 0) {
        c.state = 'hiss';
        c.t = 2.6;
        c.hissCd = 14;
        c.yaw = Math.atan2(threat.position.x - c.pos.x, threat.position.z - c.pos.z);
        if (d < 18) sound.playHiss(0.9);
        if (!this.catWarn.hiss) {
          this.catWarn.hiss = true;
          this.state.showToast('😾 Le chat se hérisse et feule vers le couloir… Quelque chose approche. Cache-toi !');
        }
      }
    }

    if (c.state === 'flee') {
      pose = 'run';
      this.catStep(c.pos.x + c.fleeDir.x * 3, c.pos.z + c.fleeDir.z * 3, 6, delta);
      if (c.t <= 0) {
        c.state = 'away';
        c.t = 60 + Math.random() * 40;
      }
    } else if (c.state === 'hiss') {
      pose = 'hiss';
      if (c.t <= 0) c.state = 'follow';
    } else if (c.state === 'scratch' && c.goal) {
      const g = c.goal;
      const gd = Math.hypot(g.position.x - c.pos.x, g.position.z - c.pos.z);
      if (g.searched) {
        c.goal = null;
        c.state = 'follow';
      } else if (gd > 0.75) {
        pose = 'walk';
        if (!this.catStep(g.position.x, g.position.z, 2.2, delta)) {
          c.stuck += delta;
          if (c.stuck > 3) {
            c.goal = null;
            c.state = 'follow';
          }
        }
      } else {
        pose = 'scratch';
        c.yaw = Math.atan2(g.position.x - c.pos.x, g.position.z - c.pos.z);
        if (c.t <= 0) {
          c.t = 1.2;
          if (d < 14) sound.playChalk();
        }
        if (!this.catWarn.scratch && d < 12) {
          this.catWarn.scratch = true;
          this.state.showToast(`🐈‍⬛ Le chat gratte « ${g.name} » en miaulant doucement… Il y a peut-être quelque chose dedans.`);
        }
      }
    } else {
      // Following: a couple of metres behind the closest team mate
      c.stay -= delta;
      const L = team.best ?? { x: pp.x, z: pp.z, yaw: p.yaw };
      const bx = L.x + Math.sin(L.yaw) * 1.6;
      const bz = L.z + Math.cos(L.yaw) * 1.6;
      const bd = Math.hypot(bx - c.pos.x, bz - c.pos.z);
      if (bd > 0.6) {
        const spd = Math.min(3.6, 1 + bd * 0.8);
        pose = spd > 2.6 ? 'run' : 'walk';
        if (this.catStep(bx, bz, spd, delta)) c.stuck = 0;
        else c.stuck += delta;
        c.speed = spd / 3.6;
      } else c.yaw = Math.atan2(L.x - c.pos.x, L.z - c.pos.z);
      // Lost behind a wall or too far: it finds its own way (pops up near you later)
      const ld = Math.hypot(L.x - c.pos.x, L.z - c.pos.z);
      if (c.stuck > 2.5 || ld > 14) {
        c.stuck = 0;
        if (!this.catAppear(new THREE.Vector3(L.x, 0, L.z), 2, 4)) {
          c.state = 'away';
          c.t = 8;
        }
      }
      // Something hidden nearby? It goes and scratches the furniture
      if (c.scratchCd <= 0) {
        c.scratchCd = 3;
        let best: ContainerObject | null = null;
        let bestD = 7;
        for (const ct of this.map.containers.values()) {
          if (ct.searched || !ct.itemInside || ct.locked || this.catScratched.has(ct.id)) continue;
          const cd = Math.hypot(ct.position.x - c.pos.x, ct.position.z - c.pos.z);
          if (cd < bestD) {
            bestD = cd;
            best = ct;
          }
        }
        if (best) {
          this.catScratched.add(best.id);
          c.goal = best;
          c.state = 'scratch';
          c.stuck = 0;
          c.t = 0;
          sound.playMeow(d, pan(), false);
        }
      }
      if (c.stay <= 0 && c.state === 'follow') {
        c.state = 'away';
        c.t = 45 + Math.random() * 45;
        sound.playMeow(d, pan(), false);
      }
    }
    c.pose = pose;
    c.body.group.position.copy(c.pos);
    c.body.group.rotation.y = c.yaw;
    c.body.update(delta, pose, c.speed);
  }

  // -----------------------------------------------------------------------
  // 🧩 The code safe (chapter 1, solo): a safe somewhere, a 4-digit code
  // scribbled on a scrap of paper hidden in a drawer elsewhere. Both change
  // every game. Each wrong code beeps (and the creatures hear it).
  // -----------------------------------------------------------------------
  private puzzle: { code: string; mesh: THREE.Group; box: CollisionBox; wrong: number } | null = null;

  private setupPuzzle() {
    if (this.puzzle) {
      this.puzzle.mesh.removeFromParent();
      this.map.containers.delete('puzzle-safe');
      this.map.interactiveMeshes = this.map.interactiveMeshes.filter((m) => m !== this.puzzle!.mesh);
      this.map.collisionBoxes = this.map.collisionBoxes.filter((b) => b !== this.puzzle!.box);
      this.puzzle = null;
    }
    if (this.chapter !== 1 || this.maze || this.forest || this.site || this.imp || this.vsRole || this.survival || this.xmasNight || this.net) return;
    const spots = treatSpots(this.map, 16);
    if (spots.length < 4) return;
    const at = spots[Math.floor(Math.random() * spots.length)];
    // The scrap of paper goes into an empty drawer / cabinet far enough from the safe
    // (every piece of furniture holds something: the paper replaces a few coins / a snack, never a key)
    // (never in a secret room: the paper must always be reachable)
    const far = (c: ContainerObject) => !c.locked && !c.searched && !/secret|salle0/.test(c.id) && Math.hypot(c.position.x - at.x, c.position.z - at.z) > 8;
    let empty = [...this.map.containers.values()].filter((c) => far(c) && !c.itemInside);
    if (!empty.length) empty = [...this.map.containers.values()].filter((c) => far(c) && (c.itemInside?.type === 'coins' || c.itemInside?.type === 'food'));
    if (!empty.length) return;
    const code = String(Math.floor(1000 + Math.random() * 9000));
    const hide = empty[Math.floor(Math.random() * empty.length)];
    hide.itemInside = {
      id: 'note-puzzle-code',
      name: 'Bout de papier griffonné',
      type: 'note',
      description: `Griffonné à la hâte : « Coffre du gardien → ${code}. Ne le donne à PERSONNE. »`,
      lore: `Coffre du gardien → ${code}. Ne le donne à PERSONNE.\n\n(Un petit coffre métallique est caché quelque part dans l'hôpital.)`,
      icon: 'FileText',
    };
    // The safe: a small steel box with a glowing keypad
    const g = new THREE.Group();
    g.position.set(at.x, 0, at.z);
    g.rotation.y = Math.floor(Math.random() * 4) * (Math.PI / 2);
    const steel = new THREE.MeshStandardMaterial({ color: 0x2a2e33, metalness: 0.8, roughness: 0.4 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.7, 0.45), steel);
    body.position.y = 0.35;
    body.castShadow = true;
    g.add(body);
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.47, 0.6, 0.02), new THREE.MeshStandardMaterial({ color: 0x33383e, metalness: 0.85, roughness: 0.35 }));
    door.position.set(0, 0.35, 0.235);
    g.add(door);
    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 0.02), new THREE.MeshStandardMaterial({ color: 0x0a0a0a, emissive: 0x10ff60, emissiveIntensity: 0.35 }));
    pad.position.set(0.13, 0.42, 0.25);
    g.add(pad);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.03), new THREE.MeshBasicMaterial({ color: 0x30ff80 }));
    screen.position.set(0.13, 0.48, 0.262);
    g.add(screen);
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.01, 8, 18), new THREE.MeshStandardMaterial({ color: 0x9aa0a6, metalness: 0.9, roughness: 0.25 }));
    handle.position.set(-0.1, 0.35, 0.255);
    g.add(handle);
    g.traverse((o) => (o.userData = { ...o.userData, isContainer: true, containerId: 'puzzle-safe' }));
    // In the level group: that is what the interaction ray looks at
    this.map.sceneGroup.add(g);
    this.map.interactiveMeshes.push(g);
    const loot: Omit<GameItem, 'id'>[] = [
      { name: 'Seringue de Sédatif', type: 'sedative', description: 'Immobilise un monstre 5 secondes (à moins de 3 m, face à lui).', icon: 'Syringe' },
      { name: 'Adrénaline', type: 'medkit', description: 'Auto-injecteur : endurance au maximum + 6 s de sprint illimité.', icon: 'HeartPulse' },
      TRAP_ITEM,
      BANDAGE_ITEM,
    ];
    this.map.containers.set('puzzle-safe', {
      id: 'puzzle-safe',
      name: 'Coffre à code',
      type: 'safe',
      searched: false,
      itemInside: { id: `puzzle-loot-${Math.floor(Math.random() * 1e6)}`, ...loot[Math.floor(Math.random() * loot.length)] },
      position: new THREE.Vector3(at.x, 0.4, at.z),
      mesh: g,
      locked: true,
    });
    const box: CollisionBox = { min: new THREE.Vector3(at.x - 0.32, 0, at.z - 0.32), max: new THREE.Vector3(at.x + 0.32, 0.7, at.z + 0.32) };
    this.map.collisionBoxes.push(box);
    this.puzzle = { code, mesh: g, box, wrong: 0 };
  }

  /** 🧩 Keypad: true = the safe opens */
  public tryPuzzleCode(code: string): boolean {
    const pz = this.puzzle;
    const c = this.map.containers.get('puzzle-safe');
    if (!pz || !c || !c.locked) return false;
    if (code === pz.code) {
      c.locked = false;
      sound.playBreakerClunk();
      this.giveCoins(60);
      this.ach('puzzle_safe');
      this.state.showToast('🔓 Clac ! Le coffre s\'ouvre : +60 pièces, et il y a quelque chose dedans ([E] pour le prendre).');
      return true;
    }
    pz.wrong++;
    sound.playDoorLocked();
    sound.playAlarmRing(2);
    // The beep carries: the creatures nearby come and look
    this.alertAll(c.position.clone().setY(1.2), 12 + pz.wrong * 3);
    this.state.showToast(pz.wrong === 1 ? 'BIP BIP ! Mauvais code… et ça s\'entend.' : `BIP BIP ! Mauvais code (${pz.wrong}). Quelque chose a entendu…`);
    return false;
  }

  private setupShade() {
    this.shade?.body.dispose();
    this.shade = null;
    this.shadeOff.clear();
    this.shadeWarn = { lights: false, drink: false, seen: false };
    if (this.chapter !== 1 || this.difficulty < 3 || this.maze || this.forest || this.site) return;
    if (this.imp || this.vsRole || this.survival || this.xmasNight || (this.net && this.net.mode !== 'coop')) return;
    const body = new ShadeBody();
    body.update(0, 0, 0);
    this.scene.add(body.group);
    this.shade = { body, pos: new THREE.Vector3(), state: 'gone', t: 50 + Math.random() * 30, body01: 0, eyes01: 0, power: this.state.powerRestored };
  }

  /** A lit fixture the creature can reach, not too close to you */
  private shadePickLight() {
    const pp = this.player.position;
    const ok = this.map.lights.filter((l) => {
      if (this.shadeOff.has(l) || (l.needsPower && !this.state.powerRestored)) return false;
      const d = Math.hypot(l.position.x - pp.x, l.position.z - pp.z);
      return d > 7 && d < 28;
    });
    return ok.length ? ok[Math.floor(Math.random() * ok.length)] : null;
  }

  private shadeGone(seconds: number) {
    const s = this.shade;
    if (!s) return;
    s.state = 'gone';
    s.t = seconds;
  }

  private updateShade(delta: number) {
    for (const [l, t] of this.shadeOff) {
      if (t - delta <= 0) this.shadeOff.delete(l);
      else this.shadeOff.set(l, t - delta);
    }
    const s = this.shade;
    if (!s) return;
    if (this.net?.role === 'guest') return this.updateShadeGuest(delta);
    const p = this.player;
    const pp = p.position;
    const fade = (cur: number, want: number) => cur + (want - cur) * (1 - Math.exp(-5 * delta));
    if (this.dying || this.finished || this.pendingEnding || this.photo) {
      s.body.update(delta, (s.body01 = fade(s.body01, 0)), (s.eyes01 = fade(s.eyes01, 0)));
      return;
    }
    // The power is back: every light comes on again and it melts away
    if (this.state.powerRestored && !s.power) {
      s.power = true;
      this.shadeOff.clear();
      if (s.state !== 'gone') this.state.showToast('Le courant revient… une ombre maigre se dissout dans la lumière.');
      this.shadeGone(40);
    }
    s.t -= delta;
    const dx = pp.x - s.pos.x;
    const dz = pp.z - s.pos.z;
    const d = Math.hypot(dx, dz);
    let wantBody = 0;
    let wantEyes = 0;
    if (s.state === 'gone') {
      if (s.t <= 0) {
        const l = this.shadePickLight();
        if (!l) s.t = 8;
        else {
          s.pos.set(l.position.x, 0, l.position.z);
          s.state = 'feed';
          s.t = 2.2;
        }
      }
    } else if (s.state === 'feed') {
      // Under the lamp, the light stutters… then the whole room goes dark
      for (const l of this.map.lights) if (Math.hypot(l.position.x - s.pos.x, l.position.z - s.pos.z) < 3) l.k = Math.random() < 0.5 ? 0.1 : 1;
      wantEyes = d < 18 ? 1 : 0;
      if (s.t <= 0) {
        let n = 0;
        for (const l of this.map.lights) {
          if (Math.hypot(l.position.x - s.pos.x, l.position.z - s.pos.z) < 7.5) {
            this.shadeOff.set(l, 45);
            n++;
          }
        }
        if (n && d < 26) {
          sound.playFlickerHum();
          if (!this.shadeWarn.lights) {
            this.shadeWarn.lights = true;
            this.state.showToast('Les lumières s\'éteignent une à une, tout près… Quelque chose aime le noir.');
          }
        }
        s.state = 'stalk';
        s.t = 35;
      }
    } else {
      // Stalking: drifts through the walls towards the closest player, unless they stand in the light
      const tg = this.shadeTarget(s.pos);
      if (tg) {
        const inLight = this.map.lights.some((l) => l.current > 0.5 && !this.shadeOff.has(l) && Math.hypot(l.position.x - tg.x, l.position.z - tg.z) < 4.5);
        if (tg.d < 16 && !inLight && !tg.hid) {
          const step = Math.min(tg.d, 1.35 * delta);
          s.pos.x += ((tg.x - s.pos.x) / (tg.d || 1)) * step;
          s.pos.z += ((tg.z - s.pos.z) / (tg.d || 1)) * step;
        }
      }
      wantEyes = d < 16 ? 1 : 0;
      // 🟣 The UV lamp burns it
      if (this.uvOn && p.flashlightOn && d < 10) {
        const fx = -Math.sin(p.yaw);
        const fz = -Math.cos(p.yaw);
        if ((-dx * fx + -dz * fz) / (d || 1) > 0.8) {
          sound.playHiss(1.2);
          this.state.showToast('La lumière violette la brûle : l\'ombre se déchire et disparaît en sifflant.');
          this.ach('uv_shade');
          this.shadeGone(35);
        }
      }
      // It drinks your torch
      if (s.state === 'stalk' && d < 8 && p.flashlightOn && !this.spectating) {
        p.flashlightBattery = Math.max(0, p.flashlightBattery - delta * 3);
        if (!this.shadeWarn.drink) {
          this.shadeWarn.drink = true;
          this.state.showToast('Ta lampe faiblit à vue d\'œil… quelque chose la boit. Éteins-la, ou trouve de la lumière.');
        }
      }
      // Its touch: your light dies, and the Patient Zero heard it
      if (s.state === 'stalk' && d < 1.1 && !this.spectating) {
        p.flashlightBattery = Math.max(0, p.flashlightBattery - 40);
        this.lightsOutTimer = Math.max(this.lightsOutTimer, 3);
        this.fear = 1;
        this.damage = Math.max(this.damage, 0.5);
        p.shake = Math.max(p.shake, 0.7);
        sound.playStatic(1.2, 0.3);
        this.buzz([90, 40, 90]);
        this.alertAll(pp.clone().setY(1.2), 40);
        this.state.showToast('Une main glacée te traverse… ta lampe meurt. Au loin, quelque chose t\'a entendu. Cache-toi !');
        this.shadeGone(25);
      }
      if (s.state === 'stalk' && s.t <= 0) this.shadeGone(15 + Math.random() * 12);
    }
    // You only see it whole in the dark; with the torch on, just two eyes
    if (s.state !== 'gone' && d < 18) wantBody = p.flashlightOn ? 0 : 1;
    s.body01 = fade(s.body01, wantBody);
    s.eyes01 = fade(s.eyes01, s.state === 'gone' ? 0 : wantEyes);
    s.body.group.position.copy(s.pos);
    s.body.group.rotation.y = Math.atan2(dx, dz);
    s.body.update(delta, s.body01, s.eyes01);
    if ((s.body01 > 0.5 || s.eyes01 > 0.5) && d < 10) {
      this.markSeen('eteigneur');
      if (!this.shadeWarn.seen) {
        this.shadeWarn.seen = true;
        this.fear = Math.max(this.fear, 0.8);
      }
    }
  }

  private setupMimic() {
    this.mimic?.body?.dispose();
    this.mimic = null;
    this.disposeUvMark(this.mimicMark);
    this.mimicMark = null;
    const lockers = this.map.hidingSpots.filter((s) => s.kind === 'locker');
    if (this.maze || this.forest || this.site || this.imp || this.vsRole || this.watchOnly || this.survival || this.net?.mode === 'race') return;
    if (!this.monsters.length || lockers.length < 3) return;
    this.mimic = { spot: lockers[0], t: 25 + Math.random() * 20, near: 0, cool: 0, burstT: -1, body: null, from: new THREE.Vector3(), to: new THREE.Vector3(), dir: new THREE.Vector3() };
    this.mimicMark = this.makeUvMark(null, 0.5, 0.5);
    this.moveMimic();
  }
  private moveMimic() {
    const m = this.mimic;
    if (!m) return;
    // (the world can be built before the player exists)
    const p = this.player?.position ?? m.spot.position;
    const lockers = this.map.hidingSpots.filter((s) => s.kind === 'locker' && s.id !== m.spot.id && s.id !== this.player?.currentHidingSpotId);
    if (!lockers.length) return;
    const far = lockers.filter((s) => Math.hypot(s.position.x - p.x, s.position.z - p.z) > 15);
    const pool = far.length ? far : lockers;
    m.spot = pool[Math.floor(Math.random() * pool.length)];
    const s = m.spot.position;
    const f = m.spot.viewDirection;
    const mk = this.mimicMark;
    if (mk) {
      mk.mesh.position.set(s.x + f.x * 0.35, 1.25, s.z + f.z * 0.35);
      mk.mesh.lookAt(mk.mesh.position.x + f.x, 1.25, mk.mesh.position.z + f.z);
      mk.found = false;
      mk.mat.opacity = 0;
    }
  }
  private updateMimic(delta: number) {
    const m = this.mimic;
    if (!m) return;
    if (m.burstT >= 0) {
      this.animateMimicBurst(delta);
      return;
    }
    if (m.cool > 0) {
      m.cool -= delta;
      return;
    }
    const p = this.player;
    const s = m.spot.position;
    const d = Math.hypot(p.position.x - s.x, p.position.z - s.z);
    // Standing right in front of it for too long: it can't hold back
    if (!p.isHidden && d < 1.3) {
      m.near += delta;
      if (m.near > 2.2) {
        this.mimicBurst();
        return;
      }
    } else m.near = Math.max(0, m.near - delta);
    // Imitations, coming from its locker
    m.t -= delta;
    if (m.t <= 0) {
      m.t = 12 + Math.random() * 14;
      if (d > 4 && d < 24) this.mimicSound(d);
    }
  }
  private mimicSound(d: number) {
    const m = this.mimic!;
    const s = m.spot.position;
    const cam = this.camera.position;
    const yaw = this.camera.rotation.y;
    const dx = s.x - cam.x;
    const dz = s.z - cam.z;
    const pan = THREE.MathUtils.clamp((dx * Math.cos(yaw) - dz * Math.sin(yaw)) / Math.max(0.5, d), -1, 1) * 0.85;
    const partner = this.net?.mode === 'coop' && !this.partnerGone ? this.peerName : null;
    const kinds = ['steps', 'steps', 'knock', 'door', 'whisper'];
    if (partner) kinds.push('name', 'name');
    switch (kinds[Math.floor(Math.random() * kinds.length)]) {
      case 'steps':
        for (let i = 0; i < 5; i++) setTimeout(() => this.running && sound.playMonsterFootstep(d, pan, false), i * 430);
        break;
      case 'knock':
        for (let i = 0; i < 3; i++) setTimeout(() => this.running && sound.playPipeKnock(pan, Math.min(0.6, 3 / (1 + d * 0.3))), i * 260);
        break;
      case 'door':
        if (d < 14) sound.playDoorOpen();
        else sound.playDistantSlam(pan);
        break;
      case 'whisper':
        this.mimicSay(['Par ici…', 'Aide-moi…', 'Je suis là…', 'Viens voir…', 'Ouvre…'][Math.floor(Math.random() * 5)], d);
        break;
      case 'name':
        this.mimicSay(`${partner} ?… Viens…`, d);
        break;
    }
  }
  private mimicSay(text: string, d: number) {
    try {
      const ss = window.speechSynthesis;
      if (!ss || typeof SpeechSynthesisUtterance === 'undefined') {
        sound.playHiss(1.5);
        return;
      }
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'fr-FR';
      const v = ss.getVoices().find((x) => x.lang.startsWith('fr'));
      if (v) u.voice = v;
      u.pitch = 0.1;
      u.rate = 0.7;
      u.volume = Math.max(0.08, Math.min(0.7, 3.5 / (1 + d * 0.35)));
      ss.speak(u);
    } catch {
      /* no speech here */
    }
  }
  private mimicBurst() {
    const m = this.mimic;
    if (!m || m.burstT >= 0) return;
    const p = this.player;
    m.burstT = 0;
    m.near = 0;
    const s = m.spot.position;
    const b = new MimicBody();
    this.map.sceneGroup.add(b.group);
    m.body = b;
    m.from.set(s.x, 0, s.z);
    const dir = new THREE.Vector3(p.position.x - s.x, 0, p.position.z - s.z);
    const len = dir.length();
    if (len > 0.01) dir.divideScalar(len);
    else dir.copy(m.spot.viewDirection);
    m.dir.copy(dir);
    m.to.copy(m.from).addScaledVector(dir, Math.max(0.4, len - 1.1));
    b.group.position.copy(m.from);
    b.group.rotation.y = Math.atan2(dir.x, dir.z);
    sound.playJumpscareStinger();
    sound.playDoorSlam();
    setTimeout(() => this.running && sound.playMonsterChaseRoar(), 250);
    p.shake = Math.max(p.shake, 1);
    p.stamina = Math.min(p.stamina, 10);
    this.alertAll(s.clone().setY(1.2), 60);
    this.state.showToast(
      this.mimicMet
        ? '👁 Le Mimic jaillit du casier en hurlant ! Les monstres arrivent…'
        : '👁 UN MIMIC ! Il imitait les bruits depuis ce casier… Son hurlement a alerté tout l\'étage. FUYEZ !'
    );
    this.mimicMet = true;
    this.markSeen('mimic');
    this.pushHud();
  }
  private animateMimicBurst(delta: number) {
    const m = this.mimic!;
    const b = m.body;
    m.burstT += delta;
    const t = m.burstT;
    if (b) {
      const g = b.group;
      if (t < 0.28) {
        const k = 1 - Math.pow(1 - t / 0.28, 3);
        g.position.lerpVectors(m.from, m.to, k);
      } else if (t >= 1.1) {
        // It skitters up into the ceiling and is gone
        const u = (t - 1.1) / 0.7;
        g.position.y = u * u * 4;
        g.position.addScaledVector(m.dir, -delta * 3);
      }
      if (t < 1.1) {
        const pp = this.player.position;
        g.rotation.y = Math.atan2(pp.x - g.position.x, pp.z - g.position.z);
      }
      b.update(delta, t < 1.1);
    }
    if (t > 1.8) {
      b?.dispose();
      m.body = null;
      m.burstT = -1;
      m.cool = 30;
      this.moveMimic();
    }
  }

  // -----------------------------------------------------------------------
  // 📸 Photo mode [P]: free camera, filters, screenshot
  // -----------------------------------------------------------------------
  public photo = false;
  private photoFilter = 0;
  private photoHelp = true;
  private photoMsg: string | null = null;
  private photoShot = false;
  private photoPrevInput = false;
  private photoFov0 = 72;
  private photoCam = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, fov: 72 };
  private photoKeys = new Set<string>();
  private photoModel: RemotePlayer | null = null;
  static PHOTO_FILTERS = ['Normal', 'Noir et blanc', 'Sépia', 'VHS', 'Vision nocturne'];
  private get photoAllowed() {
    return (
      this.running && !this.paused && !this.dying && !this.finished && !this.intro && !this.pendingEnding && this.danceT < 0 &&
      !this.imp && !this.vsRole && this.net?.mode !== 'race' && !this.watchOnly && !this.spectating && !this.emoteWheel
    );
  }
  private togglePhoto(on = !this.photo) {
    if (on === this.photo || (on && !this.photoAllowed)) return;
    this.photo = on;
    const p = this.player;
    const c = this.camera;
    if (on) {
      this.photoPrevInput = p.inputEnabled;
      p.inputEnabled = false;
      this.photoFov0 = c.fov;
      // A step back, so you see yourself
      this.photoCam = { x: c.position.x + Math.sin(p.yaw) * 1.8, y: c.position.y + 0.15, z: c.position.z + Math.cos(p.yaw) * 1.8, yaw: p.yaw, pitch: -0.12, fov: c.fov };
      const m = new RemotePlayer('', new THREE.SpotLight(0xffffff, 0), new THREE.Object3D());
      m.showName = false;
      m.applyLook(this.localLook.human);
      m.apply(this.localNetState());
      m.update(0.016);
      this.scene.add(m.group);
      this.photoModel = m;
      this.photoMsg = null;
    } else {
      p.inputEnabled = this.photoPrevInput;
      c.fov = this.photoFov0;
      c.updateProjectionMatrix();
      if (this.photoModel) {
        this.scene.remove(this.photoModel.group);
        this.photoModel.dispose();
      }
      this.photoModel = null;
      this.photoKeys.clear();
      this.photoShot = false;
    }
    this.pushHud();
  }
  private updatePhoto(dt: number) {
    const c = this.photoCam;
    const k = this.photoKeys;
    const sp = (k.has('ShiftLeft') || k.has('ShiftRight') ? 0.9 : 2.6) * dt;
    const fx = -Math.sin(c.yaw);
    const fz = -Math.cos(c.yaw);
    let mx = 0;
    let mz = 0;
    let my = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) (mx += fx), (mz += fz);
    if (k.has('KeyS') || k.has('ArrowDown')) (mx -= fx), (mz -= fz);
    if (k.has('KeyA') || k.has('ArrowLeft')) (mx += fz), (mz -= fx);
    if (k.has('KeyD') || k.has('ArrowRight')) (mx -= fz), (mz += fx);
    if (k.has('Space')) my += 1;
    if (k.has('KeyC') || k.has('ControlLeft')) my -= 1;
    c.x += mx * sp;
    c.z += mz * sp;
    c.y += my * sp;
    // Stays close to you: no scouting the map from afar
    const pp = this.player.position;
    const dx = c.x - pp.x;
    const dz = c.z - pp.z;
    const dd = Math.hypot(dx, dz);
    if (dd > 6) {
      c.x = pp.x + (dx / dd) * 6;
      c.z = pp.z + (dz / dd) * 6;
    }
    c.y = THREE.MathUtils.clamp(c.y, 0.2, 3.2);
    const cam = this.camera;
    cam.position.set(c.x, c.y, c.z);
    cam.rotation.set(c.pitch, c.yaw, 0, 'YXZ');
    if (cam.fov !== c.fov) {
      cam.fov = c.fov;
      cam.updateProjectionMatrix();
    }
    const m = this.photoModel;
    if (m) {
      if (this.net) m.apply(this.localNetState());
      m.update(dt);
    }
  }
  private savePhoto() {
    try {
      const url = this.renderer.domElement.toDataURL('image/png');
      const d = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const a = document.createElement('a');
      a.download = `patient-zero-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.png`;
      a.href = url;
      document.body.appendChild(a);
      a.click();
      a.remove();
      sound.playFlashlightToggle(true);
      this.photoMsg = '📸 Photo enregistrée dans vos téléchargements !';
    } catch {
      this.photoMsg = 'Impossible d\'enregistrer la photo.';
    }
    this.pushHud();
    const msg = this.photoMsg;
    setTimeout(() => {
      if (this.photoMsg === msg) {
        this.photoMsg = null;
        this.pushHud();
      }
    }, 2200);
  }

  /** 🎡 Emote wheel [T]: the 8 emotes, picked with the mouse */
  public emoteWheel = false;
  private toggleEmoteWheel(open = !this.emoteWheel) {
    if (open && (!this.running || !this.net || this.net.mode === 'versus' || this.partnerGone)) return;
    this.emoteWheel = open;
    if (open) document.exitPointerLock?.();
    this.pushHud();
  }
  public pickEmote(i: number) {
    this.toggleEmoteWheel(false);
    if (i >= 0) this.sendEmote(i);
    this.requestLock();
  }

  /** 👋 Emotes (keys 6-9, and the wheel [T]) in co-op and race: shown above your head on the partner's screen. */
  private emoteCooldown = 0;
  private sendEmote(i: number) {
    if (!this.running || !this.net || this.net.mode === 'versus' || this.partnerGone) return;
    const now = performance.now();
    if (now < this.emoteCooldown) return;
    this.emoteCooldown = now + 1200;
    this.net.send({ k: 'emote', e: i });
    this.state.showToast(`Vous : ${EMOTES[i]}`);
  }

  /** 👀 Spectator: messages meant for the real guest are not for us */
  private static WATCH_IGNORE = new Set(['caught', 'coins', 'ach', 'used', 'stun', 'blind', 'pounce', 'raceEnd', 'vsEnd', 'toast', 'resync']);
  private onNetMsg(msg: GameMsg, from?: string) {
    const to = (msg as { to?: string }).to;
    // A personal message for another guest
    if (to && to !== '*' && to !== this.net?.selfName) return;
    const prev = this.cur;
    const prevReply = this.replyTo;
    const pi = from ? this.peers.findIndex((q) => q.name === from) : -1;
    if (pi >= 0) this.cur = pi;
    this.replyTo = this.net?.role === 'host' && pi >= 0 ? from! : null;
    try {
      this.handleNet(msg);
    } finally {
      this.cur = prev;
      this.replyTo = prevReply;
    }
  }
  private handleNet(msg: GameMsg) {
    const host = this.net?.role === 'host';
    if (this.watchOnly && GameEngine.WATCH_IGNORE.has(msg.k)) return;
    switch (msg.k) {
      case 'pact':
        if (host && this.site instanceof CircusTent) this.site.answer('guest', msg.yes);
        break;
      case 'imps':
        if (!host && this.imp) this.imp.netApply(msg.s);
        break;
      case 'ikill':
        if (host && this.imp && this.peerName === this.imp.impostor) {
          const a = this.remote?.state;
          const b = this.impPosOf(msg.t);
          if (a && b && Math.hypot(a.x - b.x, a.z - b.z) < IMP_RANGE + 1.2) this.applyImpEvents(this.imp.kill(msg.t));
        }
        break;
      case 'ivote':
        if (host && this.imp) {
          this.imp.vote(this.peerName, msg.t);
          this.impSendT = 0;
        }
        break;
      case 'isay':
        if (this.imp && typeof msg.i === 'number') this.impHear(this.peerName, msg.i, typeof msg.t === 'string' ? msg.t : undefined);
        break;
      case 'iprot':
        if (host && this.imp) this.imp.protectFor(this.peerName, msg.t);
        break;
      case 'imkill':
        this.impDie(msg.x, msg.z);
        break;
      case 'imout':
        this.impOut();
        break;
      case 'resync':
        // A spectator arrived: full snapshot + our look again
        this.lastWorldSent = -1;
        this.lastNotesSent = -1;
        this.net?.send({ k: 'look', a: this.localLook });
        break;
      case 'p':
        this.remote?.apply(msg.s);
        break;
      case 'snap':
        if (!host) this.applySnapshot(msg.w);
        break;
      case 'shadeHit':
        if (host) this.shadeGone(25);
        break;
      case 'shadeBurn':
        if (host && this.shade && this.shade.state !== 'gone') {
          sound.playHiss(1.2);
          this.shout('La lumière violette la brûle : l\'ombre se déchire et disparaît en sifflant.');
          this.shadeGone(35);
        }
        break;
      case 'noise':
        if (this.vsRole === 'monster') this.markers?.add(new THREE.Vector3(msg.x, 1.2, msg.z), msg.loud);
        else if (host) this.alertAll(new THREE.Vector3(msg.x, 1.2, msg.z), msg.loud, msg.hid);
        break;
      case 'pounce': {
        // Versus: the creature player lunged at us
        const s = this.remote?.state;
        const d = s ? Math.hypot(s.x - this.player.position.x, s.z - this.player.position.z) : 99;
        if (this.vsRole === 'survivor' && this.puppet && !this.dying && !this.finished && d < 4) this.startDeath(this.puppet);
        break;
      }
      case 'vsEnd':
        // the clock of whoever ended the round (hide-and-seek times)
        if (typeof msg.left === 'number') this.timeLeft = msg.left;
        this.versusEnd(msg.winner, msg.reason, msg.ending, false);
        break;
      case 'blind':
        if (this.vsRole === 'monster' && !this.finished) this.startBlind(msg.s);
        break;
      case 'raceEnd':
        if (!host) this.raceEnd(msg.winner, msg.ending);
        break;
      case 'stun':
        if (this.vsRole === 'monster' && !this.finished) this.monsterStun(msg.s);
        break;
      case 'look':
        this.partnerLook = msg.a;
        this.applyLooks();
        break;
      case 'act':
        if (host) this.handleRemoteAct(msg.req);
        break;
      case 'ach':
        this.ach(msg.id);
        break;
      case 'emote':
        if (msg.e >= 0 && msg.e < EMOTES.length) {
          this.remote?.showEmote(EMOTES[msg.e]);
          this.remote?.gesture(msg.e);
          this.state.showToast(`${this.peerName} : ${EMOTES[msg.e]}`);
        }
        break;
      case 'coins':
        this.state.runCoins += msg.n;
        this.state.showToast(`🪙 +${msg.n} pièces (gardées si vous sortez de l'hôpital)`);
        sound.playItemPickup();
        break;
      case 'smoke':
        this.spawnSmokeFx(msg.x, msg.z);
        break;
      case 'trap': {
        const d = Math.hypot(msg.x - this.player.position.x, msg.z - this.player.position.z);
        sound.playTrapSnap(d);
        if (d < 30) {
          this.state.showToast('🪤 CLAC ! Un monstre est pris dans le piège : 6 secondes pour filer !');
          this.ach('trap');
        }
        break;
      }
      case 'rev':
        if (this.net?.role === 'guest' && typeof msg.e === 'string') this.applyRandomEvent(msg.e, msg.x, msg.z);
        break;
      case 'radio':
        if (typeof msg.x === 'number' && typeof msg.z === 'number') this.hearRadio(this.peerName, msg.x, msg.z);
        break;
      case 'mark':
        if (typeof msg.x === 'number' && typeof msg.z === 'number' && ['danger', 'item', 'hide'].includes(msg.m)) {
          this.addMapMark(msg.x, msg.z, msg.m, false);
          this.state.showToast(`🗺️ ${this.peerName} a marqué ${msg.m === 'danger' ? 'un danger' : msg.m === 'item' ? 'un objet' : 'une cachette'} sur la carte [M].`);
        }
        break;
      case 'unmark':
        if (typeof msg.x === 'number' && typeof msg.z === 'number') this.removeMapMark(msg.x, msg.z, false);
        break;
      case 'alarm': {
        const d = Math.hypot(msg.x - this.player.position.x, msg.z - this.player.position.z);
        sound.playAlarmRing(d);
        if (d < 25) this.ach('alarm');
        break;
      }
      case 'slot':
        if (host) this.handleRemoteSlot(msg.i);
        break;
      case 'flip':
        if (host) this.handleRemoteFlip(msg.power);
        break;
      case 'toast':
        this.state.showToast(msg.msg);
        break;
      case 'used':
        this.applyUsedItem(msg.item);
        break;
      case 'fx':
        if (msg.name === 'screamer') {
          const body = this.map.containers.get('body-moreau')?.mesh;
          if (body && !this.screamerDone) this.triggerScreamer(body, !!msg.mine);
        } else if (msg.name === 'powerUp') {
          sound.playBreakerClunk();
          sound.playPowerUp();
          this.player.shake = 0.3;
        } else if (msg.name === 'vending') {
          sound.playVendingDispense();
        } else if (msg.name === 'flipResult' && msg.result) {
          this.onFlipResult(msg.result as FlipResult, 'local');
        }
        break;
      case 'caught': {
        const m = msg.m === -1 ? this.crawler : this.monsters[msg.m];
        // (coins / alarm messages are handled below)
        if (msg.hurt && !this.wounded && !this.dying && !this.spectating) this.wound(m instanceof MonsterAI ? m : null);
        else if (m && !this.dying && !this.spectating && this.woundGrace <= 0) this.startDeath(m);
        break;
      }
      case 'end':
        if (!host) this.triggerEnding(msg.ending);
        break;
      case 'gameover':
        if (!host && !(this.finished && !this.spectating)) {
          this.dying = false;
          this.endGameOver();
        }
        break;
    }
  }

  /** Host: run an interaction on behalf of the guest. */
  private handleRemoteAct(req: InteractRequest) {
    let t: InteractTarget | null = null;
    switch (req.kind) {
      case 'door': {
        const door = this.map.doors.get(req.id);
        if (door) t = { kind: 'door', door };
        break;
      }
      case 'container':
        t = { kind: 'container', id: req.id };
        break;
      case 'can': {
        const mesh = this.cans.meshes[req.idx];
        if (mesh) t = { kind: 'can', mesh };
        break;
      }
      case 'pickup':
        t = { kind: 'pickup', uid: req.uid };
        break;
      case 'drop':
        this.asRemote(() => {
          const s = this.remote?.state;
          if (s) this.dropFrom(req.idx, new THREE.Vector3(s.x, 0, s.z), s.yaw);
        });
        return;
      case 'give':
        this.asRemote(() => this.state.addItem(req.item));
        return;
      case 'level':
        this.remoteLevelAct();
        return;
      default:
        t = { kind: req.kind };
    }
    if (!t) return;
    this.asRemote(() => this.performInteraction(t!));
  }

  /** Host: the guest pressed [E] next to a forest / Site B object. */
  private remoteLevelAct() {
    const s = this.remote?.state;
    if (!s || s.dead || this.finished || this.pendingEnding) return;
    const pos = new THREE.Vector3(s.x, 0, s.z);
    if (this.forest) {
      const r = this.forest.interact(pos);
      if (r?.rescue) this.triggerEnding('RESCUE');
      else if (r?.msg) this.shout(r.msg);
    } else if (this.site) {
      const r = this.site.interact(pos, 1);
      if (r?.coins) this.asRemote(() => this.giveCoins(r.coins!));
      if (r?.ending) this.triggerEnding(r.ending);
      else if (r?.msg) this.shout(r.msg);
    }
    this.pushHud();
  }

  /** Runs `fn` as the guest: toasts it produces are sent to them, not shown here. */
  private asRemote(fn: () => void) {
    const before = this.state.toastMessage;
    this.actor = 'remote';
    try {
      this.withRaceKit(fn);
    } finally {
      this.actor = 'local';
    }
    const after = this.state.toastMessage;
    if (after && after !== before) {
      this.net?.send({ k: 'toast', msg: after });
      this.state.toastMessage = before;
    }
  }

  private remoteEye() {
    const s = this.remote?.state;
    return s ? new THREE.Vector3(s.x, s.y, s.z) : this.camera.position.clone();
  }

  private handleRemoteSlot(i: number) {
    this.withRaceKit(() => this.remoteSlot(i));
  }

  private remoteSlot(i: number) {
    const item = this.state.inventory[i];
    if (!item) return;
    if (item.type === 'throwable') {
      const s = this.remote?.state;
      if (!s) return;
      this.state.removeItem(item.id);
      const fwd = new THREE.Vector3(-Math.sin(s.yaw), 0, -Math.cos(s.yaw));
      this.cans.throw(this.remoteEye().addScaledVector(fwd, 0.3).add(new THREE.Vector3(0, -0.15, 0)), s.yaw, s.pitch);
    } else if (item.type === 'sedative') {
      // Inject from the guest's position, as the guest
      const s = this.remote?.state;
      if (!s) return;
      this.asRemote(() => {
        if (this.applySedative(this.remoteEye(), s.yaw)) {
          this.state.removeItem(item.id);
          this.state.showToast('💉 Le monstre s\'effondre ! Vous avez 5 secondes, fuyez !');
        } else {
          this.state.showToast('Trop loin : approchez-vous du monstre (moins de 3 m, face à lui).');
        }
      });
    } else if (item.type === 'battery' || item.type === 'medkit' || item.type === 'food' || item.type === 'bandage') {
      this.state.removeItem(item.id);
      this.net?.send({ k: 'used', item });
    } else if (item.type === 'alarm' || item.type === 'trap') {
      const s = this.remote?.state;
      if (s) this.dropFrom(i, new THREE.Vector3(s.x, 0, s.z), s.yaw);
    } else if (item.type === 'smoke') {
      const s = this.remote?.state;
      if (!s) return;
      this.state.removeItem(item.id);
      this.lightSmoke(s.x, s.z);
    } else {
      this.net?.send({ k: 'toast', msg: `${item.name} — s'utilise automatiquement avec [E] au bon endroit.` });
    }
  }

  private handleRemoteFlip(power: number) {
    this.withRaceKit(() => this.remoteFlip(power));
  }

  private remoteFlip(power: number) {
    const item = this.canInHand();
    const s = this.remote?.state;
    if (!item || !s) return;
    this.state.removeItem(item.id);
    const fwd = new THREE.Vector3(-Math.sin(s.yaw), 0, -Math.cos(s.yaw));
    const from = this.remoteEye().addScaledVector(fwd, 0.35);
    from.y = Math.max(0.5, s.y - 0.5);
    this.cans.flip(from, s.yaw, power, 'remote');
  }

  /** Guest: the host consumed one of our team items for us. */
  private applyUsedItem(item: GameItem) {
    const p = this.player;
    if (item.type === 'battery') {
      p.flashlightBattery = Math.min(100, p.flashlightBattery + (this.challenge === 'nolamp' ? 25 : 55));
      sound.playFlashlightToggle(true);
      this.state.showToast('Pile insérée : +55 % de batterie.');
    } else if (item.type === 'medkit') {
      p.stamina = p.maxStamina;
      p.freeSprint = 6;
      sound.playItemPickup();
      this.state.showToast('💉 Adrénaline ! Endurance au maximum + 6 s de sprint illimité.');
    } else if (item.type === 'food') {
      p.stamina = Math.min(p.maxStamina, p.stamina + 40);
      sound.playPaperRustle();
      this.state.showToast('Miam. Vous reprenez votre souffle (+40 endurance).');
    } else if (item.type === 'bandage') {
      this.healWound();
    }
  }

  /** Spectator camera: see through the partner's eyes. */
  private updateSpectator() {
    const r = this.remote;
    if (!r?.state) return;
    r.eye(this.camera.position);
    this.camera.rotation.set(r.pitch, r.yaw, 0, 'YXZ');
    this.player.flashlightOn = false;
    this.player.flashlight.intensity = 0;
  }

  public start() {
    this.running = true;
    this.paused = false;
    this.player.inputEnabled = true;
    this.lastTime = performance.now();
    this.applyUpgrades();
    this.startMic();
  }

  /** 🔧 Atelier levels for the next run (the app leaves it empty for ranked games) */
  public upgrades: Record<string, number> = {};
  private lampHex() {
    return lampOf(this.localLook.human.lamp).color;
  }

  // -----------------------------------------------------------------------
  // 🩸 Whispers: now and then, when a creature prowls nearby (not chasing),
  // a voice whispers your name in the dark.
  // -----------------------------------------------------------------------
  /** your username (the app sets it) */
  public whisperName = '';
  private whisperCd = 50 + Math.random() * 40;
  private updateWhisper(delta: number) {
    if (this.settings.whispers === false || !this.whisperName || this.net || this.vsRole || this.imp || this.survival || this.intro || this.watchOnly || this.photo) return;
    this.whisperCd -= delta;
    if (this.whisperCd > 0) return;
    let best = Infinity;
    let chasing = false;
    for (const m of this.monsters) {
      if (!m.mesh.visible) continue;
      best = Math.min(best, m.mesh.position.distanceTo(this.player.position));
      if (m.state === 'CHASE') chasing = true;
    }
    if (chasing || best < 5 || best > 20) {
      this.whisperCd = 6;
      return;
    }
    this.whisperCd = 75 + Math.random() * 75;
    this.whisper();
  }
  public whisper() {
    const n = this.whisperName;
    const lines = [`${n}…`, `Je t'entends, ${n}…`, `${n}… je sais où tu es…`, `Viens jouer, ${n}…`, `Tu ne sortiras pas, ${n}…`, `${n}… retourne-toi…`];
    const line = lines[Math.floor(Math.random() * lines.length)];
    sound.playBreath(0.8);
    this.state.showToast(`🩸 « ${line} »`, 3500);
    const ss = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
    if (!ss || typeof SpeechSynthesisUtterance === 'undefined') return;
    try {
      const u = new SpeechSynthesisUtterance(line.replace(/…/g, '...'));
      u.lang = 'fr-FR';
      const v = ss.getVoices().find((x) => x.lang.toLowerCase().startsWith('fr'));
      if (v) u.voice = v;
      u.pitch = 0.1;
      u.rate = 0.7;
      u.volume = Math.min(1, sound.sfxLevel() * 0.8);
      ss.cancel();
      ss.speak(u);
    } catch {
      /* no voice: the subtitle is enough */
    }
  }

  private applyUpgrades() {
    const fx = upgradeEffects(this.vsRole || this.imp ? {} : this.upgrades);
    const p = this.player;
    const ch = this.challenge;
    p.beamMul = fx.beam;
    p.flashlight.distance = 24 * (1 + (fx.beam - 1) * 0.6);
    p.noiseMul = fx.noise;
    // 🔦 your collectible lamp: colour, and a small bonus for the rare ones
    const lamp = this.vsRole === 'monster' ? lampOf('') : lampOf(this.localLook.human.lamp);
    p.flashlight.color.setHex(lamp.color);
    p.flashlight.angle = (Math.PI / 6.2) * lamp.width;
    this.baseDrain = (ch === 'dim' ? 3 : ch === 'dive' ? 2 : 1) * fx.drain * (this.vsRole || this.imp ? 1 : lamp.drain);
    p.batteryDrainMul = this.baseDrain;
    // 🩹 Starting kit
    const kit: Omit<GameItem, 'id'>[] = [];
    if (fx.kit >= 1) kit.push(BANDAGE_ITEM);
    if (fx.kit >= 2) kit.push({ name: 'Pile', type: 'battery', description: 'Recharge 55 % de la batterie de la lampe torche.', icon: 'BatteryCharging' });
    if (fx.kit >= 3) kit.push(BANDAGE_ITEM);
    // Team pockets live on the host: the guest hands its kit over (the host's bag size counts)
    if (this.net?.role === 'guest') {
      if (this.survival || this.imp || this.vsRole) return;
      const net = this.net;
      kit.forEach((d, i) => setTimeout(() => net.send({ k: 'act', req: { kind: 'give', item: { id: `kit-g${i}-${Math.floor(Math.random() * 1e6)}`, ...d } } }), 1500 + i * 300));
      return;
    }
    this.state.maxInventorySlots = ch === 'pack3' ? 3 : fx.slots;
    if (this.survival || this.imp || this.vsRole) return;
    kit.forEach((d, i) => {
      if (this.state.inventory.length < this.state.maxInventorySlots) this.state.inventory.push({ id: `kit-${i}-${Math.floor(Math.random() * 1e6)}`, ...d });
    });
  }

  public stop() {
    this.running = false;
    this.player.inputEnabled = false;
    sound.setHeartbeat(60, false);
    this.mic.stop();
  }

  /** Online with the voice chat on: the microphone is needed even if the creature can't hear it. */
  private get wantsVoice() {
    return !!this.net && !this.partnerGone && this.peers.length <= 1 && this.settings.voiceChat !== false;
  }
  /** The creature hears your real voice (not the creature player itself). */
  private get micNoise() {
    return this.settings.micEnabled && this.vsRole !== 'monster';
  }

  private startMic() {
    if (!(this.micNoise || this.wantsVoice) || this.mic.status === 'on' || this.mic.status === 'starting') return;
    this.mic.sensitivity = this.settings.micSensitivity;
    const voice = this.wantsVoice;
    this.mic.start().then((status) => {
      if (status === 'denied')
        this.state.showToast(voice ? 'Micro refusé : votre partenaire ne pourra pas vous entendre (autorisez le micro dans le navigateur).' : 'Micro refusé : le monstre ne vous entendra pas parler (autorisez le micro pour plus de frissons).');
      else if (status === 'unavailable')
        this.state.showToast(location.protocol === 'http:' && !/^(localhost|127\.)/.test(location.hostname) ? 'Micro bloqué en http : utilisez le lien https (trycloudflare) pour le chat vocal.' : 'Aucun micro détecté : la voix est désactivée.');
      else if (status === 'on')
        this.state.showToast(voice ? '🎙 Chat vocal de proximité actif — plus vous êtes loin, moins il vous entend. [V] coupe le micro.' : '🎙 Micro actif — chuchotez… il entend votre voix.');
      this.pushHud();
    });
  }

  /** Your real voice becomes in-game noise. */
  private updateMic(delta: number) {
    this.mic.update(delta);
    this.micCooldown -= delta;
    this.micHeardTimer = Math.max(0, this.micHeardTimer - delta);
    const lvl = this.mic.level;
    if (!this.micNoise || this.mic.status !== 'on' || lvl < MIC_THRESHOLD || this.micCooldown > 0) return;
    this.micCooldown = 0.45;
    // Talking ≈ 6 m, shouting ≈ 30 m
    const loudness = 6 + ((lvl - MIC_THRESHOLD) / (1 - MIC_THRESHOLD)) * 24;
    if (this.vsRole === 'survivor') {
      // The creature player sees your voice as a red ring
      this.alertAll(this.player.position, loudness, this.player.isHidden);
      if (this.puppet && this.puppet.position.distanceTo(this.player.position) < loudness * 0.8) this.micHeardTimer = 1.5;
      return;
    }
    if (this.net?.role === 'guest') {
      this.alertAll(this.player.position, loudness, this.player.isHidden);
      const near = this.nearestMonster();
      if (near && near.dist < loudness * 0.8) this.micHeardTimer = 1.5;
      return;
    }
    for (const m of this.monsters) {
      const before = m.state;
      m.alertNoise(this.player.position, loudness, this.map.collisionBoxes, this.player.isHidden);
      const reacted = before !== m.state || m.state === 'INVESTIGATE' || m.state === 'LISTEN';
      if (reacted && m.position.distanceTo(this.player.position) < loudness) this.micHeardTimer = 1.5;
    }
  }

  public setPaused(p: boolean, suspendAudio = p) {
    if (this.net && this.running) {
      // Online: the hospital never stops, a menu only takes your hands off the controls
      this.paused = false;
      this.menuOpen = p;
      this.player.inputEnabled = !p && !this.dying && !this.pendingEnding && !this.spectating;
      sound.setPaused(false);
      return;
    }
    this.paused = p;
    this.player.inputEnabled = !p && this.running && !this.dying && !this.pendingEnding;
    if (p) sound.setHeartbeat(60, false);
    sound.setPaused(suspendAudio);
    this.lastTime = performance.now();
  }

  /** Phone / tablet: on-screen controls, no pointer lock. */
  public touchMode = false;

  /** Touch buttons for actions that are bound to keys on a computer. */
  public flipPress() {
    this.startFlipCharge();
  }
  public flipRelease() {
    this.releaseFlip();
  }
  public blindPress() {
    this.tryBlind();
  }
  public toggleFlashlight() {
    if (this.player.inputEnabled && !this.player.isHidden && this.vsRole !== 'monster') this.player.toggleFlashlight();
  }

  public requestLock() {
    if (this.touchMode) return; // fingers, not a mouse
    if (this.player.freeLook) return; // pointer lock is not available here
    const el = this.renderer.domElement as HTMLCanvasElement & { requestPointerLock?: () => Promise<void> | void };
    const fallback = (err?: unknown) => {
      // "Too soon after Esc" is transient; anything else means this browser forbids pointer lock
      const msg = String(err ?? '');
      if (/too soon|exited the lock|user gesture/i.test(msg)) return;
      this.enableFreeLook();
    };
    if (!el.requestPointerLock) return this.enableFreeLook();
    try {
      const r = el.requestPointerLock();
      if (r && typeof (r as Promise<void>).catch === 'function') (r as Promise<void>).catch(fallback);
      else
        // Older browsers without a promise: check a moment later
        setTimeout(() => {
          if (document.pointerLockElement !== el) fallback();
        }, 600);
    } catch (err) {
      fallback(err);
    }
  }

  private enableFreeLook() {
    if (this.player.freeLook) return;
    this.player.freeLook = true;
    this.pushHud();
  }

  public applySettings(s: ControlSettings) {
    const shadowsChanged = s.shadowsEnabled !== this.renderer.shadowMap.enabled;
    this.settings = { ...s };
    this.player && (this.player.settings = this.settings);
    this.renderer.shadowMap.enabled = s.shadowsEnabled;
    if (this.player) this.player.flashlight.castShadow = s.shadowsEnabled;
    if (shadowsChanged) {
      this.scene.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
        if (!m) return;
        (Array.isArray(m) ? m : [m]).forEach((mm) => (mm.needsUpdate = true));
      });
    }
    this.mic.sensitivity = s.micSensitivity;
    this.voice.enabled = s.voiceChat !== false;
    if (!this.micNoise && !this.wantsVoice) this.mic.stop();
    else if (this.running) this.startMic();

    // Graphics quality: a fixed level, or "auto" (adapts to the device)
    const q = s.quality ?? 'auto';
    if (q === 'auto') {
      // Bloom alone costs as much as the whole scene on integrated GPUs
      this.bloom.enabled = !s.performanceMode && !this.lowEndGpu;
      this.maxPixelRatio = s.performanceMode ? 0.7 : this.lowEndGpu ? 0.85 : Math.min(window.devicePixelRatio, 1.25);
      this.setPixelRatio(Math.min(this.lowEndGpu ? 0.75 : this.pixelRatio, this.maxPixelRatio));
    } else {
      this.bloom.enabled = q !== 'low';
      this.maxPixelRatio = q === 'low' ? 0.6 : q === 'medium' ? 0.9 : q === 'high' ? Math.min(window.devicePixelRatio, 1.25) : Math.min(window.devicePixelRatio, 2);
      this.setPixelRatio(this.maxPixelRatio);
      const shadows = q === 'high' || q === 'ultra';
      if (this.renderer.shadowMap.enabled !== shadows) {
        this.renderer.shadowMap.enabled = shadows;
        if (this.player) this.player.flashlight.castShadow = shadows;
        this.scene.traverse((o) => {
          const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
          if (m) (Array.isArray(m) ? m : [m]).forEach((mm) => (mm.needsUpdate = true));
        });
      }
    }
    this.perfCooldown = 2;
  }

  private setPixelRatio(pr: number) {
    this.pixelRatio = pr;
    this.renderer.setPixelRatio(pr);
    this.composer.setPixelRatio(pr);
    this.onResize();
  }

  /**
   * Dynamic resolution: lowers the render scale when the frame rate drops
   * (integrated GPUs) and raises it back when there is headroom.
   */
  private adaptResolution(realDelta: number) {
    // A fixed quality chosen by the player is kept as is (only "auto" adapts)
    if (document.hidden || (this.settings.quality && this.settings.quality !== 'auto')) return;
    this.perfFrames++;
    this.perfTime += realDelta;
    if (this.perfTime < 1) return;
    const fps = this.perfFrames / this.perfTime;
    this.perfFrames = 0;
    this.perfTime = 0;
    if (this.perfCooldown > 0) {
      this.perfCooldown--;
      return;
    }
    if (fps < 40 && this.pixelRatio <= 0.5 && this.bloom.enabled) {
      // Already at minimum resolution: drop the glow effect too
      this.bloom.enabled = false;
      this.perfCooldown = 2;
    } else if (fps < 45 && this.pixelRatio > 0.5) {
      this.setPixelRatio(Math.max(0.5, this.pixelRatio - (fps < 30 ? 0.2 : 0.1)));
      this.perfCooldown = 1;
    } else if (fps > 58 && this.pixelRatio < this.maxPixelRatio) {
      this.setPixelRatio(Math.min(this.maxPixelRatio, this.pixelRatio + 0.1));
      this.perfCooldown = 3;
    }
  }

  /** Compile every shader up-front so new rooms never freeze the game. */
  private precompile() {
    const r = this.renderer as THREE.WebGLRenderer & { compileAsync?: (s: THREE.Object3D, c: THREE.Camera) => Promise<unknown> };
    try {
      if (r.compileAsync) r.compileAsync(this.scene, this.camera).catch(() => r.compile(this.scene, this.camera));
      else r.compile(this.scene, this.camera);
    } catch {
      /* ignore */
    }
  }

  private onResize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    const pr = this.renderer.getPixelRatio();
    this.fx.uniforms.resolution.value.set(w * pr, h * pr);
  }

  // -----------------------------------------------------------------------
  // Main loop
  // -----------------------------------------------------------------------
  private pad: GamepadInput | null = null;
  private tick = (now: number) => {
    this.rafId = requestAnimationFrame(this.tick);
    // rAF timestamps can lag behind performance.now() right after start(): never step backwards
    const realDelta = Math.max(0, (now - this.lastTime) / 1000);
    const delta = Math.min(realDelta, 0.05);
    this.lastTime = now;
    if (this.running && !this.paused) this.adaptResolution(realDelta);
    // 🎮 Gamepad
    if (this.running) {
      this.pad ??= new GamepadInput(this.player, {
        useSelected: () => this.useSlot(this.selectedSlot),
        cycleSlot: (dir) => {
          if (this.vsRole === 'monster') return;
          this.selectedSlot = (this.selectedSlot + (dir > 0 ? 1 : 4)) % 5;
          this.pushHud();
        },
      });
      this.pad.poll(realDelta);
    }

    // 📸 Photo mode: leaves by itself if the game moves on; solo freezes the world
    if (this.photo && (!this.running || this.dying || this.finished || this.spectating || this.pendingEnding)) this.togglePhoto(false);
    const simulate = this.running && !this.paused && !this.finished && !(this.photo && !this.net);
    if (simulate) {
      this.elapsed += delta;
      if (this.dying) {
        this.updateDeath(delta);
        // Online, the world keeps living while we die
        if (this.net && !this.finished) {
          this.updateMonsters(delta);
          this.cans.update(delta, this.map.collisionBoxes);
          this.netTick(delta);
        }
      } else this.update(delta);
    }

    this.animateDoors(delta);
    this.updateLights(simulate ? delta : 0);
    this.updateDust(delta);
    // Visible beams: ours is subtle (we stand inside it), the partner's is clearly visible
    this.beam.follow(this.player.flashlight, this.player.flashlightTarget, 60, this.settings.performanceMode ? 0.04 : 0.06);
    this.remoteBeam.follow(this.remoteLight, this.remoteLightTarget, 60, 0.11);

    const u = this.fx.uniforms;
    u.time.value = this.elapsed;
    u.fear.value = this.fear;
    u.damage.value = this.damage;
    u.blackout.value = this.blackout;
    u.monster.value = this.vsRole === 'monster' ? 1 : 0;
    u.pzFilter.value = this.photo ? this.photoFilter : 0;
    if (this.photo) this.updatePhoto(Math.min(realDelta, 0.1));
    this.composer.render(delta);
    if (this.photoShot) {
      this.photoShot = false;
      this.savePhoto();
    }
  };

  private update(delta: number) {
    const p = this.player;
    const boxes = this.map.collisionBoxes;

    if (this.pendingEnding) {
      // Fade to black, the world holds its breath
      p.update(delta, boxes, () => {});
      this.victoryTimer -= delta;
      this.blackout = Math.min(1, this.blackout + delta * 1.2);
      this.fear = THREE.MathUtils.damp(this.fear, 0, 3, delta);
      this.netTick(delta);
      // 💃 The victory dance, then the ending screen
      if (this.victoryTimer <= 0 && this.danceT < 0 && this.canDance()) this.startDance();
      if (this.danceT >= 0) {
        this.updateDance(delta);
        if (this.danceT < GameEngine.DANCE_TIME) return;
        this.endDance();
      }
      if (this.victoryTimer <= 0) {
        this.finished = true;
        this.running = false;
        p.inputEnabled = false;
        sound.setHeartbeat(60, false);
        this.achEscape(this.pendingEnding);
        this.cb.onVictory(this.pendingEnding);
      }
      return;
    }

    // Opening cinematic: the world waits while you wake up
    if (this.intro) {
      this.updateIntro(delta);
      this.netTick(delta);
      this.introTextTimer -= delta;
      this.hudTimer -= delta;
      if (this.hudTimer <= 0) {
        this.hudTimer = 0.1;
        this.pushHud();
      }
      return;
    }
    if (this.introTextTimer > 0) this.introTextTimer -= delta;

    if (this.spectating) {
      // Dead online: watch the partner while the world goes on
      this.updateSpectator();
      this.updateMonsters(delta);
      this.cans.update(delta, boxes);
      this.netTick(delta);
      this.hudTimer -= delta;
      if (this.hudTimer <= 0) {
        this.hudTimer = 0.1;
        this.pushHud();
      }
      return;
    }

    // (the creature player's own footsteps are not "noises" to itself)
    p.update(delta, boxes, (origin, loud) => {
      if (this.vsRole === 'monster') return;
      // Sewers: every step in the water splashes
      if (this.chapter >= 2 && this.inSewerWater(origin)) {
        loud *= 1.7;
        sound.playSplash(loud > 20 ? 1.4 : 0.9);
        if (!this.waterWarned) {
          this.waterWarned = true;
          this.state.showToast('Splash… L\'eau trahit chacun de vos pas. Accroupissez-vous [C] pour avancer sans bruit.');
        }
      }
      this.alertAll(origin, loud);
    });

    this.updateMonsters(delta);
    this.updateVersus(delta);
    if (this.finished) return;
    if (this.dying) {
      this.netTick(delta);
      return;
    }

    this.checkScares();
    this.updateRandomEvents(delta);
    this.updateMimic(delta);
    this.updateShade(delta);
    this.updateCat(delta);
    this.updateWhisper(delta);
    this.updateOutage(delta);
    this.roomDecor?.tick(delta, this.player.position);
    this.updatePet(delta);
    this.updateUv(delta);
    this.updateSecret(delta);
    this.updateWounds(delta);
    this.updateHints(delta);
    this.updateMapExplore(delta);
    this.trackSeen(delta);
    this.trackRun(delta);
    if (p.inDuct && !this.ductWarned && this.crawler) {
      this.ductWarned = true;
      this.state.showToast('Vous rampez dans le conduit… Quelque chose gratte le métal plus loin. La lumière pourrait le repousser.');
    }
    this.netTick(delta);
    if (this.stairsFade > 0) {
      this.stairsFade = Math.max(0, this.stairsFade - delta);
      this.blackout = this.stairsFade / 0.6;
    }

    // Fear: proximity of the closest creature + any chase
    const near = this.nearestMonster();
    const dist = near ? near.dist : 99;
    const crawlerNear = !!this.crawler && this.crawler.state === 'HUNT' && Math.hypot(this.crawler.position.x - p.position.x, this.crawler.position.z - p.position.z) < 8;
    const chased =
      crawlerNear ||
      this.monsters.some((m) => m.state === 'CHASE') ||
      (this.vsRole === 'survivor' && !!this.puppet && this.puppet.state !== 'PATROL' && dist < 14);
    const target = chased ? 1 : Math.max(0, 1 - dist / 10) * 0.75;
    const fearTarget = this.vsRole === 'monster' ? 0 : p.isHidden && dist < 6 ? Math.max(target, 0.6) : target;
    this.fear = THREE.MathUtils.damp(this.fear, fearTarget, 2.5, delta);

    // Stress: rises quickly, calms down slowly (several hunters nearby = more stress)
    const hunters = this.monsters.filter((m) => m.state === 'CHASE' || m.position.distanceTo(p.position) < 12).length;
    const stressTarget = Math.min(1, this.fear * 1.1 + (chased ? 0.2 : 0) + Math.max(0, hunters - 1) * 0.15);
    this.stress =
      stressTarget > this.stress
        ? THREE.MathUtils.damp(this.stress, stressTarget, 2.5, delta)
        : Math.max(stressTarget, this.stress - delta * 0.06);

    this.updateMic(delta);
    this.updateScreamer(delta);
    this.cans.update(delta, boxes);
    this.updateWorldItems(delta);
    this.updateTreats(delta);
    this.vendCooldown = Math.max(0, this.vendCooldown - delta);
    if (this.flipCharging) this.flipT += delta;
    if (this.flipMsgTimer > 0) {
      this.flipMsgTimer -= delta;
      if (this.flipMsgTimer <= 0) this.flipMsg = null;
    }

    // Breathing: out of breath after running, gasping when scared
    this.breathTimer -= delta;
    if (this.breathTimer <= 0 && this.vsRole !== 'monster') {
      const winded = 1 - p.stamina / p.maxStamina;
      const k = Math.max(winded * (p.isSprinting ? 1 : 0.9), this.fear * 0.8);
      if (k > 0.3) {
        sound.playBreath(Math.min(1, k));
        this.breathTimer = 2.3 - k * 1.2;
      } else this.breathTimer = 0.5;
    }

    // Heartbeat
    this.heartTimer -= delta;
    if (this.heartTimer <= 0) {
      this.heartTimer = 0.25;
      const beat = Math.max(this.fear, this.stress * 0.8);
      if (beat > 0.15) sound.setHeartbeat(70 + beat * 85, true);
      else sound.setHeartbeat(60, false);
    }

    // Interaction hint (10 Hz)
    this.hintTimer -= delta;
    if (this.hintTimer <= 0) {
      this.hintTimer = 0.1;
      this.hint = this.computeHint();
    }

    // Timed effects
    if (this.fearFlashTimer > 0) {
      this.fearFlashTimer -= delta;
      if (this.fearFlashTimer <= 0) this.fearFlashText = null;
    }
    this.damage = Math.max(0, this.damage - delta * 1.5);

    this.hudTimer -= delta;
    if (this.hudTimer <= 0) {
      // Faster refresh while charging a flip so the gauge looks smooth
      this.hudTimer = this.flipCharging ? 0.03 : 0.08;
      this.pushHud();
    }
  }

  /**
   * Host / solo: run the creatures' AI against every living player.
   * Guest: the creatures only replicate the host.
   */
  private updateMonsters(delta: number) {
    const p = this.player;
    const right = new THREE.Vector3(Math.cos(p.yaw), 0, -Math.sin(p.yaw));
    const listener = { pos: this.spectating ? this.camera.position.clone().setY(0) : p.position, right };
    if (this.net?.role === 'guest') {
      for (const m of this.monsters) if (!(this.dying && m === this.killer)) m.netUpdate(delta, listener);
      if (this.crawler && !(this.dying && this.killer === this.crawler)) this.crawler.netUpdate(delta, listener);
      // Chapters 4-5: rain, lights, helicopter, purge flashes… (the state comes from the host)
      if (this.forest) {
        this.forest.mirror(delta, { pos: p.position, yaw: p.yaw, flashlight: p.flashlightOn, crouch: p.isCrouching, sprint: p.isSprinting }, listener);
        this.hemi.intensity = this.forestHemi + this.forest.flash * 6;
      }
      if (this.site) {
        if (this.site instanceof DreamHouse) this.site.found = this.state.notesCollected.filter((n) => MEMORY_IDS.includes(n.id)).length;
        if (this.site instanceof Dungeon) {
          this.site.found = this.state.notesCollected.filter((n) => BLASON_IDS.includes(n.id)).length;
          this.site.parch = this.state.notesCollected.filter((n) => PARCH_IDS.includes(n.id)).length;
        }
        this.site.mirror(delta);
        if (this.site instanceof CircusTent) this.circusCheck(this.site);
        this.applyUvLamp();
        this.hemi.intensity = this.forestHemi + this.site.flash * 3;
      }
      return;
    }
    this.updateCrawler(delta, listener);
    const players: MonsterSenses[] = [
      {
        playerPos: p.position,
        playerHidden: p.isHidden,
        playerVisibility: p.visibility,
        listenerRight: right,
        dead: this.dying || this.spectating || this.finished,
      },
    ];
    const slot: number[] = [-1];
    for (const { s, i, caught } of this.livePeers()) {
      players.push({
        playerPos: new THREE.Vector3(s.x, 1.7, s.z),
        playerHidden: s.hid,
        playerVisibility: s.vis,
        listenerRight: right,
        dead: s.dead || caught,
      });
      slot.push(i);
    }
    const catchPeer = (m: MonsterAI | VentCrawler, idx: number) => {
      const prev = this.cur;
      this.cur = slot[idx] ?? 0;
      this.catchRemote(m);
      this.cur = prev;
    };
    // Chapter 3: the Stalker follows your trail (scripted, not the patrol AI)
    if (this.maze && !(this.dying && this.killer === this.maze.stalker)) {
      const dead = this.dying || this.finished || !!this.pendingEnding;
      this.maze.update(delta, p.position, listener, () => !dead && this.startDeath(this.maze!.stalker!), () => {
        this.state.showToast('Un choc métallique, loin derrière… Il est descendu. Il suit votre trace.');
        this.player.shake = Math.max(this.player.shake, 0.5);
      });
    }
    // Chapters 4-5: the level drives its creature (both players in co-op)
    const meDead = this.dying || this.spectating || this.finished;
    const rps = this.livePeers();
    const lslot = [-1, ...rps.map((r) => r.i)];
    const levelCatch = (m: MonsterAI | null, dead: boolean) => (i: number) => {
      if (!m) return;
      if (i === 0) {
        if (!dead) this.startDeath(m);
      } else {
        const prev = this.cur;
        this.cur = lslot[i] ?? 0;
        this.catchRemote(m);
        this.cur = prev;
      }
    };
    // Chapter 4: the Beast hunts by sight (scripted)
    if (this.forest) {
      const f = this.forest;
      const dead = this.dying || this.finished || !!this.pendingEnding;
      if (!(this.dying && this.killer === f.stalker)) {
        const pls: ForestPlayer[] = [{ pos: p.position, yaw: p.yaw, flashlight: p.flashlightOn, crouch: p.isCrouching, sprint: p.isSprinting, dead: meDead }];
        for (const { s: rs, caught } of rps) pls.push({ pos: new THREE.Vector3(rs.x, 1.7, rs.z), yaw: rs.yaw, flashlight: rs.fl, crouch: rs.cr, sprint: !!rs.sp, dead: rs.dead || caught });
        f.update(delta, pls, listener, levelCatch(f.stalker, dead), () =>
          this.shout('Un hurlement déchire la pluie, quelque part derrière vous… Elle vous a suivi hors des égouts.', 0.5)
        );
      }
      this.hemi.intensity = this.forestHemi + f.flash * 6;
    }
    // Chapter 5: Site B (UV lamp, ramps, final purge)
    if (this.site) {
      const sb = this.site;
      if (sb instanceof DreamHouse) sb.found = this.state.notesCollected.filter((n) => MEMORY_IDS.includes(n.id)).length;
      if (sb instanceof Dungeon) {
        sb.found = this.state.notesCollected.filter((n) => BLASON_IDS.includes(n.id)).length;
        sb.parch = this.state.notesCollected.filter((n) => PARCH_IDS.includes(n.id)).length;
      }
      const dead = this.dying || this.finished || !!this.pendingEnding;
      if (!(this.dying && this.killer === sb.stalker)) {
        const pls: SitePlayer[] = [{ pos: p.position, yaw: p.yaw, pitch: p.pitch, flashlight: p.flashlightOn, crouch: p.isCrouching, uv: sb.uv, dead: meDead }];
        for (const { s: rs, caught } of rps) pls.push({ pos: new THREE.Vector3(rs.x, 1.7, rs.z), yaw: rs.yaw, pitch: rs.pitch, flashlight: rs.fl, crouch: rs.cr, uv: !!rs.uv, dead: rs.dead || caught });
        sb.update(delta, pls, listener, (i: number, mm?: MonsterAI) => levelCatch(mm ?? sb.stalker, dead)(i), () =>
          this.shout('Un hurlement résonne dans les conduits… Il est là. Il vous attendait.', 0.5)
        );
      }
      this.applyUvLamp();
      this.hemi.intensity = this.forestHemi + sb.flash * 3;
      if (sb instanceof CircusTent) this.circusCheck(sb);
      if (sb.ending && !dead) {
        const end = sb.ending;
        sb.ending = null;
        this.triggerEnding(end);
      }
    }
    for (const m of this.monsters) {
      if (this.dying && m === this.killer) continue;
      if (m === this.maze?.stalker || m === this.forest?.stalker || m === this.site?.stalker) continue;
      if (this.site instanceof CircusTent && this.site.owns(m)) continue;
      if (m.nurse) {
        m.observed = this.nurseObserved(m);
        if (m.observed && !this.nurseWarned && m.position.distanceTo(this.player.position) < 14) {
          this.nurseWarned = true;
          this.shout('Une infirmière… immobile. Elle ne bouge que quand personne ne la regarde. Ne la quittez pas des yeux.', 0.3);
        }
      }
      m.updateMulti(delta, players, listener, this.map.collisionBoxes, (idx) => {
        if (idx === 0) {
          if (!this.tryWound(m)) this.startDeath(m);
        } else if (!this.tryWoundPeer(m, slot[idx] ?? 0)) catchPeer(m, idx);
      });
      if (this.dying && !this.net) return;
    }
  }

  /** Chapter 5: the UV lamp is purple and eats the battery 6× faster. */
  private applyUvLamp() {
    const p = this.player;
    const uv = !!this.site?.uv;
    p.batteryDrainMul = this.baseDrain * (uv && p.flashlightOn ? 6 : 1);
    p.flashlight.color.setHex(uv ? 0x9a5cff : this.lampHex());
  }

  /**
   * Chapters 4-5: a level message for BOTH players (host sends it to the guest).
   * While acting for the guest, the host's own copy is shown afterwards.
   */
  private pendingShout: string | null = null;
  private shout(msg: string, shake = 0) {
    if (this.net?.role === 'host' && this.net.mode === 'coop' && !this.partnerGone) this.net.send({ k: 'toast', msg, to: '*' } as unknown as GameMsg);
    if (this.actor === 'remote') this.pendingShout = msg;
    else this.state?.showToast(msg);
    if (shake) this.player.shake = Math.max(this.player.shake, shake);
  }

  /** Host / solo: the duct creature hunts whoever crawls in its duct. */
  private updateCrawler(delta: number, listener: { pos: THREE.Vector3; right: THREE.Vector3 }) {
    const c = this.crawler;
    if (!c || (this.dying && this.killer === c)) return;
    const p = this.player;
    const humans: CrawlerHuman[] = [];
    if (this.vsRole !== 'monster') {
      humans.push({
        pos: p.position,
        eye: this.camera.position.clone(),
        yaw: p.yaw,
        pitch: p.pitch,
        flashlightOn: p.flashlightOn,
        inDuct: p.inDuct,
        dead: this.dying || this.spectating || this.finished,
      });
    }
    const hslot: number[] = humans.length ? [-1] : [];
    for (const { s, i, caught } of this.vsRole !== 'survivor' ? this.livePeers() : []) {
      const inDuct = this.map.lowZones.some((l) => s.x > l.minX && s.x < l.maxX && s.z > l.minZ && s.z < l.maxZ);
      hslot.push(i);
      humans.push({
        pos: new THREE.Vector3(s.x, 0, s.z),
        eye: new THREE.Vector3(s.x, s.y, s.z),
        yaw: s.yaw,
        pitch: s.pitch,
        flashlightOn: s.fl,
        inDuct,
        dead: s.dead || caught,
      });
    }
    const caught = c.update(delta, humans, listener);
    if (caught < 0) return;
    const who = humans[caught];
    if (who.pos === p.position) this.startDeath(c);
    else {
      const prev = this.cur;
      this.cur = hslot[caught] ?? 0;
      this.catchRemote(c);
      this.cur = prev;
    }
  }

  /** Host: a creature got the guest. */
  private catchRemote(m: MonsterAI | VentCrawler) {
    if (this.remoteCaught) return;
    this.remoteCaught = true;
    const prevReply = this.replyTo;
    this.replyTo = this.peers[this.cur]?.name ?? null;
    this.net?.send({ k: 'caught', m: m instanceof MonsterAI ? this.monsters.indexOf(m) : -1 });
    this.replyTo = prevReply;
    this.state.showToast(`${this.peerName} s'est fait attraper !`);
    const pos = this.remote?.position;
    if (pos && pos.distanceTo(this.player.position) < 15) {
      sound.playMonsterChaseRoar();
      this.player.shake = Math.max(this.player.shake, 0.4);
    }
  }

  private pushHud() {
    const p = this.player;
    this.cb.onHud({
      battery: p.flashlightBattery,
      flashlightOn: p.flashlightOn,
      stamina: p.stamina,
      crouching: p.isCrouching,
      sprinting: p.isSprinting,
      hidden: p.isHidden,
      hint: this.dying ? null : this.hint,
      objective: this.imp
        ? this.amImp
          ? `🔪 Éliminez tout le monde avant la fin de la nuit ${this.imp.nights}, sans vous faire démasquer.`
          : `🧍 Survivez ${this.imp.nights} nuits… et trouvez qui est le monstre.`
        : this.maze
        ? this.maze.objective(p.position, p.yaw)
        : this.forest
          ? this.forest.objective(p.position, p.yaw)
          : this.site
            ? this.site.objective()
            : this.state.getCurrentObjectiveText(),
      toast: this.state.toastMessage,
      monsterState: this.monsters.some((m) => m.state === 'CHASE') ? 'CHASE' : (this.nearestMonster()?.m.state ?? 'PATROL'),
      monsterDistance: this.nearestMonster()?.dist ?? 99,
      fear: this.fear,
      fearFlashText: this.fearFlashText,
      dying: this.dying,
      freeLook: this.player.freeLook,
      stress: this.stress,
      micLevel: this.mic.level,
      // The "the creature hears you" meter only when that mechanic is on (not for voice chat alone)
      micStatus: this.micNoise ? this.mic.status : 'off',
      micHeard: this.micHeardTimer > 0,
      screamer: this.screamerTimer > 0,
      flipCharge: this.flipCharging ? this.flipPower : null,
      flipMsg: this.flipMsg,
      flipBest: this.flipBest,
      hideKind: p.isHidden ? (this.map.hidingSpots.find((s) => s.id === p.currentHidingSpotId)?.kind ?? 'locker') : null,
      items: [...this.state.inventory],
      maxSlots: this.state.maxInventorySlots,
      // Player vs player: pseudos stay hidden during the round
      partnerName: this.net && !this.partnerGone && this.net.mode === 'coop' ? (this.peers.length > 1 ? this.peers.map((q) => q.name).join(', ') : this.net.partnerName) : null,
      partnerDead: this.peers.length > 0 && this.peers.every((q) => !!q.remote?.state?.dead || q.caught),
      spectating: this.spectating,
      watching: this.watchOnly,
      dancing: this.danceT >= 0,
      versusRole: this.vsRole,
      timeLeft: this.vsRole ? this.timeLeft : null,
      hideCount: this.hideSeek && this.hideCount > 0 ? Math.ceil(this.hideCount) : null,
      emoteWheel: this.emoteWheel,
      secretLeft: this.secret?.state === 'open' ? Math.max(0, Math.ceil(this.secret.timeLeft)) : null,
      wound: this.wounded || this.bandT > 0 ? { bleed: this.bleedT > 0, limp: this.player.limp > 0, band: this.bandT > 0 ? Math.round((1 - this.bandT / 3) * 100) / 100 : null } : null,
      photo: this.photo ? { filter: GameEngine.PHOTO_FILTERS[this.photoFilter], help: this.photoHelp, msg: this.photoMsg } : null,
      imp: this.imp
        ? {
            me: this.impRole,
            self: this.net?.selfName ?? '',
            prot: this.impMyProt,
            lastProt: this.impLastProt,
            invUsed: !!this.impInv,
            inv: this.impInv,
            chat: this.impChat.filter((c) => c.n === this.imp!.n).map((c) => c.line),
            ph: this.imp.ph,
            n: this.imp.n,
            nights: this.imp.nights,
            t: Math.ceil(this.imp.t),
            cd: Math.ceil(this.imp.cooldown),
            dead: this.spectating || this.dying || this.imp.dead.has(this.net?.selfName ?? ''),
            alive: this.imp.players.filter((n) => !this.imp!.dead.has(n) && n !== this.net?.selfName),
            voted: this.impMyVote,
            nvoted: this.imp.votes.size,
            near: this.amImp && !!this.impTarget(),
            log: this.imp.log,
          }
        : null,
      pact: this.site instanceof CircusTent && this.site.phase === 'morning' && this.site.offerTo === this.mySide ? Math.ceil(this.site.offerT) : null,
      race: this.net?.mode === 'race',
      canBlind: this.canBlind(),
      blindLeft: this.blindTimer,
      runCoins: this.state.runCoins,
      runTreats: this.runTreats + this.runChests * TREATS_PER_CHEST,
      presents: this.xmasNight ? this.runPresents : null,
      survival: this.survival && this.survivalWave ? { wave: this.survivalWave, time: this.runTime } : null,
      speedrun: this.settings.speedrun && !this.survival && !this.intro && this.vsRole === null ? { time: this.runTime, best: this.speedBests[`${this.chapter}-${this.difficulty}`] ?? null } : null,
      treatEmoji: this.treatSeason ? SEASON_INFO[this.treatSeason].treat.emoji : null,
      selectedSlot: this.selectedSlot,
      intro: !!this.intro,
      introText: this.introTextTimer > 0 ? this.introText : null,
      voice:
        this.net && !this.partnerGone && this.voice.enabled
          ? { on: this.mic.status === 'on', muted: this.voice.muted, self: this.voice.selfTalking, partner: this.voice.partnerTalking }
          : null,
    });
  }

  // -----------------------------------------------------------------------
  // Death sequence
  // -----------------------------------------------------------------------
  /** 💀 Bestiary id of the creature that got you (game over screen + death style) */
  public deathBy: string | null = null;
  private deathFxT = 0;
  private startDeath(killer: Killer) {
    if (this.dying) return;
    this.deathBy = killer === this.crawler ? 'rampant' : killer instanceof MonsterAI ? this.beastId(killer) : 'patient0';
    this.deathFxT = 0;
    this.stat('deaths');
    this.killer = killer;
    this.dying = true;
    this.deathT = 0;
    this.player.inputEnabled = false;
    if (this.player.isHidden) {
      // Dragged out of the locker
      const spot = this.map.hidingSpots.find((s) => s.id === this.player.currentHidingSpotId);
      if (spot) this.player.exitHiding(this.hideExit(spot));
    }
    this.player.shake = 1;
    this.fear = 1;
    this.buzz([250, 80, 400]);
    sound.setHeartbeat(60, false);
    // Each creature kills its own way
    switch (this.deathBy) {
      case 'infirmiere':
        // Strangled: no roar, just a choke and the stinger
        sound.playBreath(1);
        sound.playJumpscareStinger();
        break;
      case 'rampant':
        sound.playHiss(1.4);
        sound.playJumpscareStinger();
        break;
      case 'aveugle':
        sound.playMonsterChaseRoar();
        sound.playStatic(1.4, 0.35);
        sound.playJumpscareStinger();
        break;
      case 'fouettard':
        sound.playBells(0.5, 0);
        sound.playMonsterChaseRoar();
        sound.playJumpscareStinger();
        break;
      default:
        sound.playMonsterChaseRoar();
        sound.playJumpscareStinger();
    }
    this.hint = null;
    this.pushHud();
  }

  private updateDeath(delta: number) {
    this.deathT += delta;
    const killer = this.killer!;
    const cam = this.camera;
    const camPos = new THREE.Vector3(this.player.position.x, cam.position.y, this.player.position.z);
    killer.poseLunge(camPos, this.deathT);
    // Snap the view onto the creature's face
    const look = new THREE.Matrix4().lookAt(cam.position, killer.headWorld, new THREE.Vector3(0, 1, 0));
    const q = new THREE.Quaternion().setFromRotationMatrix(look);
    cam.quaternion.slerp(q, 1 - Math.exp(-18 * delta));
    // In the duct you die on all fours
    cam.position.x += (Math.random() - 0.5) * 0.04;
    cam.position.z += (Math.random() - 0.5) * 0.04;
    // 💀 Each creature its own death
    const t = this.deathT;
    this.deathFxT -= delta;
    switch (this.deathBy) {
      case 'infirmiere': {
        // Lifted off the ground by the throat, slowly choking
        cam.position.y += Math.min(0.35, t * 0.4) * delta * 6;
        cam.rotateZ(Math.sin(t * 3) * 0.08);
        if (this.deathFxT <= 0) {
          this.deathFxT = 0.45;
          sound.playBreath(1);
        }
        break;
      }
      case 'rampant': {
        // Dragged backwards into the dark
        const back = new THREE.Vector3(0, 0, 1).applyQuaternion(cam.quaternion).setY(0).normalize();
        cam.position.addScaledVector(back, delta * 1.6);
        cam.position.y = Math.max(0.35, cam.position.y - delta * 1.4);
        cam.rotateZ(0.5 * Math.min(1, t * 2));
        break;
      }
      case 'aveugle': {
        // It screams in your face: everything shakes
        cam.position.x += (Math.random() - 0.5) * 0.14;
        cam.position.y += (Math.random() - 0.5) * 0.1;
        this.player.shake = 1;
        break;
      }
      case 'fouettard': {
        // Bells ringing like mad, the world swinging
        cam.rotateZ(Math.sin(t * 9) * 0.25);
        if (this.deathFxT <= 0) {
          this.deathFxT = 0.13;
          sound.playBells(0.4, (Math.random() - 0.5) * 1.6);
        }
        break;
      }
    }
    // Dropped, shaking flashlight lighting the face from below
    const fl = this.player.flashlight;
    fl.position.copy(cam.position).add(new THREE.Vector3(0, -0.55, 0));
    fl.intensity = 6 + Math.random() * 4;
    this.player.flashlightTarget.position.copy(killer.headWorld);
    this.player.flashlightTarget.updateMatrixWorld();
    this.damage = Math.min(1, this.deathT * (this.deathBy === 'infirmiere' ? 0.6 : 0.9));
    this.blackout = Math.max(0, (this.deathT - (this.deathBy === 'infirmiere' ? 1.5 : 1.1)) * 2.5);
    if (this.deathT > (this.deathBy === 'infirmiere' ? 2 : 1.6)) {
      if (this.vsRole) {
        // Versus: the creature got you, round over
        this.dying = false;
        this.versusEnd('monster', 'caught', undefined, true);
        return;
      }
      if (this.net && this.partnerAlive()) {
        // Online: become a spectator of the partner
        this.dying = false;
        this.killer = null;
        this.spectating = true;
        this.damage = 0;
        this.blackout = 0;
        this.fear = 0;
        this.player.flashlightOn = false;
        this.state.showToast(
          this.net.mode === 'race'
            ? "Attrapé ! Vous suivez votre rival… s'il sort, il gagne la course."
            : this.peers.length > 1
              ? `Fin de partie pour vous… Vous suivez ${this.peerName}. Tout repose sur vos coéquipiers maintenant.`
              : `Fin de partie pour vous… Vous suivez ${this.net.partnerName}. Tout repose sur ses épaules maintenant.`
        );
        this.pushHud();
        return;
      }
      this.dying = false;
      this.spectating = true; // lets endGameOver() run once
      this.endGameOver();
    }
  }

  // -----------------------------------------------------------------------
  // Scripted scares
  // -----------------------------------------------------------------------
  private checkScares() {
    for (const t of this.map.scareTriggers) {
      if (t.triggered) continue;
      const d = Math.hypot(this.player.position.x - t.position.x, this.player.position.z - t.position.z);
      if (d > t.radius) continue;
      t.triggered = true;
      switch (t.id) {
        case 'ward-exit-slam':
          sound.playDistantSlam(0.6);
          this.player.shake = 0.35;
          break;
        case 'corridor-lights-out':
          this.lightsOutTimer = 2.8;
          sound.playFlickerHum();
          if (this.monsters.length) setTimeout(() => sound.playMonsterGrowl(7, -0.4), 900);
          break;
        case 'jumpscare-morgue-corpse':
          // Just a warning: the real scare is when you search the body
          this.lightsOutTimer = 0.5;
          sound.playFlickerHum();
          break;
        case 'lab-entry':
          sound.playDistantSlam(0);
          this.state.showToast(
            this.monsters.length === 0
              ? 'L\'écho de la porte blindée résonne dans l\'étage désert…'
              : this.monsters.length === 1
                ? 'L\'écho de la porte blindée résonne dans tout l\'étage… Il arrive.'
                : 'L\'écho de la porte blindée résonne dans tout l\'étage… Ils arrivent.'
          );
          this.alertAll(this.player.position, 200);
          break;
      }
    }
  }

  // -----------------------------------------------------------------------
  // Environment animation
  // -----------------------------------------------------------------------
  private updateLights(delta: number) {
    if (this.lightsOutTimer > 0) this.lightsOutTimer -= delta;
    const out = this.lightsOutTimer > 0;
    for (const l of this.map.lights) {
      const powered = !l.needsPower || this.state.powerRestored;
      if (powered && l.flicker && delta > 0) {
        l.nextFlicker -= delta;
        if (l.nextFlicker <= 0) {
          const r = Math.random();
          l.nextFlicker = r < 0.7 ? 0.04 + Math.random() * 0.12 : 0.6 + Math.random() * 3;
          l.k = r < 0.25 ? 0.05 : r < 0.4 ? 0.4 : 1;
        }
      }
      let k = !powered ? 0 : l.flicker ? l.k : 1;
      // 🕯️ snuffed out by l'Éteigneur
      if (this.shadeOff.has(l)) k = Math.random() < 0.01 ? 0.15 : 0;
      if (out) k = Math.random() < 0.04 ? 0.3 : 0;
      l.fixtureMat.emissiveIntensity = l.baseEmissive * k;
      l.current = l.baseIntensity * k;
    }

    // Assign the fixed pool of real lights to the fixtures closest to the camera.
    // The number of lights never changes, so shaders never recompile.
    const cam = this.camera.position;
    const sorted = [...this.map.lights].sort((a, b) => a.position.distanceToSquared(cam) - b.position.distanceToSquared(cam));
    this.lightPool.forEach((pl, i) => {
      const f = sorted[i];
      if (!f) {
        pl.intensity = 0;
        return;
      }
      pl.position.copy(f.position);
      pl.color.copy(f.color);
      pl.distance = f.distance;
      pl.intensity = f.current;
    });
  }

  private updateDust(delta: number) {
    const pos = this.dust.geometry.attributes.position as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    const c = this.camera.position;
    for (let i = 0; i < arr.length; i += 3) {
      arr[i] += this.dustVel[i] * delta;
      arr[i + 1] += this.dustVel[i + 1] * delta;
      arr[i + 2] += this.dustVel[i + 2] * delta;
      // Wrap inside a box that follows the camera
      if (arr[i] - c.x > 7) arr[i] -= 14;
      else if (arr[i] - c.x < -7) arr[i] += 14;
      if (arr[i + 2] - c.z > 7) arr[i + 2] -= 14;
      else if (arr[i + 2] - c.z < -7) arr[i + 2] += 14;
      if (arr[i + 1] > 3.4) arr[i + 1] = 0.05;
      else if (arr[i + 1] < 0) arr[i + 1] = 3.35;
    }
    pos.needsUpdate = true;
  }

  private animateDoors(delta: number) {
    for (const d of this.map.doors.values()) {
      const target = d.isOpen ? d.openRot : d.closedRot;
      if (Math.abs(d.currentRot - target) > 0.001) {
        d.currentRot = THREE.MathUtils.damp(d.currentRot, target, 7, delta);
        d.pivot.rotation.y = d.currentRot;
      }
    }
  }

  // -----------------------------------------------------------------------
  // Doors
  // -----------------------------------------------------------------------
  private setDoorOpen(door: DoorObject, open: boolean, byMonster = false) {
    if (door.isOpen === open) return;
    if (!open) {
      // Never close a door on somebody standing in the doorway
      const b = door.collision;
      const pad = 0.45;
      const remotePos = this.peers.filter((q) => q.remote?.state && !q.remote.state.dead).map((q) => q.remote!.position);
      for (const who of [this.player.position, ...remotePos, ...this.monsters.map((m) => m.position)]) {
        if (who.x > b.min.x - pad && who.x < b.max.x + pad && who.z > b.min.z - pad && who.z < b.max.z + pad) return;
      }
    }
    door.isOpen = open;
    door.collision.disabled = open;
    const dist = this.player.position.distanceTo(door.center);
    if (open) {
      if (byMonster) sound.playDoorSlam();
      else sound.playDoorOpen();
    } else {
      sound.playDoorSlam();
    }
    if (byMonster && dist < 8) this.player.shake = Math.max(this.player.shake, 0.3);
    if (!byMonster) this.alertAll(door.center, open ? 7 : 10);
  }

  private updateDoorLed(door: DoorObject) {
    if (!door.statusLed) return;
    const color = !door.isLocked ? 0x22ff44 : this.state.powerRestored ? 0xffaa00 : 0xff1100;
    door.statusLed.emissive.setHex(color);
  }

  // -----------------------------------------------------------------------
  // Interaction
  // -----------------------------------------------------------------------
  private findTarget(): InteractTarget | null {
    if (this.player.isHidden) return null;
    // Raycast against the whole level so walls block interactions behind them
    // Third-person creature: aim from its head, not from the camera behind it
    const p = this.player;
    const origin = this.vsRole === 'monster' ? new THREE.Vector3(p.position.x, 1.9, p.position.z) : undefined;
    const hit = this.player.getInteractiveTarget([this.map.sceneGroup], origin);
    if (!hit) return null;
    let o: THREE.Object3D | null = hit.object;
    while (o) {
      const u = o.userData;
      if (u.isDoor) {
        const door = this.map.doors.get(u.doorId);
        return door ? { kind: 'door', door } : null;
      }
      if (u.isContainer) return { kind: 'container', id: u.containerId };
      if (u.isHidingSpot) return { kind: 'hide', id: u.spotId };
      if (u.isBreakerBox) return { kind: 'breaker' };
      if (u.isPurgeConsole) return { kind: 'purge' };
      if (u.isVending) return { kind: 'vending' };
      if (u.isStairs) return u.to === 'f2' && !this.stairsBuilt ? { kind: 'repair' } : { kind: 'stairs', dir: u.dir, to: u.to };
      if (u.isVent) return this.ventOpen ? null : { kind: 'vent' };
      if (u.isPickup) return { kind: 'pickup', uid: u.uid };
      if (u.isHobo) return { kind: 'hobo' };
      if (u.isGenerator) return { kind: 'generator' };
      if (u.isCan) return { kind: 'can', mesh: o };
      o = o.parent;
    }
    return null;
  }

  private computeHint(): string | null {
    if (this.player.isHidden) return '[E] Sortir de la cachette';
    const mh = this.maze?.hint(this.player.position) ?? this.forest?.hint(this.player.position) ?? this.site?.hint(this.player.position);
    if (mh) return mh;
    if (this.vsRole === 'monster') {
      if (this.survivorInReach()) return '[E] ATTRAPER';
      const mt = this.findTarget();
      if (!mt) return null;
      if (mt.kind === 'door') return mt.door.isLocked ? `${mt.door.name} — verrouillée` : `[E] ${mt.door.isOpen ? 'Fermer' : 'Ouvrir'} — ${mt.door.name}`;
      if (mt.kind === 'hide') return '[E] Fouiller la cachette';
      if (mt.kind === 'stairs') return mt.dir === 'up' ? '[E] Monter à l\'étage' : '[E] Descendre';
      if (mt.kind === 'repair') return 'Escalier effondré';
      return null;
    }
    const t = this.findTarget();
    if (!t) return null;
    switch (t.kind) {
      case 'door': {
        const d = t.door;
        if (d.isOpen) return `[E] Fermer — ${d.name}`;
        if (d.isLocked) return `[E] ${d.name} — verrouillée`;
        return `[E] Ouvrir — ${d.name}`;
      }
      case 'container': {
        const c = this.map.containers.get(t.id);
        if (!c) return null;
        if (c.searched) return `${c.name} (déjà fouillé)`;
        return `[E] Fouiller — ${c.name}`;
      }
      case 'hide': {
        const spot = this.map.hidingSpots.find((s) => s.id === t.id);
        return spot?.kind === 'bed' ? '[E] Se glisser sous le lit' : '[E] Se cacher dans le casier';
      }
      case 'breaker':
        return this.state.powerRestored ? 'Disjoncteur principal (courant rétabli)' : '[E] Disjoncteur principal';
      case 'purge':
        return this.state.powerRestored ? '[E] Déclencher la purge thermique' : 'Console de purge (hors tension)';
      case 'vending':
        return this.vendCooldown > 0 ? 'Distributeur…' : '[E] Distributeur — prendre une canette';
      case 'can':
        return '[E] Ramasser la canette';
      case 'stairs':
        return `[E] ${GameEngine.STAIRS_HINT[t.to] ?? (t.dir === 'up' ? 'Monter' : 'Descendre')}`;
      case 'vent':
        return '[E] Arracher la grille du conduit d\'aération';
      case 'pickup': {
        const w = this.worldItems.find((x) => x.uid === t.uid);
        return w ? `[E] Ramasser — ${w.item.name}` : null;
      }
      case 'hobo':
        return '[E] Parler au SDF (boutique)';
      case 'generator':
        return `[E] Tirer le lanceur du générateur (${this.genPulls}/3)`;
      case 'repair':
        return this.state.hasItem('item-planks') ? '[E] Réparer l\'escalier avec les planches' : 'Escalier effondré — il faut des planches';
    }
  }

  public interact() {
    if (this.intro) {
      this.skipIntro();
      return;
    }
    if (!this.running || this.paused || this.dying || this.finished || this.pendingEnding) return;
    const p = this.player;
    const gs = this.state;

    if (this.vsRole === 'monster') {
      this.monsterInteract();
      return;
    }

    if (p.isHidden) {
      const spot = this.map.hidingSpots.find((s) => s.id === p.currentHidingSpotId);
      const exit = spot ? this.hideExit(spot) : p.position.clone();
      p.exitHiding(exit);
      if (spot?.kind === 'bed') sound.playPaperRustle();
      else sound.playDoorOpen();
      this.hint = null;
      return;
    }

    // Co-op guest: level objects are run by the host
    if ((this.site || this.forest) && this.net?.role === 'guest') {
      if ((this.site ?? this.forest)!.hint(p.position)) {
        this.net.send({ k: 'act', req: { kind: 'level' } });
        return;
      }
    } else if (this.site) {
      const r = this.site.interact(p.position);
      if (r?.ending) {
        this.triggerEnding(r.ending);
        return;
      }
      if (r?.coins) this.giveCoins(r.coins);
      if (r) {
        if (r.shake) p.shake = Math.max(p.shake, r.shake);
        if (r.msg) this.shout(r.msg);
        this.pushHud();
        return;
      }
    } else if (this.forest) {
      const r = this.forest.interact(p.position);
      if (r?.rescue) {
        this.triggerEnding('RESCUE');
        return;
      }
      if (r) {
        if (r.shake) p.shake = Math.max(p.shake, r.shake);
        if (r.msg) this.shout(r.msg);
        this.pushHud();
        return;
      }
    }

    if (this.maze) {
      const r = this.maze.interact(p.position, p.yaw);
      if (r === 'exit') {
        this.triggerEnding('MAZE');
        return;
      }
      if (r === 'valve') {
        p.shake = Math.max(p.shake, 0.4);
        this.state.showToast(
          this.maze.valvesOpen >= 3
            ? 'Un grondement sourd… Quelque part, une plaque d\'égout s\'est ouverte. Suivez la lumière bleue !'
            : `Vanne ouverte (${this.maze.valvesOpen}/3). Le grincement résonne dans tout le réseau… Il a entendu.`
        );
        this.pushHud();
        return;
      }
      if (r === 'gate') {
        this.state.showToast('CLANG ! La grille s\'abat. Ça devrait le retenir… un moment.');
        return;
      }
    }

    const t = this.findTarget();
    if (!t) return;

    // Stairs only move you: handled locally by everyone
    if (t.kind === 'stairs') {
      this.useStairs(t.to);
      return;
    }

    // The hobo's shop is personal (your own coins)
    if (t.kind === 'hobo') {
      this.ach('hobo');
      this.cb.onHobo();
      return;
    }

    // Guest: hiding is personal, everything else is decided by the host
    if (this.net?.role === 'guest' && t.kind !== 'hide') {
      let req: InteractRequest | null = null;
      if (t.kind === 'door') req = { kind: 'door', id: t.door.id };
      else if (t.kind === 'pickup') req = { kind: 'pickup', uid: t.uid };
      else if (t.kind === 'container') req = { kind: 'container', id: t.id };
      else if (t.kind === 'can') {
        const idx = this.cans.indexOf(t.mesh);
        if (idx >= 0) req = { kind: 'can', idx };
      } else if (t.kind !== 'generator') req = { kind: t.kind };
      if (req) this.net.send({ k: 'act', req });
      return;
    }
    this.performInteraction(t);
  }

  // -----------------------------------------------------------------------
  // Sedative syringe: the creature collapses for 5 seconds
  // -----------------------------------------------------------------------
  private static SEDATIVE_TIME = 5;
  /** Versus, creature side: seconds left paralysed. */
  private monsterStunTimer = 0;

  /**
   * Inject whatever creature is right in front of `from` (≤ 3 m).
   * Host / solo only (a guest asks the host). Returns true if one was hit.
   */
  private applySedative(from: THREE.Vector3, yaw: number): boolean {
    const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    const inReach = (pos: THREE.Vector3) => {
      const to = new THREE.Vector3(pos.x - from.x, 0, pos.z - from.z);
      const d = to.length();
      return d < 3 && (d < 0.9 || to.normalize().dot(fwd) > 0.3);
    };
    let hit = false;
    for (const m of this.monsters) {
      if (m.state !== 'STUNNED' && inReach(m.position)) {
        m.stun(GameEngine.SEDATIVE_TIME);
        hit = true;
      }
    }
    // Versus: the creature is a player
    const vs = this.vsRole;
    if (vs && this.puppet && inReach(this.puppet.position)) {
      if (vs === 'survivor' && this.actor === 'local') {
        this.net?.send({ k: 'stun', s: GameEngine.SEDATIVE_TIME });
        hit = true;
      } else if (vs === 'monster' && this.actor === 'remote') {
        this.monsterStun(GameEngine.SEDATIVE_TIME);
        hit = true;
      }
    }
    if (hit) sound.playSedative();
    return hit;
  }

  /** Versus creature player: injected, can't move for a while. */
  private monsterStun(seconds: number) {
    this.monsterStunTimer = seconds;
    this.player.velocity.set(0, 0, 0);
    this.player.inputEnabled = false;
    this.player.shake = 0.5;
    sound.playSedative();
    this.state.showToast(`💉 Sédatif ! Paralysie pendant ${seconds} secondes…`);
  }

  // -----------------------------------------------------------------------
  // Versus anti-camping: a creature that stays put too long can be blinded
  // for 5 s by the survivor, while an AI drags it somewhere else.
  // -----------------------------------------------------------------------
  private static CAMP_RADIUS = 4;
  private static CAMP_TIME = 20;
  private static BLIND_TIME = 5;
  private static BLIND_COOLDOWN = 40;
  /** Survivor side: where the creature has been lingering, and for how long. */
  private campAnchor = new THREE.Vector3(1e6, 0, 0);
  private campTimer = 0;
  private campWarned = false;
  private blindCooldown = 0;
  /** Creature side: seconds left blinded, and the path the AI walks us along. */
  private blindTimer = 0;
  private blindPath: THREE.Vector3[] = [];

  private canBlind() {
    return (
      this.vsRole === 'survivor' &&
      !this.dying &&
      !this.finished &&
      !this.vsOver &&
      this.blindCooldown <= 0 &&
      this.campTimer >= GameEngine.CAMP_TIME
    );
  }

  /** Survivor side: watch the creature for camping. */
  private updateCampWatch(delta: number, puppet: MonsterAI, stunned: boolean) {
    // Hide-and-seek: waiting near a hiding spot is the whole point
    if (this.hideSeek) return;
    this.blindCooldown = Math.max(0, this.blindCooldown - delta);
    const pos = puppet.position;
    if (stunned || pos.distanceTo(this.campAnchor) > GameEngine.CAMP_RADIUS) {
      this.campAnchor.copy(pos);
      this.campTimer = 0;
      this.campWarned = false;
      return;
    }
    this.campTimer += delta;
    if (this.canBlind() && !this.campWarned) {
      this.campWarned = true;
      sound.playItemPickup();
      this.state.showToast('Le monstre campe ! Appuyez sur [G] pour l\'aveugler 5 secondes.');
    }
  }

  /** Survivor presses G. */
  private tryBlind() {
    if (!this.running || this.menuOpen || !this.canBlind()) return;
    this.net?.send({ k: 'blind', s: GameEngine.BLIND_TIME });
    this.ach('blind');
    this.blindCooldown = GameEngine.BLIND_COOLDOWN;
    this.campTimer = 0;
    this.campWarned = false;
    this.campAnchor.set(1e6, 0, 0);
    sound.playSedative();
    this.state.showToast('👁️ Le monstre est aveuglé et emmené ailleurs pendant 5 secondes. Foncez !');
  }

  /** Creature side: blinded, an AI walks us to a far-away spot. */
  private startBlind(seconds: number) {
    const p = this.player;
    const from = p.position.clone().setY(0);
    const survivor = this.remote?.state;
    const floorOf = (x: number) => (x < -40 ? -1 : x < 20 ? 0 : x < 60 ? 1 : x < 130 ? 2 : 3);
    const sameFloor = (v: THREE.Vector3) => floorOf(v.x) === floorOf(from.x);
    const candidates = (this.puppet?.navPoints ?? [])
      .filter((v) => sameFloor(v) && v.distanceTo(from) > 12 && (!survivor || Math.hypot(v.x - survivor.x, v.z - survivor.z) > 8))
      .sort(() => Math.random() - 0.5);
    this.blindPath = [];
    for (const dest of candidates.slice(0, 6)) {
      const path = this.puppet?.planPath(from, dest, this.map.collisionBoxes);
      if (path && path.length) {
        this.blindPath = path.map((v) => v.clone());
        break;
      }
    }
    this.blindTimer = seconds;
    p.velocity.set(0, 0, 0);
    p.inputEnabled = false;
    p.shake = 0.4;
    sound.playSedative();
    this.state.showToast('Vous campiez trop longtemps : vous êtes aveuglé et emmené ailleurs !');
  }

  private updateBlind(delta: number) {
    if (this.blindTimer <= 0) return;
    const p = this.player;
    this.blindTimer = Math.max(0, this.blindTimer - delta);
    if (this.monsterStunTimer <= 0) {
      // Walk along the path, opening the doors on the way
      let step = 2.6 * delta;
      while (step > 0 && this.blindPath.length) {
        const target = this.blindPath[0];
        const dx = target.x - p.position.x;
        const dz = target.z - p.position.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.05) {
          this.blindPath.shift();
          continue;
        }
        const k = Math.min(step, d) / d;
        p.position.x += dx * k;
        p.position.z += dz * k;
        p.yaw = Math.atan2(-dx, -dz);
        step -= Math.min(step, d);
      }
      for (const door of this.map.doors.values()) {
        if (door.isOpen || door.isLocked) continue;
        const c = door.collision;
        const cx = (c.min.x + c.max.x) / 2;
        const cz = (c.min.z + c.max.z) / 2;
        if (Math.hypot(cx - p.position.x, cz - p.position.z) > 1.4) continue;
        if (this.net?.role === 'guest') this.net.send({ k: 'act', req: { kind: 'door', id: door.id } });
        else this.setDoorOpen(door, true);
        door.isOpen = true; // don't ask twice
        door.collision.disabled = true;
      }
    }
    if (this.blindTimer === 0) {
      this.blindPath = [];
      this.player.inputEnabled = !this.menuOpen && this.monsterStunTimer <= 0;
      this.state.showToast('Vous voyez à nouveau… Reprenez la traque, sans camper.');
    }
  }

  // -----------------------------------------------------------------------
  // Race ("Course"): both players are survivors, the first one out wins.
  // The host keeps the guest's pockets, notes and objectives apart.
  // -----------------------------------------------------------------------
  private raceKit: { inventory: GameItem[]; notes: GameItem[]; objectives: Objective[] } | null = null;
  private kitSwapped = false;

  private setupRace() {
    this.raceKit = this.net?.mode === 'race' && this.net.role === 'host' ? (({ inventory, notesCollected, objectives }) => ({ inventory, notes: notesCollected, objectives }))(new GameState()) : null;
    this.kitSwapped = false;
    this.lastNotesSent = -1;
  }

  /** Host: run `fn` with the guest's own inventory / notes / objectives in place. */
  private withRaceKit<T>(fn: () => T): T {
    const k = this.raceKit;
    if (!k || this.kitSwapped) return fn();
    const s = this.state;
    const swap = () => {
      [s.inventory, k.inventory] = [k.inventory, s.inventory];
      [s.notesCollected, k.notes] = [k.notes, s.notesCollected];
      [s.objectives, k.objectives] = [k.objectives, s.objectives];
    };
    swap();
    this.kitSwapped = true;
    try {
      return fn();
    } finally {
      swap();
      this.kitSwapped = false;
    }
  }

  private raceEnd(winner: 'host' | 'guest', ending: GameEnding) {
    if (this.vsOver || !this.net) return;
    this.vsOver = true;
    if (winner === this.net.role) {
      // We got out first: play our ending
      this.ach('race_win');
      this.spectating = false;
      this.pendingEnding = ending;
      this.victoryTimer = 1.2;
      this.player.inputEnabled = false;
      return;
    }
    this.finished = true;
    this.running = false;
    this.spectating = false;
    this.dying = false;
    this.player.inputEnabled = false;
    sound.setHeartbeat(60, false);
    document.exitPointerLock?.();
    this.cb.onVersusEnd(false, `${this.net.partnerName} est sorti de l'hôpital avant vous.`);
  }

  // -----------------------------------------------------------------------
  // Stairs (floor 1 ↔ floor 2, built 40 m apart)
  // -----------------------------------------------------------------------
  private stairsFade = 0;

  private static STAIRS_HINT: Record<string, string> = {
    f2: 'Monter à l\'étage 2',
    f1: 'Descendre au rez-de-chaussée',
    f3: 'Monter à l\'étage 3',
    f2u: 'Descendre à l\'étage 2',
    b: 'Descendre au sous-sol par la trappe',
    f1h: 'Remonter l\'échelle (morgue)',
  };
  private static STAIRS_TOAST: Record<string, string> = {
    f2: 'Étage 2 — Direction, Radiologie, Réserve médicale…',
    f1: 'Rez-de-chaussée',
    f3: 'Étage 3 — Unité d\'isolement psychiatrique. Personne n\'aurait dû monter ici.',
    f2u: 'Étage 2',
    b: 'Sous-sol — Chaufferie, Buanderie, Incinérateur… Il fait froid, et ça sent le brûlé.',
    f1h: 'Morgue (rez-de-chaussée)',
  };

  private useStairs(to: string) {
    const dest = this.map.stairs[to];
    if (!dest) return;
    this.player.teleport(dest.pos, dest.yaw);
    sound.playStairs();
    this.stairsFade = 0.6;
    this.blackout = 1;
    this.state.showToast(GameEngine.STAIRS_TOAST[to] ?? '');
    // Your footsteps on the concrete stairs carry
    if (this.vsRole !== 'monster') this.alertAll(this.player.position, 6);
  }

  /** Position of whoever is interacting (host-side, may be the guest). */
  private actorPos() {
    return this.actor === 'remote' ? this.remoteEye().setY(1.2) : this.player.position;
  }

  private performInteraction(t: InteractTarget) {
    this.tut.interacts++;
    const p = this.player;
    const gs = this.state;
    // Versus safety net: the creature only opens / closes doors
    if (this.actorIsMonster() && t.kind !== 'door') return;
    switch (t.kind) {
      case 'door':
        this.interactDoor(t.door);
        break;

      case 'generator': {
        if (!this.outageOn || !this.gen) return;
        this.genPulls++;
        sound.playBreakerClunk();
        p.shake = Math.max(p.shake, 0.15);
        // the engine coughs loudly: the creatures hear it
        this.alertAll(this.gen.position.clone().setY(1), 12);
        if (this.genPulls < 3) {
          gs.showToast(this.genPulls === 1 ? '🔧 Le moteur tousse… Encore !' : '🔧 Il crachote… Encore une fois !');
          break;
        }
        this.endOutage(false);
        break;
      }

      case 'container': {
        const c = this.map.containers.get(t.id);
        if (!c) return;
        // 🧩 The code safe: type the code on its keypad
        if (c.id === 'puzzle-safe' && c.locked) {
          if (this.actor === 'local') this.cb.onKeypad?.();
          return;
        }
        if (c.locked) {
          if (c.requiredItemId && gs.hasItem(c.requiredItemId)) {
            c.locked = false;
            sound.playBreakerClunk();
            gs.showToast(c.unlockMessage ?? `${c.name} déverrouillé.`);
          } else {
            sound.playDoorLocked();
            gs.showToast(c.lockedMessage ?? `${c.name} est verrouillé.`);
            return;
          }
        }
        // Searching Dr Moreau's corpse: it wakes up screaming
        if (c.id === 'body-moreau' && !this.screamerDone) {
          const mine = this.actor === 'local';
          this.triggerScreamer(c.mesh, mine);
          this.net?.send({ k: 'fx', name: 'screamer', mine: !mine });
        }
        if (c.id === 'salle0-cabinet') this.achActor('salle0');
        if (c.id === 'chest-secret' || c.id === 'desk-secret') this.achActor('secret3');
        if (c.itemInside?.type === 'coins') {
          this.giveCoins(c.itemInside.quantity ?? 5);
          c.itemInside = null;
          c.searched = true;
          break;
        }
        if (c.itemInside) {
          if (gs.addItem(c.itemInside)) {
            c.itemInside = null;
            c.searched = true;
          }
        } else {
          sound.playDrawerOpen();
          gs.showToast(`${c.name} : rien d'utile.`);
          c.searched = true;
        }
        break;
      }

      case 'hide': {
        const spot = this.map.hidingSpots.find((s) => s.id === t.id);
        if (!spot) return;
        if (this.challenge === 'nohide') {
          this.state.showToast('🚫 Défi du jour : impossible de se cacher. Courez !');
          return;
        }
        if (this.mimic && this.mimic.burstT < 0 && spot.id === this.mimic.spot.id) {
          this.mimicBurst();
          return;
        }
        p.enterHiding(spot.id, spot.position, spot.viewDirection);
        this.stat('hides');
        if (spot.kind === 'bed') {
          sound.playPaperRustle();
          gs.showToast('Vous vous glissez sous le lit. Ne bougez plus.');
        } else {
          sound.playDoorOpen();
          gs.showToast('Vous êtes caché. Retenez votre souffle.');
        }
        break;
      }

      case 'breaker': {
        if (gs.powerRestored) {
          gs.showToast('Le courant est déjà rétabli.');
          return;
        }
        if (gs.hasItem('item-fuse-1') && gs.hasItem('item-fuse-2')) {
          gs.powerRestored = true;
          gs.removeItem('item-fuse-1');
          gs.removeItem('item-fuse-2');
          sound.playBreakerClunk();
          sound.playPowerUp();
          this.map.breakerLed.emissive.setHex(0x22ff44);
          this.updateDoorLed(this.map.doors.get('door-lab')!);
          p.shake = 0.3;
          gs.showToast('⚡ Courant rétabli. La porte blindée du laboratoire est sous tension.');
          gs.completeObjective('obj-power');
          gs.activateObjective('obj-lab-or-escape');
          this.net?.send({ k: 'fx', name: 'powerUp' });
          // The noise wakes the whole floor up
          this.alertAll(this.actorPos(), 30);
        } else {
          sound.playDoorLocked();
          const missing = [!gs.hasItem('item-fuse-1') && 'Fusible A (Pharmacie)', !gs.hasItem('item-fuse-2') && 'Fusible B (Morgue)']
            .filter(Boolean)
            .join(' et ');
          gs.showToast(`Deux emplacements vides. Il manque : ${missing}.`);
        }
        break;
      }

      case 'purge':
        if (!gs.powerRestored) {
          sound.playDoorLocked();
          gs.showToast('La console est hors tension.');
          return;
        }
        sound.playBreakerClunk();
        sound.playPowerUp();
        this.triggerEnding('PURGE');
        break;

      case 'vending': {
        if (this.vendCooldown > 0) return;
        if (gs.inventory.length >= gs.maxInventorySlots) {
          gs.showToast(`Mains pleines (${gs.maxInventorySlots} objets max) : impossible de prendre une canette.`);
          return;
        }
        this.vendCooldown = 1.3;
        sound.playVendingDispense();
        if (this.actor === 'remote') this.net?.send({ k: 'fx', name: 'vending' });
        gs.addItem(this.makeCan());
        gs.showToast('🥤 Canette obtenue — [1-5] la lancer pour faire diversion · maintenir [B] pour un bottle flip');
        // The machine is noisy
        this.alertAll(this.actorPos(), 8);
        break;
      }

      case 'pickup': {
        const w = this.worldItems.find((x) => x.uid === t.uid);
        if (!w) return;
        if (w.item.type === 'coins') this.giveCoins(w.item.quantity ?? 5);
        else if (!gs.addItem(w.item)) return;
        if (this.site instanceof Dungeon && this.site.duel) this.site.score[this.actor === 'remote' ? 1 : 0] += duelPoints(w.item.id);
        this.removeWorldItem(w.uid);
        break;
      }

      case 'hobo':
        break;

      case 'vent':
        if (this.ventOpen) return;
        this.openVent();
        this.alertAll(this.actorPos(), 7);
        gs.showToast('La grille cède dans un grincement métallique… Accroupissez-vous [C] pour ramper dans le conduit.');
        break;

      case 'repair':
        if (this.stairsBuilt) return;
        if (!gs.hasItem('item-planks')) {
          sound.playDoorLocked();
          gs.showToast('L\'escalier s\'est effondré. Il faudrait des planches… Le conduit d\'aération mène à l\'entrepôt.');
          return;
        }
        gs.removeItem('item-planks');
        this.buildStairs();
        this.alertAll(this.actorPos(), 14);
        gs.showToast('🔨 Vous clouez les planches sur les marches effondrées. L\'escalier est praticable !');
        break;

      case 'can': {
        if (gs.inventory.length >= gs.maxInventorySlots) {
          gs.showToast(`Mains pleines (${gs.maxInventorySlots} objets max).`);
          return;
        }
        if (this.cans.pickUp(t.mesh)) {
          sound.playCanClank(0.2);
          gs.addItem(this.makeCan());
        }
        break;
      }
    }
  }

  private interactDoor(door: DoorObject) {
    const gs = this.state;
    if (this.actorIsMonster()) {
      // Claws can't turn keys
      if (door.isLocked) {
        gs.showToast('Verrouillée. Vos griffes glissent sur le métal…');
        return;
      }
      this.setDoorOpen(door, !door.isOpen);
      return;
    }

    if (door.isLocked) {
      if (door.id === 'door-lab') {
        if (!gs.powerRestored) {
          sound.playDoorLocked();
          gs.showToast('Lecteur de carte éteint. Rétablissez le courant au Bloc Opératoire.');
          return;
        }
        if (!gs.hasItem('keycard-lab')) {
          sound.playDoorLocked();
          gs.showToast('Accès refusé. Carte magnétique Niveau 2 requise (Dr Moreau).');
          return;
        }
        door.isLocked = false;
        gs.removeItem('keycard-lab');
        this.updateDoorLed(door);
        sound.playBreakerClunk();
        gs.showToast('Carte acceptée. Déverrouillage de la porte blindée…');
      } else if (door.id === 'door-pharmacy') {
        if (!gs.hasItem('note-nurse-code')) {
          sound.playDoorLocked();
          gs.showToast('Digicode à 4 chiffres. Le code doit être noté quelque part…');
          return;
        }
        door.isLocked = false;
        sound.playItemPickup();
        gs.showToast('Code 4821 saisi. Clic. La pharmacie est ouverte.');
        gs.completeObjective('obj-pharmacy');
        gs.activateObjective('obj-fuses');
      } else if (door.id === 'door-s-sluice') {
        if (!gs.hasItem('item-crank')) {
          sound.playDoorLocked();
          gs.showToast('Vanne bloquée. Il faut la manivelle de vanne (Local technique).');
          return;
        }
        door.isLocked = false;
        gs.removeItem('item-crank');
        this.updateDoorLed(door);
        gs.completeObjective('obj-s-sluice');
        gs.activateObjective('obj-s-exit');
        // The wheel screeches: everything down here heard it
        for (let i = 0; i < 3; i++) setTimeout(() => sound.playBreakerClunk(), i * 350);
        this.alertAll(door.center, 30);
        gs.showToast('La vanne grince horriblement en tournant… L\'écluse s\'ouvre. Il a entendu. COUREZ vers la plaque d\'égout !');
      } else if (door.id === 'door-s-exit') {
        const sluice = this.map.doors.get('door-s-sluice');
        if (sluice?.isLocked) {
          sound.playDoorLocked();
          gs.showToast('La plaque est bloquée par la pression de l\'eau. Ouvrez d\'abord l\'écluse.');
          return;
        }
        sound.playDoorOpen();
        this.triggerEnding('SEWER');
        return;
      } else if (door.id === 'door-exit') {
        if (!gs.hasItem('key-master-exit')) {
          sound.playDoorLocked();
          gs.showToast('Porte blindée verrouillée. Il faut la clé principale (coffre des Archives).');
          return;
        }
        sound.playDoorOpen();
        this.triggerEnding(gs.hasItem('cassette-moreau') && gs.hasItem('note-dossier-truth') ? 'TRUTH' : 'SURVIVAL');
        return;
      } else if (door.requiredKeyId && gs.hasItem(door.requiredKeyId)) {
        door.isLocked = false;
        gs.removeItem(door.requiredKeyId);
        sound.playBreakerClunk();
        gs.showToast(`${door.name} : déverrouillée.`);
      } else {
        sound.playDoorLocked();
        gs.showToast(`Verrouillée. Nécessite : ${door.requiredKeyName ?? 'une clé'}.`);
        return;
      }
    }

    this.setDoorOpen(door, !door.isOpen);
    if (door.id === 'door-104' && door.isOpen) {
      gs.completeObjective('obj-room-104');
      gs.activateObjective('obj-pharmacy');
    }
  }

  /** Pull the duct grille off (everyone sees it fall). */
  private openVent() {
    this.ventOpen = true;
    const v = this.map.vent;
    v.grille.parent?.remove(v.grille);
    v.collision.disabled = true;
    sound.playCanClank(1);
    sound.playCanClank(0.6, 0.18);
  }

  /** Nail the planks onto the collapsed flight. */
  private buildStairs() {
    this.stairsBuilt = true;
    this.ach('stairs');
    const s = this.map.stairsRepair;
    s.steps.forEach((o) => (o.visible = true));
    s.rubble.parent?.remove(s.rubble);
    for (let i = 0; i < 4; i++) setTimeout(() => sound.playBreakerClunk(), i * 260);
  }

  private triggerEnding(ending: GameEnding) {
    if (this.pendingEnding) return;
    if (this.hideSeek) {
      this.state.showToast('🫣 Cache-cache : pas de sortie ! Restez caché jusqu\'à la fin du temps.');
      return;
    }
    if (this.imp) {
      this.state.showToast('🔪 Imposteur : pas de sortie ! Survivez aux nuits… et démasquez le monstre.');
      return;
    }
    if (this.net?.mode === 'race') {
      // Race: whoever opened the way out first wins (decided by the host)
      if (this.net.role !== 'host' || this.vsOver) return;
      const winner = this.actor === 'remote' ? 'guest' : 'host';
      this.net.send({ k: 'raceEnd', winner, ending });
      this.raceEnd(winner, ending);
      return;
    }
    if (this.vsRole) {
      // Versus: any ending means the survivor got away
      this.versusEnd('survivor', 'escape', ending, true);
      return;
    }
    this.pendingEnding = ending;
    this.victoryTimer = 1.2;
    this.player.inputEnabled = false;
    // Online: everyone reaches the same ending
    if (this.net?.role === 'host') this.net.send({ k: 'end', ending });
  }

  public useItem(item: GameItem) {
    const p = this.player;
    const gs = this.state;
    if (this.vsRole === 'monster') return;
    // Don't waste consumables… unless the hands are full and the player needs the slot
    const handsFull = gs.inventory.length >= gs.maxInventorySlots;
    if (item.type === 'battery' && p.flashlightBattery >= 95 && !handsFull) {
      gs.showToast('La lampe est déjà chargée. Gardez la pile pour plus tard.');
    } else if (item.type === 'medkit' && p.stamina >= p.maxStamina - 1 && p.freeSprint > 0 && !handsFull) {
      gs.showToast('Votre souffle est intact. Gardez l\'adrénaline pour une poursuite.');
    } else if (item.type === 'bandage') {
      this.startBandage(item);
    } else if (
      this.net?.role === 'guest' &&
      (item.type === 'battery' || item.type === 'medkit' || item.type === 'throwable' || item.type === 'sedative' || item.type === 'smoke')
    ) {
      // Team inventory lives on the host: ask it to use the item for us
      const idx = gs.inventory.findIndex((i) => i.id === item.id);
      if (idx >= 0 && (item.type !== 'throwable' || this.canAct())) this.net.send({ k: 'slot', i: idx });
    } else if (item.type === 'battery') {
      p.flashlightBattery = Math.min(100, p.flashlightBattery + (this.challenge === 'nolamp' ? 25 : 55));
      gs.removeItem(item.id);
      sound.playFlashlightToggle(true);
      gs.showToast('Pile insérée : +55 % de batterie.');
    } else if (item.type === 'medkit') {
      p.stamina = p.maxStamina;
      p.freeSprint = 6;
      gs.removeItem(item.id);
      sound.playItemPickup();
      gs.showToast('💉 Adrénaline ! Endurance au maximum + 6 s de sprint illimité.');
    } else if (item.type === 'sedative') {
      if (this.applySedative(this.camera.position, p.yaw)) {
        gs.removeItem(item.id);
        gs.showToast('💉 Le monstre s\'effondre ! Vous avez 5 secondes, fuyez !');
      } else {
        gs.showToast('Trop loin : approchez-vous du monstre (moins de 3 m, face à lui).');
      }
    } else if (item.type === 'throwable') {
      if (this.canAct()) this.throwCan(item);
    } else if (item.type === 'food') {
      if (this.net?.role === 'guest') {
        const idx = gs.inventory.findIndex((i) => i.id === item.id);
        if (idx >= 0) this.net.send({ k: 'slot', i: idx });
      } else {
        gs.removeItem(item.id);
        this.applyUsedItem(item);
      }
    } else if (item.type === 'alarm' || item.type === 'trap') {
      // Put it down: it rings 3 s later / it waits for a creature
      this.dropSlot(gs.inventory.findIndex((i) => i.id === item.id));
    } else if (item.type === 'smoke') {
      gs.removeItem(item.id);
      this.lightSmoke(p.position.x, p.position.z);
    } else if (item.type === 'uvlamp') {
      this.setUv(!this.uvOn);
    } else if (item.type === 'talkie') {
      this.radioCall();
    } else if (item.type === 'note' || item.type === 'cassette') {
      sound.playPaperRustle();
    } else {
      gs.showToast(`${item.name} — s'utilise automatiquement avec [E] au bon endroit.`);
    }
    this.pushHud();
  }

  /** Hotbar key 1-5. */
  public useSlot(index: number) {
    if (!this.running || this.paused || this.dying || this.finished || this.vsRole === 'monster') return;
    this.selectedSlot = index;
    const item = this.state.inventory[index];
    if (item) this.useItem(item);
  }

  // -----------------------------------------------------------------------
  // Items in the world: drop, pick up, alarm clocks, coins
  // -----------------------------------------------------------------------
  private worldItems: WorldItem[] = [];
  private worldUid = 0;
  private worldVersion = 0;
  private lastWorldSent = -1;
  private selectedSlot = 0;

  private spawnWorldItem(item: GameItem, pos: THREE.Vector3, rotY: number, falling: boolean, uid?: number) {
    const disposables: { dispose: () => void }[] = [];
    const mesh = buildItemModel(item, (o) => {
      disposables.push(o);
      return o;
    });
    const id = uid ?? ++this.worldUid;
    this.worldUid = Math.max(this.worldUid, id);
    mesh.traverse((o) => (o.userData = { isPickup: true, uid: id }));
    mesh.position.set(pos.x, falling ? Math.max(pos.y, 0.9) : pos.y, pos.z);
    mesh.rotation.y = rotY;
    this.map.sceneGroup.add(mesh);
    const w: WorldItem = { uid: id, item, mesh, vy: 0, restY: pos.y, alarm: -1, disposables };
    this.worldItems.push(w);
    this.worldVersion++;
    return w;
  }

  private removeWorldItem(uid: number) {
    const i = this.worldItems.findIndex((w) => w.uid === uid);
    if (i < 0) return;
    const w = this.worldItems[i];
    w.mesh.parent?.remove(w.mesh);
    w.disposables.forEach((d) => d.dispose());
    this.worldItems.splice(i, 1);
    this.worldVersion++;
  }

  /** Drops a hotbar item at someone's feet (host / solo decides). */
  private dropFrom(index: number, feet: THREE.Vector3, yaw: number) {
    const gs = this.state;
    const item = gs.inventory[index];
    if (!item) return;
    gs.removeItem(item.id);
    const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    if (item.type === 'throwable') {
      // A can rolls away (it stays a real can you can pick up again)
      this.cans.throw(feet.clone().setY(1.0).addScaledVector(fwd, 0.4), yaw, -1.2);
      return;
    }
    const spot = feet.clone().addScaledVector(fwd, 0.55);
    // Don't drop it inside a wall
    const blocked = this.map.collisionBoxes.some((b) => !b.disabled && spot.x > b.min.x - 0.1 && spot.x < b.max.x + 0.1 && spot.z > b.min.z - 0.1 && spot.z < b.max.z + 0.1);
    if (blocked) spot.copy(feet);
    spot.y = 0;
    const w = this.spawnWorldItem(item, spot, yaw + (Math.random() - 0.5) * 1.5, true);
    sound.playCanClank(0.25, 0.25);
    if (item.type === 'alarm') {
      w.alarm = 3;
      gs.showToast('⏰ Réveil posé : il va sonner dans 3 secondes… éloignez-vous !');
    } else if (item.type === 'trap') {
      w.trap = true;
      gs.showToast('🪤 Piège posé. Attirez un monstre dessus… sans marcher dedans !');
    } else gs.showToast(`Vous lâchez : ${item.name}`);
  }

  /** [X]: drop the selected hotbar item. */
  public dropSlot(index: number) {
    if (!this.canAct() || index < 0) return;
    const item = this.state.inventory[index];
    if (!item) {
      this.state.showToast('Emplacement vide. Molette de la souris pour choisir l\'objet à lâcher.');
      return;
    }
    if (this.net?.role === 'guest') {
      this.net.send({ k: 'act', req: { kind: 'drop', idx: index } });
      return;
    }
    this.dropFrom(index, this.player.position.clone(), this.player.yaw);
    this.pushHud();
  }

  // 💨 Smoke grenades -----------------------------------------------------
  private smokes: { x: number; z: number; t: number; group: THREE.Group; puffs: { m: THREE.Mesh; a: number; r: number; h: number }[]; mat: THREE.MeshStandardMaterial; geo: THREE.BufferGeometry }[] = [];
  private static SMOKE_TIME = 12;

  /** Host / solo: a smoke grenade goes off at (x, z). */
  private lightSmoke(x: number, z: number) {
    this.spawnSmokeFx(x, z);
    this.net?.send({ k: 'smoke', x, z });
    this.ach('smoke');
  }

  private spawnSmokeFx(x: number, z: number) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    const mat = new THREE.MeshStandardMaterial({ color: 0xb8bcc0, roughness: 1, transparent: true, opacity: 0.85, depthWrite: false });
    const geo = new THREE.IcosahedronGeometry(0.7, 1);
    const puffs: { m: THREE.Mesh; a: number; r: number; h: number }[] = [];
    const n = this.lowEndGpu ? 16 : 28;
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = false;
      m.receiveShadow = false;
      const p = { m, a: Math.random() * Math.PI * 2, r: Math.random(), h: Math.random() };
      puffs.push(p);
      group.add(m);
    }
    this.scene.add(group);
    this.smokes.push({ x, z, t: GameEngine.SMOKE_TIME, group, puffs, mat, geo });
    const d = Math.hypot(x - this.player.position.x, z - this.player.position.z);
    if (d < 25) sound.playHiss(2.5);
  }

  private updateSmokes(delta: number) {
    SMOKES.length = 0;
    for (const s of this.smokes) {
      s.t -= delta;
      const age = GameEngine.SMOKE_TIME - s.t;
      const grow = Math.min(1, age / 1.5);
      const radius = 3.2 * grow;
      s.mat.opacity = 0.85 * Math.min(1, s.t / 2.5);
      for (const p of s.puffs) {
        p.a += delta * 0.15;
        const r = p.r * radius;
        p.m.position.set(Math.cos(p.a) * r, 0.4 + p.h * 2.2 * grow, Math.sin(p.a) * r);
        p.m.scale.setScalar(0.6 + grow * (1.2 + p.h));
      }
      if (s.t > 1) SMOKES.push({ x: s.x, z: s.z, r: radius * 0.9 });
    }
    for (const s of this.smokes.filter((x) => x.t <= 0)) {
      s.group.parent?.remove(s.group);
      s.mat.dispose();
      s.geo.dispose();
    }
    this.smokes = this.smokes.filter((x) => x.t > 0);
  }

  private clearSmokes() {
    for (const s of this.smokes) {
      s.group.parent?.remove(s.group);
      s.mat.dispose();
      s.geo.dispose();
    }
    this.smokes = [];
    SMOKES.length = 0;
  }

  /** Host / solo: extra gadgets hidden in the level (smoke grenade + jaw trap). */
  // -----------------------------------------------------------------------
  // 🩸 Wounds: the first hit wounds (bleeding + limp), the second one kills
  // -----------------------------------------------------------------------
  private wounded = false;
  private bleedT = 0;
  private woundGrace = 0;
  private bandT = 0;
  private bandItem: GameItem | null = null;
  private bandPos = new THREE.Vector3();
  private bloodDrops: { mesh: THREE.Mesh; t: number }[] = [];
  private bloodLast = new THREE.Vector3();
  private bloodIdle = 0;
  private bloodScentT = 0;
  private bloodTex: THREE.CanvasTexture | null = null;
  private bloodGeo: THREE.PlaneGeometry | null = null;
  private peerHurtAt = new Map<number, number>();
  private static BLEED_TIME = 60;
  private static LIMP_TIME = 40;

  private get woundAllowed() {
    return !this.vsRole && !this.imp && !this.watchOnly && !this.pendingEnding && !this.finished;
  }

  /** 📳 Phones: short buzz (hit, spotted, caught) unless turned off */
  private buzz(pattern: number | number[]) {
    if (this.settings.vibration === false || this.watchOnly) return;
    try {
      navigator.vibrate?.(pattern);
    } catch {
      /* not supported */
    }
  }

  private resetWounds() {
    this.wounded = false;
    this.bleedT = 0;
    this.woundGrace = 0;
    this.bandT = 0;
    this.bandItem = null;
    if (this.player) this.player.limp = 0;
    for (const d of this.bloodDrops) {
      d.mesh.parent?.remove(d.mesh);
      (d.mesh.material as THREE.Material).dispose();
    }
    this.bloodDrops = [];
    this.peerHurtAt.clear();
  }

  /** Local player caught by a patrol monster: true = wounded instead of killed. */
  private tryWound(m: MonsterAI): boolean {
    if (this.dying || this.spectating || this.finished) return false;
    if (this.woundGrace > 0) return true;
    if (!this.woundAllowed || this.wounded) return false;
    this.wound(m);
    m.stun(4.5);
    return true;
  }

  /** Host: a monster got a guest who was not wounded yet → wound them instead. */
  private tryWoundPeer(m: MonsterAI, peerIdx: number): boolean {
    if (!this.net || !this.woundAllowed) return false;
    const q = this.peers[peerIdx];
    const s = q?.remote?.state;
    if (!q || !s || q.caught || s.dead) return false;
    const now = performance.now();
    const last = this.peerHurtAt.get(peerIdx) ?? -1e9;
    if (now - last < 3000) return true; // grace: the message is on its way
    if (s.wd) return false;
    this.peerHurtAt.set(peerIdx, now);
    m.stun(4.5);
    const prev = this.replyTo;
    this.replyTo = q.name ?? null;
    this.net.send({ k: 'caught', m: this.monsters.indexOf(m), hurt: true });
    this.replyTo = prev;
    this.state.showToast(`🩸 ${q.name ?? 'Votre partenaire'} est blessé ! Un deuxième coup lui serait fatal.`);
    return true;
  }

  private wound(m: MonsterAI | null) {
    const p = this.player;
    this.wounded = true;
    this.run.hits++;
    this.bleedT = GameEngine.BLEED_TIME;
    p.limp = GameEngine.LIMP_TIME;
    this.woundGrace = 3;
    this.bandT = 0;
    this.bandItem = null;
    if (p.isHidden) {
      const spot = this.map.hidingSpots.find((s) => s.id === p.currentHidingSpotId);
      if (spot) p.exitHiding(this.hideExit(spot));
    }
    // Thrown back, away from the claws
    if (m) {
      const dx = p.position.x - m.position.x;
      const dz = p.position.z - m.position.z;
      const d = Math.hypot(dx, dz) || 1;
      p.moveWithCollision((dx / d) * 0.9, (dz / d) * 0.9, this.map.collisionBoxes);
    }
    p.shake = 1;
    this.damage = 1;
    this.fear = 1;
    this.stress = 1;
    sound.playJumpscareStinger();
    this.buzz([140, 60, 220]);
    this.bloodLast.copy(p.position);
    this.dropBlood(p.position, 1.7);
    this.state.showToast('🩸 Il vous a lacéré ! Vous saignez et vous boitez… Un deuxième coup sera FATAL. Trouvez un bandage !');
    this.pushHud();
  }

  private healWound() {
    this.wounded = false;
    this.bleedT = 0;
    this.player.limp = 0;
    sound.playPaperRustle();
    this.state.showToast('🩹 Bandage posé. Le saignement s\'arrête et vous ne boitez plus.');
    this.pushHud();
  }

  private startBandage(item: GameItem) {
    if (!this.wounded) {
      this.state.showToast('Vous n\'êtes pas blessé. Gardez le bandage pour plus tard.');
      return;
    }
    if (this.bandT > 0) return;
    this.bandT = 3;
    this.bandItem = item;
    this.bandPos.copy(this.player.position);
    sound.playPaperRustle();
    this.state.showToast('🩹 Vous posez le bandage… Ne bougez pas (3 s).');
    this.pushHud();
  }

  private finishBandage() {
    const item = this.bandItem;
    this.bandItem = null;
    if (!item) return;
    const gs = this.state;
    const idx = gs.inventory.findIndex((i) => i.id === item.id);
    if (idx < 0) return;
    if (this.net?.role === 'guest') this.net.send({ k: 'slot', i: idx });
    else {
      gs.removeItem(item.id);
      this.healWound();
    }
  }

  private dropBlood(pos: THREE.Vector3, size = 1) {
    if (!this.bloodTex) {
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const g = c.getContext('2d')!;
      const blob = (x: number, y: number, r: number, a: number) => {
        const gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, `rgba(90,0,0,${a})`);
        gr.addColorStop(0.7, `rgba(70,0,0,${a * 0.85})`);
        gr.addColorStop(1, 'rgba(40,0,0,0)');
        g.fillStyle = gr;
        g.beginPath();
        g.arc(x, y, r, 0, Math.PI * 2);
        g.fill();
      };
      blob(32, 32, 16, 0.95);
      for (let i = 0; i < 9; i++) {
        const a = Math.random() * Math.PI * 2;
        const d = 10 + Math.random() * 16;
        blob(32 + Math.cos(a) * d, 32 + Math.sin(a) * d, 2 + Math.random() * 5, 0.9);
      }
      this.bloodTex = new THREE.CanvasTexture(c);
      this.bloodTex.colorSpace = THREE.SRGBColorSpace;
      this.bloodGeo = new THREE.PlaneGeometry(1, 1);
    }
    const mat = new THREE.MeshStandardMaterial({ map: this.bloodTex, transparent: true, depthWrite: false, roughness: 0.25, metalness: 0.1, polygonOffset: true, polygonOffsetFactor: -2 });
    const mesh = new THREE.Mesh(this.bloodGeo!, mat);
    mesh.rotation.set(-Math.PI / 2, 0, Math.random() * Math.PI * 2);
    const s = (0.28 + Math.random() * 0.18) * size;
    mesh.scale.set(s, s, 1);
    mesh.position.set(pos.x + (Math.random() - 0.5) * 0.25, 0.012 + this.bloodDrops.length * 0.0001, pos.z + (Math.random() - 0.5) * 0.25);
    mesh.renderOrder = 2;
    this.scene.add(mesh);
    this.bloodDrops.push({ mesh, t: 0 });
    if (this.bloodDrops.length > 70) {
      const old = this.bloodDrops.shift()!;
      old.mesh.parent?.remove(old.mesh);
      (old.mesh.material as THREE.Material).dispose();
    }
  }

  private updateWounds(delta: number) {
    const p = this.player;
    if (this.woundGrace > 0) this.woundGrace -= delta;
    // Old drops dry and fade after 45 s
    for (let i = this.bloodDrops.length - 1; i >= 0; i--) {
      const d = this.bloodDrops[i];
      d.t += delta;
      if (d.t > 45) {
        const m = d.mesh.material as THREE.MeshStandardMaterial;
        m.opacity = Math.max(0, 1 - (d.t - 45) / 10);
        if (m.opacity <= 0) {
          d.mesh.parent?.remove(d.mesh);
          m.dispose();
          this.bloodDrops.splice(i, 1);
        }
      }
    }
    // Bandage: 3 s standing still
    if (this.bandT > 0) {
      if (this.dying || Math.hypot(p.position.x - this.bandPos.x, p.position.z - this.bandPos.z) > 0.35) {
        this.bandT = 0;
        this.bandItem = null;
        this.state.showToast('Bandage interrompu ! Restez immobile pour le poser.');
      } else {
        this.bandT -= delta;
        if (this.bandT <= 0) {
          this.bandT = 0;
          this.finishBandage();
        }
      }
    }
    if (!this.wounded || this.dying) return;
    // A red pulse at the edges while bleeding
    if (this.bleedT > 0) this.damage = Math.max(this.damage, 0.1 + Math.max(0, Math.sin(performance.now() / 380)) * 0.08);
    if (this.bleedT <= 0) return;
    this.bleedT -= delta;
    if (this.bleedT <= 0) {
      this.state.showToast('Le saignement s\'est arrêté… mais vous êtes toujours blessé. Un bandage vous soignerait.');
      this.pushHud();
      return;
    }
    // Drops every 1.3 m, or a growing pool when you stand still
    const moved = Math.hypot(p.position.x - this.bloodLast.x, p.position.z - this.bloodLast.z);
    this.bloodIdle += delta;
    if (!p.isHidden && (moved > 1.3 || this.bloodIdle > 4)) {
      this.dropBlood(p.position, moved > 1.3 ? 1 : 0.7);
      this.bloodLast.copy(p.position);
      this.bloodIdle = 0;
    }
    // The creatures smell the trail: the drop you left a few seconds ago draws them in
    this.bloodScentT -= delta;
    if (this.bloodScentT <= 0 && this.net?.role !== 'guest' && this.bloodDrops.length > 2) {
      this.bloodScentT = 3;
      const trail = this.bloodDrops[Math.max(0, this.bloodDrops.length - 4)].mesh.position;
      this.alertAll(new THREE.Vector3(trail.x, 1.2, trail.z), 11);
    }
  }

  // -----------------------------------------------------------------------
  // 🧭 Stuck? After ~1 min 40 without progress a hint, after ~3 min 20 a precise one
  // -----------------------------------------------------------------------
  private hintT = 0;
  private hintLevel = 0;
  private hintSig = '';
  private static HINTS: Record<string, [string, string]> = {
    'obj-room-104': [
      'La clé de la chambre 104 est cachée dans un meuble de la pièce. Approche-toi des meubles et appuie sur [E].',
      'Regarde dans la TABLE DE CHEVET, à côté du lit de la chambre 104.',
    ],
    'obj-pharmacy': [
      'Le code de la Pharmacie est écrit dans le journal d\'une infirmière, quelque part dans l\'Aile A (à l\'ouest).',
      'Dans l\'Aile A, fouille le CORPS SOUS UN DRAP couché sur un lit : le journal y est. Lis-le avec [TAB] pour avoir le code.',
    ],
    'obj-fuses': [
      'Un fusible est dans la Pharmacie, l\'autre à la Morgue (au nord-est).',
      'Fusible 1 : l\'ÉTAGÈRE À MÉDICAMENTS de la Pharmacie. Fusible 2 : sur le CORPS DU DR MOREAU, à la Morgue.',
    ],
    'obj-power': [
      'Le disjoncteur est dans le Bloc Opératoire. Va le voir avec les 2 fusibles.',
      'Devant le disjoncteur du Bloc Opératoire, appuie sur [E] : les fusibles se mettent tout seuls.',
    ],
    'obj-lab-or-escape': [
      'Deux sorties : la carte du Laboratoire est à la Morgue, la clé de l\'issue de secours dans le coffre des Archives.',
      'Carte : TIROIR MORTUAIRE N°04 (Morgue). Le code du coffre des Archives est dans le bureau du directeur, à l\'étage.',
    ],
    'obj-s-key': [
      'La clé du local technique est dans le Vestiaire des égoutiers.',
      'Dans le Vestiaire, ouvre l\'ARMOIRE DU CONTREMAÎTRE.',
    ],
    'obj-s-crank': [
      'La manivelle est dans le Local technique : ouvre sa porte avec la clé.',
      'Dans le Local technique, fouille la CAISSE À OUTILS.',
    ],
    'obj-s-sluice': [
      'L\'écluse est tout au fond du tunnel.',
      'Devant l\'écluse, appuie sur [E] avec la manivelle en main. Ne cours pas dans l\'eau : il t\'entendrait.',
    ],
    'obj-s-exit': [
      'La sortie est une plaque d\'égout, après l\'écluse.',
      'Cherche l\'échelle sous la plaque d\'égout. Avance accroupi [C] : il entend tout.',
    ],
  };
  private get hintsOn() {
    return this.settings.hints !== false && !this.imp && !this.vsRole && !this.survival && !this.watchOnly && !this.intro && !this.photo;
  }
  private updateHints(delta: number) {
    if (!this.hintsOn || this.dying || this.finished || this.pendingEnding) return;
    const gs = this.state;
    const cur = gs.objectives.find((o) => o.isCurrent && !o.completed);
    // Progress = a new objective, an item or a document
    const sig = `${cur?.id ?? ''}|${gs.inventory.length}|${gs.notesCollected.length}|${gs.powerRestored}`;
    if (sig !== this.hintSig) {
      this.hintSig = sig;
      this.hintT = 0;
      this.hintLevel = 0;
      return;
    }
    // Hiding from a creature is not being stuck
    if (this.monsters.some((m) => m.state === 'CHASE')) return;
    this.hintT += delta;
    const want = this.hintT > 200 ? 2 : this.hintT > 100 ? 1 : 0;
    if (want <= this.hintLevel) return;
    this.hintLevel = want;
    const pair = cur ? GameEngine.HINTS[cur.id] : null;
    const text = pair
      ? pair[want - 1]
      : want === 1
        ? `Objectif : ${gs.getCurrentObjectiveText()}`
        : 'Fouille chaque meuble avec [E] et lis les documents [TAB] : ils disent souvent où aller.';
    gs.showToast(`💡 Indice : ${text}`, 10000);
    sound.playPaperRustle();
    this.pushHud();
  }

  // -----------------------------------------------------------------------
  // 🗺️ [M] The map draws itself where you (and your team) have been
  // -----------------------------------------------------------------------
  private mapGrid = new Uint8Array(0);
  private mapW = 0;
  private mapH = 0;
  private mapMinX = 0;
  private mapMinZ = 0;
  private mapCell = 1.5;
  private mapWalls = new Float32Array(0);
  private mapMarks: { x: number; z: number; kind: MapMarkKind }[] = [];
  private mapT = 0;

  private setupMap() {
    const boxes = this.map.collisionBoxes.filter((b) => !b.doorId && b.max.y > 0.4 && b.min.y < 2 && b.max.x - b.min.x < 80 && b.max.z - b.min.z < 80);
    let minX = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxZ = -Infinity;
    for (const b of boxes) {
      minX = Math.min(minX, b.min.x);
      minZ = Math.min(minZ, b.min.z);
      maxX = Math.max(maxX, b.max.x);
      maxZ = Math.max(maxZ, b.max.z);
    }
    const p = this.player?.position;
    if (p) {
      minX = Math.min(minX, p.x - 20);
      minZ = Math.min(minZ, p.z - 20);
      maxX = Math.max(maxX, p.x + 20);
      maxZ = Math.max(maxZ, p.z + 20);
    }
    if (!isFinite(minX)) {
      minX = -50;
      minZ = -50;
      maxX = 50;
      maxZ = 50;
    }
    let cell = 1.5;
    while (((maxX - minX) / cell) * ((maxZ - minZ) / cell) > 300000) cell *= 1.5;
    this.mapCell = cell;
    this.mapMinX = minX - 5;
    this.mapMinZ = minZ - 5;
    this.mapW = Math.ceil((maxX - minX + 10) / cell);
    this.mapH = Math.ceil((maxZ - minZ + 10) / cell);
    this.mapGrid = new Uint8Array(this.mapW * this.mapH);
    const walls = new Float32Array(boxes.length * 5);
    boxes.forEach((b, i) => {
      walls.set([b.min.x, b.min.z, b.max.x, b.max.z, b.max.y - Math.max(0, b.min.y) >= 1.5 ? 1 : 0], i * 5);
    });
    this.mapWalls = walls;
    this.mapMarks = [];
    this.mapT = 0;
  }

  private exploreAround(x: number, z: number, r: number) {
    const c = this.mapCell;
    const n = Math.ceil(r / c);
    const cx = Math.floor((x - this.mapMinX) / c);
    const cz = Math.floor((z - this.mapMinZ) / c);
    for (let dz = -n; dz <= n; dz++) {
      for (let dx = -n; dx <= n; dx++) {
        if (dx * dx + dz * dz > n * n) continue;
        const xi = cx + dx;
        const zi = cz + dz;
        if (xi >= 0 && zi >= 0 && xi < this.mapW && zi < this.mapH) this.mapGrid[zi * this.mapW + xi] = 1;
      }
    }
  }

  private updateMapExplore(delta: number) {
    this.mapT -= delta;
    if (this.mapT > 0 || !this.mapGrid.length) return;
    this.mapT = 0.3;
    const p = this.player.position;
    this.exploreAround(p.x, p.z, 4.5);
    // Co-op: what your team mates explore appears on your map too
    for (const { s } of this.livePeers()) this.exploreAround(s.x, s.z, 4.5);
  }

  private addMapMark(x: number, z: number, kind: MapMarkKind, send: boolean) {
    if (this.mapMarks.some((m) => Math.hypot(m.x - x, m.z - z) < 0.5)) return;
    this.mapMarks.push({ x, z, kind });
    if (this.mapMarks.length > 60) this.mapMarks.shift();
    if (send && this.net) this.net.send({ k: 'mark', x, z, m: kind } as GameMsg);
  }

  private removeMapMark(x: number, z: number, send: boolean) {
    const i = this.mapMarks.findIndex((m) => Math.hypot(m.x - x, m.z - z) < 0.6);
    if (i < 0) return;
    this.mapMarks.splice(i, 1);
    if (send && this.net) this.net.send({ k: 'unmark', x, z } as GameMsg);
  }

  /** [M] map: place / remove a mark (shared with the team) */
  public mapMark(x: number, z: number, kind: MapMarkKind) {
    this.addMapMark(x, z, kind, true);
  }
  public mapUnmark(x: number, z: number) {
    this.removeMapMark(x, z, true);
  }

  public mapSnapshot(): MapSnapshot | null {
    if (!this.mapGrid.length || !this.player) return null;
    const p = this.player.position;
    return {
      minX: this.mapMinX,
      minZ: this.mapMinZ,
      cell: this.mapCell,
      w: this.mapW,
      h: this.mapH,
      grid: this.mapGrid,
      walls: this.mapWalls,
      doors: [...this.map.doors.values()].map((d) => ({ x: d.center.x, z: d.center.z, open: d.isOpen, locked: d.isLocked })),
      marks: this.mapMarks.map((m) => ({ ...m })),
      me: { x: p.x, z: p.z, yaw: this.player.yaw },
      peers: this.livePeers().map(({ s, i }) => ({ x: s.x, z: s.z, name: this.peers[i]?.name ?? '' })),
    };
  }

  private spawnGadgets() {
    if (this.net?.role === 'guest' || this.vsRole === 'monster' || this.xmasNight) return;
    const lv = this.maze ?? this.forest ?? this.site;
    const spots = lv ? lv.freeSpots(3) : treatSpots(this.map, 3).map((p) => p.setY(p.y - 0.45));
    const defs = [SMOKE_ITEM, TRAP_ITEM, Math.random() < 0.5 ? SMOKE_ITEM : TRAP_ITEM];
    spots.forEach((pos, i) => {
      const item: GameItem = { id: `gadget-${i}-${Math.floor(Math.random() * 1e6)}`, ...defs[i] };
      this.spawnWorldItem(item, pos.setY(Math.max(0, pos.y)), Math.random() * Math.PI * 2, false);
    });
    // 🔦 UV lamp in the hospital levels, 📻 a walkie-talkie in co-op
    const extra: Omit<GameItem, 'id'>[] = [];
    if (!lv && !this.imp) extra.push(UV_ITEM);
    // 🩹 Bandages: 2 in the hospital, 1 in the other levels
    if (!this.imp) extra.push(BANDAGE_ITEM);
    if (!lv && !this.imp) extra.push(BANDAGE_ITEM);
    if (this.net?.mode === 'coop') extra.push(TALKIE_ITEM);
    if (!extra.length) return;
    const xs = lv ? lv.freeSpots(extra.length) : treatSpots(this.map, extra.length).map((p) => p.setY(p.y - 0.45));
    extra.forEach((d, i) => {
      const pos = xs[i];
      if (!pos) return;
      const item: GameItem = { id: `gadget-x${i}-${Math.floor(Math.random() * 1e6)}`, ...d };
      this.spawnWorldItem(item, pos.setY(Math.max(0, pos.y)), Math.random() * Math.PI * 2, false);
    });
  }

  private updateWorldItems(delta: number) {
    this.updateSmokes(delta);
    // 🪤 Armed traps (the host / solo decides)
    if (this.net?.role !== 'guest') {
      const sprung: number[] = [];
      for (const w of this.worldItems) {
        if (!w.trap) continue;
        const pos = w.mesh.position;
        const victim = this.monsters.find((m) => m.state !== 'STUNNED' && Math.hypot(m.position.x - pos.x, m.position.z - pos.z) < 0.9);
        if (!victim) continue;
        victim.stun(6);
        sprung.push(w.uid);
        const d = Math.hypot(pos.x - this.player.position.x, pos.z - this.player.position.z);
        sound.playTrapSnap(d);
        this.net?.send({ k: 'trap', x: pos.x, z: pos.z });
        if (d < 30) {
          this.state.showToast('🪤 CLAC ! Un monstre est pris dans le piège : 6 secondes pour filer !');
          this.ach('trap');
        }
        // The other creatures heard it
        this.alertAll(pos.clone().setY(1.2), 14);
      }
      sprung.forEach((uid) => this.removeWorldItem(uid));
    }
    for (const w of this.worldItems) {
      if (w.mesh.position.y > w.restY) {
        w.vy -= 9.8 * delta;
        w.mesh.position.y = Math.max(w.restY, w.mesh.position.y + w.vy * delta);
        if (w.mesh.position.y === w.restY) w.vy = 0;
      }
      if (w.alarm > 0) {
        w.mesh.rotation.z = Math.sin(performance.now() * 0.08) * 0.03;
        w.alarm -= delta;
        if (w.alarm <= 0) {
          w.alarm = -1;
          const pos = w.mesh.position;
          const d = Math.hypot(pos.x - this.player.position.x, pos.z - this.player.position.z);
          sound.playAlarmRing(d);
          if (d < 25) this.ach('alarm');
          this.net?.send({ k: 'alarm', x: pos.x, z: pos.z });
          // Rings for a while: every creature around comes to see
          this.alertAll(pos.clone().setY(1.2), 30);
          setTimeout(() => this.running && this.alertAll(pos.clone().setY(1.2), 25), 1500);
        }
      }
    }
  }

  // ---- 🍬 Event treats (bonbons, œufs, cœurs…) lying around the hospital ----
  public runTreats = 0;
  /** Tutorial: what the player has done this run */
  public tut = { cans: 0, interacts: 0 };
  private treatSeason: Season | null = null;
  private treats: { mesh: THREE.Group; y: number; taken: boolean; chest?: boolean; present?: boolean; gold?: boolean }[] = [];
  /** 🎁 golden gifts picked up this run (December) */
  public runGold = 0;
  /** Rare chests found this run (each worth TREATS_PER_CHEST) */
  public runChests = 0;
  /** 🎄 Christmas night (special chapter): evil Santa, snow, 12 presents to find */
  public xmasNight = false;
  /** 🧟 Endless survival: a new creature every wave, last as long as you can */
  public survival = false;
  public survivalWave = 0;
  private survivalNext = 0;
  public runPresents = 0;
  private snow: THREE.Points | null = null;
  private treatDisposables: { dispose: () => void }[] = [];
  private clearTreats() {
    for (const t of this.treats) t.mesh.removeFromParent();
    this.snow?.removeFromParent();
    this.snow = null;
    this.treatDisposables.forEach((d) => d.dispose());
    this.treats = [];
    this.treatDisposables = [];
  }
  /** During an event, ~40 treats are scattered in every chapter, and sometimes a rare chest. */
  private spawnTreats() {
    this.clearTreats();
    this.runTreats = 0;
    this.runChests = 0;
    this.runPresents = 0;
    this.runGold = 0;
    if (this.xmasNight && !this.maze && !this.forest && !this.site) this.setupXmasNight();
    else if (getActiveSeason() === 'noel' && !this.imp && this.vsRole !== 'monster') this.setupGoldGifts();
    this.survivalWave = 0;
    if (this.survival && !this.maze && !this.forest && !this.site) {
      this.survivalWave = 1;
      this.survivalNext = 40;
      this.queueChapterToast('🧟 SURVIE INFINIE. Pas de sortie qui compte : tenez le plus longtemps possible. Toutes les 40 secondes environ, une créature de plus arrive… et elles savent où vous êtes.');
    }
    this.treatSeason = getActiveSeason();
    if (!this.treatSeason || this.vsRole === 'monster') return;
    const track = <T extends { dispose: () => void }>(o: T) => {
      this.treatDisposables.push(o);
      return o;
    };
    const lv = this.maze ?? this.forest ?? this.site;
    // Chapters 3-5 have their own floor; their spots are at ground level
    const spots = lv ? lv.freeSpots(42).map((p) => p.setY(p.y + 0.45)) : treatSpots(this.map, 42);
    // 1 chance in 3: one rare chest (250 treats) hidden among them
    const chestAt = Math.random() < 0.34 && spots.length > 10 ? spots.length - 1 : -1;
    spots.forEach((pos, i) => {
      const chest = i === chestAt;
      const mesh = chest ? buildChestModel(this.treatSeason!, track) : buildTreatModel(this.treatSeason!, track);
      mesh.position.copy(pos);
      if (chest) mesh.position.y -= 0.45;
      mesh.rotation.y = Math.random() * Math.PI * 2;
      this.scene.add(mesh);
      this.treats.push({ mesh, y: mesh.position.y, taken: false, chest });
    });
  }
  /** 🧟 Survival: the waves */
  private updateSurvival(delta: number) {
    if (!this.survival || !this.survivalWave || this.dying || this.finished) return;
    this.survivalNext -= delta;
    if (this.survivalNext > 0) return;
    this.survivalWave++;
    this.survivalNext = Math.max(22, 42 - this.survivalWave * 2);
    if (this.monsters.length < 12) {
      const spawns = this.map.monsterSpawns;
      // The spawn point furthest from the player, so nobody appears in your face
      const s = [...spawns].sort((a, b) => b.pos.distanceToSquared(this.player.position) - a.pos.distanceToSquared(this.player.position))[0];
      const at = s.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.5, 0, (Math.random() - 0.5) * 1.5));
      if (this.survivalWave % 5 === 0) {
        this.spawnNurse(at, this.map.patrolRoute, s.routeIdx);
        this.shout('🧟 Vague ' + this.survivalWave + ' : une infirmière s\'est jointe à la chasse. Ne la quittez pas des yeux.', 0.3);
        this.alertAll(this.player.position.clone(), 30);
        return;
      }
      const m = new MonsterAI(at, this.map.navNodes, this.map.patrolRoute, this.map.doors, (door) => this.setDoorOpen(door, true, true), s.routeIdx);
      m.applyLook(this.localLook.monster);
      m.speedMul = 1 + Math.min(0.5, this.survivalWave * 0.03);
      if (this.lowEndGpu) m.mesh.traverse((o) => (o.castShadow = false));
      this.monsters.push(m);
      this.scene.add(m.mesh);
    }
    // They all come to where you are now
    this.alertAll(this.player.position.clone(), 30);
    sound.playItemPickup();
    this.state.showToast(`☠️ VAGUE ${this.survivalWave} — une créature de plus… elles savent où vous êtes.`);
  }

  private updateTreats(delta: number) {
    this.updateSurvival(delta);
    this.updateSnow(delta);
    if (!this.treats.length) return;
    const t = performance.now() / 1000;
    const p = this.player.position;
    for (let i = 0; i < this.treats.length; i++) {
      const tr = this.treats[i];
      if (tr.taken) continue;
      if (tr.present) {
        tr.mesh.rotation.y += delta * 0.6;
      } else if (!tr.chest) {
        tr.mesh.rotation.y += delta * 1.6;
        tr.mesh.position.y = tr.y + Math.sin(t * 2.2 + i) * 0.06;
      } else {
        // The chest glows / pulses so you notice it from afar
        const glow = tr.mesh.userData.glow as THREE.MeshBasicMaterial | undefined;
        if (glow) glow.opacity = 0.35 + Math.sin(t * 3) * 0.2;
      }
      const dx = tr.mesh.position.x - p.x;
      const dz = tr.mesh.position.z - p.z;
      if (dx * dx + dz * dz < 0.8 && Math.abs(p.y - tr.y) < 2.2) {
        tr.taken = true;
        tr.mesh.removeFromParent();
        sound.playItemPickup();
        if (tr.gold) {
          this.runGold++;
          this.state.showToast(`🎁 Cadeau doré ${this.runGold}/3 ! (5, 15 et 30 trouvés = skins du Père Fouettard — gardés même si tu meurs)`);
          continue;
        }
        if (tr.present) {
          this.runPresents++;
          this.state.showToast(
            this.runPresents >= XMAS_PRESENTS
              ? `🎁 ${XMAS_PRESENTS}/${XMAS_PRESENTS} — TOUS LES CADEAUX ! Sortez de l'hôpital pour gagner le skin.`
              : `🎁 Cadeau ${this.runPresents}/${XMAS_PRESENTS}`
          );
          continue;
        }
        if (!this.treatSeason) continue;
        const info = SEASON_INFO[this.treatSeason].treat;
        if (tr.chest) {
          this.runChests++;
          this.state.showToast(`💎 COFFRE RARE ! +${TREATS_PER_CHEST} ${info.many} ${info.emoji}`);
          continue;
        }
        this.runTreats++;
        this.state.showToast(`${info.emoji} ${this.runTreats} ${this.runTreats > 1 ? info.many : info.one} — gardés même si vous mourez`);
      }
    }
  }

  /** 🎁 December: 3 golden gifts hidden in every level (they count for the Père Fouettard skins) */
  private setupGoldGifts() {
    const track = <T extends { dispose: () => void }>(o: T) => {
      this.treatDisposables.push(o);
      return o;
    };
    const lv = this.maze ?? this.forest ?? this.site;
    const spots = lv ? lv.freeSpots(12).map((p) => p.setY(p.y + 0.45)) : treatSpots(this.map, 14);
    // Far from each other: take every 4th spot
    const picks = spots.filter((_, i) => i % 4 === 1).slice(0, 3);
    for (const pos of picks) {
      const mesh = buildPresentModel(track);
      mesh.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const mat = track((m.material as THREE.MeshStandardMaterial).clone());
        mat.color.lerp(new THREE.Color(0xffc21a), 0.75);
        mat.emissive = new THREE.Color(0x6a4800);
        mat.emissiveIntensity = 0.6;
        mat.metalness = 0.6;
        mat.roughness = 0.3;
        m.material = mat;
      });
      mesh.scale.setScalar(0.8);
      mesh.position.set(pos.x, pos.y - 0.45, pos.z);
      mesh.rotation.y = Math.random() * Math.PI * 2;
      this.scene.add(mesh);
      this.treats.push({ mesh, y: mesh.position.y, taken: false, present: true, gold: true });
    }
  }

  /** 🎄 Christmas night: presents hidden everywhere, snow falling, Santa has turned… */
  private setupXmasNight() {
    const track = <T extends { dispose: () => void }>(o: T) => {
      this.treatDisposables.push(o);
      return o;
    };
    for (const pos of treatSpots(this.map, XMAS_PRESENTS + 6).slice(0, XMAS_PRESENTS)) {
      const mesh = buildPresentModel(track);
      mesh.position.set(pos.x, pos.y - 0.45, pos.z);
      mesh.rotation.y = Math.random() * Math.PI * 2;
      this.scene.add(mesh);
      this.treats.push({ mesh, y: mesh.position.y, taken: false, present: true });
    }
    // Snow drifting down around the player (through the broken windows…)
    const N = 1400;
    const arr = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      arr[i * 3] = (Math.random() - 0.5) * 30;
      arr[i * 3 + 1] = Math.random() * 3.4;
      arr[i * 3 + 2] = (Math.random() - 0.5) * 30;
    }
    const geo = track(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const mat = track(new THREE.PointsMaterial({ color: 0xffffff, size: 0.035, transparent: true, opacity: 0.85, depthWrite: false }));
    this.snow = new THREE.Points(geo, mat);
    this.snow.frustumCulled = false;
    this.scene.add(this.snow);
    // The creatures wear Santa's clothes tonight
    for (const m of this.monsters) m.applyLook({ ...this.localLook.monster, outfit: 'evilsanta', acc: '' });
    this.queueChapterToast(
      `🎄 NUIT DE NOËL. Le Père Noël n'est pas passé… quelque chose a pris sa place. Retrouvez les ${XMAS_PRESENTS} cadeaux cachés dans l'hôpital, puis sortez. Tous les cadeaux = un skin unique !`
    );
  }
  private updateSnow(delta: number) {
    if (!this.snow) return;
    const p = this.player.position;
    const a = this.snow.geometry.attributes.position as THREE.BufferAttribute;
    const t = performance.now() / 1000;
    for (let i = 0; i < a.count; i++) {
      let y = a.getY(i) - delta * (0.5 + (i % 7) * 0.06);
      if (y < 0) y += 3.4;
      a.setY(i, y);
      a.setX(i, a.getX(i) + Math.sin(t + i) * delta * 0.15);
    }
    a.needsUpdate = true;
    this.snow.position.set(p.x, 0, p.z);
  }

  /** Coins found during the run: yours if you get out. */
  private giveCoins(n: number) {
    if (this.actor === 'remote') {
      this.net?.send({ k: 'coins', n });
      return;
    }
    this.state.runCoins += n;
    sound.playItemPickup();
    this.state.showToast(`🪙 +${n} pièces (gardées si vous sortez de l'hôpital)`);
  }

  /** Can the player carry one more object? */
  public get handsFull() {
    return this.state.inventory.length >= this.state.maxInventorySlots;
  }

  /** Something bought from the hobo / taken from the stash goes straight into your hands. */
  public grantSupply(kind: SupplyKind | 'can'): boolean {
    if (this.handsFull) return false;
    this.supplyCounter++;
    const defs: Record<string, Omit<GameItem, 'id'>> = {
      battery: { name: 'Pile', type: 'battery', description: 'Recharge 55 % de la batterie de la lampe torche.', icon: 'BatteryCharging' },
      medkit: { name: 'Adrénaline', type: 'medkit', description: 'Auto-injecteur : endurance au maximum + 6 s de sprint illimité.', icon: 'HeartPulse' },
      sedative: { name: 'Seringue de Sédatif', type: 'sedative', description: 'Immobilise un monstre 5 secondes (à moins de 3 m, face à lui).', icon: 'Syringe' },
      food: { name: 'Barre de céréales', type: 'food', description: 'Redonne 40 points d\'endurance.', icon: 'Cookie' },
      alarm: { name: 'Réveil', type: 'alarm', description: 'Posez-le : il sonne au bout de 3 s et attire les monstres.', icon: 'AlarmClock' },
      smoke: SMOKE_ITEM,
      trap: TRAP_ITEM,
      bandage: BANDAGE_ITEM,
    };
    const item: GameItem = kind === 'can' ? this.makeCan() : { id: `shop-${kind}-${this.supplyCounter}-${Date.now() % 100000}`, ...defs[kind] };
    if (this.net?.role === 'guest') this.net.send({ k: 'act', req: { kind: 'give', item } });
    else this.state.addItem(item);
    this.pushHud();
    return true;
  }
  private supplyCounter = 0;

  public dispose() {
    cancelAnimationFrame(this.rafId);
    this.resizeObserver?.disconnect();
    this.mic.stop();
    this.mic.onPcm = null;
    this.voice.dispose();
    this.puppet?.dispose();
    this.markers?.dispose();
    for (const [t, type, fn] of this.listeners) t.removeEventListener(type, fn);
    this.player.dispose();
    this.destroyWorld();
    this.beam.dispose();
    this.remoteBeam.dispose();
    this.dust.geometry.dispose();
    (this.dust.material as THREE.Material).dispose();
    this.composer.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    sound.setHeartbeat(60, false);
  }
}
