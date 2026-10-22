// Integer fixed-point helpers. Everything in sim state is an integer in subpixel units.

/** Subpixel units per pixel. */
export const ONE = 256;

/**
 * Convert a pixel value to fixed point. Intended for defining constants only:
 * the result is always an integer, so no float ever reaches sim state.
 */
export function px(pixels: number): number {
  return Math.round(pixels * ONE);
}

/** Integer division truncating toward zero. */
export function idiv(a: number, b: number): number {
  return Math.trunc(a / b);
}

/** Multiply two fixed-point values. */
export function fmul(a: number, b: number): number {
  return Math.trunc((a * b) / ONE);
}

/** Divide two fixed-point values. */
export function fdiv(a: number, b: number): number {
  return Math.trunc((a * ONE) / b);
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Move `v` toward `target` by at most `amount` (amount >= 0). */
export function approach(v: number, target: number, amount: number): number {
  if (v < target) return v + amount > target ? target : v + amount;
  if (v > target) return v - amount < target ? target : v - amount;
  return v;
}

export function sign(v: number): number {
  return v > 0 ? 1 : v < 0 ? -1 : 0;
}
