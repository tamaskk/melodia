"use client";

import { jobAge } from "@/lib/jobs/format";
import type { JobAssistJob } from "@/lib/jobs/jobassist/types";
import { CARD, chip } from "./ui";

export type AssistJob = Omit<JobAssistJob, "raw">;

/** A cégnév első két szavának kezdőbetűje — logó híján ez áll a helyén. */
function initials(company?: string): string {
  const letters = (company ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join("");
  return letters || "?";
}

/** Egy JobAssist-állás kártyája. */
export default function JobAssistCard({
  job,
  now,
}: {
  job: AssistJob;
  /** A „mikor jelent meg" viszonyítási pontja (epoch ms). */
  now: number;
}) {
  const meta = [job.employmentType, job.seniority, jobAge(job.postedAt, now)]
    .filter(Boolean)
    .join(" · ");
  // Csak webcímre linkelünk: a cím külső forrásból jön.
  const url = job.url && /^https?:\/\//i.test(job.url) ? job.url : null;

  return (
    <article
      className={`${CARD} flex min-w-0 flex-col p-4 transition hover:border-[#33465c]`}
    >
      <div className="flex items-start gap-3">
        {job.companyLogo ? (
          // A logók tetszőleges külső címről jönnek, ezért nem a next/image tölti be.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={job.companyLogo}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            className="h-10 w-10 shrink-0 rounded object-contain"
          />
        ) : (
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-[var(--surface-2)] font-mono text-xs font-semibold text-[var(--muted)]">
            {initials(job.company)}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold leading-snug [overflow-wrap:anywhere]">
            {url ? (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-blue-300 hover:underline"
              >
                {job.title}
              </a>
            ) : (
              job.title
            )}
          </h3>
          {job.company ? (
            <p className="mt-0.5 truncate text-[13px] text-[var(--muted)]">
              {job.company}
            </p>
          ) : null}
        </div>
        {job.matchScore != null ? (
          <span
            title="A JobAssist relevancia-pontszáma"
            className="shrink-0 rounded bg-blue-500/15 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-blue-200"
          >
            {Math.round(job.matchScore)}
          </span>
        ) : null}
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-[var(--muted)]">
        {job.location ? <span>{job.location}</span> : null}
        {job.remote ? (
          <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[10px] text-emerald-300">
            REMOTE
          </span>
        ) : null}
        {job.salary ? (
          <span className="font-medium text-emerald-300">{job.salary}</span>
        ) : null}
      </div>

      {job.description ? (
        <p className="mt-2 line-clamp-3 text-[13px] leading-relaxed text-[var(--muted)] [overflow-wrap:anywhere]">
          {job.description}
        </p>
      ) : null}

      {job.tags.length ? (
        <div className="mt-2.5 flex flex-wrap gap-1">
          {job.tags.map((tag) => (
            <span
              key={tag}
              className="rounded border border-[var(--border)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--muted)]"
            >
              {tag}
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-auto flex items-center justify-between gap-2 pt-3">
        <span className="font-mono text-[10px] text-[var(--muted)]">
          {meta}
        </span>
        {url ? (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className={`${chip(false)} shrink-0`}
          >
            Megnézem →
          </a>
        ) : null}
      </div>
    </article>
  );
}
