// The netcode test's control bar: plain DOM laid over the top of the canvas,
// with sliders for the fake network and the input delay, and a few buttons.
// Controls hand focus back to the page after use, so the keyboard keeps
// driving the game.

import { MAX_INPUT_DELAY } from '../net/session';
import type { NetConditions } from '../net/transports/fakeNetwork';

export interface NetTestSettings extends NetConditions {
  /** Input delay on both machines, in frames. */
  inputDelay: number;
}

export interface PanelButton {
  label: string;
  title: string;
  run: () => void;
}

interface Slider {
  key: keyof NetTestSettings;
  label: string;
  max: number;
  step: number;
  unit: string;
  title: string;
}

const SLIDERS: Slider[] = [
  { key: 'latencyMs', label: 'Latency', max: 200, step: 5, unit: ' ms', title: 'One-way delay of every packet (the ping is about twice this)' },
  { key: 'jitterMs', label: 'Jitter', max: 100, step: 5, unit: ' ms', title: 'Up to this much extra random delay per packet, so packets can arrive out of order' },
  { key: 'lossPercent', label: 'Loss', max: 20, step: 1, unit: '%', title: 'Share of packets lost' },
  { key: 'inputDelay', label: 'Input delay', max: MAX_INPUT_DELAY, step: 1, unit: ' f', title: 'Frames between pressing a button and it taking effect, on both machines' },
];

export class NetTestPanel {
  private root: HTMLDivElement;

  /** Moving a slider writes straight into `settings`. */
  constructor(settings: NetTestSettings, buttons: readonly PanelButton[]) {
    const root = document.createElement('div');
    root.style.cssText =
      'position:fixed;top:0;left:0;right:0;z-index:1;display:flex;flex-wrap:wrap;align-items:center;gap:6px 22px;' +
      'padding:8px 16px;background:#10142c;border-bottom:1px solid rgba(255,255,255,0.15);' +
      'color:#e8e8f4;font:13px system-ui,sans-serif;user-select:none';
    const title = document.createElement('b');
    title.textContent = 'Netcode test';
    title.style.color = '#ffd166';
    root.append(title);

    for (const s of SLIDERS) {
      const input = document.createElement('input');
      input.type = 'range';
      input.min = '0';
      input.max = String(s.max);
      input.step = String(s.step);
      input.value = String(settings[s.key]);
      input.tabIndex = -1;
      input.style.cssText = 'width:110px;accent-color:#ffd166';
      const value = document.createElement('span');
      value.style.cssText = 'min-width:48px;color:#ffd166;font-variant-numeric:tabular-nums';
      const show = () => (value.textContent = `${input.value}${s.unit}`);
      show();
      input.addEventListener('input', () => {
        settings[s.key] = Number(input.value);
        show();
      });
      input.addEventListener('change', () => input.blur());
      input.addEventListener('pointerup', () => input.blur());
      const label = document.createElement('label');
      label.title = s.title;
      label.style.cssText = 'display:flex;align-items:center;gap:8px';
      label.append(s.label, input, value);
      root.append(label);
    }

    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;align-items:center;gap:8px';
    for (const b of buttons) {
      const button = document.createElement('button');
      button.textContent = b.label;
      button.title = b.title;
      button.tabIndex = -1;
      button.style.cssText =
        'padding:4px 10px;border-radius:6px;border:1px solid rgba(255,255,255,0.25);' +
        'background:#262b52;color:#fff;font:inherit;cursor:pointer';
      button.addEventListener('click', () => {
        button.blur();
        b.run();
      });
      actions.append(button);
    }
    const hint = document.createElement('span');
    hint.textContent = 'Esc: menu · F1: debug';
    hint.style.cssText = 'margin-left:auto;color:rgba(255,255,255,0.55)';
    root.append(actions, hint);

    document.body.append(root);
    this.root = root;
  }

  /** Height in CSS pixels (the bar wraps onto more lines in narrow windows). */
  get height(): number {
    return this.root.getBoundingClientRect().height;
  }

  remove(): void {
    this.root.remove();
  }
}
