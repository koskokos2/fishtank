import type { KAPLAYCtx } from "kaplay";

type Point = { x: number; y: number };

// Clockwise screen-px corners of a display's glass: top-left, top-right,
// bottom-right, bottom-left.
export type ScreenQuad = [Point, Point, Point, Point];

// 3x5 pixel glyphs, rows top to bottom. The degree sign is a raised 2x2 block.
const GLYPHS: Record<string, string> = {
  "0": "111101101101111",
  "1": "010110010010111",
  "2": "111001111100111",
  "3": "111001111001111",
  "4": "101101111001001",
  "5": "111100111001111",
  "6": "111100111101111",
  "7": "111001001001001",
  "8": "111101111101111",
  "9": "111101111001111",
  "-": "000000111000000",
  "°": "110110000000000",
};

function project(quad: ScreenQuad, u: number, v: number): Point {
  const [tl, tr, br, bl] = quad;
  const top = { x: tl.x + (tr.x - tl.x) * u, y: tl.y + (tr.y - tl.y) * u };
  const bottom = { x: bl.x + (br.x - bl.x) * u, y: bl.y + (br.y - bl.y) * u };
  return {
    x: top.x + (bottom.x - top.x) * v,
    y: top.y + (bottom.y - top.y) * v,
  };
}

// Draws text as whole-pixel squares centred on (centerU, centerV) of the quad.
// Each glyph pixel is an axis-aligned pixelSize square whose position steps
// along the quad's edge directions and is rounded to the integer grid, so the
// text follows the screen's perspective as pixel-art stair-steps rather than
// antialiased sub-pixel polygons.
export function drawScreenText(
  k: KAPLAYCtx,
  quad: ScreenQuad,
  text: string,
  centerU: number,
  centerV: number,
  pixelSize: number,
  color: [number, number, number],
  opacity: number,
) {
  const [tl, tr, br, bl] = quad;
  const centre = project(quad, centerU, centerV);
  // Exact pixelSize pitch along each axis, with the quad's perspective applied
  // as shear only: columns drop by the top/bottom edges' slope, rows lean by
  // the side edges' inverse slope. Keeping the pitch whole keeps glyph rows
  // and columns evenly spaced after rounding.
  const ux = (tr.x - tl.x + br.x - bl.x) / 2;
  const uy = (tr.y - tl.y + br.y - bl.y) / 2;
  const vx = (bl.x - tl.x + br.x - tr.x) / 2;
  const vy = (bl.y - tl.y + br.y - tr.y) / 2;
  const eu = { x: pixelSize, y: (uy / ux) * pixelSize };
  const ev = { x: (vx / vy) * pixelSize, y: pixelSize };

  const cols = text.length * 4 - 1;
  for (let index = 0; index < text.length; index++) {
    const glyph = GLYPHS[text[index]];
    if (!glyph) continue;
    for (let row = 0; row < 5; row++)
      for (let col = 0; col < 3; col++) {
        if (glyph[row * 3 + col] === "0") continue;
        const gx = index * 4 + col - cols / 2;
        const gy = row - 2.5;
        k.drawRect({
          pos: k.vec2(
            Math.round(centre.x + gx * eu.x + gy * ev.x),
            Math.round(centre.y + gx * eu.y + gy * ev.y),
          ),
          width: pixelSize,
          height: pixelSize,
          color: k.rgb(...color),
          opacity,
        });
      }
  }
}
