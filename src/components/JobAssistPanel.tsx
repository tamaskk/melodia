"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatNumber } from "@/lib/format";
import {
  activeFilterCount,
  DATE_POSTED,
  EMPTY_FILTERS,
  filtersToParams,
  INDUSTRIES,
  SALARY_MODES,
  SALARY_RANGE,
  SORT_OPTIONS,
  WORK_ARRANGEMENTS,
  WORK_TYPES,
  type FilterOption,
  type FilterState,
} from "@/lib/jobs/jobassist/filters";
import JobAssistCard, { type AssistJob } from "./JobAssistCard";
import LocationAutocomplete from "./LocationAutocomplete";
import RangeSlider from "./RangeSlider";
import TitleChipsInput from "./TitleChipsInput";
import { button, CARD, chip, field } from "./ui";

interface PageMeta {
  total?: number;
  page?: number;
  hasMore?: boolean;
}

const LABEL = "mb-1.5 text-xs font-medium text-[var(--muted)]";
const HINT = "font-normal opacity-70";

const toggled = (list: string[], value: string) =>
  list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

/**
 * JobAssist: egyetlen külső forrás a saját szűrőkészletével. A szűrők
 * átállítása nem keres — csak az űrlap elküldése.
 */
export default function JobAssistPanel() {
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [jobs, setJobs] = useState<AssistJob[]>([]);
  const [meta, setMeta] = useState<PageMeta>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [demo, setDemo] = useState(false);
  const [showIndustries, setShowIndustries] = useState(false);
  const [now, setNow] = useState(0);
  // Elavult válasz ne írja felül a frisset.
  const requestRef = useRef(0);

  const patch = (change: Partial<FilterState>) =>
    setFilters((current) => ({ ...current, ...change }));

  /**
   * `append`: a következő oldal a meglévő lista végére kerül.
   * `demoData`: kitalált mintakártyák, token nélkül.
   */
  const load = useCallback(
    async (
      state: FilterState,
      page: number,
      append: boolean,
      demoData = false,
    ) => {
      const request = ++requestRef.current;
      setLoading(true);
      setError(null);
      setHint(null);
      try {
        const params = filtersToParams(state, page);
        if (demoData) params.set("demo", "1");
        const response = await fetch(`/api/jobs/jobassist?${params}`, {
          cache: "no-store",
        });
        const data = await response.json();
        if (request !== requestRef.current) return;
        if (!response.ok) {
          setError(data.error ?? "Ismeretlen hiba");
          setHint(data.hint ?? null);
          if (!append) setJobs([]);
          return;
        }
        const incoming = (data.jobs as AssistJob[]) ?? [];
        setJobs((current) => (append ? [...current, ...incoming] : incoming));
        setMeta({ total: data.total, page: data.page, hasMore: data.hasMore });
        setDemo(Boolean(data.demo));
        setNow(Date.now());
      } catch (caught) {
        if (request !== requestRef.current) return;
        setError((caught as Error).message || "Ismeretlen hiba");
        if (!append) setJobs([]);
      } finally {
        if (request === requestRef.current) setLoading(false);
      }
    },
    [],
  );

  // Megnyitáskor azonnal keres az alapszűrőkkel.
  useEffect(() => {
    const first = setTimeout(() => void load(EMPTY_FILTERS, 1, false), 0);
    return () => clearTimeout(first);
  }, [load]);

  const chips = (
    options: FilterOption[],
    isOn: (value: string) => boolean,
    onPick: (value: string) => void,
  ) => (
    <div className="flex flex-wrap gap-1.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={isOn(option.value)}
          onClick={() => onPick(option.value)}
          className={chip(isOn(option.value))}
        >
          {option.label}
        </button>
      ))}
    </div>
  );

  const range = filters.salary.mode ? SALARY_RANGE[filters.salary.mode] : null;
  const activeCount = activeFilterCount(filters);
  const pickedIndustries = INDUSTRIES.filter((industry) =>
    filters.industries.includes(industry.value),
  );
  // A dátumszűrő és a lazítás kizárja egymást: dátummal a lazítás nem megy ki.
  const relaxOff = Boolean(filters.datePosted);

  return (
    <div className="space-y-4">
      <form
        className={`${CARD} flex flex-col gap-4 p-4`}
        onSubmit={(event) => {
          event.preventDefault();
          void load(filters, 1, false);
        }}
      >
        <div>
          <p className={LABEL}>
            Álláscímek{" "}
            <span className={HINT}>
              (Enter vagy vessző hozzáad — pl. „Software Engineer”)
            </span>
          </p>
          <TitleChipsInput
            label="Álláscímek"
            values={filters.exactTitles}
            onChange={(exactTitles) => patch({ exactTitles })}
            placeholder="Írj be egy pozíció-címet, és nyomj Entert…"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="min-w-0">
            <p className={LABEL}>
              Szabadszavas keresés <span className={HINT}>(opcionális)</span>
            </p>
            <input
              value={filters.search}
              onChange={(event) => patch({ search: event.target.value })}
              aria-label="Szabadszavas keresés"
              placeholder="pl. Python, fintech, AI…"
              className={`${field()} w-full`}
            />
          </div>
          <div className="min-w-0">
            <p className={LABEL}>
              Hely <span className={HINT}>(város vagy ország)</span>
            </p>
            <LocationAutocomplete
              selected={filters.locations}
              onChange={(locations) => patch({ locations })}
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className={LABEL}>Munkavégzés</p>
            {chips(
              WORK_TYPES,
              (value) => filters.workTypes.includes(value),
              (value) =>
                patch({ workTypes: toggled(filters.workTypes, value) }),
            )}
          </div>
          <div>
            <p className={LABEL}>Munkaidő</p>
            {chips(
              WORK_ARRANGEMENTS,
              (value) => filters.workArrangements.includes(value),
              (value) =>
                patch({
                  workArrangements: toggled(filters.workArrangements, value),
                }),
            )}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className={LABEL}>Mikor jelent meg</p>
            {chips(
              DATE_POSTED,
              (value) => filters.datePosted === value,
              (datePosted) => patch({ datePosted }),
            )}
          </div>
          <div className="min-w-0">
            <p className={LABEL}>Fizetés</p>
            <div className="mb-2 flex w-fit max-w-full gap-1 rounded-lg border border-[var(--border)] p-0.5">
              {SALARY_MODES.map((mode) => (
                <button
                  key={mode.value}
                  type="button"
                  aria-pressed={filters.salary.mode === mode.value}
                  onClick={() => {
                    // Módváltáskor a csúszka a mód teljes tartományára áll.
                    const next = SALARY_RANGE[mode.value];
                    patch({
                      salary: {
                        mode: mode.value,
                        min: next?.min ?? 0,
                        max: next?.max ?? 0,
                      },
                    });
                  }}
                  className={`h-8 rounded-md px-2.5 text-[13px] transition ${
                    filters.salary.mode === mode.value
                      ? "bg-[var(--surface-2)] text-foreground"
                      : "text-[var(--muted)] hover:text-foreground"
                  }`}
                >
                  {mode.label}
                </button>
              ))}
            </div>
            {range ? (
              <RangeSlider
                min={range.min}
                max={range.max}
                step={range.step}
                value={filters.salary}
                onChange={(value) =>
                  patch({ salary: { ...filters.salary, ...value } })
                }
                format={(n) => `${formatNumber(n)} ${range.suffix}`}
              />
            ) : (
              <p className="text-[13px] text-[var(--muted)]">
                Nincs fizetésszűrő.
              </p>
            )}
          </div>
        </div>

        <div>
          <button
            type="button"
            aria-expanded={showIndustries}
            onClick={() => setShowIndustries((shown) => !shown)}
            className={`${LABEL} flex items-center gap-1.5 hover:text-foreground`}
          >
            Iparágak
            {filters.industries.length ? ` (${filters.industries.length})` : ""}
            <span className="text-[10px]">{showIndustries ? "▲" : "▼"}</span>
          </button>
          {chips(
            showIndustries ? INDUSTRIES : pickedIndustries,
            (value) => filters.industries.includes(value),
            (value) =>
              patch({ industries: toggled(filters.industries, value) }),
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-[var(--border)] pt-3">
          <label className="flex items-center gap-2 text-[13px] text-[var(--muted)]">
            Rendezés:
            <select
              value={filters.sortBy}
              onChange={(event) => patch({ sortBy: event.target.value })}
              className={field("sm")}
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label
            title={
              relaxOff
                ? "Dátumszűrővel nem használható — a kettő kizárja egymást"
                : "Ha kevés a találat, a szerver lazít a szűrőkön"
            }
            className={`flex items-center gap-2 text-[13px] text-[var(--muted)] ${relaxOff ? "opacity-50" : ""}`}
          >
            <input
              type="checkbox"
              checked={filters.autoRelax && !relaxOff}
              disabled={relaxOff}
              onChange={(event) => patch({ autoRelax: event.target.checked })}
              className="accent-blue-500"
            />
            Automatikus lazítás
            {relaxOff ? " (dátumnál kikapcsolva)" : ""}
          </label>

          <div className="ml-auto flex flex-wrap items-center gap-3">
            {activeCount ? (
              <button
                type="button"
                onClick={() => setFilters(EMPTY_FILTERS)}
                className="text-xs text-[var(--muted)] underline underline-offset-2 hover:text-foreground"
              >
                Szűrők törlése ({activeCount})
              </button>
            ) : null}
            <button
              type="submit"
              disabled={loading}
              className={button("primary", "md")}
            >
              {loading ? "Keresés…" : "Keresés"}
            </button>
          </div>
        </div>
      </form>

      {demo ? (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-[13px] text-amber-300">
          <strong>Demo-adat.</strong> Kitalált hirdetések, csak a kártyák
          kinézetére. Valódi adathoz a JobAssist munkamenet-tokenje kell (
          <code className="font-mono">JOBASSIST_SESSION_TOKEN</code>).
        </p>
      ) : null}

      {error ? (
        <div
          role="alert"
          className="rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-300"
        >
          <p className="font-medium">{error}</p>
          {hint ? <p className="mt-1 text-[13px]">{hint}</p> : null}
          <p className="mt-1.5 text-[13px]">
            A JobAssist munkamenet-tokent igényel (
            <code className="font-mono">JOBASSIST_SESSION_TOKEN</code> az{" "}
            <code className="font-mono">atlas-credentials.env</code>-ben, a
            telepített példányon környezeti változóként). Addig a{" "}
            <button
              type="button"
              onClick={() => void load(filters, 1, false, true)}
              className="underline"
            >
              demo-nézet
            </button>{" "}
            mutatja a kártyákat.
          </p>
        </div>
      ) : null}

      {!error && jobs.length ? (
        <p className="font-mono text-[11px] text-[var(--muted)]">
          {jobs.length} betöltve
          {meta.total ? ` · ${formatNumber(meta.total)} találat` : ""}
          {meta.page ? ` · ${meta.page}. oldal` : ""}
        </p>
      ) : null}

      {loading && jobs.length === 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <div
              key={index}
              className={`${CARD} h-44 animate-pulse bg-[var(--surface-2)]`}
            />
          ))}
        </div>
      ) : null}

      {jobs.length ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {jobs.map((job) => (
            <JobAssistCard key={job.id} job={job} now={now} />
          ))}
        </div>
      ) : null}

      {!loading && !error && jobs.length === 0 ? (
        <p className="py-16 text-center text-sm text-[var(--muted)]">
          Nincs találat. Próbálj lazítani a szűrőkön.
        </p>
      ) : null}

      {jobs.length && meta.hasMore ? (
        <div className="text-center">
          <button
            type="button"
            disabled={loading}
            onClick={() => void load(filters, (meta.page ?? 1) + 1, true)}
            className={button("secondary", "md")}
          >
            {loading ? "Töltés…" : "További találatok"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
