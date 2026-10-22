// Gamepad API: turns one pad's buttons and left stick into an input bitmask,
// using BINDINGS.gamepad. Pads are polled (there are no button events).

import { Btn, type InputBits } from '../sim/input';
import { BINDINGS, type PadButtons } from './bindings';

/** The parts of a Gamepad we read (so tests can pass plain objects). */
export interface PadLike {
  readonly buttons: readonly { readonly pressed: boolean }[];
  readonly axes: readonly number[];
}

const BUTTON_BITS: [keyof PadButtons, number][] = [
  ['jump', Btn.Jump],
  ['attack', Btn.Attack],
  ['heavy', Btn.Heavy],
  ['special', Btn.Special],
  ['dodge', Btn.Dodge],
  ['dash', Btn.Dash],
];

export function isDown(pad: PadLike, button: number): boolean {
  return pad.buttons[button]?.pressed ?? false;
}

export function padBits(pad: PadLike): InputBits {
  const cfg = BINDINGS.gamepad;
  let bits = 0;
  for (const [name, bit] of BUTTON_BITS) {
    if (cfg.buttons[name].some((b) => isDown(pad, b))) bits |= bit;
  }
  const x = pad.axes[0] ?? 0;
  const y = pad.axes[1] ?? 0;
  if (x <= -cfg.deadzone || isDown(pad, cfg.dpad.left)) bits |= Btn.Left;
  if (x >= cfg.deadzone || isDown(pad, cfg.dpad.right)) bits |= Btn.Right;
  if (y <= -cfg.deadzone || isDown(pad, cfg.dpad.up)) bits |= Btn.Up;
  if (y >= cfg.deadzone || isDown(pad, cfg.dpad.down)) bits |= Btn.Down;
  // Opposite directions cancel out.
  if ((bits & (Btn.Left | Btn.Right)) === (Btn.Left | Btn.Right)) bits &= ~(Btn.Left | Btn.Right);
  if ((bits & (Btn.Up | Btn.Down)) === (Btn.Up | Btn.Down)) bits &= ~(Btn.Up | Btn.Down);
  return bits;
}

/** Connected pads right now, in index order. */
export function connectedPads(): Gamepad[] {
  const list = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
  return Array.from(list).filter((p): p is Gamepad => p !== null && p.connected);
}
