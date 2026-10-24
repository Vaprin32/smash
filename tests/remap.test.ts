import { afterEach, describe, expect, it } from 'vitest';
import { BINDINGS } from '../src/input/bindings';
import { padBits } from '../src/input/gamepad';
import { Keyboard } from '../src/input/keyboard';
import {
  applyRemap,
  bindButton,
  bindKey,
  currentRemap,
  DEFAULT_REMAP,
  KEY_ACTIONS,
  PAD_ACTIONS,
  parseRemap,
  type Remap,
} from '../src/input/remap';
import { Btn } from '../src/sim/input';

const defaults = (): Remap => JSON.parse(JSON.stringify(DEFAULT_REMAP)) as Remap;

afterEach(() => applyRemap(defaults()));

function fakeKeyboard() {
  const target = new EventTarget();
  const keyboard = new Keyboard(target as unknown as Window);
  const send = (type: string, code: string) => target.dispatchEvent(Object.assign(new Event(type), { code, repeat: false }));
  return { keyboard, down: (code: string) => send('keydown', code), up: (code: string) => send('keyup', code) };
}

describe('remapping controls', () => {
  it('binding a free key replaces that action’s keys', () => {
    const r = bindKey(defaults(), 'attack', 'KeyU');
    expect(r.keys.attack).toEqual(['KeyU']);
    expect(r.keys.jump).toEqual(DEFAULT_REMAP.keys.jump);
  });

  it('binding a key another action uses swaps them, so no key does two things', () => {
    const r = bindKey(defaults(), 'attack', 'KeyL'); // L was jump (with Space)
    expect(r.keys.attack).toEqual(['KeyL']);
    expect(r.keys.jump).toEqual(['Space', 'KeyJ']);
    const all = KEY_ACTIONS.flatMap((a) => r.keys[a]);
    expect(new Set(all).size).toBe(all.length);
  });

  it('pad buttons swap the same way', () => {
    const r = bindButton(defaults(), 'attack', 1); // B was special
    expect(r.pad.attack).toEqual([1]);
    expect(r.pad.special).toEqual([0]);
    const all = PAD_ACTIONS.flatMap((a) => r.pad[a]);
    expect(new Set(all).size).toBe(all.length);
  });

  it('applied bindings drive the keyboard and the pad straight away', () => {
    const { keyboard, down } = fakeKeyboard();
    applyRemap(bindButton(bindKey(defaults(), 'jump', 'KeyY'), 'jump', 10)); // LS (stick click)
    down('KeyY');
    expect(keyboard.sample(0) & Btn.Jump).toBeTruthy();
    const pad = { axes: [0, 0], buttons: Array.from({ length: 16 }, (_, i) => ({ pressed: i === 10 })) };
    expect(padBits(pad) & Btn.Jump).toBeTruthy();
  });

  it('saved bindings round-trip, and junk falls back to the defaults', () => {
    const r = bindKey(defaults(), 'special', 'KeyO');
    expect(parseRemap(JSON.stringify(r))).toEqual(r);
    expect(parseRemap(null)).toEqual(defaults());
    expect(parseRemap('not json')).toEqual(defaults());
    const bad = parseRemap(JSON.stringify({ keys: { jump: [], attack: [42], special: ['Escape'], dash: ['KeyZ'] }, pad: { jump: [9], attack: ['x'] } }));
    expect(bad.keys.jump).toEqual(DEFAULT_REMAP.keys.jump);
    expect(bad.keys.attack).toEqual(DEFAULT_REMAP.keys.attack);
    expect(bad.keys.special).toEqual(DEFAULT_REMAP.keys.special); // Escape is reserved
    expect(bad.keys.dash).toEqual(['KeyZ']);
    expect(bad.pad.jump).toEqual(DEFAULT_REMAP.pad.jump); // Menu is reserved
  });

  it('captureNext hands the next key to the rebinding screen instead of the game', () => {
    const { keyboard, down } = fakeKeyboard();
    let got = '';
    keyboard.captureNext((code) => (got = code));
    down('KeyJ');
    expect(got).toBe('KeyJ');
    expect(keyboard.sample(0)).toBe(0);
    down('KeyJ'); // the next press is a normal one again
    expect(keyboard.sample(0) & Btn.Attack).toBeTruthy();
  });

  it('currentRemap reflects what is applied', () => {
    applyRemap(bindKey(defaults(), 'dash', 'KeyM'));
    expect(currentRemap().keys.dash).toEqual(['KeyM']);
    expect(BINDINGS.layouts.solo[0]!.dash).toEqual(['KeyM']);
  });
});
