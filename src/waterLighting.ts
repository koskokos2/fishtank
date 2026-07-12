import type { KAPLAYCtx } from "kaplay";
import { VH, VW } from "./res";

export const WATER_LIGHT_SHADER = "water-light";

// ---------------------------------------------------------------------------
// WATER LIGHTING CONTROLS
// ---------------------------------------------------------------------------
// All positions and distances are fractions of the 640x360 scene. For example,
// 0.10 on the y axis is 10% of the tank height. Change these values and reload;
// no GLSL editing is required.
export const WATER_LIGHTING_TUNING = {
  // Shared origin for the surface opening, major shafts, and fine fan.
  // The horizontal position normally tracks the time of day via sunEmitterX()
  // and reaches the shader through the u_emitterX uniform. Set xOverride to a
  // fraction (0 = left, 0.5 = centre/noon, 1 = right) to pin it and ignore the
  // clock; leave it null to let it drift over the day.
  emitter: {
    xOverride: null as number | null,
    heightAboveSurface: 0.18, // smaller = source closer to water / wider fan
    surfaceSpread: 0.38, // how much horizontal ceiling area emits rays
    motionSpeed: 0.11,
    motionAmount: 0.0014,
  },

  // Depth is measured against the local sand height, not a flat screen line.
  fade: {
    enterStart: 0.018, // where rays begin immediately under the surface
    enterEnd: 0.065,
    startDepth: 0.065, // fraction of each local water column
    endDepth: 0.84, // rays are exactly zero after this fraction
    curve: 1.55, // larger = faster/darker falloff
  },

  majorRays: {
    count: 12, // 0–12; lower counts choose an even subset of the presets below
    widthScale: 0.55,
    opacityScale: 0.92, // multiplies each preset's opacity
    intensity: 0.16, // final contribution added to the scene
    edgeCore: 0.82, // closer to 1 = sharper edges; lower = softer edges
    breathingBase: 0.92,
    breathingAmount: 0.08,
    maxOverlap: 1.65,
    shimmerBase: 0.88,
    shimmerAmountA: 0.1,
    shimmerAmountB: 0.06,
    shimmerYFrequencyA: 47.0,
    shimmerXFrequencyA: 13.0,
    shimmerSpeedA: 0.29,
    shimmerYFrequencyB: 19.0,
    shimmerXFrequencyB: 31.0,
    shimmerSpeedB: 0.17,
    grainMin: 0.82,
    grainCell: [4, 3],
    colors: {
      deep: [0.2, 0.56, 0.72],
      aqua: [0.3, 0.78, 0.82],
      pale: [0.56, 0.94, 0.88],
    },
  },

  // Thin secondary streaks between the hand-authored major rays.
  fineRays: {
    opacity: 0.36, // set to 0 to disable
    frequency: 30.0, // approximate number/density of streaks
    distortionFrequency: 6.4,
    distortionPhase: 0.7,
    distortionAmount: 1.45,
    animationSpeed: 0.09,
    thresholdStart: 0.62,
    thresholdEnd: 0.95,
    fanMaskStart: 2.5,
    fanMaskEnd: 3.4,
    projectionFloor: 0.06,
  },

  // Layered, curved wave fields seen on the underside of the water surface.
  // domeScale and domeCurvature make the ceiling read as a small view onto a
  // much larger curved surface instead of a flat sheet facing the camera.
  surface: {
    intensity: 0.82,
    haloIntensity: 0.28,
    darkeningBetweenCaustics: 0.06,
    color: [0.68, 1.0, 0.95],
    haloColor: [0.2, 0.78, 0.84],
    zoneStart: 0.05,
    zoneEnd: 0.15, // dense ceiling, then an exact zero below the surface band
    domeScale: [1.0, 2.65],
    domeCurvature: 0.85,
    primaryFrequency: 63.0,
    secondaryFrequency: 91.0,
    horizontalFrequency: 172.0,
    primaryWidth: 0.17,
    primarySoftness: 0.2,
    secondaryWidth: 0.12,
    secondarySoftness: 0.17,
    haloWidth: 0.4,
    haloSoftness: 0.42,
    warpAmountA: 0.9,
    warpAmountB: 0.52,
    animationSpeed: 0.09,
    radialHorizontalScale: 1.0,
    radialVerticalScale: 2.05,
    radialFadeStart: 0.035,
    radialFadeEnd: 0.54, // caustics are exactly zero far from the emitter
    grainMin: 0.68,
    grainCell: [4, 3],
  },

  // Bright opening and soft glow around the emitter.
  glow: {
    intensity: 0.34,
    horizontalInner: 0.018,
    horizontalOuter: 0.42,
    depth: 0.17,
    apertureInner: 0.02,
    apertureOuter: 0.17,
    apertureY: -0.018,
    apertureHorizontalScale: 1.05,
    apertureVerticalScale: 2.8,
    softGlowMix: 0.64,
  },

  // Keeps trigonometric phases small and consistent in long-running tabs.
  animationLoopSeconds: Math.PI * 200,
} as const;

// Horizontal emitter position driven by the local wall clock, so the light
// slowly sweeps across the tank over a real day. The sun rises at the left edge
// at 07:00, is overhead (centre) at noon, and sets at the right edge at 18:00;
// through the night it stays parked at the right edge and snaps back to the left
// at 07:00. Piecewise-linear so it passes exactly through the three anchors.
export function sunEmitterX(date: Date = new Date()): number {
  const override = WATER_LIGHTING_TUNING.emitter.xOverride;
  if (override !== null) return override;
  const hours =
    date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
  if (hours < 7 || hours >= 18) return 1;
  if (hours < 12) return ((hours - 7) / 5) * 0.5;
  return 0.5 + ((hours - 12) / 6) * 0.5;
}

type RayShade = keyof typeof WATER_LIGHTING_TUNING.majorRays.colors;
type RayPreset = {
  direction: number;
  width: number;
  phase: number;
  opacity: number;
  shade: RayShade;
};

// Per-ray artistic controls. Direction chooses the part of the surface it enters
// (negative = left, positive = right); width and opacity are independent.
export const WATER_RAY_PRESETS = [
  { direction: -0.72, width: 0.02, phase: 0.2, opacity: 0.3, shade: "deep" },
  { direction: -0.57, width: 0.07, phase: 1.3, opacity: 0.4, shade: "deep" },
  { direction: -0.42, width: 0.015, phase: 2.4, opacity: 0.48, shade: "aqua" },
  { direction: -0.3, width: 0.08, phase: 3.5, opacity: 0.36, shade: "aqua" },
  { direction: -0.19, width: 0.025, phase: 4.6, opacity: 0.62, shade: "pale" },
  { direction: -0.095, width: 0.06, phase: 5.7, opacity: 0.5, shade: "pale" },
  { direction: -0.012, width: 0.018, phase: 6.8, opacity: 0.68, shade: "pale" },
  { direction: 0.083, width: 0.07, phase: 7.9, opacity: 0.54, shade: "pale" },
  { direction: 0.19, width: 0.024, phase: 9.0, opacity: 0.4, shade: "aqua" },
  { direction: 0.31, width: 0.055, phase: 10.1, opacity: 0.56, shade: "aqua" },
  { direction: 0.45, width: 0.015, phase: 11.2, opacity: 0.36, shade: "deep" },
  { direction: 0.62, width: 0.045, phase: 12.3, opacity: 0.28, shade: "deep" },
] satisfies readonly RayPreset[];

const glslFloat = (value: number) =>
  Number.isInteger(value) ? `${value}.0` : String(value);
const glslVec2 = (value: readonly [number, number]) =>
  `vec2(${glslFloat(value[0])}, ${glslFloat(value[1])})`;
const glslVec3 = (value: readonly [number, number, number]) =>
  `vec3(${value.map(glslFloat).join(", ")})`;

function selectedRayPresets() {
  const count = Math.max(
    0,
    Math.min(
      WATER_RAY_PRESETS.length,
      Math.round(WATER_LIGHTING_TUNING.majorRays.count),
    ),
  );
  if (count === WATER_RAY_PRESETS.length) return WATER_RAY_PRESETS;
  if (count === 0) return [];
  if (count === 1) {
    return [
      WATER_RAY_PRESETS.reduce((best, ray) =>
        Math.abs(ray.direction) < Math.abs(best.direction) ? ray : best,
      ),
    ];
  }
  return Array.from({ length: count }, (_, i) => {
    const index = Math.round(
      ((i + 0.5) * WATER_RAY_PRESETS.length) / count - 0.5,
    );
    return WATER_RAY_PRESETS[index];
  });
}

const rayShaderLines = selectedRayPresets()
  .map((ray) => {
    const width = ray.width * WATER_LIGHTING_TUNING.majorRays.widthScale;
    const opacity = ray.opacity * WATER_LIGHTING_TUNING.majorRays.opacityScale;
    return `rayLight += ${ray.shade}Ray * beam(p, ${glslFloat(ray.direction)}, ${glslFloat(width)}, ${glslFloat(ray.phase)}) * ${glslFloat(opacity)};`;
  })
  .join("\n  ");

// Animated light seen from below the water surface. The effect runs as the
// fragment shader of the existing opaque backdrop sprite, so it costs no extra
// full-screen pass and naturally stays behind fish, plants, props, and sand.
// Coordinates are quantized to the actual virtual buffer before any pattern is
// evaluated. This keeps whole-pixel motion while using the same high-resolution
// pixel grid as the procedurally-painted backdrop beneath it.
const WATER_LIGHT_FRAG = `
// KAPLAY's fragment template defaults to mediump. Re-declare the default for
// this effect so Chrome/ANGLE and Safari/Metal evaluate narrow caustic boundaries
// and low-energy ray tails with the same precision.
precision highp float;

uniform float u_time;
uniform float u_emitterX;

float dashHash(vec2 v) {
  vec3 p3 = fract(vec3(v.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// A narrow highlight around a warped wave phase. Combining several of these
// produces soft, intersecting ribbons without the straight Voronoi boundaries
// that made the previous surface resemble cracked glass.
float causticLine(float phase, float width, float softness) {
  return 1.0 - smoothstep(width, width + softness, abs(sin(phase)));
}

// A smooth version of the broad dune contour from backdrop.ts. The tiny grain
// there is deliberately omitted: rays should fade across a clean band instead
// of tracing every one-pixel bump in the sand.
float seabedTop(float x) {
  float slope = mix(-13.0, 11.0, x) / 360.0;
  float swell = (
    sin(x * 6.2831853 - 0.6) * 8.0
    + sin(x * 12.5663706 + 1.2) * 4.0
  ) / 360.0;
  float g0 = (x - 0.18) / 0.12;
  float g1 = (x - 0.62) / 0.16;
  float g2 = (x - 0.90) / 0.10;
  float mound = (
    -exp(-(g0 * g0)) * 9.0
    + exp(-(g1 * g1)) * 7.0
    - exp(-(g2 * g2)) * 6.0
  ) / 360.0;
  float baseTop = 1.0 - 58.0 / 360.0 + slope + swell + mound;
  float duneRise = smoothstep(0.0, 1.0, clamp(x / 0.4, 0.0, 1.0));
  return x < 0.4 ? mix(0.6, baseTop, duneRise) : baseTop;
}

// Light is strongest just under the surface, then loses energy continuously
// through the local water column. Expressing depth relative to the nearby sand
// makes rays disappear early over tall dunes as well as over the deep basin.
float rayDepthFade(vec2 p) {
  float enterWater = smoothstep(
    ${glslFloat(WATER_LIGHTING_TUNING.fade.enterStart)},
    ${glslFloat(WATER_LIGHTING_TUNING.fade.enterEnd)},
    p.y
  );
  float waterColumnDepth = p.y / max(0.1, seabedTop(p.x));
  float remaining = 1.0 - smoothstep(
    ${glslFloat(WATER_LIGHTING_TUNING.fade.startDepth)},
    ${glslFloat(WATER_LIGHTING_TUNING.fade.endDepth)},
    waterColumnDepth
  );
  return enterWater * pow(
    max(0.0, remaining),
    ${glslFloat(WATER_LIGHTING_TUNING.fade.curve)}
  );
}

float beam(
  vec2 p,
  float direction,
  float angularWidth,
  float phase
) {
  // The shared source sits just above the surface, close to the bright opening.
  // surfaceSpan preserves the broad entry pattern while the shallower source
  // makes the shafts fan outward more clearly, as in the reference.
  float sourceDepth = ${glslFloat(WATER_LIGHTING_TUNING.emitter.heightAboveSurface)};
  float surfaceSpan = ${glslFloat(WATER_LIGHTING_TUNING.emitter.surfaceSpread)};
  float travel = max(0.0, p.y + sourceDepth);
  float projection = travel / sourceDepth;
  float motion = sin(
    u_time * ${glslFloat(WATER_LIGHTING_TUNING.emitter.motionSpeed)} + phase
  );
  float center = u_emitterX
    + direction * surfaceSpan * projection
    + motion * ${glslFloat(WATER_LIGHTING_TUNING.emitter.motionAmount)} * projection;
  float halfWidth = angularWidth * surfaceSpan * projection;
  float wedge = 1.0 - smoothstep(
    halfWidth * ${glslFloat(WATER_LIGHTING_TUNING.majorRays.edgeCore)},
    halfWidth,
    abs(p.x - center)
  );

  float breathe = ${glslFloat(WATER_LIGHTING_TUNING.majorRays.breathingBase)}
    + motion * ${glslFloat(WATER_LIGHTING_TUNING.majorRays.breathingAmount)};
  return wedge * rayDepthFade(p) * breathe;
}

vec4 frag(vec2 pos, vec2 uv, vec4 color, sampler2D tex) {
  vec4 base = def_frag();

  // Pattern pixels live on the scene's native virtual buffer, independent of
  // window scale. At the authored RES=3 this is a 1920x1080 pixel-art grid.
  vec2 renderSize = vec2(${glslFloat(VW)}, ${glslFloat(VH)});
  vec2 p = (floor(uv * renderSize) + 0.5) / renderSize;
  float t = u_time;

  // Several warped wave fields are projected across a shallow dome. Their
  // curved intersections suggest an immense spherical surface overhead, while
  // independent fragment masks keep the bands choppy rather than diagrammatic.
  vec2 renderPx = floor(uv * renderSize);
  float surfaceZone = 1.0 - smoothstep(
    ${glslFloat(WATER_LIGHTING_TUNING.surface.zoneStart)},
    ${glslFloat(WATER_LIGHTING_TUNING.surface.zoneEnd)},
    p.y
  );
  float surfaceCaustics = 0.0;
  float surfaceHalo = 0.0;

  // The branch is coherent across scanlines and skips the surface pattern for
  // most of the tank. Unlike the old Voronoi pass, there are no polygon cells.
  if (p.y < ${glslFloat(WATER_LIGHTING_TUNING.surface.zoneEnd)}) {
    vec2 domePos = vec2(
      p.x - u_emitterX,
      p.y - ${glslFloat(WATER_LIGHTING_TUNING.glow.apertureY)}
    ) * ${glslVec2(WATER_LIGHTING_TUNING.surface.domeScale)};
    vec2 warpedDome = domePos;
    warpedDome.x += sin(
      domePos.y * 13.0 + domePos.x * 5.0
        - t * ${glslFloat(WATER_LIGHTING_TUNING.surface.animationSpeed * 0.78)}
    ) * 0.032;
    warpedDome.x += sin(
      domePos.y * 29.0 - domePos.x * 11.0
        + t * ${glslFloat(WATER_LIGHTING_TUNING.surface.animationSpeed * 0.44)}
    ) * 0.015;
    warpedDome.y += sin(
      domePos.x * 19.0
        + t * ${glslFloat(WATER_LIGHTING_TUNING.surface.animationSpeed)}
    ) * 0.024;
    warpedDome.y += sin(
      domePos.x * 37.0 - domePos.y * 7.0
        - t * ${glslFloat(WATER_LIGHTING_TUNING.surface.animationSpeed * 0.56)}
    ) * 0.01;

    float domeRadius = length(warpedDome);
    float sphereCoordinate = domeRadius
      + domeRadius * domeRadius * domeRadius
        * ${glslFloat(WATER_LIGHTING_TUNING.surface.domeCurvature)};
    float domeAngle = atan(warpedDome.y, warpedDome.x);
    float primaryPhase = sphereCoordinate
      * ${glslFloat(WATER_LIGHTING_TUNING.surface.primaryFrequency)}
      + sin(
        domeAngle * 6.0
          + t * ${glslFloat(WATER_LIGHTING_TUNING.surface.animationSpeed)}
      ) * ${glslFloat(WATER_LIGHTING_TUNING.surface.warpAmountA)}
      + sin(
        warpedDome.x * 17.0 - warpedDome.y * 5.0
          - t * ${glslFloat(WATER_LIGHTING_TUNING.surface.animationSpeed * 0.67)}
      ) * ${glslFloat(WATER_LIGHTING_TUNING.surface.warpAmountB)};

    vec2 shiftedDome = warpedDome + vec2(
      sin(t * ${glslFloat(WATER_LIGHTING_TUNING.surface.animationSpeed * 0.5)})
        * 0.018,
      cos(t * ${glslFloat(WATER_LIGHTING_TUNING.surface.animationSpeed * 0.39)})
        * 0.011
    );
    float shiftedRadius = length(shiftedDome);
    float shiftedSphere = shiftedRadius
      + shiftedRadius * shiftedRadius * shiftedRadius
        * ${glslFloat(WATER_LIGHTING_TUNING.surface.domeCurvature * 0.72)};
    float secondaryPhase = shiftedSphere
      * ${glslFloat(WATER_LIGHTING_TUNING.surface.secondaryFrequency)}
      + sin(
        domeAngle * 9.0
          - t * ${glslFloat(WATER_LIGHTING_TUNING.surface.animationSpeed * 0.73)}
      ) * ${glslFloat(WATER_LIGHTING_TUNING.surface.warpAmountA * 0.8)}
      + sin(
        warpedDome.x * 31.0 + warpedDome.y * 11.0
          + t * ${glslFloat(WATER_LIGHTING_TUNING.surface.animationSpeed * 0.46)}
      ) * ${glslFloat(WATER_LIGHTING_TUNING.surface.warpAmountB)};

    float horizontalPhase = p.y
      * ${glslFloat(WATER_LIGHTING_TUNING.surface.horizontalFrequency)}
      + sphereCoordinate * 12.0
      + sin(
        p.x * 31.0
          + t * ${glslFloat(WATER_LIGHTING_TUNING.surface.animationSpeed * 0.61)}
      ) * 0.8
      + sin(p.x * 67.0 - p.y * 19.0) * 0.35;

    float fragmentA = smoothstep(
      -0.42,
      0.62,
      sin(p.x * 83.0 + p.y * 41.0 - t * 0.11)
        + sin(p.x * 37.0 - p.y * 89.0 + t * 0.07)
    );
    float fragmentB = smoothstep(
      -0.16,
      0.78,
      sin(p.x * 131.0 - p.y * 57.0 + t * 0.06)
        + sin(p.x * 53.0 + p.y * 113.0 - t * 0.09) * 0.48
    );

    float primaryCore = causticLine(
      primaryPhase,
      ${glslFloat(WATER_LIGHTING_TUNING.surface.primaryWidth)},
      ${glslFloat(WATER_LIGHTING_TUNING.surface.primarySoftness)}
    ) * (0.2 + fragmentA * 0.8);
    float secondaryCore = causticLine(
      secondaryPhase,
      ${glslFloat(WATER_LIGHTING_TUNING.surface.secondaryWidth)},
      ${glslFloat(WATER_LIGHTING_TUNING.surface.secondarySoftness)}
    ) * fragmentB * 0.78;
    float horizontalCore = causticLine(
      horizontalPhase,
      ${glslFloat(WATER_LIGHTING_TUNING.surface.secondaryWidth)},
      ${glslFloat(WATER_LIGHTING_TUNING.surface.secondarySoftness)}
    ) * (0.3 + (1.0 - fragmentB) * 0.7) * 0.55;
    float waveCore = min(
      1.0,
      primaryCore + secondaryCore + horizontalCore
    );

    float primaryHalo = causticLine(
      primaryPhase,
      ${glslFloat(WATER_LIGHTING_TUNING.surface.haloWidth)},
      ${glslFloat(WATER_LIGHTING_TUNING.surface.haloSoftness)}
    ) * (0.35 + fragmentA * 0.65);
    float secondaryHalo = causticLine(
      secondaryPhase,
      ${glslFloat(WATER_LIGHTING_TUNING.surface.haloWidth * 0.82)},
      ${glslFloat(WATER_LIGHTING_TUNING.surface.haloSoftness)}
    ) * fragmentB * 0.58;
    float horizontalHalo = causticLine(
      horizontalPhase,
      ${glslFloat(WATER_LIGHTING_TUNING.surface.haloWidth * 0.72)},
      ${glslFloat(WATER_LIGHTING_TUNING.surface.haloSoftness)}
    ) * 0.34;
    float waveHalo = max(
      0.0,
      max(primaryHalo, max(secondaryHalo, horizontalHalo)) - waveCore * 0.55
    );

    float causticGrain = ${glslFloat(WATER_LIGHTING_TUNING.surface.grainMin)}
      + dashHash(
        floor(renderPx / ${glslVec2(WATER_LIGHTING_TUNING.surface.grainCell)})
      ) * ${glslFloat(1 - WATER_LIGHTING_TUNING.surface.grainMin)};
    vec2 radialPos = vec2(
      (p.x - u_emitterX)
        * ${glslFloat(WATER_LIGHTING_TUNING.surface.radialHorizontalScale)},
      (p.y - ${glslFloat(WATER_LIGHTING_TUNING.glow.apertureY)})
        * ${glslFloat(WATER_LIGHTING_TUNING.surface.radialVerticalScale)}
    );
    float radialFocus = 1.0 - smoothstep(
      ${glslFloat(WATER_LIGHTING_TUNING.surface.radialFadeStart)},
      ${glslFloat(WATER_LIGHTING_TUNING.surface.radialFadeEnd)},
      length(radialPos)
    );
    float hotspot = radialFocus * radialFocus;
    float radialBrightness = radialFocus * (0.34 + radialFocus * 0.66);

    surfaceCaustics = waveCore
      * causticGrain
      * surfaceZone
      * radialBrightness
      * (0.58 + hotspot * 0.72);
    surfaceHalo = waveHalo
      * (0.7 + causticGrain * 0.3)
      * surfaceZone
      * radialBrightness;
  }

  // The hot white-cyan opening at top centre anchors both caustics and rays.
  float centre = 1.0 - smoothstep(
    ${glslFloat(WATER_LIGHTING_TUNING.glow.horizontalInner)},
    ${glslFloat(WATER_LIGHTING_TUNING.glow.horizontalOuter)},
    abs(p.x - u_emitterX)
  );
  centre *= centre;
  float skyGlow = centre * (1.0 - smoothstep(
    ${glslFloat(WATER_LIGHTING_TUNING.fade.enterStart)},
    ${glslFloat(WATER_LIGHTING_TUNING.glow.depth)},
    p.y
  ));
  float aperture = 1.0 - smoothstep(
    ${glslFloat(WATER_LIGHTING_TUNING.glow.apertureInner)},
    ${glslFloat(WATER_LIGHTING_TUNING.glow.apertureOuter)},
    length(vec2(
      (p.x - u_emitterX)
        * ${glslFloat(WATER_LIGHTING_TUNING.glow.apertureHorizontalScale)},
      (p.y - ${glslFloat(WATER_LIGHTING_TUNING.glow.apertureY)})
        * ${glslFloat(WATER_LIGHTING_TUNING.glow.apertureVerticalScale)}
    ))
  );
  skyGlow = max(
    skyGlow * ${glslFloat(WATER_LIGHTING_TUNING.glow.softGlowMix)},
    aperture
  );

  // Each shaft keeps its own colour until final compositing. Sharper edges,
  // strongly varied widths, and cool/aqua/pale shades let overlapping rays
  // remain individually legible instead of collapsing into one grey-cyan wash.
  vec3 deepRay = ${glslVec3(WATER_LIGHTING_TUNING.majorRays.colors.deep)};
  vec3 aquaRay = ${glslVec3(WATER_LIGHTING_TUNING.majorRays.colors.aqua)};
  vec3 paleRay = ${glslVec3(WATER_LIGHTING_TUNING.majorRays.colors.pale)};
  vec3 rayLight = vec3(0.0);
  ${rayShaderLines}

  // Fine converging streaks fill the spaces between the major shafts. Their
  // projected coordinate naturally packs them near the aperture and spreads
  // them farther apart with depth, as in the supplied reference.
  float fanSourceDepth = ${glslFloat(WATER_LIGHTING_TUNING.emitter.heightAboveSurface)};
  float fanSurfaceSpan = ${glslFloat(WATER_LIGHTING_TUNING.emitter.surfaceSpread)};
  float fanCoord = (p.x - u_emitterX)
    * fanSourceDepth
    / max(
      ${glslFloat(WATER_LIGHTING_TUNING.fineRays.projectionFloor)},
      (p.y + fanSourceDepth) * fanSurfaceSpan
    );
  float fineFanWave = sin(
    fanCoord * ${glslFloat(WATER_LIGHTING_TUNING.fineRays.frequency)}
    + sin(
      fanCoord * ${glslFloat(WATER_LIGHTING_TUNING.fineRays.distortionFrequency)}
      + ${glslFloat(WATER_LIGHTING_TUNING.fineRays.distortionPhase)}
    ) * ${glslFloat(WATER_LIGHTING_TUNING.fineRays.distortionAmount)}
    + t * ${glslFloat(WATER_LIGHTING_TUNING.fineRays.animationSpeed)}
  );
  float fineFan = smoothstep(
    ${glslFloat(WATER_LIGHTING_TUNING.fineRays.thresholdStart)},
    ${glslFloat(WATER_LIGHTING_TUNING.fineRays.thresholdEnd)},
    fineFanWave
  );
  float fineFanMask = rayDepthFade(p)
    * (1.0 - smoothstep(
      ${glslFloat(WATER_LIGHTING_TUNING.fineRays.fanMaskStart)},
      ${glslFloat(WATER_LIGHTING_TUNING.fineRays.fanMaskEnd)},
      abs(fanCoord)
    ));
  rayLight += paleRay
    * fineFan
    * fineFanMask
    * ${glslFloat(WATER_LIGHTING_TUNING.fineRays.opacity)};
  float rayShimmer = ${glslFloat(WATER_LIGHTING_TUNING.majorRays.shimmerBase)}
    + sin(
      p.y * ${glslFloat(WATER_LIGHTING_TUNING.majorRays.shimmerYFrequencyA)}
      + p.x * ${glslFloat(WATER_LIGHTING_TUNING.majorRays.shimmerXFrequencyA)}
      - t * ${glslFloat(WATER_LIGHTING_TUNING.majorRays.shimmerSpeedA)}
    )
      * ${glslFloat(WATER_LIGHTING_TUNING.majorRays.shimmerAmountA)}
    + sin(
      p.y * ${glslFloat(WATER_LIGHTING_TUNING.majorRays.shimmerYFrequencyB)}
      - p.x * ${glslFloat(WATER_LIGHTING_TUNING.majorRays.shimmerXFrequencyB)}
      + t * ${glslFloat(WATER_LIGHTING_TUNING.majorRays.shimmerSpeedB)}
    )
      * ${glslFloat(WATER_LIGHTING_TUNING.majorRays.shimmerAmountB)};
  float rayGrain = ${glslFloat(WATER_LIGHTING_TUNING.majorRays.grainMin)}
    + dashHash(floor(renderPx / ${glslVec2(WATER_LIGHTING_TUNING.majorRays.grainCell)}))
      * ${glslFloat(1 - WATER_LIGHTING_TUNING.majorRays.grainMin)};
  rayLight = min(
    rayLight,
    vec3(${glslFloat(WATER_LIGHTING_TUNING.majorRays.maxOverlap)})
  ) * rayShimmer * rayGrain;

  // A slight ceiling darkening and a separate aqua halo give the wave ribbons
  // tonal depth instead of a single clean vector stroke.
  vec3 lit = base.rgb * (
    1.0
    - surfaceZone * ${glslFloat(WATER_LIGHTING_TUNING.surface.darkeningBetweenCaustics)}
  );
  vec3 surfaceColor = ${glslVec3(WATER_LIGHTING_TUNING.surface.color)};
  vec3 surfaceHaloColor = ${glslVec3(WATER_LIGHTING_TUNING.surface.haloColor)};
  lit += surfaceHaloColor
    * surfaceHalo
    * ${glslFloat(WATER_LIGHTING_TUNING.surface.haloIntensity)};
  lit += surfaceColor
    * surfaceCaustics
    * ${glslFloat(WATER_LIGHTING_TUNING.surface.intensity)};
  lit += surfaceColor
    * skyGlow
    * ${glslFloat(WATER_LIGHTING_TUNING.glow.intensity)};
  lit += rayLight * ${glslFloat(WATER_LIGHTING_TUNING.majorRays.intensity)};

  return vec4(min(lit, vec3(1.0)), base.a);
}
`;

export function loadWaterLighting(k: KAPLAYCtx) {
  k.loadShader(WATER_LIGHT_SHADER, null, WATER_LIGHT_FRAG);
}
