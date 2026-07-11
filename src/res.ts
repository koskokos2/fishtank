// Resolution of the scene's single shared pixel grid.
//
// Everything is authored against a 640x360 "design space", then multiplied by
// RES to get the actual virtual resolution. Bumping RES raises the tank buffer
// density — sharper ruins and more room around fixed-resolution 128px fish
// sprites — while keeping scene layout identical. Absolute sizes/speeds in px
// (and px/s) scale with RES; angles, normalized fractions, and decay rates do
// not. See CLAUDE.md "One pixel grid".
//
// ?res=1|2 overrides the authored density per launch, so one build serves weak
// devices (a Pi renders 4-9x fewer pixels) — every consumer reads RES at module
// init, before the scene exists. Headless tools have no location and bake at
// the authored default.
const AUTHORED_RES = 3;
const queryRes =
  typeof location === "undefined"
    ? NaN
    : Number(new URLSearchParams(location.search).get("res"));
export const RES = [1, 2, 3].includes(queryRes) ? queryRes : AUTHORED_RES;

export const DESIGN_W = 640;
export const DESIGN_H = 360;
export const VW = DESIGN_W * RES;
export const VH = DESIGN_H * RES;
