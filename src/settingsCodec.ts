// Wire formats v1/v2. These lists define permanent bit positions, independent of UI
// order. Never reorder/reuse entries: incompatible changes need a new version.
export const SETTING_GATES = [
  "backdrop", "sand", "props", "plants", "caustics", "motes", "bubbles", "puffs",
  "fish", "cephs", "crabs", "kelp",
  "fish-main", "fish-extra", "fish-bonus", "fish-alien", "fish-pop-culture",
  "fish-odyssey", "fish-giger", "fish-halloween", "fish-witches",
  "obj-sci-fi", "obj-eldritch", "obj-star-wars", "obj-pop-culture", "obj-odyssey",
  "obj-giger", "obj-halloween", "obj-grindelwald", "obj-small",
] as const;
export type SettingGate = typeof SETTING_GATES[number];
export const COUNT_KEYS = ["fish", "jelly", "octo", "naut", "crabs", "snail", "plants"] as const;
export type CountKey = typeof COUNT_KEYS[number];
export const DEFAULT_ENTITY_COUNTS = { fish: 10, jelly: 5, octo: 1, naut: 1, crabs: 5, snail: 1, plants: 100 } as const;
const FLAGS = ["birthday", "gothPlants", "gothKelp", "crawlingHands", "smoothTextures",
  "realTimeSun", "paused", "debug", "fps", "gpu", "halloweenBubbles"] as const;
const RESOLUTIONS = [1, 2, 3, 6] as const;
const CAPS = [62, 32, 0] as const; // 0 = uncapped; code 3 = float64 extension
export type TankSettings = Record<typeof FLAGS[number], boolean> & {
  disabled: SettingGate[];
  counts: Record<CountKey, number>;
  resolution: typeof RESOLUTIONS[number];
  frameCap: number;
  sunTime: number | null;
  lightTime: number | null;
};
export function defaultSettings(): TankSettings {
  return { disabled: [], counts: { ...DEFAULT_ENTITY_COUNTS }, resolution: 3, frameCap: 62,
    birthday: false, gothPlants: false, gothKelp: false, crawlingHands: false,
    smoothTextures: true, realTimeSun: true, paused: false, debug: false, fps: false,
    gpu: false, halloweenBubbles: false, sunTime: null, lightTime: null };
}
function valid(s: TankSettings) {
  return RESOLUTIONS.includes(s.resolution) && Number.isFinite(s.frameCap) && s.frameCap >= 0
    && (s.sunTime === null || (Number.isInteger(s.sunTime) && s.sunTime >= 0 && s.sunTime < 1440))
    && (s.lightTime === null || (Number.isFinite(s.lightTime) && s.lightTime >= 0))
    && COUNT_KEYS.every(key => Number.isInteger(s.counts[key]) && s.counts[key] >= 0 && s.counts[key] <= 999)
    && FLAGS.every(key => typeof s[key] === "boolean")
    && s.disabled.every(gate => SETTING_GATES.includes(gate));
}
export function encodeSettings(s: TankSettings): string {
  if (!valid(s)) throw new Error("Invalid tank settings");
  const preset = CAPS.indexOf(s.frameCap as typeof CAPS[number]);
  const customCap = preset < 0;
  const bytes = new Uint8Array(21 + (customCap ? 8 : 0) + (s.lightTime !== null ? 8 : 0));
  const view = new DataView(bytes.buffer);
  bytes[0] = 2;
  const setBit = (bit: number) => { bytes[1 + (bit >> 3)] |= 1 << (bit & 7); };
  SETTING_GATES.forEach((gate, bit) => { if (s.disabled.includes(gate)) setBit(bit); });
  FLAGS.forEach((key, bit) => { if (s[key]) setBit(30 + bit); });
  // Bytes 1..8: 64 flag bits (41 used). Byte 9: res/cap codes, light-time flag.
  bytes[9] = RESOLUTIONS.indexOf(s.resolution) | ((customCap ? 3 : preset) << 2)
    | (s.lightTime !== null ? 16 : 0);
  // Bytes 10..18: seven 10-bit unsigned counts, least significant bit first.
  COUNT_KEYS.forEach((key, index) => {
    for (let bit = 0; bit < 10; bit++) if (s.counts[key] & (1 << bit)) {
      const offset = index * 10 + bit;
      bytes[10 + (offset >> 3)] |= 1 << (offset & 7);
    }
  });
  view.setUint16(19, s.sunTime ?? 2047, true);
  let offset = 21;
  if (customCap) { view.setFloat64(offset, s.frameCap, true); offset += 8; }
  if (s.lightTime !== null) view.setFloat64(offset, s.lightTime, true);
  return base64url(bytes);
}
function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function decodeText(text: string): Uint8Array | null {
  // V1 hex and Base64url lengths do not overlap, so old links are unambiguous.
  // Bound allocation before decoding either transport representation.
  if ([42, 58, 74].includes(text.length) && /^[0-9a-f]+$/i.test(text)) {
    return Uint8Array.from(text.match(/../g)!, pair => parseInt(pair, 16));
  }
  if (![28, 39, 50].includes(text.length) || !/^[A-Za-z0-9_-]+$/.test(text)) return null;
  try {
    const padded = text.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - text.length % 4) % 4);
    const bytes = Uint8Array.from(atob(padded), char => char.charCodeAt(0));
    // Reject nonzero unused bits in the final character, not just bad symbols.
    return base64url(bytes) === text ? bytes : null;
  } catch { return null; }
}
export function decodeSettings(text: string): TankSettings | null {
  const bytes = decodeText(text);
  if (!bytes) return null;
  const view = new DataView(bytes.buffer);
  if ((bytes[0] !== 1 && bytes[0] !== 2)
    || (bytes[6] & (bytes[0] === 1 ? 255 : 254)) || bytes.slice(7, 9).some(byte => byte !== 0)
    || (bytes[9] & 224) || (bytes[18] & 192)) return null;
  const capCode = (bytes[9] >> 2) & 3;
  const hasLightTime = Boolean(bytes[9] & 16);
  if (bytes.length !== 21 + (capCode === 3 ? 8 : 0) + (hasLightTime ? 8 : 0)) return null;
  const bit = (index: number) => Boolean(bytes[1 + (index >> 3)] & (1 << (index & 7)));
  const s = defaultSettings();
  s.disabled = SETTING_GATES.filter((_, index) => bit(index));
  FLAGS.forEach((key, index) => { s[key] = bit(30 + index); });
  s.resolution = RESOLUTIONS[bytes[9] & 3];
  s.frameCap = capCode === 3 ? view.getFloat64(21, true) : CAPS[capCode];
  COUNT_KEYS.forEach((key, index) => {
    let value = 0;
    for (let bit = 0; bit < 10; bit++) {
      const offset = index * 10 + bit;
      if (bytes[10 + (offset >> 3)] & (1 << (offset & 7))) value |= 1 << bit;
    }
    s.counts[key] = value;
  });
  const minutes = view.getUint16(19, true);
  s.sunTime = minutes === 2047 ? null : minutes;
  s.lightTime = hasLightTime ? view.getFloat64(capCode === 3 ? 29 : 21, true) : null;
  return valid(s) ? s : null;
}

// Read-only compatibility boundary for old links and desktop launch options.
export function legacySettings(p: URLSearchParams): TankSettings {
  const s = defaultSettings();
  const disabled = new Set((p.get("off") ?? "").split(","));
  if (disabled.has("water-light")) disabled.add("caustics");
  s.disabled = SETTING_GATES.filter(gate => disabled.has("all") || disabled.has(gate));
  for (const key of COUNT_KEYS) if (p.has(key)) {
    const value = Number(p.get(key));
    if (Number.isFinite(value) && value >= 0) s.counts[key] = Math.min(999, Math.floor(value));
  }
  const res = Number(p.get("res"));
  if (RESOLUTIONS.includes(res as TankSettings["resolution"])) s.resolution = res as TankSettings["resolution"];
  const cap = Number(p.get("cap"));
  s.frameCap = p.has("uncap") ? 0 : Number.isFinite(cap) && cap > 0 ? cap : 62;
  s.birthday = p.get("birthday") === "1";
  s.gothPlants = p.get("goth-plants") === "1";
  s.gothKelp = p.get("goth-kelp") === "1";
  s.crawlingHands = p.get("crawling-hands") === "1";
  s.halloweenBubbles = p.get("halloween-bubbles") === "1";
  s.smoothTextures = p.get("texture-filter") !== "pixelated";
  s.realTimeSun = disabled.has("all") ? false : p.has("sun") ? p.get("sun") !== "0" : s.realTimeSun;
  for (const key of ["debug", "fps", "gpu"] as const) s[key] = p.has(key);
  s.paused = p.has("pause");
  const time = p.get("sun-time") ?? "";
  if (s.realTimeSun && /^\d{2}:\d{2}$/.test(time)) {
    const [hours, minutes] = time.split(":").map(Number);
    if (hours < 24 && minutes < 60) s.sunTime = hours * 60 + minutes;
  }
  if (p.has("light-time") && p.get("light-time")!.trim() !== "") {
    const time = Number(p.get("light-time"));
    if (Number.isFinite(time) && time >= 0) s.lightTime = time;
  }
  return s;
}
export function settingsFromSearch(search: string): TankSettings {
  const p = new URLSearchParams(search);
  // An encoded link is authoritative, even if malformed. Never merge legacy
  // fields or device preferences into a shared snapshot.
  return p.has("settings") ? decodeSettings(p.get("settings")!) ?? defaultSettings()
    : legacySettings(p);
}
