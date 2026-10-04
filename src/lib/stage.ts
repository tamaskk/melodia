/**
 * Hol tart egy megkeresés — egyetlen státusz a `sent` / `done` párosa helyett.
 *
 * A státuszt nem tároljuk külön: a meglévő mezőkből vezetjük le, így a régi
 * kód (kiküldés, Kész gomb, tömeges műveletek) változatlanul működik, és nem
 * csúszhat szét két igazság. Elsőbbségi sorrend (az első nyer):
 *
 *   kézi kimenetel → válaszolt → visszapattant → elküldve → kész → új
 *
 * Tiszta modul, adatbázis nélkül: a felület és a szerver is használja.
 */

/** Kézzel (később az AI-osztályozóval) rögzített kimenetel. */
export const OUTCOMES = [
  "interju",
  "ajanlat",
  "elutasitva",
  "nem-aktualis",
  "ne-keresd",
] as const;
export type Outcome = (typeof OUTCOMES)[number];

export type Stage =
  "uj" | "kesz" | "elkuldve" | "valaszolt" | "visszapattant" | Outcome;

export interface StageInfo {
  value: Stage;
  label: string;
  hint: string;
  /** Badge-szín (Tailwind osztályok). */
  tone: string;
}

export const STAGES: StageInfo[] = [
  {
    value: "uj",
    label: "Új",
    hint: "Még nem ment ki levél, és nincs lezárva",
    tone: "border-[var(--border)] text-[var(--muted)]",
  },
  {
    value: "kesz",
    label: "Kész",
    hint: "Lezártad, de nem e-mailben ment (pl. LinkedIn vagy űrlap)",
    tone: "border-[var(--border)] bg-[var(--surface-2)] text-[var(--muted)]",
  },
  {
    value: "elkuldve",
    label: "Elküldve",
    hint: "A levél kiment, válasz még nincs",
    tone: "border-amber-500/50 bg-amber-500/10 text-amber-300",
  },
  {
    value: "valaszolt",
    label: "Válaszolt",
    hint: "Emberi válasz jött (a Gmail-szinkron szerint)",
    tone: "border-emerald-500/50 bg-emerald-500/15 text-emerald-300",
  },
  {
    value: "visszapattant",
    label: "Visszapattant",
    hint: "A levél nem kézbesíthető, válasz nem jött",
    tone: "border-red-500/50 bg-red-500/10 text-red-300",
  },
  {
    value: "interju",
    label: "Interjú",
    hint: "Interjúra hívtak",
    tone: "border-sky-400/60 bg-sky-400/15 text-sky-200",
  },
  {
    value: "ajanlat",
    label: "Ajánlat",
    hint: "Ajánlatot kaptál",
    tone: "border-violet-400/60 bg-violet-400/15 text-violet-200",
  },
  {
    value: "elutasitva",
    label: "Elutasítva",
    hint: "Nemet mondtak",
    tone: "border-[var(--border)] bg-[var(--surface-2)] text-[var(--muted)]",
  },
  {
    value: "nem-aktualis",
    label: "Nem aktuális",
    hint: "Most nincs nyitott pozíció / később",
    tone: "border-[var(--border)] bg-[var(--surface-2)] text-[var(--muted)]",
  },
  {
    value: "ne-keresd",
    label: "Ne keresd",
    hint: "Többé ne menjen neki levél",
    tone: "border-[var(--border)] bg-[var(--surface-2)] text-[var(--muted)]",
  },
];

export const STAGE_BY_VALUE = Object.fromEntries(
  STAGES.map((stage) => [stage.value, stage]),
) as Record<Stage, StageInfo>;

export function isOutcome(value: unknown): value is Outcome {
  return (
    typeof value === "string" && (OUTCOMES as readonly string[]).includes(value)
  );
}

export function isStage(value: unknown): value is Stage {
  return typeof value === "string" && value in STAGE_BY_VALUE;
}

interface StageFields {
  sent?: boolean;
  done?: boolean;
  repliedAt?: string | null;
  bouncedAt?: string | null;
  outcome?: Outcome | null;
}

export function stageOf(contact: StageFields): Stage {
  if (contact.outcome && isOutcome(contact.outcome)) return contact.outcome;
  if (contact.repliedAt) return "valaszolt";
  if (contact.bouncedAt) return "visszapattant";
  if (contact.sent) return "elkuldve";
  if (contact.done) return "kesz";
  return "uj";
}

/**
 * Ugyanez Mongo-lekérdezésként — a szűrő a szerveren fut, nem itt számolunk.
 * `{ mező: null }` a hiányzó mezőre is illeszkedik.
 */
export function stageQuery(stage: Stage): Record<string, unknown> {
  if (isOutcome(stage)) return { outcome: stage };
  const open = { outcome: null };
  switch (stage) {
    case "valaszolt":
      return { ...open, repliedAt: { $ne: null } };
    case "visszapattant":
      return { ...open, repliedAt: null, bouncedAt: { $ne: null } };
    case "elkuldve":
      return { ...open, repliedAt: null, bouncedAt: null, sent: true };
    case "kesz":
      return {
        ...open,
        repliedAt: null,
        bouncedAt: null,
        sent: { $ne: true },
        done: true,
      };
    default:
      return {
        ...open,
        repliedAt: null,
        bouncedAt: null,
        sent: { $ne: true },
        done: { $ne: true },
      };
  }
}
