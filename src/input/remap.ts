// Remappable controls: player 1's keyboard keys and the gamepad buttons.
// Changes are written straight into BINDINGS, so every reader sees them at
// once, and saved in this browser's localStorage.

import { BINDINGS, type PadButtons, type PlayerKeys } from './bindings';

export type KeyAction = keyof PlayerKeys;
export type PadAction = keyof PadButtons;

export const KEY_ACTIONS: readonly KeyAction[] = ['up', 'left', 'down', 'right', 'jump', 'attack', 'heavy', 'special', 'dodge', 'dash'];
export const PAD_ACTIONS: readonly PadAction[] = ['jump', 'attack', 'heavy', 'special', 'dodge', 'dash'];

/** Keys that keep their job and can't be bound: menu confirm / back and the debug overlay. */
export const RESERVED_KEYS: readonly string[] = [BINDINGS.menu.confirm, BINDINGS.menu.back, BINDINGS.toggleDebug];
/** Pad buttons that keep their job: Menu (pause / start) and View (switch player). */
export const RESERVED_BUTTONS: readonly number[] = [BINDINGS.gamepad.start, BINDINGS.gamepad.swap];

const STORAGE_KEY = 'smash.bindings.v1';

/** The bindings someone can change, as plain data. */
export interface Remap {
  keys: PlayerKeys;
  pad: PadButtons;
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const soloKeys = (): PlayerKeys => BINDINGS.layouts.solo[0]!;

/** The shipped defaults (captured before anything is loaded). */
export const DEFAULT_REMAP: Readonly<Remap> = clone({ keys: soloKeys(), pad: BINDINGS.gamepad.buttons });

export function currentRemap(): Remap {
  return clone({ keys: soloKeys(), pad: BINDINGS.gamepad.buttons });
}

/** Write `r` into BINDINGS (in place, so existing references see it). */
export function applyRemap(r: Remap): void {
  const keys = soloKeys();
  for (const a of KEY_ACTIONS) keys[a] = [...r.keys[a]];
  for (const a of PAD_ACTIONS) BINDINGS.gamepad.buttons[a] = [...r.pad[a]];
}

/**
 * Bind `code` to `action`, replacing its keys. If another action already used
 * `code`, the two swap, so nothing is ever left doing two things.
 */
export function bindKey(r: Remap, action: KeyAction, code: string): Remap {
  const out = clone(r);
  const old = out.keys[action];
  for (const a of KEY_ACTIONS) {
    if (a !== action && out.keys[a].includes(code)) out.keys[a] = [...out.keys[a].filter((c) => c !== code), ...old.filter((c) => !out.keys[a].includes(c))];
  }
  out.keys[action] = [code];
  return out;
}

/** Same for a pad button. */
export function bindButton(r: Remap, action: PadAction, button: number): Remap {
  const out = clone(r);
  const old = out.pad[action];
  for (const a of PAD_ACTIONS) {
    if (a !== action && out.pad[a].includes(button)) out.pad[a] = [...out.pad[a].filter((b) => b !== button), ...old.filter((b) => !out.pad[a].includes(b))];
  }
  out.pad[action] = [button];
  return out;
}

/** Parse a saved remap; anything malformed falls back to the defaults for that part. */
export function parseRemap(text: string | null): Remap {
  const r = clone(DEFAULT_REMAP) as Remap;
  if (!text) return r;
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return r;
  }
  if (typeof data !== 'object' || data === null) return r;
  const d = data as { keys?: Record<string, unknown>; pad?: Record<string, unknown> };
  for (const a of KEY_ACTIONS) {
    const v = d.keys?.[a];
    if (Array.isArray(v) && v.length > 0 && v.every((c) => typeof c === 'string' && c.length > 0 && !RESERVED_KEYS.includes(c))) r.keys[a] = v as string[];
  }
  for (const a of PAD_ACTIONS) {
    const v = d.pad?.[a];
    if (Array.isArray(v) && v.length > 0 && v.every((b) => Number.isInteger(b) && b >= 0 && b < 32 && !RESERVED_BUTTONS.includes(b as number))) {
      r.pad[a] = v as number[];
    }
  }
  return r;
}

/** Load the saved bindings (if any) into BINDINGS. Call once at startup. */
export function loadRemap(): void {
  let text: string | null = null;
  try {
    text = localStorage.getItem(STORAGE_KEY);
  } catch {
    // Storage blocked: defaults it is.
  }
  applyRemap(parseRemap(text));
}

/** Apply `r` and remember it in this browser. */
export function saveRemap(r: Remap): void {
  applyRemap(r);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(r));
  } catch {
    // Storage blocked: it still works until the page is reloaded.
  }
}
