/**
 * Fiókonkénti felfuttatás (warm-up): egy új fiók ne küldjön rögtön sokat — a
 * szolgáltatók ezt spamnek nézhetik, és letilthatják a fiókot. Az első küldés
 * napjától lépcsőzetesen nő a keret; utána a beállított napi keret él.
 *
 * A két szolgáltató más ütemű: egy személyes Gmail-fiók lassan, hetente lép,
 * a Resend (saját, hitelesített domain) pár nap alatt felér 100-ig.
 *
 * Tiszta modul: a kiküldés és a felület is használja.
 */
import type { MailProvider } from "./accountStore";

interface WarmupStep {
  /** Eddig a napig érvényes (az első küldés a 0. nap). */
  untilDay: number;
  cap: number;
  /** Ahogy a felületen és a naplóban szerepel. */
  label: string;
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

function currentStep(
  firstSendAt: string | null | undefined,
  provider: MailProvider,
  now: Date,
): WarmupStep | null {
  const steps = WARMUP_STEPS[provider];
  if (!firstSendAt) return steps[0];
  const days = (now.getTime() - new Date(firstSendAt).getTime()) / 86_400_000;
  return steps.find((step) => days < step.untilDay) ?? null;
}

/** A felfuttatás napi plafonja, vagy `null`, ha a fiók már túl van rajta. */
export function warmupCap(
  firstSendAt: string | null | undefined,
  provider: MailProvider = "gmail",
  now = new Date(),
): number | null {
  return currentStep(firstSendAt, provider, now)?.cap ?? null;
}

/** „felfuttatás: 2. hét, max. 20/nap” — vagy `null`, ha nincs korlát. */
export function warmupLabel(
  firstSendAt: string | null | undefined,
  provider: MailProvider = "gmail",
  now = new Date(),
): string | null {
  const step = currentStep(firstSendAt, provider, now);
  return step ? `felfuttatás: ${step.label}, max. ${step.cap}/nap` : null;
}
