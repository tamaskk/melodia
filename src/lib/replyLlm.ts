/**
 * Válaszlevél-piszkozat a FreeLLMAPI-n át (OpenAI-kompatibilis végpont).
 *
 * Adapter: csak a draft szövegét írja. A kijelölés, az átnézés, a csatolmány
 * és a küldés a Melodia dolga. A provider-szintű hibákat (429, 5xx, limit) a
 * FreeLLMAPI maga kezeli a `auto:reply` láncban; itt csak az számít, ha maga
 * a FreeLLMAPI nem válaszol, vagy a teljes lánc kimerült.
 *
 * Figyelem: a szál szövege free providerekhez megy ki, és egy részük az inputot
 * tréningre használhatja. Érzékeny levélváltást kézzel válaszolj meg.
 */
import { credential } from "./env";
import { createLogger } from "./logger";
import { stripQuoted, type MailMessage } from "./mailStore";
import { PROFILE, shortIntro } from "./profile";

const log = createLogger("freellm");

const TIMEOUT_MS = 60_000;
/** Hibás JSON vagy kitöltendő hely esetén ennyiszer kérünk újat. */
const ATTEMPTS = 3;
/** A szál eddig fér a promptba; ha hosszabb, a legrégebbi levelek esnek ki. */
const THREAD_CHARS = 12_000;
const PLACEHOLDER = /\[[^\]\n]{2,}\]/;

export function isReplyLlmReady(): boolean {
  return credential("LLM_BASE_URL").length > 0;
}

function baseUrl(): string {
  return credential("LLM_BASE_URL").replace(/\/+$/, "");
}

function model(): string {
  return credential("LLM_REPLY_MODEL", "auto:reply");
}

function headers(): Record<string, string> {
  const key = credential("LLM_API_KEY");
  return {
    "Content-Type": "application/json",
    ...(key ? { Authorization: `Bearer ${key}` } : {}),
  };
}

/** A hálózati és HTTP-hibából emberi mondat: mit tegyen a felhasználó. */
function humanError(error: unknown, status?: number, detail = ""): Error {
  if (status === 401 || status === 403) {
    return new Error(
      "A FreeLLMAPI nem fogadta el az LLM_API_KEY-t — nézd meg a Kulcsok → Egységes API kulcs értékét az atlas-credentials.env-ben.",
    );
  }
  if (status === 429 || status === 503) {
    return new Error(
      "A FreeLLMAPI reply láncában minden modell elérte a limitjét — a limitek UTC éjfélkor (02:00) nullázódnak, vagy bővítsd a láncot.",
    );
  }
  if (/profile '.+' not found/i.test(detail)) {
    return new Error(
      `A FreeLLMAPI-ban nincs „${model()}” lánc — hozd létre (Modellek → Fallback chains, név: ${model().replace(/^auto:/, "")}), vagy írd az env-be: LLM_REPLY_MODEL=auto.`,
    );
  }
  if (status) {
    return new Error(
      `A FreeLLMAPI hibát adott (${status})${detail ? `: ${detail}` : "."}`,
    );
  }
  const cause = (error as { cause?: { code?: string } })?.cause?.code;
  if (cause === "ECONNREFUSED" || cause === "ENOTFOUND") {
    return new Error(
      `A FreeLLMAPI nem érhető el (${baseUrl()}) — indítsd el, vagy javítsd az LLM_BASE_URL-t.`,
    );
  }
  if ((error as Error)?.name === "TimeoutError") {
    return new Error(
      "A FreeLLMAPI 60 másodperc alatt sem válaszolt — próbáld újra.",
    );
  }
  return error instanceof Error ? error : new Error(String(error));
}

/** Induláskor: ha a FreeLLMAPI nem fut, most derüljön ki, ne az első piszkozatnál. */
export async function assertLlmReachable(): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl()}/models`, {
      headers: headers(),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    throw humanError(error);
  }
  if (!response.ok) throw humanError(null, response.status);
}

async function chat(
  system: string,
  user: string,
): Promise<{ content: string; routedVia: string }> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl()}/chat/completions`, {
      method: "POST",
      headers: headers(),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      body: JSON.stringify({
        model: model(),
        temperature: 0.4,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
  } catch (error) {
    throw humanError(error);
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    throw humanError(null, response.status, body?.error?.message ?? "");
  }
  const data = (await response.json()) as {
    model?: string;
    choices?: { message?: { content?: string | null } }[];
  };
  return {
    content: data.choices?.[0]?.message?.content ?? "",
    // Melyik modell írta — ha egy rendszeresen gyenge, kivehető a láncból.
    routedVia: response.headers.get("x-routed-via") ?? data.model ?? model(),
  };
}

function safeJson(text: string): Record<string, unknown> | null {
  const cleaned = text.replace(/^```(?:json)?|```$/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

const SYSTEM_PROMPT = `
You draft email replies on behalf of ${PROFILE.name}, a full-stack TypeScript developer looking for work.
Rules:
- Reply in the language of the latest incoming email (Hungarian or English). Hungarian: ALWAYS formal magázás, even if the sender writes informally — never "te" forms (wrong: "eszedbe", "neked", "köszönöm, hogy írtál"; right: "eszébe", "Önnek", "köszönöm, hogy írt").
- Use ONLY facts from PROFILE and THREAD. Never invent dates, availability, salary, positions or experience.
- If a needed fact is unknown, leave it out. Never write placeholders or square brackets.
- Never correct or comment on how the sender addressed him.
- Answer what the latest incoming email actually says or asks; do not repeat earlier emails.
- You write AS ${PROFILE.name}, in first person singular. HE attaches a PDF to THIS reply: a short document about himself and his work, with a brief analysis of his projects. The recipient did NOT send any PDF. Say this in exactly one sentence, in first person, e.g. Hungarian: "Csatolok egy rövid dokumentumot magamról és a munkáimról, benne a projektjeim rövid elemzésével — hátha hasznos lehet a későbbiekben." English: "I have attached a short document about myself and my work, including a brief analysis of my projects, in case it is useful later on."
- If the sender declined (no open position), thank them for the reply, say you understand, and that you would be glad if they kept you in mind / reached out to you should something open up. The sender is the one who would reach out — keep the grammar right. Hungarian wording to use: "Ha a jövőben nyílna lehetőség, örülnék, ha gondolnának rám." English: "Should anything open up in the future, I would be glad if you kept me in mind."
- Match the tone and length of STYLE EXAMPLES. Keep it short: 3-6 sentences between greeting and sign-off.
- Address the sender by name if known, otherwise the company's team.
- Sign-off on separate lines: a closing phrase in the reply's language, then "${PROFILE.name}", then "${PROFILE.email} · ${PROFILE.phone}".
- Return ONLY JSON: {"language":"hu"|"en","body":string}.
`.trim();

function profileBlock(): string {
  return [
    shortIntro("en"),
    `Stack: ${PROFILE.stack}.`,
    `Portfolio: ${PROFILE.portfolio} · GitHub: ${PROFILE.github} · ${PROFILE.city}.`,
  ].join("\n");
}

/** A szál időrendben, idézetek nélkül; ha túl hosszú, a legrégebbi esik ki. */
export function threadBlock(messages: MailMessage[]): string {
  const parts = messages
    .filter((message) => !message.bounce)
    .map((message) => {
      const who =
        message.direction === "out"
          ? `Me (${PROFILE.name})`
          : `${message.from.name ?? ""} <${message.from.address}>`.trim();
      return `--- ${who} · ${message.date.slice(0, 10)}${message.auto ? " · auto-reply" : ""}\n${stripQuoted(message.text).trim()}`;
    });
  const kept: string[] = [];
  let size = 0;
  for (const part of [...parts].reverse()) {
    if (size + part.length > THREAD_CHARS && kept.length) break;
    kept.unshift(part.slice(0, THREAD_CHARS));
    size += part.length;
  }
  return kept.join("\n\n");
}

export interface ReplyDraftInput {
  company: string;
  senderName: string | null;
  messages: MailMessage[];
  /** Korábbi saját válaszok — ezek hangját és hosszát kövesse. */
  styleExamples: string[];
}

export interface ReplyDraftOutput {
  language: "hu" | "en";
  body: string;
  model: string;
}

function buildUserPrompt(input: ReplyDraftInput): string {
  return [
    "PROFILE:",
    profileBlock(),
    "",
    "STYLE EXAMPLES:",
    input.styleExamples.length
      ? input.styleExamples
          .map((example, index) => `#${index + 1}\n${example}`)
          .join("\n\n")
      : "(none yet — keep it short and polite)",
    "",
    `COMPANY: ${input.company}`,
    input.senderName ? `SENDER: ${input.senderName}` : "",
    "",
    "THREAD (oldest first):",
    threadBlock(input.messages),
  ].join("\n");
}

/**
 * A piszkozat: nyelv és szöveg. Hibás JSON vagy kitöltendő hely esetén újat
 * kér — a harmadik után feladja.
 */
export async function generateReplyDraft(
  input: ReplyDraftInput,
): Promise<ReplyDraftOutput> {
  const user = buildUserPrompt(input);
  let reason = "";
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    const { content, routedVia } = await chat(SYSTEM_PROMPT, user);
    const data = safeJson(content);
    const body = typeof data?.body === "string" ? data.body.trim() : "";
    const language =
      data?.language === "hu" || data?.language === "en" ? data.language : null;
    if (!language || body.length < 20) {
      reason = "hibás JSON";
    } else if (PLACEHOLDER.test(body)) {
      reason = "kitöltendő hely maradt";
    } else {
      return { language, body, model: routedVia };
    }
    log.debug(
      `${input.company}: ${reason} (${routedVia}), új próba ${attempt}/${ATTEMPTS}`,
    );
  }
  throw new Error(
    `A FreeLLMAPI ${ATTEMPTS} próbálkozás után sem adott használható piszkozatot (${reason}) — generáld újra, vagy gyengítsd a reply láncot.`,
  );
}
