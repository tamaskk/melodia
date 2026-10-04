/**
 * Illeszkedési pontszám: melyik céggel érdemes kezdeni.
 *
 * Objektív, ellenőrizhető tényezők — nem „esély”, hanem hogy mennyire illik a
 * profilodhoz és mennyire elérhető. Minden szabály kétszer van leírva, egymás
 * mellett: Mongo-kifejezésként (az adatbázis számolja 133 ezer sorra, adat-
 * átvitel nélkül) és JS-függvényként (a felület ebből mutatja az indoklást).
 * Ha az egyiket módosítod, a másikat is.
 */
import type { ContactDoc } from "./types";

type Doc = Pick<
  ContactDoc,
  | "tags"
  | "note"
  | "city"
  | "country"
  | "size"
  | "kind"
  | "people"
  | "primaryEmail"
  | "emailSearch"
  | "bouncedAt"
  | "language"
>;

export interface ScoreRule {
  key: string;
  label: string;
  points: number;
  mongo: Record<string, unknown>;
  test: (doc: Doc) => boolean;
}

const STACK =
  "typescript|\\breact|next\\.?js|node\\.?js|angular|nestjs|javascript|full.?stack";
const GENERIC =
  "^(info|office|hello|contact|kontakt|kapcsolat|admin|sales|support|mail|post|iroda|ugyfelszolgalat|hola|contacto)@";

const tags = { $ifNull: ["$tags", []] };
const hasTag = (tag: string) => ({ $in: [tag, tags] });
const matches = (field: string, regex: string) => ({
  $regexMatch: { input: { $ifNull: [field, ""] }, regex, options: "i" },
});
const present = (field: string) => ({
  $ne: [{ $ifNull: [field, null] }, null],
});
const not = (expr: unknown) => ({ $not: [expr] });

const tagged = (doc: Doc, tag: string) => (doc.tags ?? []).includes(tag);
const stackInNote = (doc: Doc) => new RegExp(STACK, "i").test(doc.note ?? "");
const isBudapest = (doc: Doc) => /^buda/i.test(doc.city ?? "");
const hasHr = (doc: Doc) =>
  (doc.people ?? []).some((person) => person.category === "hr");

export const SCORE_RULES: ScoreRule[] = [
  {
    key: "prio-high",
    label: "magas prioritás (import)",
    points: 4,
    mongo: hasTag("prioritas-magas"),
    test: (doc) => tagged(doc, "prioritas-magas"),
  },
  {
    key: "prio-mid",
    label: "közepes prioritás (import)",
    points: 2,
    mongo: hasTag("prioritas-kozepes"),
    test: (doc) => tagged(doc, "prioritas-kozepes"),
  },
  {
    key: "not-target",
    label: "nem célpont (import)",
    points: -5,
    mongo: hasTag("prioritas-nem-celpont"),
    test: (doc) => tagged(doc, "prioritas-nem-celpont"),
  },
  {
    key: "stack-tag",
    label: "stack-egyezés",
    points: 3,
    mongo: hasTag("stack-egyezik"),
    test: (doc) => tagged(doc, "stack-egyezik"),
  },
  {
    key: "stack-note",
    label: "a leírás a te stackedet említi",
    points: 2,
    mongo: { $and: [not(hasTag("stack-egyezik")), matches("$note", STACK)] },
    test: (doc) => !tagged(doc, "stack-egyezik") && stackInNote(doc),
  },
  {
    key: "budapest",
    label: "Budapest",
    points: 2,
    mongo: matches("$city", "^buda"),
    test: isBudapest,
  },
  {
    key: "hungary",
    label: "Magyarország",
    points: 1,
    mongo: {
      $and: [{ $eq: ["$country", "HU"] }, not(matches("$city", "^buda"))],
    },
    test: (doc) => doc.country === "HU" && !isBudapest(doc),
  },
  {
    key: "size",
    label: "11–200 fős cég",
    points: 1,
    mongo: { $in: ["$size", ["11-50", "51-200"]] },
    test: (doc) => doc.size === "11-50" || doc.size === "51-200",
  },
  {
    key: "direct",
    label: "közvetlen munkáltató (nem ügynökség)",
    points: 1,
    mongo: { $in: ["$kind", ["it-company", "company-leader"]] },
    test: (doc) => doc.kind === "it-company" || doc.kind === "company-leader",
  },
  {
    key: "hr",
    label: "van HR-es kapcsolattartó",
    points: 2,
    mongo: { $in: ["hr", { $ifNull: ["$people.category", []] }] },
    test: hasHr,
  },
  {
    key: "people",
    label: "van talált kapcsolattartó",
    points: 1,
    mongo: {
      $and: [
        { $gt: [{ $size: { $ifNull: ["$people", []] } }, 0] },
        not({ $in: ["hr", { $ifNull: ["$people.category", []] }] }),
      ],
    },
    test: (doc) => (doc.people?.length ?? 0) > 0 && !hasHr(doc),
  },
  {
    key: "email",
    label: "van e-mail cím",
    points: 2,
    mongo: present("$primaryEmail"),
    test: (doc) => Boolean(doc.primaryEmail),
  },
  {
    key: "form",
    label: "csak jelentkezési űrlap",
    points: 1,
    mongo: {
      $and: [not(present("$primaryEmail")), present("$emailSearch.applyUrl")],
    },
    test: (doc) => !doc.primaryEmail && Boolean(doc.emailSearch?.applyUrl),
  },
  {
    key: "generic",
    label: "általános postafiók",
    points: -1,
    mongo: matches("$primaryEmail", GENERIC),
    test: (doc) => new RegExp(GENERIC, "i").test(doc.primaryEmail ?? ""),
  },
  {
    key: "bounced",
    label: "visszapattant cím",
    points: -5,
    mongo: present("$bouncedAt"),
    test: (doc) => Boolean(doc.bouncedAt),
  },
  {
    key: "language",
    label: "magyar levél nem magyar cégnek",
    points: -1,
    mongo: {
      $and: [
        { $eq: ["$language", "hu"] },
        { $not: [{ $in: ["$country", ["HU", "INT"]] }] },
      ],
    },
    test: (doc) =>
      doc.language === "hu" && doc.country !== "HU" && doc.country !== "INT",
  },
];

/** A pontszám Mongo-kifejezésként — `updateMany` pipeline-ban számolható. */
export const SCORE_EXPRESSION = {
  $add: SCORE_RULES.map((rule) => ({ $cond: [rule.mongo, rule.points, 0] })),
};

/** Ugyanez a felületen, indoklással: „+4 magas prioritás · +2 Budapest …”. */
export function explainScore(doc: Doc): { score: number; reasons: string[] } {
  const hits = SCORE_RULES.filter((rule) => rule.test(doc));
  return {
    score: hits.reduce((sum, rule) => sum + rule.points, 0),
    reasons: hits.map(
      (rule) => `${rule.points > 0 ? "+" : ""}${rule.points} ${rule.label}`,
    ),
  };
}
