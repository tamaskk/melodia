import { COMPANY_SIZES, type CompanySize } from "../types";
import type { HookKey } from "./profile";
import {
  BOOST,
  DATA_SMELLS,
  LOW_FIT,
  NON_EMPLOYER,
  NON_IT,
  STACK_MISMATCH,
  SUSPECT_INDUSTRIES,
  type Rule,
} from "./rules";
import type { Flag, HunterRow, Language, Priority } from "./types";

/** Hunter létszám → a séma létszám-sávja. Ismeretlen esetén 1-10, de flaggel. */
export function mapSize(headcount: string): { size: CompanySize; inferred: boolean } {
  const raw = headcount.trim().toLowerCase();
  if (raw.length === 0 || raw === "nan") return { size: "1-10", inferred: true };

  const direct = raw.replace(/\s+to\s+/g, "-").replace(/[,\s]/g, "");
  if ((COMPANY_SIZES as readonly string[]).includes(direct)) {
    return { size: direct as CompanySize, inferred: false };
  }
  if (/^10001\+?$/.test(direct) || direct === "10000+") return { size: "10000+", inferred: false };

  // "500+", "12 employees" és társai: számot keresünk és sávba soroljuk.
  const n = Number.parseInt(direct.replace(/[^0-9]/g, ""), 10);
  if (Number.isFinite(n)) {
    if (n <= 10) return { size: "1-10", inferred: true };
    if (n <= 50) return { size: "11-50", inferred: true };
    if (n <= 200) return { size: "51-200", inferred: true };
    if (n <= 500) return { size: "201-500", inferred: true };
    if (n <= 1000) return { size: "501-1000", inferred: true };
    if (n <= 5000) return { size: "1001-5000", inferred: true };
    if (n <= 10000) return { size: "5001-10000", inferred: true };
    return { size: "10000+", inferred: true };
  }
  return { size: "1-10", inferred: true };
}

/** Magyar szöveg felismerése ékezetek és gyakori szavak alapján. */
export function detectLanguage(row: HunterRow): Language {
  const huTld = /\.hu$/i.test(row.domain);
  const text = `${row.companyName} ${row.description}`.toLowerCase();
  const huWords =
    /(^|\s)(és|kft|zrt|bt|megoldás|fejleszt|szolgáltat|rendszer|vállalat|ügyfél|magyar)(\s|$|\.|,)/;
  const hasAccents = /[áéíóöőúüű]/.test(text);
  if (huWords.test(text) || hasAccents) return "hu";
  // A .hu domain önmagában magyar, kivéve ha a leírás egyértelműen angol.
  return huTld ? "hu" : "en";
}

const hits = (haystack: string, rule: Pick<Rule, "match">): boolean =>
  rule.match.some((needle) => haystack.includes(needle));

export interface Classification {
  priority: Priority;
  score: number;
  tags: string[];
  hook: HookKey;
  flags: Flag[];
  size: CompanySize;
  language: Language;
}

export function classify(row: HunterRow): Classification {
  // Szóközzel keretezzük, hogy a " ai " típusú minták is működjenek.
  const hay = ` ${row.description} ${row.companyName} ${row.industry} `.toLowerCase();
  const tags = new Set<string>();
  const flags: Flag[] = [];
  let score = 0;
  let hook: HookKey = "agency";
  let bestHookScore = -Infinity;
  let disqualified: "nem-it" | "nem-munkaltato" | null = null;

  const apply = (rules: Rule[]): void => {
    for (const rule of rules) {
      if (!hits(hay, rule)) continue;
      score += rule.score;
      rule.tags?.forEach((tag) => tags.add(tag));
      if (rule.note) flags.push({ severity: "warn", text: rule.note });
      if (rule.hook && rule.score > bestHookScore) {
        bestHookScore = rule.score;
        hook = rule.hook;
      }
    }
  };

  for (const rule of NON_IT) {
    if (!hits(hay, rule)) continue;
    disqualified = "nem-it";
    rule.tags?.forEach((tag) => tags.add(tag));
    if (rule.note) flags.push({ severity: "warn", text: rule.note });
  }
  for (const rule of NON_EMPLOYER) {
    if (!hits(hay, rule)) continue;
    if (rule.score === 0) disqualified ??= "nem-munkaltato";
    else score += rule.score;
    rule.tags?.forEach((tag) => tags.add(tag));
    if (rule.note) flags.push({ severity: "warn", text: rule.note });
  }

  apply(BOOST);
  apply(STACK_MISMATCH);
  apply(LOW_FIT);

  // --- adatminőség ---
  if (row.description.trim().length === 0) {
    flags.push({
      severity: "warn",
      text: "NINCS LEÍRÁS a Hunter exportjában — a profil ismeretlen. Nézd meg a weboldalt, mielőtt küldesz.",
    });
    tags.add("ismeretlen-profil");
    score -= 1;
  }
  for (const smell of DATA_SMELLS) {
    if (hits(hay, { match: smell.match })) {
      flags.push({ severity: "warn", text: smell.note });
    }
  }
  const industry = row.industry.toLowerCase();
  if (
    SUSPECT_INDUSTRIES.some((suspect) => industry.includes(suspect)) &&
    /software|develop|szoftver|fejleszt/.test(hay)
  ) {
    flags.push({
      severity: "info",
      text: `A Hunter iparági besorolása ("${row.industry}") ellentmond a leírásnak — a besorolást hagyd figyelmen kívül.`,
    });
  }

  const { size, inferred } = mapSize(row.headcount);
  if (inferred && row.headcount.trim().length === 0) {
    flags.push({
      severity: "warn",
      text: `FIGYELEM: a Hunternél üres a létszámmező, a size="${size}" becslés, nem forrásadat.`,
    });
  }

  // Nagyobb cégeknél nagyobb az esély strukturált HR-folyamatra.
  if (size === "51-200" || size === "201-500") score += 1;
  if (size === "501-1000" || size === "1001-5000") score += 1;

  let priority: Priority;
  if (disqualified) priority = "nem-celpont";
  else if (score >= 5) priority = "magas";
  else if (score >= 2) priority = "kozepes";
  else priority = "alacsony";

  if (disqualified) hook = "nonIt";

  tags.add(`meret-${size}`);
  tags.add(`prioritas-${priority}`);

  return {
    priority,
    score,
    tags: [...tags],
    hook,
    flags,
    size,
    language: detectLanguage(row),
  };
}
