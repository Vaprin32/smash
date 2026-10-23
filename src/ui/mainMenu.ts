import { idlePose } from '../render/animations';
import { lookOf } from '../render/renderer';
import { FIGHTERS } from '../sim/fighters';
import type { App, Screen } from './app';
import { beginLayout, drawBackdrop, drawFigure, drawMenu, text, type View } from './draw';
import { MenuList } from './menuModel';

const W = 1100;
const H = 720;

export class MainMenu implements Screen {
  /** "Watch replay" is there once a match has been played. */
  private items: string[];
  private list: MenuList;
  private frame = 0;

  /** `select` puts the cursor on that item. */
  constructor(
    private app: App,
    select?: string,
  ) {
    this.items = ['Local Versus', 'Training', 'Netcode test', ...(app.lastMatch ? ['Watch replay'] : []), 'Controls'];
    this.list = new MenuList(this.items.length);
    this.list.index = Math.max(0, this.items.indexOf(select ?? ''));
  }

  tick(): void {
    this.frame++;
    const c = this.app.controls;
    const event = this.list.update([c.menu(0), c.menu(1)], c.confirmKey || c.startButton, false);
    if (event === 'move') this.app.sfx.move();
    if (event !== 'choose') return;
    this.app.sfx.select();
    switch (this.items[this.list.index]) {
      case 'Local Versus':
        this.app.toCharSelect('versus');
        break;
      case 'Training':
        this.app.toCharSelect('training');
        break;
      case 'Netcode test':
        this.app.toCharSelect('netTest');
        break;
      case 'Watch replay':
        this.app.watchReplay(() => this.app.toMainMenu('Watch replay'));
        break;
      default:
        this.app.toControls();
    }
  }

  draw(ctx: CanvasRenderingContext2D, view: View): void {
    const t = performance.now();
    drawBackdrop(ctx, view, t);
    const area = beginLayout(ctx, view, W, H);

    text(ctx, 'SMASH PROTOTYPE', W / 2, 130, { size: 64, bold: true, align: 'center', color: '#ffd166', outline: true });
    text(ctx, 'Eight champions of the realm · local versus · rollback netcode', W / 2, 168, { size: 18, align: 'center', color: '#d9c49a' });
    drawMenu(ctx, this.items, this.list.index, W / 2, 210, 340);

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

    text(ctx, 'W/S to move · J, Space or Enter to choose · gamepads work too', W / 2, 680, {
      size: 15,
      align: 'center',
      color: 'rgba(255,255,255,0.6)',
    });
  }
}
