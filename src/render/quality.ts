// Graphics quality: how much the renderer draws and at what resolution, so
// slower computers stay at a smooth 60 fps. Render-only; the simulation is
// identical at every setting. Saved in this browser.
//
// 'auto' starts at high and steps down a level whenever frames keep coming
// in slower than 60 fps for a few seconds.

export type QualityChoice = 'auto' | 'high' | 'medium' | 'low';
export type QualityLevel = 'high' | 'medium' | 'low';

export interface Gfx {
  /** Canvas pixels per CSS pixel are min(devicePixelRatio, maxDpr) * resolution. */
  resolution: number;
  maxDpr: number;
  /** Drifting clouds and mist layers. */
  atmosphere: boolean;
  /** Torch / lantern glow, embers and fireflies. */
  lights: boolean;
  /** Share of effect particles spawned (0..1). */
  particles: number;
  /** Motion smears behind attacks. */
  trails: boolean;
}

const LEVELS: Record<QualityLevel, Gfx> = {
  high: { resolution: 1, maxDpr: 2, atmosphere: true, lights: true, particles: 1, trails: true },
  medium: { resolution: 0.85, maxDpr: 1.25, atmosphere: true, lights: true, particles: 0.5, trails: true },
  low: { resolution: 0.65, maxDpr: 1, atmosphere: false, lights: false, particles: 0.2, trails: false },
};

export interface Settings {
  quality: QualityChoice;
  screenShake: boolean;
  showFps: boolean;
}

const STORAGE_KEY = 'smash.settings.v1';
const DEFAULTS: Settings = { quality: 'auto', screenShake: true, showFps: false };

export const settings: Settings = load();
/** The level in use (for 'auto', where it has settled). */
let level: QualityLevel = settings.quality === 'auto' ? 'high' : settings.quality;
/** What the renderer reads. */
export const gfx: Gfx = { ...LEVELS[level] };

export function currentLevel(): QualityLevel {
  return level;
}

function setLevel(l: QualityLevel): void {
  level = l;
  Object.assign(gfx, LEVELS[l]);
}

/** Change a setting and remember it. */
export function updateSettings(patch: Partial<Settings>): void {
  Object.assign(settings, patch);
  if (patch.quality) {
    setLevel(patch.quality === 'auto' ? 'high' : patch.quality);
    slow = 0;
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage blocked: the setting still holds until the page is reloaded.
  }
}

function load(): Settings {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<Settings> | null;
    if (!data || typeof data !== 'object') return { ...DEFAULTS };
    return {
      quality: (['auto', 'high', 'medium', 'low'] as const).includes(data.quality as QualityChoice) ? (data.quality as QualityChoice) : DEFAULTS.quality,
      screenShake: typeof data.screenShake === 'boolean' ? data.screenShake : DEFAULTS.screenShake,
      showFps: typeof data.showFps === 'boolean' ? data.showFps : DEFAULTS.showFps,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

/** Milliseconds of "too slow" frames seen so far at this level. */
let slow = 0;
/** A frame slower than this counts against the level (a 60 Hz frame is 16.7 ms). */
const SLOW_FRAME_MS = 21;
/** This much slowness (within the last stretch) steps down a level. */
const STEP_DOWN_AFTER_MS = 2500;

/**
 * Auto quality: call once per displayed frame with its duration. Returns true
 * when the level just changed (the canvas should be resized).
 */
export function noteFrame(dtMs: number): boolean {
  if (settings.quality !== 'auto' || level === 'low') return false;
  if (dtMs > 200) return false; // tab was hidden or the page hitched; not the renderer's fault
  slow = dtMs > SLOW_FRAME_MS ? slow + dtMs : Math.max(0, slow - dtMs * 0.5);
  if (slow < STEP_DOWN_AFTER_MS) return false;
  slow = 0;
  setLevel(level === 'high' ? 'medium' : 'low');
  return true;
}
