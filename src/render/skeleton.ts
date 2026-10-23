// A small 2D humanoid rig: forward kinematics from a Pose, drawn as outlined
// capsules. Render-only, so floats and Math.sin/cos are fine here.
//
// Local space: origin at the feet, +x = the way the fighter faces, +y = down.
// Limb angles are in degrees measured from straight down, + rotating forward.

export interface Pose {
  /** Torso lean, + = forward. */
  torso: number;
  /** Extra head tilt on top of the torso lean. */
  head: number;
  /** [shoulder angle, elbow bend] — elbow bend adds to the shoulder angle. */
  armF: [number, number];
  armB: [number, number];
  /** [hip angle, knee bend] — knees normally bend backward (negative). */
  legF: [number, number];
  legB: [number, number];
  /** Extra hip offset in px (+y = lower). */
  hipY: number;
  /** Whole-body rotation in degrees around the body center, + = forward flip. */
  spin: number;
}

/** Each fighter's medieval outfit: headgear, garment, back and hand items (see drawRig). */
export type Costume = 'bard' | 'knight' | 'squire' | 'falconer' | 'cleric' | 'golem' | 'duelist' | 'captain';

export interface Look {
  thigh: number;
  shin: number;
  torso: number;
  upperArm: number;
  forearm: number;
  headR: number;
  neck: number;
  limbW: number;
  torsoW: number;
  skin: string;
  hair: string;
  accent: string;
  costume: Costume;
  /** Second costume color: steel, leather or cloth, depending on the costume. */
  trim: string;
}

export function mixPose(a: Pose, b: Pose, t: number): Pose {
  const m = (x: number, y: number) => x + (y - x) * t;
  return {
    torso: m(a.torso, b.torso),
    head: m(a.head, b.head),
    armF: [m(a.armF[0], b.armF[0]), m(a.armF[1], b.armF[1])],
    armB: [m(a.armB[0], b.armB[0]), m(a.armB[1], b.armB[1])],
    legF: [m(a.legF[0], b.legF[0]), m(a.legF[1], b.legF[1])],
    legB: [m(a.legB[0], b.legB[0]), m(a.legB[1], b.legB[1])],
    hipY: m(a.hipY, b.hipY),
    spin: m(a.spin, b.spin),
  };
}

interface Pt {
  x: number;
  y: number;
}

/** Unit vector for an angle measured from straight down, + = forward. */
function down(deg: number): Pt {
  const r = (deg * Math.PI) / 180;
  return { x: Math.sin(r), y: Math.cos(r) };
}

function along(p: Pt, deg: number, len: number): Pt {
  const d = down(deg);
  return { x: p.x + d.x * len, y: p.y + d.y * len };
}

export interface Rig {
  hip: Pt;
  shoulder: Pt;
  head: Pt;
  elbowF: Pt;
  handF: Pt;
  elbowB: Pt;
  handB: Pt;
  kneeF: Pt;
  footF: Pt;
  kneeB: Pt;
  footB: Pt;
}

/**
 * Solve joint positions. When `planted`, the rig is shifted so its lowest foot
 * touches y = 0 — crouches and bent knees then sink the hips automatically.
 */
export function solveRig(pose: Pose, look: Look, planted: boolean): Rig {
  const hip = { x: 0, y: -(look.thigh + look.shin) + pose.hipY };
  const shoulder = along(hip, 180 - pose.torso, look.torso);
  const head = along(shoulder, 180 - pose.torso - pose.head, look.neck + look.headR);
  const elbowF = along(shoulder, pose.armF[0], look.upperArm);
  const handF = along(elbowF, pose.armF[0] + pose.armF[1], look.forearm);
  const elbowB = along(shoulder, pose.armB[0], look.upperArm);
  const handB = along(elbowB, pose.armB[0] + pose.armB[1], look.forearm);
  const kneeF = along(hip, pose.legF[0], look.thigh);
  const footF = along(kneeF, pose.legF[0] + pose.legF[1], look.shin);
  const kneeB = along(hip, pose.legB[0], look.thigh);
  const footB = along(kneeB, pose.legB[0] + pose.legB[1], look.shin);
  const rig: Rig = { hip, shoulder, head, elbowF, handF, elbowB, handB, kneeF, footF, kneeB, footB };

  if (pose.spin !== 0) {
    const c = { x: (hip.x + shoulder.x) / 2, y: (hip.y + shoulder.y) / 2 };
    const r = (pose.spin * Math.PI) / 180;
    const cos = Math.cos(r), sin = Math.sin(r);
    for (const p of Object.values(rig)) {
      const dx = p.x - c.x, dy = p.y - c.y;
      p.x = c.x + dx * cos - dy * sin;
      p.y = c.y + dx * sin + dy * cos;
    }
  }
  if (planted) {
    const lowest = Math.max(rig.footF.y, rig.footB.y, rig.kneeF.y, rig.kneeB.y);
    for (const p of Object.values(rig)) p.y -= lowest;
  }
  return rig;
}

// ---------------------------------------------------------------------------
// Drawing. Shapes are shaded as if lit from above, and inked with a darker
// shade of their own color rather than a black outline.

/** [r, g, b] of a "#rrggbb" or "rgb(r,g,b)" color. */
function rgbOf(color: string): [number, number, number] {
  if (color.startsWith('#')) {
    const n = parseInt(color.slice(1, 7), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const m = color.match(/\d+(\.\d+)?/g) ?? ['0', '0', '0'];
  return [Number(m[0]), Number(m[1]), Number(m[2])];
}

/** Darken (k < 1) or brighten (k > 1) a color. */
export function shade(color: string, k: number): string {
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  const [r, g, b] = rgbOf(color);
  return `rgb(${ch(r)},${ch(g)},${ch(b)})`;
}

/** Mix a color toward white by `t` (0..1), e.g. for highlights or readable text in a fighter's color. */
export function tint(color: string, t: number): string {
  const ch = (v: number) => Math.round(v + (255 - v) * t);
  const [r, g, b] = rgbOf(color);
  return `rgb(${ch(r)},${ch(g)},${ch(b)})`;
}

export interface DrawOpts {
  /** World position of the local origin (feet), in world px. */
  x: number;
  y: number;
  facing: number;
  color: string;
  /** 0..1 */
  alpha: number;
  /** Outline color override (e.g. white while intangible). */
  outline?: string;
  /** Flutter / bob phase for cloth and feathers (render time in ms). */
  time: number;
  /** World-space velocity in px/frame, for trailing cloth. */
  vx: number;
}

const add = (p: Pt, d: Pt, k: number): Pt => ({ x: p.x + d.x * k, y: p.y + d.y * k });
const lerp = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

function unit(from: Pt, to: Pt): Pt {
  const dx = to.x - from.x, dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len };
}

const LEATHER = '#6b4426';
const BOOT = '#3a2416';
const WOOD = '#8a5a32';
const GOLD = '#d9a441';
const STEEL = '#b9c0c7';

type Ctx = CanvasRenderingContext2D;

/** Closed smooth path through `pts` (quadratic curves between midpoints). */
function smooth(ctx: Ctx, pts: readonly Pt[]): void {
  const n = pts.length;
  const mid = (a: Pt, b: Pt) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const m0 = mid(pts[n - 1]!, pts[0]!);
  ctx.beginPath();
  ctx.moveTo(m0.x, m0.y);
  for (let i = 0; i < n; i++) {
    const p = pts[i]!, m = mid(p, pts[(i + 1) % n]!);
    ctx.quadraticCurveTo(p.x, p.y, m.x, m.y);
  }
  ctx.closePath();
}

function poly(ctx: Ctx, pts: readonly Pt[]): void {
  ctx.beginPath();
  pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.closePath();
}

/** A linear gradient from a highlight (at `a`) through `color` to shadow (at `b`). */
function lit(ctx: Ctx, a: Pt, b: Pt, color: string, light = 0.3, dark = 0.58): CanvasGradient {
  const g = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
  g.addColorStop(0, tint(color, light));
  g.addColorStop(0.45, color);
  g.addColorStop(1, shade(color, dark));
  return g;
}

/**
 * Painter for one figure, in rig-local space (the context is already
 * translated to the feet and mirrored to the facing). `ink` overrides every
 * outline (e.g. white while intangible).
 */
class Painter {
  constructor(
    readonly ctx: Ctx,
    readonly ink: string | undefined,
  ) {}

  edge(color: string): string {
    return this.ink ?? shade(color, 0.36);
  }

  /** Fill the current path and ink its edge. */
  finish(fill: string | CanvasGradient, edgeOf: string, width = 1.3): void {
    const ctx = this.ctx;
    ctx.fillStyle = fill;
    ctx.fill();
    if (width <= 0) return;
    ctx.strokeStyle = this.edge(edgeOf);
    ctx.lineWidth = width;
    ctx.lineJoin = 'round';
    ctx.stroke();
  }

  /** Tapered, rounded limb segment from `a` (radius ra) to `b` (radius rb), lit from above. */
  limb(a: Pt, b: Pt, ra: number, rb: number, color: string): void {
    const ctx = this.ctx;
    const d = unit(a, b);
    let n = { x: -d.y, y: d.x };
    if (n.y > 0 || (n.y === 0 && n.x < 0)) n = { x: -n.x, y: -n.y }; // the lit side faces up
    const ang = Math.atan2(d.y, d.x);
    ctx.beginPath();
    ctx.arc(a.x, a.y, ra, ang + Math.PI / 2, ang - Math.PI / 2);
    ctx.arc(b.x, b.y, rb, ang - Math.PI / 2, ang + Math.PI / 2);
    ctx.closePath();
    const r = Math.max(ra, rb);
    const m = lerp(a, b, 0.5);
    this.finish(lit(ctx, add(m, n, r), add(m, n, -r), color, 0.32, 0.55), color);
  }

  /** A smooth closed shape, lit from `from` to `to`. */
  blob(pts: readonly Pt[], color: string, from: Pt, to: Pt, width = 1.3): void {
    smooth(this.ctx, pts);
    this.finish(lit(this.ctx, from, to, color), color, width);
  }

  /** A straight-edged shape, lit from `from` to `to`. */
  plate(pts: readonly Pt[], color: string, from: Pt, to: Pt, width = 1.3): void {
    poly(this.ctx, pts);
    this.finish(lit(this.ctx, from, to, color), color, width);
  }

  /** A stroked line (no fill), e.g. a strap, string or seam. */
  line(pts: readonly Pt[], width: number, color: string, cap: CanvasLineCap = 'round'): void {
    const ctx = this.ctx;
    ctx.beginPath();
    pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.lineCap = cap;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
  }

  /**
   * A soft tapered shape along a curve through `pts` (a quadratic through the
   * middle point when there are three): half-width `w0` at the start easing to
   * `w1` at the end, swelling to `bulge` times the larger one in between.
   */
  ribbon(pts: readonly Pt[], w0: number, w1: number, color: string, bulge = 1, midrib = false): void {
    const a = pts[0]!, b = pts[1] ?? a, c = pts[2] ?? b;
    const at = (t: number): Pt =>
      pts.length >= 3
        ? { x: (1 - t) ** 2 * a.x + 2 * (1 - t) * t * b.x + t * t * c.x, y: (1 - t) ** 2 * a.y + 2 * (1 - t) * t * b.y + t * t * c.y }
        : lerp(a, b, t);
    const N = 12;
    const left: Pt[] = [], right: Pt[] = [], spine: Pt[] = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const q = at(t);
      const d = unit(at(Math.max(0, t - 0.02)), at(Math.min(1, t + 0.02)));
      const w = (w0 + (w1 - w0) * t) * (1 + (bulge - 1) * Math.sin(Math.PI * t));
      left.push(add(q, { x: -d.y, y: d.x }, w));
      right.push(add(q, { x: d.y, y: -d.x }, w));
      spine.push(q);
    }
    const ctx = this.ctx;
    ctx.beginPath();
    left.forEach((q, i) => (i === 0 ? ctx.moveTo(q.x, q.y) : ctx.lineTo(q.x, q.y)));
    for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i]!.x, right[i]!.y);
    ctx.closePath();
    const m = at(0.5), d = unit(a, c);
    const n = { x: -d.y, y: d.x }, side = n.y > 0 ? -1 : 1;
    const w = Math.max(w0, w1) * bulge;
    this.finish(lit(ctx, add(m, n, w * side), add(m, n, -w * side), color, 0.35, 0.6), color, 1.1);
    if (midrib) this.line(spine.slice(0, N), 0.6, shade(color, 0.7));
  }

  /** A feather from `base` curving through `mid` to `tip`. */
  feather(base: Pt, mid: Pt, tip: Pt, width: number, color: string): void {
    this.ribbon([base, mid, tip], width * 0.35, width * 0.05, color, 2.4, true);
  }

  /** A line with an inked border: rods, straps, plumes. */
  rod(pts: readonly Pt[], width: number, color: string): void {
    this.line(pts, width + 2.2, this.edge(color));
    this.line(pts, width, color);
    if (width >= 2.5) this.line(pts.map((p) => ({ x: p.x - width * 0.18, y: p.y - width * 0.22 })), width * 0.3, tint(color, 0.35));
  }

  disc(c: Pt, r: number, color: string, width = 1.2): void {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
    const g = ctx.createRadialGradient(c.x - r * 0.35, c.y - r * 0.4, r * 0.1, c.x, c.y, r);
    g.addColorStop(0, tint(color, 0.35));
    g.addColorStop(1, shade(color, 0.7));
    this.finish(g, color, width);
  }

  /** Soft glow (for runes, gems, halos). */
  glow(c: Pt, r: number, color: string): void {
    const ctx = this.ctx;
    const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(255,170,80,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  /** Lumpy rock with a lit top and cracks. */
  rock(c: Pt, r: number, color: string): void {
    const lumps = [1, 0.84, 0.97, 0.8, 1.04, 0.88, 0.95, 0.83];
    const pts = lumps.map((k, i) => {
      const a = (i / lumps.length) * Math.PI * 2;
      return { x: c.x + Math.cos(a) * r * k, y: c.y + Math.sin(a) * r * k };
    });
    poly(this.ctx, pts);
    this.finish(lit(this.ctx, { x: c.x - r * 0.4, y: c.y - r }, { x: c.x + r * 0.4, y: c.y + r }, color, 0.25, 0.5), color, 1.4);
    this.line([add(c, { x: -0.5, y: -0.2 }, r), add(c, { x: 0, y: 0.1 }, r), add(c, { x: 0.15, y: 0.55 }, r)], 0.8, shade(color, 0.5));
  }

  /** A boot or bare foot at the end of the shin (`foot` is the sole). */
  foot(knee: Pt, foot: Pt, r: number, color: string): void {
    const d = unit(knee, foot);
    const f = { x: d.y, y: -d.x }; // forward, along the sole
    const a = add(foot, d, -r * 0.7); // ankle
    const len = r * 2.6;
    const pts = [
      add(a, d, -r * 0.6),
      add(add(a, f, -r * 0.95), d, r * 0.2),
      add(add(a, f, -r * 0.85), d, r * 0.75),
      add(add(a, f, len), d, r * 0.75),
      add(add(a, f, len + r * 0.25), d, r * 0.15),
      add(add(a, f, len * 0.45), d, -r * 0.3),
      add(add(a, f, r * 0.55), d, -r * 0.7),
    ];
    this.blob(pts, color, add(a, d, -r), add(a, d, r * 1.2));
  }

  /** A fist at the end of the forearm. */
  hand(elbow: Pt, hand: Pt, r: number, color: string): void {
    const d = unit(elbow, hand);
    const n = { x: -d.y, y: d.x };
    const c = add(hand, d, r * 0.3);
    const pts = [add(c, d, -r * 0.9), add(c, n, r), add(add(c, d, r * 0.9), n, r * 0.6), add(add(c, d, r), n, -r * 0.6), add(c, n, -r)];
    this.blob(pts, color, add(c, { x: 0, y: -1 }, r), add(c, { x: 0, y: 1 }, r));
    this.line([add(add(c, d, r * 0.55), n, r * 0.55), add(add(c, d, r * 0.65), n, -r * 0.5)], 0.7, shade(color, 0.6));
  }
}

/** The color on top of a fighter's head (helmet, hat, hood or hair), for small portraits. */
export function capColor(look: Look): string {
  switch (look.costume) {
    case 'bard':
      return look.accent;
    case 'golem':
      return look.skin;
    default:
      return look.trim;
  }
}

interface HeadOpts {
  /** The fighter's outfit color (for plumes and hoods that match it). */
  color: string;
  ink?: string;
  time: number;
  /** How far cloth trails behind (0 = still, more = moving fast). */
  trail: number;
}

/**
 * Draw a head and its headgear around (0, 0): x forward, y down, in world px.
 * The caller sets up the transform (position, tilt and facing).
 */
export function drawHead(ctx: Ctx, look: Look, o: HeadOpts): void {
  const p = new Painter(ctx, o.ink);
  const r = look.headR;
  const c = look.costume;
  const P = (x: number, y: number): Pt => ({ x: x * r, y: y * r });
  const wave = Math.sin(o.time * 0.012) * 0.25;
  const back = -o.trail * 0.25;

  // Behind the head.
  if (c === 'cleric') {
    p.glow(P(-0.05, -0.9), r * 2.2, 'rgba(255,226,140,0.45)');
    ctx.beginPath();
    ctx.arc(-0.05 * r, -0.95 * r, r * 1.75, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,226,122,0.75)';
    ctx.lineWidth = 1.6;
    ctx.stroke();
  } else if (c === 'falconer') {
    // Hood and its long tail.
    p.ribbon([P(-0.7, -0.5), P(-1.9 + back, 0.0 + wave), P(-2.7 + back * 1.5, 0.9 + wave)], r * 0.55, r * 0.12, look.trim);
    p.blob([P(-1.25, 0.4), P(-1.15, -0.8), P(-0.2, -1.32), P(0.85, -1.05), P(1.15, -0.15), P(0.9, 1.0), P(-0.6, 1.25)], look.trim, P(0.2, -1.3), P(-0.4, 1.3));
  } else if (c === 'captain') {
    // Mail coif hanging around the neck.
    p.blob([P(-1.05, -0.1), P(-1.0, 1.0), P(-0.2, 1.35), P(0.6, 1.2), P(0.6, 0.6), P(-0.4, 0.6)], STEEL, P(0, -0.2), P(0, 1.4));
  }

  // Face and skull: one profile, lit from the upper front.
  if (c === 'golem') {
    p.rock(P(0, 0), r * 1.02, look.skin);
    p.glow(P(0.5, -0.1), r * 0.8, 'rgba(255,150,60,0.9)');
    p.disc(P(0.5, -0.1), r * 0.16, look.accent, 0);
    p.line([P(-0.6, -0.9), P(0.4, -1.0)], r * 0.3, look.trim);
    return;
  }
  const face = [P(0, -1.0), P(0.62, -0.84), P(0.93, -0.32), P(0.97, 0.02), P(1.13, 0.2), P(0.96, 0.32), P(0.9, 0.56), P(0.62, 0.92), P(0.15, 0.98), P(-0.45, 0.72), P(-0.92, 0.2), P(-0.9, -0.45), P(-0.52, -0.9)];
  smooth(ctx, face);
  const skin = ctx.createRadialGradient(0.35 * r, -0.4 * r, r * 0.1, 0, 0, r * 1.15);
  skin.addColorStop(0, tint(look.skin, 0.25));
  skin.addColorStop(0.6, look.skin);
  skin.addColorStop(1, shade(look.skin, 0.68));
  p.finish(skin, look.skin, 1.3);
  // Ear, eye, brow, mouth.
  p.blob([P(-0.32, -0.12), P(-0.05, -0.2), P(0.0, 0.18), P(-0.3, 0.3)], shade(look.skin, 0.9), P(-0.2, -0.2), P(-0.2, 0.3), 0.8);
  if (c !== 'knight') {
    ctx.beginPath();
    ctx.ellipse(0.55 * r, -0.08 * r, 0.17 * r, 0.11 * r, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#f4efe6';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0.63 * r, -0.08 * r, 0.085 * r, 0, Math.PI * 2);
    ctx.fillStyle = '#2a1d14';
    ctx.fill();
    p.line([P(0.36, -0.3), P(0.75, -0.27)], Math.max(1, r * 0.12), shade(look.hair, 0.9));
    p.line([P(0.6, 0.55), P(0.83, 0.5)], 0.9, shade(look.skin, 0.55));
  }
  // Hair: a mass over the back and top of the skull.
  if (c !== 'knight' && c !== 'falconer') {
    p.blob([P(-0.95, 0.25), P(-1.02, -0.5), P(-0.55, -1.08), P(0.2, -1.12), P(0.78, -0.82), P(0.55, -0.62), P(-0.1, -0.58), P(-0.45, -0.2), P(-0.55, 0.45)], look.hair, P(0, -1.1), P(-0.6, 0.5));
  }

  // Headgear.
  switch (c) {
    case 'knight': {
      // Great helm: riveted steel, an eye slit, breaths, and a plume.
      p.plate([P(-0.98, -0.98), P(0.82, -1.08), P(1.14, -0.62), P(1.18, 0.72), P(0.92, 1.12), P(-0.85, 1.12), P(-1.02, 0.6)], look.trim, P(0.4, -1.1), P(-0.6, 1.1), 1.4);
      p.line([P(1.12, -0.55), P(1.16, 1.0)], 1.2, tint(look.trim, 0.55));
      p.line([P(0.1, -0.12), P(1.2, -0.12)], Math.max(1.5, r * 0.18), '#15171b', 'butt');
      for (let i = 0; i < 3; i++) p.disc(P(0.78, 0.3 + i * 0.22), r * 0.05, '#15171b', 0);
      for (const x of [-0.75, -0.2, 0.35]) p.disc(P(x, 0.9), r * 0.06, shade(look.trim, 0.6), 0);
      for (let k = 0; k < 3; k++) p.feather(P(-0.1 + k * 0.15, -1.0), P(-0.7 - k * 0.15, -1.9 + k * 0.3 + wave * 0.6), P(-1.8 - k * 0.2 + back, -1.5 + k * 0.45 + wave), r * 0.9, k === 1 ? tint(look.accent, 0.3) : look.accent);
      break;
    }
    case 'captain':
      // Beard, then a nasal helm.
      p.blob([P(0.15, 0.32), P(0.95, 0.42), P(0.86, 0.88), P(0.5, 1.22), P(0.05, 1.05)], look.hair, P(0.5, 0.3), P(0.5, 1.2));
      p.blob([P(-1.04, 0.0), P(-0.95, -0.78), P(-0.3, -1.18), P(0.48, -1.12), P(0.98, -0.72), P(1.06, 0.0)], look.trim, P(0.3, -1.2), P(-0.4, 0.1));
      p.line([P(-1.03, -0.05), P(1.06, -0.05)], 1.8, shade(look.trim, 0.7));
      p.rod([P(0.98, -0.05), P(1.03, 0.45)], 1.8, look.trim);
      break;
    case 'squire':
      // Kettle hat: a steel dome with a broad brim.
      p.blob([P(-0.95, -0.35), P(-0.8, -1.0), P(0, -1.3), P(0.8, -1.0), P(0.95, -0.35)], look.trim, P(0.3, -1.3), P(-0.3, -0.3));
      ctx.beginPath();
      ctx.ellipse(0, -0.35 * r, 1.6 * r, 0.24 * r, 0, 0, Math.PI * 2);
      p.finish(lit(ctx, P(0, -0.6), P(0, -0.1), look.trim), look.trim, 1.2);
      break;
    case 'bard':
      // Floppy cap and a long white feather.
      p.blob([P(-1.25, -0.42), P(-0.75, -1.3), P(0.85, -1.32), P(1.35, -0.62), P(0.2, -0.5)], look.accent, P(0.3, -1.3), P(-0.4, -0.4));
      p.feather(P(-0.3, -1.15), P(-1.4, -2.1 + wave), P(-2.7 + back, -2.2 + wave), r * 0.85, look.trim);
      break;
    case 'falconer':
      // Hood rim around the face, with a feather.
      p.blob([P(-1.2, 0.3), P(-1.15, -0.9), P(0, -1.32), P(0.95, -0.95), P(1.1, -0.3), P(0.55, -0.75), P(-0.3, -0.75), P(-0.75, 0.1)], look.trim, P(0.2, -1.3), P(-0.5, 0.3));
      p.feather(P(-0.5, -1.0), P(-1.1, -1.55 + wave * 0.5), P(-1.7, -2.0 + wave), r * 0.6, look.accent);
      break;
    case 'cleric':
      // Tall two-peaked mitre with gold bands and a cross.
      p.plate([P(-0.78, -0.6), P(-0.72, -1.95), P(-0.1, -2.5), P(0.05, -2.2), P(0.18, -2.55), P(0.72, -1.95), P(0.78, -0.6)], look.trim, P(0.4, -2.5), P(-0.4, -0.6));
      p.line([P(-0.78, -0.72), P(0.78, -0.72)], 1.8, look.accent, 'butt');
      p.line([P(0.02, -0.8), P(0.04, -2.2)], 1.6, look.accent);
      p.line([P(-0.32, -1.55), P(0.38, -1.55)], 1.6, look.accent);
      break;
    case 'duelist':
      // Wide-brimmed hat with a plume in the outfit's color.
      p.blob([P(-0.75, -0.5), P(-0.6, -1.4), P(0.6, -1.45), P(0.82, -0.55)], look.trim, P(0.2, -1.45), P(-0.2, -0.5));
      ctx.beginPath();
      ctx.ellipse(0.05 * r, -0.55 * r, 1.8 * r, 0.22 * r, -0.07, 0, Math.PI * 2);
      p.finish(lit(ctx, P(0, -0.8), P(0, -0.3), look.trim), look.trim, 1.2);
      p.feather(P(-0.4, -1.2), P(-1.5, -2.05 + wave), P(-2.6 + back, -1.5 + wave), r * 1.1, tint(o.color, 0.3));
      break;
  }
}

/**
 * Draw the rig in its costume, back to front: things worn on the back, far
 * limbs, torso and garment, near leg, head and headgear, near arm and what it
 * holds.
 */
export function drawRig(ctx: Ctx, rig: Rig, look: Look, o: DrawOpts): void {
  const p = new Painter(ctx, o.outline);
  const c = look.costume;
  const r = look.headR;
  const lw = look.limbW;
  // Torso axes: `tu` from hip to shoulder, `tn` toward the front.
  const tLen = Math.hypot(rig.shoulder.x - rig.hip.x, rig.shoulder.y - rig.hip.y) || 1;
  const tu = unit(rig.hip, rig.shoulder);
  const tn = { x: -tu.y, y: tu.x };
  /** A point on the torso: `a` 0..1 from hip to shoulder, `s` in half torso widths toward the front. */
  const tp = (a: number, s: number): Pt => add(add(rig.hip, tu, a * tLen), tn, (s * look.torsoW) / 2);
  const up = unit(rig.shoulder, rig.head);
  const trail = Math.min(2.5, Math.abs(o.vx) / 3);
  const wave = Math.sin(o.time * 0.012) * 3;

  const limbColor = c === 'knight' ? look.trim : c === 'golem' ? look.skin : o.color;
  const torsoColor = c === 'knight' || c === 'captain' ? look.trim : o.color;
  const golem = c === 'golem';
  const bootColor = c === 'knight' ? look.trim : BOOT;
  // Limb radii: thick at the hip and shoulder, slim at the ankle and wrist.
  const thigh = [lw * 0.66, lw * 0.5], shin = [lw * 0.48, lw * 0.36], upper = [lw * 0.55, lw * 0.44], fore = [lw * 0.44, lw * 0.36];

  ctx.save();
  ctx.globalAlpha = o.alpha;
  ctx.translate(o.x, o.y);
  ctx.scale(o.facing, 1);

  // --- Worn on the back ---
  if (c === 'captain') {
    const s = rig.shoulder, hip = rig.hip;
    const drop = (hip.y - s.y) * 0.5;
    const pts = [
      { x: s.x + 3, y: s.y - 2 },
      { x: s.x - 9, y: s.y + 1 },
      { x: hip.x - 12 - trail * 8 + wave, y: hip.y + drop + 5 },
      { x: hip.x - 4 - trail * 4, y: hip.y + drop + 1 - wave * 0.5 },
      { x: hip.x + 2, y: hip.y + drop - 2 },
    ];
    p.blob(pts, look.accent, { x: s.x, y: s.y }, { x: hip.x - 10, y: hip.y + drop });
    p.line([lerp(pts[1]!, pts[2]!, 0.3), lerp(pts[0]!, pts[3]!, 0.85)], 0.8, shade(look.accent, 0.6));
  } else if (c === 'bard') {
    // A lute slung across the back: neck and pegbox, pear-shaped body, soundhole.
    const bc = tp(0.35, -1.25), ne = tp(1.35, -0.55);
    p.rod([bc, ne], 2.4, WOOD);
    p.rod([ne, add(ne, unit(bc, ne), 4)], 3, shade(WOOD, 0.7));
    const ax = unit(bc, ne), an = { x: -ax.y, y: ax.x };
    const W = look.torsoW;
    p.blob([add(bc, ax, W * 0.45), add(add(bc, an, W * 0.45), ax, 0), add(add(bc, an, W * 0.35), ax, -W * 0.5), add(bc, ax, -W * 0.68), add(add(bc, an, -W * 0.35), ax, -W * 0.5), add(bc, an, -W * 0.45)], '#b98445', add(bc, an, W), add(bc, an, -W));
    p.disc(bc, 1.8, '#2e1d10', 0);
  } else if (c === 'falconer') {
    // Quiver with arrows.
    const q0 = tp(0.15, -1.2), q1 = tp(1.05, -0.85);
    for (let k = 0; k < 3; k++) {
      const tip = add(q1, unit(q0, q1), 6 + k * 1.5);
      p.line([q1, add(tip, { x: (k - 1) * 1.5, y: 0 }, 1)], 1, '#d8c9a8');
      p.line([add(tip, { x: (k - 1) * 1.5, y: 0 }, 1), add(tip, unit(q0, q1), 3)], 2.4, look.accent);
    }
    p.rod([q0, q1], 5, LEATHER);
  } else if (golem) {
    p.rock(add(rig.shoulder, { x: -0.6, y: 0.1 }, lw), lw * 0.9, shade(look.hair, 0.8));
  }

  // --- Far limbs (in shadow) ---
  const far = (col: string) => shade(col, 0.72);
  p.limb(rig.elbowB, rig.handB, fore[0]!, fore[1]!, far(limbColor));
  p.limb(rig.shoulder, rig.elbowB, upper[0]!, upper[1]!, far(limbColor));
  if (golem) p.rock(rig.handB, lw * 0.62, far(look.skin));
  else p.hand(rig.elbowB, rig.handB, lw * 0.42, far(c === 'knight' ? look.trim : look.skin));
  if (c !== 'cleric') {
    p.limb(rig.kneeB, rig.footB, shin[0]!, shin[1]!, far(limbColor));
    p.limb(rig.hip, rig.kneeB, thigh[0]!, thigh[1]!, far(limbColor));
    if (!golem) p.foot(rig.kneeB, rig.footB, lw * 0.42, far(bootColor));
    else p.rock(rig.footB, lw * 0.5, far(look.skin));
    if (!golem && c !== 'knight') p.limb(lerp(rig.kneeB, rig.footB, 0.5), lerp(rig.kneeB, rig.footB, 0.97), shin[1]! * 1.15, shin[1]! * 1.05, far(BOOT));
  }

  // --- Torso ---
  const torso = [
    tp(-0.02, -0.92), tp(-0.04, 0.85), tp(0.35, 0.72), tp(0.72, 0.98), tp(0.97, 0.85), tp(1.07, 0.25), tp(1.05, -0.5), tp(0.95, -0.95), tp(0.55, -0.88), tp(0.3, -0.78),
  ];
  const lightFrom = tp(1.1, 0.9), lightTo = tp(0, -1.05);
  p.blob(torso, golem ? o.color : torsoColor, lightFrom, lightTo, 1.4);
  ctx.save();
  smooth(ctx, torso);
  ctx.clip();
  switch (c) {
    case 'knight':
      // Breastplate ridge, then a tabard with gold edges.
      p.line([tp(0.95, 0.4), tp(0.45, 0.55)], 1, tint(look.trim, 0.6));
      p.plate([tp(-0.1, -0.5), tp(-0.1, 0.62), tp(0.82, 0.55), tp(0.88, -0.35)], GOLD, lightFrom, lightTo, 0);
      p.plate([tp(-0.1, -0.38), tp(-0.1, 0.5), tp(0.8, 0.44), tp(0.85, -0.25)], o.color, lightFrom, lightTo, 0);
      p.line([tp(0.62, -0.05), tp(0.62, 0.35)], 1.3, GOLD);
      p.line([tp(0.5, 0.15), tp(0.72, 0.15)], 1.3, GOLD);
      break;
    case 'captain': {
      // Mail rings, then a tabard.
      ctx.strokeStyle = shade(look.trim, 0.62);
      ctx.lineWidth = 0.6;
      for (let a = 0.05; a < 1.05; a += 0.07) {
        for (let s = -1; s <= 1; s += 0.28) {
          const q = tp(a, s + (Math.round(a / 0.07) % 2) * 0.14);
          ctx.beginPath();
          ctx.arc(q.x, q.y, 1.1, 0, Math.PI);
          ctx.stroke();
        }
      }
      p.plate([tp(-0.1, -0.3), tp(-0.1, 0.45), tp(0.8, 0.4), tp(0.84, -0.22)], o.color, lightFrom, lightTo, 0);
      break;
    }
    case 'bard':
      // Slashed doublet: puffs of the accent color showing through.
      for (const s of [-0.45, 0.05, 0.55]) p.plate([tp(0.3, s - 0.1), tp(0.3, s + 0.1), tp(0.85, s + 0.08), tp(0.85, s - 0.08)], look.accent, lightFrom, lightTo, 0);
      p.line([tp(1.0, -0.4), tp(0.95, 0.6)], 2, tint(o.color, 0.4));
      break;
    case 'squire':
      // Leather jerkin with laces.
      p.plate([tp(0.05, -0.75), tp(0.05, 0.7), tp(0.82, 0.78), tp(0.85, -0.7)], LEATHER, lightFrom, lightTo, 0);
      for (let a = 0.3; a < 0.8; a += 0.15) p.line([tp(a, 0.55), tp(a + 0.06, 0.8)], 0.7, '#e8d9b8');
      break;
    case 'falconer':
      // Leather vest and a strap across the chest.
      p.plate([tp(0.1, -0.95), tp(0.1, 0.2), tp(0.9, 0.35), tp(0.95, -0.95)], LEATHER, lightFrom, lightTo, 0);
      p.line([tp(1.0, -0.8), tp(0.2, 0.85)], 2.2, shade(LEATHER, 0.7));
      break;
    case 'cleric':
      // Gold-trimmed stole down the front.
      p.line([tp(1.0, 0.35), tp(0.0, 0.3)], 2.4, look.accent, 'butt');
      p.line([tp(1.0, -0.3), tp(0.0, -0.25)], 2.4, shade(look.accent, 0.8), 'butt');
      break;
    case 'golem':
      // Cracks, moss and a glowing rune.
      p.line([tp(0.85, -0.7), tp(0.6, -0.1), tp(0.65, 0.3), tp(0.4, 0.6)], 1, shade(o.color, 0.5));
      p.line([tp(0.3, -0.9), tp(0.15, -0.4)], 1, shade(o.color, 0.5));
      p.blob([tp(1.0, -0.6), tp(0.95, 0.1), tp(1.05, 0.3), tp(1.12, -0.6)], look.trim, tp(1.1, 0), tp(0.9, 0), 0);
      p.glow(tp(0.45, 0.2), lw, 'rgba(255,150,60,0.85)');
      p.line([tp(0.55, 0.1), tp(0.45, 0.3), tp(0.35, 0.15)], 1.2, look.accent);
      break;
    case 'duelist':
      // Buttoned doublet, a sash and a white ruff.
      for (const a of [0.45, 0.6, 0.75, 0.9]) p.disc(tp(a, 0.62), 0.9, GOLD, 0);
      p.line([tp(0.85, -0.8), tp(0.15, 0.8)], 3, tint(o.color, 0.35));
      break;
  }
  // Belt with a buckle (a rope cord for the cleric, nothing for the golem).
  if (!golem) {
    p.line([tp(0.12, -1.2), tp(0.12, 1.2)], c === 'cleric' ? 1.6 : 2.6, c === 'cleric' ? look.accent : BOOT, 'butt');
    if (c !== 'cleric') p.plate([tp(0.05, 0.25), tp(0.05, 0.6), tp(0.2, 0.6), tp(0.2, 0.25)], GOLD, tp(0.2, 0.25), tp(0.05, 0.6), 0.6);
  }
  ctx.restore();
  if (c === 'duelist') p.blob([tp(1.0, -0.9), tp(1.12, 0), tp(1.0, 0.95), tp(0.92, 0)], '#f2ece0', tp(1.1, 0), tp(0.9, 0), 0.9);

  // What the far hand holds: in front of the body, behind the near arm.
  const hb = rig.handB;
  const at = (x: number, y: number): Pt => ({ x: hb.x + x, y: hb.y + y });
  if (c === 'knight') {
    // Kite shield: the tabard's color, a gold rim and cross, a sheen.
    p.plate([at(-8, -12), at(8, -12), at(9, 1), at(0, 15), at(-9, 1)], o.color, at(-6, -12), at(6, 14), 1.4);
    p.line([at(-8, -12), at(8, -12), at(9, 1), at(0, 15), at(-9, 1), at(-8, -12)], 1.6, GOLD);
    p.line([at(0, -10), at(0, 11)], 2, GOLD, 'butt');
    p.line([at(-6, -5), at(6, -5)], 2, GOLD, 'butt');
    p.line([at(-5, -9), at(-6, 0)], 1.2, 'rgba(255,255,255,0.35)');
  } else if (c === 'falconer') {
    // Recurve longbow and its string.
    const top = at(-4, -19), bot = at(-4, 19);
    ctx.beginPath();
    ctx.moveTo(top.x, top.y);
    ctx.quadraticCurveTo(hb.x + 10, hb.y, bot.x, bot.y);
    ctx.lineWidth = 4.2;
    ctx.strokeStyle = p.edge(WOOD);
    ctx.stroke();
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = WOOD;
    ctx.stroke();
    p.line([top, bot], 0.7, '#ece4d0');
  } else if (c === 'cleric') {
    // Holy staff topped with a gold ring and a glowing gem.
    p.rod([at(0, 22), at(0, -26)], 2.6, WOOD);
    ctx.beginPath();
    ctx.arc(hb.x, hb.y - 31, 5, 0, Math.PI * 2);
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 1.8;
    ctx.stroke();
    p.glow(at(0, -31), 12, 'rgba(255,230,150,0.75)');
    p.disc(at(0, -31), 2.6, look.accent, 0.8);
  }

  // --- Near leg; the cleric's robe falls over both legs ---
  if (c === 'cleric') {
    const hem = Math.max(rig.footF.y, rig.footB.y) - 3;
    const lo = Math.min(rig.footF.x, rig.footB.x, rig.hip.x) - 6, hi = Math.max(rig.footF.x, rig.footB.x, rig.hip.x) + 6;
    p.blob([tp(0.3, -1.05), tp(0.3, 1.05), { x: hi, y: hem - 2 }, { x: hi - 2, y: hem }, { x: lo + 2, y: hem }, { x: lo, y: hem - 2 }], o.color, tp(0.3, 1), { x: lo, y: hem });
    p.line([{ x: lo + 3, y: hem - 1.5 }, { x: hi - 3, y: hem - 1.5 }], 1.8, look.accent);
    p.line([lerp(tp(0.25, 0), { x: (lo + hi) / 2, y: hem }, 0.2), { x: (lo + hi) / 2 - 2, y: hem - 2 }], 0.8, shade(o.color, 0.7));
    p.foot(rig.kneeF, rig.footF, lw * 0.4, '#8a6a48');
  } else {
    p.limb(rig.kneeF, rig.footF, shin[0]!, shin[1]!, limbColor);
    p.limb(rig.hip, rig.kneeF, thigh[0]!, thigh[1]!, limbColor);
    if (golem) {
      p.rock(rig.footF, lw * 0.5, look.skin);
      p.rock(rig.kneeF, lw * 0.42, shade(look.skin, 0.9));
    } else {
      if (c !== 'knight') p.limb(lerp(rig.kneeF, rig.footF, 0.5), lerp(rig.kneeF, rig.footF, 0.97), shin[1]! * 1.15, shin[1]! * 1.05, BOOT);
      p.foot(rig.kneeF, rig.footF, lw * 0.42, bootColor);
      if (c === 'knight') p.disc(rig.kneeF, lw * 0.36, look.trim, 1); // knee cop
    }
  }

  // A tabard hangs over the thighs, swinging with the near leg.
  if (c === 'knight' || c === 'captain') {
    const down = unit(lerp(rig.hip, add(rig.hip, tu, -1), 0.5), lerp(add(rig.hip, tu, -1), rig.kneeF, 0.5));
    const len = look.thigh * 0.8;
    const top0 = tp(0.3, c === 'knight' ? -0.55 : -0.4), top1 = tp(0.3, c === 'knight' ? 0.7 : 0.5);
    const bot0 = add(add(top0, down, len + tLen * 0.3), tn, -1), bot1 = add(add(top1, down, len + tLen * 0.3), tn, 1);
    if (c === 'knight') p.plate([add(top0, tn, -1.2), add(top1, tn, 1.2), add(bot1, tn, 1.2), add(lerp(bot0, bot1, 0.5), down, 3.2), add(bot0, tn, -1.2)], GOLD, top1, bot0, 0.9);
    p.plate([top0, top1, bot1, add(lerp(bot0, bot1, 0.5), down, 2), bot0], o.color, top1, bot0, c === 'knight' ? 0 : 1);
    p.line([lerp(top0, top1, 0.5), lerp(bot0, bot1, 0.5)], 0.7, shade(o.color, 0.65));
  }

  // --- Neck and head ---
  const headBase = add(rig.head, up, -r * 0.75);
  if (!golem) p.limb(add(rig.shoulder, up, -1), headBase, r * 0.34, r * 0.3, c === 'knight' ? look.trim : look.skin);
  ctx.save();
  ctx.translate(rig.head.x, rig.head.y);
  ctx.rotate(Math.atan2(up.x, -up.y));
  drawHead(ctx, look, { color: o.color, ink: o.outline, time: o.time, trail });
  ctx.restore();

  // --- Near arm and what it holds ---
  p.limb(rig.elbowF, rig.handF, fore[0]!, fore[1]!, limbColor);
  p.limb(rig.shoulder, rig.elbowF, upper[0]!, upper[1]!, limbColor);
  if (c === 'knight') {
    // Pauldron over the shoulder, a vambrace on the forearm.
    p.blob([add(rig.shoulder, { x: -1, y: -0.2 }, lw * 0.7), add(rig.shoulder, { x: 0.3, y: -0.9 }, lw * 0.7), add(rig.shoulder, { x: 1.1, y: -0.1 }, lw * 0.7), add(rig.shoulder, { x: 0.5, y: 0.9 }, lw * 0.7), add(rig.shoulder, { x: -0.6, y: 0.8 }, lw * 0.7)], look.trim, add(rig.shoulder, { x: 0, y: -1 }, lw), add(rig.shoulder, { x: 0, y: 1 }, lw));
  } else if (c === 'bard' || c === 'duelist') {
    p.disc(lerp(rig.shoulder, rig.elbowF, 0.25), upper[0]! * 1.05, tint(o.color, 0.15), 1); // puffed sleeve
  } else if (c === 'falconer') {
    p.limb(lerp(rig.elbowF, rig.handF, 0.35), lerp(rig.elbowF, rig.handF, 0.9), fore[0]! * 1.1, fore[1]! * 1.15, LEATHER); // bracer
  }
  const d = unit(rig.elbowF, rig.handF);
  const n = { x: -d.y, y: d.x };
  if (c === 'duelist') {
    // Rapier: a long thin blade with a highlight, a gold swept hilt.
    const base = add(rig.handF, d, 3), tip = add(rig.handF, d, 44);
    p.line([base, tip], 2.8, p.edge(look.accent));
    p.line([base, tip], 1.8, look.accent);
    p.line([add(base, n, 0.4), add(tip, n, 0.4)], 0.6, '#ffffff');
    ctx.beginPath();
    const hc = add(rig.handF, d, 1);
    ctx.arc(hc.x, hc.y, 4.2, 0, Math.PI * 2);
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 1.3;
    ctx.stroke();
    p.rod([add(add(rig.handF, d, 3), n, -5), add(add(rig.handF, d, 3), n, 5)], 1.6, GOLD);
  } else if (c === 'squire') {
    // A sling dangling from the fist, a stone in its pouch.
    const pouch = { x: rig.handF.x - d.x * 2, y: rig.handF.y + 10 };
    p.line([rig.handF, pouch], 1, LEATHER);
    p.disc(pouch, 2.6, LEATHER, 1);
    p.disc({ x: pouch.x, y: pouch.y - 1 }, 1.4, '#9a9488', 0);
  }
  if (golem) p.rock(rig.handF, lw * 0.68, look.skin);
  else p.hand(rig.elbowF, rig.handF, lw * 0.44, c === 'knight' ? look.trim : look.skin);

  ctx.restore();
}

/** The fighter's head and shoulders, for HUD portraits: centered at (x, y), `size` px tall. */
export function drawPortrait(ctx: Ctx, look: Look, color: string, x: number, y: number, size: number): void {
  const k = size / (look.headR * 3.2);
  ctx.save();
  ctx.translate(x, y + size * 0.08);
  ctx.scale(k, k);
  const r = look.headR;
  const p = new Painter(ctx, undefined);
  p.blob([{ x: -r * 1.6, y: r * 1.9 }, { x: -r * 1.1, y: r * 0.95 }, { x: r * 1.2, y: r * 0.95 }, { x: r * 1.7, y: r * 1.9 }], look.costume === 'knight' || look.costume === 'captain' ? look.trim : color, { x: 0, y: r }, { x: 0, y: r * 2 });
  drawHead(ctx, look, { color, time: 0, trail: 0 });
  ctx.restore();
}
