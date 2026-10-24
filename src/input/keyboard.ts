import { Btn, type InputBits } from '../sim/input';
import { BINDINGS, type LayoutName, type PlayerKeys } from './bindings';

const BUTTON_FOR: [keyof PlayerKeys, number][] = [
  ['left', Btn.Left],
  ['right', Btn.Right],
  ['up', Btn.Up],
  ['down', Btn.Down],
  ['jump', Btn.Jump],
  ['attack', Btn.Attack],
  ['heavy', Btn.Heavy],
  ['special', Btn.Special],
  ['dodge', Btn.Dodge],
  ['dash', Btn.Dash],
];

function isTextField(target: EventTarget | null): boolean {
  return typeof HTMLInputElement !== 'undefined' && target instanceof HTMLInputElement && !target.readOnly;
}

/**
 * Tracks key state and produces one input bitmask per sim frame. A key tapped
 * and released between two samples still counts as held for one frame. When
 * both keys of a pair (left/right, up/down) are held, the one pressed last
 * wins, so rolling from one direction to the other never stalls on neutral.
 */
export class Keyboard {
  /** Held keys, with the order they went down in. */
  private down = new Map<string, number>();
  private presses = 0;
  private tapped = new Set<string>();
  private handlers = new Map<string, () => void>();
  private bound = new Set<string>();
  private layout: readonly PlayerKeys[] = BINDINGS.layouts.solo;

  constructor(target: Window) {
    for (const layout of Object.values(BINDINGS.layouts)) {
      for (const p of layout) for (const codes of Object.values(p)) for (const c of codes) this.bound.add(c);
    }
    this.bound.add(BINDINGS.toggleDebug);

    target.addEventListener('keydown', (e) => {
      if (isTextField(e.target)) return; // typing a room code, not playing
      if (this.bound.has(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.down.set(e.code, ++this.presses);
      this.tapped.add(e.code);
      this.handlers.get(e.code)?.();
    });
    target.addEventListener('keyup', (e) => {
      this.down.delete(e.code);
    });
    target.addEventListener('blur', () => {
      this.down.clear();
      this.tapped.clear();
    });
  }

  /** Call `fn` when `code` is pressed (for non-game keys like F1). */
  onPress(code: string, fn: () => void): void {
    this.handlers.set(code, fn);
  }

  /** True if `code` went down since the last `endFrame`. */
  wasPressed(code: string): boolean {
    return this.tapped.has(code);
  }

  /** Which keys each player uses from now on. */
  setLayout(name: LayoutName): void {
    this.layout = BINDINGS.layouts[name];
  }

  /** A player's keys in the current layout. */
  keysOf(player: number): PlayerKeys | undefined {
    return this.layout[player];
  }

  /** Bitmask for one player this frame. Call `endFrame` after sampling every player. */
  sample(player: number): InputBits {
    const keys = this.layout[player];
    if (!keys) return 0;
    let bits = 0;
    for (const [name, bit] of BUTTON_FOR) {
      for (const code of keys[name]) {
        if (this.down.has(code) || this.tapped.has(code)) bits |= bit;
      }
    }
    bits = this.lastWins(bits, keys.left, keys.right, Btn.Left, Btn.Right);
    return this.lastWins(bits, keys.up, keys.down, Btn.Up, Btn.Down);
  }

  /** If both directions of a pair are on, keep only the more recently pressed one. */
  private lastWins(bits: InputBits, a: readonly string[], b: readonly string[], bitA: number, bitB: number): InputBits {
    if ((bits & (bitA | bitB)) !== (bitA | bitB)) return bits;
    const latest = (codes: readonly string[]) => Math.max(0, ...codes.map((c) => this.down.get(c) ?? 0));
    const ta = latest(a);
    const tb = latest(b);
    if (ta === tb) return bits & ~(bitA | bitB); // both only tapped this frame
    return bits & ~(ta > tb ? bitB : bitA);
  }

  endFrame(): void {
    this.tapped.clear();
  }
}
