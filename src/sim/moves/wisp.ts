import { px } from '../fixed';
import { hitbox, type MoveDef } from './types';

// Wisp: fast startup, low damage, low knockback. Pixel units; frames are 1-based.
// Indexed by MoveId.
export const WISP_MOVES: readonly MoveDef[] = [
  {
    name: 'Jab',
    total: 14,
    hitboxes: [hitbox({ frames: [3, 4], x: 30, y: -34, r: 16, damage: 3, kb: 2.5, growth: 3, angle: 30 })],
  },
  {
    name: 'Side Tilt',
    total: 22,
    hitboxes: [hitbox({ frames: [5, 7], x: 40, y: -30, r: 20, damage: 7, kb: 4, growth: 9, angle: 35 })],
  },
  {
    name: 'Down Tilt',
    total: 18,
    hitboxes: [hitbox({ frames: [4, 6], x: 34, y: -8, r: 16, damage: 5, kb: 3.5, growth: 6, angle: 75 })],
  },
  {
    name: 'Neutral Air',
    total: 26,
    landingLag: 6,
    hitboxes: [
      hitbox({ frames: [4, 6], x: 0, y: -30, r: 30, damage: 7, kb: 4, growth: 8, angle: 45 }),
      hitbox({ frames: [7, 14], x: 0, y: -30, r: 28, damage: 4, kb: 3, growth: 4, angle: 45 }),
    ],
  },
  {
    name: 'Forward Air',
    total: 28,
    landingLag: 8,
    hitboxes: [hitbox({ frames: [6, 9], x: 38, y: -34, r: 20, damage: 9, kb: 4.5, growth: 12, angle: 40 })],
  },
  {
    name: 'Down Air',
    total: 32,
    landingLag: 12,
    hitboxes: [hitbox({ frames: [8, 11], x: 4, y: 6, r: 20, damage: 10, kb: 4, growth: 11, angle: 270 })],
  },
  {
    name: 'Up Air',
    total: 24,
    landingLag: 6,
    hitboxes: [hitbox({ frames: [5, 9], x: 4, y: -66, r: 22, damage: 7, kb: 4, growth: 9, angle: 85 })],
  },
  {
    // Heavy: slow wind-up, big knockback, only a small step forward.
    name: 'Gale Strike',
    total: 44,
    landingLag: 14,
    noDrift: true,
    impulses: [{ frame: 11, vx: px(2.5) }],
    hitboxes: [
      hitbox({ frames: [13, 15], x: 40, y: -36, r: 24, damage: 16, kb: 6, growth: 17, angle: 40 }),
      hitbox({ frames: [16, 18], x: 34, y: -34, r: 20, damage: 10, kb: 4, growth: 9, angle: 45 }),
    ],
  },
  {
    name: 'Updraft',
    total: 36,
    landingLag: 10,
    helplessAfter: true,
    impulses: [{ frame: 5, vx: px(2), vy: px(-13) }],
    hitboxes: [hitbox({ frames: [5, 12], x: 0, y: -40, r: 26, damage: 6, kb: 5, growth: 6, angle: 88 })],
  },
];
