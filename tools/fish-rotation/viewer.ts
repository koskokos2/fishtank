import kaplay from "kaplay";

type Example = { name: string; scale: number; original: string; filtered: string; pixelAware: string[]; textureWidth: number; textureHeight: number; mipFrames: string[]; mipW: number; mipH: number; mipX: number; mipY: number };
declare global {
  interface Window { rotationExamples: Example[]; rotationReady: boolean;
    rotationProbe: () => { visiblePixels: number[]; levelDifference: number; changedPixels: number; fishPixels: number }; }
}
const examples = window.rotationExamples;
const canvas = document.querySelector<HTMLCanvasElement>("#comparison")!;
const gl = canvas.getContext("webgl", { antialias: false, alpha: false, preserveDrawingBuffer: true })!;
const anisotropy = gl.getExtension("EXT_texture_filter_anisotropic");
const maxAnisotropy = anisotropy ? gl.getParameter(anisotropy.MAX_TEXTURE_MAX_ANISOTROPY_EXT) as number : 0;
const zoom = document.querySelector<HTMLCanvasElement>("#zoom")!;
const zoomContext = zoom.getContext("2d")!;
zoomContext.imageSmoothingEnabled = false;
const capture = document.createElement("canvas");
capture.width = 1680; capture.height = 180;
const captureContext = capture.getContext("2d")!;
const k = kaplay({ canvas, width: 1680, height: 180, global: false, crisp: true,
  pixelDensity: 1, texFilter: "nearest", background: [7, 26, 43], debug: false,
  maxFPS: 62, loadingScreen: false });
const fishSelect = document.querySelector<HTMLSelectElement>("#fish")!;
const angleInput = document.querySelector<HTMLInputElement>("#angle")!;
const playButton = document.querySelector<HTMLButtonElement>("#play")!;
const status = document.querySelector<HTMLOutputElement>("#status")!;
const frameInput = document.querySelector<HTMLInputElement>("#frame")!;
const filterSelect = document.querySelector<HTMLSelectElement>("#filter-type")!;
const sizeInput = document.querySelector<HTMLInputElement>("#fish-size")!;
if (!anisotropy) {
  const option = filterSelect.querySelector<HTMLOptionElement>('option[value="anisotropic"]')!;
  option.disabled = true;
  option.textContent = "Anisotropic · unavailable on this device";
}
const filterNames: Record<string, string> = {
  nearest: "Nearest", bilinear: "Bilinear", trilinear: "Trilinear",
  anisotropic: `Anisotropic ${maxAnisotropy}×`, catmull: "Bicubic Catmull–Rom",
  mitchell: "Bicubic Mitchell", bspline: "Bicubic B-spline", blend: "Adjustable blend",
};
const filterDescriptions: Record<string, string> = {
  nearest: "Hardware · sharp source pixels",
  bilinear: "Hardware · four-neighbor interpolation",
  trilinear: "Hardware · bilinear + mipmap blending",
  anisotropic: "Hardware extension · directional filtering + mipmaps",
  catmull: "Custom shader · sharper cubic interpolation",
  mitchell: "Custom shader · balanced cubic filtering",
  bspline: "Custom shader · softer cubic filtering",
  blend: "Custom shader · blend nearest and bilinear",
};
const filterInput = document.querySelector<HTMLInputElement>("#filter-strength")!;
const cubicInput = document.querySelector<HTMLInputElement>("#cubic-sharpness")!;
const haloInput = document.querySelector<HTMLInputElement>("#limit-halos")!;
const cubicReset = document.querySelector<HTMLButtonElement>("#cubic-reset")!;
const edgeInput = document.querySelector<HTMLInputElement>("#edge-strength")!;
const experimentSelect = document.querySelector<HTMLSelectElement>("#experiment")!;
const inspectSelect = document.querySelector<HTMLSelectElement>("#inspect-method")!;
const inspectButton = document.querySelector<HTMLButtonElement>("#inspect-toggle")!;
const inspectCanvas = document.querySelector<HTMLCanvasElement>("#inspection")!;
const inspectContext = inspectCanvas.getContext("2d")!;
inspectContext.imageSmoothingEnabled = false;
let inspectCurrent = false;
function experimentName() { return experimentSelect.value === "edge" ? "Edge-only smoothing" : "RotSprite-style"; }
function middleName() {
  return filterSelect.value === "catmull" && Number(cubicInput.value) !== 0.5
    ? `Cubic C=${Number(cubicInput.value).toFixed(2)}` : filterNames[filterSelect.value];
}
function inspectionName() { return inspectSelect.value === "1" ? middleName() : experimentName(); }
function updateLabels() {
  const cubicMode = ["catmull", "mitchell", "bspline"].includes(filterSelect.value);
  document.querySelector<HTMLElement>("#cubic-tuning")!.hidden = !cubicMode;
  cubicInput.disabled = filterSelect.value !== "catmull";
  document.querySelector("#cubic-value")!.textContent = Number(cubicInput.value).toFixed(2);
  filterInput.disabled = filterSelect.value !== "blend";
  document.querySelector("#filter-heading")!.textContent = middleName();
  document.querySelector("#filter-description")!.textContent = filterDescriptions[filterSelect.value];
  document.querySelector("#size-value")!.textContent = `${sizeInput.value}%`;
  document.querySelector("#filter-info")!.textContent = filterDescriptions[filterSelect.value] +
    (cubicMode
      ? `. 16 texture lookups per pixel. Halo limiter ${haloInput.checked ? "on" : "off"}. C=0.50 is standard Catmull–Rom; 0.25 is gentler, 0.75 sharper. Higher C can add halos.`
      : ["trilinear", "anisotropic"].includes(filterSelect.value)
      ? ". Reduce Fish size to reveal mipmap differences. Anisotropic may look like trilinear on flat sprites."
      : ". Filter amount adjusts only the Adjustable blend option.");
  document.querySelector("#filter-value")!.textContent = `${filterInput.value}%`;
  document.querySelector("#edge-value")!.textContent = `${edgeInput.value}%`;
  edgeInput.disabled = experimentSelect.value !== "edge";
  document.querySelector("#experiment-heading")!.textContent = experimentName();
  document.querySelector("#experiment-description")!.textContent = experimentSelect.value === "edge"
    ? "Smooth transparent boundaries · retain opaque detail" : "8× Scale2x enlargement · nearest rotation";
  inspectButton.textContent = inspectCurrent ? `Show ${inspectionName()}` : "Show Current";
  inspectButton.setAttribute("aria-pressed", String(inspectCurrent));
  document.querySelector("#inspection-label")!.textContent = `Showing: ${inspectCurrent ? "Current" : inspectionName()}`;
}
filterInput.oninput = edgeInput.oninput = sizeInput.oninput = updateLabels;
filterSelect.onchange = updateLabels;
cubicInput.oninput = haloInput.onchange = updateLabels;
cubicReset.onclick = () => {
  filterSelect.value = "catmull"; cubicInput.value = "0.5"; haloInput.checked = false;
  updateLabels();
};
experimentSelect.onchange = inspectSelect.onchange = updateLabels;
inspectButton.onclick = () => { inspectCurrent = !inspectCurrent; updateLabels(); };
updateLabels();
// Interpolate premultiplied RGBA to avoid dark fringes. Edge-only mode applies
// the blend only where the four texels include transparency; opaque areas
// retain nearest sampling. It also smooths transparent holes, not just the outline.
k.loadShader("controlled-filter", null, `
  uniform vec2 textureSize;
  uniform float strength;
  uniform float edgeOnly;
  vec4 frag(vec2 pos, vec2 uv, vec4 color, sampler2D tex) {
    vec2 cell = uv * textureSize - 0.5;
    vec2 base = floor(cell);
    vec2 fraction = fract(cell);
    vec4 a = texture2D(tex, (base + vec2(0.5, 0.5)) / textureSize);
    vec4 b = texture2D(tex, (base + vec2(1.5, 0.5)) / textureSize);
    vec4 c = texture2D(tex, (base + vec2(0.5, 1.5)) / textureSize);
    vec4 d = texture2D(tex, (base + vec2(1.5, 1.5)) / textureSize);
    vec4 softened = mix(mix(a, b, fraction.x), mix(c, d, fraction.x), fraction.y);
    vec4 sharp = texture2D(tex, (floor(uv * textureSize) + 0.5) / textureSize);
    float boundary = 1.0 - step(0.999, min(min(a.a, b.a), min(c.a, d.a)));
    vec4 result = mix(sharp, softened, strength * mix(1.0, boundary, edgeOnly));
    return vec4(result.rgb * color.rgb, result.a) * color.a;
  }
`);
// Separable Mitchell–Netravali cubic family, 4×4 texel support. KAPLAY
// textures are premultiplied; clamp overshoot to valid premultiplied RGBA.
k.loadShader("bicubic", null, `
  uniform vec2 textureSize;
  uniform float cubicB;
  uniform float cubicC;
  uniform float limitHalos;
  float weight(float x) {
    x = abs(x);
    float b = cubicB, c = cubicC;
    if (x < 1.0) return ((12.0-9.0*b-6.0*c)*x*x*x + (-18.0+12.0*b+6.0*c)*x*x + 6.0-2.0*b) / 6.0;
    if (x < 2.0) return ((-b-6.0*c)*x*x*x + (6.0*b+30.0*c)*x*x + (-12.0*b-48.0*c)*x + 8.0*b+24.0*c) / 6.0;
    return 0.0;
  }
  vec4 frag(vec2 pos, vec2 uv, vec4 color, sampler2D tex) {
    vec2 point = uv * textureSize - 0.5;
    vec2 origin = floor(point);
    vec2 fraction = fract(point);
    vec4 result = vec4(0.0);
    vec4 localMin = vec4(1.0), localMax = vec4(0.0);
    for (int y = -1; y <= 2; y++) {
      for (int x = -1; x <= 2; x++) {
        vec2 offset = vec2(float(x), float(y));
        vec4 sampleColor = texture2D(tex, (origin + offset + 0.5) / textureSize);
        result += sampleColor * weight(offset.x - fraction.x) * weight(offset.y - fraction.y);
        // Reuse the central 2×2 samples: halo limiting adds no texture fetches.
        if (x >= 0 && x <= 1 && y >= 0 && y <= 1) {
          localMin = min(localMin, sampleColor);
          localMax = max(localMax, sampleColor);
        }
      }
    }
    result = mix(result, clamp(result, localMin, localMax), limitHalos);
    result.a = clamp(result.a, 0.0, 1.0);
    result.rgb = clamp(result.rgb, vec3(0.0), vec3(result.a));
    return vec4(result.rgb * color.rgb, result.a) * color.a;
  }
`);
let playing = false, started = 0;
for (const example of examples) {
  fishSelect.add(new Option(example.name.replaceAll("_", " "), example.name));
  k.loadSprite(`${example.name}-nearest`, example.original, { sliceX: 4 });
  // Isolate filtered textures from the game's nearest-filtered packed atlas.
  k.loadSprite(`${example.name}-linear`, example.filtered, { sliceX: 4, singular: true }).onLoad(data => {
    const tex = data.tex, gl = tex.ctx.gl;
    tex.bind();
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    tex.unbind();
  });
  for (const mode of ["trilinear", ...(anisotropy ? ["anisotropic"] : [])]) {
    example.mipFrames.forEach((image, frame) => {
      k.loadSprite(`${example.name}-${mode}-${frame}`, image, { singular: true }).onLoad(data => {
        const tex = data.tex;
        tex.bind();
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        if (mode === "anisotropic" && anisotropy) gl.texParameterf(gl.TEXTURE_2D, anisotropy.TEXTURE_MAX_ANISOTROPY_EXT, maxAnisotropy);
        // Expose actual sampler setup for validation without inspecting engine state.
        document.querySelector<HTMLElement>("#filter-info")!.dataset[mode] = JSON.stringify({
          min: gl.getTexParameter(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER),
          mag: gl.getTexParameter(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER),
          anisotropy: mode === "anisotropic" && anisotropy ? gl.getTexParameter(gl.TEXTURE_2D, anisotropy.TEXTURE_MAX_ANISOTROPY_EXT) : 1,
        });
        tex.unbind();
      });
    });
  }
  example.pixelAware.forEach((image, frame) => {
    k.loadSprite(`${example.name}-pixel-${frame}`, image, { singular: true });
  });
}
window.rotationProbe = () => {
  captureContext.drawImage(canvas, 0, 0);
  const pixels = [0, 1, 2].map(col => captureContext.getImageData(col * 560 + 190, 0, 180, 180).data);
  let changedPixels = 0, fishPixels = 0;
  for (let i = 0; i < pixels[0].length; i += 4) {
    const a = pixels[0], b = pixels[Number(inspectSelect.value)];
    if ([0, 1, 2].some(c => a[i + c] !== [7, 26, 43][c] || b[i + c] !== [7, 26, 43][c])) fishPixels++;
    if ([0, 1, 2, 3].some(c => a[i + c] !== b[i + c])) changedPixels++;
  }
  return { changedPixels, fishPixels, visiblePixels: pixels.map(data => {
    let n = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i] !== 7 || data[i + 1] !== 26 || data[i + 2] !== 43) n++;
    return n;
  }), levelDifference: pixels[0].reduce((n, value, i) => n + Math.abs(value - pixels[1][i]), 0) };
};
let lastDifferenceCheck = 0;
function copyZoom() {
  zoomContext.fillStyle = "#071a2b";
  zoomContext.fillRect(0, 0, zoom.width, zoom.height);
  for (let col = 0; col < 3; col++) {
    zoomContext.drawImage(canvas, col * 560 + 190, 0, 180, 180, col * 560 + 10, 0, 540, 540);
  }
  const inspected = inspectCurrent ? 0 : Number(inspectSelect.value);
  inspectContext.drawImage(canvas, inspected * 560 + 190, 0, 180, 180, 0, 0, 540, 540);
  if (performance.now() - lastDifferenceCheck > 250) {
    lastDifferenceCheck = performance.now();
    const { changedPixels, fishPixels, levelDifference, visiblePixels } = window.rotationProbe();
    document.querySelector<HTMLElement>("#difference")!.dataset.filterDifference = String(levelDifference);
    document.querySelector<HTMLElement>("#difference")!.dataset.visiblePixels = JSON.stringify(visiblePixels);
    document.querySelector("#inspection-scale")!.textContent = `${(inspectCanvas.getBoundingClientRect().width / 180).toFixed(1)}× displayed enlargement · no smoothing in this zoom`;
    document.querySelector("#difference")!.textContent = `Current vs ${inspectionName()}: ${changedPixels} of ${fishPixels} fish pixels differ (${fishPixels ? (100 * changedPixels / fishPixels).toFixed(1) : 0}%). This measures change, not visual improvement.`;
  }
}
playButton.onclick = () => {
  playing = !playing;
  started = performance.now();
  playButton.textContent = playing ? "Pause motion" : "Animate motion";
};
angleInput.oninput = () => { playing = false; playButton.textContent = "Animate motion"; };
k.onLoad(() => { window.rotationReady = true; });
k.onDraw(() => {
  if (!window.rotationReady) return;
  const example = examples.find(e => e.name === fishSelect.value)!;
  const t = (performance.now() - started) / 1000;
  const requested = playing ? Math.sin(t * 0.8) * 21 : Number(angleInput.value);
  const angle = Math.round(requested / 7) * 7;
  const frame = playing ? Math.floor(t * 3) % 4 : Number(frameInput.value);
  const driftX = playing ? Math.round(Math.sin(t * 0.7) * 6) : 0;
  const driftY = playing ? Math.round(Math.sin(t * 0.8) * 9) : 0;
  status.textContent = `All: ${angle}° · frame ${frame + 1}/4 · same 7° angle steps`;
  for (let method = 0; method < 3; method++) {
    const mode = filterSelect.value;
    const high = method === 2 && experimentSelect.value === "rot" && angle !== 0;
    const controlled = (method === 1 && mode === "blend") || (method === 2 && experimentSelect.value === "edge");
    const strength = Number(method === 1 ? filterInput.value : edgeInput.value) / 100;
    const customBlend = controlled && strength > 0;
    const cubic = method === 1 && ["catmull", "mitchell", "bspline"].includes(mode);
    const mip = method === 1 && ["trilinear", "anisotropic"].includes(mode);
    const linear = customBlend || cubic || (method === 1 && mode === "bilinear");
    const sprite = high ? `${example.name}-pixel-${frame}`
      : mip ? `${example.name}-${mode}-${frame}`
      : linear ? `${example.name}-linear` : `${example.name}-nearest`;
    k.drawSprite({ sprite, frame: high || mip ? 0 : frame,
      pos: k.vec2(method * 560 + 280 + driftX, 90 + driftY), anchor: "center",
      scale: example.scale * Number(sizeInput.value) / 100 / (high ? 8 : 1), angle, fixed: true,
      ...(mip ? { quad: k.quad(example.mipX / example.mipW, example.mipY / example.mipH,
        example.textureWidth / 4 / example.mipW, example.textureHeight / example.mipH) } : {}),
      ...(customBlend ? { shader: "controlled-filter", uniform: {
        textureSize: k.vec2(example.textureWidth, example.textureHeight),
        strength, edgeOnly: method === 2 ? 1 : 0,
      }} : {}),
      ...(cubic ? { shader: "bicubic", uniform: {
        textureSize: k.vec2(example.textureWidth, example.textureHeight),
        cubicB: mode === "catmull" ? 0 : mode === "mitchell" ? 1 / 3 : 1,
        cubicC: mode === "catmull" ? Number(cubicInput.value) : mode === "mitchell" ? 1 / 3 : 0,
        limitHalos: haloInput.checked ? 1 : 0,
      }} : {}),
    });
  }
  requestAnimationFrame(copyZoom);
});
