// Versus CPU setup: how many computer opponents and how well they play, then
// on to character select. The choices stay for the rest of the session.

import { CPU_LEVELS } from '../ai/levels';
import { slotColor } from '../render/renderer';
import { heraldicShield } from '../render/theme';
import type { App, Screen } from './app';
import { beginLayout, drawBackdrop, drawMenu, panel, text, type View } from './draw';
import { MenuList } from './menuModel';
import { playerLabel } from './players';

const W = 1100;
const H = 720;
const MAX_OPPONENTS = 3;
const FIGHT_ROW = 2;

export class CpuSetupScreen implements Screen {
  private list = new MenuList(3);

  constructor(private app: App) {}

  tick(): void {
    const c = this.app.controls;
    const sfx = this.app.sfx;
    const presses = [c.menu(0), c.menu(1)];
    const step = presses.reduce((n, p) => n + (p.right ? 1 : 0) - (p.left ? 1 : 0), 0);
    if (step !== 0 && this.list.index < FIGHT_ROW) {
      const s = this.app.cpu;
      if (this.list.index === 0) s.opponents = 1 + ((s.opponents - 1 + step + MAX_OPPONENTS) % MAX_OPPONENTS);
      else s.level = (s.level + step + CPU_LEVELS.length) % CPU_LEVELS.length;
      sfx.move();
      return;
    }
    const event = this.list.update(presses, c.confirmKey || c.startButton, c.backKey);
    if (event === 'move') sfx.move();
    if (event === 'back') {
      sfx.back();
      this.app.toMainMenu('Versus CPU');
    }
    if (event === 'choose') {
      sfx.select();
      this.app.toCharSelect('cpu');
    }
  }

  draw(ctx: CanvasRenderingContext2D, view: View): void {
    drawBackdrop(ctx, view, performance.now());
    beginLayout(ctx, view, W, H);
    const { opponents, level } = this.app.cpu;
    const lv = CPU_LEVELS[level]!;

    text(ctx, 'Versus CPU', W / 2, 110, { size: 48, bold: true, align: 'center', color: '#ffd166', outline: true });
    text(ctx, 'You against 1 to 3 computer players · everyone for themselves · 3 stocks', W / 2, 146, {
      size: 17,
      align: 'center',
      color: '#d9c49a',
    });

    drawMenu(ctx, [`Opponents   ◀  ${opponents}  ▶`, `Level   ◀  ${lv.name}  ▶`, 'Choose fighters'], this.list.index, W / 2, 190, 380);
    text(ctx, lv.blurb, W / 2, 372, { size: 15, align: 'center', color: '#e6d6b0' });

    // Who will be in the match.
    const n = opponents + 1;
    const gap = 130;
    panel(ctx, W / 2 - (n * gap) / 2 - 20, 400, n * gap + 40, 150);
    for (let slot = 0; slot < n; slot++) {
      const cx = W / 2 + (slot - (n - 1) / 2) * gap;
      heraldicShield(ctx, cx - 30, 420, 60, slotColor(slot));
      text(ctx, playerLabel('cpu', slot, n), cx, 522, { size: 17, bold: true, align: 'center', color: slotColor(slot) });
      if (slot > 0) text(ctx, lv.name, cx, 540, { size: 12, align: 'center', color: 'rgba(255,255,255,0.6)' });
    }

    text(ctx, 'W/S to move · A/D to change · J, Space or Enter: choose fighters · Esc or I: back', W / 2, 640, {
      size: 15,
      align: 'center',
      color: 'rgba(255,255,255,0.6)',
    });
  }
}
