/**
 * Fiókonkénti felfuttatás (warm-up): egy új Gmail-fiók ne küldjön rögtön
 * napi 40 levelet — a Google ezt spamnek nézheti, és letilthatja a fiókot.
 * Az első küldés napjától hetente nő a keret; utána a beállított napi keret él.
 *
 * Tiszta modul: a kiküldés és a felület is használja.
 */
export const WARMUP_STEPS: { untilDay: number; cap: number }[] = [
  { untilDay: 7, cap: 10 },
  { untilDay: 14, cap: 20 },
  { untilDay: 21, cap: 30 },
];

/** A felfuttatás napi plafonja, vagy `null`, ha a fiók már túl van rajta. */
export function warmupCap(
  firstSendAt: string | null | undefined,
  now = new Date(),
): number | null {
  if (!firstSendAt) return WARMUP_STEPS[0].cap;
  const days = (now.getTime() - new Date(firstSendAt).getTime()) / 86_400_000;
  return WARMUP_STEPS.find((step) => days < step.untilDay)?.cap ?? null;
}

/** „felfuttatás: 2. hét, max. 20/nap” — vagy `null`, ha nincs korlát. */
export function warmupLabel(
  firstSendAt: string | null | undefined,
  now = new Date(),
): string | null {
  const cap = warmupCap(firstSendAt, now);
  if (cap === null) return null;
  const week = WARMUP_STEPS.findIndex((step) => step.cap === cap) + 1;
  return `felfuttatás: ${week}. hét, max. ${cap}/nap`;
}
