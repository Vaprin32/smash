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
  /** Scarf flutter phase (render time). */
  time: number;
  /** World-space velocity in px/frame, for the scarf. */
  vx: number;
}

/** Draw the rig. Back limbs first, front limbs last. */
export function drawRig(ctx: CanvasRenderingContext2D, rig: Rig, look: Look, o: DrawOpts): void {
  const W = (p: Pt) => ({ x: o.x + o.facing * p.x, y: o.y + p.y });
  const outline = o.outline ?? OUTLINE;
  const back = shade(o.color, 0.68);

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

  ctx.save();
  ctx.globalAlpha = o.alpha;

  // Scarf: trails behind the neck, flutters with speed.
  const neck = rig.shoulder;
  const trail = -1 - Math.min(2.5, Math.abs(o.vx) / 3);
  const wave = Math.sin(o.time * 0.012) * 3;
  const s1 = { x: neck.x + trail * 7, y: neck.y + 4 + wave };
  const s2 = { x: neck.x + trail * 13, y: neck.y + 9 - wave };
  seg([neck, s1, s2], 5, look.accent);

  seg([rig.shoulder, rig.elbowB, rig.handB], look.limbW, back);
  seg([rig.hip, rig.kneeB, rig.footB], look.limbW + 1, back);
  seg([rig.hip, rig.shoulder], look.torsoW, o.color);
  // Belt
  const beltA = { x: rig.hip.x + (rig.shoulder.x - rig.hip.x) * 0.15, y: rig.hip.y + (rig.shoulder.y - rig.hip.y) * 0.15 };
  seg([beltA, beltA], look.torsoW - 2, look.accent);
  seg([rig.hip, rig.kneeF, rig.footF], look.limbW + 1, o.color);

  // Head with hair and an eye on the facing side.
  const h = W(rig.head);
  ctx.fillStyle = look.skin;
  ctx.strokeStyle = outline;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(h.x, h.y, look.headR, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // Hair caps the half of the head pointing away from the neck.
  const s = W(rig.shoulder);
  const upAngle = Math.atan2(h.y - s.y, h.x - s.x);
  ctx.fillStyle = look.hair;
  ctx.beginPath();
  ctx.arc(h.x, h.y, look.headR, upAngle - Math.PI / 2 - 0.25, upAngle + Math.PI / 2 + 0.25);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  const eye = { x: rig.head.x + 3.2, y: rig.head.y + 1 };
  const e = W(eye);
  ctx.fillStyle = OUTLINE;
  ctx.fillRect(e.x - 1.3, e.y - 2, 2.6, 4);

  seg([rig.shoulder, rig.elbowF, rig.handF], look.limbW, o.color);
  // Fist
  const hf = W(rig.handF);
  ctx.fillStyle = look.skin;
  ctx.strokeStyle = outline;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(hf.x, hf.y, look.limbW * 0.62, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.restore();
}
