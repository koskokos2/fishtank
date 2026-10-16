import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { chooseOctopusSkins, HALLOWEEN_OCTOPUS_ATLASES } from "../src/octopusSkins";
import { OCTOPUS_ATLAS, OCTOPUS_POSE, OCTOPUS_FRAMES, OCTOPUS_COLS, OCTOPUS_ROWS } from "../src/octopusAtlas";
import { decodePng } from "./png";

const names = HALLOWEEN_OCTOPUS_ATLASES.map(s => s.sprite).sort();
test("random bags use all skins before repeats and keep larger populations balanced", () => {
  for (let seed = 0; seed < 30; seed++) {
    let state = seed;
    const random = () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 2 ** 32);
    for (let count = 0; count <= 30; count++) {
      const skins = chooseOctopusSkins(count, random);
      expect(skins).toHaveLength(count);
      for (let i = 0; i < count; i += 3) {
        const bag = skins.slice(i, i + 3);
        expect(new Set(bag).size).toBe(bag.length);
        if (bag.length === 3) expect([...bag].sort()).toEqual(names);
      }
      for (let i = 1; i < count; i++) expect(skins[i]).not.toBe(skins[i - 1]);
      const totals = names.map(name => skins.filter(s => s === name).length);
      expect(Math.max(...totals) - Math.min(...totals)).toBeLessThanOrEqual(1);
    }
  }
  expect(chooseOctopusSkins(3, () => 0)).not.toEqual(chooseOctopusSkins(3, () => 0.99));
});

const atlases = [
  { id: "ordinary", stem: "octopus-v2", src: OCTOPUS_ATLAS },
  ...HALLOWEEN_OCTOPUS_ATLASES.map(skin => ({ ...skin, stem: `halloween-octopus-${skin.id}` })),
];
for (const skin of atlases) test(`${skin.id} preserves the octopus frame contract and transparent padding`, () => {
  const bytes = readFileSync(`art/${skin.stem}.png`);
  expect(skin.src).toBe(`data:image/png;base64,${bytes.toString("base64")}`);
  const { w, h, rgba } = decodePng(bytes);
  const W = w / OCTOPUS_COLS, H = h / OCTOPUS_ROWS;
  expect(Number.isInteger(W) && Number.isInteger(H)).toBe(true);
  expect(w).toBeLessThanOrEqual(2048);
  const metadata = JSON.parse(readFileSync(`art/${skin.stem}.json`, "utf8"));
  expect([W, H]).toEqual([metadata.frameWidth, metadata.frameHeight]);
  const original = decodePng(readFileSync("art/octopus-legacy-packed.png"));
  const averageArea = (image: ReturnType<typeof decodePng>, fw: number, fh: number) =>
    [0, ...Object.values(OCTOPUS_POSE)].reduce((sum, frame) => {
      for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++)
        sum += image.rgba[((Math.floor(frame / OCTOPUS_COLS) * fh + y) * image.w + frame % OCTOPUS_COLS * fw + x) * 4 + 3] / 255;
      return sum;
    }, 0) / 12;
  const areaRatio = averageArea({w, h, rgba}, W, H) / averageArea(original, original.w / OCTOPUS_COLS, original.h / OCTOPUS_ROWS);
  expect(areaRatio).toBeGreaterThan(0.98);
  expect(areaRatio).toBeLessThan(1.02);
  const hashes = new Set<string>();
  for (let frame = 0; frame < OCTOPUS_COLS * OCTOPUS_ROWS; frame++) {
    const pixels: number[] = [];
    let visible = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const index = ((Math.floor(frame / OCTOPUS_COLS) * H + y) * w + frame % OCTOPUS_COLS * W + x) * 4;
      const alpha = rgba[index + 3];
      if (alpha) visible++;
      if (x < 2 || x >= W - 2 || y < 2 || y >= H - 2) expect(alpha).toBe(0);
      pixels.push(...rgba.subarray(index, index + 4));
    }
    if (frame < OCTOPUS_FRAMES) {
      expect(visible).toBeGreaterThan(500);
      hashes.add(Bun.hash(new Uint8Array(pixels)).toString());
    } else expect(visible).toBe(0);
  }
  expect(hashes.size).toBe(OCTOPUS_FRAMES);
});
