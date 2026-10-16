import { SETTING_GATES, type TankSettings } from "./settingsCodec";

export type TankTheme = "none" | "halloween";
const SKINS = ["gothPlants", "gothKelp", "crawlingHands", "halloweenBubbles"] as const;
const LAYERS = new Set<string>(["fish", "props", "plants", "kelp", "crabs", "bubbles"]);
const HALLOWEEN_SETS = new Set<string>(["fish-halloween", "fish-witches", "obj-halloween"]);
const isSet = (gate: string) => gate.startsWith("fish-") || gate.startsWith("obj-");

// Presets reuse the existing encoded fields: copied links need no extra theme
// flag, and individual controls remain free to customize the resulting tank.
export function applyTheme(current: TankSettings, theme: TankTheme): TankSettings {
  const next = { ...current, counts: { ...current.counts }, disabled: [...current.disabled] };
  const halloween = theme === "halloween";
  for (const skin of SKINS) next[skin] = halloween;
  next.disabled = SETTING_GATES.filter(gate => {
    if (LAYERS.has(gate)) return false;
    if (isSet(gate)) return halloween && !HALLOWEEN_SETS.has(gate);
    return current.disabled.includes(gate);
  });
  return next;
}

export function selectedTheme(settings: TankSettings): TankTheme {
  const matches = SKINS.every(skin => settings[skin]) && SETTING_GATES.every(gate => {
    if (LAYERS.has(gate)) return !settings.disabled.includes(gate);
    if (isSet(gate)) return settings.disabled.includes(gate) === !HALLOWEEN_SETS.has(gate);
    return true;
  });
  return matches ? "halloween" : "none";
}
