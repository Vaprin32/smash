// Stage select, between character select and the match. The chosen stage
// plays live behind the menu (the picked fighters standing on it, moving
// platforms moving). Online, only the host picks; the guest waits on
// character select until the match starts.

import { Camera } from '../render/camera';
import { drawWorld } from '../render/renderer';
import { drawForeground } from '../render/scenery';
import { DEFAULT_STOCKS } from '../sim/rules';
import { STAGES } from '../sim/stage';
import { createMatch, type MatchSetup, type MatchState } from '../sim/state';
import { step } from '../sim/step';
import type { App, Mode, Screen } from './app';
import { beginLayout, panel, text, type View } from './draw';

const W = 1100;
const H = 720;

export class StageSelectScreen implements Screen {
  private index: number;
  private demo!: MatchState;
  private camera = new Camera();

  constructor(
    private app: App,
    readonly mode: Mode,
    readonly chars: readonly number[],
  ) {
    this.index = app.stage;
    this.resetDemo();
    const link = mode === 'online' ? app.online : null;
    // Online: if the other player unlocks their fighter meanwhile, go back to character select.
    link?.listen((msg) => {
      if (msg.t === 'cursor' && !msg.locked) this.app.toCharSelect('online', this.chars);
    });
  }

  private resetDemo(): void {
    this.demo = createMatch({ seed: 1, stageId: this.index, chars: this.chars, stocks: 1 });
    this.camera = new Camera();
  }

  tick(): void {
    const c = this.app.controls;
    const m = c.menu(0);
    this.demo = step(this.demo, this.chars.map(() => 0));
    if (c.backKey || m.back) {
      this.app.sfx.back();
      return this.app.toCharSelect(this.mode, this.chars);
    }
    if (m.left || m.right || m.up || m.down) {
      const d = m.right || m.down ? 1 : -1;
      this.index = (this.index + d + STAGES.length) % STAGES.length;
      this.app.sfx.move();
      this.resetDemo();
      return;
    }
    if (m.confirm || c.confirmKey || c.startButton) {
      this.app.sfx.go();
      this.app.stage = this.index;
      const link = this.mode === 'online' ? this.app.online : null;
      if (!link) return this.app.startMatch(this.mode, this.chars);
      const setup: MatchSetup = { seed: (Math.random() * 0x100000000) >>> 0, stageId: this.index, chars: this.chars, stocks: DEFAULT_STOCKS };
      const match = link.nextMatch();
      link.send({ t: 'start', match, setup });
      // Our start message takes half a round trip to arrive: start our countdown that much later.
      this.app.startOnlineMatch(setup, match, Math.max(0, link.rttMs / 2));
    }
  }

  draw(ctx: CanvasRenderingContext2D, view: View): void {
    const { w, h } = view;
    this.camera.update(this.demo, w, h);
    drawWorld(ctx, this.demo, this.camera, w, h, this.chars.map(() => ' '));
    drawForeground(ctx, this.camera, w, h, performance.now());

    beginLayout(ctx, view, W, H);
    const stage = STAGES[this.index]!;
    panel(ctx, W / 2 - 300, 28, 600, 126);
    text(ctx, 'Choose a stage', W / 2, 62, { size: 20, align: 'center', color: '#d9c49a' });
    text(ctx, `◀  ${stage.name}  ▶`, W / 2, 104, { size: 36, bold: true, align: 'center', color: '#ffd166', outline: true });
    text(ctx, stage.blurb, W / 2, 136, { size: 16, align: 'center' });
    // Dots: which of the stages this is.
    STAGES.forEach((_, i) => {
      ctx.fillStyle = i === this.index ? '#ffd166' : 'rgba(255,255,255,0.35)';
      ctx.beginPath();
      ctx.arc(W / 2 + (i - (STAGES.length - 1) / 2) * 18, 170, 5, 0, Math.PI * 2);
      ctx.fill();
    });
    text(ctx, 'A / D: change stage · Attack, Jump or Enter: fight · Special / Esc: back', W / 2, 700, {
      size: 15,
      align: 'center',
      outline: true,
    });
  }
}
