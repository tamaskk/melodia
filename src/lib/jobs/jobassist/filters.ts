/**
 * A JobAssist szűrő-lehetőségei — ÉLŐBEN MÉRVE (2026-09-07).
 *
 * Csak azok a szűrők, amiket az API ténylegesen honorál (a `total` változik,
 * és az `appliedFilters` visszaigazolja). A pontos értékkészleteket is mértem.
 */

export interface FilterOption {
  value: string;
  label: string;
}

/* ------------------------------------------------------- workplace / munkaidő */

/** workType — hol végzed a munkát. Több is választható. (A locationGroups-ba megy.) */
export const WORK_TYPES: FilterOption[] = [
  { value: "on-site", label: "Iroda" },
  { value: "hybrid", label: "Hibrid" },
  { value: "remote", label: "Remote" },
];

/** workArrangement — milyen munkaidőben. Több is választható. */
export const WORK_ARRANGEMENTS: FilterOption[] = [
  { value: "full-time", label: "Teljes munkaidő" },
  { value: "part-time", label: "Részmunkaidő" },
  { value: "temporary", label: "Ideiglenes" },
];

/* -------------------------------------------------------------- datePosted */

/**
 * Mikor jelent meg. EGY választható (radio).
 * Az üres = „bármikor" (a paramétert kihagyjuk). A `last-month` és az
 * `anytime` érték HTTP 400-at ad — ezért nincs köztük.
 */
export const DATE_POSTED: FilterOption[] = [
  { value: "", label: "Bármikor" },
  { value: "last-24h", label: "Elmúlt 24 óra" },
  { value: "last-3-days", label: "Elmúlt 3 nap" },
  { value: "last-week", label: "Elmúlt hét" },
  { value: "last-2-weeks", label: "Elmúlt 2 hét" },
];

/* -------------------------------------------------------------- fizetés */

/**
 * Fizetés-mód a UI-ban. Az API CSAK 'hourly'-t és 'annually'-t ismer
 * (a 'monthly'/'any' HTTP 400). A „Havi" ezért a szervernek ÉVESKÉNT megy ki,
 * havi × 12 szorzóval — a UI havit mutat, a szűrő éves.
 *   '' = Bármely (nincs fizetésszűrő)
 */
export const SALARY_MODES: FilterOption[] = [
  { value: "", label: "Bármely" },
  { value: "hourly", label: "Órabér" },
  { value: "monthly", label: "Havi" },
];

/** A csúszka tartománya módonként. */
export const SALARY_RANGE: Record<
  string,
  { min: number; max: number; step: number; suffix: string }
> = {
  hourly: { min: 0, max: 480, step: 5, suffix: "/ óra" },
  monthly: { min: 0, max: 1_000_000, step: 10_000, suffix: "/ hó" },
};

/* -------------------------------------------------------------- iparágak */

/**
 * companyIndustries — a slug az `&` előtti rész kisbetűsen, space→kötőjel
 * (mérve: "Real Estate" → real-estate, "Sales & BizDev" → sales). Több
 * választható, vesszővel elválasztva.
 */
export const INDUSTRIES: FilterOption[] = [
  { value: "it", label: "IT & Software" },
  { value: "healthcare", label: "Egészségügy" },
  { value: "finance", label: "Pénzügy & Biztosítás" },
  { value: "sales", label: "Sales & BizDev" },
  { value: "marketing", label: "Marketing & PR" },
  { value: "retail", label: "Retail & Nagyker" },
  { value: "education", label: "Oktatás" },
  { value: "hr", label: "HR & Toborzás" },
  { value: "hospitality", label: "Vendéglátás & Turizmus" },
  { value: "manufacturing", label: "Gyártás & Szakma" },
  { value: "logistics", label: "Logisztika & Szállítás" },
  { value: "entertainment", label: "Szórakoztatás & Média" },
  { value: "architecture", label: "Építészet & Építőipar" },
  { value: "real-estate", label: "Ingatlan" },
  { value: "government", label: "Közszféra" },
  { value: "energy", label: "Energia & Közmű" },
  { value: "home-services", label: "Otthoni szolgáltatások" },
  { value: "nonprofit", label: "Nonprofit" },
  { value: "environmental", label: "Környezetvédelem" },
  { value: "aerospace", label: "Repülés & Űr" },
  { value: "science", label: "Tudomány & K+F" },
  { value: "agriculture", label: "Mezőgazdaság & Halászat" },
  { value: "defense", label: "Védelem & Katonaság" },
  { value: "public-safety", label: "Közbiztonság" },
  { value: "private-security", label: "Magánbiztonság" },
  { value: "mining", label: "Bányászat" },
  { value: "sports", label: "Sport" },
];

/* -------------------------------------------------------------- helyek */

/**
 * Egy kiválasztott hely. A `/api/places` (Photon/OSM) autocomplete adja.
 * A `kind` dönti el, hova kerül a locationGroups JSON-ban: ország a
 * `countries`-ba (névvel), város a `cities`-be (`{name}` objektumként).
 */
export interface PlaceSuggestion {
  label: string;
  name: string;
  kind: "country" | "city";
  countryCode?: string;
}

/* -------------------------------------------------------------- rendezés */

export const SORT_OPTIONS: FilterOption[] = [
  { value: "best-match", label: "Legjobb egyezés" },
  { value: "recent", label: "Legfrissebb" },
];

/* --------------------------------------------------------- szűrő-állapot */

export interface SalaryRange {
  /** UI-mód: '' (bármely) | 'hourly' | 'monthly'. */
  mode: string;
  min: number;
  max: number;
}

export interface FilterState {
  exactTitles: string[];
  search: string;
  workTypes: string[];
  workArrangements: string[];
  /** Kiválasztott helyek — a /api/places autocomplete-ből. */
  locations: PlaceSuggestion[];
  datePosted: string;
  salary: SalaryRange;
  industries: string[];
  sortBy: string;
  autoRelax: boolean;
}

export const EMPTY_FILTERS: FilterState = {
  exactTitles: [],
  search: "",
  workTypes: [],
  workArrangements: [],
  locations: [],
  datePosted: "",
  salary: { mode: "", min: 0, max: 0 },
  industries: [],
  sortBy: "best-match",
  autoRelax: true,
};

/**
 * A szűrő-állapotból a proxy query-paraméterei.
 *
 * A workType ÉS a hely EGY locationGroups JSON-ba kerül — mérve ez a működő
 * alak: `[{workTypes:[…], countries:[…], cities:[{name}…]}]`.
 */
export function filtersToParams(f: FilterState, page: number): URLSearchParams {
  const p = new URLSearchParams({
    sortBy: f.sortBy,
    limit: "50",
    page: String(page),
  });
  // Az autoRelax egyetlen valid értéke '1' (a '0' HTTP 400), ÉS kiüti a
  // datePosted-et. Ezért csak akkor küldjük, ha a lazítás be van kapcsolva
  // ÉS nincs dátumszűrő — különben a dátum nem érvényesülne.
  if (f.autoRelax && !f.datePosted) p.set("autoRelax", "1");
  if (f.search.trim()) p.set("search", f.search.trim());
  if (f.exactTitles.length) p.set("exactTitles", f.exactTitles.join(","));
  if (f.workArrangements.length)
    p.set("workArrangement", f.workArrangements.join(","));
  if (f.datePosted) p.set("datePosted", f.datePosted);
  if (f.industries.length) p.set("companyIndustries", f.industries.join(","));

  // Fizetés: a „Bármely" (üres mód) nem küld szűrőt. A „Havi" ÉVESKÉNT megy
  // ki (havi × 12), mert az API monthly-t nem ismer.
  if (f.salary.mode) {
    const range = SALARY_RANGE[f.salary.mode];
    const atFullRange = f.salary.min <= range.min && f.salary.max >= range.max;
    if (!atFullRange && (f.salary.min > 0 || f.salary.max < range.max)) {
      if (f.salary.mode === "hourly") {
        p.set("salaryUnit", "hourly");
        if (f.salary.min > 0) p.set("minSalary", String(f.salary.min));
        if (f.salary.max < range.max) p.set("maxSalary", String(f.salary.max));
      } else {
        // Havi → éves: × 12.
        p.set("salaryUnit", "annually");
        if (f.salary.min > 0) p.set("minSalary", String(f.salary.min * 12));
        if (f.salary.max < range.max)
          p.set("maxSalary", String(f.salary.max * 12));
      }
    }
  }

  // locationGroups: a workType és a hely egy csoportban.
  const countries = f.locations
    .filter((l) => l.kind === "country")
    .map((l) => l.name);
  const cities = f.locations
    .filter((l) => l.kind === "city")
    .map((l) => ({ name: l.name }));
  if (f.workTypes.length || countries.length || cities.length) {
    const group: Record<string, unknown> = {};
    if (f.workTypes.length) group.workTypes = f.workTypes;
    if (countries.length) group.countries = countries;
    if (cities.length) group.cities = cities;
    p.set("locationGroups", JSON.stringify([group]));
  }
  return p;
}

export function activeFilterCount(f: FilterState): number {
  return (
    f.exactTitles.length +
    f.workTypes.length +
    f.workArrangements.length +
    f.locations.length +
    f.industries.length +
    (f.datePosted ? 1 : 0) +
    (f.salary.mode ? 1 : 0) +
    (f.search.trim() ? 1 : 0)
  );
}
