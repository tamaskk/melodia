/**
 * E-mail keresés az Anthropic API-val (Claude), szerveroldali webkereséssel
 * és oldalletöltéssel.
 *
 * Adapter: a hívás, a JSON-kinyerés és a mérés itt marad; kifelé ugyanazt az
 * `EmailFinding` / `BatchFinding` alakot adja, mint a többi motor. A helyi
 * CLI-vel szemben ez API-díjból megy (`ANTHROPIC_API_KEY`), viszont a gépen
 * semmi nem kell hozzá — Vercelen is fut.
 */
import Anthropic from "@anthropic-ai/sdk";
import { credential } from "./env";
import {
  BATCH_RULES,
  buildBatchPrompt,
  contactBrief,
  matchBatch,
  normaliseFinding,
  parseJsonArray,
  type BatchFinding,
  type EmailFinding,
} from "./emailFinder";
import { createLogger } from "./logger";
import type { ContactDoc } from "./types";
import type { SearchUsage } from "./usage";

const log = createLogger("claude-api");

/** Alapból Opus 5.5; olcsóbbra: `ANTHROPIC_SEARCH_MODEL=claude-sonnet-5-5` vagy `claude-haiku-5-5`. */
const MODEL = credential("ANTHROPIC_SEARCH_MODEL", "claude-opus-5-5");
const EFFORT = credential("ANTHROPIC_SEARCH_EFFORT", "medium") as
  "low" | "medium" | "high";
/** Ennyiszer folytatjuk a szerveroldali eszközök miatt megszakított kört. */
const MAX_RESUMES = 4;

/** USD / millió token — becsléshez; ismeretlen modellnél nincs ár. */
const PRICES: Record<
  string,
  { input: number; output: number; cacheRead: number }
> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01 },
};
/** Webkeresés: 10 USD / 1000 keresés. */
const SEARCH_PRICE = 0.01;

export type ClaudeApiStats = Omit<SearchUsage, "provider">;

let lastStats: ClaudeApiStats | null = null;

/** Az utolsó hívás mérése — a hívó egyszer veszi el, ahogy a CLI-s motoroknál. */
export function takeLastStats(): ClaudeApiStats | null {
  const stats = lastStats;
  lastStats = null;
  return stats;
}

export function isClaudeApiReady(): boolean {
  return credential("ANTHROPIC_API_KEY").length > 0;
}

let client: Anthropic | null = null;

function api(): Anthropic {
  const apiKey = credential("ANTHROPIC_API_KEY");
  if (!apiKey) {
    throw new Error(
      "Nincs ANTHROPIC_API_KEY az atlas-credentials.env fájlban. Tedd bele egy sorba, majd indítsd újra a szervert.",
    );
  }
  client ??= new Anthropic({ apiKey, timeout: 180_000, maxRetries: 2 });
  return client;
}

/** Az SDK hibájából emberi mondat: mit tegyen a felhasználó. */
function humanError(error: unknown): Error {
  if (error instanceof Anthropic.AuthenticationError) {
    return new Error(
      "Az Anthropic nem fogadta el az ANTHROPIC_API_KEY-t — nézd meg a kulcsot az atlas-credentials.env-ben.",
    );
  }
  if (error instanceof Anthropic.PermissionDeniedError) {
    return new Error(
      `Az Anthropic-fióknak nincs joga ehhez (${MODEL}, webkeresés) — nézd meg a Console-ban: ${error.message}`,
    );
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new Error(
      "Az Anthropic API korlátozza a kéréseket (429) — várj egy kicsit, vagy lassíts a sweepen.",
    );
  }
  if (error instanceof Anthropic.BadRequestError) {
    return /credit balance/i.test(error.message)
      ? new Error(
          "Elfogyott az Anthropic-egyenleg — tölts fel a Console Billing oldalán.",
        )
      : new Error(`Az Anthropic API elutasította a kérést: ${error.message}`);
  }
  if (error instanceof Anthropic.APIError) {
    return new Error(`Anthropic API hiba (${error.status}): ${error.message}`);
  }
  return error instanceof Error ? error : new Error(String(error));
}

function estimateCost(
  model: string,
  usage: {
    input: number;
    output: number;
    cacheWrite: number;
    cacheRead: number;
    searches: number;
  },
): number | null {
  const price = PRICES[model];
  if (!price) return null;
  return (
    (usage.input * price.input +
      usage.cacheWrite * price.input * 1.25 +
      usage.cacheRead * price.cacheRead +
      usage.output * price.output) /
      1_000_000 +
    usage.searches * SEARCH_PRICE
  );
}

/**
 * Egy kérdés a webes eszközökkel; a szöveges választ és a hivatkozott
 * URL-eket adja vissza. A `pause_turn`-t (hosszú szerveroldali kör) folytatja.
 */
async function ask(
  prompt: string,
  maxSearches: number,
): Promise<{ text: string; citations: string[]; model: string }> {
  const started = Date.now();
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    { role: "user", content: prompt },
  ];
  const totals = {
    input: 0,
    output: 0,
    cacheWrite: 0,
    cacheRead: 0,
    searches: 0,
    fetches: 0,
  };
  let turns = 0;
  let response: Anthropic.Beta.BetaMessage;
  let model = MODEL;

  try {
    for (;;) {
      response = await api().beta.messages.create({
        model: MODEL,
        max_tokens: 16_000,
        // Elutasításnál a szerver maga vált modellt (Opus 5.5 / Sonnet 5.5).
        ...(MODEL.startsWith("claude-haiku")
          ? {}
          : {
              betas: ["server-side-fallback-2026-07-01"],
              fallbacks: "default" as const,
            }),
        output_config: { effort: EFFORT },
        tools: [
          {
            type: "web_search_20260209",
            name: "web_search",
            max_uses: maxSearches,
          },
          {
            type: "web_fetch_20260209",
            name: "web_fetch",
            max_uses: maxSearches + 2,
          },
        ],
        messages,
      });
      turns += 1;
      model = response.model;
      const usage = response.usage;
      totals.input += usage.input_tokens;
      totals.output += usage.output_tokens;
      totals.cacheWrite += usage.cache_creation_input_tokens ?? 0;
      totals.cacheRead += usage.cache_read_input_tokens ?? 0;
      totals.searches += usage.server_tool_use?.web_search_requests ?? 0;
      totals.fetches += usage.server_tool_use?.web_fetch_requests ?? 0;

      if (response.stop_reason !== "pause_turn" || turns > MAX_RESUMES) break;
      messages.push({ role: "assistant", content: response.content });
    }
  } catch (error) {
    throw humanError(error);
  }

  lastStats = {
    model,
    inputTokens: totals.input,
    outputTokens: totals.output,
    cacheWriteTokens: totals.cacheWrite,
    cacheReadTokens: totals.cacheRead,
    totalTokens:
      totals.input + totals.cacheWrite + totals.cacheRead + totals.output,
    costUsd: estimateCost(model, totals),
    ms: Date.now() - started,
    turns,
    webSearch: totals.searches,
    webFetch: totals.fetches,
  };
  log.debug("válasz", {
    model,
    stop: response.stop_reason,
    kor: turns,
    kereses: totals.searches,
    letoltes: totals.fetches,
    usd: lastStats.costUsd,
  });

  if (response.stop_reason === "refusal") {
    log.warn("a modell elutasította a kérést", {
      kategoria: response.stop_details?.category ?? null,
    });
    return { text: "", citations: [], model };
  }

  const chunks: string[] = [];
  const citations = new Set<string>();
  for (const block of response.content) {
    if (block.type !== "text") continue;
    chunks.push(block.text);
    for (const citation of block.citations ?? []) {
      if ("url" in citation && typeof citation.url === "string") {
        citations.add(citation.url);
      }
    }
  }
  return { text: chunks.join("").trim(), citations: [...citations], model };
}

function parseObject(raw: string): Record<string, unknown> | null {
  const cleaned = raw.replace(/```(?:json)?/gi, "").trim();
  const start =
    cleaned.lastIndexOf('{"email"') >= 0
      ? cleaned.lastIndexOf('{"email"')
      : cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function buildPrompt(contact: ContactDoc): string {
  return [
    "Keresd meg ennek a cégnek a publikus, jelentkezésre használható e-mail címét.",
    "",
    contactBrief(contact),
    "",
    contact.website
      ? `Kezdd a cég saját oldalával (${contact.website}): Kapcsolat / Karrier / Impresszum / Impressum. Csak akkor keress a weben, ha ott nincs.`
      : "Előbb keresd meg a cég hivatalos oldalát, aztán azon dolgozz.",
    "Prioritás: karrier/HR cím (jobs@, karrier@, hr@, allas@) > általános cím (info@, office@, hello@).",
    "A „nem találtam” teljes értékű válasz: 2-3 megnyitott oldal után zárd le a keresést.",
    "",
    BATCH_RULES,
    "",
    "A válaszod utolsó része KIZÁRÓLAG ez a JSON legyen, kódblokk nélkül:",
    '{"email":"cím vagy null","confidence":"high|medium|low","source":"URL vagy null",',
    ' "alternatives":[{"email":"...","source":"URL","label":"mire való"}],',
    ' "applyUrl":"URL vagy null","notes":"1-2 mondat magyarul"}',
  ].join("\n");
}

export async function findEmailWithClaudeApi(
  contact: ContactDoc,
): Promise<EmailFinding> {
  const { text, citations, model } = await ask(buildPrompt(contact), 3);
  const parsed = parseObject(text);
  if (!parsed) {
    log.info(`${contact.company}: nincs értelmezhető JSON — nincs cím`);
    return normaliseFinding(
      {
        email: null,
        confidence: "low",
        notes: text
          ? "A Claude nem adott értelmezhető választ — nincs cím."
          : "A Claude nem válaszolt erre a cégre (elutasítás vagy üres válasz).",
      },
      model,
      citations,
    );
  }
  return normaliseFinding(parsed, model, citations);
}

/**
 * Általános webes kérdés egy JSON objektumért — a kapcsolattartó-keresés ezt
 * hívja. Értelmezhetetlen válasznál `null`, a hívó üres eredménynek veszi.
 */
export async function runClaudeApiSearch(
  prompt: string,
): Promise<{ parsed: Record<string, unknown> | null; model: string }> {
  const { text, model } = await ask(prompt, 5);
  const cleaned = text.replace(/```(?:json)?/gi, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end <= start) return { parsed: null, model };
  try {
    return {
      parsed: JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>,
      model,
    };
  } catch {
    return { parsed: null, model };
  }
}

/** Több cég egy hívásban — a webkeresések száma a cégek számával nő. */
export async function findEmailsBatchWithClaudeApi(
  contacts: ContactDoc[],
): Promise<BatchFinding[]> {
  const { text, citations, model } = await ask(
    buildBatchPrompt(contacts),
    Math.min(30, contacts.length * 3),
  );
  return matchBatch(contacts, parseJsonArray(text), model, citations);
}
