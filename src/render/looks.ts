import type { Look } from './skeleton';

export type ProjectileStyle = 'gust' | 'pebble' | 'dart' | 'orb' | 'crescent';

export interface FighterLook extends Look {
  /** Outfit color, and the one used instead when an earlier player slot picked the same fighter. */
  body: string;
  alt: string;
  /** How the neutral special projectile is drawn, if the fighter has one. */
  projectile?: ProjectileStyle;
  /** One line for the character select screen. */
  blurb: string;
}

/**
 * Body proportions, colors and accessory per fighter (indexed by charId).
 * Limb lengths are in world px; thigh + shin + torso + neck + 2 * headR is
 * roughly the fighter's hurtbox height.
 */
export const LOOKS: readonly FighterLook[] = [
  {
    // Wisp: slim and long-limbed, with a trailing scarf.
    thigh: 14, shin: 14, torso: 19, upperArm: 12, forearm: 12, headR: 7.5, neck: 2.5, limbW: 6, torsoW: 12,
    skin: '#f2d2b6', hair: '#f4f1ea', accent: '#e8c547', accessory: 'scarf',
    body: '#5ad1e6', alt: '#f08a4b', projectile: 'gust',
    blurb: 'Fast, light and floaty. Weak hits, great recovery.',
  },
  {
    // Brick: broad brawler in a steel helmet.
    thigh: 15, shin: 14, torso: 22, upperArm: 14, forearm: 13, headR: 8.5, neck: 2, limbW: 10, torsoW: 22,
    skin: '#c98e64', hair: '#3a2a20', accent: '#aab4bf', accessory: 'helmet',
    body: '#c0473a', alt: '#4a6fb5',
    blurb: 'Heavy, slow and hard-hitting. Hard to launch.',
  },
  {
    // Pip: tiny, big-headed, with round ears.
    thigh: 8, shin: 8, torso: 12, upperArm: 7, forearm: 7, headR: 7.5, neck: 1, limbW: 5, torsoW: 11,
    skin: '#f6dcc0', hair: '#a0643a', accent: '#ffd84a', accessory: 'ears',
    body: '#7fd36b', alt: '#e77fc4', projectile: 'pebble',
    blurb: 'Tiny featherweight. Three air jumps, flies far.',
  },
  {
    // Kestrel: lean, with a swept-back feather crest.
    thigh: 14, shin: 15, torso: 18, upperArm: 12, forearm: 12, headR: 7, neck: 2.5, limbW: 6, torsoW: 12,
    skin: '#e6b98f', hair: '#2b2f4a', accent: '#ff6b3d', accessory: 'crest',
    body: '#3a5fd0', alt: '#d8a031', projectile: 'dart',
    blurb: 'Fast-falling rushdown. Quick, aggressive dives.',
  },
  {
    // Lumen: tall and slender, with a floating halo.
    thigh: 16, shin: 17, torso: 20, upperArm: 13, forearm: 13, headR: 7, neck: 3, limbW: 5, torsoW: 11,
    skin: '#f3e3d3', hair: '#fff2b0', accent: '#ffe27a', accessory: 'halo',
    body: '#9c7be0', alt: '#5fc2a8', projectile: 'orb',
    blurb: 'Floaty zoner. Keeps you out with slow, strong shots.',
  },
  {
    // Basalt: a stone giant with boulder shoulders.
    thigh: 19, shin: 18, torso: 28, upperArm: 18, forearm: 17, headR: 9.5, neck: 2, limbW: 13, torsoW: 30,
    skin: '#9a9fa8', hair: '#5b5f69', accent: '#ff7a2f', accessory: 'boulders',
    body: '#7a6250', alt: '#3d6f68',
    blurb: 'Giant super-heavyweight. Slowest and strongest.',
  },
  {
    // Sable: tall swordfighter.
    thigh: 16, shin: 16, torso: 21, upperArm: 14, forearm: 14, headR: 7.5, neck: 2.5, limbW: 6, torsoW: 12,
    skin: '#d9a982', hair: '#1c1c24', accent: '#d5e1ec', accessory: 'blade',
    body: '#a8335a', alt: '#3e8f5f', projectile: 'crescent',
    blurb: 'Long reach. The tip of the blade hits hardest.',
  },
  {
    // Rook: sturdy all-rounder in a cape.
    thigh: 14, shin: 14, torso: 20, upperArm: 13, forearm: 13, headR: 8, neck: 2.5, limbW: 8, torsoW: 16,
    skin: '#e0b48c', hair: '#7a4a2a', accent: '#ffd166', accessory: 'cape',
    body: '#2f9f98', alt: '#b5523b',
    blurb: 'All-rounder. Solid at everything, with a counter.',
  },
];
