/**
 * Fiókonkénti felfuttatás (warm-up): egy új fiók ne küldjön rögtön sokat — a
 * szolgáltatók ezt spamnek nézhetik, és letilthatják a fiókot. A kezdés
 * napjától lépcsőzetesen nő a keret; az utolsó lépcső után a beállított napi
 * keret él.
 *
 * A két szolgáltató alapértelmezése más ütemű: egy személyes Gmail-fiók
 * lassan, hetente lép, a Resend (saját, hitelesített domain) pár nap alatt
 * felér 100-ig. Fiókonként saját lépcsősor is megadható, és a kezdés napja
 * átírható (újraindítás) — ezeket a hívó adja át.
 *
 * Tiszta modul: a kiküldés, a tervező és a felület is használja.
 */
import type { MailProvider } from "./accountStore";

export interface WarmupStep {
  /** Eddig a napig érvényes (a kezdés a 0. nap). */
  untilDay: number;
  cap: number;
  /** Ahogy a felületen és a naplóban szerepel; saját lépcsőnél a napokból képződik. */
  label?: string;
}

export const WARMUP_STEPS: Record<MailProvider, WarmupStep[]> = {
  gmail: [
    { untilDay: 7, cap: 10, label: "1. hét" },
    { untilDay: 14, cap: 20, label: "2. hét" },
    { untilDay: 21, cap: 30, label: "3. hét" },
  ],
  resend: [
    { untilDay: 2, cap: 10, label: "1–2. nap" },
    { untilDay: 4, cap: 25, label: "3–4. nap" },
    { untilDay: 7, cap: 50, label: "5–7. nap" },
    { untilDay: 14, cap: 100, label: "2. hét" },
  ],
};

/** Ennyi lépcső adható meg egy fiókhoz. */
export const MAX_STEPS = 12;
const DAY_MS = 86_400_000;

/** A fiókra érvényes lépcsősor: a sajátja, vagy a szolgáltató alapértelmezése. */
export function stepsFor(
  provider: MailProvider,
  custom?: WarmupStep[] | null,
): WarmupStep[] {
  return custom?.length ? custom : WARMUP_STEPS[provider];
}

/** „1. hét”, vagy saját lépcsőnél „8–14. nap”. */
export function stepLabel(steps: WarmupStep[], index: number): string {
  const step = steps[index];
  if (step.label) return step.label;
  const from = (steps[index - 1]?.untilDay ?? 0) + 1;
  return from === step.untilDay
    ? `${from}. nap`
    : `${from}–${step.untilDay}. nap`;
}

function currentIndex(
  startAt: string | null | undefined,
  steps: WarmupStep[],
  now: Date,
): number {
  // Aki még nem küldött, az az első lépcsőn áll: a felfuttatás az első
  // küldéssel indul.
  if (!startAt) return 0;
  const days = (now.getTime() - new Date(startAt).getTime()) / DAY_MS;
  return steps.findIndex((step) => days < step.untilDay);
}

/** A felfuttatás napi plafonja, vagy `null`, ha a fiók már túl van rajta. */
export function warmupCap(
  startAt: string | null | undefined,
  provider: MailProvider = "gmail",
  now = new Date(),
  custom?: WarmupStep[] | null,
): number | null {
  const steps = stepsFor(provider, custom);
  return steps[currentIndex(startAt, steps, now)]?.cap ?? null;
}

/** „felfuttatás: 2. hét, max. 20/nap” — vagy `null`, ha nincs korlát. */
export function warmupLabel(
  startAt: string | null | undefined,
  provider: MailProvider = "gmail",
  now = new Date(),
  custom?: WarmupStep[] | null,
): string | null {
  const steps = stepsFor(provider, custom);
  const index = currentIndex(startAt, steps, now);
  return index === -1
    ? null
    : `felfuttatás: ${stepLabel(steps, index)}, max. ${steps[index].cap}/nap`;
}

/** Hol tart a fiók a felfuttatásban — a Küldő fiókok oldal ezt mutatja. */
export interface WarmupStatus {
  steps: { untilDay: number; cap: number; label: string }[];
  /** Igaz: a fiók saját lépcsősora, nem a szolgáltató alapértelmezése. */
  custom: boolean;
  /** A kezdés időpontja; `null`, ha a fiók még nem küldött. */
  startAt: string | null;
  /** Igaz: a kezdést kézzel állították (újraindítás), nem az első küldés adja. */
  startSet: boolean;
  /** Hányadik napnál jár (a kezdés napja az 1.); `null`, ha még nem indult. */
  day: number | null;
  /** A most érvényes lépcső sorszáma; `null`, ha a fiók végzett a felfuttatással. */
  index: number | null;
  /** A mai plafon; `null`, ha már nincs. */
  cap: number | null;
}

export function warmupStatus(
  startAt: string | null,
  startSet: boolean,
  provider: MailProvider,
  custom: WarmupStep[] | null,
  now = new Date(),
): WarmupStatus {
  const steps = stepsFor(provider, custom);
  const index = currentIndex(startAt, steps, now);
  return {
    steps: steps.map((step, at) => ({
      untilDay: step.untilDay,
      cap: step.cap,
      label: stepLabel(steps, at),
    })),
    custom: Boolean(custom?.length),
    startAt,
    startSet,
    day: startAt
      ? Math.max(
          1,
          Math.floor((now.getTime() - new Date(startAt).getTime()) / DAY_MS) +
            1,
        )
      : null,
    index: index === -1 ? null : index,
    cap: steps[index]?.cap ?? null,
  };
}

/**
 * A felületről kapott lépcsősor ellenőrzése. A napok szigorúan nőnek — a
 * darabszám nem kötelezően: szándékosan vissza is lehet venni.
 */
export function cleanSteps(input: unknown): WarmupStep[] {
  if (!Array.isArray(input) || !input.length) {
    throw new Error("Adj meg legalább egy lépcsőt.");
  }
  if (input.length > MAX_STEPS) {
    throw new Error(`Legfeljebb ${MAX_STEPS} lépcső adható meg.`);
  }
  let previous = 0;
  return input.map((item, index) => {
    const untilDay = Number((item as WarmupStep | null)?.untilDay);
    const cap = Number((item as WarmupStep | null)?.cap);
    if (!Number.isInteger(untilDay) || untilDay <= previous || untilDay > 365) {
      throw new Error(
        `${index + 1}. lépcső: az „eddig a napig” egész szám legyen, nagyobb az előzőnél (${previous}), legfeljebb 365.`,
      );
    }
    if (!Number.isInteger(cap) || cap < 1 || cap > 100) {
      throw new Error(
        `${index + 1}. lépcső: a napi darabszám 1 és 100 közötti egész szám legyen.`,
      );
    }
    previous = untilDay;
    return { untilDay, cap };
  });
}
