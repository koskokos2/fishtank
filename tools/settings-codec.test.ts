import { describe, test, expect } from "bun:test";
import { COUNT_KEYS, SETTING_GATES, defaultSettings, encodeSettings, decodeSettings, legacySettings, settingsFromSearch } from "../src/settingsCodec";

const asHex = (text: string) => Buffer.from(text, "base64url").toString("hex");
const asBase64url = (hex: string) => Buffer.from(hex, "hex").toString("base64url");

describe("settings wire formats v1/v2/v3/v4/v5/v6", () => {
  test("frozen binary vector, Base64url output and legacy hex input", () => {
    const hex = "01000000000c000000020a1410400005044006ff07";
    const historical = defaultSettings();
    historical.counts.jelly = 5;
    expect(encodeSettings(historical)).toBe("AgAAAAAMAAAAAgoUEEAABQRABv8H");
    expect(asHex(encodeSettings(historical))).toBe("02" + hex.slice(2));
    expect(decodeSettings("AQAAAAAMAAAAAgoUEEAABQRABv8H")).toEqual(historical);
    expect(decodeSettings(encodeSettings(defaultSettings()))).toEqual(defaultSettings());
    expect(decodeSettings(hex.toUpperCase())).toEqual(historical);
  });
  test("all flags, counts, resolutions and extension combinations round trip", () => {
    for (const resolution of [1, 2, 3, 6] as const) for (const frameCap of [62, 32, 0, 47.5]) {
      for (const lightTime of [null, 0, 123.456]) for (const sunTime of [null, 0, 1439]) {
        const s = { ...defaultSettings(), resolution, frameCap, lightTime, sunTime,
          disabled: [...SETTING_GATES], birthday: true, gothPlants: true, gothKelp: true,
          crawlingHands: true, smoothTextures: false, realTimeSun: false, paused: true,
          debug: true, fps: true, gpu: true, halloweenBubbles: true };
        COUNT_KEYS.forEach((key, index) => { s.counts[key] = [0, 1, 255, 256, 511, 512, 999][index]; });
        const encoded = encodeSettings(s);
        const byteLength = 21 + (frameCap === 47.5 ? 8 : 0) + (lightTime !== null ? 8 : 0);
        expect(encoded.length).toBe(Math.ceil(byteLength * 8 / 6));
        expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
        expect(decodeSettings(encoded)).toEqual(s);
        expect(decodeSettings(asHex(encoded))).toEqual(s);
      }
    }
  });
  test("v2 uses bit 40 for Halloween bubbles while v1 keeps it reserved", () => {
    const s = { ...defaultSettings(), halloweenBubbles: true };
    const hex = asHex(encodeSettings(s));
    expect(hex.slice(12, 14)).toBe("01");
    expect(decodeSettings(hex)).toEqual(s);
    expect(decodeSettings("01" + hex.slice(2))).toBeNull();
    expect(legacySettings(new URLSearchParams("halloween-bubbles=1")).halloweenBubbles).toBe(true);
  });
  test("each gate has its own permanent bit; input order does not change URLs", () => {
    for (const gate of SETTING_GATES) {
      const s = { ...defaultSettings(), disabled: [gate] };
      expect(decodeSettings(encodeSettings(s))).toEqual(s);
    }
    expect(encodeSettings({ ...defaultSettings(), disabled: [...SETTING_GATES].reverse() }))
      .toBe(encodeSettings({ ...defaultSettings(), disabled: [...SETTING_GATES] }));
  });
  test("v3 hides ruins in bit 41 without changing existing flags or URL length", () => {
    const shown = { ...defaultSettings(), birthday: true, halloweenBubbles: true };
    const hidden = { ...shown, disabled: ["ruins"] as ["ruins"] };
    const before = Buffer.from(encodeSettings(shown), "base64url");
    const encoded = encodeSettings({ ...hidden, disabled: [...hidden.disabled] });
    const after = Buffer.from(encoded, "base64url");
    expect(after.length).toBe(before.length);
    expect(after[0]).toBe(3);
    expect(after[6]).toBe(before[6] | 2);
    const legacy = Buffer.from(after);
    legacy[0] = 2;
    expect(decodeSettings(legacy.toString("base64url"))).toBeNull();
    after[0] = before[0];
    after[6] &= ~2;
    expect(after).toEqual(before);
    expect(decodeSettings(encoded)).toEqual(hidden);
    expect(decodeSettings(encodeSettings(shown))?.disabled).not.toContain("ruins");
  });
  test("retired v6 positions are validated and ignored", () => {
    for (const x of [-100, -38, -3, 440]) for (const y of [-60, 0, 50, 120]) {
      const s = { ...defaultSettings(), disabled: ["ruins"] as ["ruins"], halloweenBubbles: true, lightTime: 12.5, frameCap: 47 };
      const bytes = Buffer.from(encodeSettings(s), "base64url");
      bytes[0] = 6;
      const position = (x + 100) | ((y + 60) << 10);
      for (let bit = 0; bit < 18; bit++) if (position & (1 << bit)) bytes[1 + ((42 + bit) >> 3)] |= 1 << ((42 + bit) & 7);
      expect(decodeSettings(bytes.toString("base64url"))).toEqual(s);
      bytes[8] |= 16;
      expect(decodeSettings(bytes.toString("base64url"))).toBeNull();
    }
  });
  test("retired v5 presets decode without restoring placement controls", () => {
    for (const code of [0, 1, 2]) {
      const bytes = Buffer.from(encodeSettings(defaultSettings()), "base64url");
      bytes[0] = 5;
      bytes[6] = code << 2;
      expect(decodeSettings(bytes.toString("base64url"))).toEqual(defaultSettings());
    }
  });
  test("retired v4 landmark selections decode without restoring object choices", () => {
    for (const oldKind of [0, 1, 2]) {
      const bytes = Buffer.from(encodeSettings(defaultSettings()), "base64url");
      bytes[0] = 4;
      bytes[6] = oldKind << 2;
      expect(decodeSettings(bytes.toString("base64url"))).toEqual(defaultSettings());
    }
  });
  test("rejects malformed, truncated, oversized and unknown-version data", () => {
    const hex = asHex(encodeSettings(defaultSettings()));
    for (const bad of ["", "xyz", hex.slice(1), hex.slice(0, -2), hex + "00", "07" + hex.slice(2), "0".repeat(10000)]) {
      expect(decodeSettings(bad)).toBeNull();
    }
  });
  test("rejects reserved bits, invalid counts/times and invalid float extensions", () => {
    function changed(byte: number, value: number, hex = asHex(encodeSettings(defaultSettings()))) {
      return hex.slice(0, byte * 2) + value.toString(16).padStart(2, "0") + hex.slice(byte * 2 + 2);
    }
    for (const bad of [changed(6, 2), changed(9, 128), changed(18, 192), changed(19, 255, changed(20, 255)), changed(10, 255, changed(11, 255))]) {
      expect(decodeSettings(bad)).toBeNull();
      expect(decodeSettings(asBase64url(bad))).toBeNull();
    }
    const custom = asHex(encodeSettings({ ...defaultSettings(), frameCap: 47 }));
    for (const value of [NaN, Infinity, -1]) {
      const bytes = new Uint8Array(8);
      new DataView(bytes.buffer).setFloat64(0, value, true);
      const bad = custom.slice(0, 42) + Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
      expect(decodeSettings(bad)).toBeNull();
      expect(decodeSettings(asBase64url(bad))).toBeNull();
    }
    expect(() => encodeSettings({ ...defaultSettings(), sunTime: 1440 })).toThrow();
  });
  test("rejects malformed Base64url and noncanonical trailing bits", () => {
    const encoded = encodeSettings(defaultSettings());
    const unknownVersion = asBase64url("07" + asHex(encoded).slice(2));
    for (const bad of [encoded + "=", encoded.slice(1), "+" + encoded.slice(1),
      "/" + encoded.slice(1), " " + encoded.slice(1), unknownVersion, "A".repeat(10000)]) {
      expect(decodeSettings(bad)).toBeNull();
    }
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    for (const s of [{ ...defaultSettings(), lightTime: 0 },
      { ...defaultSettings(), lightTime: 0, frameCap: 47 }]) {
      const text = encodeSettings(s);
      const last = alphabet.indexOf(text.at(-1)!);
      const noncanonical = text.slice(0, -1) + alphabet[last | 1];
      expect(Buffer.from(noncanonical, "base64url")).toEqual(Buffer.from(text, "base64url"));
      expect(decodeSettings(noncanonical)).toBeNull();
    }
  });
  test("migrates legacy controls, aliases and custom tooling values", () => {
    const s = legacySettings(new URLSearchParams("off=water-light,fish-witches,obj-giger&res=2&cap=48&fish=0&plants=999&goth-plants=1&goth-kelp=1&crawling-hands=1&birthday=1&debug&fps&gpu&pause&sun=1&sun-time=23:59&light-time=0&texture-filter=pixelated"));
    expect(s.disabled).toEqual(["caustics", "fish-witches", "obj-giger"]);
    expect(s).toMatchObject({ resolution: 2, frameCap: 48, counts: { fish: 0, plants: 999 },
      gothPlants: true, gothKelp: true, crawlingHands: true, birthday: true, debug: true,
      fps: true, gpu: true, paused: true, realTimeSun: true, sunTime: 1439, lightTime: 0, smoothTextures: false });
    expect(decodeSettings(encodeSettings(s))).toEqual(s);
    const all = legacySettings(new URLSearchParams("off=all"));
    expect(all.disabled).toEqual([...SETTING_GATES]);
    expect(all.realTimeSun).toBe(false);
  });
  test("encoded values override legacy fields, even when invalid, and sun defaults on", () => {
    const s = defaultSettings();
    expect(settingsFromSearch(`?settings=${encodeSettings(s)}&sun=0&fish=999`)).toEqual(s);
    expect(settingsFromSearch("?settings=bad&sun=0&fish=999")).toEqual(s);
    expect(settingsFromSearch("").realTimeSun).toBe(true);
    expect(settingsFromSearch("?sun=0").realTimeSun).toBe(false);
    expect(settingsFromSearch("?sun=1").realTimeSun).toBe(true);
  });
  test("legacy invalid numbers safely normalize", () => {
    const s = legacySettings(new URLSearchParams("fish=Infinity&plants=10000&jelly=-4&cap=NaN&res=9&sun-time=99:99&light-time=bad"));
    expect(s.counts).toEqual({ ...defaultSettings().counts, plants: 999 });
    expect(s.frameCap).toBe(62);
    expect(s.resolution).toBe(3);
    expect(s.sunTime).toBeNull();
    expect(s.lightTime).toBeNull();
  });
});

test("population limits preserve old URLs while capping creatures at 99 and plants at 999", () => {
  const old = defaultSettings();
  for (const key of COUNT_KEYS) old.counts[key] = 999;
  old.gothKelp = true;
  old.sunTime = 720;
  const expected = { ...old, counts: { fish: 99, jelly: 99, octo: 99, naut: 99, crabs: 99, snail: 99, plants: 999 } };
  expect(settingsFromSearch(`?settings=${encodeSettings(old)}`)).toEqual(expected);
  expect(settingsFromSearch(`?settings=${asHex(encodeSettings(old))}`)).toEqual(expected);
  expect(settingsFromSearch("?" + COUNT_KEYS.map(key => `${key}=1000`).join("&")).counts).toEqual(expected.counts);
  expect(settingsFromSearch("?fish=0&plants=0").counts).toMatchObject({ fish: 0, plants: 0 });
});
