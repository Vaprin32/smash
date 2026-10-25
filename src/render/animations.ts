// Picks a Pose for a fighter purely from sim state (action, actionFrame,
// velocity, frame). Attack poses are keyframed from each move's own data
// (charge frame, hitbox windows, grab/throw/projectile frames), so retuning
// move data keeps the animation in sync automatically.

import { Action } from '../sim/actions';
import { FIGHTERS } from '../sim/fighters';
import { ONE } from '../sim/fixed';
import { MoveId, type MoveDef } from '../sim/moves/types';
import { LEDGE_CLIMB_FRAMES, MAX_SMASH_CHARGE, SHIELD_DROP_FRAMES } from '../sim/rules';
import type { FighterState, MatchState } from '../sim/state';
import { mixPose, type Pose } from './skeleton';

function P(p: Partial<Pose>): Pose {
  return {
    torso: 4,
    head: 0,
    armF: [12, 20],
    armB: [-10, 20],
    legF: [6, -4],
    legB: [-6, -4],
    hipY: 0,
    spin: 0,
    ...p,
  };
}

const STAND = P({});
const CROUCH = P({ torso: 16, head: -6, armF: [-15, 45], armB: [-30, 45], legF: [60, -110], legB: [35, -95] });
const AIR_RISE = P({ torso: 2, armF: [150, 15], armB: [120, 25], legF: [45, -75], legB: [-5, -40] });
const AIR_FALL = P({ torso: 6, armF: [100, 25], armB: [75, 30], legF: [18, -25], legB: [-12, -35] });
const TUCK = P({ torso: 30, head: 10, armF: [70, 90], armB: [50, 100], legF: [105, -150], legB: [85, -145] });
const FAST_FALL = P({ torso: -4, armF: [172, 0], armB: [165, 5], legF: [4, 0], legB: [-4, -6] });
const DASH = P({ torso: 26, head: -10, armF: [-55, 55], armB: [55, 70], legF: [60, -40], legB: [-50, -35] });
const HURT = P({ torso: -26, head: -18, armF: [150, 40], armB: [120, 60], legF: [30, -55], legB: [-20, -40] });
/** Hanging from a ledge: arms up over the corner, legs dangling against the wall. */
const HANG = P({ torso: 6, head: -10, armF: [168, 4], armB: [158, 8], legF: [12, -18], legB: [-4, -8] });
/** Halfway up a ledge: one knee on the corner, pushing up. */
const CLIMB = P({ torso: 34, head: -14, armF: [60, 40], armB: [40, 60], legF: [100, -120], legB: [10, -30] });
const LIMP = P({ torso: 12, head: 18, armF: [25, 10], armB: [15, 10], legF: [10, -20], legB: [-10, -35] });
const GUARD = P({ torso: 12, head: -4, armF: [75, 110], armB: [62, 118], legF: [28, -40], legB: [-28, -25] });
const HOLD = P({ torso: 14, armF: [86, 10], armB: [76, 16], legF: [25, -20], legB: [-25, -10] });
const HELD = P({ torso: -12, head: -10, armF: [40, 30], armB: [20, 40], legF: [10, -30], legB: [-10, -20] });
const DRILL = P({ torso: -38, head: 14, armF: [205, 15], armB: [190, 20], legF: [42, 0], legB: [32, -8] });
const COUNTER_STANCE = P({ torso: -6, head: -4, armF: [110, -50], armB: [40, 100], legF: [30, -20], legB: [-30, -10] });

interface AttackAnim {
  windup: Pose;
  /** One pose per hitbox window (the last one repeats if there are fewer). */
  strike: Pose[];
}

const A = (windup: Pose, ...strike: Pose[]): AttackAnim => ({ windup, strike });

// Indexed by MoveId. Poses face right; the renderer mirrors them.
const ATTACKS: Record<number, AttackAnim> = {
  [MoveId.Jab1]: A(
    P({ torso: 0, armF: [30, 105], armB: [-20, 60], legF: [22, -12], legB: [-22, -6] }),
    P({ torso: 14, armF: [84, 0], armB: [-35, 75], legF: [26, -10], legB: [-26, -4] }),
  ),
  [MoveId.Jab2]: A(
    P({ torso: 10, armF: [-30, 60], armB: [30, 105], legF: [26, -10], legB: [-26, -4] }),
    P({ torso: 16, armF: [-40, 70], armB: [86, 0], legF: [26, -10], legB: [-26, -4] }),
  ),
  [MoveId.Jab3]: A(
    P({ torso: -4, armF: [-20, 50], armB: [30, 50], legF: [70, -120], legB: [-8, -6] }),
    P({ torso: -18, armF: [-45, 30], armB: [40, 40], legF: [92, 0], legB: [-10, -4] }),
  ),
  [MoveId.FTilt]: A(
    P({ torso: -6, armF: [-20, 50], armB: [30, 50], legF: [65, -115], legB: [-8, -6] }),
    P({ torso: -22, armF: [-45, 30], armB: [40, 40], legF: [96, 0], legB: [-10, -4] }),
  ),
  [MoveId.UTilt]: A(
    P({ torso: 8, armF: [-20, 40], armB: [-40, 40], legF: [50, -90], legB: [-10, -10] }),
    P({ torso: -26, head: -14, armF: [-40, 20], armB: [-60, 20], legF: [165, 0], legB: [-6, -8] }),
  ),
  [MoveId.DTilt]: A(
    P({ torso: 26, armF: [40, 40], armB: [-20, 40], legF: [50, -115], legB: [12, -115] }),
    P({ torso: 32, head: -10, armF: [25, 30], armB: [-45, 30], legF: [86, 0], legB: [18, -125] }),
  ),
  [MoveId.DashAttack]: A(
    DASH,
    P({ torso: -18, head: -6, armF: [-60, 30], armB: [140, 20], legF: [92, 0], legB: [-40, -70] }),
  ),
  [MoveId.FSmash]: A(
    P({ torso: -22, head: -6, armF: [-80, 40], armB: [-95, 40], legF: [35, -45], legB: [-35, -10] }),
    P({ torso: 30, head: -6, armF: [86, 0], armB: [78, 6], legF: [58, -45], legB: [-46, 0] }),
  ),
  [MoveId.USmash]: A(
    P({ torso: 20, head: -8, armF: [-20, 70], armB: [-40, 70], legF: [60, -115], legB: [35, -100] }),
    P({ torso: -8, head: -14, armF: [178, 0], armB: [168, 6], legF: [5, 0], legB: [-5, 0] }),
  ),
  [MoveId.DSmash]: A(
    P({ torso: 30, head: -6, armF: [40, 60], armB: [-30, 60], legF: [60, -120], legB: [40, -120] }),
    P({ torso: 36, armF: [30, 30], armB: [-30, 30], legF: [88, 0], legB: [30, -130] }),
    P({ torso: 34, head: 8, armF: [60, 30], armB: [-10, 30], legF: [40, -130], legB: [-92, 0] }),
  ),
  [MoveId.NAir]: A(TUCK, P({ torso: -14, armF: [-60, 20], armB: [140, 20], legF: [82, 0], legB: [-50, -30] })),
  [MoveId.FAir]: A(
    P({ torso: -16, head: -8, armF: [205, 10], armB: [192, 10], legF: [50, -70], legB: [10, -50] }),
    P({ torso: 26, armF: [78, 0], armB: [68, 4], legF: [20, -30], legB: [-30, -20] }),
  ),
  [MoveId.BAir]: A(
    P({ torso: 20, head: -20, armF: [60, 40], armB: [40, 50], legF: [60, -120], legB: [50, -110] }),
    P({ torso: 28, head: -20, armF: [60, 30], armB: [40, 40], legF: [40, -80], legB: [-96, 0] }),
  ),
  [MoveId.UAir]: A(
    TUCK,
    P({ torso: -28, head: -15, armF: [-40, 20], armB: [-62, 20], legF: [172, 0], legB: [-20, -40], spin: -20 }),
  ),
  [MoveId.DAir]: A(
    P({ torso: 10, armF: [150, 20], armB: [130, 20], legF: [85, -145], legB: [62, -135] }),
    P({ torso: -4, head: 10, armF: [160, 10], armB: [140, 10], legF: [6, 0], legB: [-6, 0] }),
  ),
  [MoveId.NSpecial]: A(
    P({ torso: -12, armF: [-60, 70], armB: [-75, 70], legF: [30, -20], legB: [-30, -10] }),
    P({ torso: 16, armF: [90, 0], armB: [84, 4], legF: [34, -20], legB: [-34, -6] }),
  ),
  [MoveId.SideSpecial]: A(
    P({ torso: -10, armF: [-40, 60], armB: [-60, 60], legF: [50, -90], legB: [-20, -20] }),
    P({ torso: 42, head: -12, armF: [100, 0], armB: [-60, 30], legF: [-30, -20], legB: [-60, -30] }),
  ),
  [MoveId.UpSpecial]: A(
    P({ torso: 22, armF: [10, 125], armB: [-20, 60], legF: [58, -115], legB: [32, -100] }),
    P({ torso: -6, head: -12, armF: [176, 0], armB: [148, 22], legF: [10, -10], legB: [-15, -45] }),
  ),
  // Drill dive: tucked, then feet-first down and forward, leaning back, arms trailing up.
  [MoveId.DownSpecial]: A(TUCK, DRILL),
  // Touching down out of the drill: legs snap apart in a burst.
  [MoveId.DrillLand]: A(DRILL, P({ torso: -10, head: -10, armF: [150, 10], armB: [-150, 10], legF: [55, -20], legB: [-50, -20] })),
  [MoveId.CounterStrike]: A(
    COUNTER_STANCE,
    P({ torso: 30, head: -6, armF: [72, 0], armB: [40, 10], legF: [58, -45], legB: [-46, 0] }),
  ),
  [MoveId.Grab]: A(
    P({ torso: 0, armF: [20, 40], armB: [10, 40], legF: [25, -15], legB: [-25, -8] }),
    P({ torso: 22, armF: [88, 0], armB: [80, 6], legF: [40, -30], legB: [-35, -5] }),
  ),
  [MoveId.Pummel]: A(HOLD, P({ torso: 18, armF: [100, 30], armB: [76, 16], legF: [55, -100], legB: [-25, -10] })),
  [MoveId.FThrow]: A(HOLD, P({ torso: 28, armF: [92, 0], armB: [88, 0], legF: [45, -40], legB: [-40, 0] })),
  [MoveId.BThrow]: A(
    P({ torso: 10, armF: [80, 20], armB: [70, 20], legF: [25, -20], legB: [-25, -10] }),
    P({ torso: -30, head: -20, armF: [-120, 0], armB: [-110, 10], legF: [35, -10], legB: [-30, -30] }),
  ),
  [MoveId.UThrow]: A(
    P({ torso: 18, armF: [60, 20], armB: [50, 20], legF: [55, -110], legB: [35, -100] }),
    P({ torso: -6, head: -12, armF: [175, 0], armB: [168, 5], legF: [5, 0], legB: [-5, 0] }),
  ),
  [MoveId.DThrow]: A(
    P({ torso: -6, armF: [150, 10], armB: [140, 10], legF: [20, -10], legB: [-20, -10] }),
    P({ torso: 42, head: 10, armF: [40, 0], armB: [30, 5], legF: [60, -110], legB: [30, -110] }),
  ),
};

const SHOULDER_CHARGE = P({ torso: 40, head: -14, armF: [30, 90], armB: [-40, 60], legF: [60, -40], legB: [-50, -35] });
const OVERHEAD = P({ torso: -10, head: -8, armF: [170, 10], armB: [160, 10], legF: [30, -30], legB: [-30, -10] });
const SLAM = P({ torso: 40, head: 10, armF: [40, 0], armB: [30, 0], legF: [50, -60], legB: [-40, -20] });

/**
 * Per-fighter overrides (by fighter name, then MoveId) for signature moves
 * whose shape differs from Wisp's. Anything not listed uses ATTACKS.
 */
/** Knee up, then both feet slam down (a stomp felt on both sides). */
const KNEE_UP = P({ torso: -4, head: -6, armF: [40, 50], armB: [-40, 50], legF: [95, -100], legB: [-6, -8] });
const STOMP = P({ torso: 18, head: 8, armF: [30, 20], armB: [-30, 20], legF: [40, -60], legB: [-40, -60] });
/** Low, arms flung out to both sides (scatter, pillars, quake). */
const SPREAD_LOW = P({ torso: 22, head: -6, armF: [95, 0], armB: [-95, 0], legF: [70, -110], legB: [25, -115] });
/** Splits on the ground, one leg each way. */
const SPLITS = P({ torso: 30, head: -8, armF: [40, 30], armB: [-40, 30], legF: [92, 0], legB: [-92, 0] });
/** Arms sweeping over the top: in front, overhead, behind. */
const ARC_FRONT = P({ torso: 6, head: -10, armF: [120, 0], armB: [100, 10], legF: [30, -20], legB: [-30, -10] });
const ARC_TOP = P({ torso: -6, head: -16, armF: [178, 0], armB: [165, 6], legF: [10, -10], legB: [-10, -10] });
const ARC_BACK = P({ torso: -20, head: -22, armF: [-140, 0], armB: [-120, 10], legF: [25, -10], legB: [-35, -20] });
/** A two-handed blade raised high behind the head, then brought down in front. */
const CLEAVE_UP = P({ torso: -14, head: -10, armF: [200, 20], armB: [190, 20], legF: [30, -20], legB: [-30, -10] });
const CLEAVE_DOWN = P({ torso: 34, head: 4, armF: [70, 0], armB: [62, 6], legF: [55, -50], legB: [-45, 0] });
/** Heavy front kick. */
const BIG_KICK = P({ torso: -26, head: -8, armF: [-50, 30], armB: [50, 40], legF: [100, 0], legB: [-12, -6] });

const CHAR_ATTACKS: Record<string, Record<number, AttackAnim>> = {
  Brick: {
    [MoveId.SideSpecial]: A(DASH, SHOULDER_CHARGE),
    [MoveId.DSmash]: A(KNEE_UP, STOMP),
  },
  Pip: {
    [MoveId.FSmash]: ATTACKS[MoveId.NSpecial]!,
    [MoveId.DSmash]: A(CROUCH, SPREAD_LOW),
  },
  Kestrel: {
    [MoveId.SideSpecial]: A(
      TUCK,
      P({ torso: 34, head: -8, armF: [-50, 20], armB: [-70, 20], legF: [62, 0], legB: [-15, -70] }),
    ),
    [MoveId.FSmash]: ATTACKS[MoveId.SideSpecial]!,
    [MoveId.USmash]: A(CROUCH, ARC_FRONT, ARC_TOP, ARC_BACK),
    [MoveId.DSmash]: A(CROUCH, SPLITS),
  },
  Lumen: {
    [MoveId.SideSpecial]: ATTACKS[MoveId.NSpecial]!,
    [MoveId.DSmash]: A(GUARD, SPREAD_LOW),
  },
  Basalt: {
    [MoveId.NSpecial]: A(OVERHEAD, SLAM),
    [MoveId.SideSpecial]: A(DASH, SHOULDER_CHARGE),
    [MoveId.USmash]: A(CROUCH, ARC_TOP),
    [MoveId.DSmash]: A(OVERHEAD, { ...SPREAD_LOW, torso: 38, armF: [40, 0], armB: [-40, 0] }),
  },
  Rook: {
    [MoveId.FSmash]: A(KNEE_UP, BIG_KICK),
    [MoveId.DownSpecial]: A(GUARD, COUNTER_STANCE), // Riposte, a counter
  },
  Sable: {
    [MoveId.FSmash]: A(CLEAVE_UP, ARC_TOP, CLEAVE_DOWN),
    [MoveId.USmash]: A(CROUCH, ARC_FRONT, ARC_TOP, ARC_BACK),
    [MoveId.DSmash]: A(CROUCH, { ...SPREAD_LOW, torso: 34, armF: [80, 0], armB: [-80, 0] }),
    [MoveId.SideSpecial]: ATTACKS[MoveId.FSmash]!,
  },
};

const ease = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);

/** Frame windows where a move "connects", for posing: hitboxes, else grab/throw/projectile/counter. */
function activeWindows(m: MoveDef): [number, number][] {
  if (m.hitboxes.length > 0) {
    // Hitboxes active at the same time share a pose.
    const spans: [number, number][] = [];
    for (const h of m.hitboxes) {
      const last = spans[spans.length - 1];
      if (last && h.start <= last[1]) last[1] = Math.max(last[1], h.end);
      else spans.push([h.start, h.end]);
    }
    return spans;
  }
  if (m.grabbox) return [[m.grabbox.start, m.grabbox.end]];
  if (m.throw) return [[m.throw.frame, m.throw.frame + 2]];
  if (m.pummel) return [[m.pummel.frame, m.pummel.frame + 1]];
  if (m.projectile) return [[m.projectile.frame, m.projectile.frame + 3]];
  if (m.counter) return [[m.counter[0], m.counter[1]]];
  return [[1, 1]];
}

function attackPose(f: FighterState, base: Pose): Pose {
  const def = FIGHTERS[f.charId]!;
  const m = def.moves[f.move];
  const anim = CHAR_ATTACKS[def.name]?.[f.move] ?? ATTACKS[f.move];
  if (!m || !anim) return base;
  const windows = activeWindows(m);
  const first = windows[0]![0];

  // Keyframes: base -> wind-up (held through any charge) -> strike per window -> base.
  const keys: [number, Pose][] = [[0, base]];
  const windupAt = Math.max(1, first - 1);
  if (m.chargeFrame !== undefined && m.chargeFrame < windupAt) keys.push([m.chargeFrame, anim.windup]);
  keys.push([windupAt, anim.windup]);
  windows.forEach(([s, e], i) => {
    const pose = anim.strike[Math.min(i, anim.strike.length - 1)]!;
    keys.push([Math.max(s, keys[keys.length - 1]![0] + 1), pose], [e, pose]);
  });
  keys.push([Math.max(m.total, keys[keys.length - 1]![0] + 1), base]);

  const t = f.actionFrame;
  for (let i = 1; i < keys.length; i++) {
    const [k1, p1] = keys[i]!;
    if (t > k1) continue;
    const [k0, p0] = keys[i - 1]!;
    const u = k1 === k0 ? 1 : (t - k0) / (k1 - k0);
    const pose = mixPose(p0, p1, ease(clamp01(u)));
    // Multi-hit (the drill): legs flutter every frame while it's hitting.
    if (m.rehit && t >= first && t <= windows[windows.length - 1]![1]) {
      const k = t & 1 ? 9 : -9;
      return { ...pose, legF: [pose.legF[0] + k, pose.legF[1]], legB: [pose.legB[0] - k, pose.legB[1]], spin: pose.spin + k * 0.4 };
    }
    return pose;
  }
  return base;
}

function airPose(f: FighterState): Pose {
  if (f.fastFall) return FAST_FALL;
  const st = FIGHTERS[f.charId]!.stats;
  // Double jump: a forward flip while rising.
  if (f.jumpsLeft === 0 && f.vy < 0) {
    const progress = clamp01(1 + f.vy / st.doubleJumpSpeed);
    return { ...TUCK, spin: 360 * ease(progress) };
  }
  const vy = f.vy / ONE;
  return mixPose(AIR_RISE, AIR_FALL, ease(clamp01((vy + 5) / 10)));
}

function walkPose(phase: number, amp: number, knee: number, lean: number, armBend: number): Pose {
  const s = Math.sin(phase);
  const c = Math.cos(phase);
  return P({
    torso: lean,
    legF: [amp * s, -8 - knee * Math.max(0, c)],
    legB: [-amp * s, -8 - knee * Math.max(0, -c)],
    armF: [-amp * 0.8 * s, armBend],
    armB: [amp * 0.8 * s, armBend],
  });
}

export interface Animated {
  pose: Pose;
  /** Keep the lowest foot on the ground. */
  planted: boolean;
  /** Smash attack being charged: 0..1, else 0. */
  charging: number;
}

/** Standing and breathing; `frame` drives the breath. Also used by the character select preview. */
export function idlePose(frame: number): Pose {
  const breathe = Math.sin(frame * 0.07);
  return P({ torso: 4 + breathe * 1.5, armF: [12, 20 + breathe * 5], armB: [-10, 20 + breathe * 5] });
}

/** Arms up, bouncing. For the results screen. */
export function victoryPose(frame: number): Pose {
  const b = Math.abs(Math.sin(frame * 0.09));
  return P({ torso: -6, head: -14, armF: [170 - b * 20, 10], armB: [150 + b * 20, 15], legF: [12, -10 - b * 30], legB: [-12, -8 - b * 30] });
}

/** Slumped. For the results screen. */
export function defeatPose(frame: number): Pose {
  return { ...LIMP, head: 22 + Math.sin(frame * 0.03) * 3, legF: [16, -30], legB: [-12, -40] };
}

export function animate(f: FighterState, state: MatchState): Animated {
  const grounded = f.ground >= 0;
  const st = FIGHTERS[f.charId]!.stats;
  const t = f.actionFrame;
  const out = (pose: Pose, planted: boolean): Animated => ({ pose, planted, charging: 0 });

  switch (f.action) {
    case Action.Idle:
    case Action.Respawn:
      return out(idlePose(state.frame), grounded);
    case Action.Walk:
      return out(walkPose(t * 0.24, 26, 30, 6, 22), true);
    case Action.Run:
      return out(walkPose(t * 0.34, 44, 70, 16, 85), true);
    case Action.Dash:
      return out(mixPose(CROUCH, DASH, ease(clamp01(t / 3))), true);
    case Action.JumpSquat:
      return out(mixPose(STAND, CROUCH, ease(clamp01((t + 1) / st.jumpSquat))), true);
    case Action.Landing:
      return out(mixPose(CROUCH, STAND, ease(clamp01(t / Math.max(1, f.landLag)))), true);
    case Action.Air:
      return out(airPose(f), false);
    case Action.Attack: {
      const m = FIGHTERS[f.charId]!.moves[f.move];
      const charging = m?.chargeFrame !== undefined && t === m.chargeFrame && f.charge > 0 ? Math.min(f.charge, MAX_SMASH_CHARGE) / MAX_SMASH_CHARGE : 0;
      return { pose: attackPose(f, grounded ? STAND : AIR_FALL), planted: grounded, charging };
    }
    case Action.Hitstun: {
      const speed = (Math.abs(f.vx) + Math.abs(f.vy)) / ONE;
      const tumble = !grounded && speed > 8 ? -t * 22 : 0;
      return out({ ...HURT, spin: tumble }, grounded);
    }
    case Action.SpecialFall:
      return out(LIMP, false);
    case Action.Roll: {
      // Forward roll if moving the way we face, back roll otherwise.
      const dir = Math.sign(f.vx) * f.facing || 1;
      return out({ ...TUCK, spin: dir * 360 * ease(clamp01(t / st.rollFrames)) }, true);
    }
    case Action.SpotDodge:
      return out(mixPose(STAND, { ...CROUCH, torso: -12 }, Math.sin(Math.PI * clamp01(t / st.spotDodgeFrames))), true);
    case Action.AirDodge:
      return out(TUCK, false);
    case Action.Shield:
    case Action.ShieldStun:
      return out(GUARD, true);
    case Action.ShieldDrop:
      return out(mixPose(GUARD, STAND, ease(clamp01(t / SHIELD_DROP_FRAMES))), true);
    case Action.Holding:
      return out(HOLD, true);
    case Action.Held: {
      const w = Math.sin(state.frame * 0.4) * 6;
      return out({ ...HELD, armF: [40 + w, 30], armB: [20 - w, 40] }, grounded);
    }
    case Action.LedgeHang: {
      const sway = Math.sin(state.frame * 0.08) * 4;
      return out({ ...HANG, legF: [12 + sway, -18], legB: [-4 - sway, -8] }, false);
    }
    case Action.LedgeClimb:
    case Action.LedgeClimbAttack:
    case Action.LedgeClimbRoll: {
      const k = clamp01(t / LEDGE_CLIMB_FRAMES);
      return out(k < 0.5 ? mixPose(HANG, CLIMB, ease(k * 2)) : mixPose(CLIMB, CROUCH, ease(k * 2 - 1)), false);
    }
    case Action.ShieldBreak: {
      if (!grounded) return out(HURT, false);
      const w = state.frame * 0.09;
      return out(
        P({
          torso: 10 + Math.sin(w) * 14,
          head: 15 + Math.sin(w * 1.3) * 20,
          armF: [5 + Math.sin(w) * 10, 10],
          armB: [-5 + Math.sin(w) * 10, 10],
          legF: [14, -25],
          legB: [-10, -20],
        }),
        true,
      );
    }
  }
  return out(STAND, grounded);
}
