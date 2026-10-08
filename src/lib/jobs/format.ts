/**
 * Az álláskártyák kiírásai: fizetés, kor, heti óraszám. Tiszta függvények,
 * szerveroldali import nélkül — a kliens komponensek hívják.
 */
import { formatNumber } from "../format";
import type { BoardJob } from "./types";

const DAY_MS = 86_400_000;

const PERIOD = { year: "/év", month: "/hó", hour: "/óra" } as const;

/** `75 000–95 000 EUR/év`, vagy `null`, ha a hirdetés nem ad fizetést. */
export function jobSalary(job: BoardJob): string | null {
  const { salaryMin: min, salaryMax: max } = job;
  if (!min && !max) return null;
  const range =
    min && max
      ? `${formatNumber(min)}–${formatNumber(max)}`
      : formatNumber((min ?? max)!);
  const period = job.salaryPeriod ? PERIOD[job.salaryPeriod] : "";
  return `${range} ${job.currency ?? ""}${period}`.trim();
}

/** `ma` · `tegnap` · `3 napja` · `2 hónapja` · `1 éve`. */
export function jobAge(
  postedAt: string | undefined,
  now: number,
): string | null {
  if (!postedAt || !now) return null;
  const days = Math.floor((now - Date.parse(postedAt)) / DAY_MS);
  if (!Number.isFinite(days) || days < 0) return null;
  if (days === 0) return "ma";
  if (days === 1) return "tegnap";
  if (days < 30) return `${days} napja`;
  if (days < 365) return `${Math.floor(days / 30)} hónapja`;
  return `${Math.floor(days / 365)} éve`;
}

/**
 * Heti óraszám — csak ha kevesebb a teljes állásnál: az az alapeset, kiírni
 * zaj lenne.
 */
export function jobHours(job: BoardJob): string | null {
  const min = job.minHours ?? job.maxHours;
  const max = job.maxHours ?? job.minHours;
  if (min == null || max == null || min >= 40) return null;
  return min === max ? `${min} óra/hét` : `${min}–${max} óra/hét`;
}
