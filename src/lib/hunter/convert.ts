/**
 * Hunter.io CSV export → importálható lead JSON.
 *
 * A CLI-változat (`hunter-to-leads`) logikája, webes felületre kötve: a CSV-t a
 * meglévő RFC 4180 parser olvassa, az osztályozás és a levélszöveg innen jön.
 */
import { parseCsvTable } from "../csvImport";
import { classify } from "./classify";
import { buildLead } from "./compose";
import {
  COLUMN_ALIASES,
  PRIORITY_ORDER,
  type HunterRow,
  type Lead,
  type LeadReport,
  type Priority,
} from "./types";

const norm = (value: string): string => value.trim().toLowerCase().replace(/\s+/g, " ");

/** A nyers mátrixot HunterRow rekordokká alakítja a fejléc alapján. */
export function toHunterRows(matrix: string[][]): {
  rows: HunterRow[];
  unmapped: string[];
} {
  const [header, ...body] = matrix;
  if (!header) return { rows: [], unmapped: [] };

  const headerNorm = header.map(norm);
  const index: Partial<Record<keyof HunterRow, number>> = {};

  for (const [key, aliases] of Object.entries(COLUMN_ALIASES) as [
    keyof HunterRow,
    string[],
  ][]) {
    const at = headerNorm.findIndex((cell) => aliases.includes(cell));
    if (at >= 0) index[key] = at;
  }

  const mapped = new Set(Object.values(index));
  const unmapped = headerNorm.filter((_, at) => !mapped.has(at) && headerNorm[at]?.length);

  const pick = (cells: string[], key: keyof HunterRow): string => {
    const at = index[key];
    if (at === undefined) return "";
    return (cells[at] ?? "").trim();
  };

  const rows = body.map<HunterRow>((cells) => ({
    companyName: pick(cells, "companyName"),
    domain: pick(cells, "domain")
      .replace(/^https?:\/\//i, "")
      .replace(/^www\./i, "")
      .replace(/\/.*$/, "")
      .toLowerCase(),
    city: pick(cells, "city"),
    state: pick(cells, "state"),
    postalCode: pick(cells, "postalCode"),
    country: pick(cells, "country"),
    industry: pick(cells, "industry"),
    headcount: pick(cells, "headcount"),
    companyType: pick(cells, "companyType"),
    tags: pick(cells, "tags"),
    linkedin: pick(cells, "linkedin"),
    description: pick(cells, "description"),
  }));

  return { rows: rows.filter((row) => row.domain.length > 0), unmapped };
}

/** `domain,email` CSV vagy `{ "domain": "email" }` JSON → map. */
export function parseEmailMap(text: string): Map<string, string> {
  const map = new Map<string, string>();
  const trimmed = text.trim();
  if (!trimmed) return map;

  const clean = (domain: string) =>
    domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "");

  if (trimmed.startsWith("{")) {
    try {
      for (const [domain, email] of Object.entries(
        JSON.parse(trimmed) as Record<string, string>,
      )) {
        if (typeof email === "string" && email.includes("@")) {
          map.set(clean(domain), email.trim().toLowerCase());
        }
      }
    } catch {
      // hibás JSON: e-mail nélkül megyünk tovább
    }
    return map;
  }

  for (const cells of parseCsvTable(trimmed)) {
    const [domain, email] = cells;
    if (!domain || !email || !email.includes("@")) continue; // fejlécsor is ide esik
    map.set(clean(domain), email.trim().toLowerCase());
  }
  return map;
}

export interface ConvertOptions {
  /** Csak ezt a szintet vagy jobbat adja vissza. */
  minPriority?: Priority;
  /** Ismétlődő domain: alapból eldobjuk, itt megtartható és megjelölhető. */
  keepDuplicates?: boolean;
  /** `domain,email` CSV vagy JSON — a talált címek beemelése. */
  emails?: string;
}

export interface ConvertResult {
  reports: LeadReport[];
  leads: Lead[];
  unmapped: string[];
  stats: {
    rows: number;
    duplicates: number;
    output: number;
    withEmail: number;
    byPriority: Record<Priority, number>;
  };
}

export function convertCsv(csv: string, options: ConvertOptions = {}): ConvertResult {
  const { rows, unmapped } = toHunterRows(parseCsvTable(csv));
  const emailMap = parseEmailMap(options.emails ?? "");

  const seen = new Set<string>();
  const reports: LeadReport[] = [];
  let duplicates = 0;

  for (const row of rows) {
    const isDuplicate = seen.has(row.domain);
    if (isDuplicate) {
      duplicates += 1;
      if (!options.keepDuplicates) continue;
    }
    seen.add(row.domain);

    const classification = classify(row);
    let lead = buildLead(row, classification);

    const found = emailMap.get(row.domain);
    if (found) {
      lead = {
        ...lead,
        email: found,
        tags: [...new Set([...lead.tags, "van-email", "kutatott-email"])],
      };
    }
    if (isDuplicate) {
      lead = {
        ...lead,
        note: `DUPLIKÁTUM: ez a domain többször szerepel a bemenetben. ${lead.note}`,
      };
    }

    reports.push({
      lead,
      domain: row.domain,
      priority: classification.priority,
      score: classification.score,
      flags: classification.flags,
      duplicate: isDuplicate,
    });
  }

  let output = reports;
  if (options.minPriority) {
    const limit = PRIORITY_ORDER.indexOf(options.minPriority);
    output = output.filter(
      (report) => PRIORITY_ORDER.indexOf(report.priority) <= limit,
    );
  }

  output = [...output].sort((a, b) => {
    const byPriority =
      PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority);
    if (byPriority !== 0) return byPriority;
    const byEmail = Number(Boolean(b.lead.email)) - Number(Boolean(a.lead.email));
    if (byEmail !== 0) return byEmail;
    return a.lead.company.localeCompare(b.lead.company, "hu");
  });

  const byPriority = Object.fromEntries(
    PRIORITY_ORDER.map((priority) => [
      priority,
      output.filter((report) => report.priority === priority).length,
    ]),
  ) as Record<Priority, number>;

  return {
    reports: output,
    leads: output.map((report) => report.lead),
    unmapped,
    stats: {
      rows: rows.length,
      duplicates,
      output: output.length,
      withEmail: output.filter((report) => report.lead.email).length,
      byPriority,
    },
  };
}
