import { SUNKEN_CITY_FAR, SUNKEN_CITY_MIDDLE, SUNKEN_CITY_NEAR } from "./sunkenRuinsImage";
import { FAR_CITY_COLOR } from "./sunkenCityAppearance";

// Each plate is original artwork with a different architectural scale, rather
// than shifted copies of one silhouette. Smaller architecture and overlap give
// the city depth; cooler distant stone stays legible instead of dissolving into
// haze. Larger, darker cropped masonry frames the nearer planes.
const PLANES = [
  { image: SUNKEN_CITY_FAR, color: FAR_CITY_COLOR, detail: 0.84,
    scale: 0.94, anchorX: 0.5, burial: 0.025 },
  { image: SUNKEN_CITY_MIDDLE, color: [36, 77, 94], detail: 0.7,
    scale: 0.72, anchorX: 0.76, burial: 0.035 },
  { image: SUNKEN_CITY_NEAR, color: [15, 36, 51], detail: 0.75,
    scale: 1, anchorX: 0.5, burial: 0.065 },
] as const;

// Bake three independent plates once, keeping source alpha intact. Live opacity
// changes never rebuild images or upload GPU textures.
export async function makeSunkenCity(
  width: number,
  height: number,
  sandTopAt: (x: number) => number,
): Promise<{ far: string; middle: string; near: string }> {
  const images = await Promise.all(PLANES.map(async plane => {
    const image = new Image();
    image.src = plane.image;
    await image.decode();
    return image;
  }));
  const plate = document.createElement("canvas");
  plate.width = Math.min(width, 1920);
  plate.height = Math.min(height, 1080);
  const paint = plate.getContext("2d", { willReadFrequently: true })!;
  paint.imageSmoothingEnabled = false;
  const plates = PLANES.map((plane, index) => {
    paint.clearRect(0, 0, plate.width, plate.height);
    const w = plate.width * plane.scale;
    const h = plate.height * plane.scale;
    // Anchor the foundations to the actual dune, not the viewport bottom.
    // Sample in tank coordinates, then map into the capped texture. Keep a
    // small deliberate overlap under the sand so roots never meet edge-to-edge.
    // Each plate moves/scales rigidly: arches and sculptures are not warped to
    // follow the slope. The higher left foreground dune naturally occludes more.
    const base = (sandTopAt(width * plane.anchorX) / height + plane.burial) * plate.height;
    paint.drawImage(images[index], (plate.width - w) / 2, base - h, w, h);
    const pixels = paint.getImageData(0, 0, plate.width, plate.height);
    const data = pixels.data;
    for (let i = 0; i < data.length; i += 4) {
      if (!data[i + 3]) continue;
      // Keep carved faces, reliefs and chipped stone. Depth comes primarily
      // from scale, overlap and palette, without blurring away this modelling.
      // Native alpha preserves every arcade opening.
      const luminance = (data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722) / 255;
      const shade = 1 - plane.detail * (1 - luminance);
      for (let c = 0; c < 3; c++) data[i + c] = Math.round(plane.color[c] * shade);
    }
    paint.putImageData(pixels, 0, 0);
    return plate.toDataURL();
  });
  return { far: plates[0], middle: plates[1], near: plates[2] };
}
