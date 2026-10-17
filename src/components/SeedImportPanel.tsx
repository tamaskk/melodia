"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { COUNTRIES } from "@/lib/countries";
import { SEEDTABLE_MARKETS } from "@/lib/seedtableMarkets";
import Combobox, { type ComboOption } from "./Combobox";
import { button, field } from "./ui";

type Filters = Record<string, string | string[]>;

interface ResultRow {
  seedtableId: string;
  company: string;
  country: string;
  city: string | null;
  website: string | null;
  industry: string | null;
  employees: number | null;
  stage: string | null;
  score: number | null;
  status: "uj" | "mar-bent" | "hibas";
  detail: string | null;
  person: string | null;
  email: string | null;
}

interface Result {
  apply: boolean;
  available: number;
  offset: number;
  nextOffset: number | null;
  fetched: number;
  fresh: number;
  known: number;
  invalid: number;
  saved: number;
  withEmail: number;
  calls: number;
  peopleCalls: number;
  rateLimit: { limit: number | null; remaining: number | null };
  rows: ResultRow[];
}

const STAGES: [string, string][] = [
  ["pre_seed", "Pre-seed"],
  ["seed", "Seed"],
  ["series_a", "Series A"],
  ["series_b", "Series B"],
  ["series_c", "Series C"],
  ["series_d", "Series D"],
  ["series_e", "Series E"],
  ["growth", "Growth"],
  ["debt", "Hitel"],
  ["grant", "Támogatás"],
  ["ipo", "IPO"],
  ["acquired", "Felvásárolt"],
  ["other", "Egyéb"],
];

const ROLES: [string, string][] = [
  ["founder", "Alapító"],
  ["ceo", "CEO"],
  ["cto", "CTO"],
  ["coo", "COO"],
  ["cpo", "CPO"],
  ["vp_engineering", "VP Engineering"],
  ["head_of_product", "Head of Product"],
  ["director", "Igazgató"],
  ["manager", "Menedzser"],
  ["executive", "Vezető"],
];

const CONTINENTS = [
  "Europe",
  "North America",
  "South America",
  "Asia",
  "Africa",
  "Oceania",
];

const SORTS: [string, string][] = [
  ["", "alapértelmezett"],
  ["score", "Seedtable-pont"],
  ["employeeCount", "létszám"],
  ["totalFunding", "bevont tőke"],
  ["foundedYear", "alapítás éve"],
  ["createdAt", "felvétel ideje"],
  ["updatedAt", "utolsó frissítés"],
  ["name", "név"],
];

/** Angol név → magyar név, hogy a legördülőben „német”-re is előjöjjön. */
const HU_NAMES = new Map(
  Object.values(COUNTRIES).map((info) => [info.en.toLowerCase(), info.hu]),
);

/**
 * A Seedtable piacai, a Seedtable sorrendjében: zászló, név, követett cégek,
 * bevont tőke és pont. A szűrő az angol nevet küldi.
 */
const MARKET_OPTIONS: ComboOption[] = SEEDTABLE_MARKETS.map((market) => ({
  value: market.name,
  label: [
    `${market.flag} ${market.name}`,
    market.companies !== null
      ? `${market.companies.toLocaleString("hu-HU")} cég`
      : null,
    market.funding,
    market.score !== null
      ? `pont ${market.score}${market.small ? " (kevés adat)" : ""}`
      : null,
  ]
    .filter(Boolean)
    .join(" · "),
  keywords: HU_NAMES.get(market.name.toLowerCase()) ?? "",
}));

/** Az automatikus import összesítője, adagról adagra. */
interface AutoRun {
  from: number;
  /** Ahol most tart (a következő adag kezdete). */
  at: number;
  available: number;
  batches: number;
  saved: number;
  known: number;
  /** Az import-ellenőrzésen elbukott sorok (nem kerültek be). */
  invalid: number;
  withEmail: number;
  calls: number;
  done: boolean;
  /** Ha megállt: miért (leállítva, hiba). */
  note: string | null;
  /** Minden ország importjánál: melyik országnál tart. */
  country?: { flag: string; name: string; index: number; count: number };
}

const EMPTY_RUN: AutoRun = {
  from: 0,
  at: 0,
  available: 0,
  batches: 0,
  saved: 0,
  known: 0,
  invalid: 0,
  withEmail: 0,
  calls: 0,
  done: false,
  note: null,
};

/** A „Minden ország” futás állása — ugyanazokkal a szűrőkkel innen folytatható. */
interface AllProgress {
  signature: string;
  index: number;
  offset: number;
}

const ALL_PROGRESS_KEY = "melodia.seedtable.allProgress";

function readAllProgress(): AllProgress | null {
  try {
    const raw = window.localStorage.getItem(ALL_PROGRESS_KEY);
    return raw ? (JSON.parse(raw) as AllProgress) : null;
  } catch {
    return null;
  }
}

function writeAllProgress(progress: AllProgress | null): void {
  try {
    if (progress) {
      window.localStorage.setItem(ALL_PROGRESS_KEY, JSON.stringify(progress));
    } else {
      window.localStorage.removeItem(ALL_PROGRESS_KEY);
    }
  } catch {
    // Privát ablakban nincs tároló — a futás attól még megy, csak nem folytatható.
  }
}

/** Ennyiszer próbálja újra ugyanazt az adagot átmeneti hibánál (429, 5xx, hálózat). */
const AUTO_RETRIES = 3;

class RequestError extends Error {
  constructor(
    message: string,
    /** 0: hálózati hiba, nem jött válasz. */
    readonly status: number,
  ) {
    super(message);
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const STATUS_LABEL: Record<ResultRow["status"], string> = {
  uj: "új",
  "mar-bent": "már bent",
  hibas: "hibás",
};

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <legend className="px-1 text-xs uppercase tracking-wider text-[var(--muted)]">
        {title}
      </legend>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </fieldset>
  );
}

/**
 * Cégek importja a Seedtable API-ból: minden szűrő, amit a `/companies` ismer,
 * plusz opcionális döntéshozó-keresés e-mail címért. Előbb előnézet (csak
 * lekérés és egyeztetés), utána mentés — csak az kerül be, ami még nincs bent.
 */
export default function SeedImportPanel() {
  const [ready, setReady] = useState<boolean | null>(null);
  const [maxCompanies, setMaxCompanies] = useState(500);
  const [filters, setFilters] = useState<Filters>({ sort_order: "desc" });
  const [max, setMax] = useState("50");
  const [offset, setOffset] = useState("0");
  const [peopleOn, setPeopleOn] = useState(false);
  const [roles, setRoles] = useState<string[]>(["founder", "ceo", "cto"]);
  const [decisionMakers, setDecisionMakers] = useState(true);
  const [allowLow, setAllowLow] = useState(false);
  const [busy, setBusy] = useState<"preview" | "apply" | "auto" | "all" | null>(
    null,
  );
  const [savedAll, setSavedAll] = useState<AllProgress | null>(null);
  // Adagonként hívódik a futó automatikus importból (kezdőpont, mentett állás).
  const onBatchRef = useRef<((state: AutoRun) => void) | null>(null);
  const [auto, setAuto] = useState<AutoRun | null>(null);
  // Leállítás: a futó adag még befejeződik, utána nem indul új.
  const stopRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [onlyNew, setOnlyNew] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/seedtable", { signal: controller.signal })
      .then((response) => response.json())
      .then((data: { ready: boolean; maxCompanies: number }) => {
        setReady(data.ready);
        setMaxCompanies(data.maxCompanies);
        setSavedAll(readAllProgress());
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  const text = (name: string) => (filters[name] as string | undefined) ?? "";
  // Más szűrő más listát ad: a folytatás onnantól az elejéről indul.
  const set = (name: string) => (value: string | string[]) => {
    setFilters((current) => ({ ...current, [name]: value }));
    setOffset("0");
  };
  const toggle = (list: string[], value: string) =>
    list.includes(value)
      ? list.filter((item) => item !== value)
      : [...list, value];

  const input = (
    name: string,
    label: string,
    options: { type?: string; placeholder?: string; list?: string } = {},
  ) => (
    <label className="block space-y-1">
      <span className="text-[11px] text-[var(--muted)]">{label}</span>
      <input
        type={options.type ?? "text"}
        value={text(name)}
        list={options.list}
        placeholder={options.placeholder}
        onChange={(event) => set(name)(event.target.value)}
        className={`${field("sm")} w-full`}
      />
    </label>
  );

  /** Igen / nem / mindegy — a Seedtable logikai szűrőihez. */
  const triState = (name: string, label: string) => (
    <label className="block space-y-1">
      <span className="text-[11px] text-[var(--muted)]">{label}</span>
      <select
        value={text(name)}
        onChange={(event) => set(name)(event.target.value)}
        className={`${field("sm")} w-full`}
      >
        <option value="">mindegy</option>
        <option value="true">igen</option>
        <option value="false">nem</option>
      </select>
    </label>
  );

  /** Egy adag a szerver felé; hiba esetén a státuszt is visszaadja. */
  const post = async (
    apply: boolean,
    from: number,
    useFilters: Filters,
    count = Number(max),
  ): Promise<Result> => {
    let response: Response;
    try {
      response = await fetch("/api/seedtable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filters: useFilters,
          max: count,
          offset: from,
          people: {
            enabled: peopleOn,
            roles,
            decisionMakersOnly: decisionMakers,
            allowLowConfidence: allowLow,
          },
          apply,
        }),
      });
    } catch (caught) {
      throw new RequestError((caught as Error).message, 0);
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new RequestError(data.error ?? "Seedtable-hiba", response.status);
    }
    return data as Result;
  };

  /**
   * Egy lista végigmentése adagról adagra, amíg el nem fogy vagy le nem
   * állítod. Átmeneti hibánál (429, 5xx, hálózat) vár és újrapróbálja; végleges
   * hibánál dob. A `state` összesítőt adagonként frissíti és visszaadja.
   */
  const importList = async (
    useFilters: Filters,
    start: number,
    initial: AutoRun,
    count = Number(max),
  ): Promise<AutoRun> => {
    let state: AutoRun = { ...initial, at: start, done: false };
    let from = start;
    while (!stopRef.current) {
      let data: Result | null = null;
      for (let attempt = 0; !data; attempt++) {
        try {
          data = await post(true, from, useFilters, count);
        } catch (caught) {
          const status = (caught as RequestError).status ?? 500;
          const transient = status === 0 || status === 429 || status >= 500;
          if (!transient || attempt >= AUTO_RETRIES || stopRef.current) {
            throw Object.assign(caught as Error, { state });
          }
          state = {
            ...state,
            note: `Átmeneti hiba (${(caught as Error).message}) — ${30 * (attempt + 1)} mp múlva újrapróbálom.`,
          };
          setAuto(state);
          await sleep(30_000 * (attempt + 1));
        }
      }

      state = {
        ...state,
        at: data.nextOffset ?? data.offset + data.fetched,
        available: data.available,
        batches: state.batches + 1,
        saved: state.saved + data.saved,
        known: state.known + data.known,
        invalid: state.invalid + data.invalid,
        withEmail: state.withEmail + data.withEmail,
        calls: state.calls + data.calls,
        done: data.nextOffset === null,
        note: null,
      };
      setAuto(state);
      setResult(data);
      onBatchRef.current?.(state);
      if (data.nextOffset === null) break;
      from = data.nextOffset;
    }
    return state;
  };

  /** Rendezés nélkül a felvétel ideje szerint növekvő: így nem tolódik el a lista. */
  const stable = (base: Filters): Filters =>
    base.sort_by ? base : { ...base, sort_by: "createdAt", sort_order: "asc" };

  /**
   * Automatikus import: a mostani szűrő teljes listája, a kezdőpont mezőtől a
   * végéig.
   */
  const runAuto = async () => {
    const count = Number(max);
    const from = Number(offset) || 0;
    const useFilters = from === 0 ? stable(filters) : filters;
    if (useFilters !== filters) setFilters(useFilters);
    const total = result?.available;
    const batches = total ? Math.ceil(Math.max(0, total - from) / count) : null;
    if (
      !window.confirm(
        [
          `Automatikus import a(z) ${from + 1}. találattól${total ? ` a lista végéig (${total} cég, kb. ${batches} adag × ${Math.ceil(count / 100)} hívás)` : " a lista végéig"}.`,
          peopleOn
            ? "A döntéshozó-keresés minden új cégnél +1 hívás — nagy listánál ez sok."
            : null,
          "Az oldalt hagyd nyitva, amíg fut; bármikor leállíthatod, és a mezőben maradt kezdőponttól folytatható.",
          "Mehet?",
        ]
          .filter(Boolean)
          .join("\n\n"),
      )
    ) {
      return;
    }

    stopRef.current = false;
    onBatchRef.current = (state) => setOffset(String(state.at));
    setBusy("auto");
    setError(null);
    const initial = { ...EMPTY_RUN, from, at: from, available: total ?? 0 };
    setAuto(initial);
    try {
      const state = await importList(useFilters, from, initial);
      if (stopRef.current && !state.done) {
        setAuto({
          ...state,
          note: `Leállítva a(z) ${state.at}. találatnál — az „Automatikus import” innen folytatja.`,
        });
      }
    } catch (caught) {
      const state = (caught as { state?: AutoRun }).state ?? initial;
      setAuto({
        ...state,
        note: `Megállt: ${(caught as Error).message} A(z) ${state.at + 1}. találattól folytatható.`,
      });
      setError((caught as Error).message);
    } finally {
      onBatchRef.current = null;
      setBusy(null);
    }
  };

  /**
   * Minden ország importja: a Seedtable piacain sorban végigmegy (a központ
   * országa szerint), mindegyiket a végéig menti. A többi szűrő érvényes marad;
   * az ország-szűrőket ez a futás állítja. Hol tart, azt a böngésző megjegyzi,
   * így leállítás vagy bezárás után onnan folytatható.
   */
  const runAll = async (restart = false) => {
    const { country: _country, hq_country: _hq, ...rest } = filters;
    void _country;
    void _hq;
    const base = stable(rest);
    const signature = JSON.stringify(base);
    const saved = restart ? null : readAllProgress();
    const resume = saved && saved.signature === signature ? saved : null;
    const startIndex = resume?.index ?? 0;
    const remaining = SEEDTABLE_MARKETS.slice(startIndex).reduce(
      (sum, market) => sum + (market.companies ?? 0),
      0,
    );
    if (
      !window.confirm(
        [
          resume
            ? `Folytatás: ${SEEDTABLE_MARKETS[startIndex].flag} ${SEEDTABLE_MARKETS[startIndex].name}, ${resume.offset + 1}. találattól (${startIndex + 1}/${SEEDTABLE_MARKETS.length}. ország).`
            : `Minden ország importja: ${SEEDTABLE_MARKETS.length} ország sorban, mindegyik a végéig.`,
          `Hátra van kb. ${remaining.toLocaleString("hu-HU")} cég — kb. ${Math.ceil(remaining / 100)} hívás, ${maxCompanies}-es adagokban. Csak az új cégek kerülnek be.`,
          peopleOn
            ? "FIGYELEM: be van kapcsolva a döntéshozó-keresés — ez minden új cégnél +1 hívás, itt több tízezer."
            : null,
          Object.keys(rest).some(
            (key) => !["sort_by", "sort_order"].includes(key),
          )
            ? "A többi beállított szűrő minden országra érvényes."
            : null,
          "Az oldalt hagyd nyitva; bármikor leállíthatod, és később innen folytatható.",
          "Mehet?",
        ]
          .filter(Boolean)
          .join("\n\n"),
      )
    ) {
      return;
    }

    stopRef.current = false;
    setBusy("all");
    setError(null);
    let state: AutoRun = { ...EMPTY_RUN };
    try {
      for (
        let index = startIndex;
        index < SEEDTABLE_MARKETS.length && !stopRef.current;
        index++
      ) {
        const market = SEEDTABLE_MARKETS[index];
        const start = index === startIndex ? (resume?.offset ?? 0) : 0;
        state = {
          ...state,
          from: start,
          at: start,
          available: market.companies ?? 0,
          country: {
            flag: market.flag,
            name: market.name,
            index,
            count: SEEDTABLE_MARKETS.length,
          },
        };
        setAuto(state);
        onBatchRef.current = (current) =>
          writeAllProgress({
            signature,
            index: current.done ? index + 1 : index,
            offset: current.done ? 0 : current.at,
          });
        // Mindig a legnagyobb adag: egy hívás úgyis egy egész, 100-as oldal.
        state = await importList(
          { ...base, hq_country: market.name },
          start,
          state,
          maxCompanies,
        );
        writeAllProgress({
          signature,
          index: state.done ? index + 1 : index,
          offset: state.done ? 0 : state.at,
        });
      }
      if (stopRef.current) {
        setAuto({
          ...state,
          done: false,
          note: state.done
            ? `Leállítva — ${state.country?.name} kész, a „Minden ország” a következő országgal folytatja.`
            : `Leállítva: ${state.country?.name}, ${state.at}. találat — a „Minden ország” innen folytatja.`,
        });
      } else {
        writeAllProgress(null);
        setAuto({
          ...state,
          done: true,
          note: "Minden ország kész.",
        });
      }
      setSavedAll(readAllProgress());
    } catch (caught) {
      const failed = (caught as { state?: AutoRun }).state ?? state;
      setAuto({
        ...failed,
        note: `Megállt: ${(caught as Error).message} A „Minden ország” innen folytatja (${failed.country?.name}, ${failed.at + 1}. találat).`,
      });
      setError((caught as Error).message);
      setSavedAll(readAllProgress());
    } finally {
      onBatchRef.current = null;
      setBusy(null);
    }
  };

  /** `from`: a kezdő találat; alapból a mezőben megadott. */
  const run = async (apply: boolean, from = Number(offset) || 0) => {
    const count = Number(max);
    if (apply) {
      const people = peopleOn
        ? ` + legfeljebb ${result?.fresh ?? count} hívás a döntéshozókra`
        : "";
      if (
        !window.confirm(
          `Mentés: lekéri a(z) ${from + 1}.–${from + count}. találatot (${Math.ceil(count / 100)} hívás${people}), és elmenti azokat, amik még nincsenek bent. Mehet?`,
        )
      ) {
        return;
      }
    }
    setBusy(apply ? "apply" : "preview");
    setError(null);
    try {
      setResult(await post(apply, from, filters));
      setOffset(String(from));
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const stages = (filters.funding_stage as string[] | undefined) ?? [];
  const rows = (result?.rows ?? []).filter(
    (row) => !onlyNew || row.status === "uj",
  );

  return (
    <div className="mx-auto w-full max-w-[1200px] space-y-5 p-4 sm:p-6">
      <header>
        <h1 className="text-2xl font-semibold">Seedtable import</h1>
        <p className="max-w-3xl text-sm text-[var(--muted)]">
          Cégek a Seedtable adatbázisából. Állítsd be a szűrőket, nézd meg az
          előnézetet — ott látszik, mi van már bent —, aztán mentsd el. Csak az
          kerül be, ami még nincs a listában; a meglévő sorokhoz nem nyúl.
        </p>
        <p className="mt-2 max-w-3xl text-sm">
          <b>Kötelező csak a cégek száma</b> (lent, „Rendezés és mennyiség”).
          Minden szűrő opcionális — üresen a Seedtable teljes startup-listájának
          eleje jön, bármelyik országból, ezért legalább egy országot érdemes
          megadni.
        </p>
      </header>

      {ready === false ? (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200">
          Nincs beállítva a SEEDTABLE_API_KEY. Tedd be az
          atlas-credentials.env-be, és indítsd újra a szervert.
        </p>
      ) : null}

      <datalist id="seed-continents">
        {CONTINENTS.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>

      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void run(false);
        }}
      >
        <Section title="Keresés">
          {input("q", "Szabad szavas keresés", {
            placeholder: "pl. payments, devtools",
          })}
          <label className="block space-y-1">
            <span className="text-[11px] text-[var(--muted)]">Kör</span>
            <select
              value={text("include")}
              onChange={(event) => set("include")(event.target.value)}
              className={`${field("sm")} w-full`}
            >
              <option value="">csak startupok</option>
              <option value="all">
                minden cég (befektetők, nagyvállalatok is)
              </option>
            </select>
          </label>
        </Section>

        <Section title="Hely">
          <Combobox
            label="Ország (a cég adatlapján)"
            value={text("country")}
            onChange={set("country")}
            options={MARKET_OPTIONS}
            emptyLabel="Bármelyik ország"
            placeholder="Írj rá: német, Germany…"
          />
          <Combobox
            label="Központ országa"
            value={text("hq_country")}
            onChange={set("hq_country")}
            options={MARKET_OPTIONS}
            emptyLabel="Bármelyik ország"
            placeholder="Írj rá: magyar, Hungary…"
          />
          {input("hq_continent", "Központ kontinense", {
            list: "seed-continents",
          })}
          {input("hq_region", "Központ régiója / állama", {
            placeholder: "Bavaria, California",
          })}
          {input("hq_city", "Központ városa (pontos)", {
            placeholder: "Berlin",
          })}
          {input("city", "Város (részleges egyezés)")}
        </Section>

        <Section title="Iparág és technológia">
          {input("industry", "Iparág (részleges egyezés)", {
            placeholder: "Software, Fintech",
          })}
          {input("category", "Seedtable-kategória (slug vagy útvonal)", {
            placeholder: "financial-services/fintech",
          })}
          {input("uses_technology", "Használt technológia (slug)", {
            placeholder: "react, kubernetes",
          })}
          {input("uses_supplier", "Szállítója (cég slug)")}
          {input("uses_product", "Használt termék (slug)")}
        </Section>

        <fieldset className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <legend className="px-1 text-xs uppercase tracking-wider text-[var(--muted)]">
            Finanszírozás
          </legend>
          <div className="flex flex-wrap gap-2">
            {STAGES.map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={stages.includes(value)}
                onClick={() => set("funding_stage")(toggle(stages, value))}
                className={`h-7 rounded-full border px-3 text-xs transition ${
                  stages.includes(value)
                    ? "border-blue-500 bg-blue-500/15 text-blue-200"
                    : "border-[var(--border)] text-[var(--muted)] hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {input("min_raised", "Bevont tőke legalább (USD)", {
              type: "number",
            })}
            {input("max_raised", "Bevont tőke legfeljebb (USD)", {
              type: "number",
            })}
            {input("raised_within", "Utolsó kör az elmúlt N hónapban", {
              type: "number",
            })}
            {input("raised_after", "Utolsó kör ettől", { type: "date" })}
            {input("raised_before", "Utolsó kör eddig", { type: "date" })}
            {triState("bootstrapped", "Saját forrásból (nincs befektető)")}
          </div>
        </fieldset>

        <Section title="Méret, pontszám, jelek">
          {input("min_employees", "Létszám legalább", { type: "number" })}
          {input("max_employees", "Létszám legfeljebb", { type: "number" })}
          {input("min_score", "Seedtable-pont legalább (0–100)", {
            type: "number",
          })}
          {input("max_score", "Seedtable-pont legfeljebb", { type: "number" })}
          {triState("likely_to_hire", "Valószínűleg vesz fel")}
          {triState("likely_to_outsource", "Valószínűleg kiszervez")}
        </Section>

        <Section title="Rendezés és mennyiség">
          <label className="block space-y-1">
            <span className="text-[11px] text-[var(--muted)]">Rendezés</span>
            <select
              value={text("sort_by")}
              onChange={(event) => set("sort_by")(event.target.value)}
              className={`${field("sm")} w-full`}
            >
              {SORTS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-[11px] text-[var(--muted)]">Irány</span>
            <select
              value={text("sort_order")}
              onChange={(event) => set("sort_order")(event.target.value)}
              className={`${field("sm")} w-full`}
            >
              <option value="desc">csökkenő</option>
              <option value="asc">növekvő</option>
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-[11px] text-[var(--muted)]">
              Hány céget kérjen le (max. {maxCompanies}){" "}
              <span className="text-red-300">* kötelező</span>
            </span>
            <input
              type="number"
              min={1}
              max={maxCompanies}
              required
              value={max}
              onChange={(event) => setMax(event.target.value)}
              className={`${field("sm")} w-full`}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[11px] text-[var(--muted)]">
              Kezdés ennyi találat átugrásával (0 = az elejéről)
            </span>
            <input
              type="number"
              min={0}
              step={1}
              value={offset}
              onChange={(event) => setOffset(event.target.value)}
              className={`${field("sm")} w-full`}
            />
          </label>
        </Section>

        <fieldset className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <legend className="px-1 text-xs uppercase tracking-wider text-[var(--muted)]">
            Kapcsolattartó
          </legend>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={peopleOn}
              onChange={(event) => setPeopleOn(event.target.checked)}
            />
            Az új cégekhez keressen döntéshozót e-mail címmel (mentéskor,
            cégenként egy API-hívás)
          </label>
          {peopleOn ? (
            <>
              <div className="flex flex-wrap gap-2">
                {ROLES.map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={roles.includes(value)}
                    onClick={() =>
                      setRoles((current) => toggle(current, value))
                    }
                    className={`h-7 rounded-full border px-3 text-xs transition ${
                      roles.includes(value)
                        ? "border-blue-500 bg-blue-500/15 text-blue-200"
                        : "border-[var(--border)] text-[var(--muted)] hover:text-foreground"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={decisionMakers}
                  onChange={(event) => setDecisionMakers(event.target.checked)}
                />
                Csak döntéshozók
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={allowLow}
                  onChange={(event) => setAllowLow(event.target.checked)}
                />
                Gyenge bizonyosságú, kikövetkeztetett címet is elfogad
                <span className="text-xs text-[var(--muted)]">
                  (visszapattantként jelzettet soha)
                </span>
              </label>
            </>
          ) : null}
        </fieldset>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={busy !== null || ready === false}
            className={button("secondary", "md")}
          >
            {busy === "preview" ? "Lekérés…" : "Előnézet"}
          </button>
          <button
            type="button"
            disabled={busy !== null || ready === false || !result}
            onClick={() => void run(true)}
            title={
              result ? undefined : "Előbb nézd meg az előnézetet a szűrőkkel"
            }
            className={button("primary", "md")}
          >
            {busy === "apply" ? "Mentés…" : "Új cégek mentése"}
          </button>
          {busy === "auto" || busy === "all" ? (
            <button
              type="button"
              onClick={() => {
                stopRef.current = true;
              }}
              className={button("secondary", "md")}
            >
              Leállítás
            </button>
          ) : (
            <>
              <button
                type="button"
                disabled={busy !== null || ready === false}
                onClick={() => void runAuto()}
                title="Adagról adagra elmenti a szűrő teljes listáját, amíg el nem fogy"
                className={button("secondary", "md")}
              >
                Automatikus import a lista végéig
              </button>
              <button
                type="button"
                disabled={busy !== null || ready === false}
                onClick={() => void runAll()}
                title="Sorban végigmegy a Seedtable összes országán, és mindegyiket a végéig importálja"
                className={button("secondary", "md")}
              >
                {savedAll
                  ? `Minden ország — folytatás (${SEEDTABLE_MARKETS[savedAll.index]?.flag ?? ""} ${SEEDTABLE_MARKETS[savedAll.index]?.name ?? ""})`
                  : "Minden ország importja"}
              </button>
              {savedAll ? (
                <button
                  type="button"
                  disabled={busy !== null || ready === false}
                  onClick={() => void runAll(true)}
                  className={button("ghost", "md")}
                >
                  elölről
                </button>
              ) : null}
            </>
          )}
          <span className="text-xs text-[var(--muted)]">
            Az előnézet csak lekér és egyeztet, nem ment. Minden lekérés a
            Seedtable havi keretéből megy.
          </span>
        </div>
      </form>

      {auto ? (
        <section
          role="status"
          className={`space-y-2 rounded-lg border p-3 text-sm ${
            auto.done
              ? "border-emerald-500/40 bg-emerald-500/10"
              : "border-blue-500/40 bg-blue-500/10"
          }`}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <b>
              {auto.country ? (
                <>
                  {auto.country.flag} {auto.country.name}{" "}
                  <span className="font-normal text-[var(--muted)]">
                    · {auto.country.index + 1}/{auto.country.count}. ország
                    {busy === "all" ? " — fut…" : auto.done ? " — kész" : ""}
                  </span>
                </>
              ) : auto.done ? (
                "Automatikus import kész — a lista végére ért."
              ) : busy === "auto" ? (
                "Automatikus import fut…"
              ) : (
                "Automatikus import megállt."
              )}
            </b>
            <span className="tabular-nums text-xs text-[var(--muted)]">
              {auto.at.toLocaleString("hu-HU")} /{" "}
              {auto.available ? auto.available.toLocaleString("hu-HU") : "?"}{" "}
              találat
              {auto.available
                ? ` · ${Math.min(100, Math.round((auto.at / auto.available) * 100))}%`
                : ""}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-2)]">
            <div
              className="h-full bg-blue-500 transition-all"
              style={{
                width: `${auto.available ? Math.min(100, (auto.at / auto.available) * 100) : 0}%`,
              }}
            />
          </div>
          <p className="text-xs">
            {auto.batches} adag · <b>{auto.saved.toLocaleString("hu-HU")}</b> új
            cég mentve
            {auto.withEmail ? ` (${auto.withEmail} e-mail címmel)` : ""} ·{" "}
            {auto.known.toLocaleString("hu-HU")} már bent volt
            {auto.invalid
              ? ` · ${auto.invalid.toLocaleString("hu-HU")} hibás (nem került be)`
              : ""}{" "}
            · {auto.calls} API-hívás
          </p>
          {auto.note ? (
            <p className="text-xs text-amber-200">{auto.note}</p>
          ) : null}
        </section>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300"
        >
          {error}
        </p>
      ) : null}

      {result ? (
        <section className="space-y-3">
          <div
            role="status"
            className={`rounded-lg border p-3 text-sm ${
              result.apply
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                : "border-[var(--border)] bg-[var(--surface)]"
            }`}
          >
            {result.apply ? (
              <>
                <b>{result.saved}</b> új cég elmentve
                {result.withEmail
                  ? `, ebből ${result.withEmail} e-mail címmel`
                  : ""}
                .{" "}
                <Link href="/" className="underline">
                  Kontaktok
                </Link>
              </>
            ) : (
              <>
                Előnézet: <b>{result.fresh}</b> új, <b>{result.known}</b> már
                bent
                {result.invalid ? `, ${result.invalid} hibás` : ""}.
                {result.peopleCalls
                  ? ` Mentéskor a döntéshozó-keresés kb. ${result.peopleCalls} további hívás.`
                  : ""}
              </>
            )}
            <span className="mt-1 block text-xs text-[var(--muted)]">
              {result.fetched
                ? `${result.offset + 1}–${result.offset + result.fetched}. találat`
                : "nincs több találat"}{" "}
              a szűrőnek megfelelő {result.available} cégből · {result.calls}{" "}
              API-hívás
              {result.rateLimit.remaining !== null
                ? ` · percenkénti keretből maradt: ${result.rateLimit.remaining}/${result.rateLimit.limit}`
                : ""}
            </span>
          </div>

          {result.nextOffset !== null ? (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 text-sm">
              <span>
                Még {result.available - result.nextOffset} cég van hátra (
                {result.nextOffset + 1}. találattól).
              </span>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void run(false, result.nextOffset ?? 0)}
                className={button("secondary")}
              >
                Következő {max} előnézete
              </button>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void run(true, result.nextOffset ?? 0)}
                className={button("primary")}
              >
                Következő {max} mentése
              </button>
            </div>
          ) : result.fetched ? (
            <p className="text-xs text-[var(--muted)]">
              A szűrőnek megfelelő lista végére értél.
            </p>
          ) : null}

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={onlyNew}
              onChange={(event) => setOnlyNew(event.target.checked)}
            />
            Csak az újak
          </label>

          <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="text-[11px] uppercase tracking-wider text-[var(--muted)]">
                <tr className="border-b border-[var(--border)]">
                  <th className="px-3 py-2 font-medium">Cég</th>
                  <th className="px-3 py-2 font-medium">Hely</th>
                  <th className="px-3 py-2 font-medium">Iparág · stádium</th>
                  <th className="px-3 py-2 font-medium">Fő · pont</th>
                  <th className="px-3 py-2 font-medium">Állapot</th>
                  <th className="px-3 py-2 font-medium">Kapcsolattartó</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.seedtableId}
                    className="border-b border-[var(--border)] last:border-0"
                  >
                    <td className="px-3 py-2">
                      {row.company}
                      {row.website ? (
                        <a
                          href={row.website}
                          target="_blank"
                          rel="noreferrer"
                          className="block text-xs text-blue-300 hover:underline"
                        >
                          {row.website.replace(/^https?:\/\//, "")}
                        </a>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {COUNTRIES[row.country]?.flag ?? ""}{" "}
                      {COUNTRIES[row.country]?.hu ?? row.country}
                      {row.city ? ` · ${row.city}` : ""}
                    </td>
                    <td className="px-3 py-2 text-xs text-[var(--muted)]">
                      {[row.industry, row.stage].filter(Boolean).join(" · ") ||
                        "—"}
                    </td>
                    <td className="px-3 py-2 text-xs tabular-nums text-[var(--muted)]">
                      {row.employees ?? "—"} · {row.score ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      <span
                        className={
                          row.status === "uj"
                            ? "text-emerald-300"
                            : row.status === "hibas"
                              ? "text-red-300"
                              : "text-[var(--muted)]"
                        }
                      >
                        {STATUS_LABEL[row.status]}
                      </span>
                      {row.detail ? (
                        <span className="block text-[11px] text-[var(--muted)]">
                          {row.detail}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {row.person ? (
                        <>
                          {row.person}
                          <span className="block font-mono text-[11px] text-[var(--muted)]">
                            {row.email}
                          </span>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
                {!rows.length ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-3 py-8 text-center text-[var(--muted)]"
                    >
                      Nincs megjeleníthető cég.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
