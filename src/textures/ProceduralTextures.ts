import * as THREE from 'three';

/**
 * Procedural canvas textures. Every texture is generated once and cached.
 * Textures are designed to tile (wrap) cleanly so they can be mapped with
 * world-space UVs at a constant texel density.
 */

type Ctx = CanvasRenderingContext2D;

// Small deterministic PRNG so the hospital looks the same on every run.
let seed = 1337;
const rand = () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};
const rr = (a: number, b: number) => a + rand() * (b - a);

const makeCanvas = (w: number, h: number): [HTMLCanvasElement, Ctx] => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
};

/** Adds per-pixel luminance noise. */
const addNoise = (ctx: Ctx, w: number, h: number, amount: number) => {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rand() - 0.5) * amount;
    d[i] = Math.max(0, Math.min(255, d[i] + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
  }
  ctx.putImageData(img, 0, 0);
};

/** Draws a soft blotch that wraps around the canvas edges (for seamless tiling). */
const wrappedBlotch = (ctx: Ctx, w: number, h: number, x: number, y: number, r: number, inner: string, outer: string) => {
  for (const ox of [-w, 0, w]) {
    for (const oy of [-h, 0, h]) {
      const cx = x + ox;
      const cy = y + oy;
      if (cx + r < 0 || cx - r > w || cy + r < 0 || cy - r > h) continue;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, inner);
      g.addColorStop(1, outer);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
};

const crackLine = (ctx: Ctx, x: number, y: number, steps: number, len: number) => {
  ctx.beginPath();
  ctx.moveTo(x, y);
  let a = rand() * Math.PI * 2;
  for (let j = 0; j < steps; j++) {
    a += rr(-0.8, 0.8);
    x += Math.cos(a) * len;
    y += Math.sin(a) * len;
    ctx.lineTo(x, y);
  }
  ctx.stroke();
};

export class ProceduralTextures {
  private static cache: Map<string, THREE.Texture> = new Map();

  private static finish(canvas: HTMLCanvasElement, key: string, srgb = true, wrap = true): THREE.CanvasTexture {
    const tex = new THREE.CanvasTexture(canvas);
    if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
    if (wrap) {
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
    }
    tex.anisotropy = 8;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    this.cache.set(key, tex);
    return tex;
  }

  private static cached(key: string) {
    return this.cache.get(key) as THREE.CanvasTexture | undefined;
  }

  /**
   * Hospital wall: pale institutional green paint over plaster, darker
   * wainscoting at the bottom, water stains and grime running down.
   * Covers exactly one wall height vertically (v = 0 floor, v = 1 ceiling).
   */
  public static getDirtyWallTexture(): THREE.CanvasTexture {
    const hit = this.cached('wall');
    if (hit) return hit;
    const W = 1024;
    const H = 1024;
    const [c, ctx] = makeCanvas(W, H);

    // Upper paint
    ctx.fillStyle = '#7d877c';
    ctx.fillRect(0, 0, W, H);

    // Large-scale paint unevenness
    for (let i = 0; i < 40; i++) {
      wrappedBlotch(ctx, W, H, rand() * W, rand() * H * 0.7, rr(60, 200), 'rgba(60,70,58,0.18)', 'rgba(60,70,58,0)');
    }
    for (let i = 0; i < 25; i++) {
      wrappedBlotch(ctx, W, H, rand() * W, rand() * H * 0.7, rr(40, 140), 'rgba(150,155,135,0.12)', 'rgba(150,155,135,0)');
    }

    // Wainscoting (bottom 30%)
    const wainTop = Math.round(H * 0.7);
    const grad = ctx.createLinearGradient(0, wainTop, 0, H);
    grad.addColorStop(0, '#3d5246');
    grad.addColorStop(1, '#2b3a31');
    ctx.fillStyle = grad;
    ctx.fillRect(0, wainTop, W, H - wainTop);

    // Chair rail
    ctx.fillStyle = '#1c2520';
    ctx.fillRect(0, wainTop - 10, W, 10);
    ctx.fillStyle = 'rgba(200,210,190,0.18)';
    ctx.fillRect(0, wainTop - 10, W, 2);

    // Skirting board
    ctx.fillStyle = '#151a17';
    ctx.fillRect(0, H - 34, W, 34);

    // Water / rust streaks from the ceiling
    for (let i = 0; i < 26; i++) {
      const x = rand() * W;
      const w = rr(3, 18);
      const h = rr(150, 650);
      const g = ctx.createLinearGradient(x, 0, x, h);
      const tint = rand() > 0.5 ? '70,52,30' : '28,34,28';
      g.addColorStop(0, `rgba(${tint},${rr(0.35, 0.6)})`);
      g.addColorStop(1, `rgba(${tint},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(x, 0, w, h);
      if (x + w > W) ctx.fillRect(x - W, 0, w, h);
    }

    // Grime rising from the floor
    const floorGrime = ctx.createLinearGradient(0, H, 0, H - 260);
    floorGrime.addColorStop(0, 'rgba(10,12,10,0.65)');
    floorGrime.addColorStop(1, 'rgba(10,12,10,0)');
    ctx.fillStyle = floorGrime;
    ctx.fillRect(0, H - 260, W, 260);

    // Mould patches
    for (let i = 0; i < 10; i++) {
      wrappedBlotch(ctx, W, H, rand() * W, rr(H * 0.55, H), rr(30, 90), 'rgba(20,28,16,0.55)', 'rgba(20,28,16,0)');
    }

    // Plaster cracks
    ctx.strokeStyle = 'rgba(25,28,24,0.7)';
    ctx.lineWidth = 1.4;
    for (let i = 0; i < 14; i++) crackLine(ctx, rand() * W, rand() * H * 0.68, 8, rr(8, 22));

    // Scratches on the wainscoting (gurneys hitting the wall)
    ctx.strokeStyle = 'rgba(160,170,150,0.25)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 40; i++) {
      const x = rand() * W;
      const y = rr(wainTop + 20, H - 50);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + rr(20, 90), y + rr(-4, 4));
      ctx.stroke();
    }

    addNoise(ctx, W, H, 22);
    return this.finish(c, 'wall');
  }

  /**
   * Sewer tunnel: old wet bricks, black mould at the bottom, a green slime line
   * where the water used to be, rust streaks. Covers one wall height vertically.
   */
  public static getSewerBrickTexture(): THREE.CanvasTexture {
    const hit = this.cached('sewer-brick');
    if (hit) return hit;
    const W = 1024;
    const H = 1024;
    const [c, ctx] = makeCanvas(W, H);
    // Mortar
    ctx.fillStyle = '#6a6052';
    ctx.fillRect(0, 0, W, H);
    const bw = 128;
    const bh = 52;
    for (let row = 0; row * bh < H; row++) {
      const off = row % 2 ? bw / 2 : 0;
      for (let x = -bw; x < W + bw; x += bw) {
        const r = 170 + rand() * 50;
        const g = 104 + rand() * 30;
        const b = 78 + rand() * 24;
        const d = 0.72 + rand() * 0.28;
        ctx.fillStyle = `rgb(${(r * d) | 0},${(g * d) | 0},${(b * d) | 0})`;
        ctx.fillRect(x + off + 3, row * bh + 3, bw - 6, bh - 6);
        // Worn brick faces
        ctx.fillStyle = `rgba(0,0,0,${rr(0.05, 0.25)})`;
        ctx.fillRect(x + off + 3 + rand() * 60, row * bh + 3, rr(10, 60), bh - 6);
      }
    }
    // Damp everywhere, darker towards the floor
    const damp = ctx.createLinearGradient(0, 0, 0, H);
    damp.addColorStop(0, 'rgba(10,12,10,0.08)');
    damp.addColorStop(0.62, 'rgba(10,14,10,0.16)');
    damp.addColorStop(1, 'rgba(4,8,4,0.55)');
    ctx.fillStyle = damp;
    ctx.fillRect(0, 0, W, H);
    // Slime line (old water level)
    const lineY = H * 0.78;
    ctx.fillStyle = 'rgba(52,70,28,0.75)';
    ctx.fillRect(0, lineY, W, 10);
    for (let x = 0; x < W; x += 6) ctx.fillRect(x, lineY + 10, 4, rr(4, 40));
    // Water trickling down from the vault
    for (let i = 0; i < 30; i++) {
      const x = rand() * W;
      const g = ctx.createLinearGradient(x, 0, x, rr(300, 900));
      g.addColorStop(0, `rgba(${rand() > 0.5 ? '90,60,30' : '20,26,20'},${rr(0.3, 0.6)})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x, 0, rr(3, 14), H);
    }
    for (let i = 0; i < 14; i++) wrappedBlotch(ctx, W, H, rand() * W, rr(H * 0.6, H), rr(40, 120), 'rgba(8,14,6,0.7)', 'rgba(8,14,6,0)');
    addNoise(ctx, W, H, 26);
    return this.finish(c, 'sewer-brick');
  }

  /** Sewer floor: cracked wet concrete with grime. */
  public static getSewerFloorTexture(): THREE.CanvasTexture {
    const hit = this.cached('sewer-floor');
    if (hit) return hit;
    const W = 512;
    const [c, ctx] = makeCanvas(W, W);
    ctx.fillStyle = '#8c887c';
    ctx.fillRect(0, 0, W, W);
    for (let i = 0; i < 60; i++) wrappedBlotch(ctx, W, W, rand() * W, rand() * W, rr(20, 90), 'rgba(15,16,12,0.22)', 'rgba(15,16,12,0)');
    for (let i = 0; i < 30; i++) wrappedBlotch(ctx, W, W, rand() * W, rand() * W, rr(10, 50), 'rgba(70,80,40,0.22)', 'rgba(70,80,40,0)');
    ctx.strokeStyle = 'rgba(10,10,8,0.7)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 10; i++) crackLine(ctx, rand() * W, rand() * W, 8, rr(10, 28));
    addNoise(ctx, W, W, 30);
    return this.finish(c, 'sewer-floor');
  }

  /** Classic checkerboard hospital linoleum, worn and stained. One texture = 4 x 4 tiles. */
  public static getFloorTileTexture(): THREE.CanvasTexture {
    const hit = this.cached('floor');
    if (hit) return hit;
    const S = 1024;
    const [c, ctx] = makeCanvas(S, S);
    const tiles = 4;
    const ts = S / tiles;

    for (let ty = 0; ty < tiles; ty++) {
      for (let tx = 0; tx < tiles; tx++) {
        const light = (tx + ty) % 2 === 0;
        const base = light ? rr(150, 162) : rr(58, 66);
        const r = base;
        const g = base + (light ? 4 : 3);
        const b = base + (light ? -6 : 2);
        ctx.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`;
        ctx.fillRect(tx * ts, ty * ts, ts, ts);
        // Subtle bevel
        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
        ctx.lineWidth = 3;
        ctx.strokeRect(tx * ts + 1.5, ty * ts + 1.5, ts - 3, ts - 3);
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.lineWidth = 1;
        ctx.strokeRect(tx * ts + 4, ty * ts + 4, ts - 8, ts - 8);
      }
    }

    // Dirt and traffic wear
    for (let i = 0; i < 60; i++) {
      wrappedBlotch(ctx, S, S, rand() * S, rand() * S, rr(20, 140), `rgba(40,34,24,${rr(0.12, 0.3)})`, 'rgba(40,34,24,0)');
    }
    // Dried fluid stains
    for (let i = 0; i < 6; i++) {
      wrappedBlotch(ctx, S, S, rand() * S, rand() * S, rr(15, 50), 'rgba(55,20,14,0.45)', 'rgba(55,20,14,0)');
    }
    // Scuffs
    ctx.strokeStyle = 'rgba(15,15,15,0.35)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 60; i++) {
      const x = rand() * S;
      const y = rand() * S;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + rr(-30, 30), y + rr(-30, 30), x + rr(-60, 60), y + rr(-60, 60));
      ctx.stroke();
    }
    // Cracked tiles
    ctx.strokeStyle = 'rgba(10,10,10,0.8)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 7; i++) crackLine(ctx, rand() * S, rand() * S, 7, rr(10, 26));

    addNoise(ctx, S, S, 14);
    return this.finish(c, 'floor');
  }

  /** Roughness map for the floor: wet/polished patches shine under the flashlight. */
  public static getFloorRoughnessTexture(): THREE.CanvasTexture {
    const hit = this.cached('floorRough');
    if (hit) return hit;
    const S = 512;
    const [c, ctx] = makeCanvas(S, S);
    ctx.fillStyle = 'rgb(150,150,150)';
    ctx.fillRect(0, 0, S, S);
    for (let i = 0; i < 30; i++) {
      wrappedBlotch(ctx, S, S, rand() * S, rand() * S, rr(20, 90), 'rgba(40,40,40,0.8)', 'rgba(40,40,40,0)');
    }
    for (let i = 0; i < 30; i++) {
      wrappedBlotch(ctx, S, S, rand() * S, rand() * S, rr(20, 80), 'rgba(230,230,230,0.6)', 'rgba(230,230,230,0)');
    }
    addNoise(ctx, S, S, 30);
    return this.finish(c, 'floorRough', false);
  }

  /** Suspended acoustic ceiling tiles (2 x 2 per texture). */
  public static getCeilingTexture(): THREE.CanvasTexture {
    const hit = this.cached('ceiling');
    if (hit) return hit;
    const S = 512;
    const [c, ctx] = makeCanvas(S, S);
    ctx.fillStyle = '#8a8a82';
    ctx.fillRect(0, 0, S, S);

    // Perforations
    ctx.fillStyle = 'rgba(40,40,36,0.35)';
    for (let i = 0; i < 2600; i++) {
      ctx.fillRect(rand() * S, rand() * S, 1.6, 1.6);
    }
    // Water damage
    for (let i = 0; i < 7; i++) {
      const x = rand() * S;
      const y = rand() * S;
      const r = rr(25, 80);
      wrappedBlotch(ctx, S, S, x, y, r, 'rgba(95,70,35,0.55)', 'rgba(95,70,35,0)');
      ctx.strokeStyle = 'rgba(80,55,25,0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, r * 0.8, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Grid (T-bar)
    ctx.fillStyle = '#3c3c38';
    ctx.fillRect(0, 0, S, 6);
    ctx.fillRect(0, S / 2 - 3, S, 6);
    ctx.fillRect(0, 0, 6, S);
    ctx.fillRect(S / 2 - 3, 0, 6, S);
    // One missing tile (dark hole)
    ctx.fillStyle = '#0b0b0a';
    ctx.fillRect(S / 2 + 4, 4, S / 2 - 8, S / 2 - 8);

    addNoise(ctx, S, S, 16);
    return this.finish(c, 'ceiling');
  }

  /** Brushed / painted steel with rust blooms and scratches. */
  public static getRustedMetalTexture(): THREE.CanvasTexture {
    const hit = this.cached('rust');
    if (hit) return hit;
    const S = 512;
    const [c, ctx] = makeCanvas(S, S);
    ctx.fillStyle = '#6b7275';
    ctx.fillRect(0, 0, S, S);

    // Brushed lines
    for (let y = 0; y < S; y++) {
      ctx.fillStyle = `rgba(${rand() > 0.5 ? '255,255,255' : '0,0,0'},${rr(0.02, 0.07)})`;
      ctx.fillRect(0, y, S, 1);
    }
    // Rust blooms
    for (let i = 0; i < 26; i++) {
      const x = rand() * S;
      const y = rand() * S;
      const r = rr(10, 50);
      wrappedBlotch(ctx, S, S, x, y, r, 'rgba(110,55,25,0.85)', 'rgba(80,40,20,0)');
      wrappedBlotch(ctx, S, S, x, y, r * 0.45, 'rgba(60,28,12,0.8)', 'rgba(60,28,12,0)');
    }
    // Scratches
    ctx.strokeStyle = 'rgba(200,205,210,0.25)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 70; i++) {
      const x = rand() * S;
      const y = rand() * S;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + rr(-50, 50), y + rr(-12, 12));
      ctx.stroke();
    }
    addNoise(ctx, S, S, 18);
    return this.finish(c, 'rust');
  }

  /** Painted hospital door (mapped once per door panel, no tiling). */
  public static getDoorTexture(): THREE.CanvasTexture {
    const hit = this.cached('door');
    if (hit) return hit;
    const W = 256;
    const H = 512;
    const [c, ctx] = makeCanvas(W, H);
    ctx.fillStyle = '#5a6b66';
    ctx.fillRect(0, 0, W, H);

    // Inset panels
    ctx.strokeStyle = 'rgba(20,25,24,0.55)';
    ctx.lineWidth = 4;
    ctx.strokeRect(26, 230, W - 52, 200);
    ctx.strokeStyle = 'rgba(200,215,210,0.12)';
    ctx.lineWidth = 2;
    ctx.strokeRect(30, 234, W - 60, 192);

    // Kick plate
    const kp = ctx.createLinearGradient(0, H - 70, 0, H);
    kp.addColorStop(0, '#8d9293');
    kp.addColorStop(1, '#4d5253');
    ctx.fillStyle = kp;
    ctx.fillRect(8, H - 66, W - 16, 58);

    // Paint chips & grime
    for (let i = 0; i < 30; i++) {
      wrappedBlotch(ctx, W, H, rand() * W, rand() * H, rr(4, 18), 'rgba(80,60,40,0.7)', 'rgba(80,60,40,0)');
    }
    for (let i = 0; i < 12; i++) {
      wrappedBlotch(ctx, W, H, rand() * W, rr(260, H), rr(20, 60), 'rgba(15,15,12,0.35)', 'rgba(15,15,12,0)');
    }
    // Smeared dried-blood finger trails dragging down the door
    for (let f = 0; f < 4; f++) {
      const x0 = W * 0.62 + f * 9 + rr(-2, 2);
      const y0 = H * 0.36 + rr(-6, 6);
      const len = rr(90, 170);
      const g = ctx.createLinearGradient(x0, y0, x0, y0 + len);
      g.addColorStop(0, 'rgba(85,12,8,0.75)');
      g.addColorStop(0.7, 'rgba(70,10,6,0.4)');
      g.addColorStop(1, 'rgba(60,8,5,0)');
      ctx.strokeStyle = g;
      ctx.lineCap = 'round';
      ctx.lineWidth = rr(4, 7);
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.bezierCurveTo(x0 + rr(-4, 4), y0 + len * 0.3, x0 + rr(-8, 2), y0 + len * 0.7, x0 + rr(-10, 0), y0 + len);
      ctx.stroke();
    }
    wrappedBlotch(ctx, W, H, W * 0.66, H * 0.36, 22, 'rgba(85,12,8,0.55)', 'rgba(85,12,8,0)');

    addNoise(ctx, W, H, 16);
    return this.finish(c, 'door', true, false);
  }

  /** Door name plate. */
  public static getDoorSignTexture(title: string, sub: string = ''): THREE.CanvasTexture {
    const key = `sign_${title}_${sub}`;
    const hit = this.cached(key);
    if (hit) return hit;
    const [c, ctx] = makeCanvas(512, 160);
    ctx.fillStyle = '#d8d6cc';
    ctx.fillRect(0, 0, 512, 160);
    ctx.fillStyle = '#1d4a6b';
    ctx.fillRect(0, 0, 512, 34);
    ctx.fillStyle = '#e8eef2';
    ctx.font = 'bold 20px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('HÔPITAL SAINT-AURORE', 256, 18);

    ctx.fillStyle = '#1b1b1b';
    let size = 44;
    ctx.font = `bold ${size}px Arial, sans-serif`;
    while (ctx.measureText(title).width > 470 && size > 18) {
      size -= 2;
      ctx.font = `bold ${size}px Arial, sans-serif`;
    }
    ctx.fillText(title, 256, sub ? 82 : 98);
    if (sub) {
      ctx.fillStyle = '#5a5a5a';
      ctx.font = '22px Arial, sans-serif';
      ctx.fillText(sub, 256, 128);
    }
    // Wear
    for (let i = 0; i < 18; i++) {
      wrappedBlotch(ctx, 512, 160, rand() * 512, rand() * 160, rr(8, 30), 'rgba(90,70,40,0.35)', 'rgba(90,70,40,0)');
    }
    addNoise(ctx, 512, 160, 18);
    return this.finish(c, key, true, false);
  }

  /** Glowing green emergency exit sign. */
  public static getExitSignTexture(): THREE.CanvasTexture {
    const hit = this.cached('exit');
    if (hit) return hit;
    const [c, ctx] = makeCanvas(512, 192);
    ctx.fillStyle = '#0d7a35';
    ctx.fillRect(0, 0, 512, 192);
    ctx.fillStyle = '#e9ffe9';
    ctx.font = 'bold 84px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('SORTIE', 300, 100);
    // Running man pictogram (simplified)
    ctx.fillStyle = '#e9ffe9';
    ctx.beginPath();
    ctx.arc(70, 52, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 14;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#e9ffe9';
    ctx.beginPath();
    ctx.moveTo(66, 74);
    ctx.lineTo(56, 118);
    ctx.lineTo(80, 150);
    ctx.moveTo(56, 118);
    ctx.lineTo(30, 150);
    ctx.moveTo(64, 84);
    ctx.lineTo(96, 100);
    ctx.moveTo(64, 84);
    ctx.lineTo(36, 96);
    ctx.stroke();
    return this.finish(c, 'exit', true, false);
  }

  /** Transparent blood splatter decal. */
  public static getBloodDecalTexture(variant = 0): THREE.CanvasTexture {
    const key = `blood_${variant}`;
    const hit = this.cached(key);
    if (hit) return hit;
    const S = 512;
    const [c, ctx] = makeCanvas(S, S);
    ctx.clearRect(0, 0, S, S);
    const col = (a: number) => `rgba(${rr(70, 95) | 0},${rr(6, 14) | 0},${rr(6, 12) | 0},${a})`;

    if (variant === 1) {
      // Drag trail
      ctx.fillStyle = col(0.75);
      for (let i = 0; i < 70; i++) {
        const t = i / 70;
        const x = S * 0.15 + t * S * 0.7;
        const y = S * 0.5 + Math.sin(t * 6) * 20;
        ctx.beginPath();
        ctx.ellipse(x, y, rr(10, 22), rr(18, 46) * (1 - t * 0.6), 0, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      // Pool + splatter
      ctx.fillStyle = col(0.85);
      ctx.beginPath();
      ctx.ellipse(S / 2, S / 2, S * 0.2, S * 0.16, rand(), 0, Math.PI * 2);
      ctx.fill();
      for (let i = 0; i < 16; i++) {
        ctx.beginPath();
        ctx.ellipse(S / 2 + rr(-90, 90), S / 2 + rr(-80, 80), rr(20, 60), rr(15, 45), rand() * 3, 0, Math.PI * 2);
        ctx.fill();
      }
      for (let i = 0; i < 60; i++) {
        const a = rand() * Math.PI * 2;
        const d = rr(S * 0.2, S * 0.46);
        ctx.fillStyle = col(rr(0.5, 0.9));
        ctx.beginPath();
        ctx.arc(S / 2 + Math.cos(a) * d, S / 2 + Math.sin(a) * d, rr(2, 9), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Darker dried edges
    ctx.globalCompositeOperation = 'source-atop';
    const g = ctx.createRadialGradient(S / 2, S / 2, S * 0.05, S / 2, S / 2, S * 0.5);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(20,0,0,0.6)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
    ctx.globalCompositeOperation = 'source-over';
    return this.finish(c, key, true, false);
  }

  /** Scattered paper sheet with fake typed lines. */
  public static getPaperTexture(): THREE.CanvasTexture {
    const hit = this.cached('paper');
    if (hit) return hit;
    const [c, ctx] = makeCanvas(128, 160);
    ctx.fillStyle = '#c9c3b0';
    ctx.fillRect(0, 0, 128, 160);
    ctx.fillStyle = 'rgba(40,40,40,0.55)';
    for (let y = 18; y < 150; y += 8) {
      ctx.fillRect(12, y, rr(60, 104), 2);
    }
    wrappedBlotch(ctx, 128, 160, rr(20, 100), rr(20, 140), 26, 'rgba(110,80,30,0.35)', 'rgba(110,80,30,0)');
    addNoise(ctx, 128, 160, 20);
    return this.finish(c, 'paper', true, false);
  }

  /** Biohazard / quarantine warning poster. */
  public static getBiohazardPosterTexture(): THREE.CanvasTexture {
    const hit = this.cached('biohazard');
    if (hit) return hit;
    const W = 256;
    const H = 360;
    const [c, ctx] = makeCanvas(W, H);
    ctx.fillStyle = '#c9a032';
    ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 20; i++) {
      wrappedBlotch(ctx, W, H, rand() * W, rand() * H, rr(20, 70), 'rgba(60,40,10,0.35)', 'rgba(60,40,10,0)');
    }

    ctx.fillStyle = '#16140f';
    ctx.fillRect(10, 10, W - 20, 44);
    ctx.fillStyle = '#ffd23a';
    ctx.font = 'bold 22px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('DANGER BIOLOGIQUE', W / 2, 33);

    // Biohazard trefoil
    ctx.save();
    ctx.translate(W / 2, 150);
    ctx.fillStyle = '#16140f';
    for (let i = 0; i < 3; i++) {
      ctx.save();
      ctx.rotate((i * Math.PI * 2) / 3);
      ctx.beginPath();
      ctx.arc(0, -34, 30, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#c9a032';
      ctx.beginPath();
      ctx.arc(0, -42, 21, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#16140f';
      ctx.restore();
    }
    ctx.beginPath();
    ctx.arc(0, 0, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#c9a032';
    ctx.beginPath();
    ctx.arc(0, 0, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = '#16140f';
    ctx.font = 'bold 17px monospace';
    ctx.fillText('ZONE DE QUARANTAINE', W / 2, 236);
    ctx.font = '14px monospace';
    ctx.fillText('PROTOCOLE AURORE', W / 2, 262);
    ctx.fillText('ACCÈS INTERDIT — NIVEAU 4', W / 2, 284);

    // Blood smear
    ctx.fillStyle = 'rgba(110,15,12,0.75)';
    ctx.beginPath();
    ctx.ellipse(180, 300, 26, 18, 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(170, 300, 10, 50);
    ctx.fillRect(186, 304, 6, 34);

    addNoise(ctx, W, H, 22);
    return this.finish(c, 'biohazard', true, false);
  }

  /** Scrawled warning written on a wall. */
  public static getGraffitiTexture(text: string): THREE.CanvasTexture {
    const key = `graffiti_${text}`;
    const hit = this.cached(key);
    if (hit) return hit;
    const [c, ctx] = makeCanvas(1024, 256);
    ctx.clearRect(0, 0, 1024, 256);
    ctx.font = 'bold 110px "Segoe Print", "Comic Sans MS", cursive';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(105,12,10,0.88)';
    ctx.save();
    ctx.translate(512, 128);
    ctx.rotate(-0.04);
    ctx.fillText(text, 0, 0);
    ctx.restore();
    // Drips running from the bottom of the letters
    const img = ctx.getImageData(0, 0, 1024, 256).data;
    for (let i = 0; i < 26; i++) {
      const x = Math.floor(rr(60, 960));
      let yStart = -1;
      for (let y = 200; y > 60; y--) {
        if (img[(y * 1024 + x) * 4 + 3] > 120) {
          yStart = y;
          break;
        }
      }
      if (yStart < 0) continue;
      const len = rr(15, 60);
      const g = ctx.createLinearGradient(0, yStart, 0, yStart + len);
      g.addColorStop(0, 'rgba(100,12,10,0.85)');
      g.addColorStop(1, 'rgba(100,12,10,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - 1.5, yStart - 2, 3, len);
      ctx.beginPath();
      ctx.arc(x, yStart + len * 0.85, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    return this.finish(c, key, true, false);
  }

  /** Front panel of the corridor vending machine (lit display of drinks). */
  public static getVendingTexture(): THREE.CanvasTexture {
    const hit = this.cached('vending');
    if (hit) return hit;
    const W = 256;
    const H = 512;
    const [c, ctx] = makeCanvas(W, H);
    ctx.fillStyle = '#0d1418';
    ctx.fillRect(0, 0, W, H);
    // Header
    const hg = ctx.createLinearGradient(0, 0, W, 0);
    hg.addColorStop(0, '#b3121b');
    hg.addColorStop(1, '#e0343c');
    ctx.fillStyle = hg;
    ctx.fillRect(10, 10, W - 20, 64);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 30px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('ZÉRO COLA', W / 2, 36);
    ctx.font = '13px Arial, sans-serif';
    ctx.fillText('BOISSONS FRAÎCHES', W / 2, 60);
    // Window with rows of cans
    ctx.fillStyle = '#9fd8ff';
    ctx.fillRect(14, 86, 170, 300);
    const colors = ['#c8141e', '#f0f0f0', '#1f6fd1', '#f4b400', '#1a9e4b'];
    for (let row = 0; row < 5; row++) {
      ctx.fillStyle = 'rgba(30,40,50,0.6)';
      ctx.fillRect(14, 86 + row * 60 + 50, 170, 6);
      for (let i = 0; i < 6; i++) {
        if (rand() < 0.18) continue; // some slots already empty
        const x = 22 + i * 27;
        const y = 86 + row * 60 + 10;
        ctx.fillStyle = colors[(row + i) % colors.length];
        ctx.fillRect(x, y, 20, 40);
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.fillRect(x + 3, y + 2, 4, 36);
        ctx.fillStyle = '#bbb';
        ctx.fillRect(x, y, 20, 4);
      }
    }
    // Glass reflection
    const rg = ctx.createLinearGradient(14, 86, 184, 386);
    rg.addColorStop(0, 'rgba(255,255,255,0.25)');
    rg.addColorStop(0.4, 'rgba(255,255,255,0)');
    ctx.fillStyle = rg;
    ctx.fillRect(14, 86, 170, 300);
    // Keypad + coin slot
    ctx.fillStyle = '#222';
    ctx.fillRect(194, 96, 50, 150);
    ctx.fillStyle = '#39ff8a';
    ctx.fillRect(200, 104, 38, 16);
    ctx.fillStyle = '#0a0a0a';
    ctx.font = 'bold 12px monospace';
    ctx.fillText('0,50€', 219, 113);
    for (let r = 0; r < 4; r++) {
      for (let k = 0; k < 3; k++) {
        ctx.fillStyle = '#9a9a9a';
        ctx.fillRect(200 + k * 13, 130 + r * 18, 10, 12);
      }
    }
    ctx.fillStyle = '#000';
    ctx.fillRect(214, 210, 10, 26);
    // Dispenser tray
    ctx.fillStyle = '#050505';
    ctx.fillRect(30, 410, 150, 60);
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 3;
    ctx.strokeRect(30, 410, 150, 60);
    ctx.fillStyle = '#ccc';
    ctx.font = 'bold 12px Arial, sans-serif';
    ctx.fillText('POUSSER', 105, 440);
    // Grime / stickers
    for (let i = 0; i < 18; i++) {
      wrappedBlotch(ctx, W, H, rand() * W, rand() * H, rr(10, 40), 'rgba(20,15,10,0.35)', 'rgba(20,15,10,0)');
    }
    ctx.fillStyle = 'rgba(240,230,120,0.9)';
    ctx.save();
    ctx.translate(205, 300);
    ctx.rotate(-0.2);
    ctx.fillRect(-26, -12, 52, 24);
    ctx.fillStyle = '#222';
    ctx.font = 'bold 10px Arial, sans-serif';
    ctx.fillText('EN PANNE ?', 0, 0);
    ctx.restore();
    addNoise(ctx, W, H, 12);
    return this.finish(c, 'vending', true, false);
  }

  /** "ZÉRO Cola" can label (wraps around the cylinder). */
  public static getCanTexture(): THREE.CanvasTexture {
    const hit = this.cached('can');
    if (hit) return hit;
    const [c, ctx] = makeCanvas(256, 128);
    ctx.fillStyle = '#c8141e';
    ctx.fillRect(0, 0, 256, 128);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 8;
    ctx.beginPath();
    for (let x = 0; x <= 256; x += 4) {
      const y = 78 + Math.sin((x / 256) * Math.PI * 4) * 10;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 30px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('ZÉRO', 64, 44);
    ctx.fillText('ZÉRO', 192, 44);
    ctx.fillStyle = '#9a9a9a';
    ctx.fillRect(0, 0, 256, 8);
    ctx.fillRect(0, 120, 256, 8);
    return this.finish(c, 'can', true, false);
  }

  /** Soft round sprite for dust particles. */
  public static getDustSprite(): THREE.CanvasTexture {
    const hit = this.cached('dust');
    if (hit) return hit;
    const [c, ctx] = makeCanvas(64, 64);
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.4, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    return this.finish(c, 'dust', true, false);
  }

  /** Mottled, veined necrotic skin. */
  public static getMonsterSkinTexture(): THREE.CanvasTexture {
    const hit = this.cached('monsterskin');
    if (hit) return hit;
    const S = 512;
    const [c, ctx] = makeCanvas(S, S);
    ctx.fillStyle = '#8e9387';
    ctx.fillRect(0, 0, S, S);
    for (let i = 0; i < 50; i++) {
      wrappedBlotch(ctx, S, S, rand() * S, rand() * S, rr(15, 70), `rgba(${rand() > 0.5 ? '70,60,70' : '120,110,95'},0.35)`, 'rgba(0,0,0,0)');
    }
    // Bruises / necrosis
    for (let i = 0; i < 12; i++) {
      wrappedBlotch(ctx, S, S, rand() * S, rand() * S, rr(20, 60), 'rgba(55,25,40,0.6)', 'rgba(55,25,40,0)');
    }
    // Veins
    ctx.strokeStyle = 'rgba(40,30,55,0.75)';
    for (let i = 0; i < 40; i++) {
      ctx.lineWidth = rr(0.8, 2.6);
      crackLine(ctx, rand() * S, rand() * S, 10, rr(8, 20));
    }
    // Open sores
    for (let i = 0; i < 8; i++) {
      wrappedBlotch(ctx, S, S, rand() * S, rand() * S, rr(6, 16), 'rgba(90,10,10,0.9)', 'rgba(90,10,10,0)');
    }
    addNoise(ctx, S, S, 20);
    return this.finish(c, 'monsterskin');
  }

  /** Dirty torn hospital gown fabric. */
  public static getGownTexture(): THREE.CanvasTexture {
    const hit = this.cached('gown');
    if (hit) return hit;
    const S = 256;
    const [c, ctx] = makeCanvas(S, S);
    ctx.fillStyle = '#7f9196';
    ctx.fillRect(0, 0, S, S);
    // Small diamond print
    ctx.fillStyle = 'rgba(40,60,80,0.35)';
    for (let y = 0; y < S; y += 16) {
      for (let x = (y / 16) % 2 ? 8 : 0; x < S; x += 16) {
        ctx.fillRect(x, y, 3, 3);
      }
    }
    for (let i = 0; i < 14; i++) {
      wrappedBlotch(ctx, S, S, rand() * S, rand() * S, rr(14, 50), 'rgba(80,20,15,0.55)', 'rgba(80,20,15,0)');
    }
    for (let i = 0; i < 14; i++) {
      wrappedBlotch(ctx, S, S, rand() * S, rand() * S, rr(14, 50), 'rgba(50,45,30,0.45)', 'rgba(50,45,30,0)');
    }
    addNoise(ctx, S, S, 18);
    return this.finish(c, 'gown');
  }
}
