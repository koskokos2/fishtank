import { describe, test, expect } from "bun:test";
import { COUNT_KEYS, SETTING_GATES, defaultSettings, encodeSettings, decodeSettings, legacySettings, settingsFromSearch } from "../src/settingsCodec";

const asHex = (text: string) => Buffer.from(text, "base64url").toString("hex");
const asBase64url = (hex: string) => Buffer.from(hex, "hex").toString("base64url");

describe("settings wire format v1", () => {
  test("frozen binary vector, Base64url output and legacy hex input", () => {
    const hex = "01000000000c000000020a1410400005044006ff07";
    expect(encodeSettings(defaultSettings())).toBe("AQAAAAAMAAAAAgoUEEAABQRABv8H");
    expect(asHex(encodeSettings(defaultSettings()))).toBe(hex);
    expect(decodeSettings(encodeSettings(defaultSettings()))).toEqual(defaultSettings());
    expect(decodeSettings(hex.toUpperCase())).toEqual(defaultSettings());
  });
  test("all flags, counts, resolutions and extension combinations round trip", () => {
    for (const resolution of [1, 2, 3, 6] as const) for (const frameCap of [62, 32, 0, 47.5]) {
      for (const lightTime of [null, 0, 123.456]) for (const sunTime of [null, 0, 1439]) {
        const s = { ...defaultSettings(), resolution, frameCap, lightTime, sunTime,
          disabled: [...SETTING_GATES], birthday: true, gothPlants: true, gothKelp: true,
          crawlingHands: true, smoothTextures: false, realTimeSun: false, paused: true,
          debug: true, fps: true, gpu: true };
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
  test("each gate has its own permanent bit; input order does not change URLs", () => {
    for (const gate of SETTING_GATES) {
      const s = { ...defaultSettings(), disabled: [gate] };
      expect(decodeSettings(encodeSettings(s))).toEqual(s);
    }
    expect(encodeSettings({ ...defaultSettings(), disabled: [...SETTING_GATES].reverse() }))
      .toBe(encodeSettings({ ...defaultSettings(), disabled: [...SETTING_GATES] }));
  });
  test("rejects malformed, truncated, oversized and unknown-version data", () => {
    const hex = asHex(encodeSettings(defaultSettings()));
    for (const bad of ["", "xyz", hex.slice(1), hex.slice(0, -2), hex + "00", "02" + hex.slice(2), "0".repeat(10000)]) {
      expect(decodeSettings(bad)).toBeNull();
    }
  });
  test("rejects reserved bits, invalid counts/times and invalid float extensions", () => {
    function changed(byte: number, value: number, hex = asHex(encodeSettings(defaultSettings()))) {
      return hex.slice(0, byte * 2) + value.toString(16).padStart(2, "0") + hex.slice(byte * 2 + 2);
    }
    for (const bad of [changed(6, 1), changed(9, 128), changed(18, 192), changed(19, 255, changed(20, 255)), changed(10, 255, changed(11, 255))]) {
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
    const unknownVersion = asBase64url("02" + asHex(encoded).slice(2));
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
  test("encoded values override legacy fields and device preferences, even when invalid", () => {
    const s = defaultSettings();
    expect(settingsFromSearch(`?settings=${encodeSettings(s)}&sun=0&fish=999`, false)).toEqual(s);
    expect(settingsFromSearch("?settings=bad&sun=0&fish=999", false)).toEqual(s);
    expect(settingsFromSearch("", false).realTimeSun).toBe(false);
    expect(settingsFromSearch("?sun=1", false).realTimeSun).toBe(true);
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
