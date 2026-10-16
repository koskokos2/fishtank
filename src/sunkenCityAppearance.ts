import type { KAPLAYCtx } from "kaplay";
import { WATER_BOTTOM, WATER_STOPS } from "./backdropAppearance";

// Selected city appearance, fixed independently of the URL settings.
export const CITY_APPEARANCE = { distantOpacity: 30, middleDistance: 40, foregroundDistance: 15 } as const;
export const FAR_CITY_COLOR = [55, 100, 128] as const;
export const CITY_DISTANCE_SHADER = "city-distance";

const rgb = (color: readonly number[]) => `vec3(${color.slice(0, 3).map(c => (c / 255).toFixed(8)).join(", ")})`;

export function loadCityDistanceShader(k: KAPLAYCtx) {
  k.loadShader(CITY_DISTANCE_SHADER, null, `
    uniform float u_distance;
    uniform float u_daylight;
    uniform float u_waterVisible;
    vec3 waterAt(float y) {
      float stop = pow(clamp(y, 0.0, 1.0), 0.82) * ${WATER_STOPS.length - 1}.0;
      ${WATER_STOPS.slice(0, -1).map((c, i) => `if (stop < ${i + 1}.0) return mix(${rgb(c)}, ${rgb(WATER_STOPS[i + 1])}, stop - ${i}.0);`).join("\n")}
      return ${rgb(WATER_BOTTOM)};
    }
    vec4 frag(vec2 pos, vec2 uv, vec4 color, sampler2D tex) {
      vec4 stone = def_frag();
      // Screen coordinates, not packed-atlas UVs. Match the water's nine-stop
      // depth gradient and time-of-day colour, without sampling other ruins.
      vec3 water = mix(${rgb(WATER_BOTTOM)}, waterAt(0.5 - pos.y * 0.5), u_daylight);
      water = mix(vec3(6.0, 24.0, 43.0) / 255.0, water, u_waterVisible);
      // Reduce contrast against water, preserving alpha and crisp edges.
      // Even at full distance, solid masonry still occludes the city behind it.
      // KAPLAY blends premultiplied RGB: tint only covered pixels, including
      // antialiased edges, so transparent openings never gain a coloured halo.
      return vec4(mix(stone.rgb, water * stone.a, u_distance), stone.a);
    }
  `);
}
