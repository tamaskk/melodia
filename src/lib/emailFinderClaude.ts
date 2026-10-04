/**
 * E-mail keresés a HELYI Claude Code CLI-vel.
 *
 * Nem az Anthropic API-t hívja (az külön fizetős), hanem a gépre telepített,
 * már bejelentkezett `claude` parancsot headless módban — így az előfizetésed
 * keretéből megy, API kulcs nélkül. Csak lokálisan működik.
 */
import { spawn } from "node:child_process";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { findExecutable, freeMemoryMb, runExclusive } from "./cliQueue";
import { credential } from "./env";
import { createLogger } from "./logger";
import {
  buildBatchPrompt,
  matchBatch,
  normaliseFinding,
  parseJsonArray,
  type BatchFinding,
  type EmailFinding,
} from "./emailFinder";
import type { ContactDoc } from "./types";

/** A CLI nincs mindig a szerver PATH-jában, ezért végigpróbáljuk a szokásos helyeket. */
function cliCandidates(): string[] {
  const configured = credential("CLAUDE_CLI_PATH");
  return [
    ...(configured ? [configured] : []),
    join(homedir(), ".local/bin/claude"),
    "/opt/homebrew/bin/claude",
    "/usr/local/bin/claude",
    "claude",
  ];
}

function buildPrompt(contact: ContactDoc): string {
  return [
    "Keresd meg a weben ennek a cégnek a publikus, jelentkezésre használható e-mail címét.",
    "",
    `Cég: ${contact.company}`,
    contact.website ? `Weboldal: ${contact.website}` : "Weboldal: nem ismert",
    contact.linkedinUrl ? `LinkedIn: ${contact.linkedinUrl}` : null,
    `Ország: ${contact.country}${contact.city ? ` · ${contact.city}` : ""}`,
    contact.note ? `Amit tudunk: ${contact.note.slice(0, 400)}` : null,
    "",
    "Nézd meg a cég saját oldalát (Kapcsolat / Karrier / Impresszum / Impressum) is.",
    "Prioritás: karrier/HR cím (jobs@, karrier@, hr@) > általános cím (info@, office@, hello@).",
    "",
    "SZABÁLYOK:",
    "- Ne találj ki címet, ne tippelj mintából. Csak azt add vissza, amit tényleg láttál, URL-lel.",
    "- Amit láttál, azt SOHA ne hallgasd el: az általános címek is menjenek az alternatives közé, label-lel.",
    "- Ha csak jelentkezési űrlap van, email legyen null, applyUrl pedig az űrlap URL-je.",
    '- confidence: "high" = a cég saját oldala, "medium" = más hiteles forrás, "low" = bizonytalan egyezés.',
    "",
    "A válaszod KIZÁRÓLAG ez a JSON legyen, magyarázat és kódblokk nélkül:",
    '{"email":"cím vagy null","confidence":"high|medium|low","source":"URL vagy null",',
    ' "alternatives":[{"email":"...","source":"URL","label":"mire való"}],',
    ' "applyUrl":"URL vagy null","notes":"1-2 mondat magyarul"}',
  ]
    .filter((line) => line !== null)
    .join("\n");
}

interface CliResult {
  result?: string;
  is_error?: boolean;
  subtype?: string;
  duration_ms?: number;
  num_turns?: number;
  total_cost_usd?: number;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
  modelUsage?: Record<string, unknown>;
}

/** Az utolsó CLI-futás mérése — a hívó ebből tölti fel a `usage` rekordot. */
export interface CliRunStats {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
  costUsd: number | null;
  ms: number;
  turns: number | null;
  webSearch: number;
  webFetch: number;
}

let lastStats: CliRunStats | null = null;

/** A legutóbbi keresés mérése. Egyszerre egy CLI fut (cliQueue), így ez egyértelmű. */
export function takeLastStats(): CliRunStats | null {
  const stats = lastStats;
  lastStats = null;
  return stats;
}

const log = createLogger("claude-cli");

/**
 * Melyik modell keressen. Alapból **sonnet**: a feladat lényegében validálás
 * (megnyitott oldalon látott cím visszaadása), amire az Opus túlméretezett —
 * a mérés szerint egy keresés 226 ezer input tokent vitt el Opusszal.
 */
function searchModel(): string {
  return credential("CLAUDE_SEARCH_MODEL", "sonnet");
}

/**
 * Hány kör mehet el egy keresésre.
 *
 * Mérve: a 12+ körös menetek a fogyás 46%-át vitték el, és **egy sem** talált
 * címet. A promptba írt kérés nem tartotta be a modell — ez kemény korlát.
 */
function maxTurnsDefault(): number {
  return Math.max(
    3,
    Math.min(40, Number(credential("CLAUDE_SEARCH_MAX_TURNS", "10"))),
  );
}

/** Egy stream-json sor emberi mondattá — ez megy a konzolra élőben. */
function describeEvent(event: Record<string, unknown>): void {
  const type = String(event.type ?? "");

  if (type === "system" && event.subtype === "init") {
    log.debug("CLI elindult", {
      session: String(event.session_id ?? "").slice(0, 8),
      model: event.model,
    });
    return;
  }

  if (type === "assistant") {
    const message = event.message as
      { content?: Record<string, unknown>[] } | undefined;
    for (const part of message?.content ?? []) {
      if (part.type === "tool_use") {
        const input = (part.input ?? {}) as Record<string, unknown>;
        const name = String(part.name ?? "eszköz");
        if (name === "WebSearch") log.info(`🔍 keresés: ${input.query}`);
        else if (name === "WebFetch")
          log.info(`🌐 oldal letöltése: ${input.url}`);
        else log.debug(`eszköz: ${name}`, input);
      }
      if (part.type === "text" && String(part.text ?? "").trim()) {
        log.debug("modell szöveg", String(part.text).slice(0, 160));
      }
    }
    return;
  }

  if (type === "user") {
    const message = event.message as
      { content?: Record<string, unknown>[] } | undefined;
    for (const part of message?.content ?? []) {
      if (part.type !== "tool_result") continue;
      const content = part.content;
      const text =
        typeof content === "string"
          ? content
          : JSON.stringify(content ?? "").slice(0, 120);
      log.debug(
        `↩ eszköz válasz (${text.length} karakter)`,
        text.slice(0, 120),
      );
    }
    return;
  }

  if (type === "rate_limit_event") {
    const info = (event.rate_limit_info ?? {}) as Record<string, unknown>;
    if (info.status && info.status !== "allowed") {
      log.warn(`előfizetési limit: ${info.status}`, info);
    }
    return;
  }

  if (type === "result") {
    const usage = (event.usage ?? {}) as Record<string, number>;
    const total =
      (usage.input_tokens ?? 0) +
      (usage.output_tokens ?? 0) +
      (usage.cache_creation_input_tokens ?? 0) +
      (usage.cache_read_input_tokens ?? 0);
    log.info(`válasz megérkezett (${event.subtype})`, {
      ms: event.duration_ms,
      turns: event.num_turns,
      osszesToken: total,
      cacheRead: usage.cache_read_input_tokens,
      usd: event.total_cost_usd,
    });
  }
}

interface RunOptions {
  timeoutMs: number;
  maxTurns: number;
  /** Melyik eszközöket kapja meg. Ismert weboldalnál a WebSearch felesleges. */
  tools: string[];
}

function runCli(
  binary: string,
  prompt: string,
  options: RunOptions,
): Promise<string> {
  const { timeoutMs, maxTurns, tools } = options;
  return new Promise((resolve, reject) => {
    // Csak a keresőeszközöket engedjük — Bash-t és fájlírást soha.
    // A stream-json azért kell, hogy menet közben lássuk, épp mit csinál.
    // `nice`: a keresés soha ne vegye el a gépet a felhasználó elől.
    // Külön folyamatcsoport, hogy időtúllépéskor az egész fa kilőhető legyen.
    const child = spawn(
      "/usr/bin/nice",
      [
        "-n",
        "10",
        binary,
        "-p",
        prompt,
        "--output-format",
        "stream-json",
        "--verbose",
        // Eszköz nélküli (szöveges) feladatnál nincs engedélyezett eszköz.
        ...(tools.length ? ["--allowedTools", ...tools] : []),
        // `--tools`: csak ezeknek az eszközöknek a definíciója kerül a promptba.
        // Mérve: egy rövid szöveges feladat 54 900 → 7 300 token lett tőle, mert
        // alapból minden beépített eszköz leírása betöltődik, használat nélkül is.
        "--tools",
        ...(tools.length ? tools : [""]),
        // Szöveges feladatnál a Claude Code saját (kódolói) rendszerpromptja is
        // felesleges: egy rövid sajáttal 7 300 → 1 250 token (mérve).
        ...(tools.length
          ? []
          : [
              "--system-prompt",
              "Szöveges feladatokat oldasz meg egy álláskereső fejlesztő nevében. A válasz kizárólag érvényes JSON, magyarázat és kódblokk nélkül.",
            ]),
        // Az `--allowedTools` nem tiltó lista: mérve, a CLI a WebSearch-ot
        // akkor is meghivta, ha nem szerepelt benne. Ami tenyleg kizar, az a
        // `--disallowedTools`. A ToolSearch-ot mindig kizarjuk: fix
        // eszkozkeszlettel dolgozunk, a keresgelese viszont elvisz egy kort
        // (merve: 5 kor / 205 ezer token -> 3 kor / 165 ezer token).
        "--disallowedTools",
        ...(tools.includes("WebSearch")
          ? ["ToolSearch"]
          : tools.length
            ? ["WebSearch", "ToolSearch"]
            : ["WebSearch", "WebFetch", "ToolSearch"]),
        // Alapból Opus futna — a keresés validáló munka, arra a Sonnet elég,
        // és nagyságrenddel kevesebbet visz el az előfizetési keretből.
        "--model",
        searchModel(),
        "--max-turns",
        String(maxTurns),
        // Minimalizált környezet: se MCP-szerverek, se projekt-beállítás/hook,
        // se skillek — ezek nélkül gyorsabban indul és kevesebbet eszik.
        "--strict-mcp-config",
        "--mcp-config",
        '{"mcpServers":{}}',
        "--setting-sources",
        "user",
        "--disable-slash-commands",
      ],
      {
        // Nem a projektben futtatjuk: így nem olvassa be a repó CLAUDE.md-jét,
        // a hookokat, és nem indexeli a node_modules-t.
        cwd: tmpdir(),
        env: {
          ...process.env,
          // A gyerek heapje ne nőhessen korlátlanul.
          NODE_OPTIONS: "--max-old-space-size=768",
        },
        stdio: ["ignore", "pipe", "pipe"],
        detached: true,
      },
    );

    log.debug("folyamat indul", {
      binary,
      maxTurns,
      timeoutMs,
      szabadMemoriaMb: freeMemoryMb(),
    });

    let pending = "";
    let stderr = "";
    let lastText = "";
    let finalResult: CliResult | null = null;
    const started = Date.now();

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      // Az egész folyamatcsoportot lőjük ki, ne maradjon árva gyerek.
      try {
        if (child.pid) process.kill(-child.pid, "SIGKILL");
      } catch {
        child.kill("SIGKILL");
      }
      log.error(
        `időtúllépés ${Math.round(timeoutMs / 1000)} mp után — folyamat kilőve`,
      );
      reject(
        Object.assign(
          new Error(
            `A keresés ${Math.round(timeoutMs / 1000)} mp után időtúllépéssel leállt. ` +
              "Ez a cég valószínűleg nehezen kutatható; próbáld OpenAI motorral, " +
              "vagy emeld a CLAUDE_CLI_TIMEOUT_MS értékét.",
          ),
          { timeout: true },
        ),
      );
    }, timeoutMs);

    let webSearch = 0;
    let webFetch = 0;

    child.stdout.on("data", (chunk: Buffer) => {
      pending += chunk.toString();
      const lines = pending.split("\n");
      pending = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        let event: Record<string, unknown>;
        try {
          event = JSON.parse(trimmed) as Record<string, unknown>;
        } catch {
          continue;
        }
        describeEvent(event);
        if (event.type === "assistant") {
          const message = event.message as
            | { content?: { type?: string; text?: string; name?: string }[] }
            | undefined;
          for (const part of message?.content ?? []) {
            if (part.type === "text" && part.text?.includes("{"))
              lastText = part.text;
            if (part.type === "tool_use" && part.name === "WebSearch")
              webSearch += 1;
            if (part.type === "tool_use" && part.name === "WebFetch")
              webFetch += 1;
          }
        }
        if (event.type === "result") {
          finalResult = event as CliResult;
          const usage = finalResult.usage ?? {};
          const input = usage.input_tokens ?? 0;
          const output = usage.output_tokens ?? 0;
          const cacheWrite = usage.cache_creation_input_tokens ?? 0;
          const cacheRead = usage.cache_read_input_tokens ?? 0;
          lastStats = {
            model:
              Object.keys(finalResult.modelUsage ?? {})[0] ?? searchModel(),
            inputTokens: input,
            outputTokens: output,
            cacheWriteTokens: cacheWrite,
            cacheReadTokens: cacheRead,
            totalTokens: input + output + cacheWrite + cacheRead,
            costUsd: finalResult.total_cost_usd ?? null,
            ms: finalResult.duration_ms ?? 0,
            turns: finalResult.num_turns ?? null,
            webSearch,
            webFetch,
          };
        }
      }
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut) return; // már elutasítottuk, a kilövés miatti kód nem érdekes
      // A körkorlát elérésekor a CLI 1-gyel lép ki, de a `result` esemény már
      // megvan (`error_max_turns`) — azt kezeljük válaszként, nem hibaként.
      if (code !== 0 && finalResult) {
        log.info(`a CLI ${code} kóddal állt le, de van lezáró esemény`, {
          subtype: finalResult.subtype,
        });
        resolve(JSON.stringify(finalResult));
        return;
      }

      // Ha kifutott a körökből, de közben már adott JSON-t, azt még elfogadjuk.
      if (code !== 0 || !finalResult) {
        if (lastText) {
          log.warn(
            `a CLI ${code} kóddal állt le, de van használható válasz`,
            stderr.slice(0, 200),
          );
          resolve(JSON.stringify({ result: lastText }));
          return;
        }
        log.error(
          `a CLI ${code} kóddal állt le`,
          stderr.slice(0, 400) || "(üres stderr)",
        );
        reject(
          new Error(
            stderr.trim() ||
              `A Claude CLI ${code} kóddal állt le — jó eséllyel elfogytak a körök vagy az előfizetés kerete.`,
          ),
        );
        return;
      }
      log.info("CLI kész", { ms: Date.now() - started });
      resolve(JSON.stringify(finalResult));
    });
  });
}

function parseJson(raw: string): Record<string, unknown> {
  const cleaned = raw.replace(/```(?:json)?/gi, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("A Claude válasza nem JSON.");
  return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
}

/** Végigpróbálja a lehetséges bináris-útvonalakat, és visszaadja a nyers stdout-ot. */
async function runWithFallback(
  prompt: string,
  options: RunOptions,
): Promise<string> {
  return runExclusive("claude", () => runCandidates(prompt, options));
}

async function runCandidates(
  prompt: string,
  options: RunOptions,
): Promise<string> {
  const binaries = cliCandidates()
    .map((path) => findExecutable(path))
    .filter((path): path is string => Boolean(path));

  if (!binaries.length) {
    throw new Error(
      "Nem találom a helyi Claude CLI-t. Telepítve és bejelentkezve van? " +
        "(`claude --version`, majd `claude` egyszer interaktívan.) " +
        "Egyedi útvonal: CLAUDE_CLI_PATH az atlas-credentials.env-ben.",
    );
  }

  let stdout = "";
  let lastError: Error | null = null;
  for (const binary of binaries) {
    try {
      stdout = await runCli(binary, prompt, options);
      lastError = null;
      break;
    } catch (error) {
      lastError = error as Error;
      // ENOENT: nincs ott a bináris — jöhet a következő jelölt.
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") break;
    }
  }
  if (lastError) {
    const missing = (lastError as NodeJS.ErrnoException).code === "ENOENT";
    throw new Error(
      missing
        ? "Nem találom a helyi Claude CLI-t. Telepítve és bejelentkezve van? " +
            "(`claude --version`, majd `claude` egyszer interaktívan.) " +
            "Egyedi útvonal: CLAUDE_CLI_PATH az atlas-credentials.env-ben."
        : lastError.message,
    );
  }

  const envelope = JSON.parse(stdout) as CliResult;
  if (envelope.is_error && envelope.subtype !== "error_max_turns") {
    throw new Error(envelope.result || "A Claude CLI hibát jelzett.");
  }
  return envelope.result ?? "";
}

const baseTimeout = (): number =>
  Number(credential("CLAUDE_CLI_TIMEOUT_MS", "300000"));

export async function findEmailWithClaudeCli(
  contact: ContactDoc,
): Promise<EmailFinding> {
  // Ha tudjuk a weboldalt, a webkeresés felesleges kitérő: a cím a cég saját
  // oldalán van, oda pedig egyenesen el lehet menni. A találati oldalak
  // szövege is tokenbe kerül, ezért itt el sem adjuk neki az eszközt.
  const tools = contact.website ? ["WebFetch"] : ["WebSearch", "WebFetch"];

  const result = await runWithFallback(buildPrompt(contact), {
    timeoutMs: baseTimeout(),
    maxTurns: maxTurnsDefault(),
    tools,
  });

  try {
    return normaliseFinding(parseJson(result), "claude-code-cli");
  } catch {
    // A körkorlát elérése nem hiba: a keresés lezárult, csak nem lett cím.
    // Hibaként dobva a sweep három ilyen után leállna, pedig épp jól működik.
    log.info(
      `${contact.company}: nincs válasz a körkorláton belül — nincs cím`,
    );
    return normaliseFinding(
      {
        email: null,
        confidence: "low",
        source: null,
        alternatives: [],
        applyUrl: null,
        notes: `Nem lett cím ${maxTurnsDefault()} körön belül — a keresés itt megállt.`,
      },
      "claude-code-cli",
    );
  }
}

/**
 * Általános futtató: egy prompt be, egy JSON objektum ki.
 *
 * Ugyanaz a sor, modell, körkorlát és memória-vészfék, mint az e-mail
 * keresésnél — csak a prompt és az eszközkészlet más. A kapcsolattartó-keresés
 * ezt hívja.
 */
export async function runClaudeSearch(
  prompt: string,
  options: { tools?: string[]; maxTurns?: number; timeoutMs?: number } = {},
): Promise<Record<string, unknown> | null> {
  const result = await runWithFallback(prompt, {
    timeoutMs: options.timeoutMs ?? baseTimeout(),
    maxTurns: options.maxTurns ?? maxTurnsDefault(),
    tools: options.tools ?? ["WebSearch", "WebFetch"],
  });

  try {
    return parseJson(result);
  } catch {
    // Körkorlát vagy formahiba: a hívó üres eredményként kezeli.
    log.info("nincs értelmezhető JSON a válaszban — üres eredmény");
    return null;
  }
}

/**
 * Szöveges feladat a helyi Claude CLI-vel, eszközök nélkül (se webkeresés, se
 * letöltés): osztályozás, piszkozat, brief, levél. Az előfizetési keretből
 * megy, nem API-díjból. A választ JSON-ként várja; ha nem az, hibát dob.
 */
export async function runClaudeJson(
  prompt: string,
  options: { maxTurns?: number; timeoutMs?: number } = {},
): Promise<Record<string, unknown>> {
  const result = await runWithFallback(prompt, {
    timeoutMs: options.timeoutMs ?? 180_000,
    maxTurns: options.maxTurns ?? 2,
    tools: [],
  });
  return parseJson(result);
}

/**
 * Több cég EGY CLI-hívásban. A modell egy JSON tömböt ad vissza, cégenként
 * külön sorral — az időkorlát a cégek számával nő.
 */
export async function findEmailsBatchWithClaudeCli(
  contacts: ContactDoc[],
): Promise<BatchFinding[]> {
  const timeoutMs = Math.min(900_000, baseTimeout() + contacts.length * 60_000);
  // Cégenként több keresés + oldalletöltés kell, ezért a körök is skálázódnak.
  const result = await runWithFallback(buildBatchPrompt(contacts), {
    timeoutMs,
    maxTurns: Math.min(80, 10 + contacts.length * 8),
    tools: ["WebSearch", "WebFetch"],
  });
  return matchBatch(contacts, parseJsonArray(result), "claude-code-cli");
}
