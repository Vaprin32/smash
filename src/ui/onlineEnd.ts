// Shown when an online room ends on its own: the connection dropped (no
// packet for a few seconds), the other player left, or the two games turned
// out to be different versions. Any confirm goes back to the main menu.

import type { LostReason } from '../net/online';
import type { App, Screen } from './app';
import { beginLayout, drawBackdrop, text, type View } from './draw';

const W = 1100;
const H = 720;
/** Ignore buttons mashed during the match for a moment. */
const INPUT_DELAY = 40;

const MESSAGES: Record<LostReason, [string, string]> = {
  dropped: ['CONNECTION LOST', 'Nothing arrived from the other player for 3 seconds.'],
  left: ['THE OTHER PLAYER LEFT', 'They left the room.'],
  version: ['DIFFERENT GAME VERSIONS', 'Both reload the page so you run the same game, then make a new room.'],
};

export class OnlineEndScreen implements Screen {
  private frame = 0;

  constructor(
    private app: App,
    readonly reason: LostReason,
  ) {}

  tick(): void {
    if (++this.frame < INPUT_DELAY) return;
    const c = this.app.controls;
    const m = c.menu(0);
    if (c.confirmKey || c.startButton || c.backKey || m.confirm || m.back) {
      this.app.sfx.select();
      this.app.toMainMenu();
    }
  }

  draw(ctx: CanvasRenderingContext2D, view: View): void {
    drawBackdrop(ctx, view, performance.now());
    beginLayout(ctx, view, W, H);
    const [title, detail] = MESSAGES[this.reason];
    text(ctx, title, W / 2, 300, { size: 56, bold: true, align: 'center', color: '#ff6b5b', outline: true });
    text(ctx, detail, W / 2, 350, { size: 20, align: 'center', outline: true });
    if (this.frame >= INPUT_DELAY) {
      text(ctx, 'Press Attack or Enter for the main menu', W / 2, 430, { size: 18, align: 'center', color: '#d9c49a', outline: true });
    }
  }
}
