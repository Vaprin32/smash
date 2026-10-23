import { describe, expect, it } from 'vitest';
import type { MenuPress } from '../src/input/controls';
import { padBits, type PadLike } from '../src/input/gamepad';
import { LOOKS } from '../src/render/looks';
import { fighterColor } from '../src/render/renderer';
import { FIGHTERS } from '../src/sim/fighters';
import { ONE } from '../src/sim/fixed';
import { Btn } from '../src/sim/input';
import { MoveId } from '../src/sim/moves/types';
import { CharSelectModel, MenuList } from '../src/ui/menuModel';

const none: MenuPress = { up: false, down: false, left: false, right: false, confirm: false, back: false };
const press = (p: Partial<MenuPress>): MenuPress => ({ ...none, ...p });
/** Presses for [P1, P2]. */
const both = (p1: Partial<MenuPress> = {}, p2: Partial<MenuPress> = {}) => [press(p1), press(p2)];

describe('menu list', () => {
  it('moves with wrap-around and chooses', () => {
    const m = new MenuList(3);
    expect(m.update(both({ up: true }), false, false)).toBe('move');
    expect(m.index).toBe(2);
    expect(m.update(both({}, { down: true }), false, false)).toBe('move');
    expect(m.index).toBe(0);
    expect(m.update(both(), true, false)).toBe('choose');
    expect(m.update(both({ back: true }), false, false)).toBe('back');
  });
});

describe('character select (versus)', () => {
  it('each player moves and locks their own cursor, then anyone starts', () => {
    const m = new CharSelectModel('versus', 8, [0, 1]);
    m.update(both({ right: true }, { left: true }), false, false);
    expect(m.cursors.map((c) => c.index)).toEqual([1, 0]);
    expect(m.update(both({ confirm: true }), false, false)).toBe('lock');
    expect(m.ready).toBe(false);
    // A locked cursor no longer moves.
    m.update(both({ right: true }), false, false);
    expect(m.cursors[0]!.index).toBe(1);
    m.update(both({}, { confirm: true }), false, false);
    expect(m.ready).toBe(true);
    expect(m.update(both({}, { confirm: true }), false, false)).toBe('start');
  });

  it('wraps within a row and between rows', () => {
    const m = new CharSelectModel('versus', 8, [0, 7]);
    m.update(both({ left: true }, { right: true }), false, false);
    expect(m.cursors.map((c) => c.index)).toEqual([3, 4]);
    m.update(both({ down: true }, { up: true }), false, false);
    expect(m.cursors.map((c) => c.index)).toEqual([7, 0]);
  });

  it('special undoes a lock, then leaves', () => {
    const m = new CharSelectModel('versus', 8, [0, 1]);
    m.update(both({ confirm: true }), false, false);
    expect(m.update(both({ back: true }), false, false)).toBe('unlock');
    expect(m.cursors[0]!.locked).toBe(false);
    expect(m.update(both({ back: true }), false, false)).toBe('exit');
    expect(m.update(both(), false, true)).toBe('exit');
  });

  it('mirror matches are allowed', () => {
    const m = new CharSelectModel('versus', 8, [5, 5]);
    m.update(both({ confirm: true }, { confirm: true }), false, false);
    expect(m.ready).toBe(true);
  });

  it('the netcode test picks like versus: each player drives and undoes their own cursor', () => {
    const m = new CharSelectModel('netTest', 8, [0, 1]);
    m.update(both({ right: true }, { down: true }), false, false);
    expect(m.cursors.map((c) => c.index)).toEqual([1, 5]);
    m.update(both({ confirm: true }, { confirm: true }), false, false);
    expect(m.ready).toBe(true);
    expect(m.update(both({}, { back: true }), false, false)).toBe('unlock');
    expect(m.cursors.map((c) => c.locked)).toEqual([true, false]);
  });
});

describe('character select (training)', () => {
  it('player 1 picks their fighter, then the CPU', () => {
    const m = new CharSelectModel('training', 8, [0, 1]);
    expect(m.activeCursor(0)).toBe(0);
    m.update(both({ right: true }), false, false);
    m.update(both({ confirm: true }), false, false);
    expect(m.activeCursor(0)).toBe(1);
    // Player 2's input does nothing in training.
    m.update(both({}, { right: true }), false, false);
    expect(m.cursors[1]!.index).toBe(1);
    m.update(both({ down: true }), false, false);
    expect(m.cursors[1]!.index).toBe(5);
    m.update(both({ back: true }), false, false);
    expect(m.cursors[0]!.locked).toBe(false); // nothing locked on the CPU yet, so P1's pick is undone
    m.update(both({ confirm: true }), false, false);
    m.update(both({ confirm: true }), false, false);
    expect(m.ready).toBe(true);
    expect(m.update(both(), true, false)).toBe('start');
    expect(m.cursors.map((c) => c.index)).toEqual([1, 5]);
  });
});

describe('gamepad mapping', () => {
  const pad = (pressed: number[], axes: number[] = [0, 0]): PadLike => ({
    buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i) })),
    axes,
  });

  it('maps face buttons, triggers and the d-pad', () => {
    expect(padBits(pad([0]))).toBe(Btn.Attack);
    expect(padBits(pad([1]))).toBe(Btn.Special);
    expect(padBits(pad([2]))).toBe(Btn.Jump);
    expect(padBits(pad([5]))).toBe(Btn.Heavy);
    expect(padBits(pad([7]))).toBe(Btn.Dodge);
    expect(padBits(pad([4]))).toBe(Btn.Dash);
    expect(padBits(pad([12, 15]))).toBe(Btn.Up | Btn.Right);
  });

  it('reads the left stick past the deadzone only', () => {
    expect(padBits(pad([], [0.3, -0.3]))).toBe(0);
    expect(padBits(pad([], [0.9, 0.7]))).toBe(Btn.Right | Btn.Down);
    expect(padBits(pad([], [-0.8, -0.8]))).toBe(Btn.Left | Btn.Up);
  });

  it('cancels opposite directions', () => {
    expect(padBits(pad([14], [0.9, 0]))).toBe(0);
  });
});

describe('looks', () => {
  it('there is one look per fighter', () => {
    expect(LOOKS.length).toBe(FIGHTERS.length);
  });

  it('each drawn body is close to its hurtbox height', () => {
    LOOKS.forEach((l, i) => {
      const drawn = l.thigh + l.shin + l.torso + l.neck + 2 * l.headR;
      const box = FIGHTERS[i]!.stats.height / ONE;
      expect(Math.abs(drawn - box) / box, FIGHTERS[i]!.name).toBeLessThan(0.12);
    });
  });

  it('every fighter has its own costume and colors', () => {
    expect(new Set(LOOKS.map((l) => l.costume)).size).toBe(LOOKS.length);
    expect(new Set(LOOKS.map((l) => l.body)).size).toBe(LOOKS.length);
    for (const l of LOOKS) expect(l.alt).not.toBe(l.body);
  });

  it('a mirror match gives the second player the alternate color', () => {
    expect(fighterColor([3, 3], 0)).toBe(LOOKS[3]!.body);
    expect(fighterColor([3, 3], 1)).toBe(LOOKS[3]!.alt);
    expect(fighterColor([3, 4], 1)).toBe(LOOKS[4]!.body);
  });

  it('fighters with a projectile have a projectile style', () => {
    FIGHTERS.forEach((def, i) => {
      expect(LOOKS[i]!.projectile !== undefined, def.name).toBe(def.moves[MoveId.NSpecial]!.projectile !== undefined);
    });
  });
});
