/**
 * Kapcsolattartó-keresés az OpenAI Responses API webkeresésével.
 *
 * Gyorsabb, mint a helyi CLI (~10-20 mp), viszont API-díjas. A prompt és a
 * válasz alakja ugyanaz, mint a CLI-s ágon — a `normalisePeople` mindkettőt
 * ugyanúgy ellenőrzi.
 */
import { credential } from "./env";
import { createLogger } from "./logger";
import { OPENAI_MODEL, openAiKey } from "./openai";
import {
  buildPeoplePrompt,
  normalisePeople,
  type PeopleFinding,
} from "./peopleFinder";
import { recordUsage } from "./usage";
import type { ContactDoc } from "./types";

const log = createLogger("kapcsolattarto:openai");

const SEARCH_MODEL = credential("OPENAI_SEARCH_MODEL", OPENAI_MODEL);

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

function readOutput(data: ResponsesPayload): {
  text: string;
  citations: string[];
} {
  let text = "";
  const citations = new Set<string>();

  for (const item of data.output ?? []) {
    for (const part of item.content ?? []) {
      if (part.type === "output_text" && part.text) text += part.text;
      for (const annotation of part.annotations ?? []) {
        if (annotation.url) citations.add(annotation.url);
      }
    }
  }
  return { text, citations: [...citations] };
}

function parseJson(raw: string): Record<string, unknown> {
  const cleaned = raw.replace(/```(?:json)?/gi, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1)
    throw new Error("Az OpenAI válasza nem JSON.");
  return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
}

export async function findPeopleWithOpenAi(
  contact: ContactDoc,
): Promise<PeopleFinding> {
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
      input: buildPeoplePrompt(contact),
    }),
  });

  const data = (await response.json()) as ResponsesPayload;
  if (!response.ok || data.error) {
    throw new Error(data.error?.message ?? `OpenAI hiba (${response.status})`);
  }

  const { text, citations } = readOutput(data);
  if (!text) throw new Error("Az OpenAI üres választ adott.");

  const finding = normalisePeople(parseJson(text), SEARCH_MODEL, citations);
  const inputTokens = data.usage?.input_tokens ?? 0;
  const outputTokens = data.usage?.output_tokens ?? 0;

  log.info(`${contact.company}: ${finding.people.length} fő`, {
    input_tokens: inputTokens,
    output_tokens: outputTokens,
  });

  const usage = {
    provider: "openai" as const,
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

  await recordUsage({
    ...usage,
    at: new Date().toISOString(),
    contactId: contact._id,
    company: contact.company,
    found: finding.people.length > 0,
    origin: "openai-emberek",
  });

  return { ...finding, usage };
}
