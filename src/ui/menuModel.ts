// Pure menu logic (no drawing), so it can be unit-tested.

import type { MenuPress } from '../input/controls';
import type { Mode } from './app';

export type MenuEvent = 'none' | 'move' | 'choose' | 'back';

/** A vertical list driven by every player's presses. `index` is the highlighted item. */
export class MenuList {
  index = 0;

  constructor(readonly count: number) {}

  /** `confirm` / `back` are the global keys (Enter / Start, Escape). */
  update(presses: readonly MenuPress[], confirm: boolean, back: boolean): MenuEvent {
    for (const p of presses) {
      if (p.confirm) return 'choose';
      if (p.back) return 'back';
      if (p.up || p.down) {
        this.index = (this.index + (p.down ? 1 : -1) + this.count) % this.count;
        return 'move';
      }
    }
    if (confirm) return 'choose';
    if (back) return 'back';
    return 'none';
  }
}

export const GRID_COLS = 4;

export interface Cursor {
  /** Fighter index (charId) under the cursor. */
  index: number;
  locked: boolean;
}

export type SelectEvent = 'none' | 'move' | 'lock' | 'unlock' | 'start' | 'exit';

/**
 * Character select. In versus, each player moves their own cursor and locks
 * in. In training, player 1 picks their fighter and then the CPU's.
 */
export class CharSelectModel {
  readonly cursors: Cursor[];

  constructor(
    readonly mode: Mode,
    readonly count: number,
    initial: readonly number[],
  ) {
    this.cursors = initial.map((index) => ({ index, locked: false }));
  }

  get ready(): boolean {
    return this.cursors.every((c) => c.locked);
  }

  /** The cursor player `slot` is moving right now, or -1. */
  activeCursor(slot: number): number {
    if (this.mode === 'versus') return this.cursors[slot]!.locked ? -1 : slot;
    return this.cursors.findIndex((c) => !c.locked);
  }

  /** `confirm` is Enter or a pad's Start; `back` is Escape. */
  update(presses: readonly MenuPress[], confirm: boolean, back: boolean): SelectEvent {
    if (back) return 'exit';
    if (this.ready && (confirm || presses.some((p) => p.confirm))) return 'start';

    let event: SelectEvent = 'none';
    presses.forEach((p, slot) => {
      if (this.mode === 'training' && slot > 0) return; // P1 drives both cursors
      if (p.back) {
        const last = this.mode === 'versus' ? slot : this.lastLocked();
        if (last >= 0 && this.cursors[last]!.locked) {
          this.cursors[last]!.locked = false;
          event = 'unlock';
        } else if (event === 'none') {
          event = 'exit';
        }
        return;
      }
      const c = this.activeCursor(slot);
      if (c < 0) return;
      const cur = this.cursors[c]!;
      if (p.confirm || (slot === 0 && confirm)) {
        cur.locked = true;
        event = 'lock';
      } else if (p.left || p.right) {
        const row = Math.floor(cur.index / GRID_COLS) * GRID_COLS;
        const rowLen = Math.min(GRID_COLS, this.count - row);
        cur.index = row + ((cur.index - row + (p.right ? 1 : -1) + rowLen) % rowLen);
        if (event === 'none') event = 'move';
      } else if (p.up || p.down) {
        const next = cur.index + (p.down ? GRID_COLS : -GRID_COLS);
        cur.index = (next + this.count) % this.count;
        if (event === 'none') event = 'move';
      }
    });
    return event;
  }

  private lastLocked(): number {
    for (let i = this.cursors.length - 1; i >= 0; i--) if (this.cursors[i]!.locked) return i;
    return -1;
  }
}
