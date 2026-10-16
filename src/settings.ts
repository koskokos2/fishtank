import { encodeSettings, settingsFromSearch, type TankSettings } from "./settingsCodec";

let preferredSun = true;
try {
  if (typeof localStorage !== "undefined") preferredSun = localStorage.getItem("realTimeSun") !== "false";
} catch { /* Storage is optional. */ }
export let settings = settingsFromSearch(typeof location === "undefined" ? "" : location.search, preferredSun);
export function copySettings(): TankSettings {
  return { ...settings, disabled: [...settings.disabled], counts: { ...settings.counts } };
}
function settingsURL(next: TankSettings) {
  return `${location.pathname}?settings=${encodeSettings(next)}${location.hash}`;
}
export function saveSettings(next: TankSettings, reload = false) {
  const url = settingsURL(next);
  if (reload) { location.assign(url); return; }
  history.replaceState(null, "", url);
  settings = next;
}
// Normalize old links before consumers initialize, without reloading the scene.
// No browser globals are needed when atlas/preview tools import scene modules.
if (typeof location !== "undefined" && typeof history !== "undefined") {
  history.replaceState(null, "", settingsURL(settings));
}
