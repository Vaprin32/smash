// Who plays each slot in each mode, and what the screens call them.

import type { Mode } from './app';

/** Slots after player 1 are computer players in these modes. */
export function isCpuSlot(mode: Mode, slot: number): boolean {
  return slot > 0 && (mode === 'cpu' || mode === 'training');
}

/** "P1", "P2", or for computer players "CPU" (one of them) / "CPU 1".."CPU 3". */
export function playerLabel(mode: Mode, slot: number, players: number): string {
  if (!isCpuSlot(mode, slot)) return `P${slot + 1}`;
  return players > 2 ? `CPU ${slot}` : 'CPU';
}

export function playerLabels(mode: Mode, players: number): string[] {
  return Array.from({ length: players }, (_, slot) => playerLabel(mode, slot, players));
}
