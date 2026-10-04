import type { Outcome, Stage } from "./stage";

/**
 * Source document id, e.g. "german-leaders" or "agency-emails-at".
 * Free-form: the parser derives one per PDF and imports may add new ones.
 */
export type SourceKey = string;

export type ContactKind =
  "company-leader" | "recruiter" | "agency" | "it-company";

/** Head-count buckets for IT companies. */
export const COMPANY_SIZES = [
  "1-10",
  "11-50",
  "51-200",
  "201-500",
  "501-1000",
  "1001-5000",
  "5001-10000",
  "10000+",
  // Névből felvett cégnél gyakran nem tudjuk a létszámot. Külön sáv, hogy
  // szűrni lehessen rá, és később pótolni.
  "ismeretlen",
] as const;

export type CompanySize = (typeof COMPANY_SIZES)[number];

export type Channel = "email" | "linkedin" | "both";

export type Language = "en" | "hu";

export interface Contact {
  /** Stable, human readable dedupe key. */
  key: string;
  source: SourceKey;
  kind: ContactKind;
  channel: Channel;

  company: string;
  /** A cégnév kereshető alakjai (jogi forma és írásjelek nélkül). Írásnál generált. */
  aliases?: string[];
  website: string | null;
  person: string | null;
  role: string | null;

  emails: string[];
  primaryEmail: string | null;
  linkedinUrl: string | null;

  city: string | null;
  country: string;
  /** Head count bucket — used by IT companies. */
  size: CompanySize | null;
  language: Language;
  /** agency | inhouse | general | leadership */
  category: string | null;
  tags: string[];
  note: string | null;

  emailSubject: string;
  emailBody: string;
  linkedinMessage: string | null;
  connectionRequest: string | null;

  /** Webes e-mail keresés nyoma — hogy ne fussunk rá kétszer feleslegesen. */
  emailSearchedAt?: string | null;
  emailSearchResult?: "found" | "none" | null;
  /** A keresés összefoglalója: miért nem lett cím. */
  emailSearchNote?: string | null;
  /** A keresés TELJES eredménye, ahogy visszajött — semmi nem vész el. */
  emailSearch?: EmailSearchRecord | null;

  /** Az első kiküldött levél azonosítója és fiókja — a follow-up ehhez fűz. */
  sentMessageId?: string | null;
  sentFrom?: string | null;
  /** A legutóbbi válasz osztályozása és a válaszpiszkozat (replyTriage.ts). */
  replyTriage?: ReplyTriage | null;
  /** Mikor kezelted a legutóbbi választ (válaszoltál vagy lezártad). */
  replyHandledAt?: string | null;
  /** A kimenetelt ki állította: kézzel vagy az osztályozó. */
  outcomeSource?: "kezi" | "ai" | null;

  /** Follow-up: jóváhagyva (a kiküldő ezeket viszi), illetve kiment. */
  followUpApprovedAt?: string | null;
  followUpSentAt?: string | null;

  /** Interjú-brief (interviewBrief.ts) — interjú előtti felkészüléshez. */
  interviewBrief?: {
    at: string;
    model: string;
    company: string;
    people: string;
    situation: string;
    expectedQuestions: string[];
    myQuestions: string[];
    prep: string[];
  } | null;
  /** Nyitott pozíciók a cég karrieroldalán (careers.ts). */
  careers?: {
    url: string | null;
    positions: string[];
    checkedAt: string;
  } | null;
  /** A cég domainje (weboldal vagy céges e-mail) — az adatbázis számolja. */
  domain?: string | null;
  /** Illeszkedési pontszám (score.ts) — az adatbázis számolja, rendezéshez. */
  score?: number;
  /** A Gmail-szinkronból: az utolsó emberi válasz ideje. */
  repliedAt?: string | null;
  /** A Gmail-szinkronból: visszapattant a levél, és válasz nem jött. */
  bouncedAt?: string | null;
  /** Kézzel rögzített kimenetel (interjú, elutasítva, ne keresd …). */
  outcome?: Outcome | null;
  outcomeAt?: string | null;

  /** LinkedIn-en talált kapcsolattartók: HR és vezetés. */
  people?: CompanyPerson[];
  /** Mikor futott utoljára kapcsolattartó-keresés — hogy ne fusson rá kétszer. */
  peopleSearchedAt?: string | null;
  peopleSearchResult?: "found" | "none" | null;
  peopleSearchNote?: string | null;

  /** Content fields the user edited by hand; re-import never overwrites them. */
  manualFields?: string[];

  /** "pdf" = parsed from a source PDF, "import" = added through /import. */
  origin?: "pdf" | "import";

  sent: boolean;
  sentAt: string | null;
  done: boolean;
  doneAt: string | null;
  starred: boolean;

  createdAt: string;
  updatedAt: string;
}

/**
 * Egy cégnél megtalált ember. A HR és a vezetés külön kategória: a
 * megkeresésnél nem mindegy, kinek írunk.
 */
export interface CompanyPerson {
  name: string;
  /** Eredeti titulus, ahogy a profilon szerepel. */
  role: string;
  /** `hr` = toborzás/HR, `vezetes` = CEO/alapító/igazgató, `egyeb` = minden más. */
  category: "hr" | "vezetes" | "egyeb";
  linkedinUrl: string | null;
  email: string | null;
  /** Hol találtuk (URL) — ellenőrizhető legyen. */
  source: string | null;
  note: string | null;
  foundAt: string;
}

/** Egy webes e-mail keresés teljes eredménye, a soron eltárolva. */
export interface EmailSearchRecord {
  at: string;
  result: "found" | "none";
  email: string | null;
  confidence: "high" | "medium" | "low";
  source: string | null;
  /** Jelentkezési űrlap, ha e-mail nincs. */
  applyUrl: string | null;
  /** Minden további cím, amit a keresés említett (általános info@ is). */
  alternatives: {
    email: string;
    source: string | null;
    label: string | null;
  }[];
  notes: string;
  /** A megnyitott oldalak URL-jei. */
  citations: string[];
  model: string;
  /** Mibe került ez a keresés — a `/usage` oldal ugyanezt összesíti. */
  usage?: {
    provider: string;
    model: string;
    totalTokens: number;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    costUsd: number | null;
    ms: number;
    turns: number | null;
  } | null;
}

export interface ContactDoc extends Contact {
  _id: string;
}

export interface ContactFilters {
  q?: string;
  source?: string;
  kind?: string;
  channel?: string;
  country?: string;
  language?: string;
  category?: string;
  city?: string;
  size?: string;
  tag?: string;
  hasEmail?: "yes" | "no" | "";
  /** "yes" = már kerestünk hozzá e-mailt a weben, "no" = még nem. */
  emailSearched?: "yes" | "no" | "";
  /** "yes" = van legalább egy megtalált kapcsolattartó. */
  hasPeople?: "yes" | "no" | "";
  peopleSearched?: "yes" | "no" | "";
  /** E-mail állapot: van / nincs, és azon belül kerestük-e, ajánlott-e valamit. */
  emailStatus?: EmailStatus | "";
  /** Kapcsolattartó állapot: van (név vagy talált ember) / nincs, kerestük-e. */
  contactStatus?: ContactStatus | "";
  /** Hol tart a megkeresés (`src/lib/stage.ts`). */
  stage?: Stage | "";
  /** `none` = nincs kézi kimenetel — a kiküldés csak ezeket veszi. */
  outcome?: "none" | "";
  /** `new` = válasz jött, és még nem kezelted. */
  reply?: "new" | "";
  /** `due` = esedékes follow-up, `approved` = esedékes és jóváhagyott. */
  followUp?: "due" | "approved" | "";
  sent?: "yes" | "no" | "";
  done?: "yes" | "no" | "";
  starred?: "yes" | "no" | "";
  sort?: string;
}

/**
 * `found` = van cím · `missing` = nincs (kerestük vagy sem) · `unsearched` = nincs,
 * még nem kerestük · `suggested-email` = kerestük, nincs, de ajánlott címet
 * (másik cím, be nem írt találat, a jegyzetben említett cím) · `suggested-form`
 * = csak jelentkezési űrlapot talált · `nothing` = kerestük, és semmi nem lett.
 * A felület nem kínálja, csak az API érti: `suggested` = a két javaslat együtt,
 * `none` = javaslat + semmi.
 */
export type EmailStatus =
  | "found"
  | "missing"
  | "unsearched"
  | "none"
  | "suggested"
  | "suggested-email"
  | "suggested-form"
  | "nothing";

export type ContactStatus = "found" | "missing" | "unsearched" | "none";

export type ReplyCategory =
  "interju" | "kerdes" | "elutasitas" | "kesobb" | "automatikus" | "egyeb";

export interface ReplyTriage {
  at: string;
  /** Melyik levélre szól — új válasznál újra osztályozunk. */
  messageId: string | null;
  category: ReplyCategory;
  confidence: number;
  /** Egy mondat magyarul: mit írtak. */
  summary: string;
  draft: { subject: string; body: string } | null;
  model: string;
}

export interface Stats {
  total: number;
  done: number;
  sent: number;
  /** Emberi válasz jött (a Gmail-szinkron szerint). */
  replied: number;
  bounced: number;
  starred: number;
  withEmail: number;
  bySource: { _id: string; count: number; done: number; sent: number }[];
}
