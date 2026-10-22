import { BINDINGS, type PlayerKeys } from '../input/bindings';
import type { App, Screen } from './app';
import { beginLayout, drawBackdrop, panel, text, type View } from './draw';

const W = 1100;
const H = 720;

const PAD_NAMES = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'View', 'Menu', 'LS', 'RS', 'D-pad ↑', 'D-pad ↓', 'D-pad ←', 'D-pad →'];

const KEY_NAMES: Record<string, string> = {
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  Space: 'Space',
  Enter: 'Enter',
  Escape: 'Esc',
};

export function keyLabel(code: string): string {
  if (KEY_NAMES[code]) return KEY_NAMES[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`;
  return code;
}

const keys = (codes: string[]) => codes.map(keyLabel).join(' / ');
const pad = (buttons: number[]) => buttons.map((b) => PAD_NAMES[b] ?? `#${b}`).join(' / ');

type Row = [action: string, p1: string, p2: string, gamepad: string, what: string];

function rows(): Row[] {
  const [a, b] = BINDINGS.players as [PlayerKeys, PlayerKeys];
  const g = BINDINGS.gamepad.buttons;
  const dirs = (k: PlayerKeys) => keys([...k.up, ...k.left, ...k.down, ...k.right]);
  return [
    ['Move', dirs(a), dirs(b), 'Left stick / D-pad', 'Walk, hold to run · down: drop / fast-fall'],
    ['Jump', keys(a.jump), keys(b.jump), pad(g.jump), 'Tap: short hop · hold: full hop · again in air'],
    ['Attack', keys(a.attack), keys(b.attack), pad(g.attack), 'Jab, tilts, dash attack · aerials in the air'],
    ['Smash', keys(a.heavy), keys(b.heavy), pad(g.heavy), 'Smash attacks (hold to charge) · specials in air'],
    ['Special', keys(a.special), keys(b.special), pad(g.special), 'Neutral / side / up (recovery) / down special'],
    ['Shield', keys(a.dodge), keys(b.dodge), pad(g.dodge), 'Hold: shield · +side: roll · +down: dodge · +attack: grab'],
    ['Dash', keys(a.dash), keys(b.dash), pad(g.dash), 'Quick burst along the ground'],
  ];
}

export class ControlsScreen implements Screen {
  constructor(private app: App) {}

  tick(): void {
    const c = this.app.controls;
    const presses = [c.menu(0), c.menu(1)];
    if (c.backKey || c.confirmKey || c.startButton || presses.some((p) => p.back || p.confirm)) {
      this.app.sfx.back();
      this.app.toMainMenu();
    }
  }

  draw(ctx: CanvasRenderingContext2D, view: View): void {
    drawBackdrop(ctx, view, performance.now());
    beginLayout(ctx, view, W, H);
    text(ctx, 'Controls', W / 2, 70, { size: 40, bold: true, align: 'center', color: '#ffd166', outline: true });

    const cols = [40, 150, 330, 500, 660];
    panel(ctx, 20, 100, W - 40, 470);
    ['', 'Player 1', 'Player 2', 'Gamepad', 'What it does'].forEach((h, i) => {
      text(ctx, h, cols[i]!, 135, { size: 16, bold: true, color: '#ffd166' });
    });
    rows().forEach((row, r) => {
      const y = 180 + r * 56;
      row.forEach((cell, i) => {
        text(ctx, cell, cols[i]!, y, { size: i === 0 ? 17 : 15, bold: i === 0, color: i === 4 ? '#c9c7e8' : '#ffffff' });
      });
    });

    const notes = [
      'Menus: move with directions, Attack / Jump / Enter to choose, Special / Esc to go back.',
      'In a match: Esc or Menu pauses · F1 shows hitboxes and frame data · R resets in Training.',
      'Gamepads join in order (first pad = P1). On character select, press View to move a pad to the other player.',
    ];
    notes.forEach((n, i) => text(ctx, n, W / 2, 610 + i * 26, { size: 15, align: 'center', color: 'rgba(255,255,255,0.75)' }));
    text(ctx, 'Press any button to go back', W / 2, 700, { size: 14, align: 'center', color: 'rgba(255,255,255,0.5)' });
  }
}
