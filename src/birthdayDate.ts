// One fixed instant: London is on BST (UTC+01:00) on 24 October 2026.
// Explicit offset prevents the viewing device's timezone changing the start.
export const BIRTHDAY_START = Date.parse("2026-10-24T08:00:00+01:00");
export const BIRTHDAY_START_LABEL = "24 October 2026 at 08:00 Europe/London";

export function shouldShowBirthdayFish(enabled: boolean, date: Date = new Date()): boolean {
  return enabled && date.getTime() >= BIRTHDAY_START;
}

export function birthdayCheckDelay(date: Date): number {
  const remaining = BIRTHDAY_START - date.getTime();
  // Wake at the exact start, and recheck clock changes at least every 30s.
  return remaining > 0 ? Math.max(1, Math.min(30_000, remaining)) : 30_000;
}
