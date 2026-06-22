// Resolution of the scene's single shared pixel grid.
//
// Everything is authored against a 640x360 "design space", then multiplied by
// RES to get the actual virtual resolution. Bumping RES raises the whole scene's
// pixel density uniformly — finer dither, more detailed fish, sharper ruins —
// while keeping every feature the same *relative* size and the layout identical.
// Absolute sizes/speeds in px (and px/s) scale with RES; angles, normalized
// fractions, decay rates, and per-pixel dither/noise do not (so the dither and
// organic texture simply get finer, which is the point). See CLAUDE.md "One
// pixel grid".
export const RES = 2;

export const DESIGN_W = 640;
export const DESIGN_H = 360;
export const VW = DESIGN_W * RES;
export const VH = DESIGN_H * RES;
