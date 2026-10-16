import type { RGBA } from "./color";

export const WATER_TOP: RGBA = [96, 178, 190, 255];
export const WATER_NEXT: RGBA = [66, 150, 166, 255];
export const WATER_BOTTOM: RGBA = [7, 24, 44, 255];

export const WATER_STOPS: RGBA[] = [
  WATER_TOP,
  WATER_NEXT,
  [44, 120, 144, 255],
  [30, 96, 124, 255],
  [22, 74, 104, 255],
  [16, 56, 84, 255],
  [12, 42, 68, 255],
  [9, 32, 54, 255],
  WATER_BOTTOM,
];
