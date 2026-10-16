import { clampEntityCounts, encodeSettings, settingsFromSearch, SETTING_GATES, type TankSettings } from "./settingsCodec";

// Keep the existing wire bits compatible, but make bubbles the single master
// for both particle layers. Old links inherit their bubbles visibility choice.
function syncParticleVisibility(next: TankSettings): TankSettings {
  const bubblesOff = next.disabled.includes("bubbles");
  next.disabled = SETTING_GATES.filter(gate => gate === "motes" ? bubblesOff : next.disabled.includes(gate));
  return next;
}

export let settings = syncParticleVisibility(settingsFromSearch(typeof location === "undefined" ? "" : location.search));
export function copySettings(): TankSettings {
  return { ...settings, disabled: [...settings.disabled], counts: { ...settings.counts } };
}
function settingsURL(next: TankSettings) {
  return `${location.pathname}?settings=${encodeSettings(next)}${location.hash}`;
}
export function saveSettings(next: TankSettings, reload = false) {
  clampEntityCounts(next);
  syncParticleVisibility(next);
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
