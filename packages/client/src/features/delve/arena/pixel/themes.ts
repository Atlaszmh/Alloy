/**
 * Look of the pixel floor per biome. Colors are 0–255 RGB triples; `ambient`
 * is the light multiplier where nothing glows, so a low ambient makes glowing
 * water, runes and fungi carry the scene.
 */

export type RGB = readonly [number, number, number];
export type FluidKind = 'water' | 'lava' | 'spirit';
export type Weather = 'rain' | 'storm' | 'snow' | 'embers' | 'mist' | 'none';
export type PropKind = 'mushroom' | 'crystal';

export interface PixelTheme {
  id: string;
  ambient: RGB;
  /** Bare ground, dark → light. */
  soil: readonly RGB[];
  /** Shoreline next to fluid. */
  bank: readonly RGB[];
  /** Grass tones, dark → light. */
  grass: readonly RGB[];
  grassTip: RGB;
  /** Ferns and shrubs, dark → light. */
  bush: readonly RGB[];
  stone: RGB;
  mortar: RGB;
  moss: RGB;
  /** Cliffs framing the arena, dark → light. */
  wall: readonly RGB[];
  flowers: readonly RGB[];
  /** 0–1: how much flowers glow at night. */
  flowerGlow: number;
  /** 0–1 share of open ground covered by grass, and by shrubs. */
  grassCover: number;
  bushCover: number;
  fluid: FluidKind;
  fluidShallow: RGB;
  fluidDeep: RGB;
  fluidGlow: RGB;
  fluidGlowStrength: number;
  /** River half-width in cells. */
  riverWidth: number;
  pools: number;
  prop: PropKind;
  propColors: readonly RGB[];
  /** Chance per eligible cell to seed a cluster of glowing props. */
  propDensity: number;
  rune: RGB;
  weather: Weather;
  /** Fireflies / wisps drifting over the floor, or null. */
  motes: RGB | null;
}

const SUNKEN_QUARRY: PixelTheme = {
  id: 'sunken_quarry',
  ambient: [0.56, 0.62, 0.74],
  soil: [
    [70, 56, 44],
    [88, 70, 52],
    [106, 86, 62],
  ],
  bank: [
    [146, 130, 96],
    [172, 156, 116],
  ],
  grass: [
    [26, 72, 50],
    [36, 96, 58],
    [50, 122, 64],
    [72, 150, 72],
  ],
  grassTip: [124, 200, 96],
  bush: [
    [18, 58, 50],
    [30, 86, 62],
    [58, 126, 78],
  ],
  stone: [150, 146, 128],
  mortar: [78, 78, 72],
  moss: [72, 128, 70],
  wall: [
    [40, 46, 54],
    [62, 70, 78],
    [92, 102, 106],
  ],
  flowers: [
    [255, 122, 186],
    [255, 214, 102],
    [180, 136, 255],
    [124, 228, 255],
  ],
  flowerGlow: 0.4,
  grassCover: 0.64,
  bushCover: 0.22,
  fluid: 'water',
  fluidShallow: [70, 220, 212],
  fluidDeep: [16, 88, 138],
  fluidGlow: [70, 255, 225],
  fluidGlowStrength: 1,
  riverWidth: 5,
  pools: 2,
  prop: 'mushroom',
  propColors: [
    [90, 240, 255],
    [196, 124, 255],
  ],
  propDensity: 0.006,
  rune: [255, 210, 110],
  weather: 'rain',
  motes: [255, 228, 120],
};

const FROSTVAULT: PixelTheme = {
  id: 'frostvault',
  ambient: [0.6, 0.68, 0.84],
  soil: [
    [172, 188, 208],
    [194, 208, 224],
    [220, 230, 242],
  ],
  bank: [
    [136, 160, 186],
    [158, 182, 204],
  ],
  grass: [
    [42, 76, 96],
    [56, 96, 112],
    [78, 122, 134],
    [108, 150, 160],
  ],
  grassTip: [184, 224, 232],
  bush: [
    [22, 56, 62],
    [32, 76, 78],
    [54, 102, 100],
  ],
  stone: [150, 168, 192],
  mortar: [80, 94, 118],
  moss: [120, 170, 190],
  wall: [
    [56, 74, 102],
    [86, 108, 138],
    [140, 164, 194],
  ],
  flowers: [
    [160, 230, 255],
    [224, 240, 255],
  ],
  flowerGlow: 0.55,
  grassCover: 0.42,
  bushCover: 0.16,
  fluid: 'water',
  fluidShallow: [112, 232, 255],
  fluidDeep: [20, 68, 140],
  fluidGlow: [120, 232, 255],
  fluidGlowStrength: 0.9,
  riverWidth: 4,
  pools: 2,
  prop: 'crystal',
  propColors: [
    [140, 222, 255],
    [204, 184, 255],
  ],
  propDensity: 0.005,
  rune: [150, 232, 255],
  weather: 'snow',
  motes: [180, 232, 255],
};

const STORM_FOUNDRY: PixelTheme = {
  id: 'storm_foundry',
  ambient: [0.5, 0.52, 0.68],
  soil: [
    [46, 44, 62],
    [58, 56, 76],
    [72, 70, 92],
  ],
  bank: [
    [86, 84, 104],
    [102, 100, 120],
  ],
  grass: [
    [32, 56, 70],
    [42, 76, 84],
    [58, 98, 96],
    [82, 126, 110],
  ],
  grassTip: [152, 216, 172],
  bush: [
    [28, 42, 70],
    [40, 60, 92],
    [64, 90, 122],
  ],
  stone: [120, 118, 142],
  mortar: [56, 54, 72],
  moss: [70, 112, 102],
  wall: [
    [32, 30, 48],
    [48, 46, 68],
    [76, 74, 100],
  ],
  flowers: [
    [255, 236, 120],
    [140, 222, 255],
  ],
  flowerGlow: 0.6,
  grassCover: 0.46,
  bushCover: 0.16,
  fluid: 'water',
  fluidShallow: [120, 200, 255],
  fluidDeep: [28, 48, 120],
  fluidGlow: [190, 236, 255],
  fluidGlowStrength: 0.8,
  riverWidth: 4,
  pools: 1,
  prop: 'crystal',
  propColors: [
    [255, 232, 100],
    [160, 222, 255],
  ],
  propDensity: 0.005,
  rune: [255, 232, 90],
  weather: 'storm',
  motes: [255, 240, 150],
};

const CINDER_MINES: PixelTheme = {
  id: 'cinder_mines',
  ambient: [0.62, 0.52, 0.5],
  soil: [
    [44, 30, 26],
    [58, 40, 32],
    [74, 52, 40],
  ],
  bank: [
    [34, 26, 26],
    [50, 38, 36],
  ],
  grass: [
    [68, 42, 26],
    [92, 56, 28],
    [120, 76, 32],
    [154, 102, 40],
  ],
  grassTip: [216, 152, 62],
  bush: [
    [48, 28, 22],
    [68, 40, 28],
    [96, 58, 36],
  ],
  stone: [104, 86, 78],
  mortar: [50, 38, 34],
  moss: [122, 72, 40],
  wall: [
    [28, 18, 16],
    [46, 30, 26],
    [70, 48, 38],
  ],
  flowers: [
    [255, 140, 60],
    [255, 204, 92],
  ],
  flowerGlow: 0.85,
  grassCover: 0.36,
  bushCover: 0.12,
  fluid: 'lava',
  fluidShallow: [255, 156, 54],
  fluidDeep: [196, 48, 20],
  fluidGlow: [255, 122, 40],
  fluidGlowStrength: 1.25,
  riverWidth: 3,
  pools: 2,
  prop: 'crystal',
  propColors: [
    [255, 142, 60],
    [255, 96, 44],
  ],
  propDensity: 0.005,
  rune: [255, 152, 72],
  weather: 'embers',
  motes: null,
};

const BONE_CRYPTS: PixelTheme = {
  id: 'bone_crypts',
  ambient: [0.46, 0.44, 0.58],
  soil: [
    [48, 42, 54],
    [60, 52, 66],
    [76, 66, 80],
  ],
  bank: [
    [78, 74, 86],
    [94, 90, 102],
  ],
  grass: [
    [28, 50, 50],
    [38, 66, 62],
    [52, 86, 74],
    [72, 108, 88],
  ],
  grassTip: [132, 184, 144],
  bush: [
    [26, 38, 44],
    [36, 54, 58],
    [56, 78, 78],
  ],
  stone: [118, 112, 126],
  mortar: [58, 54, 66],
  moss: [70, 102, 86],
  wall: [
    [28, 24, 36],
    [44, 38, 54],
    [66, 60, 78],
  ],
  flowers: [
    [232, 232, 255],
    [194, 152, 255],
  ],
  flowerGlow: 0.75,
  grassCover: 0.46,
  bushCover: 0.18,
  fluid: 'spirit',
  fluidShallow: [150, 255, 204],
  fluidDeep: [58, 40, 140],
  fluidGlow: [140, 255, 192],
  fluidGlowStrength: 1.1,
  riverWidth: 4,
  pools: 2,
  prop: 'mushroom',
  propColors: [
    [184, 124, 255],
    [124, 255, 204],
  ],
  propDensity: 0.007,
  rune: [194, 152, 255],
  weather: 'mist',
  motes: [150, 255, 204],
};

const MOLTEN_CORE: PixelTheme = {
  id: 'molten_core',
  ambient: [0.52, 0.38, 0.34],
  soil: [
    [32, 22, 24],
    [44, 30, 30],
    [58, 40, 38],
  ],
  bank: [
    [26, 18, 20],
    [42, 28, 28],
  ],
  grass: [
    [58, 34, 22],
    [78, 46, 26],
    [102, 60, 30],
    [128, 78, 34],
  ],
  grassTip: [192, 112, 42],
  bush: [
    [38, 22, 20],
    [54, 30, 24],
    [78, 44, 30],
  ],
  stone: [96, 70, 62],
  mortar: [44, 30, 28],
  moss: [112, 62, 34],
  wall: [
    [24, 14, 12],
    [40, 24, 20],
    [62, 38, 30],
  ],
  flowers: [[255, 172, 62]],
  flowerGlow: 0.9,
  grassCover: 0.1,
  bushCover: 0.05,
  fluid: 'lava',
  fluidShallow: [255, 172, 62],
  fluidDeep: [206, 58, 20],
  fluidGlow: [255, 112, 32],
  fluidGlowStrength: 1.4,
  riverWidth: 5,
  pools: 2,
  prop: 'crystal',
  propColors: [
    [255, 122, 52],
    [255, 212, 122],
  ],
  propDensity: 0.006,
  rune: [255, 122, 52],
  weather: 'embers',
  motes: null,
};

export const PIXEL_THEMES: Record<string, PixelTheme> = {
  sunken_quarry: SUNKEN_QUARRY,
  frostvault: FROSTVAULT,
  storm_foundry: STORM_FOUNDRY,
  cinder_mines: CINDER_MINES,
  bone_crypts: BONE_CRYPTS,
  molten_core: MOLTEN_CORE,
};

export function themeForBiome(biomeId: string): PixelTheme {
  return PIXEL_THEMES[biomeId] ?? SUNKEN_QUARRY;
}
