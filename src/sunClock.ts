// Local wall-clock lighting. Only the mode is saved; preview times are temporary.
const STORAGE_KEY = "realTimeSun";
export let realTimeSun = true;
export let sunTimeOverride: number | null = null;
try {
  if (typeof localStorage !== "undefined")
    realTimeSun = localStorage.getItem(STORAGE_KEY) !== "false";
} catch { /* Use real time when storage is unavailable. */ }

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
