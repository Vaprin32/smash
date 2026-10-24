import { describe, expect, it } from 'vitest';
import { BINDINGS, type PlayerKeys } from '../src/input/bindings';
import { Keyboard } from '../src/input/keyboard';
import { Btn } from '../src/sim/input';

/** A Keyboard listening to a plain EventTarget, plus helpers to press keys. */
function fakeKeyboard() {
  const target = new EventTarget();
  const keyboard = new Keyboard(target as unknown as Window);
  const send = (type: string, code: string) => target.dispatchEvent(Object.assign(new Event(type), { code, repeat: false }));
  return { keyboard, down: (code: string) => send('keydown', code), up: (code: string) => send('keyup', code) };
}

const allCodes = (k: PlayerKeys) => Object.values(k).flat();

describe('keyboard layouts', () => {
  for (const [name, layout] of Object.entries(BINDINGS.layouts)) {
    it(`${name}: no key does two things`, () => {
      const codes = layout.flatMap(allCodes);
      expect(new Set(codes).size).toBe(codes.length);
    });

    it(`${name}: no numpad needed`, () => {
      for (const code of layout.flatMap(allCodes)) expect(code.startsWith('Numpad'), code).toBe(false);
    });
  }

  it('with both directions of a pair held, the one pressed last wins', () => {
    const { keyboard, down, up } = fakeKeyboard();
    down('KeyA');
    expect(keyboard.sample(0)).toBe(Btn.Left);
    down('KeyD'); // rolled onto D before letting go of A
    expect(keyboard.sample(0)).toBe(Btn.Right);
    keyboard.endFrame();
    up('KeyD');
    expect(keyboard.sample(0)).toBe(Btn.Left);
    down('KeyS');
    down('KeyW');
    expect(keyboard.sample(0)).toBe(Btn.Left | Btn.Up);
  });
});
