// Picks a Pose for a fighter purely from sim state (action, actionFrame,
// velocity, frame). Attack poses are timed from each move's hitbox frames, so
// retuning move data keeps the animation in sync automatically.

import { Action } from '../sim/actions';
import { FIGHTERS } from '../sim/fighters';
import { ONE } from '../sim/fixed';
import { MoveId } from '../sim/moves/types';
import { SHIELD_DROP_FRAMES } from '../sim/rules';
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
const LIMP = P({ torso: 12, head: 18, armF: [25, 10], armB: [15, 10], legF: [10, -20], legB: [-10, -35] });
const GUARD = P({ torso: 12, head: -4, armF: [75, 110], armB: [62, 118], legF: [28, -40], legB: [-28, -25] });

interface AttackAnim {
  windup: Pose;
  strike: Pose;
}

// Indexed by MoveId. Poses face right; the renderer mirrors them.
const ATTACKS: Record<number, AttackAnim> = {
  [MoveId.Jab]: {
    windup: P({ torso: 0, armF: [30, 105], armB: [-20, 60], legF: [22, -12], legB: [-22, -6] }),
    strike: P({ torso: 14, armF: [84, 0], armB: [-35, 75], legF: [26, -10], legB: [-26, -4] }),
  },
  [MoveId.FTilt]: {
    windup: P({ torso: -6, armF: [-20, 50], armB: [30, 50], legF: [65, -115], legB: [-8, -6] }),
    strike: P({ torso: -22, armF: [-45, 30], armB: [40, 40], legF: [96, 0], legB: [-10, -4] }),
  },
  [MoveId.DTilt]: {
    windup: P({ torso: 26, armF: [40, 40], armB: [-20, 40], legF: [50, -115], legB: [12, -115] }),
    strike: P({ torso: 32, head: -10, armF: [25, 30], armB: [-45, 30], legF: [86, 0], legB: [18, -125] }),
  },
  [MoveId.NAir]: {
    windup: TUCK,
    strike: P({ torso: -14, armF: [-60, 20], armB: [140, 20], legF: [82, 0], legB: [-50, -30] }),
  },
  [MoveId.FAir]: {
    windup: P({ torso: -16, head: -8, armF: [205, 10], armB: [192, 10], legF: [50, -70], legB: [10, -50] }),
    strike: P({ torso: 26, armF: [78, 0], armB: [68, 4], legF: [20, -30], legB: [-30, -20] }),
  },
  [MoveId.DAir]: {
    windup: P({ torso: 10, armF: [150, 20], armB: [130, 20], legF: [85, -145], legB: [62, -135] }),
    strike: P({ torso: -4, head: 10, armF: [160, 10], armB: [140, 10], legF: [6, 0], legB: [-6, 0] }),
  },
  [MoveId.UAir]: {
    windup: TUCK,
    strike: P({ torso: -28, head: -15, armF: [-40, 20], armB: [-62, 20], legF: [172, 0], legB: [-20, -40], spin: -20 }),
  },
  [MoveId.Heavy]: {
    windup: P({ torso: -20, head: -6, armF: [-72, 45], armB: [-88, 45], legF: [32, -45], legB: [-32, -10] }),
    strike: P({ torso: 30, head: -6, armF: [86, 0], armB: [78, 6], legF: [58, -45], legB: [-46, 0] }),
  },
  [MoveId.UpSpecial]: {
    windup: P({ torso: 22, armF: [10, 125], armB: [-20, 60], legF: [58, -115], legB: [32, -100] }),
    strike: P({ torso: -6, head: -12, armF: [176, 0], armB: [148, 22], legF: [10, -10], legB: [-15, -45] }),
  },
};

const ease = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);

function attackPose(f: FighterState, base: Pose): Pose {
  const move = FIGHTERS[f.charId]!.moves[f.move];
  const anim = ATTACKS[f.move];
  if (!move || !anim || move.hitboxes.length === 0) return base;
  const start = Math.min(...move.hitboxes.map((h) => h.start));
  const end = Math.max(...move.hitboxes.map((h) => h.end));
  const t = f.actionFrame;
  if (t < start) return mixPose(base, anim.windup, ease(clamp01(t / start)));
  if (t <= end) return mixPose(anim.windup, anim.strike, clamp01((t - start + 1) / 2));
  return mixPose(anim.strike, base, ease(clamp01((t - end) / Math.max(1, move.total - end))));
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
    hipY: 0,
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
}

export function animate(f: FighterState, state: MatchState): Animated {
  const grounded = f.ground >= 0;
  const st = FIGHTERS[f.charId]!.stats;
  const t = f.actionFrame;
  const breathe = Math.sin(state.frame * 0.07);

  switch (f.action) {
    case Action.Idle:
    case Action.Respawn:
      return {
        pose: P({ torso: 4 + breathe * 1.5, armF: [12, 20 + breathe * 5], armB: [-10, 20 + breathe * 5] }),
        planted: grounded,
      };
    case Action.Walk:
      return { pose: walkPose(t * 0.24, 26, 30, 6, 22), planted: true };
    case Action.Run:
      return { pose: walkPose(t * 0.34, 44, 70, 16, 85), planted: true };
    case Action.Dash:
      return { pose: mixPose(CROUCH, DASH, ease(clamp01(t / 3))), planted: true };
    case Action.JumpSquat:
      return { pose: mixPose(STAND, CROUCH, ease(clamp01((t + 1) / st.jumpSquat))), planted: true };
    case Action.Landing:
      return { pose: mixPose(CROUCH, STAND, ease(clamp01(t / Math.max(1, f.landLag)))), planted: true };
    case Action.Air:
      return { pose: airPose(f), planted: false };
    case Action.Attack:
      return { pose: attackPose(f, grounded ? STAND : AIR_FALL), planted: grounded };
    case Action.Hitstun: {
      const speed = (Math.abs(f.vx) + Math.abs(f.vy)) / ONE;
      const tumble = !grounded && speed > 8 ? -t * 22 : 0;
      return { pose: { ...HURT, spin: tumble }, planted: grounded };
    }
    case Action.SpecialFall:
      return { pose: LIMP, planted: false };
    case Action.Roll: {
      // Forward roll if moving the way we face, back roll otherwise.
      const dir = Math.sign(f.vx) * f.facing || 1;
      return { pose: { ...TUCK, spin: dir * 360 * ease(clamp01(t / st.rollFrames)) }, planted: true };
    }
    case Action.SpotDodge:
      return { pose: mixPose(STAND, { ...CROUCH, torso: -12 }, Math.sin(Math.PI * clamp01(t / st.spotDodgeFrames))), planted: true };
    case Action.AirDodge:
      return { pose: TUCK, planted: false };
    case Action.Shield:
    case Action.ShieldStun:
      return { pose: GUARD, planted: true };
    case Action.ShieldDrop:
      return { pose: mixPose(GUARD, STAND, ease(clamp01(t / SHIELD_DROP_FRAMES))), planted: true };
    case Action.ShieldBreak: {
      if (!grounded) return { pose: HURT, planted: false };
      const w = state.frame * 0.09;
      return {
        pose: P({
          torso: 10 + Math.sin(w) * 14,
          head: 15 + Math.sin(w * 1.3) * 20,
          armF: [5 + Math.sin(w) * 10, 10],
          armB: [-5 + Math.sin(w) * 10, 10],
          legF: [14, -25],
          legB: [-10, -20],
        }),
        planted: true,
      };
    }
  }
  return { pose: STAND, planted: grounded };
}
