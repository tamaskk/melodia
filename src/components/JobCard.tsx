"use client";

import { jobAge, jobHours, jobSalary } from "@/lib/jobs/format";
import {
  BOARD_COLUMNS,
  type BoardJob,
  type BoardStatus,
} from "@/lib/jobs/types";
import { CARD, chip } from "./ui";

const TAG = "rounded border px-1.5 py-0.5";

/**
 * Egy állás kártyája a státuszgombokkal. `compact`: a kanban oszlopaiban
 * leírás nélkül.
 */
export default function JobCard({
  job,
  status,
  onStatus,
  sourceNames,
  now,
  busy = false,
  compact = false,
}: {
  job: BoardJob;
  /** Melyik oszlopban van; `null`, ha nincs a táblán. */
  status: BoardStatus | null;
  onStatus: (status: BoardStatus) => void;
  /** Forrás-id → a katalógus szerinti név. */
  sourceNames: Record<string, string>;
  /** A „mikor jelent meg" viszonyítási pontja (epoch ms). */
  now: number;
  /** Épp megy a mentése: addig a státuszgombok állnak. */
  busy?: boolean;
  compact?: boolean;
}) {
  const sourceName = (id: string) => sourceNames[id] ?? id;
  const salary = jobSalary(job);
  const age = jobAge(job.postedAt, now);
  const hours = jobHours(job);
  // Van időzóna-megkötés, és a közép-európai idő (UTC+1/+2) nincs benne.
  const outsideCet =
    job.timezones?.length &&
    !job.timezones.includes(1) &&
    !job.timezones.includes(2);

  return (
    <article
      className={`${CARD} min-w-0 p-3 transition hover:border-[#33465c]`}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="min-w-0 text-sm font-semibold leading-snug [overflow-wrap:anywhere]">
          <a
            href={job.url}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-blue-300 hover:underline"
          >
            {job.title}
          </a>
        </h3>
        {job.remote ? (
          <span className="shrink-0 rounded bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[10px] text-emerald-300">
            REMOTE
          </span>
        ) : null}
      </div>

      <p className="mt-1 text-[13px] text-[var(--muted)] [overflow-wrap:anywhere]">
        <span className="font-medium text-foreground">{job.company}</span>
        {job.location ? ` · ${job.location}` : null}
        {job.country && !job.location?.includes(job.country)
          ? ` · ${job.country}`
          : null}
        {job.alsoCountries?.length
          ? ` · +${job.alsoCountries.length} ország`
          : null}
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-1.5 font-mono text-[10px] text-[var(--muted)]">
        <span className={`${TAG} border-[var(--border)]`}>
          {sourceName(job.sourceId)}
        </span>
        {job.alsoFrom?.map((id) => (
          <span
            key={id}
            className={`${TAG} border-dashed border-[var(--border)]`}
          >
            +{sourceName(id)}
          </span>
        ))}
        {salary ? (
          job.salaryIsEstimate ? (
            <span title="Becsült fizetés (Adzuna Jobsworth), nem a hirdetésből">
              {salary} ~becsült
            </span>
          ) : (
            <span className="text-emerald-300">{salary}</span>
          )
        ) : null}
        {age ? <span>{age}</span> : null}
        {hours ? <span className="text-amber-300">{hours}</span> : null}
        {job.seniority ? <span>{job.seniority}</span> : null}
        {outsideCet ? (
          <span
            title={`Megengedett UTC-eltolások: ${job.timezones!.join(", ")} — a CET (+1/+2) nincs köztük`}
            className="rounded bg-amber-500/10 px-1.5 py-0.5 text-amber-300"
          >
            nem CET
          </span>
        ) : null}
      </div>

      {!compact && job.description ? (
        <p className="mt-2 line-clamp-2 text-[13px] leading-relaxed text-[var(--muted)] [overflow-wrap:anywhere]">
          {job.description}
        </p>
      ) : null}

      <div className="mt-2.5 flex flex-wrap gap-1">
        {BOARD_COLUMNS.map((column) => (
          <button
            key={column.id}
            type="button"
            aria-pressed={status === column.id}
            disabled={busy}
            onClick={() => onStatus(column.id)}
            className={`${chip(status === column.id, "sm")} disabled:opacity-50`}
          >
            {column.label}
          </button>
        ))}
      </div>
    </article>
  );
}
