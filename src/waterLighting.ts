import type { KAPLAYCtx } from "kaplay";
import { VH, VW } from "./res";

export const WATER_LIGHT_SHADER = "water-light";

// Sunlight shafts in normalized scene coordinates, rendered in the backdrop
// pass. There is no surface texture or separate ceiling overlay.
export const WATER_LIGHTING_TUNING = {
  emitterX: 0.5,
  rayIntensity: 0.58,
  broadRayHalfWidth: 0.25,
  // All time coefficients in GLSL are integer multiples of .01, so wrapping
  // here preserves every wave phase, even after days in a kiosk.
  animationLoopSeconds: Math.PI * 200,
} as const;

// A fixed time is useful for repeatable browser previews of the actual shader.
// Empty/invalid values deliberately retain animation; zero is a valid still.
export function waterLightingTime(elapsed: number, fixed: string | null = null) {
  const parsed = fixed === null || fixed.trim() === "" ? NaN : Number(fixed);
  const time = Number.isFinite(parsed) && parsed >= 0 ? parsed : elapsed;
  const period = WATER_LIGHTING_TUNING.animationLoopSeconds;
  return ((time % period) + period) % period;
}

const f = (value: number) => Number.isInteger(value) ? `${value}.0` : String(value);

// This is intentionally a single backdrop pass: no light-map texture, animated
// sprite crossfades, framebuffer reads, or per-frame allocations. Detail lives
// on the same virtual pixel grid as the rest of the tank.
const WATER_LIGHT_FRAG = `
precision highp float;
uniform float u_time;
uniform float u_emitterX;

float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 a = fract(p);
  a = a * a * (3.0 - 2.0 * a);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), a.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0)), a.x), a.y);
}

float waves(vec2 q) {
  return sin(q.y * 12.0 + q.x * 1.8 + u_time * 0.13
             + sin(q.x * 2.7 - u_time * 0.07) * 0.65) * 0.55
       + sin(q.y * 19.0 - q.x * 2.4 - u_time * 0.09) * 0.29
       + sin(q.y * 31.0 + q.x * 4.3 + u_time * 0.11) * 0.16;
}

vec2 surfacePoint(vec2 p) {
  // Perspective compresses distant ripples towards the upper frame edge.
  float perspective = 1.0 / (0.45 + p.y * 11.0);
  return vec2((p.x - u_emitterX) * 11.0 * perspective,
              perspective * 1.35 + pow(p.x - u_emitterX, 2.0) * 1.8);
}

// Original continuous light field: peaks naturally form loose groups of rays.
float rayField(vec2 entry) {
  float transmitted = waves(entry);
  float streaks = noise(vec2(entry.x * 9.0, 2.0 + sin(u_time * 0.03) * 0.4));
  float shaft = smoothstep(-0.12, 0.60, transmitted + streaks * 0.45);
  return shaft * shaft;
}

vec4 frag(vec2 pos, vec2 uv, vec4 color, sampler2D tex) {
  vec4 base = def_frag();
  vec2 size = vec2(${f(VW)}, ${f(VH)});
  // KAPLAY UVs address its packed atlas, not the individual sprite. The
  // backdrop fills the viewport, so clip coordinates provide stable tank UVs
  // at every resolution regardless of where the packer placed the backdrop.
  vec2 tankUV = vec2(pos.x * 0.5 + 0.5, 0.5 - pos.y * 0.5);
  vec2 pixel = floor(tankUV * size);
  vec2 p = (pixel + 0.5) / size;
  // Nothing reaches the floor: save the procedural work over the lower scene.
  if (p.y > 0.68) return base;

  // Keep the continuous, uneven groups rather than assigning rays to lanes.
  float spread = 1.0 + p.y * 2.8;
  float entryX = u_emitterX + (p.x - u_emitterX) / spread;
  float drift = sin(p.y * 13.0 + entryX * 23.0 + u_time * 0.07) * 0.0015;
  vec2 entry = surfacePoint(vec2(entryX + drift, 0.045));
  float shafts = rayField(entry);

  // Only intervene where light stays strong across a broad neighbourhood.
  // Narrow peaks and nearby rays retain their original widths and overlap.
  // A wide plateau is broken into softer, irregular streaks, not fixed gaps.
  vec2 span = vec2(${f(WATER_LIGHTING_TUNING.broadRayHalfWidth)}, 0.0);
  float broad = min(min(rayField(entry - span), rayField(entry + span)),
                    min(rayField(entry - span * 0.5), rayField(entry + span * 0.5)));
  broad = smoothstep(0.18, 0.55, min(shafts, broad));
  float detail = noise(vec2(entry.x * 13.0, 5.0 + sin(u_time * 0.05) * 0.45));
  float broken = smoothstep(0.32, 0.72, detail);
  shafts *= mix(1.0, 0.12 + broken * 0.88, broad);

  float streaks = noise(vec2(entry.x * 9.0, 2.0 + sin(u_time * 0.03) * 0.4));
  float fine = smoothstep(0.63, 0.94, streaks) * 0.12;
  float reach = mix(0.53, 0.67, noise(vec2(entry.x * 1.7, 8.0)));
  float depthFade = (1.0 - smoothstep(0.17, reach, p.y)) * exp(-p.y * 1.1);
  // The light enters from beyond the viewport: start at full strength on the
  // first row, then fade only with depth. No visible gap or rounded ray tips.
  float sourceGlow = exp(-pow((entryX - u_emitterX) / 0.25, 2.0));
  float veil = 0.82 + 0.18 * noise(vec2(entry.x * 5.0, p.y * 14.0 + sin(u_time * 0.05)));
  float grain = 0.90 + hash(pixel) * 0.10;
  vec3 light = vec3(0.48, 0.83, 0.70) * (shafts + fine) * sourceGlow
    * depthFade * veil * grain
    * ${f(WATER_LIGHTING_TUNING.rayIntensity)};

  // Add illumination to the opaque water plate, with headroom for the mint
  // highlights. All scene objects keep their original colours and silhouettes.
  vec3 lit = base.rgb + light * (vec3(1.0) - base.rgb);
  return vec4(lit, base.a);
}
`;

export function loadWaterLighting(k: KAPLAYCtx) {
  k.loadShader(WATER_LIGHT_SHADER, null, WATER_LIGHT_FRAG);
}
