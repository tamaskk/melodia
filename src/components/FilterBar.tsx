"use client";

import { useEffect, useState } from "react";
import Combobox from "./Combobox";
import { COUNTRY_LABELS, SOURCE_LABELS } from "@/data";
import { COUNTRIES } from "@/lib/countries";
import { STAGES } from "@/lib/stage";
import type { ContactFilters } from "@/lib/types";
import { formatNumber } from "@/lib/format";

export interface Facets {
  categories: string[];
  cities: string[];
  tags: string[];
  countries: string[];
  sizes: string[];
  sources: string[];
}

const SELECT_CLASS =
  "h-9 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 text-sm outline-none focus:border-blue-500";

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wider text-[var(--muted)]">
        {label}
      </span>
      <select
        className={SELECT_CLASS}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

const EMAIL_STATUS = [
  { value: "", label: "Mind" },
  { value: "found", label: "Van" },
  { value: "missing", label: "Nincs — összes" },
  { value: "unsearched", label: "Nincs — még nem kerestem" },
  { value: "suggested-email", label: "Nincs — de van javaslat (cím)" },
  { value: "suggested-form", label: "Nincs — de van javaslat (űrlap)" },
  { value: "nothing", label: "Nincs — semmit nem talált" },
];

const CONTACT_STATUS = [
  { value: "", label: "Mind" },
  { value: "found", label: "Van" },
  { value: "missing", label: "Nincs — összes" },
  { value: "unsearched", label: "Nincs — még nem kerestem" },
  { value: "none", label: "Nincs — kerestem, nem lett" },
];

/** Az e-mail gyorsgombok a régi mezőket is nullázzák, hogy ne üssék egymást. */
const email = (emailStatus: ContactFilters["emailStatus"]) => ({
  emailStatus,
  hasEmail: "" as const,
  emailSearched: "" as const,
});

interface Chip {
  label: string;
  patch: Partial<ContactFilters>;
  active: (filters: ContactFilters) => boolean;
}

/** A napi munkához kellő gyorsszűrők — mindig látszanak. */
const PRIMARY: Chip[] = [
  {
    label: "Csak nyitott",
    patch: { done: "no" },
    active: (f) => f.done === "no",
  },
  {
    label: "Nincs elküldve",
    patch: { sent: "no" },
    active: (f) => f.sent === "no",
  },
  {
    label: "Van e-mail",
    patch: email("found"),
    active: (f) => f.emailStatus === "found",
  },
  {
    label: "Nincs e-mail, még nem kerestem",
    patch: email("unsearched"),
    active: (f) => f.emailStatus === "unsearched",
  },
  {
    label: "Van kapcsolattartó",
    patch: { contactStatus: "found" },
    active: (f) => f.contactStatus === "found",
  },
  {
    label: "Válaszolt",
    patch: { stage: "valaszolt" },
    active: (f) => f.stage === "valaszolt",
  },
];

/** A ritkábbak a "További szűrők" mögött. */
const SECONDARY: Chip[] = [
  {
    label: "Csillagozott",
    patch: { starred: "yes" },
    active: (f) => f.starred === "yes",
  },
  { label: "Kész", patch: { done: "yes" }, active: (f) => f.done === "yes" },
  {
    label: "Elküldve",
    patch: { sent: "yes" },
    active: (f) => f.sent === "yes",
  },
  {
    label: "Nincs e-mail",
    patch: email("missing"),
    active: (f) => f.emailStatus === "missing",
  },
  {
    label: "Nincs e-mail, de van címjavaslat",
    patch: email("suggested-email"),
    active: (f) => f.emailStatus === "suggested-email",
  },
  {
    label: "Nincs e-mail, de van űrlap",
    patch: email("suggested-form"),
    active: (f) => f.emailStatus === "suggested-form",
  },
  {
    label: "Kerestem, semmit nem talált",
    patch: email("nothing"),
    active: (f) => f.emailStatus === "nothing",
  },
  {
    label: "Nincs kapcsolattartó, még nem kerestem",
    patch: { contactStatus: "unsearched" },
    active: (f) => f.contactStatus === "unsearched",
  },
  {
    label: "Cégvezetők",
    patch: { kind: "company-leader" },
    active: (f) => f.kind === "company-leader",
  },
  {
    label: "Toborzók",
    patch: { kind: "recruiter" },
    active: (f) => f.kind === "recruiter",
  },
  {
    label: "Ügynökségek",
    patch: { kind: "agency" },
    active: (f) => f.kind === "agency",
  },
  {
    label: "IT cégek",
    patch: { kind: "it-company" },
    active: (f) => f.kind === "it-company",
  },
  {
    label: "Legújabbak elöl",
    patch: { sort: "newest" },
    active: (f) => f.sort === "newest",
  },
  {
    label: "Több iroda",
    patch: { tag: "tobb-iroda" },
    active: (f) => f.tag === "tobb-iroda",
  },
  {
    label: "Közös postafiók",
    patch: { tag: "kozos-postafiok" },
    active: (f) => f.tag === "kozos-postafiok",
  },
];

const YES_NO = [
  { value: "", label: "Mind" },
  { value: "yes", label: "Igen" },
  { value: "no", label: "Nem" },
];

interface QueueOption {
  id: string;
  name: string;
  total: number;
  runDate: string;
  status: string;
  accounts: string[];
}

/** Ennél régebbi queue-k nem kerülnek a szűrő listájába. */
const QUEUE_DAYS = 60;

/** „10.10. szombat" — a naptári nap, időzóna-csúszás nélkül. */
const queueDay = (day: string) =>
  `${day.slice(5).replace("-", ".")}. ` +
  new Date(`${day}T12:00:00Z`).toLocaleDateString("hu-HU", {
    timeZone: "UTC",
    weekday: "long",
  });

/**
 * Queue-szűrő: benne van / nincs benne, vagy egy konkrét queue — ezek nap
 * szerint csoportosítva, a legközelebbi nappal kezdve, a fiókkal együtt kiírva.
 */
function QueueSelect({
  inQueue,
  queueId,
  onChange,
}: {
  inQueue: string;
  queueId: string;
  onChange: (patch: Partial<ContactFilters>) => void;
}) {
  const [queues, setQueues] = useState<QueueOption[]>([]);
  // A legrégebbi nap, ami még a listába kerül — a betöltés pillanatához mérve.
  const [oldest, setOldest] = useState("");
  const [today, setToday] = useState("");

  useEffect(() => {
    let alive = true;
    const timer = setTimeout(() => {
      fetch("/api/queues?brief=1", { cache: "no-store" })
        .then((response) => (response.ok ? response.json() : null))
        .then((data) => {
          if (!alive || !data) return;
          setQueues((data.queues ?? []) as QueueOption[]);
          setToday(new Date().toISOString().slice(0, 10));
          setOldest(
            new Date(Date.now() - QUEUE_DAYS * 86_400_000)
              .toISOString()
              .slice(0, 10),
          );
        })
        // A lista nélkül a szűrő két alapállása ugyanúgy működik.
        .catch(() => undefined);
    }, 0);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, []);

  const days = new Map<string, QueueOption[]>();
  for (const queue of queues) {
    // A kiválasztott queue akkor is látszik, ha már régi.
    if (queue.runDate < oldest && queue.id !== queueId) continue;
    days.set(queue.runDate, [...(days.get(queue.runDate) ?? []), queue]);
  }
  // Elöl a mai és a közelgő napok, a legközelebbivel kezdve; alattuk a múlt,
  // a legutóbbitól visszafelé.
  const sorted = [...days.entries()].sort(([a], [b]) => {
    const upcoming = Number(b >= today) - Number(a >= today);
    if (upcoming) return upcoming;
    return a >= today ? a.localeCompare(b) : b.localeCompare(a);
  });

  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wider text-[var(--muted)]">
        Queue
      </span>
      <select
        className={SELECT_CLASS}
        value={queueId ? `q:${queueId}` : inQueue}
        onChange={(event) => {
          const value = event.target.value;
          // A kettő kizárja egymást: vagy az általános állás, vagy egy queue.
          onChange(
            value.startsWith("q:")
              ? { inQueue: "", queueId: value.slice(2) }
              : { inQueue: value as ContactFilters["inQueue"], queueId: "" },
          );
        }}
      >
        <option value="">Mind</option>
        <option value="yes">Benne van</option>
        <option value="no">Nincs benne</option>
        {sorted.map(([day, list]) => (
          <optgroup key={day} label={queueDay(day)}>
            {list.map((queue) => (
              <option key={queue.id} value={`q:${queue.id}`}>
                {day.slice(5).replace("-", ".")}. – {queue.accounts.join(", ")}{" "}
                – {queue.name} ({queue.total})
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}

export default function FilterBar({
  filters,
  onChange,
  onReset,
  facets,
  count,
  shown,
}: {
  filters: ContactFilters;
  onChange: (patch: Partial<ContactFilters>) => void;
  onReset: () => void;
  facets: Facets;
  /** Ennyi sor felel meg a szűrőnek az adatbázisban. */
  count: number;
  /** Ennyi jelenik meg belőle (a lista 2000 sornál elvágja). */
  shown?: number;
}) {
  const [more, setMore] = useState(false);

  // Hány aktív szűrő van a "További szűrők" mögött — hogy összecsukva se
  // felejtődjön ott egy beállítás. A kereső és a forrás látszik, az nem számít.
  const hiddenActive = Object.entries(filters).filter(([key, value]) => {
    if (!value || key === "q" || key === "source") return false;
    if (key === "sort" && value === "score") return false;
    return !PRIMARY.some(
      (chip) =>
        chip.active(filters) &&
        (chip.patch as Record<string, unknown>)[key] === value,
    );
  }).length;

  const quick = (
    label: string,
    patch: Partial<ContactFilters>,
    active: boolean,
  ) => (
    <button
      key={label}
      type="button"
      onClick={() => onChange(active ? invert(patch) : patch)}
      className={`h-8 rounded-full border px-3 text-xs transition ${
        active
          ? "border-blue-500 bg-blue-500/15 text-blue-300"
          : "border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );

  function invert(patch: Partial<ContactFilters>): Partial<ContactFilters> {
    return Object.fromEntries(
      Object.keys(patch).map((key) => [key, ""]),
    ) as Partial<ContactFilters>;
  }

  return (
    <div className="space-y-3 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={filters.q ?? ""}
          onChange={(event) => onChange({ q: event.target.value })}
          placeholder="Keresés: cég, név, e-mail, pozíció, város, címke…"
          className="h-9 min-w-[220px] flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 text-sm outline-none placeholder:text-[var(--muted)] focus:border-blue-500"
        />
        <div className="w-full sm:w-72 [&>div>span:first-child]:sr-only">
          <Combobox
            label="Forrás"
            value={filters.source ?? ""}
            onChange={(source) => onChange({ source })}
            emptyLabel="Minden forrás"
            placeholder="Forrás — írj rá: lengyel, toborzó…"
            options={[
              // A facetből jövő forrásokat is mutatjuk: kézzel átállított sorok
              // is szűrhetők legyenek, akkor is, ha nincs hozzájuk címke.
              ...[
                ...new Set([...facets.sources, ...Object.keys(SOURCE_LABELS)]),
              ]
                .sort()
                .map((value) => ({
                  value,
                  label: SOURCE_LABELS[value] ?? value,
                  // A nyers kulcsra is lehessen keresni: "it-companies-pl".
                  keywords: value.replace(/-/g, " "),
                })),
            ]}
          />
        </div>
        <span className="rounded-lg bg-[var(--surface-2)] px-3 py-2 text-sm tabular-nums text-[var(--muted)]">
          {formatNumber(count)} találat
          {shown !== undefined && shown < count ? (
            <span className="block text-[11px] text-amber-300">
              {formatNumber(shown)} jelenik meg
            </span>
          ) : null}
        </span>
        <button
          type="button"
          onClick={onReset}
          className="h-9 rounded-lg border border-[var(--border)] px-3 text-sm text-[var(--muted)] transition hover:text-foreground"
        >
          Szűrők törlése
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {PRIMARY.map((chip) =>
          quick(chip.label, chip.patch, chip.active(filters)),
        )}
        <button
          type="button"
          onClick={() => setMore((value) => !value)}
          aria-expanded={more}
          className={`h-8 rounded-full border px-3 text-xs transition ${
            hiddenActive
              ? "border-amber-500/60 text-amber-300"
              : "border-dashed border-[var(--border)] text-[var(--muted)] hover:text-foreground"
          }`}
        >
          {more ? "Kevesebb szűrő ▴" : "További szűrők ▾"}
          {hiddenActive ? ` · ${hiddenActive} aktív` : ""}
        </button>
      </div>

      {more ? (
        <div className="space-y-2 border-t border-[var(--border)] pt-3">
          <div className="flex flex-wrap gap-2">
            {SECONDARY.map((chip) =>
              quick(chip.label, chip.patch, chip.active(filters)),
            )}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <Select
              label="Csatorna"
              value={filters.channel ?? ""}
              onChange={(channel) => onChange({ channel })}
              options={[
                { value: "", label: "Mind" },
                { value: "email", label: "E-mail" },
                { value: "linkedin", label: "LinkedIn" },
                { value: "both", label: "Mindkettő" },
              ]}
            />
            <Select
              label="Típus"
              value={filters.kind ?? ""}
              onChange={(kind) => onChange({ kind })}
              options={[
                { value: "", label: "Mind" },
                { value: "company-leader", label: "Cégvezető" },
                { value: "recruiter", label: "Toborzó" },
                { value: "agency", label: "Ügynökség" },
                { value: "it-company", label: "IT cég" },
              ]}
            />
            <Combobox
              label="Kategória"
              value={filters.category ?? ""}
              onChange={(category) => onChange({ category })}
              emptyLabel="Minden kategória"
              options={facets.categories.map((value) => ({
                value,
                label: value,
              }))}
            />
            <Combobox
              label="Ország"
              value={filters.country ?? ""}
              onChange={(country) => onChange({ country })}
              emptyLabel="Minden ország"
              placeholder="Írj rá: lengyel, spain, AE…"
              options={facets.countries.map((value) => ({
                value,
                label: COUNTRY_LABELS[value] ?? value,
                keywords: COUNTRIES[value]?.en ?? "",
              }))}
            />
            <Combobox
              label="Város"
              value={filters.city ?? ""}
              onChange={(city) => onChange({ city })}
              emptyLabel="Minden város"
              placeholder="Írj rá: buda, wien…"
              options={facets.cities.map((value) => ({ value, label: value }))}
            />
            <Select
              label="Méret"
              value={filters.size ?? ""}
              onChange={(size) => onChange({ size })}
              options={[
                { value: "", label: "Minden méret" },
                // facets.sizes already arrives in head-count order.
                ...facets.sizes.map((value) => ({
                  value,
                  label: `${value} fő`,
                })),
              ]}
            />
            <Select
              label="Nyelv"
              value={filters.language ?? ""}
              onChange={(language) => onChange({ language })}
              options={[
                { value: "", label: "Mind" },
                { value: "hu", label: "Magyar" },
                { value: "en", label: "Angol" },
              ]}
            />
            <Combobox
              label="Címke"
              value={filters.tag ?? ""}
              onChange={(tag) => onChange({ tag })}
              emptyLabel="Minden címke"
              placeholder="Írj rá: fintech, meret-51…"
              options={facets.tags.map((value) => ({ value, label: value }))}
            />
            <Select
              label="Státusz"
              value={filters.stage ?? ""}
              onChange={(value) =>
                onChange({ stage: value as ContactFilters["stage"] })
              }
              options={[
                { value: "", label: "Mind" },
                ...STAGES.map((stage) => ({
                  value: stage.value,
                  label: stage.label,
                })),
              ]}
            />
            <Select
              label="E-mail"
              value={filters.emailStatus ?? ""}
              onChange={(value) =>
                onChange(email(value as ContactFilters["emailStatus"]))
              }
              options={EMAIL_STATUS}
            />
            <Select
              label="Kapcsolattartó"
              value={filters.contactStatus ?? ""}
              onChange={(value) =>
                onChange({
                  contactStatus: value as ContactFilters["contactStatus"],
                })
              }
              options={CONTACT_STATUS}
            />
            <Select
              label="Elküldve"
              value={filters.sent ?? ""}
              onChange={(sent) =>
                onChange({ sent: sent as ContactFilters["sent"] })
              }
              options={YES_NO}
            />
            <Select
              label="Kész"
              value={filters.done ?? ""}
              onChange={(done) =>
                onChange({ done: done as ContactFilters["done"] })
              }
              options={YES_NO}
            />
            <QueueSelect
              inQueue={filters.inQueue ?? ""}
              queueId={filters.queueId ?? ""}
              onChange={onChange}
            />
            <Select
              label="Rendezés"
              value={filters.sort ?? "score"}
              onChange={(sort) => onChange({ sort })}
              options={[
                { value: "score", label: "Illeszkedés (legjobb elöl)" },
                { value: "default", label: "Forrás + cég" },
                { value: "newest", label: "Legújabb elöl" },
                { value: "searched", label: "Legutóbb keresett e-mail" },
                { value: "oldest", label: "Legrégebbi elöl" },
                { value: "company", label: "Cég A→Z" },
                { value: "company-desc", label: "Cég Z→A" },
                { value: "person", label: "Név A→Z" },
                { value: "status", label: "Státusz (nyitott elöl)" },
                { value: "email", label: "E-mailesek elöl" },
                { value: "updated", label: "Legutóbb módosítva" },
              ]}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
