import { idiv, px } from './fixed';
import { isin, TRIG_ONE } from './trig';

// Coordinates are fixed point. +x is right, +y is DOWN. The main stage's top surface is y = 0.

/** Solid rectangle: you can stand on it, and it blocks from the sides and below. */
export interface Block {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** Pass-through platform: only solid from above, and you can drop through it. */
export interface Platform {
  left: number;
  right: number;
  top: number;
  /** A moving platform swings this far each way (fixed point) over `period` frames, smoothly (sine). */
  sway?: { dx: number; dy: number; period: number };
}

export interface SpawnPoint {
  x: number;
  y: number;
  /** Ground index to start on (see `surfaceOf`), or -1 for airborne. */
  ground: number;
}

export interface StageDef {
  name: string;
  /** One line for stage select. */
  blurb: string;
  /** Look only: the time of day the scenery is painted in. */
  theme: 'night' | 'dusk';
  blocks: readonly Block[];
  platforms: readonly Platform[];
  blast: { left: number; right: number; top: number; bottom: number };
  /** Match-start positions: `spawns[n - 1]` has one per player slot for an n-player match. */
  spawns: readonly (readonly SpawnPoint[])[];
  /** Respawn positions (above the stage), one per player slot. */
  respawns: readonly { x: number; y: number }[];
}

export interface Surface {
  left: number;
  right: number;
  top: number;
  passThrough: boolean;
}

export const STAGES: readonly StageDef[] = [
  {
    name: 'Moonlit Rampart',
    blurb: 'Castle walls under the moon · three platforms',
    theme: 'night',
    blocks: [{ left: px(-380), right: px(380), top: 0, bottom: px(70) }],
    platforms: [
      { left: px(-300), right: px(-140), top: px(-115) },
      { left: px(140), right: px(300), top: px(-115) },
      { left: px(-80), right: px(80), top: px(-225) },
    ],
    blast: { left: px(-1150), right: px(1150), top: px(-950), bottom: px(650) },
    spawns: [
      [{ x: px(-180), y: 0, ground: 0 }],
      [
        { x: px(-180), y: 0, ground: 0 },
        { x: px(180), y: 0, ground: 0 },
      ],
      [
        { x: px(-240), y: 0, ground: 0 },
        { x: px(240), y: 0, ground: 0 },
        { x: 0, y: 0, ground: 0 },
      ],
      [
        { x: px(-240), y: 0, ground: 0 },
        { x: px(240), y: 0, ground: 0 },
        { x: px(-80), y: 0, ground: 0 },
        { x: px(80), y: 0, ground: 0 },
      ],
    ],
    respawns: [
      { x: px(-100), y: px(-380) },
      { x: px(100), y: px(-380) },
      { x: px(-260), y: px(-380) },
      { x: px(260), y: px(-380) },
    ],
  },
  {
    name: 'Sunset Bridge',
    blurb: 'A long stone bridge at dusk · a lift swings across the middle',
    theme: 'dusk',
    blocks: [{ left: px(-420), right: px(420), top: 0, bottom: px(46) }],
    platforms: [
      { left: px(-80), right: px(80), top: px(-125), sway: { dx: px(220), dy: 0, period: 600 } },
      { left: px(-330), right: px(-210), top: px(-240) },
      { left: px(210), right: px(330), top: px(-240) },
    ],
    blast: { left: px(-1200), right: px(1200), top: px(-950), bottom: px(620) },
    spawns: [
      [{ x: px(-200), y: 0, ground: 0 }],
      [
        { x: px(-200), y: 0, ground: 0 },
        { x: px(200), y: 0, ground: 0 },
      ],
      [
        { x: px(-280), y: 0, ground: 0 },
        { x: px(280), y: 0, ground: 0 },
        { x: 0, y: 0, ground: 0 },
      ],
      [
        { x: px(-300), y: 0, ground: 0 },
        { x: px(300), y: 0, ground: 0 },
        { x: px(-100), y: 0, ground: 0 },
        { x: px(100), y: 0, ground: 0 },
      ],
    ],
    respawns: [
      { x: px(-120), y: px(-400) },
      { x: px(120), y: px(-400) },
      { x: px(-300), y: px(-400) },
      { x: px(300), y: px(-400) },
    ],
  },
];

/** Platform `i` where it is at `frame` (moving platforms follow their sway; the rest never move). */
export function platformAt(stage: StageDef, i: number, frame: number): Platform {
  const p = stage.platforms[i]!;
  if (!p.sway) return p;
  const { dx, dy, period } = p.sway;
  // Sine at 1/16° steps (interpolating the whole-degree table) so the motion is smooth.
  const a16 = idiv((frame % period) * 360 * 16, period);
  const deg = a16 >> 4;
  const s = isin(deg) + (((isin(deg + 1) - isin(deg)) * (a16 & 15)) >> 4);
  const ox = idiv(dx * s, TRIG_ONE);
  const oy = idiv(dy * s, TRIG_ONE);
  return { left: p.left + ox, right: p.right + ox, top: p.top + oy };
}

/**
 * Ground indices: 0..blocks.length-1 are block tops, then platforms follow.
 * -1 means airborne.
 */
export function surfaceOf(stage: StageDef, ground: number, frame = 0): Surface {
  const nb = stage.blocks.length;
  if (ground < nb) {
    const b = stage.blocks[ground]!;
    return { left: b.left, right: b.right, top: b.top, passThrough: false };
  }
  const p = platformAt(stage, ground - nb, frame);
  return { left: p.left, right: p.right, top: p.top, passThrough: true };
}

/**
 * A ledge: a top corner of a solid block that fighters can hang from. Ledge
 * `2b` is block b's left corner, `2b + 1` its right one. `side` is -1 on
 * a left corner (the fighter hangs on the left, facing right), +1 on a right one.
 */
export interface Ledge {
  x: number;
  y: number;
  side: number;
  block: number;
}

export function ledgeCount(stage: StageDef): number {
  return stage.blocks.length * 2;
}

export function ledgeOf(stage: StageDef, index: number): Ledge {
  const block = index >> 1;
  const b = stage.blocks[block]!;
  const right = (index & 1) === 1;
  return { x: right ? b.right : b.left, y: b.top, side: right ? 1 : -1, block };
}

export function platformGroundIndex(stage: StageDef, platform: number): number {
  return stage.blocks.length + platform;
}
