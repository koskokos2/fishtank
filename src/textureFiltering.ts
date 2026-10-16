import type { KAPLAYCtx, SpriteComp, AnchorComp, ColorComp, OpacityComp, SpriteData } from "kaplay";
import { smoothTextures } from "./profiling";

export const FISH_FILTER_SHADER = "fish-cubic-c1";
export const GRID_FILTER_SHADER = "grid-cubic-c1";

// C=1, B=0: the sharp cubic setting selected in the rotation comparison.
// Custom high-precision UVs retain texel-center precision on packed 2048px pages.
export function loadTextureFiltering(k: KAPLAYCtx) {
  const gl = k.canvas.getContext("webgl")!;
  const precision = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT)!.precision > 0
    ? "highp" : "mediump";
  for (const grid of [false, true]) k.loadShader(grid ? GRID_FILTER_SHADER : FISH_FILTER_SHADER, `
    varying ${precision} vec2 filterUV;
    vec4 vert(vec2 pos, vec2 uv, vec4 color) {
      filterUV = uv;
      return def_vert();
    }
  `, `
    precision ${precision} float;
    varying ${precision} vec2 filterUV;
    uniform vec2 textureSize;
    ${grid ? `uniform vec2 atlasOrigin;
    uniform vec2 cellSize;` : `uniform vec2 frameMin;
    uniform vec2 frameMax;`}
    float weight(float x) {
      x = abs(x);
      if (x < 1.0) return x*x*x - 2.0*x*x + 1.0;
      if (x < 2.0) return -x*x*x + 5.0*x*x - 8.0*x + 4.0;
      return 0.0;
    }
    vec4 frag(vec2 pos, vec2 uv, vec4 color, sampler2D tex) {
      ${grid ? `vec2 frameMin = atlasOrigin + floor((filterUV * textureSize - atlasOrigin) / cellSize) * cellSize;
      vec2 frameMax = frameMin + cellSize;` : ""}
      vec2 point = filterUV * textureSize - 0.5;
      vec2 origin = floor(point);
      vec2 fraction = fract(point);
      vec4 result = vec4(0.0);
      for (int y = -1; y <= 2; y++) {
        for (int x = -1; x <= 2; x++) {
          vec2 offset = vec2(float(x), float(y));
          vec2 centre = origin + offset + 0.5;
          // Virtual transparent padding prevents cross-frame / cross-sprite bleed
          // without duplicating textures or changing the shared nearest sampler.
          vec2 inside = step(frameMin, centre) * (1.0 - step(frameMax, centre));
          vec4 sampleColor = texture2D(tex, centre / textureSize) * inside.x * inside.y;
          result += sampleColor * weight(offset.x - fraction.x) * weight(offset.y - fraction.y);
        }
      }
      // Valid premultiplied RGBA only; no neighborhood halo limiter.
      result.a = clamp(result.a, 0.0, 1.0);
      result.rgb = clamp(result.rgb, vec3(0.0), vec3(result.a));
      return vec4(result.rgb * color.rgb, result.a) * color.a;
    }
  `);
}

// Regular plant/kelp grids already have transparent margins. Keep their quads
// and pivots unchanged, and derive frame bounds in the shader so every piece
// uses the same uniforms (per-frame bounds would force batch flushes).
const gridUniforms = new WeakMap<SpriteData, ReturnType<typeof makeGridUniform>>();
export function gridFilterUniform(k: KAPLAYCtx, data: SpriteData) {
  let uniform = gridUniforms.get(data);
  if (!uniform) {
    uniform = makeGridUniform(k, data);
    gridUniforms.set(data, uniform);
  }
  return uniform;
}

function makeGridUniform(k: KAPLAYCtx, data: SpriteData) {
  const first = data.frames[0];
  return {
    textureSize: k.vec2(data.tex.width, data.tex.height),
    atlasOrigin: k.vec2(first.x * data.tex.width, first.y * data.tex.height),
    cellSize: k.vec2(first.w * data.tex.width, first.h * data.tex.height),
  };
}

// Share prepared quads/uniforms between instances and layered body parts. The
// atlas is immutable after loading, so no per-actor or per-draw rebuild is needed.
const spriteFrames = new WeakMap<SpriteData, ReturnType<typeof makeSpriteFrames>>();
function makeSpriteFrames(k: KAPLAYCtx, data: SpriteData) {
  return data.frames.map(frame => ({
    quad: k.quad(frame.x - 2 / data.tex.width, frame.y - 2 / data.tex.height,
      frame.w + 4 / data.tex.width, frame.h + 4 / data.tex.height),
    uniform: {
      textureSize: k.vec2(data.tex.width, data.tex.height),
      frameMin: k.vec2(frame.x * data.tex.width, frame.y * data.tex.height),
      frameMax: k.vec2((frame.x + frame.w) * data.tex.width, (frame.y + frame.h) * data.tex.height),
    },
  }));
}

// For centre-anchored creature sprites. Keep KAPLAY's animation, dimensions,
// opacity, flips and collision area intact. Only drawing changes; two virtual
// border texels give the filter room without sampling adjacent atlas frames.
export function filteredSprite(k: KAPLAYCtx, name: string): SpriteComp {
  const sprite = k.sprite(name);
  const drawPixelated = sprite.draw!;
  const data = k.getSprite(name)!.data!;
  const frames = spriteFrames.get(data) ?? makeSpriteFrames(k, data);
  spriteFrames.set(data, frames);
  sprite.draw = function () {
    if (!smoothTextures) { drawPixelated.call(this); return; }
    const actor = this as SpriteComp & Partial<AnchorComp & ColorComp & OpacityComp>;
    const frame = frames[this.frame];
    if (!frame) return;
    k.drawUVQuad({
      tex: data.tex, quad: frame.quad, width: this.width + 4, height: this.height + 4,
      anchor: actor.anchor, flipX: this.flipX, flipY: this.flipY,
      color: actor.color, opacity: actor.opacity,
      shader: FISH_FILTER_SHADER, uniform: frame.uniform,
    });
  };
  return sprite;
}
