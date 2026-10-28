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
import { renderTemplate } from "./replyTemplates";

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
        // Magasabb: ugyanarra a helyzetre se adja mindig ugyanazt a szöveget.
        temperature: 0.8,
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
- Reply in the language of the latest incoming email (Hungarian or English). Hungarian: mirror the sender — if they use tegezés (Szia, köszi, leveled, CV-d), reply with tegezés, plural towards the company ("pozíciótok", "felvennétek"); otherwise formal magázás ("pozíciójuk", "felvennék", "Önök"). Never mix the two in one letter.
- Use ONLY facts from PROFILE and THREAD. Never invent dates, availability, salary, positions or experience.
- If a needed fact is unknown, leave it out. Never write placeholders or square brackets.
- Never correct or comment on how the sender addressed him.
- Read the latest incoming email carefully and react to what it ACTUALLY says. Refer to at least one concrete detail from it (their reason, their team, a timeline, a question) so the reply could not be sent to anyone else. Do not repeat earlier emails.
- If the sender asks questions, answer each one directly, using only PROFILE facts. If the answer is not in PROFILE (e.g. salary, start date), say you would gladly discuss it on a short call — never invent it.
- If the sender points to their careers page / website / job board for future openings, say you will keep an eye on it, but you would also be glad if they reached out to you directly should something suitable come up.
- If the sender declined (no open position), thank them, show you understand, and say you would be glad if they kept you in mind should something open up. The sender is the one who would reach out — keep the grammar right.
- If the sender shows interest (wants a call, asks for availability, forwards the CV internally), respond to that concretely and positively instead of treating it as a rejection.
- You write AS ${PROFILE.name}, in first person singular. When ATTACHMENT is "yes", HE attaches a PDF to THIS reply: a short document about his professional background and some earlier projects with their key results. The recipient did NOT send any PDF. Mention it in one first-person sentence. When ATTACHMENT is "no", never claim anything is attached.
- Natural, polite, professional; not stiff or bureaucratic, and do not repeat yourself.
- STYLE EXAMPLES show only the tone and length to aim for. Do NOT copy their sentences or structure.
- Keep it short: 3-6 sentences between greeting and sign-off.
- Format: the greeting alone on the first line, then a blank line, then 2-4 short paragraphs (1-2 sentences each) separated by blank lines ("\\n\\n"). Never put the whole email on one line.
- Address the sender by name if known, otherwise the company's team.
- End the body with the last sentence. Do NOT write a closing phrase, name or contact details — the signature is appended automatically.
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
  /** A felhasználó kiegészítő utasítása ehhez az egy levélhez. */
  instruction?: string;
  /** Megy-e csatolmány a levélhez; alapból igen (a nyelvhez beállított fájl). */
  withAttachment?: boolean;
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
    `ATTACHMENT: ${input.withAttachment === false ? "no" : "yes"}`,
    `COMPANY: ${input.company}`,
    input.senderName ? `SENDER: ${input.senderName}` : "",
    "",
    "THREAD (oldest first):",
    threadBlock(input.messages),
    ...(input.instruction?.trim()
      ? [
          "",
          "MY INSTRUCTION FOR THIS REPLY (follow it; it overrides the content rules above, but never the facts rule):",
          input.instruction.trim(),
        ]
      : []),
  ].join("\n");
}

/** Elköszönésnek számító sor — ezzel kezdődik a modell saját aláírása. */
const SIGN_OFF =
  /^(üdvözlettel|tisztelettel|köszönettel|szép napot|best regards|kind regards|regards|best wishes|sincerely)[,.!]?$/i;

/** Mondathatár: írásjel, szóköz, nagybetű (ékezetes is — a `\\b` itt nem jó). */
const SENTENCE_END = /(?<=[.!?])\s+(?=[A-ZÁÉÍÓÖŐÚÜŰ])/;

/**
 * Ha a modell egy tömbbe írta a levelet: a megszólítás külön sorba, a többi
 * kétmondatos bekezdésekre. Ha már van benne bekezdés, nem nyúl hozzá.
 */
export function paragraphs(body: string): string {
  const text = body.replace(/\\n/g, "\n").trim();
  if (text.includes("\n\n")) return text;
  const flat = text.replace(/\s*\n\s*/g, " ");
  // A megszólítás az első „!" vagy „," -ig, ha rövid.
  const greeting = /^[^!,.?]{2,60}[!,]/.exec(flat)?.[0] ?? "";
  const sentences = flat.slice(greeting.length).trim().split(SENTENCE_END);
  const blocks: string[] = [];
  for (let index = 0; index < sentences.length; index += 2) {
    blocks.push(sentences.slice(index, index + 2).join(" "));
  }
  return [greeting, ...blocks].filter(Boolean).join("\n\n");
}

/**
 * A modell aláírását levágja, és mindig ugyanazt teszi a végére — a helyi
 * LLM néha kihagyja vagy átírja.
 */
export function withSignature(body: string, language: "hu" | "en"): string {
  const lines = body.trimEnd().split("\n");
  // Csak a levél végén keresünk, hogy egy szövegközi „Köszönettel" ne vágjon.
  const from = Math.max(0, lines.length - 6);
  let cut = lines.length;
  for (let index = lines.length - 1; index >= from; index--) {
    const line = lines[index].trim();
    if (
      SIGN_OFF.test(line) ||
      line === PROFILE.name ||
      line === PROFILE.nameEn ||
      line.includes(PROFILE.email)
    ) {
      cut = index;
    }
  }
  const closing = language === "hu" ? "Üdvözlettel," : "Best regards,";
  return [
    lines.slice(0, cut).join("\n").trimEnd(),
    "",
    closing,
    language === "hu" ? PROFILE.name : PROFILE.nameEn,
    `${PROFILE.email} · ${PROFILE.phone}`,
  ].join("\n");
}

/**
 * A piszkozat: nyelv és szöveg. Hibás JSON vagy kitöltendő hely esetén újat
 * kér — a harmadik után feladja.
 */
const CLASSIFY_PROMPT = `
You read the latest incoming email of an email thread and return ONLY JSON:
{"language":"hu"|"en","informal":boolean,"name":string|null}
- language: the language of the latest incoming email (anything not Hungarian → "en").
- informal: true if the sender uses tegezés / an informal tone (Szia, köszi, leveled, CV-d; Hey, Hi + first name, Cheers), false if formal (magázás, Tisztelt, Dear, Kind regards).
- name: how to address the sender in the greeting — the name they signed with. Hungarian: informal → given name only ("Attila"); formal → full name in Hungarian order ("Kiss Attila"). English: given name only. null if no person's name is known.
`.trim();

/**
 * Utasítás nélkül: a modell csak nyelvet, hangnemet és nevet dönt, a levél
 * a felhasználó mintája betű szerint (`replyTemplates`).
 */
async function templateReply(
  input: ReplyDraftInput,
): Promise<ReplyDraftOutput> {
  const user = [
    input.senderName ? `SENDER: ${input.senderName}` : "",
    "THREAD (oldest first):",
    threadBlock(input.messages),
  ].join("\n");
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    const { content, routedVia } = await chat(CLASSIFY_PROMPT, user);
    const data = safeJson(content);
    const language =
      data?.language === "hu" || data?.language === "en" ? data.language : null;
    if (!language || typeof data?.informal !== "boolean") {
      log.debug(
        `${input.company}: hibás JSON (${routedVia}), új próba ${attempt}/${ATTEMPTS}`,
      );
      continue;
    }
    const body = renderTemplate({
      language,
      informal: data.informal,
      withAttachment: input.withAttachment ?? true,
      name: typeof data.name === "string" ? data.name : null,
      company: input.company,
    });
    return { language, body: withSignature(body, language), model: routedVia };
  }
  throw new Error(
    `A FreeLLMAPI ${ATTEMPTS} próbálkozás után sem döntötte el a levél nyelvét és hangnemét — generáld újra.`,
  );
}

export async function generateReplyDraft(
  input: ReplyDraftInput,
): Promise<ReplyDraftOutput> {
  if (!input.instruction?.trim()) return templateReply(input);
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
      return {
        language,
        body: withSignature(paragraphs(body), language),
        model: routedVia,
      };
    }
    log.debug(
      `${input.company}: ${reason} (${routedVia}), új próba ${attempt}/${ATTEMPTS}`,
    );
  }
  throw new Error(
    `A FreeLLMAPI ${ATTEMPTS} próbálkozás után sem adott használható piszkozatot (${reason}) — generáld újra, vagy gyengítsd a reply láncot.`,
  );
}
