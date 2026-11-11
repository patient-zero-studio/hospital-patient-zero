/**
 * Procedurally painted screamer face (no external image).
 * Generated once, then reused as a data URL.
 */
let cached: string | null = null;

export const getScreamerFace = (): string => {
  if (cached) return cached;
  const W = 768;
  const H = 768;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  let seed = 666;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  // Black void
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);

  const cx = W / 2;
  const cy = H * 0.5;

  // Elongated, sunken skull
  const skin = ctx.createRadialGradient(cx, cy - 60, 40, cx, cy, 380);
  skin.addColorStop(0, '#c9c7b8');
  skin.addColorStop(0.55, '#8a8a7a');
  skin.addColorStop(1, '#1a1a16');
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.ellipse(cx, cy, 250, 350, 0, 0, Math.PI * 2);
  ctx.fill();

  // Hollow cheeks
  for (const s of [-1, 1]) {
    const g = ctx.createRadialGradient(cx + s * 150, cy + 70, 10, cx + s * 150, cy + 70, 120);
    g.addColorStop(0, 'rgba(20,18,15,0.85)');
    g.addColorStop(1, 'rgba(20,18,15,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx + s * 150, cy + 70, 120, 0, Math.PI * 2);
    ctx.fill();
  }

  // Black-veined skin
  ctx.strokeStyle = 'rgba(40,20,45,0.65)';
  for (let i = 0; i < 70; i++) {
    ctx.lineWidth = 0.8 + rnd() * 2.2;
    let x = cx + (rnd() - 0.5) * 420;
    let y = cy + (rnd() - 0.5) * 600;
    ctx.beginPath();
    ctx.moveTo(x, y);
    let a = rnd() * Math.PI * 2;
    for (let j = 0; j < 9; j++) {
      a += (rnd() - 0.5) * 1.4;
      x += Math.cos(a) * 18;
      y += Math.sin(a) * 18;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // Huge black eye sockets with tiny burning pupils
  for (const s of [-1, 1]) {
    const ex = cx + s * 100;
    const ey = cy - 110;
    const g = ctx.createRadialGradient(ex, ey, 10, ex, ey, 95);
    g.addColorStop(0, '#000');
    g.addColorStop(0.7, 'rgba(0,0,0,0.95)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(ex, ey, 85, 100, s * 0.2, 0, Math.PI * 2);
    ctx.fill();
    const p = ctx.createRadialGradient(ex, ey + 10, 0, ex, ey + 10, 22);
    p.addColorStop(0, '#fff3d0');
    p.addColorStop(0.3, '#ff3010');
    p.addColorStop(1, 'rgba(255,0,0,0)');
    ctx.fillStyle = p;
    ctx.beginPath();
    ctx.arc(ex, ey + 10, 22, 0, Math.PI * 2);
    ctx.fill();
    // Bloody tears
    ctx.fillStyle = 'rgba(110,8,6,0.9)';
    ctx.fillRect(ex - 6 + s * 10, ey + 70, 10, 120 + rnd() * 80);
  }

  // Unhinged screaming mouth
  const my = cy + 190;
  ctx.fillStyle = '#050000';
  ctx.beginPath();
  ctx.ellipse(cx, my, 120, 175, 0, 0, Math.PI * 2);
  ctx.fill();
  const throat = ctx.createRadialGradient(cx, my + 30, 5, cx, my + 30, 120);
  throat.addColorStop(0, '#3a0000');
  throat.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = throat;
  ctx.beginPath();
  ctx.ellipse(cx, my + 30, 90, 130, 0, 0, Math.PI * 2);
  ctx.fill();
  // Jagged teeth (top and bottom)
  ctx.fillStyle = '#d8cfae';
  for (let i = 0; i < 11; i++) {
    const a = Math.PI + (i / 10) * Math.PI;
    const tx = cx + Math.cos(a) * 112;
    const ty = my + Math.sin(a) * 160;
    ctx.beginPath();
    ctx.moveTo(tx - 9, ty);
    ctx.lineTo(tx + 9, ty);
    ctx.lineTo(tx + (rnd() - 0.5) * 8, ty + 30 + rnd() * 25);
    ctx.fill();
    const by = my - Math.sin(a) * 160;
    ctx.beginPath();
    ctx.moveTo(tx - 9, by);
    ctx.lineTo(tx + 9, by);
    ctx.lineTo(tx + (rnd() - 0.5) * 8, by - 30 - rnd() * 25);
    ctx.fill();
  }

  // Blood smears
  for (let i = 0; i < 14; i++) {
    const x = cx + (rnd() - 0.5) * 480;
    const y = cy + (rnd() - 0.2) * 520;
    const g = ctx.createRadialGradient(x, y, 2, x, y, 30 + rnd() * 50);
    g.addColorStop(0, 'rgba(120,6,4,0.8)');
    g.addColorStop(1, 'rgba(120,6,4,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, 80, 0, Math.PI * 2);
    ctx.fill();
  }

  // Film grain
  const img = ctx.getImageData(0, 0, W, H);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rnd() - 0.5) * 50;
    img.data[i] = Math.max(0, Math.min(255, img.data[i] + n));
    img.data[i + 1] = Math.max(0, Math.min(255, img.data[i + 1] + n));
    img.data[i + 2] = Math.max(0, Math.min(255, img.data[i + 2] + n));
  }
  ctx.putImageData(img, 0, 0);

  cached = c.toDataURL('image/jpeg', 0.85);
  return cached;
};
