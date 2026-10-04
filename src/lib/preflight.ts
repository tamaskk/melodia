/**
 * Küldés előtti ellenőrzés: mi lehet baj egy címzettel, mielőtt kimegy a levél.
 *
 * Két szint:
 *   error — ilyen levél nem mehet ki (nincs szöveg, kitöltetlen {{mező}});
 *           a kiküldés ezeket kihagyja, az előnézet megmutatja.
 *   warn  — kimehet, de érdemes ránézni (általános postafiók, nyelvi eltérés,
 *           a cég domainjéről már visszapattant levél).
 *
 * Tiszta modul: az adatokat a hívó hozza (a Mongo-összegzésből).
 */
import { companyDomain } from "./recipients";

export type IssueLevel = "error" | "warn";

export interface PreflightRow {
  id: string;
  company: string;
  email: string;
  language: string;
  country: string;
  /** Kitöltetlen `{{…}}` a tárgyban vagy a szövegben. */
  hasPlaceholder: boolean;
  bodyLength: number;
  subjectLength: number;
}

export interface IssueInfo {
  key: string;
  level: IssueLevel;
  label: string;
  hint: string;
}

export const ISSUES: Record<string, IssueInfo> = {
  "no-letter": {
    key: "no-letter",
    level: "error",
    label: "nincs levélszöveg vagy tárgy",
    hint: "Generáld le a levelet a panelen, vagy töltsd ki kézzel.",
  },
  placeholder: {
    key: "placeholder",
    level: "error",
    label: "kitöltetlen {{mező}} a levélben",
    hint: "A tömeges sablon egy helyettesítőt üresen hagyott — javítsd a panelen.",
  },
  "bounced-domain": {
    key: "bounced-domain",
    level: "warn",
    label: "erről a domainről már visszapattant levél",
    hint: "Valószínűleg rossz vagy megszűnt a cím — keress másikat.",
  },
  generic: {
    key: "generic",
    level: "warn",
    label: "általános postafiók (info@, office@ …)",
    hint: "Kimehet, de egy nevesített vagy HR-cím jobb esélyt ad.",
  },
  language: {
    key: "language",
    level: "warn",
    label: "magyar levél nem magyar cégnek",
    hint: "Állítsd a sor nyelvét angolra, és generáld újra a levelet.",
  },
};

/** Általános, nem személyhez vagy HR-hez tartozó postafiókok. */
const GENERIC =
  /^(info|office|hello|contact|kontakt|kapcsolat|admin|sales|support|mail|post|iroda|ugyfelszolgalat|hola|contacto|contatti|bonjour)@/i;

export function issuesFor(
  row: PreflightRow,
  bouncedDomains: Set<string>,
): IssueInfo[] {
  const issues: IssueInfo[] = [];
  if (row.bodyLength < 40 || row.subjectLength < 3)
    issues.push(ISSUES["no-letter"]);
  if (row.hasPlaceholder) issues.push(ISSUES.placeholder);
  const domain = companyDomain(row.email);
  if (domain && bouncedDomains.has(domain))
    issues.push(ISSUES["bounced-domain"]);
  if (GENERIC.test(row.email.trim())) issues.push(ISSUES.generic);
  if (
    row.language === "hu" &&
    row.country &&
    row.country !== "HU" &&
    row.country !== "INT"
  ) {
    issues.push(ISSUES.language);
  }
  return issues;
}

export function hasBlocking(issues: IssueInfo[]): boolean {
  return issues.some((issue) => issue.level === "error");
}

export interface PreflightSummary {
  key: string;
  level: IssueLevel;
  label: string;
  hint: string;
  count: number;
  examples: { company: string; email: string }[];
}

/** Összesítés az előnézet tetejére: problémánként darabszám és néhány példa. */
export function summarize(
  rows: PreflightRow[],
  bouncedDomains: Set<string>,
): PreflightSummary[] {
  const byKey = new Map<string, PreflightSummary>();
  for (const row of rows) {
    for (const issue of issuesFor(row, bouncedDomains)) {
      const entry = byKey.get(issue.key) ?? {
        ...issue,
        count: 0,
        examples: [] as PreflightSummary["examples"],
      };
      entry.count += 1;
      if (entry.examples.length < 5)
        entry.examples.push({ company: row.company, email: row.email });
      byKey.set(issue.key, entry);
    }
  }
  // Előbb a blokkolók, aztán a figyelmeztetések, darabszám szerint.
  return [...byKey.values()].sort((a, b) =>
    a.level === b.level ? b.count - a.count : a.level === "error" ? -1 : 1,
  );
}
