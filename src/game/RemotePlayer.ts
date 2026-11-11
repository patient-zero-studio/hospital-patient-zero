import * as THREE from 'three';
import type { PlayerNetState } from '../net/protocol';
import { ProceduralTextures } from '../textures/ProceduralTextures';
import { HUMAN_OUTFITS, buildHumanAccessory, buildHumanBodyExtra } from './Cosmetics';

type Limb = { root: THREE.Group; mid: THREE.Group };

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
      // Hospital slipper: rounded foot shape
      const foot = mesh(new THREE.CapsuleGeometry(0.045, 0.15, 6, 12), slipper, knee, 0, -0.44, 0.06);
      foot.rotation.x = Math.PI / 2;
      foot.scale.set(1.2, 1, 0.62);
      mesh(new THREE.BoxGeometry(0.1, 0.012, 0.25), rubber, knee, 0, -0.468, 0.06); // sole
      this.legs.push({ root, mid: knee });
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
      this.arms.push({ root, mid: elbow });
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
      const b = onFace(s * 0.34, 0.27);
      const brow = mesh(new THREE.CapsuleGeometry(0.0032, 0.026, 3, 8), hair, this.head, b.x, b.y, b.z + 0.002);
      brow.rotation.z = Math.PI / 2 - s * 0.18;
      brow.rotation.y = s * 0.3;
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

  /** Shop accessories & outfit pieces currently worn (rebuilt on every look change). */
  private cosmetic = new THREE.Group();
  private cosmeticBody = new THREE.Group();
  private cosmeticDisposables: { dispose: () => void }[] = [];

  /** Player customisation: colours, accessory and outfit. */
  public applyLook(look: { skin: string; gown: string; hair: string; acc?: string; outfit?: string }) {
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
    gown.emissive.set(outfit?.gownFx === 'neon' ? 0x00e5ff : 0x000000);
    gown.emissiveIntensity = outfit?.gownFx === 'neon' ? 0.9 : 0;
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
    const accs = new Set([...(outfit?.accs ?? []), ...(look.acc ? [look.acc] : [])]);
    // A hat hides the mohawk / hair volume conflicts: keep it simple, wear everything
    for (const id of accs) this.cosmetic.add(buildHumanAccessory(id, track));
    for (const ex of outfit?.extras ?? []) {
      if (ex === 'mohawk') this.cosmetic.add(buildHumanAccessory('mohawk', track));
      else this.cosmeticBody.add(buildHumanBodyExtra(ex, track));
    }
    if (!this.cosmetic.parent) this.head.add(this.cosmetic);
    if (!this.cosmeticBody.parent) this.spine.add(this.cosmeticBody);
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

    // Hips: drop when crouching, small bob while walking
    this.hips.position.y = 0.92 - this.crouch * 0.36 - Math.abs(Math.sin(p)) * 0.03 * amp;
    this.hips.rotation.y = Math.sin(p) * 0.08 * amp;
    // Spine: lean forward when running / crouching, breathe
    const lean = this.crouch * 0.45 + (sprinting ? 0.25 : 0.04 * amp);
    this.spine.rotation.x += (lean - this.spine.rotation.x) * k;
    this.spine.rotation.y = -Math.sin(p) * 0.1 * amp;
    this.spine.scale.set(1 + Math.sin(this.breathe) * 0.012, 1, 1 + Math.sin(this.breathe) * 0.02);

    // Legs: swing + knee bend, deep bend when crouching
    this.legs.forEach((l, i) => {
      const ph = p + i * Math.PI;
      const swing = Math.sin(ph) * 0.6 * amp - this.crouch * 0.9;
      l.root.rotation.x += (swing - l.root.rotation.x) * k;
      const bend = Math.max(0, -Math.cos(ph)) * 0.9 * amp + this.crouch * 1.6 + 0.05;
      l.mid.rotation.x += (bend - l.mid.rotation.x) * k;
    });

    // Arms: left swings, right aims the flashlight
    const [left, right] = this.arms;
    const lSwing = -Math.sin(p) * 0.55 * amp;
    left.root.rotation.x += (lSwing - left.root.rotation.x) * k;
    left.mid.rotation.x += (-0.25 - amp * 0.35 - left.mid.rotation.x) * k;
    left.root.rotation.z = -0.13;
    const rTarget = aiming ? -1.25 - this.pitch * 0.8 : Math.sin(p) * 0.55 * amp;
    right.root.rotation.x += (rTarget - right.root.rotation.x) * k;
    right.mid.rotation.x += ((aiming ? -0.15 : -0.25 - amp * 0.35) - right.mid.rotation.x) * k;
    right.root.rotation.z = 0.13;

    // Head follows the look direction, a little nervous glance
    this.head.rotation.x += (-this.pitch * 0.6 - this.head.rotation.x) * k;
    this.head.rotation.y = Math.sin(this.breathe * 0.7) * 0.05;
    this.torchLens.emissiveIntensity = aiming ? 3 : 0;
  }

  /** Customisation preview: idle breathing, flashlight in hand. */
  public idle(delta: number) {
    this.pose(delta, 0, false, false, false);
  }

  public update(delta: number) {
    const s = this.state;
    if (!s) return;
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
