import { HALLOWEEN_OCTOPUS_ATLASES } from "./halloweenOctopusAtlases";

export { HALLOWEEN_OCTOPUS_ATLASES };

// Deal shuffled bags: every kind appears once before a new bag starts. This
// keeps populations balanced at any count, rather than independent random picks
// that could fill the tank with duplicates while omitting a kind entirely.
export function chooseOctopusSkins(count: number, random: () => number = Math.random): string[] {
  const result: string[] = [];
  while (result.length < count) {
    const bag = HALLOWEEN_OCTOPUS_ATLASES.map(skin => skin.sprite);
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    // Also avoid an immediate repeat where two shuffled bags meet.
    if (bag[0] === result.at(-1)) [bag[0], bag[1]] = [bag[1], bag[0]];
    result.push(...bag.slice(0, count - result.length));
  }
  return result;
}
