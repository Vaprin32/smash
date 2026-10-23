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

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${ch((n >> 16) & 255)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
}

/** Mix a #rrggbb color toward white by `t` (0..1), e.g. for readable text in a fighter's color. */
export function tint(hex: string, t: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.round(v + (255 - v) * t);
  return `rgb(${ch((n >> 16) & 255)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
}

const OUTLINE = '#11131f';

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
  /** Flutter / bob phase for accessories (render time in ms). */
  time: number;
  /** World-space velocity in px/frame, for trailing cloth. */
  vx: number;
}

const add = (p: Pt, d: Pt, k: number): Pt => ({ x: p.x + d.x * k, y: p.y + d.y * k });

function unit(from: Pt, to: Pt): Pt {
  const dx = to.x - from.x, dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len };
}

const LEATHER = '#6b4426';
const BOOT = '#3d2717';
const WOOD = '#8a5a32';
const GOLD = '#d9a441';

/** The color on top of a fighter's head (helmet, hat, hood or hair), for small portraits. */
export function capColor(look: Look): string {
  switch (look.costume) {
    case 'bard':
      return look.accent;
    case 'golem':
      return look.skin;
    case 'knight':
    case 'squire':
    case 'captain':
    case 'falconer':
    case 'cleric':
    case 'duelist':
      return look.trim;
  }
}

/**
 * Draw the rig in its costume, back to front: things worn on the back, far
 * limbs, torso and garment, near leg, head and headgear, near arm and what it
 * holds.
 */
export function drawRig(ctx: CanvasRenderingContext2D, rig: Rig, look: Look, o: DrawOpts): void {
  const W = (p: Pt) => ({ x: o.x + o.facing * p.x, y: o.y + p.y });
  const outline = o.outline ?? OUTLINE;
  const c = look.costume;
  const r = look.headR;
  // Head axes: `up` points from the neck through the head, `fwd` the way the face looks.
  const up = unit(rig.shoulder, rig.head);
  const fwd = { x: -up.y, y: up.x };
  /** A point near the head, in head radii along `fwd` and `up`. */
  const hp = (f: number, u: number): Pt => add(add(rig.head, fwd, f * r), up, u * r);
  // Torso axes: `tu` from hip to shoulder, `tn` toward the front.
  const tLen = Math.hypot(rig.shoulder.x - rig.hip.x, rig.shoulder.y - rig.hip.y) || 1;
  const tu = unit(rig.hip, rig.shoulder);
  const tn = { x: -tu.y, y: tu.x };
  /** A point on the torso: `a` 0..1 from hip to shoulder, `s` in half torso widths toward the front. */
  const tp = (a: number, s: number): Pt => add(add(rig.hip, tu, a * tLen), tn, (s * look.torsoW) / 2);

  const line = (pts: Pt[], width: number, color: string, outlined = true) => {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    pts.forEach((p, i) => {
      const w = W(p);
      if (i === 0) ctx.moveTo(w.x, w.y);
      else ctx.lineTo(w.x, w.y);
    });
    if (outlined) {
      ctx.strokeStyle = outline;
      ctx.lineWidth = width + 4;
      ctx.stroke();
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
  };
  const shape = (pts: Pt[], fill: string, lineWidth = 2) => {
    ctx.beginPath();
    pts.forEach((p, i) => {
      const w = W(p);
      if (i === 0) ctx.moveTo(w.x, w.y);
      else ctx.lineTo(w.x, w.y);
    });
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    if (lineWidth <= 0) return;
    ctx.strokeStyle = outline;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  };
  const disc = (p: Pt, radius: number, fill: string, lineWidth = 2) => {
    const w = W(p);
    ctx.beginPath();
    ctx.arc(w.x, w.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    if (lineWidth <= 0) return;
    ctx.strokeStyle = outline;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  };
  /** Lumpy rock centered on `p`. */
  const rock = (p: Pt, radius: number, fill: string) => {
    const lumps = [1, 0.82, 0.97, 0.78, 1.05, 0.86, 0.94];
    shape(
      lumps.map((k, i) => {
        const a = (i / lumps.length) * Math.PI * 2;
        return { x: p.x + Math.cos(a) * radius * k, y: p.y + Math.sin(a) * radius * k };
      }),
      fill,
    );
  };
  const glow = (p: Pt, radius: number, color: string) => {
    const w = W(p);
    const g = ctx.createRadialGradient(w.x, w.y, 0, w.x, w.y, radius);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(255,140,40,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(w.x, w.y, radius, 0, Math.PI * 2);
    ctx.fill();
  };

  const limb = c === 'knight' ? look.trim : c === 'golem' ? look.skin : o.color;
  const torsoColor = c === 'knight' || c === 'captain' ? look.trim : o.color;
  const trail = -1 - Math.min(2.5, Math.abs(o.vx) / 3);
  const wave = Math.sin(o.time * 0.012) * 3;

  ctx.save();
  ctx.globalAlpha = o.alpha;

  // --- Worn on the back ---
  if (c === 'captain') {
    // Cape from both shoulders to below the hips, billowing back with speed.
    const s = rig.shoulder, hip = rig.hip;
    const drop = (hip.y - s.y) * 0.45;
    shape(
      [
        { x: s.x + 3, y: s.y - 2 },
        { x: s.x - 8, y: s.y },
        { x: hip.x - 10 + trail * 8 + wave, y: hip.y + drop + 4 },
        { x: hip.x - 2 + trail * 3, y: hip.y + drop - wave * 0.5 },
      ],
      look.accent,
    );
  } else if (c === 'bard') {
    // A lute slung across the back.
    line([tp(0.35, -1.1), tp(1.3, -0.5)], 3, WOOD);
    const body = W(tp(0.3, -1.15));
    ctx.beginPath();
    ctx.ellipse(body.x, body.y, look.torsoW * 0.62, look.torsoW * 0.48, 0.5 * o.facing, 0, Math.PI * 2);
    ctx.fillStyle = '#b07a3a';
    ctx.fill();
    ctx.strokeStyle = outline;
    ctx.lineWidth = 2;
    ctx.stroke();
    disc(tp(0.3, -1.15), 2, '#3a2414', 0);
  } else if (c === 'falconer') {
    // Quiver with fletched arrows poking out.
    line([tp(0.15, -1.1), tp(1.05, -0.8)], 6, LEATHER);
    for (let k = 0; k < 3; k++) line([tp(1.0, -0.95 + k * 0.15), tp(1.35, -1.25 + k * 0.25)], 2, look.accent, false);
  } else if (c === 'golem') {
    rock(add(add(rig.shoulder, fwd, -4), up, -2), look.limbW * 0.9, shade(look.hair, 0.75));
  }

  // --- Far limbs ---
  line([rig.shoulder, rig.elbowB, rig.handB], look.limbW, shade(limb, 0.68));
  line([rig.hip, rig.kneeB, rig.footB], look.limbW + 1, shade(limb, 0.68));
  const boot = (knee: Pt, foot: Pt, dim: number) => {
    if (c === 'golem' || c === 'cleric') return;
    const from = { x: knee.x + (foot.x - knee.x) * 0.55, y: knee.y + (foot.y - knee.y) * 0.55 };
    line([from, foot], look.limbW + 1.5, shade(c === 'knight' ? look.trim : BOOT, dim));
  };
  boot(rig.kneeB, rig.footB, 0.75);

  // --- Torso and garment ---
  line([rig.hip, rig.shoulder], look.torsoW, torsoColor);
  switch (c) {
    case 'knight':
    case 'captain':
      // Tabard over plate (knight) or mail (captain); the knight's has gold edges.
      if (c === 'knight') line([tp(0, 0), tp(0.86, 0)], look.torsoW * 0.78, GOLD, false);
      line([tp(0.02, 0), tp(0.84, 0)], look.torsoW * (c === 'knight' ? 0.66 : 0.5), o.color, false);
      if (c === 'captain') for (let a = 0.25; a < 0.95; a += 0.17) line([tp(a, -0.85), tp(a, -0.55)], 1, shade(look.trim, 0.7), false);
      break;
    case 'bard':
      // Slashed doublet.
      for (const a of [0.35, 0.6]) line([tp(a, -0.5), tp(a + 0.15, 0.5)], 2.5, look.accent, false);
      break;
    case 'squire':
      // Leather jerkin over the tunic.
      line([tp(0.12, 0), tp(0.78, 0)], look.torsoW * 0.62, LEATHER, false);
      break;
    case 'falconer':
      // Strap across the chest.
      line([tp(0.95, -0.8), tp(0.2, 0.8)], 2.5, LEATHER, false);
      break;
    case 'cleric':
      // Gold stole down the front.
      line([tp(0.95, 0.35), tp(0.1, 0.35)], 2.5, look.accent, false);
      break;
    case 'golem': {
      // Cracks and a glowing rune.
      line([tp(0.75, -0.6), tp(0.55, -0.1), tp(0.6, 0.3)], 1.2, shade(o.color, 0.55), false);
      glow(tp(0.5, 0.25), 9, 'rgba(255,150,60,0.9)');
      disc(tp(0.5, 0.25), 2.4, look.accent, 0);
      break;
    }
    case 'duelist':
      // Buttoned doublet with a sash.
      for (const a of [0.45, 0.62, 0.79]) disc(tp(a, 0.6), 1.2, GOLD, 0);
      line([tp(0.85, -0.6), tp(0.15, 0.6)], 3, shade(o.color, 1.7), false);
      break;
  }
  // Belt (a rope cord for the cleric, nothing for the golem).
  if (c !== 'golem') {
    const belt = tp(0.15, 0);
    line([belt, belt], look.torsoW - 2, c === 'cleric' ? look.accent : BOOT, false);
    if (c !== 'cleric') disc(tp(0.15, 0.3), 1.6, GOLD, 0);
  }

  // What the far hand holds: in front of the body, behind the near arm.
  const hb = rig.handB;
  if (c === 'knight') {
    // Kite shield in the tabard's color, with a gold cross.
    const s = (fx: number, fy: number): Pt => ({ x: hb.x + fx, y: hb.y + fy });
    shape([s(-8, -11), s(8, -11), s(8, 2), s(0, 14), s(-8, 2)], o.color, 2.5);
    line([s(0, -9), s(0, 10)], 2, GOLD, false);
    line([s(-6, -4), s(6, -4)], 2, GOLD, false);
  } else if (c === 'falconer') {
    // Longbow: a curved stave and its string.
    const top = { x: hb.x - 3, y: hb.y - 18 }, mid = { x: hb.x + 5, y: hb.y }, bot = { x: hb.x - 3, y: hb.y + 18 };
    line([top, mid, bot], 2.5, WOOD);
    line([top, bot], 0.8, '#e8e0cc', false);
  } else if (c === 'cleric') {
    // Holy staff topped with a glowing gem.
    line([{ x: hb.x, y: hb.y + 20 }, { x: hb.x, y: hb.y - 26 }], 3, WOOD);
    glow({ x: hb.x, y: hb.y - 29 }, 9, 'rgba(255,230,140,0.8)');
    disc({ x: hb.x, y: hb.y - 29 }, 3.2, look.accent);
  }

  // --- Near leg; the cleric's robe falls over both legs ---
  line([rig.hip, rig.kneeF, rig.footF], look.limbW + 1, limb);
  boot(rig.kneeF, rig.footF, 1);
  if (c === 'cleric') {
    const hem = Math.max(rig.footF.y, rig.footB.y) - 4;
    const lo = Math.min(rig.footF.x, rig.footB.x, rig.hip.x) - 5, hi = Math.max(rig.footF.x, rig.footB.x, rig.hip.x) + 5;
    shape([tp(0.25, -1.1), tp(0.25, 1.1), { x: hi, y: hem }, { x: lo, y: hem }], o.color);
    line([{ x: lo + 2, y: hem - 2 }, { x: hi - 2, y: hem - 2 }], 2, look.accent, false);
  }

  // --- Head and headgear ---
  if (c === 'golem') {
    rock(add(add(rig.shoulder, fwd, 1), up, -2), look.limbW * 0.95, look.hair); // pauldron
  } else if (c === 'falconer') {
    // Hood behind the head, its long tail trailing back.
    disc(rig.head, r * 1.22, look.trim);
    line([hp(-0.9, 0.5), hp(-2 + trail * 0.3, -0.3 + wave * 0.08), hp(-2.6 + trail * 0.5, -1.2)], 4, look.trim);
  } else if (c === 'cleric') {
    // A faint halo behind the mitre.
    const h = W(hp(0, 0.9));
    ctx.beginPath();
    ctx.arc(h.x, h.y, r * 1.75, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,226,122,0.55)';
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }

  if (c === 'golem') rock(rig.head, r, look.skin);
  else disc(rig.head, r, look.skin, 2.5);

  // Hair under hats; the knight's helm and the cleric's mitre cover it.
  if (c !== 'knight' && c !== 'golem' && c !== 'falconer') {
    shape([hp(-1, 0.1), hp(-0.95, 0.55), hp(-0.5, 0.95), hp(0.3, 1), hp(0.8, 0.6), hp(0.2, 0.55), hp(-0.4, 0.2)], look.hair, 2);
  }

  const e = hp(0.45, 0.05);
  switch (c) {
    case 'knight':
      // Great helm with an eye slit and a plume.
      shape([hp(-1.12, -1.05), hp(1.18, -1.05), hp(1.22, 0.85), hp(0.85, 1.18), hp(-0.85, 1.18), hp(-1.12, 0.85)], look.trim, 2.5);
      line([hp(0.25, 0.12), hp(1.2, 0.12)], 2, '#1d1f24', false);
      line([hp(1.0, -0.2), hp(1.0, -0.85)], 1, shade(look.trim, 0.6), false);
      line([hp(0, 1.15), hp(-0.8, 1.7 + wave * 0.08), hp(-1.6 + trail * 0.3, 1.25)], 3.5, look.accent);
      break;
    case 'captain':
      // Nasal helm and a beard.
      shape([hp(-0.4, -0.45), hp(1.0, -0.45), hp(0.75, -1.2), hp(0.15, -1.15)], look.hair, 1.5);
      shape([hp(-1.08, 0.1), hp(-0.9, 0.8), hp(0, 1.2), hp(0.9, 0.8), hp(1.08, 0.1)], look.trim, 2);
      line([hp(0.98, 0.1), hp(1.02, -0.45)], 2.2, look.trim);
      break;
    case 'squire':
      // Kettle hat: a steel dome with a wide brim.
      shape([hp(-1, 0.35), hp(-0.8, 1.0), hp(0, 1.28), hp(0.8, 1.0), hp(1, 0.35)], look.trim, 2);
      line([hp(-1.55, 0.3), hp(1.55, 0.3)], 2.5, look.trim);
      break;
    case 'bard':
      // Floppy cap with a long feather.
      shape([hp(-1.2, 0.4), hp(-0.7, 1.3), hp(0.9, 1.3), hp(1.35, 0.6), hp(0.2, 0.55)], look.accent, 2);
      line([hp(-0.4, 1.15), hp(-1.6, 2.0 + wave * 0.1), hp(-2.5 + trail * 0.3, 2.1)], 2.5, look.trim);
      break;
    case 'falconer':
      // Hood rim around the face, with a feather.
      shape([hp(-1.2, -0.3), hp(-1.15, 0.9), hp(0, 1.32), hp(0.95, 0.95), hp(1.1, 0.3), hp(0.55, 0.75), hp(-0.3, 0.75), hp(-0.75, -0.1)], look.trim, 2);
      line([hp(-0.6, 1.05), hp(-1.5, 1.8)], 2.5, look.accent);
      break;
    case 'cleric':
      // Tall mitre with a gold cross.
      shape([hp(-0.78, 0.6), hp(-0.65, 1.95), hp(0, 2.55), hp(0.65, 1.95), hp(0.78, 0.6)], look.trim, 2);
      line([hp(0, 0.85), hp(0, 2.1)], 2, look.accent, false);
      line([hp(-0.35, 1.55), hp(0.35, 1.55)], 2, look.accent, false);
      break;
    case 'golem':
      // Moss on the crown.
      line([hp(-0.6, 0.85), hp(0.4, 0.95)], 3, look.trim, false);
      break;
    case 'duelist':
      // Wide-brimmed hat with a plume.
      shape([hp(-0.75, 0.5), hp(-0.6, 1.4), hp(0.6, 1.45), hp(0.8, 0.55)], look.trim, 2);
      line([hp(-1.75, 0.4), hp(1.75, 0.65)], 3, look.trim);
      line([hp(-0.5, 1.25), hp(-1.5, 1.95 + wave * 0.1), hp(-2.4 + trail * 0.3, 1.55)], 4, shade(o.color, 1.8));
      break;
  }
  // Eyes: the knight looks out through the slit; the golem's glow.
  if (c === 'golem') {
    glow(e, 6, 'rgba(255,150,60,0.9)');
    disc(e, 1.8, look.accent, 0);
  } else if (c !== 'knight') {
    const w = W(e);
    ctx.fillStyle = OUTLINE;
    ctx.fillRect(w.x - 1.3, w.y - 2, 2.6, 4);
  }

  // --- Near arm and what it holds ---
  line([rig.shoulder, rig.elbowF, rig.handF], look.limbW, limb);
  if (c === 'knight') disc(rig.shoulder, look.limbW * 0.7, look.trim); // pauldron
  const d = unit(rig.elbowF, rig.handF);
  const n = { x: -d.y, y: d.x };
  if (c === 'duelist') {
    // Rapier with a gold guard.
    line([add(rig.handF, d, 2), add(rig.handF, d, 42)], 2.5, look.accent);
    line([add(add(rig.handF, d, 2), n, -5), add(add(rig.handF, d, 2), n, 5)], 2.5, GOLD);
  } else if (c === 'squire') {
    // A sling dangling from the fist.
    const pouch = { x: rig.handF.x - d.x * 2, y: rig.handF.y + 9 };
    line([rig.handF, pouch], 1.2, LEATHER, false);
    disc(pouch, 2.5, LEATHER, 1.5);
  }
  if (c === 'golem') rock(rig.handF, look.limbW * 0.75, look.skin);
  else disc(rig.handF, look.limbW * 0.62, c === 'knight' ? look.trim : look.skin);

  ctx.restore();
}
