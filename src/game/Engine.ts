import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { FlashlightBeam, makeFlashlightCookie } from './FlashlightBeam';

import { Chapter, ControlSettings, GameEnding, GameItem, MonsterState, Objective } from '../types';
import { sound } from '../audio/SoundSystem';
import { DoorObject, MapBuilder, MapData } from './MapBuilder';
import { PlayerController } from './PlayerController';
import { MonsterAI } from './MonsterAI';
import { Labyrinth } from './Labyrinth';
import { Forest, ForestNet, ForestPlayer } from './Forest';
import { SiteB, SiteNet, SitePlayer } from './SiteB';
import { GameState } from './GameState';
import { ProceduralTextures } from '../textures/ProceduralTextures';
import { MicListener, MicStatus } from '../audio/MicListener';
import { VoiceChat } from '../audio/VoiceChat';
import type { StatKey } from '../achievements';
import type { ChallengeId } from '../challenges';
import { Difficulty, difficultyInfo } from './Difficulty';
import { CanSystem, FlipResult } from './CanSystem';
import { RemotePlayer } from './RemotePlayer';
import { NoiseMarkers } from './NoiseMarkers';
import { VentCrawler, CRAWLER_STATES, CrawlerHuman } from './VentCrawler';
import { buildItemModel } from './ItemModels';
import type { SupplyKind } from '../economy';
import { getActiveSeason } from '../seasons';
import { buildSeasonalDecor } from './SeasonalDecor';

/** Anything that can kill the player (and play the death lunge). */
type Killer = { poseLunge: (camPos: THREE.Vector3, t: number) => void; headWorld: THREE.Vector3 };
import { segmentHitsBox } from './MonsterAI';
import { Appearance, DEFAULT_APPEARANCE } from '../appearance';

/** Versus: the survivor has this long to escape. */
const VERSUS_TIME = 12 * 60;
import type { MonsterSenses } from './MonsterAI';
import { GameLink, GameMsg, InteractRequest, MONSTER_STATES, PlayerNetState, WorldSnapshot } from '../net/protocol';

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

export interface HudSnapshot {
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
  onVersusEnd: (won: boolean, text: string) => void;
  /** Talking to the hobo in the warehouse (opens his shop). */
  onHobo: () => void;
  /** Achievement unlocked during play (the account may already have it). */
  onAchievement?: (id: string) => void;
  /** Progress counter for counter achievements. */
  onStat?: (key: StatKey, n: number) => void;
}

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
  | { kind: 'stairs'; dir: 'up' | 'down'; to: string };

/** An item lying in the world (dropped, or left on a table). */
interface WorldItem {
  uid: number;
  item: GameItem;
  mesh: THREE.Group;
  /** falling animation */
  vy: number;
  restY: number;
  /** alarm clock: seconds before it rings (-1 = idle) */
  alarm: number;
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
  private site: SiteB | null = null;
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
  private remote: RemotePlayer | null = null;
  /** Partner's flashlight: always in the scene (constant light count = no shader recompiles). */
  private remoteLight: THREE.SpotLight;
  private remoteLightTarget = new THREE.Object3D();
  private netSendTimer = 0;
  private snapTimer = 0;
  private lastNotesSent = -1;
  /** Local player died in multiplayer and now watches the partner. */
  private spectating = false;
  /** Host: the guest has been caught (until its own state confirms it). */
  private remoteCaught = false;
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
  private partnerLook: Appearance | null = null;

  /** The local player's colours (from the account). Applied from the next reset. */
  public setLocalLook(a: Appearance) {
    this.localLook = a;
    if (!this.vsRole) this.monsters.forEach((m) => m.applyLook(a.monster));
  }

  /** Apply everyone's colours to the current bodies. */
  private applyLooks() {
    const vs = this.vsRole;
    // AI creatures wear the local player's monster colours
    this.monsters.forEach((m) => m.applyLook(this.localLook.monster));
    if (this.puppet) {
      if (vs === 'monster') this.puppet.applyLook(this.localLook.monster);
      else if (this.partnerLook) this.puppet.applyLook(this.partnerLook.monster);
    }
    if (this.remote && this.partnerLook) this.remote.applyLook(this.partnerLook.human);
  }

  /** Versus role of the local player (null in solo / coop). */
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
      if (e.code === 'KeyB' && !e.repeat) this.startFlipCharge();
      if (e.code === 'KeyG' && !e.repeat) this.tryBlind();
      if (e.code === 'KeyX' && !e.repeat) this.dropSlot(this.selectedSlot);
      if (e.code === 'KeyV' && !e.repeat) this.toggleVoiceMute();
      if (e.code === 'KeyR' && !e.repeat) this.drawChalk();
      if ((e.code === 'Space' || e.code === 'Enter') && this.intro) this.skipIntro();
    }) as EventListener);
    this.mic.onPcm = (s, r) => this.voice.onMic(s, r);
    // Phones keep audio asleep until a touch
    this.listen(window, 'pointerdown', (() => {
      this.mic.resume();
      if (this.intro && this.running) this.skipIntro();
    }) as EventListener);
    this.listen(window, 'keyup', ((e: KeyboardEvent) => {
      if (e.code === 'KeyB') this.releaseFlip();
    }) as EventListener);
    // Mouse wheel: pick the hotbar slot that [X] drops
    this.listen(window, 'wheel', ((e: WheelEvent) => {
      if (!this.running || this.vsRole === 'monster') return;
      this.selectedSlot = (this.selectedSlot + (e.deltaY > 0 ? 1 : 4)) % 5;
      this.pushHud();
    }) as EventListener);
    this.resizeObserver = new ResizeObserver(() => this.onResize());
    this.resizeObserver.observe(container);
    this.listen(document, 'pointerlockchange', () => {
      const locked = document.pointerLockElement === this.renderer.domElement;
      this.player.isLocked = locked;
      if (locked) this.player.freeLook = false;
      if (!locked && this.running && !this.dying && !this.finished) this.cb.onPointerUnlock();
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
    this.monsters = [];
    this.crawler = null;
    if (this.chapter === 5) this.spawnSite();
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
    this.finishWorld();
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
    if (this.net && this.net.mode !== 'coop') return;
    if (this.chapter === 1) this.startIntro();
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
    const keep = new Set(['battery', 'food', 'sedative', 'medkit', 'throwable', 'alarm']);
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
  /** Seconds played this run (escape time for the leaderboard). */
  public get runTime() {
    return this.run.time;
  }

  /** Chapter 3, [R]: a chalk arrow on the floor so you know where you've been. */
  public drawChalk() {
    const p = this.player;
    if (this.site && this.running && !this.paused && !this.dying && !this.finished && !this.intro) {
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
    this.run = { time: 0, light: 0, hid: false, chased: false, voiced: false, crawler: 'LURK' };
    this.waterWarned = false;
    // Online, the guest wakes up a little further in room 104 (not inside the host)
    const sewers = this.chapter === 2;
    const base = sewers ? this.map.sewer.start : this.map.playerStart;
    const start = this.net?.role === 'guest' ? base.clone().add(sewers ? new THREE.Vector3(1.4, 0, -1.2) : new THREE.Vector3(1.4, 0, 1.0)) : base;
    if (this.maze) this.player.reset(this.maze.start.clone(), this.maze.startYaw);
    else if (this.forest || this.site) {
      const lv = (this.forest ?? this.site)!;
      // Co-op: the guest stands a little to the side
      const off = this.net?.role === 'guest' ? new THREE.Vector3(1.4, 0, 0) : new THREE.Vector3();
      this.player.reset(lv.start.clone().add(off), lv.startYaw);
    } else this.player.reset(start, sewers ? this.map.sewer.startYaw : this.map.playerStartYaw);
    this.chapterToast = null;
    if (this.site)
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
    // Daily challenge modifiers
    const ch = this.challenge;
    this.player.batteryDrainMul = ch === 'dim' ? 3 : ch === 'dive' ? 2 : 1;
    this.baseDrain = this.player.batteryDrainMul;
    this.player.flashlight.color.setHex(0xfff1dc);
    this.player.noSprint = ch === 'nosprint';
    if (ch === 'pack3') this.state.maxInventorySlots = 3;
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
    this.fearFlashText = null;
    this.pendingEnding = null;
    this.hint = null;
    // Multiplayer state
    this.spectating = false;
    this.remoteCaught = false;
    this.partnerGone = false;
    this.menuOpen = false;
    this.lastNotesSent = -1;
    this.remote?.dispose();
    this.remote = null;
    if (this.net) {
      this.remote = new RemotePlayer(this.net.partnerName, this.remoteLight, this.remoteLightTarget);
      // Player vs player: no name above the opponent's head
      this.remote.showName = this.net.mode === 'coop';
      this.scene.add(this.remote.group);
    }
    this.setupVersus();
    this.setupRace();
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
    this.timeLeft = VERSUS_TIME;
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
    if (this.chapter === 5) {
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

    // The host keeps the clock
    if (this.net?.role === 'host' && !this.vsOver && !this.pendingEnding) {
      this.timeLeft = Math.max(0, this.timeLeft - delta);
      if (this.timeLeft <= 0) this.versusEnd('monster', 'timeout', undefined, true);
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
    if (broadcast) this.net?.send({ k: 'vsEnd', winner, reason: cause, ending });
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
    this.partnerLook = null; // the (new) partner will send theirs
    link?.setHandler((msg) => this.onNetMsg(msg));
    this.voice.attach(link);
    this.voice.enabled = this.settings.voiceChat !== false;
    if (!link) {
      this.remote?.dispose();
      this.remote = null;
    }
  }

  public get isOnline() {
    return !!this.net;
  }

  /** Partner left the room. */
  public partnerLeft() {
    if (!this.net) return;
    this.partnerGone = true;
    this.remote?.dispose();
    this.remote = null;
    this.voice.update(0, 0, 0, 1000);
    this.state.showToast(`${this.net.partnerName} a quitté la partie.`);
    // Race: the rival gave up
    if (this.net.mode === 'race' && !this.vsOver && !this.pendingEnding) {
      this.vsOver = true;
      this.finished = true;
      this.running = false;
      this.player.inputEnabled = false;
      document.exitPointerLock?.();
      this.cb.onVersusEnd(true, `Votre rival (${this.net.partnerName}) a abandonné la course.`);
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
    return !!this.remote?.state && !this.remote.state.dead && !this.partnerGone;
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
    const notes = this.raceKit ? this.raceKit.notes : this.state.notesCollected;
    if (notes.length !== this.lastNotesSent) {
      w.notes = notes;
      this.lastNotesSent = notes.length;
    }
    return w;
  }

  /** Guest: mirror the host's world. */
  private applySnapshot(w: WorldSnapshot) {
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
      this.site?.netApply(w.lv as SiteNet);
    }
  }

  // -----------------------------------------------------------------------
  // Achievements
  // -----------------------------------------------------------------------
  /** What happened during this run (for the escape achievements). */
  private run = { time: 0, light: 0, hid: false, chased: false, voiced: false, crawler: 'LURK' as string };

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
    if (ending === 'DESTROY' || ending === 'LUCAS') {
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
    this.remote?.update(delta);
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
    this.spectating = false;
    this.finished = true;
    this.running = false;
    this.blackout = 1;
    if (this.net?.role === 'host') this.net.send({ k: 'gameover' });
    this.cb.onGameOver();
  }

  private onNetMsg(msg: GameMsg) {
    const host = this.net?.role === 'host';
    switch (msg.k) {
      case 'p':
        this.remote?.apply(msg.s);
        break;
      case 'snap':
        if (!host) this.applySnapshot(msg.w);
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
      case 'coins':
        this.state.runCoins += msg.n;
        this.state.showToast(`🪙 +${msg.n} pièces (gardées si vous sortez de l'hôpital)`);
        sound.playItemPickup();
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
        if (m && !this.dying && !this.spectating) this.startDeath(m);
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
    } else if (item.type === 'battery' || item.type === 'medkit' || item.type === 'food') {
      this.state.removeItem(item.id);
      this.net?.send({ k: 'used', item });
    } else if (item.type === 'alarm') {
      const s = this.remote?.state;
      if (s) this.dropFrom(i, new THREE.Vector3(s.x, 0, s.z), s.yaw);
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
      p.flashlightBattery = Math.min(100, p.flashlightBattery + 55);
      sound.playFlashlightToggle(true);
      this.state.showToast('Pile insérée : +55 % de batterie.');
    } else if (item.type === 'medkit') {
      p.stamina = p.maxStamina;
      sound.playItemPickup();
      this.state.showToast('Adrénaline injectée : endurance au maximum.');
    } else if (item.type === 'food') {
      p.stamina = Math.min(p.maxStamina, p.stamina + 40);
      sound.playPaperRustle();
      this.state.showToast('Miam. Vous reprenez votre souffle (+40 endurance).');
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
    this.startMic();
  }

  public stop() {
    this.running = false;
    this.player.inputEnabled = false;
    sound.setHeartbeat(60, false);
    this.mic.stop();
  }

  /** Online with the voice chat on: the microphone is needed even if the creature can't hear it. */
  private get wantsVoice() {
    return !!this.net && !this.partnerGone && this.settings.voiceChat !== false;
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

    // Bloom alone costs as much as the whole scene on integrated GPUs
    this.bloom.enabled = !s.performanceMode && !this.lowEndGpu;
    this.maxPixelRatio = s.performanceMode ? 0.7 : this.lowEndGpu ? 0.85 : Math.min(window.devicePixelRatio, 1.25);
    this.setPixelRatio(Math.min(this.lowEndGpu ? 0.75 : this.pixelRatio, this.maxPixelRatio));
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
    if (document.hidden) return;
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
  private tick = (now: number) => {
    this.rafId = requestAnimationFrame(this.tick);
    // rAF timestamps can lag behind performance.now() right after start(): never step backwards
    const realDelta = Math.max(0, (now - this.lastTime) / 1000);
    const delta = Math.min(realDelta, 0.05);
    this.lastTime = now;
    if (this.running && !this.paused) this.adaptResolution(realDelta);

    const simulate = this.running && !this.paused && !this.finished;
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
    this.composer.render(delta);
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
        this.site.mirror(delta);
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
    const s = this.remote?.state;
    if (this.net && s && !this.partnerGone) {
      players.push({
        playerPos: new THREE.Vector3(s.x, 1.7, s.z),
        playerHidden: s.hid,
        playerVisibility: s.vis,
        listenerRight: right,
        dead: s.dead || this.remoteCaught,
      });
    }
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
    const rs = this.net && !this.partnerGone ? this.remote?.state : undefined;
    const levelCatch = (m: MonsterAI | null, dead: boolean) => (i: number) => {
      if (!m) return;
      if (i === 0) {
        if (!dead) this.startDeath(m);
      } else this.catchRemote(m);
    };
    // Chapter 4: the Beast hunts by sight (scripted)
    if (this.forest) {
      const f = this.forest;
      const dead = this.dying || this.finished || !!this.pendingEnding;
      if (!(this.dying && this.killer === f.stalker)) {
        const pls: ForestPlayer[] = [{ pos: p.position, yaw: p.yaw, flashlight: p.flashlightOn, crouch: p.isCrouching, sprint: p.isSprinting, dead: meDead }];
        if (rs) pls.push({ pos: new THREE.Vector3(rs.x, 1.7, rs.z), yaw: rs.yaw, flashlight: rs.fl, crouch: rs.cr, sprint: !!rs.sp, dead: rs.dead || this.remoteCaught });
        f.update(delta, pls, listener, levelCatch(f.stalker, dead), () =>
          this.shout('Un hurlement déchire la pluie, quelque part derrière vous… Elle vous a suivi hors des égouts.', 0.5)
        );
      }
      this.hemi.intensity = this.forestHemi + f.flash * 6;
    }
    // Chapter 5: Site B (UV lamp, ramps, final purge)
    if (this.site) {
      const sb = this.site;
      const dead = this.dying || this.finished || !!this.pendingEnding;
      if (!(this.dying && this.killer === sb.stalker)) {
        const pls: SitePlayer[] = [{ pos: p.position, yaw: p.yaw, pitch: p.pitch, flashlight: p.flashlightOn, crouch: p.isCrouching, uv: sb.uv, dead: meDead }];
        if (rs) pls.push({ pos: new THREE.Vector3(rs.x, 1.7, rs.z), yaw: rs.yaw, pitch: rs.pitch, flashlight: rs.fl, crouch: rs.cr, uv: !!rs.uv, dead: rs.dead || this.remoteCaught });
        sb.update(delta, pls, listener, levelCatch(sb.stalker, dead), () =>
          this.shout('Un hurlement résonne dans les conduits… Il est là. Il vous attendait.', 0.5)
        );
      }
      this.applyUvLamp();
      this.hemi.intensity = this.forestHemi + sb.flash * 3;
      if (sb.ending && !dead) {
        const end = sb.ending;
        sb.ending = null;
        this.triggerEnding(end);
      }
    }
    for (const m of this.monsters) {
      if (this.dying && m === this.killer) continue;
      if (m === this.maze?.stalker || m === this.forest?.stalker || m === this.site?.stalker) continue;
      m.updateMulti(delta, players, listener, this.map.collisionBoxes, (idx) => {
        if (idx === 0) this.startDeath(m);
        else this.catchRemote(m);
      });
      if (this.dying && !this.net) return;
    }
  }

  /** Chapter 5: the UV lamp is purple and eats the battery 6× faster. */
  private applyUvLamp() {
    const p = this.player;
    const uv = !!this.site?.uv;
    p.batteryDrainMul = this.baseDrain * (uv && p.flashlightOn ? 6 : 1);
    p.flashlight.color.setHex(uv ? 0x9a5cff : 0xfff1dc);
  }

  /**
   * Chapters 4-5: a level message for BOTH players (host sends it to the guest).
   * While acting for the guest, the host's own copy is shown afterwards.
   */
  private pendingShout: string | null = null;
  private shout(msg: string, shake = 0) {
    if (this.net?.role === 'host' && this.net.mode === 'coop' && !this.partnerGone) this.net.send({ k: 'toast', msg });
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
    const s = this.remote?.state;
    if (this.net && s && !this.partnerGone && this.vsRole !== 'survivor') {
      const inDuct = this.map.lowZones.some((l) => s.x > l.minX && s.x < l.maxX && s.z > l.minZ && s.z < l.maxZ);
      humans.push({
        pos: new THREE.Vector3(s.x, 0, s.z),
        eye: new THREE.Vector3(s.x, s.y, s.z),
        yaw: s.yaw,
        pitch: s.pitch,
        flashlightOn: s.fl,
        inDuct,
        dead: s.dead || this.remoteCaught,
      });
    }
    const caught = c.update(delta, humans, listener);
    if (caught < 0) return;
    const who = humans[caught];
    if (who.pos === p.position) this.startDeath(c);
    else this.catchRemote(c);
  }

  /** Host: a creature got the guest. */
  private catchRemote(m: MonsterAI | VentCrawler) {
    if (this.remoteCaught) return;
    this.remoteCaught = true;
    this.net?.send({ k: 'caught', m: m instanceof MonsterAI ? this.monsters.indexOf(m) : -1 });
    this.state.showToast(`${this.net?.partnerName ?? 'Votre partenaire'} s'est fait attraper !`);
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
      objective: this.maze
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
      partnerName: this.net && !this.partnerGone && this.net.mode === 'coop' ? this.net.partnerName : null,
      partnerDead: !!this.remote?.state?.dead || this.remoteCaught,
      spectating: this.spectating,
      versusRole: this.vsRole,
      timeLeft: this.vsRole ? this.timeLeft : null,
      race: this.net?.mode === 'race',
      canBlind: this.canBlind(),
      blindLeft: this.blindTimer,
      runCoins: this.state.runCoins,
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
  private startDeath(killer: Killer) {
    if (this.dying) return;
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
    sound.setHeartbeat(60, false);
    sound.playMonsterChaseRoar();
    sound.playJumpscareStinger();
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
    // Dropped, shaking flashlight lighting the face from below
    const fl = this.player.flashlight;
    fl.position.copy(cam.position).add(new THREE.Vector3(0, -0.55, 0));
    fl.intensity = 6 + Math.random() * 4;
    this.player.flashlightTarget.position.copy(killer.headWorld);
    this.player.flashlightTarget.updateMatrixWorld();
    this.damage = Math.min(1, this.deathT * 0.9);
    this.blackout = Math.max(0, (this.deathT - 1.1) * 2.5);
    if (this.deathT > 1.6) {
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
      const remotePos = this.remote?.state && !this.remote.state.dead ? [this.remote.position] : [];
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
      } else req = { kind: t.kind };
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
    const p = this.player;
    const gs = this.state;
    // Versus safety net: the creature only opens / closes doors
    if (this.actorIsMonster() && t.kind !== 'door') return;
    switch (t.kind) {
      case 'door':
        this.interactDoor(t.door);
        break;

      case 'container': {
        const c = this.map.containers.get(t.id);
        if (!c) return;
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
    } else if (item.type === 'medkit' && p.stamina >= p.maxStamina - 1 && !handsFull) {
      gs.showToast('Votre souffle est intact. Gardez l\'adrénaline pour une poursuite.');
    } else if (
      this.net?.role === 'guest' &&
      (item.type === 'battery' || item.type === 'medkit' || item.type === 'throwable' || item.type === 'sedative')
    ) {
      // Team inventory lives on the host: ask it to use the item for us
      const idx = gs.inventory.findIndex((i) => i.id === item.id);
      if (idx >= 0 && (item.type !== 'throwable' || this.canAct())) this.net.send({ k: 'slot', i: idx });
    } else if (item.type === 'battery') {
      p.flashlightBattery = Math.min(100, p.flashlightBattery + 55);
      gs.removeItem(item.id);
      sound.playFlashlightToggle(true);
      gs.showToast('Pile insérée : +55 % de batterie.');
    } else if (item.type === 'medkit') {
      p.stamina = p.maxStamina;
      gs.removeItem(item.id);
      sound.playItemPickup();
      gs.showToast('Adrénaline injectée : endurance au maximum.');
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
    } else if (item.type === 'alarm') {
      // Put it down: it rings 3 s later
      this.dropSlot(gs.inventory.findIndex((i) => i.id === item.id));
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

  private updateWorldItems(delta: number) {
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
      medkit: { name: 'Adrénaline', type: 'medkit', description: 'Auto-injecteur : endurance au maximum.', icon: 'HeartPulse' },
      sedative: { name: 'Seringue de Sédatif', type: 'sedative', description: 'Immobilise un monstre 5 secondes (à moins de 3 m, face à lui).', icon: 'Syringe' },
      food: { name: 'Barre de céréales', type: 'food', description: 'Redonne 40 points d\'endurance.', icon: 'Cookie' },
      alarm: { name: 'Réveil', type: 'alarm', description: 'Posez-le : il sonne au bout de 3 s et attire les monstres.', icon: 'AlarmClock' },
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
