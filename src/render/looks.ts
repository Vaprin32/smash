import type { Look } from './skeleton';

export type ProjectileStyle = 'gust' | 'pebble' | 'dart' | 'orb' | 'crescent';

export interface FighterLook extends Look {
  /** Outfit color, and the one used instead when an earlier player slot picked the same fighter. */
  body: string;
  alt: string;
  /** How the neutral special projectile is drawn, if the fighter has one. */
  projectile?: ProjectileStyle;
  /** Their title in the realm, and one line about how they play (character select). */
  title: string;
  blurb: string;
}

/**
 * Body proportions, colors and accessory per fighter (indexed by charId).
 * Limb lengths are in world px; thigh + shin + torso + neck + 2 * headR is
 * roughly the fighter's hurtbox height.
 */
export const LOOKS: readonly FighterLook[] = [
  {
    // Wisp, the bard: slim and long-limbed, with a trailing scarf.
    thigh: 14, shin: 14, torso: 19, upperArm: 12, forearm: 12, headR: 7.5, neck: 2.5, limbW: 6, torsoW: 12,
    skin: '#f2d2b6', hair: '#f4f1ea', accent: '#e8c547', accessory: 'scarf',
    body: '#4f9c8f', alt: '#c9874a', projectile: 'gust',
    title: 'The Wandering Bard',
    blurb: 'Fast, light and floaty; weak hits, great recovery.',
  },
  {
    // Brick, the knight: broad, in a steel great helm.
    thigh: 15, shin: 14, torso: 22, upperArm: 14, forearm: 13, headR: 8.5, neck: 2, limbW: 10, torsoW: 22,
    skin: '#c98e64', hair: '#3a2a20', accent: '#b9c0c7', accessory: 'helmet',
    body: '#8e2a26', alt: '#2f4f86',
    title: 'The Iron Knight',
    blurb: 'Heavy, slow and hard-hitting; hard to launch.',
  },
  {
    // Pip, the squire: tiny, big-headed, with round ears.
    thigh: 8, shin: 8, torso: 12, upperArm: 7, forearm: 7, headR: 7.5, neck: 1, limbW: 5, torsoW: 11,
    skin: '#f6dcc0', hair: '#a0643a', accent: '#ffd84a', accessory: 'ears',
    body: '#6b8f3a', alt: '#b0643a', projectile: 'pebble',
    title: 'The Hedge Squire',
    blurb: 'Tiny featherweight with a sling; three air jumps.',
  },
  {
    // Kestrel, the falconer: lean, with a swept-back feather crest.
    thigh: 14, shin: 15, torso: 18, upperArm: 12, forearm: 12, headR: 7, neck: 2.5, limbW: 6, torsoW: 12,
    skin: '#e6b98f', hair: '#2b2f4a', accent: '#c8482e', accessory: 'crest',
    body: '#33508f', alt: '#a07a22', projectile: 'dart',
    title: 'The Falconer',
    blurb: 'Fast-falling rushdown; quick arrows, hawk dives.',
  },
  {
    // Lumen, the cleric: tall and slender, with a floating halo.
    thigh: 16, shin: 17, torso: 20, upperArm: 13, forearm: 13, headR: 7, neck: 3, limbW: 5, torsoW: 11,
    skin: '#f3e3d3', hair: '#fff2b0', accent: '#ffe27a', accessory: 'halo',
    body: '#d9d0bb', alt: '#7a5aa8', projectile: 'orb',
    title: 'The Cleric',
    blurb: 'Floaty zoner; keeps you out with slow, holy light.',
  },
  {
    // Basalt, the golem: a stone giant with boulder shoulders.
    thigh: 19, shin: 18, torso: 28, upperArm: 18, forearm: 17, headR: 9.5, neck: 2, limbW: 13, torsoW: 30,
    skin: '#9a9fa8', hair: '#5b5f69', accent: '#ff7a2f', accessory: 'boulders',
    body: '#7a6250', alt: '#3d6f68',
    title: 'The Stone Golem',
    blurb: 'Giant super-heavyweight; slowest and strongest.',
  },
  {
    // Sable, the duelist: tall, with a long sword.
    thigh: 16, shin: 16, torso: 21, upperArm: 14, forearm: 14, headR: 7.5, neck: 2.5, limbW: 6, torsoW: 12,
    skin: '#d9a982', hair: '#1c1c24', accent: '#d5e1ec', accessory: 'blade',
    body: '#6a2342', alt: '#2e6a48', projectile: 'crescent',
    title: 'The Duelist',
    blurb: 'Long reach; the tip of the blade hits hardest.',
  },
  {
    // Rook, the captain: sturdy, in a cape.
    thigh: 14, shin: 14, torso: 20, upperArm: 13, forearm: 13, headR: 8, neck: 2.5, limbW: 8, torsoW: 16,
    skin: '#e0b48c', hair: '#7a4a2a', accent: '#c9a03a', accessory: 'cape',
    body: '#3b6e5c', alt: '#8a3b2a',
    title: 'The Captain of the Guard',
    blurb: 'All-rounder, with a counter.',
  },
];
