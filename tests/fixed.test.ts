import { describe, expect, it } from 'vitest';
import { approach, clamp, fdiv, fmul, idiv, ONE, px, sign } from '../src/sim/fixed';

describe('fixed point', () => {
  it('px converts to integer subpixels', () => {
    expect(px(1)).toBe(ONE);
    expect(px(0.5)).toBe(128);
    expect(Number.isInteger(px(0.36))).toBe(true);
  });

  it('idiv truncates toward zero', () => {
    expect(idiv(7, 2)).toBe(3);
    expect(idiv(-7, 2)).toBe(-3);
  });

  it('fmul and fdiv', () => {
    expect(fmul(px(2), px(3))).toBe(px(6));
    expect(fmul(px(-1.5), px(2))).toBe(px(-3));
    expect(fdiv(px(6), px(4))).toBe(px(1.5));
  });

  it('approach never overshoots', () => {
    expect(approach(10, 0, 3)).toBe(7);
    expect(approach(2, 0, 3)).toBe(0);
    expect(approach(-2, 0, 3)).toBe(0);
    expect(approach(0, 5, 10)).toBe(5);
  });

  it('clamp and sign', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-5, 0, 3)).toBe(0);
    expect(sign(-4)).toBe(-1);
    expect(sign(0)).toBe(0);
  });
});
