// Merges the keyboard and any gamepads into one input bitmask per player slot,
// sampled once per fixed tick, plus edge-triggered menu presses.
//
// Each slot has keyboard keys from the current layout (see BINDINGS.layouts;
// in the solo layout player 2 has none). Gamepads are assigned to slots
// as they appear (first pad -> P1, second -> P2); on character select a pad
// can be moved to the other player with its View/Back button.

import { Btn, type InputBits } from '../sim/input';
import { BINDINGS, type LayoutName } from './bindings';
import { connectedPads, isDown, padBits } from './gamepad';
import type { Keyboard } from './keyboard';

export const PLAYER_SLOTS = 2;

export interface MenuPress {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  confirm: boolean;
  back: boolean;
}

export class Controls {
  /** Gamepad.index -> player slot. */
  private padSlot = new Map<number, number>();
  private padStartPrev = new Map<number, boolean>();
  private padSwapPrev = new Map<number, boolean>();
  private bits: InputBits[] = new Array<InputBits>(PLAYER_SLOTS).fill(0);
  private prevBits: InputBits[] = new Array<InputBits>(PLAYER_SLOTS).fill(0);

  /** Global presses this tick: Enter / any pad's Start, Escape, and the training reset key. */
  confirmKey = false;
  startButton = false;
  backKey = false;
  resetKey = false;
  /** Set by the character select screen. */
  allowPadSwap = false;
  private layoutChanged = false;

  constructor(readonly keyboard: Keyboard) {}

  /**
   * Switch keyboard layouts. Keys held across the switch don't count as fresh
   * presses (the J that chose "Netcode test" is P2's left in the versus layout).
   */
  setLayout(name: LayoutName): void {
    this.keyboard.setLayout(name);
    this.layoutChanged = true;
  }

  /** Read every device. Call once per fixed tick, before any screen reads input. */
  poll(): void {
    const pads = connectedPads();
    for (const index of [...this.padSlot.keys()]) {
      if (!pads.some((p) => p.index === index)) this.padSlot.delete(index);
    }
    for (const pad of pads) {
      if (!this.padSlot.has(pad.index)) this.padSlot.set(pad.index, this.freeSlot());
    }

    this.prevBits = this.bits;
    this.bits = this.bits.map((_, slot) => this.keyboard.sample(slot));
    this.startButton = false;
    for (const pad of pads) {
      const slot = this.padSlot.get(pad.index)!;
      this.bits[slot] |= padBits(pad);
      if (this.edge(this.padStartPrev, pad.index, isDown(pad, BINDINGS.gamepad.start))) this.startButton = true;
      if (this.edge(this.padSwapPrev, pad.index, isDown(pad, BINDINGS.gamepad.swap)) && this.allowPadSwap) {
        this.padSlot.set(pad.index, (slot + 1) % PLAYER_SLOTS);
      }
    }
    if (this.layoutChanged) {
      this.prevBits = [...this.bits];
      this.layoutChanged = false;
    }
    this.confirmKey = this.keyboard.wasPressed(BINDINGS.menu.confirm);
    this.backKey = this.keyboard.wasPressed(BINDINGS.menu.back);
    this.resetKey = this.keyboard.wasPressed(BINDINGS.reset);
    this.keyboard.endFrame();
  }

  /** Held buttons for a player this tick (feed this to the sim). */
  input(slot: number): InputBits {
    return this.bits[slot] ?? 0;
  }

  /** Buttons a player pressed this tick. */
  pressed(slot: number): InputBits {
    return (this.bits[slot] ?? 0) & ~(this.prevBits[slot] ?? 0);
  }

  /** A player's menu presses: directions, attack/jump to confirm, special to go back. */
  menu(slot: number): MenuPress {
    const p = this.pressed(slot);
    return {
      up: (p & Btn.Up) !== 0,
      down: (p & Btn.Down) !== 0,
      left: (p & Btn.Left) !== 0,
      right: (p & Btn.Right) !== 0,
      confirm: (p & (Btn.Attack | Btn.Jump)) !== 0,
      back: (p & Btn.Special) !== 0,
    };
  }

  /** Gamepad numbers (1-based, in index order) currently driving `slot`. */
  padsOf(slot: number): number[] {
    return [...this.padSlot.entries()]
      .sort((a, b) => a[0] - b[0])
      .filter(([, s]) => s === slot)
      .map(([index]) => index + 1);
  }

  /** First slot without a pad yet; P1 if every slot has one. */
  private freeSlot(): number {
    const taken = new Set(this.padSlot.values());
    for (let s = 0; s < PLAYER_SLOTS; s++) if (!taken.has(s)) return s;
    return 0;
  }

  private edge(prev: Map<number, boolean>, index: number, down: boolean): boolean {
    const was = prev.get(index) ?? false;
    prev.set(index, down);
    return down && !was;
  }
}
