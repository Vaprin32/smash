import { BINDINGS, type PlayerKeys } from '../input/bindings';
import { keysLabel } from '../input/keyLabels';
import type { App, Screen } from './app';
import { beginLayout, drawBackdrop, panel, text, type View } from './draw';

const W = 1100;
const H = 720;

const PAD_NAMES = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'View', 'Menu', 'LS', 'RS', 'D-pad ↑', 'D-pad ↓', 'D-pad ←', 'D-pad →'];

const pad = (buttons: number[]) => buttons.map((b) => PAD_NAMES[b] ?? `#${b}`).join(' / ');

type Row = [action: string, solo: string, vs1: string, vs2: string, gamepad: string, what: string];

function rows(): Row[] {
  const [solo] = BINDINGS.layouts.solo as [PlayerKeys];
  const [a, b] = BINDINGS.layouts.versus as [PlayerKeys, PlayerKeys];
  const g = BINDINGS.gamepad.buttons;
  const dirs = (k: PlayerKeys) => keysLabel([...k.up, ...k.left, ...k.down, ...k.right]);
  const row = (action: string, key: keyof PlayerKeys, gamepad: string, what: string): Row => [
    action,
    keysLabel(solo[key]),
    keysLabel(a[key]),
    keysLabel(b[key]),
    gamepad,
    what,
  ];
  return [
    ['Move', dirs(solo), dirs(a), dirs(b), 'Left stick / D-pad', 'Walk, hold to run · down: drop / fast-fall'],
    row('Jump', 'jump', pad(g.jump), 'Tap: short hop · hold: full hop · again in air'),
    row('Attack', 'attack', pad(g.attack), 'Jab, tilts, dash attack · aerials in the air'),
    row('Smash', 'heavy', pad(g.heavy), 'Smash attacks (hold to charge) · ground only'),
    row('Special', 'special', pad(g.special), 'Neutral / side / up (recovery) / down special'),
    row('Shield', 'dodge', pad(g.dodge), 'Hold to shield · +side roll · +down dodge · +attack grab'),
    row('Dash', 'dash', pad(g.dash), 'Quick burst along the ground'),
  ];
}

export class ControlsScreen implements Screen {
  constructor(private app: App) {}

  tick(): void {
    const c = this.app.controls;
    const presses = [c.menu(0), c.menu(1)];
    if (c.backKey || c.confirmKey || c.startButton || presses.some((p) => p.back || p.confirm)) {
      this.app.sfx.back();
      this.app.toMainMenu('Controls');
    }
  }

  draw(ctx: CanvasRenderingContext2D, view: View): void {
    drawBackdrop(ctx, view, performance.now());
    beginLayout(ctx, view, W, H);
    text(ctx, 'Controls', W / 2, 70, { size: 40, bold: true, align: 'center', color: '#ffd166', outline: true });

    const cols = [36, 124, 262, 384, 506, 668];
    panel(ctx, 16, 100, W - 32, 470);
    ['', 'Solo (P1)', 'Versus P1', 'Versus P2', 'Gamepad', 'What it does'].forEach((h, i) => {
      text(ctx, h, cols[i]!, 135, { size: 16, bold: true, color: '#ffd166' });
    });
    rows().forEach((row, r) => {
      const y = 180 + r * 56;
      row.forEach((cell, i) => {
        text(ctx, cell, cols[i]!, y, { size: i === 0 ? 17 : i === 5 ? 14 : 15, bold: i === 0, color: i === 5 ? '#d9c49a' : '#ffffff' });
      });
    });

    const notes = [
      'Local Versus and the Netcode test split the keyboard in half (no numpad needed); menus and Training use the Training column.',
      'Menus: directions to move, Attack / Jump / Enter to choose, Special / Esc to go back.',
      'In a match: Esc or Menu pauses · F1 shows hitboxes · R resets in Training · View on a pad switches player on character select.',
    ];
    notes.forEach((n, i) => text(ctx, n, W / 2, 610 + i * 26, { size: 15, align: 'center', color: 'rgba(255,255,255,0.75)' }));
    text(ctx, 'Press any button to go back', W / 2, 700, { size: 14, align: 'center', color: 'rgba(255,255,255,0.5)' });
  }
}
