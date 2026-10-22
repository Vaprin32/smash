import { describe, expect, it } from 'vitest';
import { BINDINGS, type PlayerKeys } from '../src/input/bindings';
import { Controls } from '../src/input/controls';
import { Keyboard } from '../src/input/keyboard';
import { keysSummary } from '../src/input/keyLabels';
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

  it('versus: P1 moves with WASD, P2 with IJKL', () => {
    const [a, b] = BINDINGS.layouts.versus as [PlayerKeys, PlayerKeys];
    expect([a.up, a.left, a.down, a.right].flat()).toEqual(['KeyW', 'KeyA', 'KeyS', 'KeyD']);
    expect([b.up, b.left, b.down, b.right].flat()).toEqual(['KeyI', 'KeyJ', 'KeyK', 'KeyL']);
    expect(keysSummary(a)).toBe('WASD + F G R T E B');
  });

  it('the same physical key means different things per layout', () => {
    const { keyboard, down } = fakeKeyboard();
    down('KeyJ');
    expect(keyboard.sample(0)).toBe(Btn.Attack);
    expect(keyboard.sample(1)).toBe(0);
    keyboard.setLayout('versus');
    expect(keyboard.sample(0)).toBe(0);
    expect(keyboard.sample(1)).toBe(Btn.Left);
  });

  it('a key held across a layout switch is not a fresh press', () => {
    const { keyboard, down, up } = fakeKeyboard();
    const controls = new Controls(keyboard);
    down('KeyJ'); // chooses "Local Versus" in the solo layout
    controls.poll();
    expect(controls.pressed(0) & Btn.Attack).toBeTruthy();
    controls.setLayout('versus');
    controls.poll();
    expect(controls.input(1)).toBe(Btn.Left); // still held...
    expect(controls.pressed(1)).toBe(0); // ...but P2's cursor doesn't move
    up('KeyJ');
    controls.poll();
    down('KeyJ');
    controls.poll();
    expect(controls.pressed(1)).toBe(Btn.Left);
  });
});
