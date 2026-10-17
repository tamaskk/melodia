/**
 * Startupok keresése a weben, az OpenAI Responses API webkeresésével.
 *
 * Adapter: kifelé csak `FoundStartup`-ot ad, a hívás és a JSON-ellenőrzés itt
 * marad. A modell csak olyan céget adhat vissza, amit a weben talált — a
 * weboldal nélküli sorokat eldobjuk, mert azt nem tudjuk ellenőrizni.
 */
import { credential } from "./env";
import { createLogger } from "./logger";
import { OPENAI_MODEL, openAiKey } from "./openai";
import { recordUsage, type SearchUsage } from "./usage";

const log = createLogger("startup-kereses");

const SEARCH_MODEL = credential("OPENAI_SEARCH_MODEL", OPENAI_MODEL);

export interface FoundStartup {
  name: string;
  website: string;
  /** Kétbetűs ISO-kód, ha a modell tudta. */
  country: string | null;
  city: string | null;
  founded: number | null;
  employees: string | null;
  industry: string | null;
  description: string | null;
  funding: string | null;
  /** Felvételre utaló jel (nyitott állás, bővülés) — ha talált ilyet. */
  hiringSignal: string | null;
  sourceUrl: string | null;
}

export interface StartupSearch {
  /** Mit keressen, szabad szöveggel: "B2B SaaS", "fintech Berlinben"… */
  focus: string;
  /** Kétbetűs kódok; üres = bárhol. */
  countries: string[];
  /** Ebben a körben milyen szemmel keressen — körönként változik. */
  angle: string;
  count: number;
  /** Ezeket már láttuk — ne hozza újra. */
  exclude: string[];
}

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

function buildPrompt(search: StartupSearch): string {
  const where = search.countries.length
    ? `headquartered in one of these countries (ISO codes): ${search.countries.join(", ")}`
    : "headquartered anywhere in Europe or North America";
  return [
    `Use web search to find ${search.count} real, currently operating startups ${where}. Return ${search.count} if at all possible — prefer lesser-known startups over famous ones.`,
    search.focus ? `Focus: ${search.focus}.` : "",
    `Search angle for this round: ${search.angle}.`,
    "A startup here means: founded 2016 or later, roughly 2-250 employees, building its own software product.",
    "Exclude recruitment agencies, staffing firms, consultancies, outsourcing/dev shops and large corporations.",
    search.exclude.length
      ? `Do NOT return any of these companies (already known): ${search.exclude.join("; ")}.`
      : "",
    "Only include companies you actually found on the web, each with its real official website. Never invent companies, numbers or URLs; use null when unknown.",
    'Answer with JSON only, no prose: {"startups":[{"name":"","website":"https://…","country":"DE","city":null,"founded":2021,"employees":"11-50","industry":"","description":"one or two sentences","funding":"e.g. $6M Series A, Aug 2026","hiringSignal":"e.g. 3 open backend roles on careers page","sourceUrl":"page where you found it"}]}',
  ]
    .filter(Boolean)
    .join("\n");
}

function readOutput(data: ResponsesPayload): string {
  let text = "";
  for (const item of data.output ?? []) {
    for (const part of item.content ?? []) {
      if (part.type === "output_text" && part.text) text += part.text;
    }
  }
  return text;
}

const str = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

function normalise(raw: string): FoundStartup[] {
  const cleaned = raw.replace(/```(?:json)?/gi, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1)
    throw new Error("Az OpenAI válasza nem JSON.");
  const parsed = JSON.parse(cleaned.slice(start, end + 1)) as {
    startups?: unknown;
  };
  if (!Array.isArray(parsed.startups)) return [];

  return parsed.startups.flatMap((item): FoundStartup[] => {
    const row = item as Record<string, unknown>;
    const name = str(row.name);
    const website = str(row.website);
    if (!name || !website || !/^https?:\/\/[^\s/]+\.[^\s/]+/i.test(website)) {
      return [];
    }
    const country = str(row.country)?.toUpperCase() ?? null;
    const founded = Number(row.founded);
    return [
      {
        name,
        website,
        country: country && /^[A-Z]{2}$/.test(country) ? country : null,
        city: str(row.city),
        founded: Number.isInteger(founded) && founded > 1900 ? founded : null,
        employees:
          str(row.employees) ??
          (Number(row.employees) ? String(row.employees) : null),
        industry: str(row.industry),
        description: str(row.description),
        funding: str(row.funding),
        hiringSignal: str(row.hiringSignal),
        sourceUrl: str(row.sourceUrl),
      },
    ];
  });
}

export function isStartupSearchReady(): boolean {
  return openAiKey().length > 0;
}

export async function findStartups(
  search: StartupSearch,
): Promise<{ startups: FoundStartup[]; usage: SearchUsage }> {
  const key = openAiKey();
  if (!key) {
    throw new Error(
      "Nincs OPENAI_API_KEY az atlas-credentials.env fájlban. Tedd bele, majd indítsd újra a szervert.",
    );
  }

  const started = Date.now();
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: SEARCH_MODEL,
      tools: [{ type: "web_search" }],
      input: buildPrompt(search),
    }),
  });
  const data = (await response.json()) as ResponsesPayload;
  if (!response.ok || data.error) {
    throw new Error(
      `Az OpenAI webkeresés nem sikerült: ${data.error?.message ?? `HTTP ${response.status}`}`,
    );
  }

  const startups = normalise(readOutput(data));
  const inputTokens = data.usage?.input_tokens ?? 0;
  const outputTokens = data.usage?.output_tokens ?? 0;
  const usage: SearchUsage = {
    provider: "openai",
    model: SEARCH_MODEL,
    inputTokens,
    outputTokens,
    cacheWriteTokens: 0,
    cacheReadTokens: data.usage?.input_tokens_details?.cached_tokens ?? 0,
    totalTokens: inputTokens + outputTokens,
    costUsd: null,
    ms: Date.now() - started,
    turns: null,
    webSearch: null,
    webFetch: null,
  };
  log.info(`${startups.length} startup`, {
    angle: search.angle,
    ms: usage.ms,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
  });
  await recordUsage({
    ...usage,
    at: new Date().toISOString(),
    contactId: null,
    company: `startupkeresés: ${search.focus || "általános"}`,
    found: startups.length > 0,
    origin: "openai-startupok",
  });
  return { startups, usage };
}
