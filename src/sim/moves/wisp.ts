import { px } from '../fixed';
import { grabbox, hitbox, launch, MoveId, type MoveDef } from './types';

// Wisp: fast startup, low damage, low knockback. Pixel units; frames are 1-based.
// Angles are relative to Wisp's facing (0 forward, 90 up, 180 backward).
const moves: Record<number, MoveDef> = {
  // --- Ground normals (J) ---
  [MoveId.Jab1]: {
    name: 'Jab 1',
    total: 16,
    next: { move: MoveId.Jab2, from: 4, to: 14 },
    hitboxes: [hitbox({ frames: [3, 4], x: 26, y: -40, r: 13, damage: 2, kb: 1.4, growth: 0.5, angle: 20 })],
  },
  [MoveId.Jab2]: {
    name: 'Jab 2',
    total: 16,
    next: { move: MoveId.Jab3, from: 4, to: 15 },
    hitboxes: [hitbox({ frames: [3, 4], x: 28, y: -40, r: 13, damage: 2, kb: 1.4, growth: 0.5, angle: 20 })],
  },
  [MoveId.Jab3]: {
    name: 'Jab 3',
    total: 28,
    hitboxes: [hitbox({ frames: [5, 7], x: 32, y: -34, r: 17, damage: 4, kb: 4, growth: 5, angle: 40 })],
  },
  [MoveId.FTilt]: {
    name: 'Side Tilt',
    total: 24,
    hitboxes: [hitbox({ frames: [6, 8], x: 40, y: -30, r: 18, damage: 8, kb: 4.5, growth: 9, angle: 35 })],
  },
  [MoveId.UTilt]: {
    name: 'Up Tilt',
    total: 24,
    hitboxes: [hitbox({ frames: [5, 10], x: 6, y: -62, r: 22, damage: 6, kb: 4, growth: 7, angle: 92 })],
  },
  [MoveId.DTilt]: {
    name: 'Down Tilt',
    total: 18,
    hitboxes: [hitbox({ frames: [4, 6], x: 34, y: -8, r: 16, damage: 5, kb: 3.5, growth: 6, angle: 75 })],
  },
  [MoveId.DashAttack]: {
    name: 'Dash Attack',
    total: 34,
    impulses: [{ frame: 1, vx: px(7.5) }],
    hitboxes: [hitbox({ frames: [6, 12], x: 26, y: -28, r: 20, damage: 8, kb: 5, growth: 7, angle: 55 })],
  },

  // --- Smash attacks (K on the ground; hold to charge) ---
  [MoveId.FSmash]: {
    name: 'Forward Smash',
    total: 46,
    chargeFrame: 8,
    impulses: [{ frame: 10, vx: px(2) }],
    hitboxes: [
      hitbox({ frames: [12, 14], x: 44, y: -36, r: 22, damage: 15, kb: 6, growth: 15, angle: 38 }),
      hitbox({ frames: [15, 17], x: 38, y: -34, r: 18, damage: 10, kb: 4, growth: 9, angle: 40 }),
    ],
  },
  [MoveId.USmash]: {
    name: 'Up Smash',
    total: 44,
    chargeFrame: 6,
    hitboxes: [
      hitbox({ frames: [9, 12], x: 2, y: -72, r: 26, damage: 14, kb: 6, growth: 14, angle: 88 }),
      hitbox({ frames: [9, 12], x: 2, y: -40, r: 20, damage: 10, kb: 4.5, growth: 9, angle: 85 }),
      // A pillar straight up through the platform overhead (115 px above the stage), same height for everyone.
      hitbox({ frames: [9, 12], x: 0, y: -126, r: 24, damage: 11, kb: 6, growth: 12, angle: 90, fixed: true }),
    ],
  },
  [MoveId.DSmash]: {
    // Hits in front, then behind.
    name: 'Down Smash',
    total: 48,
    chargeFrame: 5,
    hitboxes: [
      hitbox({ frames: [8, 10], x: 32, y: -8, r: 18, damage: 13, kb: 5.5, growth: 13, angle: 30 }),
      hitbox({ frames: [15, 17], x: -32, y: -8, r: 18, damage: 14, kb: 6, growth: 14, angle: 150 }),
    ],
  },

  // --- Aerials (J in the air) ---
  [MoveId.NAir]: {
    name: 'Neutral Air',
    total: 26,
    landingLag: 6,
    hitboxes: [
      hitbox({ frames: [4, 6], x: 0, y: -30, r: 30, damage: 7, kb: 4, growth: 8, angle: 45 }),
      hitbox({ frames: [7, 14], x: 0, y: -30, r: 28, damage: 4, kb: 3, growth: 4, angle: 45 }),
    ],
  },
  [MoveId.FAir]: {
    name: 'Forward Air',
    total: 28,
    landingLag: 8,
    hitboxes: [hitbox({ frames: [6, 9], x: 38, y: -34, r: 20, damage: 9, kb: 4.5, growth: 12, angle: 40 })],
  },
  [MoveId.BAir]: {
    name: 'Back Air',
    total: 26,
    landingLag: 8,
    hitboxes: [hitbox({ frames: [6, 9], x: -34, y: -32, r: 20, damage: 11, kb: 5, growth: 13, angle: 145 })],
  },
  [MoveId.UAir]: {
    name: 'Up Air',
    total: 24,
    landingLag: 6,
    hitboxes: [hitbox({ frames: [5, 9], x: 4, y: -66, r: 22, damage: 7, kb: 4, growth: 9, angle: 85 })],
  },
  [MoveId.DAir]: {
    name: 'Down Air',
    total: 32,
    landingLag: 12,
    hitboxes: [hitbox({ frames: [8, 11], x: 4, y: 6, r: 20, damage: 10, kb: 4, growth: 11, angle: 270 })],
  },

  // --- Specials (I) ---
  [MoveId.NSpecial]: {
    name: 'Wind Bolt',
    total: 32,
    landingLag: 8,
    hitboxes: [],
    projectile: { frame: 10, x: px(26), y: px(-36), speed: px(7), life: 50, hit: launch(5, 3, 3, 30, 12) },
  },
  [MoveId.SideSpecial]: {
    name: 'Gust Dash',
    total: 34,
    landingLag: 10,
    noDrift: true,
    oncePerAir: true,
    noGravity: [6, 16],
    impulses: [
      { frame: 6, vx: px(11), airVy: px(-1.5) },
      { frame: 17, vx: px(3) },
    ],
    hitboxes: [hitbox({ frames: [7, 14], x: 24, y: -30, r: 24, damage: 10, kb: 5, growth: 13, angle: 38 })],
  },
  [MoveId.UpSpecial]: {
    name: 'Updraft',
    total: 36,
    landingLag: 10,
    helplessAfter: true,
    impulses: [{ frame: 5, vx: px(2), vy: px(-13) }],
    hitboxes: [hitbox({ frames: [5, 12], x: 0, y: -40, r: 26, damage: 6, kb: 5, growth: 6, angle: 88 })],
  },
  [MoveId.DownSpecial]: {
    name: 'Mirror Guard',
    total: 40,
    landingLag: 10,
    noDrift: true,
    counter: [6, 24],
    noGravity: [1, 24],
    impulses: [{ frame: 1, airVy: 0 }],
    hitboxes: [],
  },
  [MoveId.CounterStrike]: {
    name: 'Mirror Strike',
    total: 30,
    hitboxes: [hitbox({ frames: [2, 5], x: 32, y: -34, r: 30, damage: 12, kb: 6, growth: 13, angle: 38 })],
  },

  // --- Grab and throws (; + J) ---
  [MoveId.Grab]: {
    name: 'Grab',
    total: 30,
    hitboxes: [],
    grabbox: grabbox({ frames: [7, 8], x: 28, y: -32, r: 15 }),
  },
  [MoveId.Pummel]: { name: 'Pummel', total: 14, hitboxes: [], pummel: { frame: 4, damage: 1 } },
  [MoveId.FThrow]: { name: 'Forward Throw', total: 30, hitboxes: [], throw: { frame: 10, hit: launch(7, 5, 8, 45) } },
  [MoveId.BThrow]: { name: 'Back Throw', total: 34, hitboxes: [], throw: { frame: 14, hit: launch(9, 5.5, 11, 135) } },
  [MoveId.UThrow]: { name: 'Up Throw', total: 32, hitboxes: [], throw: { frame: 12, hit: launch(6, 6, 6, 90) } },
  [MoveId.DThrow]: { name: 'Down Throw', total: 30, hitboxes: [], throw: { frame: 12, hit: launch(5, 4, 4, 80) } },
};

/** Indexed by MoveId. */
export const WISP_MOVES: readonly MoveDef[] = Object.values(MoveId).map((id) => {
  const m = moves[id];
  if (!m) throw new Error(`Wisp is missing move ${id}`);
  return m;
});
