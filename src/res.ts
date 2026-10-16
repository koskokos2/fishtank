// Resolution of the scene's single shared pixel grid.
//
// Everything is authored against a 640x360 "design space", then multiplied by
// RES to get the actual virtual resolution. Bumping RES raises the tank buffer
// density — sharper ruins and more room around fixed-resolution 128px fish
// sprites — while keeping scene layout identical. Absolute sizes/speeds in px
// (and px/s) scale with RES; angles, normalized fractions, and decay rates do
// not. See CLAUDE.md "One pixel grid".
//
// Encoded settings (or legacy ?res=1|2|6) override density per launch, so one build serves weak
// devices (a Pi renders 4-9x fewer pixels) and 4K displays (res=6 → 3840x2160) —
// every consumer reads RES at module init, before the scene exists. Headless
// tools have no location and bake at the authored default.
import { settings } from "./settings";
export const RES = settings.resolution;

export const DESIGN_W = 640;
export const DESIGN_H = 360;
export const VW = DESIGN_W * RES;
export const VH = DESIGN_H * RES;
