// Seeded random input for long determinism runs. Each player holds a random
// direction and buttons for a few frames, then picks again. It closes in on
// the opponent and mashes when near, and heads back to the stage when off it,
// so the run covers attacks, hits, shields, grabs, KOs and recoveries.

import { px } from '../src/sim/fixed';
import { Btn, type InputBits } from '../src/sim/input';
import type { MatchState } from '../src/sim/state';

const STAGE_EDGE = px(380);
const NEAR = px(110);
/** Buttons pressed when close, weighted by repetition. Dodge + Attack is a grab. */
const CLOSE_ACTIONS = [
  Btn.Attack,
  Btn.Attack,
  Btn.Attack,
  Btn.Heavy,
  Btn.Special,
  Btn.Special,
  Btn.Dodge,
  Btn.Dodge,
  Btn.Dodge | Btn.Attack,
  Btn.Jump,
  Btn.Jump | Btn.Attack,
  Btn.Dash,
];

export type InputSource = (s: MatchState) => InputBits[];

export function masher(seed: number): InputSource {
  let x = seed | 0 || 1;
  const rand = (n: number): number => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) % n;
  };
  const pick = <T>(list: readonly T[]): T => list[rand(list.length)]!;
  const held: InputBits[] = [];
  const timer: number[] = [];

  return (s) =>
    s.fighters.map((f, i) => {
      if ((timer[i] ?? 0) > 0) {
        timer[i]!--;
        return held[i]!;
      }
      const foe = s.fighters[(i + 1) % s.fighters.length]!;
      const toFoe = foe.x < f.x ? Btn.Left : Btn.Right;
      const away = toFoe === Btn.Left ? Btn.Right : Btn.Left;
      let bits = 0;
      let hold = rand(12);
      if (f.x < -STAGE_EDGE || f.x > STAGE_EDGE) {
        bits = (f.x < 0 ? Btn.Right : Btn.Left) | (rand(2) ? Btn.Jump : Btn.Up | Btn.Special);
      } else if (Math.abs(foe.x - f.x) < NEAR && Math.abs(foe.y - f.y) < NEAR) {
        bits = pick(CLOSE_ACTIONS) | pick([0, 0, toFoe, away, Btn.Up, Btn.Down]);
        hold = rand(6);
      } else {
        bits = pick([toFoe, toFoe, toFoe, away, 0]);
        if (foe.y < f.y - NEAR && rand(3) === 0) bits |= Btn.Jump;
        if (rand(6) === 0) bits |= pick([Btn.Dash, Btn.Special, Btn.Attack, Btn.Down, Btn.Jump]);
      }
      held[i] = bits;
      timer[i] = hold;
      return bits;
    });
}
