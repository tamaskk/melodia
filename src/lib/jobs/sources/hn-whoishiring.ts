/**
 * Hacker News „Ask HN: Who is hiring?" — Algolia API.
 * https://hn.algolia.com/api
 *
 * EZ A FORRÁS AD LEGINKÁBB MÁST, mint a többi: a havi szálban sok alapító
 * személyesen posztol, ATS és recruiter nélkül. Ezek a pozíciók sehol
 * máshol nem jelennek meg.
 *
 * A fogás: a hirdetések SZABADSZÖVEGES KOMMENTEK.
 *
 * ÉLŐBEN MÉRVE (2026-09-01, szeptemberi szál):
 *   • 100 kommentből 80 top-szintű (a többi válasz — kérdés, megjegyzés)
 *   • a top-szintűek 75/80-a (94%) tartja a "Cég | Pozíció | Lokáció | …"
 *     pipe-formátumot → determinisztikus parser bőven elég a többségre
 *   • 17/80-ban (21%) VAN közvetlen e-mail cím → ennyivel kevesebb
 *     Hunter.io-kredit kell (23-as task)
 *
 * Ezért NEM LLM-mel parse-olunk mindent: a pipe-formátumot és az e-mail
 * címet determinisztikusan szedjük ki (ingyen, azonnal, reprodukálhatóan),
 * és az LLM (21-es task) csak a pontozásnál lép be — ott, ahol tényleg
 * ítélet kell.
 */
import { getJson } from "../http";
import { getCached, setCached } from "../cache";
import { guessCountry, looksRemote, stripHtml, toISO } from "../normalize";
import { defineSource, makeJob as mk } from "./base";
import type { Job } from "../types";

const API = "https://hn.algolia.com/api/v1/search_by_date";
const TIMEOUT = 15000;

/**
 * A szál a hónap során BŐVÜL, ezért heti újrafutás indokolt — nem havi.
 * A szál azonosítója viszont a hónapra állandó, azt tovább cache-eljük.
 */
const COMMENTS_TTL_MINUTES = 7 * 24 * 60;
const THREAD_TTL_MINUTES = 30 * 24 * 60;

const MAX_PAGES = 10;
const PAGE_SIZE = 100;

const THREAD_KEY = "hn:thread";
const COMMENTS_KEY = "hn:jobs";

interface HnStory {
  objectID: string;
  title?: string;
  created_at?: string;
  num_comments?: number;
}

export interface HnComment {
  objectID: string;
  author?: string;
  /** HTML-ESCAPE-ELT szabadszöveg. */
  comment_text?: string;
  created_at?: string;
  /** Top-szintű komment esetén ez EGYENLŐ a story_id-vel. */
  parent_id?: number | string;
  story_id?: number | string;
  story_title?: string;
}

/**
 * Top-szintű-e a komment.
 *
 * Csak ezek hirdetések — a válaszok kérdések és megjegyzések. Mérve: 100
 * kommentből 80 top-szintű.
 */
export function isTopLevel(c: HnComment, storyId: string): boolean {
  return String(c.parent_id) === String(storyId);
}

/** E-mail cím a szövegből. Ez spórolja meg a Hunter.io-kreditet. */
export function extractEmail(text: string): string | undefined {
  // A szöveg HTML-escape-elt lehet, ezért az entitásokat is elfogadjuk.
  const m = text.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/);
  if (!m) return undefined;
  const email = m[0].toLowerCase();
  // A képfájlnév-szerű találatok kiszűrése.
  if (/\.(png|jpg|jpeg|gif|svg|webp)$/.test(email)) return undefined;
  return email;
}

/** Jelentkezési URL a szövegből. */
export function extractUrl(text: string): string | undefined {
  const m = text.match(/https?:\/\/[^\s<>"')]+/);
  return m ? m[0].replace(/[.,;:]+$/, "") : undefined;
}

const EMPLOYMENT =
  /\b(full[- ]?time|part[- ]?time|contract|contractor|intern(ship)?|freelance|permanent)\b/i;
const SALARY = /(\$|€|£)\s?\d|\d+\s?k\b|\bsalary\b|\bcompensation\b/i;
/** Csak URL-t tartalmazó szegmens — ez nem pozíciócím. */
const URL_ONLY = /^https?:\/\/\S+$/i;

const LOCATION_HINT =
  /\b(remote|hybrid|onsite|on-site|worldwide|anywhere|eu|emea|usa|us|uk|europe|[A-Z][a-z]+,\s*[A-Z]{2})\b/i;

export interface ParsedHeader {
  company?: string;
  title?: string;
  location?: string;
  employmentType?: string;
  salaryText?: string;
}

/**
 * A pipe-formátumú fejléc szétbontása.
 *
 *   "Cég | Senior Backend Engineer | Remote (EU) | Full-time | $120k-160k"
 *
 * A mezők SORRENDJE NEM RÖGZÍTETT — van, aki a munkaidőt teszi másodiknak.
 * Ezért az ELSŐ szegmens a cég (ez stabil), a többit tartalom szerint
 * osztályozzuk. Ami nem sorolható be, az a pozíció címe.
 */
export function parseHeader(firstLine: string): ParsedHeader {
  const parts = firstLine
    .split("|")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length < 2) return { title: firstLine.trim() };

  const [company, ...rest] = parts;
  const out: ParsedHeader = { company };
  const titleCandidates: string[] = [];

  for (const part of rest) {
    if (!out.employmentType && EMPLOYMENT.test(part) && part.length < 40) {
      out.employmentType = part;
    } else if (!out.salaryText && SALARY.test(part)) {
      out.salaryText = part;
    } else if (!out.location && LOCATION_HINT.test(part) && part.length < 60) {
      out.location = part;
    } else if (!URL_ONLY.test(part)) {
      // A puszta URL nem pozíciócím — a jelentkezési linket külön szedjük ki.
      titleCandidates.push(part);
    }
  }

  // Ha minden szegmens besorolódott, a legjobb tartalék a nem-URL első elem.
  out.title =
    titleCandidates.join(" — ") ||
    rest.find((r) => !URL_ONLY.test(r)) ||
    rest[0];
  return out;
}

/**
 * Egy HN-komment → közös Job séma.
 * Exportált, mert a test/hn.test.ts a mentett fixture-ön ellenőrzi.
 */
export function toJob(c: HnComment): Job | null {
  // A comment_text HTML-escape-elt: a stripHtml ciklusban oldja fel az
  // entitásokat, tehát a dupla escape-et is kezeli.
  const text = stripHtml(c.comment_text) ?? "";
  if (!text.trim()) return null;

  const firstLine = text.split("\n")[0] ?? "";
  const header = parseHeader(firstLine);
  if (!header.title) return null;

  const email = extractEmail(text);
  const url = extractUrl(text);
  const location = header.location;

  return mk({
    sourceId: "hn",
    raw: c,
    externalId: String(c.objectID),
    title: header.title.slice(0, 200),
    // Pipe-formátum nélküli posztnál nincs cégnév a fejlécben — ilyenkor a
    // HN-felhasználó a legjobb tartalék: ő hirdet. Jobb, mint eldobni.
    company: header.company ?? (c.author ? `HN: ${c.author}` : ""),
    // A HN-nél nincs külön hirdetés-URL: a kommentre mutatunk, ha nincs sajátja.
    url: url ?? `https://news.ycombinator.com/item?id=${c.objectID}`,
    // KÖZVETLEN e-mail: ha megvan, a Hunter.io-lépés kihagyható.
    applyEmail: email,
    location,
    country: guessCountry(location),
    remote: looksRemote(location, firstLine),
    description: text,
    employmentType: header.employmentType,
    postedAt: toISO(c.created_at),
    tags: header.salaryText ? [header.salaryText] : undefined,
  });
}

/**
 * A friss „Who is hiring" szál megkeresése.
 *
 * A bot-fiók (`author_whoishiring`) havonta KÉT szálat nyit: a „Who is
 * hiring?" mellett a „Who wants to be hired?" is tőle jön, szinte azonos
 * objectID-val. A címre szűrés nélkül a rossz szálat dolgoznánk fel.
 */
export async function findThread(signal: AbortSignal): Promise<HnStory | null> {
  const cached = getCached<HnStory>(THREAD_KEY);
  if (cached) return cached;

  const qs = new URLSearchParams({
    tags: "story,author_whoishiring",
    hitsPerPage: "10",
  });
  const data = await getJson<{ hits?: HnStory[] }>(`${API}?${qs}`, {
    signal,
    timeoutMs: TIMEOUT,
  });

  const story = (data.hits ?? []).find(
    (h) =>
      /who is hiring/i.test(h.title ?? "") &&
      !/wants to be hired/i.test(h.title ?? ""),
  );
  return story ? setCached(THREAD_KEY, story, THREAD_TTL_MINUTES) : null;
}

export const hnWhoIsHiring = defineSource({
  meta: {
    id: "hn",
    name: "HN Who is hiring",
    category: "aggregator",
    auth: "none",
    regionCodes: ["global"],
    rateLimit: null,
    cacheTtlMinutes: COMMENTS_TTL_MINUTES,
    regions: "Globális, US-túlsúly, sok remote",
    docs: "https://hn.algolia.com/api",
    warning:
      "Szabadszöveges kommentek. A hirdetések 94%-a pipe-formátumú; a maradék parse-olása pontatlanabb lehet. A szál a hónap során bővül — heti újrafutás.",
    attribution: { label: "Hacker News", url: "https://news.ycombinator.com" },
  },
  async fetch(_params, signal) {
    const cached = getCached<Job[]>(COMMENTS_KEY);
    if (cached) return cached;

    const story = await findThread(signal);
    if (!story) return [];

    const comments: HnComment[] = [];
    for (let page = 0; page < MAX_PAGES; page++) {
      const qs = new URLSearchParams({
        tags: `comment,story_${story.objectID}`,
        hitsPerPage: String(PAGE_SIZE),
        page: String(page),
      });
      const data = await getJson<{ hits?: HnComment[]; nbPages?: number }>(
        `${API}?${qs}`,
        {
          signal,
          timeoutMs: TIMEOUT,
        },
      );
      comments.push(...(data.hits ?? []));
      if (page >= (data.nbPages ?? 1) - 1) break;
    }

    // CSAK a top-szintű kommentek hirdetések — a válaszok kérdések.
    const jobs = comments
      .filter((c) => isTopLevel(c, story.objectID))
      .map(toJob)
      .filter((j): j is Job => j !== null);

    return setCached(COMMENTS_KEY, jobs, COMMENTS_TTL_MINUTES);
  },
});
