/**
 * Publikus e-mail cím keresése egy céghez — OpenAI + valódi webkeresés.
 *
 * A Responses API `web_search` eszközével fut, mert e-mail címet kitalálni
 * tilos: csak az számít, amit a modell tényleg megtalált egy oldalon, és amihez
 * URL-t tud adni. A találat NEM mentődik magától — a felhasználó dönt róla.
 */
import { credential } from "./env";
import { createLogger } from "./logger";
import { recordUsage, type SearchUsage } from "./usage";
import { OPENAI_MODEL, openAiKey } from "./openai";
import type { ContactDoc } from "./types";

export interface EmailCandidate {
  email: string;
  source: string | null;
  label: string | null;
}

export interface EmailFinding {
  email: string | null;
  confidence: "high" | "medium" | "low";
  source: string | null;
  alternatives: EmailCandidate[];
  /** Jelentkezési űrlap, ha e-mail nincs — legalább hova kattintson. */
  applyUrl: string | null;
  notes: string;
  citations: string[];
  model: string;
  /** Mibe került ez a keresés. A `findEmail` tölti ki, a hívó a sorra menti. */
  usage?: SearchUsage | null;
}

const EMAIL_RX = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

const log = createLogger("email-search");

/** A legutóbbi OpenAI-hívás mérése — a `findEmail` ebből tölti a usage rekordot. */
let lastOpenAiStats: {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  searches: number;
} | null = null;

/** Amit az OpenAI a háttérben csinált: keresések, letöltések, token-fogyás. */
function logToolActivity(data: ResponsesPayload): void {
  let searches = 0;
  for (const item of (data.output ?? []) as Record<string, unknown>[] ) {
    if (String(item.type ?? "").includes("web_search")) searches += 1;
    const type = String(item.type ?? "");
    if (type.includes("web_search")) {
      const action = (item.action ?? {}) as Record<string, unknown>;
      const query = action.query ?? (item as { query?: string }).query;
      if (query) log.info(`🔍 keresés: ${query}`);
      else log.debug(`webkeresés lépés (${item.status ?? "?"})`);
    }
  }

  lastOpenAiStats = {
    inputTokens: data.usage?.input_tokens ?? 0,
    outputTokens: data.usage?.output_tokens ?? 0,
    cacheReadTokens: data.usage?.input_tokens_details?.cached_tokens ?? 0,
    searches,
  };

  // A költség ezekből jön ki: token + webkeresés-hívás.
  log.info("OpenAI használat", {
    input_tokens: data.usage?.input_tokens ?? 0,
    cached: data.usage?.input_tokens_details?.cached_tokens ?? 0,
    output_tokens: data.usage?.output_tokens ?? 0,
    webkeresesek: searches,
    model: SEARCH_MODEL,
  });
}

/** A keresőmodell külön állítható: a webkeresés nem minden modellen megy. */
const SEARCH_MODEL = credential("OPENAI_SEARCH_MODEL", OPENAI_MODEL);

/** Egy cég adatlapja a promptban — több cégnél számozva ismételjük. */
export function contactBrief(contact: ContactDoc, index?: number): string {
  const head = index === undefined ? "" : `#${index + 1} `;
  return [
    `${head}Cég: ${contact.company}`,
    contact.website ? `Weboldal: ${contact.website}` : "Weboldal: nem ismert",
    contact.linkedinUrl ? `LinkedIn: ${contact.linkedinUrl}` : null,
    `Ország: ${contact.country}${contact.city ? ` · ${contact.city}` : ""}`,
    contact.note ? `Amit tudunk: ${contact.note.slice(0, 250)}` : null,
  ]
    .filter((line) => line !== null)
    .join("\n");
}

/** A több céges válasz egy eleme — az index köti a kérés sorrendjéhez. */
export interface BatchFinding extends EmailFinding {
  index: number;
  company: string;
}

export const BATCH_RULES = `KEMÉNY SZABÁLYOK:
- SOHA ne találj ki címet. Ne tippelj mintából (pl. "info@" + domain), ha nem láttad leírva.
- Csak olyan címet adj vissza, amit egy konkrét, megnyitott oldalon láttál, és add meg az URL-jét.
- SOHA ne hallgass el olyan címet, amit láttál: az általános info@ / office@ is menjen be,
  vagy fő címként, vagy az alternatives listába, label-lel megjelölve.
- Ha csak jelentkezési űrlap van: email null, applyUrl az űrlap URL-je.
- confidence: "high" = a cég saját oldala, "medium" = más hiteles forrás, "low" = bizonytalan egyezés.
- Ha egy céghez semmit nem találsz, akkor is add vissza a sorát, email: null értékkel.`;

export function buildBatchPrompt(contacts: ContactDoc[]): string {
  return [
    `Az alábbi ${contacts.length} céghez keresd meg a publikus, jelentkezésre használható`,
    "e-mail címet. Mindegyikhez külön keress — a cégek nem függenek össze.",
    "Prioritás: karrier/HR cím (jobs@, karrier@, hr@, allas@) > általános cím (info@, office@, hello@).",
    "Nézd meg a cég saját oldalát (Kapcsolat / Karrier / Impresszum / Impressum) is.",
    "",
    BATCH_RULES,
    "",
    "CÉGEK:",
    contacts.map((contact, index) => contactBrief(contact, index)).join("\n\n"),
    "",
    "Válasz KIZÁRÓLAG egyetlen JSON tömb, cégenként egy elem, a fenti sorrendben:",
    '[{"index":1,"company":"...","email":"cím vagy null","confidence":"high|medium|low",',
    ' "source":"URL vagy null","alternatives":[{"email":"...","source":"URL","label":"mire való"}],',
    ' "applyUrl":"URL vagy null","notes":"1 mondat magyarul"}]',
  ].join("\n");
}

function buildPrompt(contact: ContactDoc): string {
  return [
    `Cég: ${contact.company}`,
    contact.website ? `Weboldal: ${contact.website}` : "Weboldal: nem ismert",
    contact.linkedinUrl ? `LinkedIn: ${contact.linkedinUrl}` : null,
    `Ország: ${contact.country}${contact.city ? ` · ${contact.city}` : ""}`,
    contact.person ? `Kapcsolattartó: ${contact.person}` : null,
    contact.note ? `Amit tudunk róla: ${contact.note.slice(0, 400)}` : null,
    "",
    "FELADAT: keresd meg a cég publikus e-mail címét, amire egy fejlesztői",
    "álláskereső jelentkezni tud. Prioritás: karrier/HR cím (jobs@, karrier@,",
    "hr@, allas@) > általános cég cím (info@, office@, hello@, contact@).",
    "Nézd meg a cég saját oldalát (Kapcsolat / Karrier / Impresszum / Impressum),",
    "és ha ott nincs, akkor egyéb publikus, hiteles forrást.",
    "",
    "TAKARÉKOSSÁG — ezt tartsd be:",
    contact.website
      ? `- NE keress a weben. A weboldal ismert: töltsd le közvetlenül a ${contact.website} oldalt, majd ha kell, a /contact, /kapcsolat, /impressum, /careers aloldalt.`
      : "- Előbb keresd meg a cég hivatalos oldalát, aztán azon dolgozz.",
    "- Legfeljebb 3 oldalt tölts le. Ha a harmadik után sincs nyom, hagyd abba.",
    "- Ha két letöltés után semmi jel nem utal címre (nincs kapcsolati oldal,",
    "  nincs mailto, nincs impresszum), NE keress tovább: adj vissza null-t.",
    "- A hosszú keresés statisztikailag úgyis eredménytelen — a gyors nemleges",
    "  válasz többet ér, mint a tízedik letöltés.",
  ]
    .filter((line) => line !== null)
    .join("\n");
}

const SYSTEM = `Cégek publikus e-mail címét kutatod fel a weben.

KEMÉNY SZABÁLYOK:
- SOHA ne találj ki címet. Ne tippelj mintából (pl. "info@" + domain), ha nem láttad leírva.
- Csak olyan címet adj vissza, amit egy konkrét, megnyitott oldalon láttál, és
  add meg annak az oldalnak a pontos URL-jét.
- Ha csak jelentkezési űrlap van, e-mail nincs: email legyen null, és az
  applyUrl mezőbe tedd az űrlap URL-jét.
- SOHA ne hallgass el olyan címet, amit láttál. Ha csak általános cím van
  (info@, office@, kontakt@), az is menjen be — vagy az "email" mezőbe, vagy az
  "alternatives" listába, "label" mezőben odaírva, mire való ("általános cím",
  "német anyacég", "sajtó"). A döntést a felhasználóra bízod, nem szűröd meg.
- Anyacég / testvércég / másik ország címe is jöhet alternatívaként, csak
  jelöld a label-ben.
- A confidence akkor "high", ha a cég SAJÁT oldalán találtad; "medium", ha
  megbízható harmadik forráson; "low", ha bizonytalan az egyezés (pl. hasonló nevű cég).
- Ha a talált cím nem ehhez a céghez tartozik, inkább adj vissza null-t.
- A "nem találtam" teljes értékű válasz. Ne próbálkozz tovább csak azért, hogy
  legyen valami: 2-3 megnyitott oldal után zárd le a keresést.

Válasz KIZÁRÓLAG JSON, magyarázat nélkül:
{"email": "cím vagy null", "confidence": "high|medium|low", "source": "URL vagy null",
 "alternatives": [{"email": "...", "source": "URL", "label": "mire való"}],
 "applyUrl": "URL vagy null", "notes": "1-2 mondat magyarul: mit találtál, mit nem"}`;

interface ResponsesPayload {
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    input_tokens_details?: { cached_tokens?: number };
  };
  output?: {
    type?: string;
    content?: {
      type?: string;
      text?: string;
      annotations?: { type?: string; url?: string }[];
    }[];
  }[];
  error?: { message?: string };
}

/** A Responses API válaszából a szöveg és a hivatkozott URL-ek. */
function readOutput(data: ResponsesPayload): { text: string; citations: string[] } {
  const chunks: string[] = [];
  const citations: string[] = [];

  for (const item of data.output ?? []) {
    for (const part of item.content ?? []) {
      if (part.type === "output_text" && part.text) chunks.push(part.text);
      for (const annotation of part.annotations ?? []) {
        if (annotation.url) citations.push(annotation.url);
      }
    }
  }

  return { text: chunks.join("\n").trim(), citations: [...new Set(citations)] };
}

async function callResponses(
  key: string,
  tool: "web_search" | "web_search_preview",
  contact: ContactDoc,
): Promise<Response> {
  return fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: SEARCH_MODEL,
      tools: [{ type: tool }],
      tool_choice: "auto",
      input: [
        { role: "system", content: SYSTEM },
        { role: "user", content: buildPrompt(contact) },
      ],
    }),
  });
}

function parseJson(raw: string): Record<string, unknown> {
  const cleaned = raw
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("Az OpenAI válasza nem JSON.");
  return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
}

export type SearchProvider = "openai" | "claude" | "codex";

/** Alapértelmezett motor, ha a hívó nem választ: "openai" vagy "claude". */
export function searchProvider(): SearchProvider {
  const configured = credential("EMAIL_SEARCH_PROVIDER", "openai").toLowerCase();
  if (configured === "claude") return "claude";
  if (configured === "codex") return "codex";
  return "openai";
}

/** Csak azok a motorok, amik ezen a gépen tényleg használhatók. */
export function availableProviders(): SearchProvider[] {
  const list: SearchProvider[] = [];
  if (openAiKey().length > 0) list.push("openai");
  // A CLI-k meglétét nem itt ellenőrizzük: a hívás úgyis beszédes hibát ad.
  list.push("claude", "codex");
  return list;
}

/** Hívásonként újrahasznosítható hibaüzenet az OpenAI válaszából. */
function errorMessage(status: number, detail: string): string {
  let message = `OpenAI hiba (${status})`;
  try {
    const parsed = JSON.parse(detail) as { error?: { message?: string } };
    if (parsed.error?.message) message += `: ${parsed.error.message}`;
  } catch {
    // marad a státuszkód
  }
  return message;
}

/** Egy Responses API hívás tetszőleges prompttal. */
async function callResponsesRaw(
  key: string,
  tool: "web_search" | "web_search_preview",
  prompt: string,
): Promise<Response> {
  return fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: SEARCH_MODEL,
      tools: [{ type: tool }],
      tool_choice: "auto",
      input: [
        { role: "system", content: SYSTEM },
        { role: "user", content: prompt },
      ],
    }),
  });
}

/** Nyers modellválasz → ellenőrzött EmailFinding. Hibás címet eldob. */
/**
 * A javasolt további címek egységesítése: kisbetűs alak, formai ellenőrzés, a
 * fő cím kiszűrése — és **egy cím csak egyszer**. A kereső modellek gyakran
 * felsorolják ugyanazt a címet több forrással; ha ez így kerül a felületre,
 * React kulcsütközést és értelmetlen duplasort okoz.
 */
function uniqueAlternatives(
  raw: unknown,
  primary: string | null,
): EmailCandidate[] {
  if (!Array.isArray(raw)) return [];

  const byEmail = new Map<string, EmailCandidate>();
  for (const item of raw as Record<string, unknown>[]) {
    const email = String(item.email ?? "").trim().toLowerCase();
    if (!EMAIL_RX.test(email) || email === primary || byEmail.has(email)) continue;
    byEmail.set(email, {
      email,
      source: typeof item.source === "string" ? item.source : null,
      label: typeof item.label === "string" ? item.label : null,
    });
  }
  return [...byEmail.values()];
}

export function normaliseFinding(
  parsed: Record<string, unknown>,
  model: string,
  citations: string[] = [],
): EmailFinding {
  const email =
    typeof parsed.email === "string" ? parsed.email.trim().toLowerCase() : null;
  const alternatives = uniqueAlternatives(parsed.alternatives, email);

  return {
    email: email && EMAIL_RX.test(email) ? email : null,
    confidence: ["high", "medium", "low"].includes(String(parsed.confidence))
      ? (parsed.confidence as EmailFinding["confidence"])
      : "low",
    source: typeof parsed.source === "string" && parsed.source ? parsed.source : null,
    alternatives,
    applyUrl:
      typeof parsed.applyUrl === "string" && parsed.applyUrl ? parsed.applyUrl : null,
    notes: typeof parsed.notes === "string" ? parsed.notes : "",
    citations,
    model,
  };
}

/** Több cég, EGY hívás — cégenként külön eredménnyel. */
export async function findEmailsBatch(
  contacts: ContactDoc[],
  provider: SearchProvider = searchProvider(),
): Promise<BatchFinding[]> {
  if (!contacts.length) return [];

  const done = log.step(`köteg: ${contacts.length} cég, egy hívás`, {
    provider,
    cegek: contacts.map((contact) => contact.company),
  });

  if (provider === "claude" || provider === "codex") {
    const findings =
      provider === "claude"
        ? await (await import("./emailFinderClaude")).findEmailsBatchWithClaudeCli(contacts)
        : await (await import("./emailFinderCodex")).findEmailsBatchWithCodexCli(contacts);
    done(`${findings.filter((f) => f.email).length}/${contacts.length} címmel`);
    return findings;
  }

  const key = openAiKey();
  if (!key) {
    throw new Error(
      "Nincs OPENAI_API_KEY az atlas-credentials.env fájlban. Válts Claude motorra, vagy tedd bele a kulcsot.",
    );
  }

  const prompt = buildBatchPrompt(contacts);
  let response = await callResponsesRaw(key, "web_search", prompt);
  if (!response.ok) {
    const detail = await response.text();
    if (/web_search/i.test(detail)) {
      response = await callResponsesRaw(key, "web_search_preview", prompt);
    } else {
      throw new Error(errorMessage(response.status, detail));
    }
  }
  if (!response.ok) {
    throw new Error(errorMessage(response.status, await response.text()));
  }

  const data = (await response.json()) as ResponsesPayload;
  logToolActivity(data);
  const { text, citations } = readOutput(data);
  if (!text) throw new Error("Az OpenAI üres választ adott.");

  const findings = matchBatch(contacts, parseJsonArray(text), SEARCH_MODEL, citations);
  done(`${findings.filter((finding) => finding.email).length}/${contacts.length} címmel`);
  return findings;
}

/** A modell tömbjét a kért sorrendhez kötjük — index, majd cégnév alapján. */
export function matchBatch(
  contacts: ContactDoc[],
  rows: Record<string, unknown>[],
  model: string,
  citations: string[] = [],
): BatchFinding[] {
  return contacts.map((contact, index) => {
    const row =
      rows.find((item) => Number(item.index) === index + 1) ??
      rows.find(
        (item) =>
          String(item.company ?? "").trim().toLowerCase() ===
          contact.company.trim().toLowerCase(),
      ) ??
      rows[index];

    const finding = row
      ? normaliseFinding(row, model, citations)
      : {
          email: null,
          confidence: "low" as const,
          source: null,
          alternatives: [],
          applyUrl: null,
          notes: "A modell nem adott vissza sort ehhez a céghez.",
          citations,
          model,
        };

    return { ...finding, index, company: contact.company };
  });
}

/**
 * Tömb kinyerése a válaszból. A modell hol tömböt ad, hol `{"results": [...]}`
 * alakot, hol csak egymás után írt objektumokat — mindhármat elfogadjuk.
 */
export function parseJsonArray(raw: string): Record<string, unknown>[] {
  const cleaned = raw.replace(/```(?:json)?/gi, "").trim();

  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start !== -1 && end > start) {
    try {
      const parsed = JSON.parse(cleaned.slice(start, end + 1)) as unknown;
      if (Array.isArray(parsed)) return parsed as Record<string, unknown>[];
    } catch {
      // megyünk tovább a lazább próbákra
    }
  }

  const objectStart = cleaned.indexOf("{");
  const objectEnd = cleaned.lastIndexOf("}");
  if (objectStart !== -1 && objectEnd > objectStart) {
    try {
      const parsed = JSON.parse(cleaned.slice(objectStart, objectEnd + 1)) as Record<
        string,
        unknown
      >;
      for (const value of Object.values(parsed)) {
        if (Array.isArray(value)) return value as Record<string, unknown>[];
      }
      if (parsed.company || parsed.email !== undefined) return [parsed];
    } catch {
      // marad az utolsó próba
    }
  }

  // Egymás után írt, nem tömbbe zárt objektumok.
  const rows: Record<string, unknown>[] = [];
  for (const match of cleaned.matchAll(/\{[^{}]*"(?:email|company)"[^{}]*\}/g)) {
    try {
      rows.push(JSON.parse(match[0]) as Record<string, unknown>);
    } catch {
      // hibás darabot kihagyunk
    }
  }
  if (rows.length) return rows;

  throw new Error(
    `A válasz nem JSON tömb. Amit kaptam: ${cleaned.slice(0, 200)}`,
  );
}

export async function findEmail(
  contact: ContactDoc,
  provider: SearchProvider = searchProvider(),
  /** Honnan indult: `kezi`, `sweep`, `felvetel` — a /usage oldal ezt bontja. */
  origin = "kezi",
): Promise<EmailFinding> {
  const done = log.step(`e-mail keresés: ${contact.company}`, {
    provider,
    website: contact.website,
    country: contact.country,
  });

  const started = Date.now();
  try {
    // Először modell nélkül: ha a cég oldalán ott a cím, azt tokenből nem
    // fizetjük ki. Csak akkor megy tovább a motorra, ha itt nincs találat.
    const scraped = await scrapeFirst(contact, origin);
    if (scraped) {
      done(`talált (letöltésből): ${scraped.email}`, { source: scraped.source });
      return scraped;
    }

    const finding = await runSingleSearch(contact, provider);
    done(
      finding.email ? `talált: ${finding.email} (${finding.confidence})` : "nem talált címet",
      { source: finding.source, alternatives: finding.alternatives.length },
    );
    // A mérést megvárjuk: így a hívó a sorra is rá tudja írni, mibe került.
    finding.usage = await trackUsage(contact, provider, origin, finding, Date.now() - started);
    return finding;
  } catch (error) {
    log.error(`keresés hiba: ${contact.company}`, (error as Error).message);
    throw error;
  }
}


/**
 * Modell nélküli kísérlet. Csak akkor ad vissza találatot, ha a cím a cég saját
 * domainjén van — idegen domainű címnél inkább jöjjön a modell, az meg tudja
 * ítélni, hogy tényleg ehhez a céghez tartozik-e.
 */
async function scrapeFirst(
  contact: ContactDoc,
  origin: string,
): Promise<EmailFinding | null> {
  if (credential("EMAIL_SCRAPE_FIRST", "1") === "0") return null;
  if (!contact.website) return null;

  const { scrapeEmail } = await import("./scrapeEmail");
  const result = await scrapeEmail(contact);
  if (!result.email) return null;

  const host = (() => {
    try {
      return new URL(contact.website!).host.replace(/^www\./, "");
    } catch {
      return "";
    }
  })();
  if (!host || !result.email.endsWith(`@${host}`)) return null;

  const usage: SearchUsage = {
    provider: "scrape",
    model: "http+regex",
    inputTokens: 0,
    outputTokens: 0,
    cacheWriteTokens: 0,
    cacheReadTokens: 0,
    totalTokens: 0,
    costUsd: 0,
    ms: result.ms,
    turns: null,
    webSearch: 0,
    webFetch: result.pages,
  };

  await recordUsage({
    ...usage,
    at: new Date().toISOString(),
    contactId: contact._id,
    company: contact.company,
    found: true,
    origin,
  });

  return {
    email: result.email,
    confidence: "high",
    source: result.source,
    alternatives: result.candidates
      .filter((candidate) => candidate.email !== result.email)
      .slice(0, 8)
      .map((candidate) => ({
        email: candidate.email,
        source: candidate.source,
        label: candidate.label,
      })),
    applyUrl: null,
    notes: `A cég oldaláról, modell nélkül (${result.pages} oldal, ${Math.round(result.ms / 1000)} mp).`,
    citations: [...new Set(result.candidates.map((candidate) => candidate.source))].slice(0, 5),
    model: "http+regex",
    usage,
  };
}

/** A keresés mérése: a motor saját számlálóiból, egységes alakra hozva. */
async function trackUsage(
  contact: ContactDoc,
  provider: SearchProvider,
  origin: string,
  finding: EmailFinding,
  ms: number,
): Promise<SearchUsage | null> {
  let usage: SearchUsage | null = null;

  if (provider === "claude" || provider === "codex") {
    const { takeLastStats } =
      provider === "claude"
        ? await import("./emailFinderClaude")
        : await import("./emailFinderCodex");
    const stats = takeLastStats();
    if (stats) usage = { provider, ...stats };
  } else if (lastOpenAiStats) {
    const stats = lastOpenAiStats;
    lastOpenAiStats = null;
    usage = {
      provider,
      model: finding.model,
      inputTokens: stats.inputTokens,
      outputTokens: stats.outputTokens,
      cacheWriteTokens: 0,
      cacheReadTokens: stats.cacheReadTokens,
      totalTokens: stats.inputTokens + stats.outputTokens,
      costUsd: null,
      ms,
      turns: null,
      webSearch: stats.searches,
      webFetch: null,
    };
  }

  if (!usage) return null;

  await recordUsage({
    ...usage,
    at: new Date().toISOString(),
    contactId: contact._id,
    company: contact.company,
    found: Boolean(finding.email),
    origin,
  });
  return usage;
}

async function runSingleSearch(
  contact: ContactDoc,
  provider: SearchProvider,
): Promise<EmailFinding> {
  // Késleltetett import: a CLI-s ágak node:child_process-t használnak.
  if (provider === "claude") {
    const { findEmailWithClaudeCli } = await import("./emailFinderClaude");
    return findEmailWithClaudeCli(contact);
  }
  if (provider === "codex") {
    const { findEmailWithCodexCli } = await import("./emailFinderCodex");
    return findEmailWithCodexCli(contact);
  }

  const key = openAiKey();
  if (!key) {
    throw new Error(
      "Nincs OPENAI_API_KEY az atlas-credentials.env fájlban. Tedd bele, majd indítsd újra a szervert.",
    );
  }

  // A webkeresés eszköz neve modellenként más — ha az egyiket nem ismeri, jön a másik.
  let response = await callResponses(key, "web_search", contact);
  if (!response.ok) {
    const detail = await response.text();
    if (/web_search/i.test(detail)) {
      response = await callResponses(key, "web_search_preview", contact);
    } else {
      let message = `OpenAI hiba (${response.status})`;
      try {
        const parsed = JSON.parse(detail) as { error?: { message?: string } };
        if (parsed.error?.message) message += `: ${parsed.error.message}`;
      } catch {
        // marad a státuszkód
      }
      throw new Error(message);
    }
  }

  if (!response.ok) {
    const detail = await response.text();
    let message = `OpenAI hiba (${response.status})`;
    try {
      const parsed = JSON.parse(detail) as { error?: { message?: string } };
      if (parsed.error?.message) message += `: ${parsed.error.message}`;
    } catch {
      // marad a státuszkód
    }
    throw new Error(message);
  }

  const data = (await response.json()) as ResponsesPayload;
  logToolActivity(data);
  const { text, citations } = readOutput(data);
  if (!text) throw new Error("Az OpenAI üres választ adott.");

  const parsed = parseJson(text);

  const email = typeof parsed.email === "string" ? parsed.email.trim().toLowerCase() : null;
  const alternatives = uniqueAlternatives(parsed.alternatives, email);

  const confidence = ["high", "medium", "low"].includes(String(parsed.confidence))
    ? (parsed.confidence as EmailFinding["confidence"])
    : "low";

  return {
    // Formailag hibás címet inkább eldobunk, mint hogy bekerüljön az adatbázisba.
    email: email && EMAIL_RX.test(email) ? email : null,
    confidence,
    source: typeof parsed.source === "string" && parsed.source ? parsed.source : null,
    alternatives,
    applyUrl: typeof parsed.applyUrl === "string" && parsed.applyUrl ? parsed.applyUrl : null,
    notes: typeof parsed.notes === "string" ? parsed.notes : "",
    citations,
    model: SEARCH_MODEL,
  };
}
