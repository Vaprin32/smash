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

/**
 * Tracks key state and produces one input bitmask per sim frame. A key tapped
 * and released between two samples still counts as held for one frame.
 */
export class Keyboard {
  private down = new Set<string>();
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
      if (this.bound.has(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.down.add(e.code);
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
    return bits;
  }

  endFrame(): void {
    this.tapped.clear();
  }
}
