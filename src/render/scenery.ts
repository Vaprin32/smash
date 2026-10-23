// The world around the fight, render-only: a night sky with stars, a moon
// and drifting clouds; snowy mountains; a castle on a hill; hills with a pine
// forest and a village; mist; and the stage itself, a stone rampart with
// moss, ivy, arrow slits, banners and torches, with wooden platforms hung
// with lanterns. Static parts are painted once into offscreen canvases from
// a fixed seed (so the world always looks the same) and then drawn with
// parallax; flames, embers, flags, mist and lantern light are drawn live.

import { ONE } from '../sim/fixed';
import type { StageDef } from '../sim/stage';

/** What the background needs from a camera (world point at the screen center, and zoom). */
export interface View3 {
  x: number;
  y: number;
  zoom: number;
}

type Ctx = CanvasRenderingContext2D;

/** Seeded PRNG (mulberry32): the same scenery every time. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** An offscreen canvas `w` x `h` layer units at `res` pixels per unit, with the context scaled to units. */
function canvas(w: number, h: number, res: number): { c: HTMLCanvasElement; g: Ctx } {
  const c = document.createElement('canvas');
  c.width = Math.ceil(w * res);
  c.height = Math.ceil(h * res);
  const g = c.getContext('2d')!;
  g.scale(res, res);
  return { c, g };
}

const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------
// Parallax layers. A layer at `depth` (0 = infinitely far, 1 = the stage)
// moves that fraction of the camera's motion. Layer units: y = 0 is that
// layer's ground line, which sits just above the stage on screen.

function layerTransform(ctx: Ctx, cam: View3, w: number, h: number, depth: number): { s: number; ox: number; oy: number } {
  const s = cam.zoom * (0.45 + depth * 0.55);
  const ox = w / 2 - cam.x * cam.zoom * depth;
  const oy = h / 2 + (150 - cam.y * depth) * cam.zoom * 0.62;
  ctx.setTransform(s, 0, 0, s, ox, oy);
  return { s, ox, oy };
}

interface Tile {
  c: HTMLCanvasElement;
  /** Tile width and the vertical span it covers, in layer units. */
  w: number;
  top: number;
  bottom: number;
  /** Fill below the tile down to the screen bottom. */
  base: string;
}

/** Draw a horizontally repeating layer across the screen. */
function drawTiled(ctx: Ctx, cam: View3, w: number, h: number, depth: number, t: Tile, shift = 0): void {
  const { s, ox, oy } = layerTransform(ctx, cam, w, h, depth);
  const left = -ox / s - shift, right = (w - ox) / s - shift;
  for (let k = Math.floor(left / t.w); k * t.w < right; k++) ctx.drawImage(t.c, k * t.w + shift, t.top, t.w, t.bottom - t.top);
  const bottomY = (h - oy) / s;
  if (bottomY > t.bottom) {
    ctx.fillStyle = t.base;
    ctx.fillRect(left + shift - 2, t.bottom - 1, right - left + 4, bottomY - t.bottom + 2);
  }
}

// --- Sky ---------------------------------------------------------------------

const STARS = (() => {
  const r = rng(7);
  return Array.from({ length: 240 }, () => ({ x: r(), y: r() * r() * 0.7, s: 0.4 + r() * r() * 1.6, tw: r() < 0.25 ? r() * TAU : -1 }));
})();

function drawSky(ctx: Ctx, cam: View3, w: number, h: number, time: number, moon: readonly [number, number]): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#070b22');
  sky.addColorStop(0.42, '#1b1d44');
  sky.addColorStop(0.68, '#4a3156');
  sky.addColorStop(0.86, '#8a4c55');
  sky.addColorStop(1, '#c47b52');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  const u = Math.min(w, h) / 900;
  ctx.fillStyle = '#fff6e6';
  for (const st of STARS) {
    const a = st.tw >= 0 ? 0.45 + 0.55 * Math.sin(time * 0.003 + st.tw) : 0.75;
    ctx.globalAlpha = a * (1 - st.y);
    ctx.fillRect(st.x * w - cam.x * cam.zoom * 0.01, st.y * h, st.s * u * 1.4, st.s * u * 1.4);
  }
  ctx.globalAlpha = 1;

  // Moon with a halo and maria.
  const mx = w * moon[0] - cam.x * cam.zoom * 0.02, my = h * moon[1], mr = 42 * u;
  const halo = ctx.createRadialGradient(mx, my, mr * 0.8, mx, my, mr * 6);
  halo.addColorStop(0, 'rgba(255,236,205,0.32)');
  halo.addColorStop(1, 'rgba(255,236,205,0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(mx, my, mr * 6, 0, TAU);
  ctx.fill();
  const disc = ctx.createRadialGradient(mx - mr * 0.35, my - mr * 0.35, mr * 0.1, mx, my, mr);
  disc.addColorStop(0, '#fffaf0');
  disc.addColorStop(1, '#e8d9b8');
  ctx.fillStyle = disc;
  ctx.beginPath();
  ctx.arc(mx, my, mr, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(150,140,125,0.28)';
  for (const [dx, dy, rr] of [[-0.3, -0.2, 0.28], [0.25, 0.1, 0.2], [-0.05, 0.35, 0.16], [0.35, -0.35, 0.1], [-0.45, 0.25, 0.12]] as const) {
    ctx.beginPath();
    ctx.arc(mx + dx * mr, my + dy * mr, rr * mr, 0, TAU);
    ctx.fill();
  }
}

// --- Clouds ------------------------------------------------------------------

let clouds: { c: HTMLCanvasElement; w: number; h: number }[] | null = null;

function cloudSprites(): { c: HTMLCanvasElement; w: number; h: number }[] {
  if (clouds) return clouds;
  const r = rng(11);
  clouds = Array.from({ length: 5 }, () => {
    const cw = 460 + r() * 320, ch = 240;
    const { c, g } = canvas(cw, ch, 1);
    /** Soft puffs along the cloud, kept inside the canvas so no edge shows. */
    const puffs = (n: number, lift: number, size: number, inner: string, outer: string) => {
      for (let i = 0; i < n; i++) {
        const u = 0.12 + r() * 0.76;
        const profile = Math.sin(u * Math.PI);
        const x = cw * u, y = ch * 0.62 - profile * 50 * lift + (r() - 0.5) * 24;
        const rad = Math.min((26 + r() * 46) * (0.5 + profile * 0.5) * size, x, cw - x, y, ch - y);
        if (rad < 6) continue;
        const grad = g.createRadialGradient(x, y, 0, x, y, rad);
        grad.addColorStop(0, inner);
        grad.addColorStop(1, outer);
        g.fillStyle = grad;
        g.beginPath();
        g.arc(x, y, rad, 0, TAU);
        g.fill();
      }
    };
    puffs(26, 0.6, 1.1, 'rgba(40,30,62,0.16)', 'rgba(40,30,62,0)'); // shadowed underside
    puffs(34, 1, 1, 'rgba(150,135,185,0.16)', 'rgba(150,135,185,0)');
    puffs(18, 1.25, 0.7, 'rgba(232,222,248,0.13)', 'rgba(232,222,248,0)'); // moonlit tops
    return { c, w: cw, h: ch };
  });
  return clouds;
}

function drawClouds(ctx: Ctx, cam: View3, w: number, h: number, time: number): void {
  const { s, ox } = layerTransform(ctx, cam, w, h, 0.04);
  const span = 3600;
  const left = -ox / s;
  cloudSprites().forEach((cl, i) => {
    const base = i * 760 + time * 0.006 * (1 + i * 0.15);
    const x = ((((base - left) % span) + span) % span) + left - 600;
    ctx.drawImage(cl.c, x, -600 + (i % 3) * 95 - cl.h / 2, cl.w, cl.h);
  });
}

// --- Mountains ---------------------------------------------------------------

let mountains: Tile[] | null = null;

/** A periodic ridge line over `tw` units: sum of sines with integer frequencies, sharpened into peaks. */
function ridge(tw: number, seed: number, height: number): (x: number) => number {
  const r = rng(seed);
  const waves = [1, 2, 3, 5, 8, 13].map((k, i) => ({ k, a: 1 / (i + 1) ** 0.9, p: r() * TAU }));
  return (x) => {
    let v = 0;
    for (const wv of waves) v += wv.a * Math.sin((TAU * wv.k * x) / tw + wv.p);
    const peak = Math.pow(Math.max(0, (v + 2.6) / 5.2), 1.7);
    return -peak * height;
  };
}

function paintRange(g: Ctx, tw: number, f: (x: number) => number, rock: string, rockLit: string, snow: string, haze: string, bottom: number): void {
  const pts: [number, number][] = [];
  for (let x = 0; x <= tw; x += 6) pts.push([x, f(x)]);
  const outline = () => {
    g.beginPath();
    g.moveTo(0, bottom);
    for (const [x, y] of pts) g.lineTo(x, y);
    g.lineTo(tw, bottom);
    g.closePath();
  };
  outline();
  const fill = g.createLinearGradient(0, -400, 0, bottom);
  fill.addColorStop(0, rockLit);
  fill.addColorStop(0.55, rock);
  fill.addColorStop(1, haze);
  g.fillStyle = fill;
  g.fill();
  g.save();
  outline();
  g.clip();
  // Moonlit slopes (facing right) and snow on the high ground.
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1]!, [x1, y1] = pts[i]!;
    if (y1 < y0) continue;
    g.fillStyle = 'rgba(210,205,240,0.07)';
    g.beginPath();
    g.moveTo(x0, y0);
    g.lineTo(x1, y1);
    g.lineTo(x1 - 40, y1 + 160);
    g.lineTo(x0 - 40, y0 + 160);
    g.fill();
  }
  g.fillStyle = snow;
  g.beginPath();
  g.moveTo(0, 0);
  for (const [x, y] of pts) g.lineTo(x, y);
  for (let i = pts.length - 1; i >= 0; i--) {
    const [x, y] = pts[i]!;
    const line = -230 + Math.sin(x * 0.05) * 14 + Math.sin(x * 0.013) * 22;
    g.lineTo(x, Math.max(y, Math.min(line, y + 60)));
  }
  g.closePath();
  g.fill();
  g.restore();
}

function mountainTiles(): Tile[] {
  if (mountains) return mountains;
  const tw = 2600, top = -480, bottom = 260;
  const far = canvas(tw, bottom - top, 0.6);
  far.g.translate(0, -top);
  paintRange(far.g, tw, ridge(tw, 3, 430), '#4a4870', '#6b6894', 'rgba(222,224,245,0.75)', '#6f5370', bottom);
  const near = canvas(tw, bottom - top, 0.6);
  near.g.translate(0, -top);
  paintRange(near.g, tw, (x) => ridge(tw, 5, 300)(x) + 60, '#36334f', '#4c4870', 'rgba(205,208,235,0.6)', '#4c3550', bottom);
  mountains = [
    { c: far.c, w: tw, top, bottom, base: '#6f5370' },
    { c: near.c, w: tw, top, bottom, base: '#4c3550' },
  ];
  return mountains;
}

// --- Castle ------------------------------------------------------------------

interface CastleArt {
  c: HTMLCanvasElement;
  left: number;
  top: number;
  w: number;
  h: number;
  /** Flagpole tips, in layer units. */
  flags: { x: number; y: number; color: string }[];
}

let castle: CastleArt | null = null;

function castleArt(): CastleArt {
  if (castle) return castle;
  const left = -700, top = -420, w = 1400, h = 620;
  const { c, g } = canvas(w, h, 1.3);
  g.translate(-left, -top);
  const r = rng(21);
  const flags: CastleArt['flags'] = [];
  const WALL = '#3a3452', LIT = '#544c72', DARK = '#29243d', ROOF = '#2b2033', ROOF_LIT = '#4a3546';

  // The hill.
  const hill = g.createLinearGradient(0, -40, 0, 200);
  hill.addColorStop(0, '#2c2a3c');
  hill.addColorStop(1, '#3b2c40');
  g.fillStyle = hill;
  g.beginPath();
  g.moveTo(-700, 200);
  g.bezierCurveTo(-520, 40, -300, -10, 0, -14);
  g.bezierCurveTo(320, -10, 520, 50, 700, 200);
  g.closePath();
  g.fill();

  /** A block of masonry: lit on its right edge, with faint courses. */
  const block = (x: number, y: number, bw: number, bh: number) => {
    const grad = g.createLinearGradient(x, 0, x + bw, 0);
    grad.addColorStop(0, DARK);
    grad.addColorStop(0.6, WALL);
    grad.addColorStop(1, LIT);
    g.fillStyle = grad;
    g.fillRect(x, y, bw, bh);
    g.strokeStyle = 'rgba(0,0,0,0.18)';
    g.lineWidth = 0.8;
    for (let cy = y + 9; cy < y + bh; cy += 9) {
      g.beginPath();
      g.moveTo(x, cy);
      g.lineTo(x + bw, cy);
      g.stroke();
    }
  };
  const battlements = (x: number, y: number, bw: number) => {
    for (let mx = x; mx < x + bw - 4; mx += 14) block(mx, y - 9, Math.min(8, x + bw - mx), 9);
  };
  const window_ = (x: number, y: number, ww: number, wh: number, lit: boolean) => {
    if (lit) {
      const glow = g.createRadialGradient(x + ww / 2, y + wh / 2, 0, x + ww / 2, y + wh / 2, wh * 2.2);
      glow.addColorStop(0, 'rgba(255,190,100,0.35)');
      glow.addColorStop(1, 'rgba(255,170,80,0)');
      g.fillStyle = glow;
      g.fillRect(x - wh * 2, y - wh * 2, ww + wh * 4, wh * 5);
    }
    g.fillStyle = lit ? '#ffcf7a' : '#151222';
    g.beginPath();
    g.moveTo(x, y + wh);
    g.lineTo(x, y + ww / 2);
    g.arc(x + ww / 2, y + ww / 2, ww / 2, Math.PI, 0);
    g.lineTo(x + ww, y + wh);
    g.closePath();
    g.fill();
  };
  const cone = (cx: number, y: number, bw: number, rh: number) => {
    const grad = g.createLinearGradient(cx - bw / 2, 0, cx + bw / 2, 0);
    grad.addColorStop(0, ROOF);
    grad.addColorStop(0.65, ROOF);
    grad.addColorStop(1, ROOF_LIT);
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(cx - bw / 2 - 5, y);
    g.lineTo(cx, y - rh);
    g.lineTo(cx + bw / 2 + 5, y);
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.25)';
    for (let i = 1; i < 5; i++) {
      g.beginPath();
      g.moveTo(cx - (bw / 2 + 5) * (1 - i / 5) * 0.999, y - rh * (i / 5));
      g.lineTo(cx + (bw / 2 + 5) * (1 - i / 5), y - rh * (i / 5));
      g.stroke();
    }
    g.strokeStyle = '#1a141f';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(cx, y - rh);
    g.lineTo(cx, y - rh - 22);
    g.stroke();
    flags.push({ x: cx, y: y - rh - 22, color: '' });
  };
  const tower = (cx: number, bw: number, th: number, roof: number) => {
    const y = -th;
    block(cx - bw / 2, y, bw, th);
    for (let wy = y + 24; wy < -30; wy += 40) window_(cx - 4, wy, 8, 14, r() < 0.55);
    if (roof > 0) cone(cx, y, bw, roof);
    else battlements(cx - bw / 2 - 3, y, bw + 6);
  };

  // Curtain wall, then towers from back to front.
  block(-380, -95, 760, 95);
  battlements(-380, -95, 760);
  for (let x = -350; x < 350; x += 46) if (r() < 0.5) window_(x, -70, 7, 12, r() < 0.4);
  tower(-60, 26, 300, 80); // slender spire
  tower(0, 130, 235, 0); // keep
  block(-20, -295, 40, 60);
  cone(0, -295, 40, 70);
  for (let wy = -205; wy < -40; wy += 34) for (const wx of [-44, -10, 24]) window_(wx, wy, 9, 16, r() < 0.5);
  tower(-175, 52, 150, 0);
  tower(175, 52, 150, 0);
  tower(-365, 64, 175, 74);
  tower(365, 64, 175, 74);
  // Gatehouse with an arched gate and a warm glow inside.
  block(70, -118, 84, 118);
  battlements(68, -118, 88);
  g.fillStyle = '#120e18';
  g.beginPath();
  g.moveTo(94, 0);
  g.lineTo(94, -38);
  g.arc(112, -38, 18, Math.PI, 0);
  g.lineTo(130, 0);
  g.fill();
  const gate = g.createLinearGradient(0, -50, 0, 0);
  gate.addColorStop(0, 'rgba(255,170,90,0)');
  gate.addColorStop(1, 'rgba(255,170,90,0.35)');
  g.fillStyle = gate;
  g.fillRect(94, -50, 36, 50);
  // Winding road up the hill.
  g.strokeStyle = 'rgba(150,120,110,0.25)';
  g.lineWidth = 7;
  g.beginPath();
  g.moveTo(112, 0);
  g.bezierCurveTo(160, 40, 40, 70, 120, 120);
  g.bezierCurveTo(200, 160, 120, 190, 180, 200);
  g.stroke();

  const colors = ['#9e2b25', '#24477f', '#b8862b', '#2f6b3a'];
  flags.forEach((f, i) => (f.color = colors[i % colors.length]!));
  castle = { c, left, top, w, h, flags };
  return castle;
}

function drawCastle(ctx: Ctx, cam: View3, w: number, h: number, time: number): void {
  const art = castleArt();
  layerTransform(ctx, cam, w, h, 0.16);
  ctx.translate(-160, -20);
  ctx.drawImage(art.c, art.left, art.top, art.w, art.h);
  // Pennants on the spires.
  for (const [i, f] of art.flags.entries()) {
    ctx.fillStyle = f.color;
    ctx.beginPath();
    ctx.moveTo(f.x, f.y);
    for (let k = 0; k <= 6; k++) {
      const x = f.x + k * 3.4;
      ctx.lineTo(x, f.y + Math.sin(time * 0.006 + k * 0.9 + i) * 1.6 * (k / 6));
    }
    for (let k = 6; k >= 0; k--) {
      const x = f.x + k * 3.4;
      ctx.lineTo(x, f.y + 8 - k * 0.9 + Math.sin(time * 0.006 + k * 0.9 + i) * 1.6 * (k / 6));
    }
    ctx.closePath();
    ctx.fill();
  }
}

// --- Hills, forest and village ------------------------------------------------

let hills: Tile | null = null;
let nearWood: Tile | null = null;

function pine(g: Ctx, x: number, y: number, ph: number, dark: string, lit: string): void {
  const tiers = 4;
  for (let t = 0; t < tiers; t++) {
    const ty = y - ph * (0.25 + (t / tiers) * 0.75);
    const tw = ph * 0.32 * (1 - t / (tiers + 1.5));
    g.fillStyle = dark;
    g.beginPath();
    g.moveTo(x - tw, ty + ph * 0.28);
    g.lineTo(x, ty - ph * 0.18);
    g.lineTo(x + tw, ty + ph * 0.28);
    g.closePath();
    g.fill();
    g.fillStyle = lit;
    g.beginPath();
    g.moveTo(x, ty - ph * 0.18);
    g.lineTo(x + tw, ty + ph * 0.28);
    g.lineTo(x + tw * 0.45, ty + ph * 0.24);
    g.closePath();
    g.fill();
  }
  g.fillStyle = '#1a1412';
  g.fillRect(x - ph * 0.025, y - ph * 0.25, ph * 0.05, ph * 0.25);
}

function house(g: Ctx, x: number, y: number, r: () => number): void {
  const hw = 26 + r() * 22, hh = 18 + r() * 10, roof = 16 + r() * 10;
  const wall = g.createLinearGradient(x, 0, x + hw, 0);
  wall.addColorStop(0, '#3e3640');
  wall.addColorStop(1, '#5a4e52');
  g.fillStyle = wall;
  g.fillRect(x, y - hh, hw, hh);
  // Timber framing.
  g.strokeStyle = '#1e1618';
  g.lineWidth = 1.4;
  g.strokeRect(x, y - hh, hw, hh);
  g.beginPath();
  g.moveTo(x, y - hh / 2);
  g.lineTo(x + hw, y - hh / 2);
  for (let bx = x + 9; bx < x + hw - 4; bx += 9) {
    g.moveTo(bx, y - hh);
    g.lineTo(bx, y);
  }
  g.stroke();
  // Thatched roof.
  g.fillStyle = '#3a2a24';
  g.beginPath();
  g.moveTo(x - 5, y - hh);
  g.lineTo(x + hw / 2, y - hh - roof);
  g.lineTo(x + hw + 5, y - hh);
  g.closePath();
  g.fill();
  g.strokeStyle = 'rgba(120,90,60,0.35)';
  g.lineWidth = 0.7;
  for (let k = 1; k < 4; k++) {
    g.beginPath();
    g.moveTo(x - 5 + k * 2, y - hh - (roof * k) / 6);
    g.lineTo(x + hw + 5 - k * 2, y - hh - (roof * k) / 6);
    g.stroke();
  }
  // Chimney and a lit window or two.
  g.fillStyle = '#2a2224';
  g.fillRect(x + hw * 0.7, y - hh - roof * 0.8, 5, roof * 0.6);
  for (const wx of [x + hw * 0.22, x + hw * 0.62]) {
    if (r() < 0.25) continue;
    const glow = g.createRadialGradient(wx + 3, y - hh * 0.35, 0, wx + 3, y - hh * 0.35, 22);
    glow.addColorStop(0, 'rgba(255,180,90,0.4)');
    glow.addColorStop(1, 'rgba(255,170,80,0)');
    g.fillStyle = glow;
    g.fillRect(wx - 20, y - hh - 20, 46, 46);
    g.fillStyle = '#ffc56e';
    g.fillRect(wx, y - hh * 0.55, 6, 7);
  }
}

function hillTile(): Tile {
  if (hills) return hills;
  const tw = 2000, top = -260, bottom = 220;
  const { c, g } = canvas(tw, bottom - top, 0.85);
  g.translate(0, -top);
  const r = rng(31);
  const ground = (x: number) => -40 + Math.sin((x / tw) * TAU * 2 + 1) * 34 + Math.sin((x / tw) * TAU * 5) * 12;
  const fill = g.createLinearGradient(0, -80, 0, bottom);
  fill.addColorStop(0, '#2a2a3a');
  fill.addColorStop(1, '#221c2a');
  g.fillStyle = fill;
  g.beginPath();
  g.moveTo(0, bottom);
  for (let x = 0; x <= tw; x += 8) g.lineTo(x, ground(x));
  g.lineTo(tw, bottom);
  g.closePath();
  g.fill();
  // Village clusters and forest; anything near an edge is drawn on both sides so the tile repeats seamlessly.
  const both = (x: number, draw: (x: number) => void) => {
    draw(x);
    if (x < 120) draw(x + tw);
    if (x > tw - 120) draw(x - tw);
  };
  const villages = [260, 1180];
  for (let i = 0; i < 260; i++) {
    const x = r() * tw;
    if (villages.some((v) => Math.abs(x - v) < 120)) continue;
    const ph = 34 + r() * 46;
    both(x, (xx) => pine(g, xx, ground(xx) + 6 + r() * 26, ph, '#1b2526', '#2c3b3c'));
  }
  for (const v of villages) {
    for (let k = 0; k < 7; k++) {
      const x = v - 110 + k * 32 + r() * 10;
      both(x, (xx) => house(g, xx, ground(xx) + 12 + (k % 2) * 6, r));
    }
  }
  hills = { c, w: tw, top, bottom, base: '#221c2a' };
  return hills;
}

function nearWoodTile(): Tile {
  if (nearWood) return nearWood;
  const tw = 1500, top = -60, bottom = 320;
  const { c, g } = canvas(tw, bottom - top, 1);
  g.translate(0, -top);
  const r = rng(41);
  g.fillStyle = '#0e1114';
  g.fillRect(0, 150, tw, bottom - 150);
  for (let i = 0; i < 70; i++) {
    const x = r() * tw, ph = 120 + r() * 140;
    for (const xx of [x, x - tw, x + tw]) pine(g, xx, 200 + r() * 30, ph, '#0d1214', '#152024');
  }
  nearWood = { c, w: tw, top, bottom, base: '#0e1114' };
  return nearWood;
}

function drawMist(ctx: Ctx, cam: View3, w: number, h: number, depth: number, y: number, alpha: number, time: number): void {
  const { s, ox } = layerTransform(ctx, cam, w, h, depth);
  const left = -ox / s, right = (w - ox) / s;
  const step = 420;
  const drift = (time * 0.01) % step;
  for (let x = Math.floor(left / step) * step - step + drift; x < right + step; x += step) {
    const k = Math.sin(x * 0.013) * 0.5 + 0.5;
    ctx.save();
    ctx.translate(x, y + Math.sin(x * 0.007) * 12);
    ctx.scale(1, 0.18);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 380);
    g.addColorStop(0, `rgba(190,180,215,${(alpha * (0.6 + k * 0.4)).toFixed(3)})`);
    g.addColorStop(1, 'rgba(190,180,215,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 380, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
}

/** Everything behind the stage, in screen space. `moon`: its position as fractions of the screen. */
export function drawBackground(ctx: Ctx, cam: View3, w: number, h: number, time: number, moon: readonly [number, number] = [0.78, 0.17]): void {
  drawSky(ctx, cam, w, h, time, moon);
  drawClouds(ctx, cam, w, h, time);
  const [far, near] = mountainTiles();
  drawTiled(ctx, cam, w, h, 0.06, far!, -900);
  drawMist(ctx, cam, w, h, 0.07, 120, 0.22, time);
  drawTiled(ctx, cam, w, h, 0.1, near!, -300);
  drawCastle(ctx, cam, w, h, time);
  drawMist(ctx, cam, w, h, 0.2, 30, 0.2, time * 1.3);
  drawTiled(ctx, cam, w, h, 0.3, hillTile());
  drawMist(ctx, cam, w, h, 0.4, 60, 0.16, time * 1.7);
  drawTiled(ctx, cam, w, h, 0.62, nearWoodTile(), 200);
}

// ---------------------------------------------------------------------------
// The stage, in world space (the camera transform is already applied).

/** Pixels per world unit for the painted stage and platforms. */
const STAGE_RES = 3;
const PAD = 40;

interface Sprite {
  c: HTMLCanvasElement;
  x: number;
  y: number;
  w: number;
  h: number;
}

const blockArt = new Map<string, Sprite>();
const platformArt = new Map<number, Sprite>();

/** Paint one solid block: a rampart of individual stones with moss, cracks, arrow slits and ivy. */
function paintBlock(left: number, top: number, right: number, bottom: number): Sprite {
  const bw = right - left, bh = bottom - top;
  const x0 = left - PAD, y0 = top - PAD;
  const { c, g } = canvas(bw + PAD * 2, bh + PAD * 2, STAGE_RES);
  g.translate(-x0, -y0);
  const r = rng(51);
  const inset = 40;
  const shape = () => {
    g.beginPath();
    g.moveTo(left, top);
    g.lineTo(right, top);
    g.lineTo(right - inset, bottom);
    g.lineTo(left + inset, bottom);
    g.closePath();
  };

  g.save();
  shape();
  g.clip();
  g.fillStyle = '#26221f';
  g.fillRect(left, top, bw, bh);
  // Courses of stones, each its own shade, bevelled and speckled.
  for (let y = top + 9, row = 0; y < bottom; row++) {
    const rh = 11 + r() * 4;
    for (let x = left - r() * 20; x < right; ) {
      const sw = 18 + r() * 22;
      const light = 36 + r() * 16, warm = r() * 10 - 3;
      const sx = x + 0.8, sy = y + 0.8, ww = sw - 1.6, hh = rh - 1.6;
      const grad = g.createLinearGradient(0, sy, 0, sy + hh);
      grad.addColorStop(0, `hsl(${28 + warm}, 7%, ${light + 6}%)`);
      grad.addColorStop(1, `hsl(${28 + warm}, 6%, ${light - 6}%)`);
      g.fillStyle = grad;
      g.beginPath();
      g.roundRect(sx, sy, ww, hh, 2);
      g.fill();
      g.fillStyle = 'rgba(255,245,230,0.16)';
      g.fillRect(sx + 1, sy, ww - 2, 1);
      g.fillStyle = 'rgba(0,0,0,0.32)';
      g.fillRect(sx + 1, sy + hh - 1.2, ww - 2, 1.2);
      for (let k = 0; k < 7; k++) {
        g.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.08)';
        g.fillRect(sx + r() * ww, sy + r() * hh, 0.8, 0.8);
      }
      if (r() < 0.12) {
        g.strokeStyle = 'rgba(0,0,0,0.45)';
        g.lineWidth = 0.6;
        g.beginPath();
        let cx = sx + r() * ww, cy = sy;
        g.moveTo(cx, cy);
        for (let k = 0; k < 4; k++) g.lineTo((cx += (r() - 0.5) * 6), (cy += hh / 4));
        g.stroke();
      }
      // Moss, mostly on the upper rows.
      if (r() < 0.32 - row * 0.06) {
        g.fillStyle = `rgba(${70 + r() * 30},${100 + r() * 30},${50 + r() * 20},0.55)`;
        for (let k = 0; k < 5; k++) {
          g.beginPath();
          g.arc(sx + r() * ww, sy + r() * 3, 1.2 + r() * 2.5, 0, TAU);
          g.fill();
        }
      }
      x += sw;
    }
    y += rh;
  }
  // Damp streaks and darkening toward the base.
  for (let k = 0; k < 14; k++) {
    const sx = left + r() * bw, sy = top + 12 + r() * 20;
    const streak = g.createLinearGradient(0, sy, 0, sy + 30 + r() * 30);
    streak.addColorStop(0, 'rgba(20,24,18,0.35)');
    streak.addColorStop(1, 'rgba(20,24,18,0)');
    g.fillStyle = streak;
    g.fillRect(sx, sy, 2 + r() * 4, 60);
  }
  const shadow = g.createLinearGradient(0, top, 0, bottom);
  shadow.addColorStop(0, 'rgba(0,0,0,0)');
  shadow.addColorStop(1, 'rgba(0,0,0,0.45)');
  g.fillStyle = shadow;
  g.fillRect(left, top, bw, bh);
  // Arrow slits with stone frames.
  for (const sx of [left + bw * 0.1, left + bw * 0.43, left + bw * 0.57, left + bw * 0.9]) {
    g.fillStyle = '#6d665d';
    g.fillRect(sx - 4, top + 20, 8, 30);
    g.fillStyle = '#0c0a0a';
    g.fillRect(sx - 1.6, top + 23, 3.2, 24);
    g.fillRect(sx - 4, top + 33, 8, 2.4);
  }
  g.restore();

  // Walkway: worn flagstone slabs along the top.
  for (let x = left; x < right; ) {
    const sw = 26 + r() * 20, ww = Math.min(sw, right - x);
    const tone = 52 + r() * 10;
    const grad = g.createLinearGradient(0, top, 0, top + 9);
    grad.addColorStop(0, `hsl(30, 8%, ${tone + 8}%)`);
    grad.addColorStop(1, `hsl(30, 7%, ${tone - 10}%)`);
    g.fillStyle = grad;
    g.fillRect(x + 0.6, top, ww - 1.2, 9);
    g.fillStyle = 'rgba(255,250,235,0.22)';
    g.fillRect(x + 0.6, top, ww - 1.2, 1.1);
    x += sw;
  }
  // Grass tufts and a few flowers on the lip.
  for (let k = 0; k < 90; k++) {
    const gx = left + 4 + r() * (bw - 8);
    g.strokeStyle = `rgb(${60 + r() * 30},${100 + r() * 40},${50 + r() * 20})`;
    g.lineWidth = 0.7;
    for (let b = 0; b < 4; b++) {
      g.beginPath();
      g.moveTo(gx + b * 0.8, top + 1);
      g.quadraticCurveTo(gx + b * 0.8 + (r() - 0.5) * 2, top - 2, gx + b * 0.8 + (r() - 0.5) * 4, top - 2.5 - r() * 3);
      g.stroke();
    }
    if (r() < 0.12) {
      g.fillStyle = r() < 0.5 ? '#e8e0c8' : '#d9b8e8';
      g.fillRect(gx, top - 3.5, 1.4, 1.4);
    }
  }
  shape();
  g.strokeStyle = '#17120e';
  g.lineWidth = 2.2;
  g.stroke();

  // Ivy hanging down the face (and a little past the bottom).
  for (const ix of [left + 60, left + bw * 0.36, right - bw * 0.3, right - 70]) {
    for (let v = 0; v < 4; v++) {
      let x = ix + (r() - 0.5) * 30, y = top + 2;
      const len = 30 + r() * 60;
      g.strokeStyle = '#2d3a22';
      g.lineWidth = 0.9;
      g.beginPath();
      g.moveTo(x, y);
      const pts: [number, number][] = [];
      for (let s = 0; s < len; s += 4) {
        x += (r() - 0.5) * 3;
        y += 4;
        g.lineTo(x, y);
        pts.push([x, y]);
      }
      g.stroke();
      for (const [lx, ly] of pts) {
        if (r() < 0.25) continue;
        g.save();
        g.translate(lx, ly);
        g.rotate((r() - 0.5) * 2);
        const tone = 0.6 + r() * 0.5;
        g.fillStyle = `rgb(${Math.round(52 * tone)},${Math.round(98 * tone)},${Math.round(44 * tone)})`;
        g.beginPath();
        g.ellipse(r() < 0.5 ? -2 : 2, 0, 2.6, 1.8, 0, 0, TAU);
        g.fill();
        g.restore();
      }
    }
  }
  return { c, x: x0, y: y0, w: bw + PAD * 2, h: bh + PAD * 2 };
}

/** Paint one platform: oak planks with grain and knots, iron bands, braces underneath. */
function paintPlatform(width: number): Sprite {
  const h = 9;
  const x0 = -8, y0 = -6;
  const { c, g } = canvas(width + 16, 50, STAGE_RES + 1);
  g.translate(-x0, -y0);
  const r = rng(61 + width);
  // Braces and a hanging ring for the lantern.
  g.strokeStyle = '#2a1a10';
  g.lineWidth = 3;
  for (const bx of [16, width - 16]) {
    g.beginPath();
    g.moveTo(bx, h);
    g.lineTo(width / 2 + (bx < width / 2 ? -6 : 6), h + 22);
    g.stroke();
  }
  g.strokeStyle = '#4a3a2a';
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(width / 2, h);
  g.lineTo(width / 2, h + 16);
  g.stroke();
  // Planks.
  for (let x = 0; x < width; ) {
    const pw = Math.min(28 + r() * 16, width - x);
    const tone = 0.85 + r() * 0.3;
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, `rgb(${Math.round(176 * tone)},${Math.round(122 * tone)},${Math.round(72 * tone)})`);
    grad.addColorStop(0.35, `rgb(${Math.round(140 * tone)},${Math.round(92 * tone)},${Math.round(52 * tone)})`);
    grad.addColorStop(1, `rgb(${Math.round(84 * tone)},${Math.round(54 * tone)},${Math.round(30 * tone)})`);
    g.fillStyle = grad;
    g.fillRect(x, 0, pw, h);
    g.strokeStyle = 'rgba(50,30,15,0.45)';
    g.lineWidth = 0.4;
    for (let k = 0; k < 4; k++) {
      const gy = 2 + k * 1.8 + r();
      g.beginPath();
      g.moveTo(x, gy);
      g.bezierCurveTo(x + pw * 0.3, gy + (r() - 0.5) * 1.6, x + pw * 0.7, gy + (r() - 0.5) * 1.6, x + pw, gy);
      g.stroke();
    }
    if (r() < 0.5) {
      g.fillStyle = 'rgba(40,22,10,0.6)';
      g.beginPath();
      g.ellipse(x + pw * (0.3 + r() * 0.4), 4 + r() * 2, 1.6, 1, 0, 0, TAU);
      g.fill();
    }
    g.fillStyle = 'rgba(25,14,6,0.8)';
    g.fillRect(x + pw - 0.6, 0, 0.6, h);
    g.fillStyle = '#cfc6b4';
    g.fillRect(x + 2, 4, 0.9, 0.9);
    x += pw;
  }
  g.fillStyle = 'rgba(255,230,190,0.35)';
  g.fillRect(0, 0, width, 0.9);
  // Iron bands with rivets.
  for (const bx of [10, width - 16]) {
    g.fillStyle = '#3b3a3c';
    g.fillRect(bx, -0.5, 6, h + 1);
    g.fillStyle = '#8a8a90';
    g.fillRect(bx, -0.5, 6, 1);
    g.fillStyle = '#b0b0b8';
    g.fillRect(bx + 1, 2.5, 1, 1);
    g.fillRect(bx + 4, 6, 1, 1);
  }
  g.strokeStyle = '#17100a';
  g.lineWidth = 1.2;
  g.strokeRect(0, 0, width, h);
  return { c, x: x0, y: y0, w: width + 16, h: 50 };
}

// --- Live bits: torches, embers, banners, lanterns ----------------------------

interface Ember {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}

const embers: Ember[] = [];
let lastEmberTime = -1;

/** Advance the embers once per real frame, however many views draw it. */
function updateEmbers(time: number, sources: readonly { x: number; y: number }[]): void {
  const dt = lastEmberTime < 0 ? 16 : Math.min(50, time - lastEmberTime);
  lastEmberTime = time;
  if (dt <= 0) return;
  for (const e of embers) {
    e.x += e.vx * dt * 0.06;
    e.y += e.vy * dt * 0.06;
    e.vx += (Math.random() - 0.5) * 0.04;
    e.life -= dt;
  }
  for (let i = embers.length - 1; i >= 0; i--) if (embers[i]!.life <= 0) embers.splice(i, 1);
  for (const s of sources) {
    if (Math.random() < dt * 0.012 && embers.length < 120) {
      embers.push({ x: s.x + (Math.random() - 0.5) * 4, y: s.y - 8, vx: (Math.random() - 0.5) * 0.4, vy: -0.6 - Math.random() * 0.6, life: 700 + Math.random() * 900 });
    }
  }
}

function drawTorch(ctx: Ctx, x: number, y: number, time: number): void {
  // Iron sconce.
  ctx.fillStyle = '#1e1a18';
  ctx.beginPath();
  ctx.moveTo(x - 6, y);
  ctx.lineTo(x + 6, y);
  ctx.lineTo(x + 3, y + 7);
  ctx.lineTo(x - 3, y + 7);
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(x - 1.5, y + 7, 3, 9);
  ctx.fillStyle = '#5a3a20';
  ctx.fillRect(x - 2.5, y - 6, 5, 7);
  // Flame: three layers that flicker independently.
  const n = (k: number) => Math.sin(time * 0.021 * k + x) * 0.5 + Math.sin(time * 0.047 * k + x * 2) * 0.3;
  const layers: [number, number, string][] = [
    [1, 1, '#c8401a'],
    [0.72, 0.8, '#ff9a2e'],
    [0.45, 0.55, '#ffe9a8'],
  ];
  for (const [k, hk, color] of layers) {
    const fh = (18 + n(1) * 4) * hk, fw = 6 * k;
    const sway = n(1.3) * 2.2;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x - fw, y - 5);
    ctx.bezierCurveTo(x - fw * 1.1, y - 5 - fh * 0.5, x + sway - fw * 0.3, y - 5 - fh * 0.8, x + sway, y - 5 - fh);
    ctx.bezierCurveTo(x + sway + fw * 0.3, y - 5 - fh * 0.8, x + fw * 1.1, y - 5 - fh * 0.5, x + fw, y - 5);
    ctx.closePath();
    ctx.fill();
  }
}

/** Additive warm light around a point (call with 'lighter' compositing). */
function light(ctx: Ctx, x: number, y: number, radius: number, strength: number): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
  g.addColorStop(0, `rgba(255,170,80,${strength})`);
  g.addColorStop(0.4, `rgba(255,130,50,${strength * 0.4})`);
  g.addColorStop(1, 'rgba(255,120,40,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, TAU);
  ctx.fill();
}

/** A heraldic banner hanging from a rod: shaded folds, a swallow tail, a gold chevron and crown. */
function drawBanner(ctx: Ctx, x: number, y: number, bw: number, bh: number, color: string, time: number, phase: number): void {
  const sway = Math.sin(time * 0.0016 + phase) * bw * 0.07;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + bw, y);
  ctx.lineTo(x + bw + sway, y + bh);
  ctx.lineTo(x + bw / 2 + sway, y + bh * 0.84);
  ctx.lineTo(x + sway, y + bh);
  ctx.closePath();
  const folds = ctx.createLinearGradient(x, 0, x + bw, 0);
  for (let k = 0; k <= 6; k++) folds.addColorStop(k / 6, k % 2 ? color : shadeHex(color, 0.7));
  ctx.fillStyle = folds;
  ctx.fill();
  ctx.clip();
  const sh = ctx.createLinearGradient(0, y, 0, y + bh);
  sh.addColorStop(0, 'rgba(0,0,0,0.25)');
  sh.addColorStop(0.3, 'rgba(0,0,0,0)');
  sh.addColorStop(1, 'rgba(0,0,0,0.3)');
  ctx.fillStyle = sh;
  ctx.fillRect(x - 5, y, bw + 10, bh);
  ctx.restore();
  ctx.strokeStyle = '#15100c';
  ctx.lineWidth = 1;
  ctx.stroke();
  // Gold trim: chevron and a small crown.
  const cx = x + bw / 2 + sway * 0.5;
  ctx.strokeStyle = '#d9a441';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x + bw * 0.18 + sway * 0.4, y + bh * 0.62);
  ctx.lineTo(cx, y + bh * 0.48);
  ctx.lineTo(x + bw * 0.82 + sway * 0.4, y + bh * 0.62);
  ctx.stroke();
  ctx.fillStyle = '#e8b84a';
  ctx.beginPath();
  ctx.moveTo(cx - 6, y + bh * 0.34);
  ctx.lineTo(cx - 6, y + bh * 0.2);
  ctx.lineTo(cx - 3, y + bh * 0.27);
  ctx.lineTo(cx, y + bh * 0.17);
  ctx.lineTo(cx + 3, y + bh * 0.27);
  ctx.lineTo(cx + 6, y + bh * 0.2);
  ctx.lineTo(cx + 6, y + bh * 0.34);
  ctx.closePath();
  ctx.fill();
  // Rod with finials.
  ctx.fillStyle = '#3a2a1a';
  ctx.fillRect(x - 4, y - 2.5, bw + 8, 3.5);
  ctx.fillStyle = '#d9a441';
  ctx.beginPath();
  ctx.arc(x - 4, y - 0.8, 2.2, 0, TAU);
  ctx.arc(x + bw + 4, y - 0.8, 2.2, 0, TAU);
  ctx.fill();
}

function shadeHex(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.round(v * k);
  return `rgb(${ch((n >> 16) & 255)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
}

function drawLantern(ctx: Ctx, x: number, y: number, time: number): void {
  const swing = Math.sin(time * 0.002 + x) * 1.5;
  ctx.fillStyle = '#1c1612';
  ctx.fillRect(x - 3.5 + swing, y, 7, 2);
  ctx.fillRect(x - 3.5 + swing, y + 9, 7, 2);
  ctx.fillStyle = '#ffcf7a';
  ctx.fillRect(x - 2.6 + swing, y + 2, 5.2, 7);
  ctx.fillStyle = '#1c1612';
  ctx.fillRect(x - 0.5 + swing, y + 2, 1, 7);
}

/** The stage: blocks, platforms, banners (one per player color) and torches, in world space. Their light comes later. */
export function drawStageArt(ctx: Ctx, stage: StageDef, time: number, bannerColors: readonly string[]): void {
  const torches: { x: number; y: number }[] = [];
  for (const b of stage.blocks) {
    const l = b.left / ONE, t = b.top / ONE, rr = b.right / ONE, bt = b.bottom / ONE;
    const key = `${l},${t},${rr},${bt}`;
    let art = blockArt.get(key);
    if (!art) blockArt.set(key, (art = paintBlock(l, t, rr, bt)));
    ctx.drawImage(art.c, art.x, art.y, art.w, art.h);
    const bw = rr - l;
    drawBanner(ctx, l + bw * 0.27 - 14, t + 12, 28, bt - t - 20, bannerColors[0]!, time, 0);
    drawBanner(ctx, l + bw * 0.73 - 14, t + 12, 28, bt - t - 20, bannerColors[1]!, time, 2);
    for (const tx of [l + 72, rr - 72]) {
      drawTorch(ctx, tx, t + 26, time);
      torches.push({ x: tx, y: t + 26 });
    }
  }
  for (const p of stage.platforms) {
    const l = p.left / ONE, t = p.top / ONE, pw = (p.right - p.left) / ONE;
    let art = platformArt.get(pw);
    if (!art) platformArt.set(pw, (art = paintPlatform(pw)));
    ctx.drawImage(art.c, l + art.x, t + art.y, art.w, art.h);
    drawLantern(ctx, l + pw / 2, t + 25, time);
  }
  updateEmbers(time, torches);
  stageLights = torches;
}

let stageLights: { x: number; y: number }[] = [];

/**
 * Warm torch and lantern light, rising embers (world space, after the
 * fighters so it falls on them too).
 */
export function drawStageLights(ctx: Ctx, stage: StageDef, time: number): void {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const s of stageLights) {
    const flick = 1 + Math.sin(time * 0.02 + s.x) * 0.06 + Math.sin(time * 0.053 + s.x) * 0.04;
    light(ctx, s.x, s.y - 10, 110 * flick, 0.22);
    light(ctx, s.x, s.y - 10, 26 * flick, 0.5);
  }
  for (const p of stage.platforms) {
    const x = (p.left + p.right) / 2 / ONE, y = p.top / ONE + 31;
    light(ctx, x, y, 46, 0.25);
  }
  for (const e of embers) {
    const a = Math.min(1, e.life / 600);
    ctx.fillStyle = `rgba(255,${150 + Math.round(a * 80)},70,${(a * 0.9).toFixed(3)})`;
    ctx.fillRect(e.x - 0.8, e.y - 0.8, 1.6, 1.6);
  }
  ctx.restore();
}

/** A soft shadow on the highest surface under a fighter whose feet are at (x, y). */
export function drawGroundShadow(ctx: Ctx, stage: StageDef, x: number, y: number, width: number): void {
  let ground = Infinity;
  for (const b of stage.blocks) {
    const l = b.left / ONE, rr = b.right / ONE, t = b.top / ONE;
    if (x >= l && x <= rr && t >= y - 1) ground = Math.min(ground, t);
  }
  for (const p of stage.platforms) {
    const l = p.left / ONE, rr = p.right / ONE, t = p.top / ONE;
    if (x >= l && x <= rr && t >= y - 1) ground = Math.min(ground, t);
  }
  if (!Number.isFinite(ground)) return;
  const dist = ground - y;
  const k = 1 / (1 + dist / 120);
  ctx.save();
  ctx.translate(x, ground + 0.5);
  ctx.scale(1, 0.22);
  const rw = width * 0.75 * (0.5 + k * 0.5);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rw);
  g.addColorStop(0, `rgba(0,0,0,${(0.45 * k).toFixed(3)})`);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, rw, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/** Low mist drifting in front of everything, and a vignette. Screen space. */
export function drawForeground(ctx: Ctx, cam: View3, w: number, h: number, time: number): void {
  drawMist(ctx, cam, w, h, 1.1, 230, 0.12, time * 2);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const v = ctx.createRadialGradient(w / 2, h * 0.45, Math.min(w, h) * 0.35, w / 2, h * 0.5, Math.max(w, h) * 0.75);
  v.addColorStop(0, 'rgba(8,6,16,0)');
  v.addColorStop(1, 'rgba(8,6,16,0.55)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, w, h);
}
