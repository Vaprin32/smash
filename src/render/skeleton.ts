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

/** The one feature that sets a fighter's silhouette apart. */
export type Accessory = 'scarf' | 'helmet' | 'ears' | 'crest' | 'halo' | 'boulders' | 'blade' | 'cape';

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
  accessory: Accessory;
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

/** Draw the rig. Back limbs first, front limbs last; the accessory goes where it belongs in that order. */
export function drawRig(ctx: CanvasRenderingContext2D, rig: Rig, look: Look, o: DrawOpts): void {
  const W = (p: Pt) => ({ x: o.x + o.facing * p.x, y: o.y + p.y });
  const outline = o.outline ?? OUTLINE;
  const back = shade(o.color, 0.68);
  const acc = look.accessory;
  // Head axes in local space: `up` points from the neck through the head, `fwd` the way the face looks.
  const up = unit(rig.shoulder, rig.head);
  const fwd = { x: -up.y, y: up.x };
  const r = look.headR;

  const seg = (pts: Pt[], width: number, color: string) => {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    pts.forEach((p, i) => {
      const w = W(p);
      if (i === 0) ctx.moveTo(w.x, w.y);
      else ctx.lineTo(w.x, w.y);
    });
    ctx.strokeStyle = outline;
    ctx.lineWidth = width + 4;
    ctx.stroke();
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
  /** Lumpy rock centered on `c`. */
  const rock = (c: Pt, radius: number, fill: string) => {
    const lumps = [1, 0.82, 0.97, 0.78, 1.05, 0.86, 0.94];
    shape(
      lumps.map((k, i) => {
        const a = (i / lumps.length) * Math.PI * 2;
        return { x: c.x + Math.cos(a) * radius * k, y: c.y + Math.sin(a) * radius * k };
      }),
      fill,
    );
  };

  ctx.save();
  ctx.globalAlpha = o.alpha;

  // --- Behind the body ---
  const trail = -1 - Math.min(2.5, Math.abs(o.vx) / 3);
  const wave = Math.sin(o.time * 0.012) * 3;
  if (acc === 'scarf') {
    // Trails behind the neck, flutters with speed.
    const neck = rig.shoulder;
    const s1 = { x: neck.x + trail * 7, y: neck.y + 4 + wave };
    const s2 = { x: neck.x + trail * 13, y: neck.y + 9 - wave };
    seg([neck, s1, s2], 5, look.accent);
  } else if (acc === 'cape') {
    // Hangs from both shoulders to below the hips, billowing back with speed.
    const s = rig.shoulder, hp = rig.hip;
    const drop = (hp.y - s.y) * 0.45;
    shape(
      [
        { x: s.x + 3, y: s.y - 2 },
        { x: s.x - 8, y: s.y },
        { x: hp.x - 10 + trail * 8 + wave, y: hp.y + drop + 4 },
        { x: hp.x - 2 + trail * 3, y: hp.y + drop - wave * 0.5 },
      ],
      look.accent,
    );
  } else if (acc === 'boulders') {
    rock(add(add(rig.shoulder, fwd, -4), up, -2), look.limbW * 0.9, shade(look.hair, 0.75));
  }

  seg([rig.shoulder, rig.elbowB, rig.handB], look.limbW, back);
  seg([rig.hip, rig.kneeB, rig.footB], look.limbW + 1, back);
  seg([rig.hip, rig.shoulder], look.torsoW, o.color);
  // Belt
  const beltA = { x: rig.hip.x + (rig.shoulder.x - rig.hip.x) * 0.15, y: rig.hip.y + (rig.shoulder.y - rig.hip.y) * 0.15 };
  seg([beltA, beltA], look.torsoW - 2, look.accent);
  seg([rig.hip, rig.kneeF, rig.footF], look.limbW + 1, o.color);

  // --- Behind the head ---
  if (acc === 'ears') {
    for (const side of [-1, 1]) {
      const c = add(add(rig.head, up, r * 0.95), fwd, side * r * 0.62);
      disc(c, r * 0.58, look.hair);
      disc(c, r * 0.3, look.skin, 0);
    }
  } else if (acc === 'crest') {
    // Three swept-back feathers.
    for (let k = 0; k < 3; k++) {
      const base = add(add(rig.head, up, r * 0.5), fwd, -r * 0.1);
      const tip = add(add(rig.head, up, r * (1.5 - k * 0.6)), fwd, -r * (2.3 + k * 0.25));
      seg([base, tip], 5 - k, k === 1 ? look.hair : look.accent);
    }
  } else if (acc === 'boulders') {
    // Pauldron sits under the head, over the shoulder joint.
    const c = add(add(rig.shoulder, fwd, 1), up, -2);
    rock(c, look.limbW * 0.95, look.hair);
    const a = W(add(c, fwd, -4)), b = W(add(add(c, fwd, 3), up, -4));
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.strokeStyle = look.accent;
    ctx.lineWidth = 1.6;
    ctx.stroke();
  }

  // Head with hair (or a helmet) and an eye on the facing side.
  const h = W(rig.head);
  ctx.fillStyle = look.skin;
  ctx.strokeStyle = outline;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(h.x, h.y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // Hair caps the half of the head pointing away from the neck; a helmet covers more.
  const s = W(rig.shoulder);
  const upAngle = Math.atan2(h.y - s.y, h.x - s.x);
  const cover = acc === 'helmet' ? 0.75 : 0.25;
  ctx.fillStyle = acc === 'helmet' ? look.accent : look.hair;
  ctx.beginPath();
  ctx.arc(h.x, h.y, r, upAngle - Math.PI / 2 - cover, upAngle + Math.PI / 2 + cover);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  const e = W({ x: rig.head.x + r * 0.43, y: rig.head.y + 1 });
  if (acc === 'helmet') {
    // Visor slit instead of an eye.
    ctx.fillStyle = '#ffe14f';
    ctx.fillRect(e.x - (o.facing > 0 ? 2 : 4), e.y - 1.6, 6, 3.2);
  } else {
    ctx.fillStyle = OUTLINE;
    ctx.fillRect(e.x - 1.3, e.y - 2, 2.6, 4);
  }

  // --- Above the head ---
  if (acc === 'halo') {
    const c = W(add(rig.head, up, r * 1.9 + Math.sin(o.time * 0.004) * 1.5));
    const fw = W(add(rig.head, fwd, 1));
    const tilt = Math.atan2(fw.y - h.y, fw.x - h.x);
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, r * 1.05, r * 0.36, tilt, 0, Math.PI * 2);
    ctx.strokeStyle = outline;
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.strokeStyle = look.accent;
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }

  seg([rig.shoulder, rig.elbowF, rig.handF], look.limbW, o.color);
  if (acc === 'blade') {
    // A long blade held in the front hand, pointing along the forearm.
    const d = unit(rig.elbowF, rig.handF);
    const n = { x: -d.y, y: d.x };
    seg([add(rig.handF, d, 2), add(rig.handF, d, 40)], 3.5, look.accent);
    seg([add(add(rig.handF, d, 2), n, -5), add(add(rig.handF, d, 2), n, 5)], 3, look.hair);
  }
  // Fist
  disc(rig.handF, look.limbW * 0.62, look.skin);

  ctx.restore();
}
