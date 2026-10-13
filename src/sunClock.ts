// Local wall-clock lighting. Shared URL settings take precedence over this device.
const STORAGE_KEY = "realTimeSun";
export let realTimeSun = true;
export let sunTimeOverride: number | null = null;
try {
  if (typeof localStorage !== "undefined")
    realTimeSun = localStorage.getItem(STORAGE_KEY) !== "false";
} catch { /* Use real time when storage is unavailable. */ }
const initialParams = typeof location === "undefined" ? new URLSearchParams() : new URLSearchParams(location.search);
if (initialParams.has("sun")) realTimeSun = initialParams.get("sun") !== "0";
const initialTime = initialParams.get("sun-time");
if (realTimeSun && initialTime && /^\d{2}:\d{2}$/.test(initialTime)) {
  const [hours, minutes] = initialTime.split(":").map(Number);
  if (hours < 24 && minutes < 60) sunTimeOverride = hours * 60 + minutes;
}

export function writeSunSettings(params: URLSearchParams) {
  params.set("sun", realTimeSun ? "1" : "0");
  if (realTimeSun && sunTimeOverride !== null) {
    const hours = String(Math.floor(sunTimeOverride / 60)).padStart(2, "0");
    const minutes = String(Math.floor(sunTimeOverride % 60)).padStart(2, "0");
    params.set("sun-time", `${hours}:${minutes}`);
  } else params.delete("sun-time");
}

export function setRealTimeSun(enabled: boolean) {
  realTimeSun = enabled;
  sunTimeOverride = null;
  cachedSecond = -1;
  try { localStorage.setItem(STORAGE_KEY, String(enabled)); }
  catch { /* The setting still works for this session. */ }
}

export function setSunTimeOverride(minutes: number | null) {
  sunTimeOverride = minutes === null || !Number.isFinite(minutes)
    ? null : Math.max(0, Math.min(1439, minutes));
  cachedSecond = -1;
}

export function sunAtMinutes(minutes: number) {
  const daylight = minutes >= 4 * 60 && minutes < 18 * 60;
  const progress = Math.max(0, Math.min(1, (minutes - 4 * 60) / (14 * 60)));
  return { minutes, daylight, emitterX: -0.12 + progress * 1.24 };
}

let cachedSecond = -1;
let cachedSun = sunAtMinutes(12 * 60);
export function currentSun() {
  // Refresh once per wall-clock second, including after sleep or clock changes.
  const second = Math.floor(Date.now() / 1000);
  if (second !== cachedSecond) {
    const now = new Date(second * 1000);
    cachedSun = sunAtMinutes(sunTimeOverride ??
      (now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60));
    cachedSecond = second;
  }
  return cachedSun;
}
