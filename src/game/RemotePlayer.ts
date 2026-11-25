import * as THREE from 'three';
import { FxHandle, buildFx, buildPrestige } from './AnimatedFx';
import { outfitRank } from '../economy';
import { lampOf } from '../lamps';
import type { PlayerNetState } from '../net/protocol';
import { ProceduralTextures } from '../textures/ProceduralTextures';
import { HUMAN_OUTFITS, buildHumanAccessory, buildHumanBodyExtra } from './Cosmetics';
import { CharacterDef, characterOf } from '../characters';

type Limb = { root: THREE.Group; mid: THREE.Group; end?: THREE.Group };

/**
 * The human survivor (main character), as seen by the other player and in
 * the customisation preview: a jointed patient in a hospital gown, holding
 * a working flashlight. Network updates are interpolated and animated.
 */
export class RemotePlayer {
  public group = new THREE.Group();
  public state: PlayerNetState | null = null;
  public position = new THREE.Vector3();
  public yaw = 0;
  public pitch = 0;
  /** Smoothed ground speed (m/s), used to animate a creature puppet. */
  public speed = 0;
  /** Versus: the partner is the creature, so the human body is never shown. */
  public forceHidden = false;

  // Rig
  private body = new THREE.Group();
  private hips = new THREE.Group();
  private spine = new THREE.Group();
  private neck = new THREE.Group();
  private head = new THREE.Group();
  private legs: Limb[] = [];
  private arms: Limb[] = [];
  private torchLens!: THREE.MeshStandardMaterial;

  private disposables: { dispose: () => void }[] = [];
  private walkPhase = 0;
  private breathe = 0;
  private crouch = 0;
  private nameSprite: THREE.Sprite;
  private mats!: { gown: THREE.MeshStandardMaterial; skin: THREE.MeshStandardMaterial; hair: THREE.MeshStandardMaterial };

  constructor(
    name: string,
    /** Persistent spotlight owned by the engine (keeps the light count constant). */
    private light: THREE.SpotLight,
    private lightTarget: THREE.Object3D
  ) {
    const t = <T extends { dispose: () => void }>(o: T) => {
      this.disposables.push(o);
      return o;
    };
    // ---- Materials: soft skin (sheen + fine pore bump), cloth, hair strands ----
    const skinTex = RemotePlayer.skinTexture();
    const skin = t(
      new THREE.MeshPhysicalMaterial({
        color: 0xd9b59a,
        roughness: 0.55,
        sheen: 0.35,
        sheenRoughness: 0.6,
        sheenColor: new THREE.Color(0xff9a80),
        bumpMap: skinTex,
        bumpScale: 0.35,
      })
    );
    const gown = t(
      new THREE.MeshStandardMaterial({ map: ProceduralTextures.getGownTexture(), color: 0x7f9aa8, roughness: 0.95, side: THREE.DoubleSide })
    );
    const hairTex = RemotePlayer.hairTexture();
    const hair = t(new THREE.MeshStandardMaterial({ color: 0x1d1d22, map: hairTex, bumpMap: hairTex, bumpScale: 0.6, roughness: 0.55 }));
    const sclera = t(new THREE.MeshPhysicalMaterial({ color: 0xf2efe8, roughness: 0.15, clearcoat: 1 }));
    const iris = t(new THREE.MeshPhysicalMaterial({ color: 0x5a4028, roughness: 0.2, clearcoat: 1 }));
    const dark = t(new THREE.MeshStandardMaterial({ color: 0x120d0b, roughness: 0.3 }));
    const white = t(new THREE.MeshStandardMaterial({ color: 0xeeeeea, roughness: 0.5 }));
    const slipper = t(new THREE.MeshStandardMaterial({ color: 0xa9aaa2, roughness: 1 }));
    const metal = t(new THREE.MeshStandardMaterial({ color: 0x2a2e30, roughness: 0.35, metalness: 0.85 }));
    const rubber = t(new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 }));
    this.torchLens = t(new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xfff1dc, emissiveIntensity: 0 }));
    this.mats = { gown, skin, hair };

    const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0) => {
      const m = new THREE.Mesh(t(geo), mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      m.receiveShadow = true;
      parent.add(m);
      return m;
    };
    /**
     * Organic limb: a surface of revolution from an anatomical profile
     * ([radius, distance below the joint] pairs), so muscles taper naturally.
     */
    const lathe = (profile: [number, number][], segments = 18) => {
      const pts = profile.map(([r, d]) => new THREE.Vector2(r, -d));
      // Lathe faces point outwards only when the profile goes upwards
      if (pts[0].y > pts[pts.length - 1].y) pts.reverse();
      return new THREE.LatheGeometry(pts, segments);
    };

    // ---- Pelvis & legs (hips at 0.92 m, thigh 0.44 + shin 0.43 + foot) ----
    this.hips.position.y = 0.92;
    this.body.add(this.hips);
    const pelvis = mesh(
      lathe([
        [0, -0.09],
        [0.12, -0.08],
        [0.165, -0.02],
        [0.17, 0.04],
        [0.13, 0.1],
        [0, 0.12],
      ]),
      skin,
      this.hips
    );
    pelvis.scale.set(1, 1, 0.72);
    for (const side of [-1, 1]) {
      const root = new THREE.Group();
      root.position.set(side * 0.095, -0.02, 0);
      this.hips.add(root);
      // Thigh: full at the top, slimming to the knee
      mesh(
        lathe([
          [0, 0],
          [0.082, 0.01],
          [0.084, 0.06],
          [0.076, 0.2],
          [0.062, 0.34],
          [0.052, 0.42],
          [0.05, 0.445],
          [0, 0.45],
        ]),
        skin,
        root
      ).scale.set(1, 1, 0.92);
      const knee = new THREE.Group();
      knee.position.y = -0.44;
      root.add(knee);
      // Kneecap + shin with a calf bulge at the back
      mesh(new THREE.SphereGeometry(0.048, 12, 10), skin, knee, 0, -0.01, 0.012).scale.set(1, 1.1, 0.9);
      const shin = mesh(
        lathe([
          [0, 0],
          [0.05, 0.01],
          [0.058, 0.08],
          [0.06, 0.13],
          [0.05, 0.25],
          [0.036, 0.37],
          [0.032, 0.41],
          [0, 0.42],
        ]),
        skin,
        knee
      );
      shin.scale.set(1, 1, 1.05);
      // Ankle joint: the foot rolls from heel to toe while walking
      const ankle = new THREE.Group();
      ankle.position.y = -0.415;
      knee.add(ankle);
      // Ankle bones + hospital slipper: rounded foot shape
      for (const s2 of [-1, 1]) mesh(new THREE.SphereGeometry(0.012, 8, 6), skin, ankle, s2 * 0.03, 0, 0.0);
      const foot = mesh(new THREE.CapsuleGeometry(0.045, 0.15, 6, 12), slipper, ankle, 0, -0.025, 0.06);
      foot.rotation.x = Math.PI / 2;
      foot.scale.set(1.2, 1, 0.62);
      mesh(new THREE.BoxGeometry(0.1, 0.012, 0.25), rubber, ankle, 0, -0.053, 0.06); // sole
      this.legs.push({ root, mid: knee, end: ankle });
    }

    // ---- Torso (waist → ribcage → shoulders), flattened front to back ----
    this.hips.add(this.spine);
    const torso = mesh(
      lathe(
        [
          [0, -0.02],
          [0.15, 0.0],
          [0.13, 0.12],
          [0.14, 0.22],
          [0.165, 0.34],
          [0.17, 0.42],
          [0.15, 0.5],
          [0.09, 0.55],
          [0.055, 0.57],
          [0, 0.575],
        ].map(([r, y]) => [r, -y] as [number, number]),
        24
      ),
      skin,
      this.spine
    );
    torso.scale.set(1.05, 1, 0.7);
    // Shoulder caps (deltoids) and collarbones
    for (const s of [-1, 1]) {
      mesh(new THREE.SphereGeometry(0.052, 16, 12), skin, this.spine, s * 0.175, 0.47, 0).scale.set(1.05, 0.85, 0.95);
      const clav = mesh(new THREE.CapsuleGeometry(0.012, 0.13, 4, 6), skin, this.spine, s * 0.09, 0.535, 0.055);
      clav.rotation.z = Math.PI / 2 + s * 0.15;
    }

    // Hospital gown: knee length, open at the back, cloth folds and an uneven hem
    // Profile (radius, height): hem → hips → waist → chest → shoulders → neckline,
    // resampled smoothly so the cloth drapes over the shoulders instead of a tube.
    const key: [number, number][] = [
      [0.26, -0.43],
      [0.235, -0.2],
      [0.2, 0.05],
      [0.19, 0.2],
      [0.2, 0.28],
      [0.235, 0.34],
      [0.22, 0.4],
      [0.16, 0.435],
      [0.1, 0.45],
    ];
    const prof: THREE.Vector2[] = [];
    for (let k = 0; k < key.length - 1; k++) {
      for (let j = 0; j < 4; j++) {
        const u = j / 4;
        const s = u * u * (3 - 2 * u);
        prof.push(new THREE.Vector2(key[k][0] + (key[k + 1][0] - key[k][0]) * s, key[k][1] + (key[k + 1][1] - key[k][1]) * u));
      }
    }
    prof.push(new THREE.Vector2(key[key.length - 1][0], key[key.length - 1][1]));
    const gownGeo = new THREE.LatheGeometry(prof, 56, 0.32, Math.PI * 2 - 0.64);
    const gp = gownGeo.attributes.position;
    for (let i = 0; i < gp.count; i++) {
      const x = gp.getX(i);
      const y = gp.getY(i);
      const z = gp.getZ(i);
      const a = Math.atan2(z, x);
      const down = Math.max(0, (0.3 - y) / 0.73); // 0 at the shoulders → 1 at the hem
      // Vertical folds deepen towards the hem, plus a gentle drape
      const fold = 1 + Math.sin(a * 9 + y * 3) * 0.045 * down + Math.sin(a * 4) * 0.02;
      gp.setX(i, x * fold);
      gp.setZ(i, z * fold);
      if (down > 0.98) gp.setY(i, y - Math.abs(Math.sin(a * 5)) * 0.04); // uneven hem
    }
    gownGeo.computeVertexNormals();
    const gownMesh = mesh(gownGeo, gown, this.spine, 0, 0.12, 0);
    gownMesh.rotation.y = Math.PI; // opening at the back (+z is forward)
    gownMesh.scale.set(1, 1, 0.78);
    // Neckline and back ties
    const collar = mesh(new THREE.TorusGeometry(0.1, 0.007, 6, 32, Math.PI * 1.6), gown, this.spine, 0, 0.565, 0.005);
    collar.rotation.set(Math.PI / 2, 0, Math.PI * 0.7);
    for (const ty of [0.47, 0.3, 0.12]) {
      for (const s of [-1, 1]) {
        const tie = mesh(new THREE.CapsuleGeometry(0.006, 0.07, 3, 6), white, this.spine, s * 0.03, ty, -0.16);
        tie.rotation.z = Math.PI / 2 + s * 0.5;
      }
    }

    // ---- Arms ----
    for (const side of [-1, 1]) {
      const root = new THREE.Group();
      root.position.set(side * 0.215, 0.47, 0);
      this.spine.add(root);
      // Short loose sleeve
      const sleeve = mesh(new THREE.CylinderGeometry(0.068, 0.075, 0.15, 16, 1, true), gown, root, 0, -0.06, 0);
      sleeve.scale.set(1, 1, 0.9);
      // Upper arm (biceps) and forearm, tapered
      mesh(
        lathe([
          [0, 0],
          [0.048, 0.01],
          [0.05, 0.08],
          [0.045, 0.2],
          [0.038, 0.29],
          [0, 0.3],
        ]),
        skin,
        root
      );
      const elbow = new THREE.Group();
      elbow.position.y = -0.29;
      root.add(elbow);
      mesh(
        lathe([
          [0, 0],
          [0.038, 0.01],
          [0.042, 0.06],
          [0.034, 0.18],
          [0.026, 0.25],
          [0, 0.26],
        ]),
        skin,
        elbow
      ).scale.set(1, 1, 0.85);
      // Hand: palm, four two-segment fingers, opposable thumb
      const hand = new THREE.Group();
      hand.position.y = -0.27;
      elbow.add(hand);
      this.hands.push(hand);
      mesh(new THREE.BoxGeometry(0.06, 0.075, 0.026), skin, hand, 0, -0.035, 0).scale.set(1, 1, 1);
      const holding = side === 1;
      for (let f = 0; f < 4; f++) {
        const len = [0.04, 0.046, 0.043, 0.034][f];
        const fg = new THREE.Group();
        fg.position.set(-0.022 + f * 0.0148, -0.075, 0);
        hand.add(fg);
        mesh(new THREE.CapsuleGeometry(0.0072, len * 0.5, 3, 6), skin, fg, 0, -len * 0.3, 0);
        const tip = new THREE.Group();
        tip.position.y = -len * 0.58;
        fg.add(tip);
        mesh(new THREE.CapsuleGeometry(0.0065, len * 0.4, 3, 6), skin, tip, 0, -len * 0.22, 0);
        // Curl: gripping the flashlight on the right, relaxed on the left
        fg.rotation.x = holding ? 1.2 : 0.25;
        tip.rotation.x = holding ? 1.3 : 0.35;
      }
      const thumb = mesh(new THREE.CapsuleGeometry(0.008, 0.03, 3, 6), skin, hand, -side * 0.033, -0.035, 0.012);
      thumb.rotation.set(0.4, 0, side * 0.7);
      if (!holding) {
        // Patient wristband
        const band = mesh(new THREE.TorusGeometry(0.03, 0.006, 6, 16), white, elbow, 0, -0.235, 0);
        band.rotation.x = Math.PI / 2;
        band.scale.set(1, 0.85, 1);
      } else {
        // Flashlight gripped in the right hand, pointing forward
        const torch = new THREE.Group();
        torch.position.set(0, -0.08, 0.02);
        hand.add(torch);
        mesh(new THREE.CylinderGeometry(0.02, 0.022, 0.19, 14), metal, torch).rotation.x = Math.PI / 2;
        mesh(new THREE.CylinderGeometry(0.03, 0.022, 0.05, 14), metal, torch, 0, 0, 0.11).rotation.x = Math.PI / 2;
        const lens = mesh(new THREE.CircleGeometry(0.026, 18), this.torchLens, torch, 0, 0, 0.136);
        lens.castShadow = false;
      }
      this.arms.push({ root, mid: elbow, end: hand });
    }

    // ---- Neck & head (chin at ~1.54 m, top of head ~1.78 m) ----
    this.neck.position.set(0, 0.56, 0.005);
    this.spine.add(this.neck);
    mesh(
      lathe([
        [0, -0.0],
        [0.06, 0.0],
        [0.054, 0.05],
        [0.056, 0.09],
        [0, 0.09],
      ].map(([r, y]) => [r, -y] as [number, number])),
      skin,
      this.neck
    ).scale.set(1, 1, 0.95);
    this.head.position.set(0, 0.045, 0.012);
    this.neck.add(this.head);
    // ---- Head: ONE sculpted surface (no stuck-on blobs) ----
    // A dense sphere is deformed by smooth functions: narrower jaw, chin,
    // cheekbones, eye sockets, brow ridge, nose and lips. Lips and cheeks are
    // tinted through vertex colours, so they follow the chosen skin tone.
    const HC = new THREE.Vector3(0, 0.125, 0.004);
    const R = 0.1;
    const g = (a: number, s: number) => Math.exp(-(a * a) / (2 * s * s));
    const sculpt = (nx: number, ny: number, nz: number) => {
      let x = nx * R * 0.84;
      const y = ny * R * 1.13;
      let z = nz * R * 1.05;
      const front = Math.max(0, nz);
      const f2 = front * front;
      if (ny < 0) {
        // Lower face narrows into the jaw
        x *= 1 - 0.2 * -ny * -ny - 0.06 * -ny;
        z *= 1 - 0.13 * -ny;
      }
      let d = 0;
      d += 0.016 * g(nx, 0.24) * g(ny + 0.8, 0.12) * front; // chin
      d += 0.005 * g(Math.abs(nx) - 0.55, 0.12) * g(ny - 0.02, 0.11) * front; // cheekbones
      d -= 0.008 * g(Math.abs(nx) - 0.34, 0.11) * g(ny - 0.1, 0.08) * f2; // eye sockets
      d += 0.005 * g(ny - 0.27, 0.06) * g(nx, 0.42) * front; // brow ridge
      const noseW = g(nx, 0.075 + Math.max(0, -ny) * 0.12);
      d += noseW * (0.012 * g(ny - 0.02, 0.13) + 0.024 * g(ny + 0.2, 0.075)) * f2; // nose bridge + tip
      d += 0.008 * g(Math.abs(nx) - 0.1, 0.045) * g(ny + 0.24, 0.045) * f2; // nostril wings
      d += 0.004 * g(nx, 0.18) * g(ny + 0.45, 0.05) * f2; // lips
      d -= 0.005 * g(nx, 0.17) * g(ny + 0.465, 0.014) * f2; // mouth line
      d -= 0.003 * g(nx, 0.1) * g(ny + 0.66, 0.05) * f2; // dip under the lip
      const len = Math.hypot(x, y, z) || 1;
      return new THREE.Vector3(x + (x / len) * d, y + (y / len) * d, z + (z / len) * d).add(HC);
    };
    const headGeo = t(new THREE.SphereGeometry(1, 80, 60));
    const hp = headGeo.attributes.position;
    const colors = new Float32Array(hp.count * 3);
    const tmp = new THREE.Vector3();
    for (let i = 0; i < hp.count; i++) {
      tmp.set(hp.getX(i), hp.getY(i), hp.getZ(i)).normalize();
      const p = sculpt(tmp.x, tmp.y, tmp.z);
      hp.setXYZ(i, p.x, p.y, p.z);
      const front = Math.max(0, tmp.z);
      const lip = Math.min(1, 1.4 * g(tmp.x, 0.15) * g(tmp.y + 0.455, 0.04) * front * front);
      const blush = g(Math.abs(tmp.x) - 0.5, 0.16) * g(tmp.y + 0.05, 0.14) * front * 0.5;
      colors[i * 3] = 1 - lip * 0.12;
      colors[i * 3 + 1] = 1 - lip * 0.55 - blush * 0.14;
      colors[i * 3 + 2] = 1 - lip * 0.5 - blush * 0.14;
    }
    headGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    headGeo.computeVertexNormals();
    const headSkin = t(skin.clone());
    headSkin.vertexColors = true;
    this.lipsMat = headSkin;
    const headMesh = new THREE.Mesh(headGeo, headSkin);
    headMesh.castShadow = true;
    this.head.add(headMesh);
    const onFace = (nx: number, ny: number) => sculpt(nx, ny, Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny)));

    // Eyes sit in the sockets: sclera, iris, pupil, upper eyelid, eyebrow
    for (const s of [-1, 1]) {
      const e = onFace(s * 0.34, 0.1);
      e.z -= 0.006;
      mesh(new THREE.SphereGeometry(0.0128, 18, 14), sclera, this.head, e.x, e.y, e.z);
      const ir = mesh(new THREE.CircleGeometry(0.0064, 20), iris, this.head, e.x, e.y, e.z + 0.0127);
      ir.castShadow = false;
      const pu = mesh(new THREE.CircleGeometry(0.0028, 14), dark, this.head, e.x, e.y, e.z + 0.0129);
      pu.castShadow = false;
      const lid = mesh(new THREE.SphereGeometry(0.0138, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.36), skin, this.head, e.x, e.y + 0.0006, e.z);
      lid.rotation.x = 0.45;
      this.lids.push(lid);
      const b = onFace(s * 0.34, 0.27);
      const brow = mesh(new THREE.CapsuleGeometry(0.0032, 0.026, 3, 8), hair, this.head, b.x, b.y, b.z + 0.002);
      brow.rotation.z = Math.PI / 2 - s * 0.18;
      brow.rotation.y = s * 0.3;
      this.brows.push({ m: brow, s, y: b.y });
    }
    // 😮 Mouth: a dark opening (scared / laughing) and a smile line (happy)
    {
      const mp = onFace(0, -0.465);
      const inside = t(new THREE.MeshStandardMaterial({ color: 0x2a0808, roughness: 0.6 }));
      const open = mesh(new THREE.CircleGeometry(0.0125, 20), inside, this.head, mp.x, mp.y, mp.z + 0.0015);
      open.castShadow = false;
      open.scale.set(1.3, 0.05, 1);
      open.visible = false;
      this.mouth = open;
      const lipLine = t(new THREE.MeshStandardMaterial({ color: 0x6a2e2a, roughness: 0.5 }));
      const smile = mesh(new THREE.TorusGeometry(0.014, 0.0018, 4, 14, Math.PI * 0.85), lipLine, this.head, mp.x, mp.y + 0.006, mp.z + 0.001);
      smile.rotation.z = Math.PI + Math.PI * 0.075;
      smile.castShadow = false;
      smile.visible = false;
      this.smile = smile;
    }

    // Ears: folded rim + lobe, flat against the head
    for (const s of [-1, 1]) {
      const ep = sculpt(s * 0.995, 0.02, -0.1);
      // Auricle: a flattened shell tilted slightly back, with a thin rim
      const shell = mesh(new THREE.SphereGeometry(0.029, 16, 12), skin, this.head, ep.x + s * 0.002, ep.y, ep.z);
      shell.scale.set(0.34, 1.1, 0.68);
      shell.rotation.set(-0.2, s * 0.25, 0);

    }

    // Hair: a shell following the skull, with a real hairline (forehead,
    // above the ears, low at the nape). Uncovered parts sink inside the head.
    const hairGeo = t(new THREE.SphereGeometry(1, 72, 48));
    const hpos = hairGeo.attributes.position;
    const smooth = (a: number, b: number, v: number) => {
      const k = Math.min(1, Math.max(0, (v - a) / (b - a)));
      return k * k * (3 - 2 * k);
    };
    for (let i = 0; i < hpos.count; i++) {
      tmp.set(hpos.getX(i), hpos.getY(i), hpos.getZ(i)).normalize();
      const fz = Math.max(0, tmp.z);
      const bz = Math.max(0, -tmp.z);
      const hairline = 0.08 + 0.5 * Math.pow(fz, 1.6) - 0.55 * bz - 0.06 * Math.max(0, tmp.x) * fz;
      const cover = smooth(hairline - 0.05, hairline + 0.05, tmp.y);
      const base = sculpt(tmp.x, tmp.y, tmp.z).sub(HC);
      // Volume + messy locks
      const lock = 1.07 + 0.012 * Math.sin(tmp.x * 23 + tmp.z * 7) * Math.cos(tmp.y * 17) + 0.02 * Math.max(0, tmp.y);
      const scale = 0.88 + (lock - 0.88) * cover;
      base.multiplyScalar(scale).add(HC);
      hpos.setXYZ(i, base.x, base.y, base.z);
    }
    hairGeo.computeVertexNormals();
    const hairMesh = new THREE.Mesh(hairGeo, hair);
    hairMesh.castShadow = true;
    this.head.add(hairMesh);
    this.hairMesh = hairMesh;

    this.group.add(this.body);

    // Name tag (always readable, a bit transparent)
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 8, 256, 48);
    ctx.fillStyle = '#7fe0a0';
    ctx.font = 'bold 30px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name.slice(0, 16), 128, 33);
    const tex = t(new THREE.CanvasTexture(canvas));
    tex.colorSpace = THREE.SRGBColorSpace;
    const spriteMat = t(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, opacity: 0.85 }));
    this.nameSprite = new THREE.Sprite(spriteMat);
    this.nameSprite.scale.set(0.8, 0.2, 1);
    this.nameSprite.position.y = 2.05;
    this.nameSprite.renderOrder = 10;
    this.group.add(this.nameSprite);

    this.group.visible = false;
  }

  private lipsMat!: THREE.MeshPhysicalMaterial;
  private lids: THREE.Mesh[] = [];
  private brows: { m: THREE.Mesh; s: number; y: number }[] = [];
  private mouth: THREE.Mesh | null = null;
  private smile: THREE.Mesh | null = null;
  /** 😨 / 😄 current expression (0..1 each) and the partner's fear from the network */
  private scared = 0;
  private happy = 0;
  private mouthOpen = 0;
  public fearNet = 0;

  /** Face: brows, eyelids and mouth follow the mood */
  private face(delta: number, scaredT: number, happyT: number, openT: number) {
    const k = 1 - Math.exp(-8 * delta);
    this.scared += (scaredT - this.scared) * k;
    this.happy += (happyT - this.happy) * k;
    this.mouthOpen += (openT - this.mouthOpen) * k;
    for (const b of this.brows) {
      // scared: brows up, inner ends raised; happy: lifted a little
      b.m.position.y = b.y + this.scared * 0.006 + this.happy * 0.003;
      b.m.rotation.z = Math.PI / 2 - b.s * 0.18 - b.s * 0.4 * this.scared + b.s * 0.1 * this.happy;
    }
    if (this.mouth) {
      const o = Math.max(this.mouthOpen, this.scared * 0.75);
      this.mouth.visible = o > 0.05;
      this.mouth.scale.set(1.3 - o * 0.35 + this.happy * 0.3, 0.05 + o * 0.95, 1);
    }
    if (this.smile) {
      this.smile.visible = this.happy > 0.08 && this.mouthOpen < 0.5;
      this.smile.scale.set(0.6 + this.happy * 0.5, 0.4 + this.happy * 0.6, 1);
    }
  }
  private hands: THREE.Group[] = [];
  /** 😉 blinking: time to the next blink, and the blink in progress */
  private blinkIn = 2 + Math.random() * 3;
  private blinkT = -1;
  /** 👀 idle: where the eyes / head wander */
  private glance = 0;
  private glanceTarget = 0;
  private glanceIn = 2;
  /** 👋 in-game emote gesture (0 wave, 1 point, 2 scared, 3 shush) */
  private gestureId = -1;
  private gestureT = 0;
  public gesture(i: number) {
    this.gestureId = i;
    this.gestureT = 2.4;
  }

  /** 😉 Eyelids: a quick blink every few seconds (also used by the dances) */
  private blink(delta: number) {
    this.blinkIn -= delta;
    if (this.blinkIn <= 0 && this.blinkT < 0) {
      this.blinkT = 0;
      this.blinkIn = 2 + Math.random() * 4;
    }
    let close = 0;
    if (this.blinkT >= 0) {
      this.blinkT += delta;
      close = Math.sin(Math.min(1, this.blinkT / 0.16) * Math.PI);
      if (this.blinkT > 0.16) this.blinkT = -1;
    }
    for (const l of this.lids) l.rotation.x = 0.45 - this.scared * 0.35 + close * (1.25 + this.scared * 0.35);
  }

  /** Shop accessories & outfit pieces currently worn (rebuilt on every look change). */
  private cosmetic = new THREE.Group();
  private cosmeticBody = new THREE.Group();
  private cosmeticDisposables: { dispose: () => void }[] = [];

  /** Player customisation: colours, accessory and outfit. */
  private hairMesh: THREE.Mesh | null = null;

  /** 👋 Emote bubble above the head for a few seconds. */
  private emote: { sprite: THREE.Sprite; tex: THREE.CanvasTexture; mat: THREE.SpriteMaterial; timer: ReturnType<typeof setTimeout> } | null = null;
  public showEmote(text: string) {
    if (this.emote) {
      clearTimeout(this.emote.timer);
      this.emote.sprite.removeFromParent();
      this.emote.tex.dispose();
      this.emote.mat.dispose();
    }
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 128;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.beginPath();
    ctx.roundRect(8, 8, 496, 100, 30);
    ctx.fill();
    ctx.strokeStyle = 'rgba(52,211,153,0.9)';
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.font = 'bold 56px sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 256, 60);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(1.2, 0.3, 1);
    sprite.position.y = 2.4;
    sprite.renderOrder = 11;
    this.group.add(sprite);
    const timer = setTimeout(() => {
      sprite.removeFromParent();
      tex.dispose();
      mat.dispose();
      if (this.emote?.sprite === sprite) this.emote = null;
    }, 3000);
    this.emote = { sprite, tex, mat, timer };
  }

  /** Character hairstyle / beard pieces (hair-coloured), in the head's space. */
  private buildCharacter(c: CharacterDef, track: <T extends { dispose: () => void }>(o: T) => T) {
    const hair = this.mats.hair;
    const g = new THREE.Group();
    const piece = (geo: THREE.BufferGeometry, x: number, y: number, z: number) => {
      const m = new THREE.Mesh(track(geo), hair);
      m.position.set(x, y, z);
      m.castShadow = true;
      g.add(m);
      return m;
    };
    if (this.hairMesh) this.hairMesh.visible = c.hair !== 'bald' && c.hair !== 'curly';
    switch (c.hair) {
      case 'long': {
        // Back curtain down to the shoulders + two side locks
        const back = piece(new THREE.CapsuleGeometry(0.075, 0.16, 6, 16), 0, 0.04, -0.052);
        back.scale.set(1.18, 1, 0.55);
        for (const s of [-1, 1]) {
          const lock = piece(new THREE.CapsuleGeometry(0.022, 0.13, 4, 10), s * 0.083, 0.06, 0.012);
          lock.rotation.z = s * 0.08;
        }
        break;
      }
      case 'ponytail': {
        piece(new THREE.SphereGeometry(0.022, 10, 8), 0, 0.17, -0.1);
        const tail = piece(new THREE.CapsuleGeometry(0.028, 0.15, 5, 10), 0, 0.08, -0.13);
        tail.rotation.x = 0.35;
        break;
      }
      case 'bun':
        piece(new THREE.SphereGeometry(0.045, 16, 12), 0, 0.225, -0.06).scale.set(1, 0.85, 1);
        break;
      case 'curly': {
        const geo = new THREE.SphereGeometry(0.118, 32, 24);
        const p = geo.attributes.position;
        for (let i = 0; i < p.count; i++) {
          const x = p.getX(i);
          const y = p.getY(i);
          const z = p.getZ(i);
          // Lots of small curls, and no hair over the face
          const k = 1 + 0.06 * Math.sin(x * 90) * Math.sin(y * 85) * Math.sin(z * 95);
          const face = z > 0.03 && y < 0.05 ? 0.6 : 1;
          p.setXYZ(i, x * k * face, y * k, z * k * face);
        }
        geo.computeVertexNormals();
        piece(geo, 0, 0.155, -0.012).scale.set(1.02, 0.86, 1.06);
        break;
      }
    }
    if (c.beard) {
      const beard = piece(new THREE.SphereGeometry(0.075, 20, 12, -Math.PI * 0.45, Math.PI * 0.9, Math.PI * 0.55, Math.PI * 0.35), 0, 0.105, 0.0);
      beard.scale.set(1.08, 1.05, 1.1);
      for (const s of [-1, 1]) {
        const mous = piece(new THREE.CapsuleGeometry(0.009, 0.026, 4, 8), s * 0.016, 0.083, 0.098);
        mous.rotation.z = s * 1.25;
      }
    }
    return g;
  }

  /** ✨ Animated skin */
  private fx: FxHandle | null = null;
  /** 🏅 rarity glow (exclusive / legendary outfits) */
  private prestige: FxHandle | null = null;
  /** 💃 Victory dance ('' = wave) */
  public danceId = '';
  private danceT = 0;

  /** 💃 One frame of the victory dance (poses the bones directly). */
  public dance(delta: number, id = this.danceId) {
    this.fx?.tick(delta);
    this.prestige?.tick(delta);
    this.blink(delta);
    this.face(delta, 0, 1, id === 'jump' || id === 'chicken' || id === 'breakdance' ? 0.6 : 0);
    this.danceT += delta;
    const t = this.danceT;
    const [L, R] = this.arms;
    const [LL, RL] = this.legs;
    this.hips.position.y = 0.92;
    this.hips.rotation.set(0, 0, 0);
    this.spine.rotation.set(0, 0, 0);
    this.spine.scale.set(1, 1, 1);
    this.head.rotation.set(0, 0, 0);
    this.body.position.set(0, 0, 0);
    for (const a of this.arms) {
      a.root.rotation.set(0, 0, 0);
      a.mid.rotation.set(0, 0, 0);
    }
    for (const l of this.legs) {
      l.root.rotation.set(0, 0, 0);
      l.mid.rotation.set(0, 0, 0);
      l.end?.rotation.set(0, 0, 0);
    }
    this.hips.position.x = 0;
    this.body.rotation.x = 0;
    L.root.rotation.z = -0.13;
    R.root.rotation.z = 0.13;
    switch (id) {
      case 'jump': {
        // Jumps for joy, arms up at the top
        const up = Math.max(0, Math.sin(t * 6));
        const land = Math.max(0, -Math.sin(t * 6));
        this.hips.position.y = 0.92 + up * 0.32 - land * 0.18;
        for (const l of this.legs) {
          l.root.rotation.x = -land * 0.6;
          l.mid.rotation.x = land * 1.2;
        }
        L.root.rotation.x = R.root.rotation.x = -0.4 - up * 2.5;
        L.mid.rotation.x = R.mid.rotation.x = -0.2;
        this.head.rotation.x = -up * 0.3;
        break;
      }
      case 'salute': {
        // Stands at attention, hand to the forehead
        const s = Math.min(1, t * 2.5);
        R.root.rotation.x = -2.1 * s;
        R.root.rotation.z = 0.13 + 0.7 * s;
        R.mid.rotation.x = -2.3 * s;
        this.spine.rotation.x = -0.05;
        this.head.rotation.x = -0.1;
        break;
      }
      case 'guitar': {
        // Air guitar and headbanging
        L.root.rotation.x = -1.1;
        L.root.rotation.z = -0.5;
        L.mid.rotation.x = -1.0;
        R.root.rotation.x = -0.6;
        R.mid.rotation.x = -1.2 + Math.sin(t * 22) * 0.35;
        this.spine.rotation.x = 0.15 + Math.sin(t * 8) * 0.12;
        this.head.rotation.x = Math.sin(t * 8) * 0.45;
        LL.root.rotation.x = -0.3;
        RL.root.rotation.x = 0.3;
        RL.mid.rotation.x = 0.4;
        this.hips.position.y = 0.9 + Math.abs(Math.sin(t * 8)) * 0.03;
        break;
      }
      case 'flex': {
        // Shows the muscles, left then right
        const side = Math.sin(t * 2.5) > 0;
        for (const [a, on] of [[L, side], [R, !side]] as const) {
          a.root.rotation.x = on ? -1.5 : -0.9;
          a.root.rotation.z = (a === L ? -1 : 1) * (on ? 1.2 : 0.8);
          a.mid.rotation.x = on ? -2.2 : -1.8;
        }
        this.spine.rotation.y = side ? 0.25 : -0.25;
        this.spine.scale.set(1.06, 1, 1.06);
        this.head.rotation.y = side ? 0.5 : -0.5;
        break;
      }
      case 'robot': {
        // Jerky robot moves (quantized)
        const step = Math.floor(t * 3);
        const q = step % 4;
        L.root.rotation.x = q === 0 || q === 1 ? -1.57 : 0;
        R.root.rotation.x = q === 1 || q === 2 ? -1.57 : 0;
        L.mid.rotation.x = R.mid.rotation.x = -1.57;
        this.head.rotation.y = [0.5, 0, -0.5, 0][q];
        this.hips.rotation.y = [0, 0.3, 0, -0.3][q];
        this.hips.position.y = 0.92 - (q % 2) * 0.05;
        break;
      }
      case 'moon': {
        // Moonwalk: slides back, one heel up
        const ph = t * 3.2;
        this.body.position.z = -((t * 0.35) % 1.4) + 0.7;
        LL.mid.rotation.x = Math.max(0, Math.sin(ph)) * 0.9;
        RL.mid.rotation.x = Math.max(0, -Math.sin(ph)) * 0.9;
        LL.root.rotation.x = Math.sin(ph) * 0.15;
        RL.root.rotation.x = -Math.sin(ph) * 0.15;
        L.root.rotation.x = -Math.sin(ph) * 0.4;
        R.root.rotation.x = Math.sin(ph) * 0.4;
        L.mid.rotation.x = R.mid.rotation.x = -0.6;
        this.spine.rotation.x = 0.12;
        this.head.rotation.y = Math.sin(t) * 0.3;
        break;
      }
      case 'bow': {
        // A deep theatrical bow, then back up (every 2.5 s)
        const c = (t % 2.5) / 2.5;
        const s = Math.sin(Math.min(1, c / 0.7) * Math.PI);
        this.spine.rotation.x = 0.95 * s;
        this.head.rotation.x = 0.25 * s;
        R.root.rotation.x = -0.7 * s;
        R.root.rotation.z = -0.5 * s + 0.13;
        R.mid.rotation.x = -1.7 * s;
        L.root.rotation.z = -0.13 - 1.1 * s;
        L.root.rotation.x = 0.3 * s;
        RL.root.rotation.x = 0.25 * s;
        RL.mid.rotation.x = 0.35 * s;
        LL.root.rotation.x = -0.15 * s;
        break;
      }
      case 'zombie': {
        // Stiff zombie shuffle: arms out, head lolling, dragging one foot
        const ph = t * 2.4;
        L.root.rotation.x = -1.5 + Math.sin(ph * 1.3) * 0.08;
        R.root.rotation.x = -1.45 + Math.sin(ph * 1.1 + 1) * 0.08;
        L.mid.rotation.x = R.mid.rotation.x = -0.12;
        this.head.rotation.z = 0.45 + Math.sin(ph * 0.7) * 0.12;
        this.head.rotation.x = 0.2;
        this.spine.rotation.x = 0.18;
        this.spine.rotation.z = Math.sin(ph) * 0.08;
        LL.root.rotation.x = Math.sin(ph) * 0.3;
        LL.mid.rotation.x = Math.max(0, -Math.cos(ph)) * 0.5;
        RL.root.rotation.x = -Math.sin(ph) * 0.18;
        RL.end!.rotation.x = 0.5; // dragging the toes
        this.hips.position.y = 0.92 - Math.abs(Math.sin(ph)) * 0.04;
        this.body.position.z = Math.sin(ph * 0.5) * 0.15;
        break;
      }
      case 'chicken': {
        // Elbows flapping, head pecking, knees bouncing
        const flap = Math.sin(t * 14);
        for (const [a, sd] of [[L, -1], [R, 1]] as const) {
          a.root.rotation.x = -0.25;
          a.root.rotation.z = sd * (0.75 + flap * 0.35);
          a.mid.rotation.x = -2.4;
        }
        this.head.rotation.x = Math.sin(t * 7) > 0 ? 0.35 : -0.15;
        this.spine.rotation.x = 0.2;
        const b = Math.abs(Math.sin(t * 7));
        this.hips.position.y = 0.92 - b * 0.08;
        for (const l of this.legs) {
          l.root.rotation.x = -b * 0.35;
          l.mid.rotation.x = b * 0.7;
          l.end!.rotation.x = -b * 0.35;
        }
        break;
      }
      case 'floss': {
        // Arms swing side to side, one in front and one behind, hips the other way
        const sw = Math.sin(t * 9);
        const front = Math.cos(t * 9) > 0 ? 1 : -1;
        L.root.rotation.z = R.root.rotation.z = sw * 0.55;
        L.root.rotation.x = 0.35 * front;
        R.root.rotation.x = -0.35 * front;
        L.mid.rotation.x = R.mid.rotation.x = -0.05;
        this.hips.rotation.z = -sw * 0.12;
        this.hips.position.x = -sw * 0.05;
        this.spine.rotation.z = sw * 0.1;
        this.head.rotation.z = -sw * 0.08;
        break;
      }
      case 'disco': {
        // Saturday night: right finger up to the sky, then down across the body
        const up = Math.floor(t * 2) % 2 === 0;
        R.root.rotation.x = up ? -2.7 : -0.5;
        R.root.rotation.z = up ? 0.5 : -0.55;
        R.mid.rotation.x = -0.05;
        L.root.rotation.x = 0.15;
        L.root.rotation.z = -0.55;
        L.mid.rotation.x = -1.9;
        this.hips.rotation.y = Math.sin(t * Math.PI * 2) * 0.18;
        this.hips.rotation.z = Math.sin(t * Math.PI * 2) * 0.06;
        this.head.rotation.x = up ? -0.3 : 0.2;
        this.head.rotation.y = up ? 0.25 : -0.2;
        RL.mid.rotation.x = up ? 0.15 : 0.45;
        RL.end!.rotation.x = up ? 0 : 0.4;
        break;
      }
      case 'breakdance': {
        // Toprock, then spins low on one leg with the other kicked out
        const spin = t % 4 > 1.6;
        if (!spin) {
          const ph = t * 6;
          LL.root.rotation.x = Math.max(0, Math.sin(ph)) * -0.7;
          LL.mid.rotation.x = Math.max(0, Math.sin(ph)) * 1.1;
          RL.root.rotation.x = Math.max(0, -Math.sin(ph)) * -0.7;
          RL.mid.rotation.x = Math.max(0, -Math.sin(ph)) * 1.1;
          L.root.rotation.x = Math.sin(ph) * 0.8;
          R.root.rotation.x = -Math.sin(ph) * 0.8;
          L.mid.rotation.x = R.mid.rotation.x = -1.2;
          this.hips.position.y = 0.88 + Math.abs(Math.sin(ph)) * 0.04;
          this.spine.rotation.x = 0.2;
          this.hips.rotation.y = Math.sin(ph * 0.5) * 0.4;
        } else {
          this.hips.rotation.y = t * 9;
          this.hips.position.y = 0.6;
          LL.root.rotation.x = -1.4;
          LL.mid.rotation.x = 0.15;
          RL.root.rotation.x = -0.9;
          RL.mid.rotation.x = 2.0;
          L.root.rotation.z = -1.45;
          R.root.rotation.z = 1.45;
          L.mid.rotation.x = R.mid.rotation.x = -0.1;
          this.spine.rotation.x = 0.35;
          this.head.rotation.x = -0.2;
        }
        break;
      }
      default: {
        // Wave hello
        R.root.rotation.x = -2.8;
        R.root.rotation.z = 0.25 + Math.sin(t * 8) * 0.35;
        R.mid.rotation.x = -0.35;
        this.hips.rotation.y = Math.sin(t * 2) * 0.1;
        this.head.rotation.z = Math.sin(t * 2) * 0.08;
      }
    }
  }
  public applyLook(look: { skin: string; gown: string; hair: string; acc?: string; outfit?: string; char?: string; fx?: string; lamp?: string }) {
    // 🔦 their lamp's colour
    const lamp = lampOf(look.lamp).color;
    this.light.color.setHex(lamp);
    this.torchLens.emissive.setHex(lamp);
    const outfit = look.outfit ? HUMAN_OUTFITS[look.outfit] : undefined;
    const gown = this.mats.gown;
    const hair = this.mats.hair;
    this.mats.skin.color.set(look.skin);
    gown.color.set(outfit?.gown ?? look.gown);
    hair.color.set(outfit?.hair ?? look.hair);
    // Face material (lips & cheeks are vertex-coloured on top of it)
    this.lipsMat.color.set(look.skin);
    // Special materials (exclusive outfits)
    gown.metalness = outfit?.gownFx === 'gold' ? 0.85 : 0;
    gown.roughness = outfit?.gownFx === 'gold' ? 0.3 : outfit?.gownFx === 'white' ? 0.8 : 0.95;
    gown.emissive.set(outfit?.gownFx === 'neon' ? 0x00e5ff : outfit?.gownFx === 'ghost' ? 0x3a0a5a : 0x000000);
    gown.emissiveIntensity = outfit?.gownFx === 'neon' ? 0.9 : outfit?.gownFx === 'ghost' ? 0.5 : 0;
    hair.emissive.set(outfit?.hairFx === 'neon' ? 0xff3ad8 : 0x000000);
    hair.emissiveIntensity = outfit?.hairFx === 'neon' ? 0.8 : 0;

    // Rebuild the worn pieces
    this.cosmeticDisposables.forEach((d) => d.dispose());
    this.cosmeticDisposables = [];
    this.cosmetic.clear();
    this.cosmeticBody.clear();
    const track = <T extends { dispose: () => void }>(o: T) => {
      this.cosmeticDisposables.push(o);
      return o;
    };
    // Character: hairstyle, beard, build
    const ch = characterOf(look.char);
    this.cosmetic.add(this.buildCharacter(ch, track));
    this.body.scale.set(ch.width, ch.height, ch.width);
    const accs = new Set([...(outfit?.accs ?? []), ...(look.acc ? [look.acc] : [])]);
    // A hat hides the mohawk / hair volume conflicts: keep it simple, wear everything
    for (const id of accs) this.cosmetic.add(buildHumanAccessory(id, track));
    for (const ex of outfit?.extras ?? []) {
      if (ex === 'mohawk') this.cosmetic.add(buildHumanAccessory('mohawk', track));
      else this.cosmeticBody.add(buildHumanBodyExtra(ex, track));
    }
    if (!this.cosmetic.parent) this.head.add(this.cosmetic);
    if (!this.cosmeticBody.parent) this.spine.add(this.cosmeticBody);
    this.danceId = (look as { dance?: string }).dance ?? '';
    if (this.fx) this.group.remove(this.fx.group);
    const fxId = look.fx || outfit?.fx;
    this.fx = fxId ? buildFx(fxId, track, 1.75 * ch.height, false) : null;
    if (this.fx) this.group.add(this.fx.group);
    if (this.prestige) this.group.remove(this.prestige.group);
    const rank = outfitRank('human', look.outfit);
    this.prestige = buildPrestige(rank, rank >= 3 ? 0xff7a1a : 0xfbbf24, track, 1.75 * ch.height);
    if (this.prestige) this.group.add(this.prestige.group);
  }

  private static skinTex: THREE.CanvasTexture | null = null;
  private static hairTex: THREE.CanvasTexture | null = null;

  /** Fine skin grain (pores, slight blotches) used as a bump map so skin isn't plastic. */
  private static skinTexture() {
    if (this.skinTex) return this.skinTex;
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const ctx = c.getContext('2d')!;
    const img = ctx.createImageData(256, 256);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 128 + (Math.random() - 0.5) * 70;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    ctx.globalAlpha = 0.25;
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = Math.random() > 0.5 ? '#000' : '#fff';
      ctx.beginPath();
      ctx.arc(Math.random() * 256, Math.random() * 256, 4 + Math.random() * 14, 0, Math.PI * 2);
      ctx.fill();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(3, 3);
    this.skinTex = tex;
    return tex;
  }

  /** Hair strands: fine light/dark streaks along the hair direction. */
  private static hairTexture() {
    if (this.hairTex) return this.hairTex;
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 900; i++) {
      const x = Math.random() * 256;
      const shade = Math.floor(70 + Math.random() * 140);
      ctx.strokeStyle = `rgb(${shade},${shade},${shade})`;
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 0.6 + Math.random() * 1.2;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.bezierCurveTo(x + (Math.random() - 0.5) * 20, 85, x + (Math.random() - 0.5) * 20, 170, x + (Math.random() - 0.5) * 30, 256);
      ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(2, 1);
    this.hairTex = tex;
    return tex;
  }

  /** Menu preview: hide the name tag. */
  public set showName(v: boolean) {
    this.nameSprite.visible = v;
  }

  public apply(s: PlayerNetState) {
    if (!this.state) {
      this.position.set(s.x, 0, s.z);
      this.yaw = s.yaw;
    }
    this.state = s;
  }

  /**
   * Pose the rig. `speed` m/s on the ground, `aiming` = flashlight raised.
   */
  private pose(delta: number, speed: number, crouching: boolean, aiming: boolean, sprinting: boolean) {
    const k = 1 - Math.exp(-12 * delta);
    const moving = Math.min(1, speed / 2.2);
    this.walkPhase += delta * (speed * 2.6 + (moving > 0.05 ? 1 : 0));
    this.breathe += delta * (sprinting ? 5 : 1.6);
    this.crouch += ((crouching ? 1 : 0) - this.crouch) * k;
    const p = this.walkPhase;
    const amp = moving * (sprinting ? 1.25 : 0.85);

    const still = 1 - moving;
    this.blink(delta);
    // Idle: slow weight shift from one leg to the other, and the eyes wander
    const shift = Math.sin(this.breathe * 0.22) * still * (1 - this.crouch);
    this.glanceIn -= delta;
    if (this.glanceIn <= 0) {
      this.glanceIn = 1.5 + Math.random() * 3.5;
      this.glanceTarget = (Math.random() - 0.5) * (moving > 0.3 ? 0.3 : 0.9);
    }
    this.glance += (this.glanceTarget - this.glance) * (1 - Math.exp(-5 * delta));

    // Hips: drop when crouching, bob twice per stride, roll and sway with each step
    this.hips.position.y = 0.92 - this.crouch * 0.36 - Math.abs(Math.sin(p)) * 0.035 * amp - Math.abs(shift) * 0.008;
    this.hips.position.x = Math.sin(p) * 0.018 * amp + shift * 0.022;
    this.hips.rotation.y = Math.sin(p) * 0.09 * amp;
    this.hips.rotation.z = Math.sin(p) * 0.045 * amp + shift * 0.035;
    // Spine: lean forward when running / crouching, shoulders counter-rotate, breathe
    const lean = this.crouch * 0.45 + (sprinting ? 0.25 : 0.04 * amp);
    this.spine.rotation.x += (lean - this.spine.rotation.x) * k;
    this.spine.rotation.y = -Math.sin(p) * 0.16 * amp;
    this.spine.rotation.z = -this.hips.rotation.z * 0.7;
    const br = Math.sin(this.breathe);
    this.spine.scale.set(1 + br * 0.012, 1 + br * 0.004, 1 + br * 0.022);

    // Legs: swing + knee bend, deep bend when crouching; the foot rolls heel → toe
    this.legs.forEach((l, i) => {
      const ph = p + i * Math.PI;
      const sideShift = (i === 0 ? 1 : -1) * shift; // the relaxed leg bends a little
      const swing = Math.sin(ph) * 0.6 * amp - this.crouch * 0.9 + Math.max(0, -sideShift) * 0.06;
      l.root.rotation.x += (swing - l.root.rotation.x) * k;
      const bend = Math.max(0, -Math.cos(ph)) * 0.95 * amp + this.crouch * 1.6 + 0.05 + Math.max(0, -sideShift) * 0.14;
      l.mid.rotation.x += (bend - l.mid.rotation.x) * k;
      if (l.end) {
        // Keep the sole on the floor, lift the heel when the leg is behind (toe-off),
        // land on the heel when it swings forward
        const flat = -(l.root.rotation.x + l.mid.rotation.x) * 0.9;
        const toeOff = Math.max(0, Math.sin(ph - 0.4)) * 0.35 * amp;
        const heel = -Math.max(0, -Math.sin(ph + 0.5)) * 0.2 * amp;
        const target = flat + toeOff + heel;
        l.end.rotation.x += (target - l.end.rotation.x) * k;
      }
    });

    // Arms: left swings (elbow bends more in front), right aims the flashlight
    const [left, right] = this.arms;
    const lSwing = -Math.sin(p) * 0.55 * amp + still * Math.sin(this.breathe * 0.5) * 0.03;
    left.root.rotation.x += (lSwing - left.root.rotation.x) * k;
    left.mid.rotation.x += (-0.2 - amp * 0.3 - Math.max(0, -lSwing) * 0.5 - left.mid.rotation.x) * k;
    left.root.rotation.z = -0.13 - (sprinting ? 0.12 : 0) - Math.max(0, shift) * 0.03;
    const rSwing = Math.sin(p) * 0.55 * amp;
    const rTarget = aiming ? -1.25 - this.pitch * 0.8 : rSwing;
    right.root.rotation.x += (rTarget - right.root.rotation.x) * k;
    right.mid.rotation.x += ((aiming ? -0.15 : -0.2 - amp * 0.3 - Math.max(0, -rSwing) * 0.5) - right.mid.rotation.x) * k;
    right.root.rotation.z = 0.13 + (sprinting ? 0.12 : 0);

    // Head follows the look direction, stays steady over the swaying shoulders, glances around
    this.head.rotation.x += (-this.pitch * 0.6 - this.head.rotation.x) * k;
    this.head.rotation.y = -this.spine.rotation.y * 0.8 - this.hips.rotation.y * 0.6 + this.glance * 0.6;
    this.head.rotation.z = -this.spine.rotation.z * 0.5 - shift * 0.03;
    this.torchLens.emissiveIntensity = aiming ? 3 : 0;

    // 👋 Emote gesture on top of the walk (blends in and out)
    if (this.gestureT > 0) {
      this.gestureT -= delta;
      const w = Math.min(1, this.gestureT / 0.3, (2.4 - this.gestureT) / 0.25);
      const T = 2.4 - this.gestureT;
      const blend = (o: THREE.Object3D, x: number, z?: number) => {
        o.rotation.x += (x - o.rotation.x) * w;
        if (z !== undefined) o.rotation.z += (z - o.rotation.z) * w;
      };
      switch (this.gestureId) {
        case 0: // wave
          blend(right.root, -2.8, 0.3 + Math.sin(T * 9) * 0.35);
          blend(right.mid, -0.35);
          break;
        case 1: // point the way
          blend(right.root, -1.55, 0.05);
          blend(right.mid, -0.05);
          blend(this.head, -0.05);
          break;
        case 2: // scared: hands up to the face, shaking
          blend(left.root, -2.0, -0.55 + Math.sin(T * 30) * 0.04);
          blend(right.root, -2.0, 0.55 + Math.sin(T * 31) * 0.04);
          blend(left.mid, -2.2);
          blend(right.mid, -2.2);
          this.spine.rotation.x += (-0.12 - this.spine.rotation.x) * w;
          this.body.position.x = Math.sin(T * 40) * 0.006 * w;
          break;
        case 3: // shush: finger to the lips
          blend(right.root, -1.95, 0.55);
          blend(right.mid, -2.55);
          blend(this.head, 0.15);
          break;
        case 4: // come here: arm out, forearm beckoning
          blend(right.root, -1.25, 0.1);
          blend(right.mid, -0.5 - (0.5 + 0.5 * Math.sin(T * 9)) * 1.3);
          blend(this.head, -0.05);
          break;
        case 5: // stop: arm out, palm up and facing them
          blend(right.root, -1.55, 0.15);
          blend(right.mid, -1.35);
          this.spine.rotation.x += (-0.06 - this.spine.rotation.x) * w;
          break;
        case 6: // clapping
          blend(left.root, -1.15, 0.28 + Math.max(0, Math.sin(T * 15)) * 0.22);
          blend(right.root, -1.15, -0.28 - Math.max(0, Math.sin(T * 15)) * 0.22);
          blend(left.mid, -1.0);
          blend(right.mid, -1.0);
          break;
        case 7: // laughing: hands on the belly, shaking, head thrown back
          blend(left.root, -0.45, 0.3);
          blend(right.root, -0.45, -0.3);
          blend(left.mid, -1.75);
          blend(right.mid, -1.75);
          this.spine.rotation.x += (-0.12 + Math.sin(T * 20) * 0.05 - this.spine.rotation.x) * w;
          this.head.rotation.x += (-0.35 + Math.sin(T * 20) * 0.06 - this.head.rotation.x) * w;
          break;
      }
      if (this.gestureT <= 0) this.body.position.x = 0;
    }
    const g = this.gestureT > 0 ? this.gestureId : -1;
    this.face(delta, g === 2 ? 1 : Math.min(1, Math.max(0, (this.fearNet - 0.35) * 1.6)), g === 6 || g === 7 || g === 0 ? 1 : 0, g === 7 ? 1 : 0);
  }

  /** Customisation preview: idle breathing, flashlight in hand. */
  public idle(delta: number) {
    this.fx?.tick(delta);
    this.prestige?.tick(delta);
    this.pose(delta, 0, false, false, false);
  }

  public update(delta: number) {
    const s = this.state;
    if (!s) return;
    this.fx?.tick(delta);
    this.prestige?.tick(delta);
    this.group.visible = !s.dead && !s.hid && !this.forceHidden;

    const prev = this.position.clone();
    const k = 1 - Math.exp(-14 * delta);
    if (Math.hypot(s.x - this.position.x, s.z - this.position.z) > 5) this.position.set(s.x, 0, s.z);
    else {
      this.position.x += (s.x - this.position.x) * k;
      this.position.z += (s.z - this.position.z) * k;
    }
    let dy = s.yaw - this.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.yaw += dy * k;
    this.pitch += (s.pitch - this.pitch) * k;

    this.group.position.copy(this.position);
    // Model faces +z, the player looks along -z at yaw 0
    this.body.rotation.y = this.yaw + Math.PI;
    const speed = prev.distanceTo(this.position) / Math.max(delta, 1e-3);
    this.speed += (speed - this.speed) * Math.min(1, delta * 6);
    this.fearNet = s.fe ?? 0;
    this.pose(delta, this.speed, s.cr, s.fl, !!s.sp);

    // Their flashlight lights up our world too
    const eye = new THREE.Vector3(this.position.x, s.y - 0.2, this.position.z);
    const dir = new THREE.Vector3(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch));
    this.light.position.copy(eye).addScaledVector(new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw)), 0.2);
    this.lightTarget.position.copy(this.light.position).addScaledVector(dir, 5);
    this.lightTarget.updateMatrixWorld();
    const on = s.fl && !s.dead && !s.hid && !this.forceHidden;
    this.light.intensity = THREE.MathUtils.damp(this.light.intensity, on ? 50 : 0, 20, delta);
  }

  /** Eye position / look direction, to spectate this player. */
  public eye(out: THREE.Vector3) {
    return out.set(this.position.x, this.state?.y ?? 1.7, this.position.z);
  }

  public dispose() {
    this.light.intensity = 0;
    this.group.parent?.remove(this.group);
    this.disposables.forEach((d) => d.dispose());
    this.cosmeticDisposables.forEach((d) => d.dispose());
  }
}
