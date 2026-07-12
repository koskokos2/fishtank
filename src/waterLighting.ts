import type { KAPLAYCtx } from "kaplay";

export const WATER_LIGHT_SHADER = "water-light";

// Animated light seen from below the water surface. The effect runs as the
// fragment shader of the existing opaque backdrop sprite, so it costs no extra
// full-screen pass and naturally stays behind fish, plants, props, and sand.
// Coordinates are quantized to the 640x360 design grid before any pattern is
// evaluated: at RES=3 every lighting texel is a crisp 3x3 block, just like the
// procedurally-painted backdrop beneath it.
const WATER_LIGHT_FRAG = `
uniform float u_time;

float beam(
  vec2 p,
  float sourceX,
  float lean,
  float rootWidth,
  float spread,
  float phase
) {
  float depth = max(0.0, p.y - 0.018);
  float sway = sin(u_time * 0.11 + phase) * (0.0025 + depth * 0.006);
  float center = sourceX + lean * depth + sway;
  float halfWidth = rootWidth + spread * depth;
  float wedge = 1.0 - smoothstep(
    halfWidth * 0.24,
    halfWidth,
    abs(p.x - center)
  );

  // Rays appear immediately below the surface, then dissolve well before the
  // seabed so the bottom stays dark enough for silhouettes and luminous art.
  float vertical = smoothstep(0.035, 0.105, p.y)
    * (1.0 - smoothstep(0.38, 0.80, p.y));
  float breathe = 0.90 + sin(u_time * 0.07 + phase) * 0.10;
  return wedge * vertical * breathe;
}

vec4 frag(vec2 pos, vec2 uv, vec4 color, sampler2D tex) {
  vec4 base = def_frag();

  // Pattern pixels live in design space, independent of RES and window scale.
  vec2 designSize = vec2(640.0, 360.0);
  vec2 p = (floor(uv * designSize) + 0.5) / designSize;
  float t = u_time;

  // The broken bright bands describe the underside of the moving surface.
  // Several frequencies keep it watery without using expensive procedural
  // noise or introducing smooth subpixel crawl.
  float wave = sin(p.x * 36.0 + t * 0.53) * 0.0060
    + sin(p.x * 79.0 - t * 0.37) * 0.0030
    + sin(p.x * 151.0 + t * 0.19) * 0.0015;
  float ripple = sin(
    (p.y + wave) * 292.0
    + sin(p.x * 43.0 - t * 0.24) * 1.6
  );
  float rowA = floor(p.y * 64.0);
  float rowB = floor(p.y * 43.0);
  float broken = 0.50
    + sin(p.x * 71.0 + rowA * 1.7 + t * 0.31) * 0.30
    + sin(p.x * 149.0 - rowB * 2.1 - t * 0.17) * 0.20;
  float surfaceZone = 1.0 - smoothstep(0.025, 0.185, p.y);
  float surfaceLines = smoothstep(0.70, 0.98, ripple)
    * smoothstep(0.47, 0.72, broken)
    * surfaceZone;

  // A broad opening near the upper centre suggests the brightest patch of sky
  // above the tank and gives the fan of rays a common visual source.
  float centre = 1.0 - smoothstep(0.02, 0.50, abs(p.x - 0.52));
  centre *= centre;
  float skyGlow = centre * (1.0 - smoothstep(0.0, 0.16, p.y));

  // Irregular, overlapping shafts originate across most of the ceiling. Their
  // roots, expansion, direction, and strength intentionally vary: this avoids
  // the evenly-spaced spotlight fan that makes procedural rays look synthetic.
  float rays = 0.0;
  rays += beam(p, 0.060,  0.05, 0.010, 0.040, 0.2) * 0.35;
  rays += beam(p, 0.190,  0.02, 0.006, 0.095, 1.7) * 0.56;
  rays += beam(p, 0.370, -0.09, 0.020, 0.055, 3.1) * 0.72;
  rays += beam(p, 0.460,  0.08, 0.004, 0.125, 4.8) * 0.33;
  rays += beam(p, 0.700, -0.04, 0.018, 0.047, 6.4) * 0.61;
  rays += beam(p, 0.910, -0.06, 0.008, 0.080, 8.9) * 0.38;
  float rayShimmer = 0.84
    + sin(p.y * 47.0 + p.x * 13.0 - t * 0.29) * 0.10
    + sin(p.y * 19.0 - p.x * 31.0 + t * 0.17) * 0.06;
  rays = min(rays, 1.25) * rayShimmer;

  // Slightly darkening the ceiling between highlights gives the surface bands
  // enough contrast to read as a real boundary rather than pale decoration.
  vec3 lit = base.rgb * (1.0 - surfaceZone * 0.055);
  vec3 lightColor = vec3(0.34, 0.84, 0.90);
  lit += lightColor * surfaceLines * 0.14;
  lit += lightColor * skyGlow * 0.085;
  lit += lightColor * rays * 0.11;

  return vec4(min(lit, vec3(1.0)), base.a);
}
`;

export function loadWaterLighting(k: KAPLAYCtx) {
  k.loadShader(WATER_LIGHT_SHADER, null, WATER_LIGHT_FRAG);
}
