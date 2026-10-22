import { idlePose } from '../render/animations';
import { lookOf } from '../render/renderer';
import { FIGHTERS } from '../sim/fighters';
import type { App, Screen } from './app';
import { beginLayout, drawBackdrop, drawFigure, drawMenu, text, type View } from './draw';
import { MenuList } from './menuModel';

const ITEMS = ['Local Versus', 'Training', 'Controls'];
const W = 1100;
const H = 720;

export class MainMenu implements Screen {
  private list = new MenuList(ITEMS.length);
  private frame = 0;

  constructor(private app: App) {}

  tick(): void {
    this.frame++;
    const c = this.app.controls;
    const event = this.list.update([c.menu(0), c.menu(1)], c.confirmKey || c.startButton, false);
    if (event === 'move') this.app.sfx.move();
    if (event !== 'choose') return;
    this.app.sfx.select();
    if (this.list.index === 0) this.app.toCharSelect('versus');
    else if (this.list.index === 1) this.app.toCharSelect('training');
    else this.app.toControls();
  }

  draw(ctx: CanvasRenderingContext2D, view: View): void {
    const t = performance.now();
    drawBackdrop(ctx, view, t);
    const area = beginLayout(ctx, view, W, H);

    text(ctx, 'SMASH PROTOTYPE', W / 2, 130, { size: 64, bold: true, align: 'center', color: '#ffd166', outline: true });
    text(ctx, 'Eight fighters · local versus', W / 2, 168, { size: 18, align: 'center', color: '#c9c7e8' });
    drawMenu(ctx, ITEMS, this.list.index, W / 2, 210, 340);

    // The roster, lined up on a floor, facing the middle.
    const floorY = 610;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(area.left, floorY, area.width, area.top + area.height - floorY);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(area.left, floorY, area.width, 2);
    FIGHTERS.forEach((_def, i) => {
      const x = 110 + (i * (W - 220)) / (FIGHTERS.length - 1);
      drawFigure(ctx, i, lookOf(i).body, x, floorY, 1.3, x < W / 2 ? 1 : -1, idlePose(this.frame + i * 17), t);
    });

    text(ctx, 'W/S or ↑/↓ to move · J, Space or Enter to choose · gamepads work too', W / 2, 680, {
      size: 15,
      align: 'center',
      color: 'rgba(255,255,255,0.6)',
    });
  }
}
