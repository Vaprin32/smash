// Human-readable names for KeyboardEvent.code values. Bindings use physical
// key positions, so on a non-US keyboard the label should be what's printed
// on that key (e.g. "Ñ" for Semicolon on a Spanish layout). Browsers that
// support the Keyboard Map API tell us; otherwise US labels are used.

import type { PlayerKeys } from './bindings';

const US_NAMES: Record<string, string> = {
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Minus: '-',
  Equal: '=',
  Backquote: '`',
  Space: 'Space',
  Enter: 'Enter',
  Escape: 'Esc',
};

let layoutMap: ReadonlyMap<string, string> | undefined;

/** Ask the browser for the user's keyboard layout. Safe to call when unsupported. */
export async function loadKeyboardLayout(): Promise<void> {
  const kb = (navigator as Navigator & { keyboard?: { getLayoutMap?: () => Promise<ReadonlyMap<string, string>> } }).keyboard;
  try {
    layoutMap = await kb?.getLayoutMap?.();
  } catch {
    layoutMap = undefined; // e.g. not allowed in this context
  }
}

export function keyLabel(code: string): string {
  const printed = layoutMap?.get(code);
  if (printed && printed.trim()) return printed.toUpperCase();
  if (US_NAMES[code]) return US_NAMES[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`;
  return code;
}

/** All keys bound to one action, e.g. "L / Space". */
export function keysLabel(codes: readonly string[]): string {
  return codes.map(keyLabel).join(' / ');
}

/** Short summary of a player's keys, e.g. "WASD + F G R T E B" (empty if none). */
export function keysSummary(k: PlayerKeys | undefined): string {
  if (!k || k.up.length === 0) return '';
  const first = (codes: string[]) => (codes[0] ? keyLabel(codes[0]) : '');
  const move = [k.up, k.left, k.down, k.right].map(first).join('');
  const actions = [k.attack, k.special, k.jump, k.heavy, k.dodge, k.dash].map(first).join(' ');
  return `${move} + ${actions}`;
}
