// Integer trig via a lookup table (Math.sin/cos are not bit-exact across browsers).

/** Value of sin/cos at 90°. Results of isin/icos are in [-TRIG_ONE, TRIG_ONE]. */
export const TRIG_ONE = 4096;

/** round(sin(d°) * 4096) for d = 0..90. Generated offline; do not compute at runtime. */
const SIN_Q: readonly number[] = [
  0, 71, 143, 214, 286, 357, 428, 499, 570, 641,
  711, 782, 852, 921, 991, 1060, 1129, 1198, 1266, 1334,
  1401, 1468, 1534, 1600, 1666, 1731, 1796, 1860, 1923, 1986,
  2048, 2110, 2171, 2231, 2290, 2349, 2408, 2465, 2522, 2578,
  2633, 2687, 2741, 2793, 2845, 2896, 2946, 2996, 3044, 3091,
  3138, 3183, 3228, 3271, 3314, 3355, 3396, 3435, 3474, 3511,
  3547, 3582, 3617, 3650, 3681, 3712, 3742, 3770, 3798, 3824,
  3849, 3873, 3896, 3917, 3937, 3956, 3974, 3991, 4006, 4021,
  4034, 4046, 4056, 4065, 4074, 4080, 4086, 4090, 4094, 4095,
  4096,
];

/** sin of an integer angle in degrees, scaled by TRIG_ONE. */
export function isin(deg: number): number {
  const d = ((deg % 360) + 360) % 360;
  if (d <= 90) return SIN_Q[d]!;
  if (d <= 180) return SIN_Q[180 - d]!;
  if (d <= 270) return -SIN_Q[d - 180]!;
  return -SIN_Q[360 - d]!;
}

/** cos of an integer angle in degrees, scaled by TRIG_ONE. */
export function icos(deg: number): number {
  return isin(deg + 90);
}
