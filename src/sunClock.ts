// Local wall-clock lighting. The mode is persisted in shared URL settings.
import { settings } from "./settings";
export let realTimeSun = settings.realTimeSun;
export let sunTimeOverride: number | null = settings.sunTime;

export function setRealTimeSun(enabled: boolean) {
  realTimeSun = enabled;
  sunTimeOverride = null;
  cachedSecond = -1;
}

export function setSunTimeOverride(minutes: number | null) {
  sunTimeOverride = minutes === null || !Number.isFinite(minutes)
    ? null : Math.max(0, Math.min(1439, minutes));
  cachedSecond = -1;
}

export function sunAtMinutes(minutes: number) {
  const daylight = minutes >= 4 * 60 && minutes < 18 * 60;
  const progress = Math.max(0, Math.min(1, (minutes - 4 * 60) / (14 * 60)));
  // Dawn-to-noon takes eight hours; noon-to-dusk takes six. Separate halves
  // keep the peak at 12:00 even though the sun's travel midpoint is 11:00.
  const rise = Math.max(0, Math.min(1, minutes <= 12 * 60
    ? (minutes - 4 * 60) / (8 * 60)
    : (18 * 60 - minutes) / (6 * 60)));
  const brightness = rise * rise * (3 - 2 * rise);
  return { minutes, daylight, emitterX: -0.12 + progress * 1.24, brightness };
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
