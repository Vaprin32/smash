import { Action } from './actions';
import { FIGHTERS } from './fighters';
import { seedRng } from './rng';
import { STAGES } from './stage';

/** Everything about one fighter. Every field is an integer. */
export interface FighterState {
  charId: number;
  /** Feet position (bottom-center), fixed point. */
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** 1 = right, -1 = left. */
  facing: number;
  damage: number;
  stocks: number;
  action: number;
  actionFrame: number;
  /** Ground index the fighter stands on (see `surfaceOf`), or -1 when airborne. */
  ground: number;
  jumpsLeft: number;
  /** 1 while fast-falling. */
  fastFall: number;
  /** Frames left during which pass-through platforms are ignored. */
  dropTimer: number;
  /** 1 while a full hop can still be cut into a short hop. */
  hopOpen: number;
  /** Frames left on a buffered jump press. */
  jumpBuffer: number;
  hitstun: number;
  hitlag: number;
  invincible: number;
  /** Last frame's input, for press/release edge detection. */
  prevInput: number;
}

/** Serialization order. Append new fields at the end. */
export const FIGHTER_FIELDS = [
  'charId',
  'x',
  'y',
  'vx',
  'vy',
  'facing',
  'damage',
  'stocks',
  'action',
  'actionFrame',
  'ground',
  'jumpsLeft',
  'fastFall',
  'dropTimer',
  'hopOpen',
  'jumpBuffer',
  'hitstun',
  'hitlag',
  'invincible',
  'prevInput',
] as const satisfies readonly (keyof FighterState)[];

export interface MatchState {
  frame: number;
  rng: number;
  stageId: number;
  fighters: FighterState[];
}

const HEADER_INTS = 4;

export interface MatchSetup {
  seed: number;
  stageId: number;
  /** One fighter index (into FIGHTERS) per player slot. */
  chars: readonly number[];
  stocks: number;
}

export function createMatch(setup: MatchSetup): MatchState {
  const stage = STAGES[setup.stageId]!;
  return {
    frame: 0,
    rng: seedRng(setup.seed),
    stageId: setup.stageId,
    fighters: setup.chars.map((charId, i) => {
      const spawn = stage.spawns[i]!;
      return {
        charId,
        x: spawn.x,
        y: spawn.y,
        vx: 0,
        vy: 0,
        facing: spawn.x > 0 ? -1 : 1,
        damage: 0,
        stocks: setup.stocks,
        action: spawn.ground >= 0 ? Action.Idle : Action.Air,
        actionFrame: 0,
        ground: spawn.ground,
        jumpsLeft: FIGHTERS[charId]!.stats.airJumps,
        fastFall: 0,
        dropTimer: 0,
        hopOpen: 0,
        jumpBuffer: 0,
        hitstun: 0,
        hitlag: 0,
        invincible: 0,
        prevInput: 0,
      };
    }),
  };
}

export function cloneState(s: MatchState): MatchState {
  return {
    frame: s.frame,
    rng: s.rng,
    stageId: s.stageId,
    fighters: s.fighters.map((f) => ({ ...f })),
  };
}

/** Little-endian int32 stream: header, then each fighter's fields in FIGHTER_FIELDS order. */
export function serializeState(s: MatchState): Uint8Array {
  const ints = HEADER_INTS + s.fighters.length * FIGHTER_FIELDS.length;
  const view = new DataView(new ArrayBuffer(ints * 4));
  let o = 0;
  const put = (v: number) => {
    view.setInt32(o, v, true);
    o += 4;
  };
  put(s.frame);
  put(s.rng);
  put(s.stageId);
  put(s.fighters.length);
  for (const f of s.fighters) {
    for (const k of FIGHTER_FIELDS) put(f[k]);
  }
  return new Uint8Array(view.buffer);
}

export function deserializeState(bytes: Uint8Array): MatchState {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let o = 0;
  const get = () => {
    const v = view.getInt32(o, true);
    o += 4;
    return v;
  };
  const frame = get();
  const rng = get();
  const stageId = get();
  const count = get();
  const fighters: FighterState[] = [];
  for (let i = 0; i < count; i++) {
    const f = {} as FighterState;
    for (const k of FIGHTER_FIELDS) f[k] = get();
    fighters.push(f);
  }
  return { frame, rng, stageId, fighters };
}

/** FNV-1a (32-bit) over the serialized bytes. */
export function hashState(s: MatchState): number {
  const bytes = serializeState(s);
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i]!;
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
