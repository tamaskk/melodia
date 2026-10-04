/**
 * E-mail keresés a helyi **OpenAI Codex CLI**-vel (`codex exec --search`).
 *
 * Miért így: a Codex a ChatGPT-fiókkal bejelentkezve fut, tehát nem az API-t
 * számlázza, és a `--search` kapcsolóval a natív `web_search` eszközt kapja meg.
 * A választ `--output-schema`-val kényszerítjük JSON alakra, és
 * `--output-last-message`-dzsel fájlba íratjuk — így nem a stdout szövegéből
 * kell visszafejteni.
 *
 * Biztonság: `--sandbox read-only`, saját ideiglenes munkakönyvtár, a projekt
 * konfigja és a felhasználói `config.toml` nélkül — a keresés nem írhat semmit.
 */
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { findExecutable, freeMemoryMb, runExclusive } from "./cliQueue";
import { credential } from "./env";
import {
  buildBatchPrompt,
  matchBatch,
  normaliseFinding,
  parseJsonArray,
  type BatchFinding,
  type EmailFinding,
} from "./emailFinder";
import { createLogger } from "./logger";
import type { ContactDoc } from "./types";

/** A legutóbbi Codex-futás mérése — ugyanaz az alak, mint a Claude ágon. */
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
  webSearch: number | null;
  webFetch: number | null;
}

let lastStats: CliRunStats | null = null;

export function takeLastStats(): CliRunStats | null {
  const stats = lastStats;
  lastStats = null;
  return stats;
}

const log = createLogger("codex-cli");

/** Egy cégre vonatkozó válasz alakja — ezt kényszerítjük a modellre. */
const SINGLE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["email", "confidence", "source", "alternatives", "applyUrl", "notes"],
  properties: {
    email: { type: ["string", "null"], description: "A megtalált cím, vagy null." },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
    source: { type: ["string", "null"], description: "Az oldal URL-je, ahol láttad." },
    applyUrl: { type: ["string", "null"], description: "Jelentkezési űrlap, ha cím nincs." },
    alternatives: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["email", "source", "label"],
        properties: {
          email: { type: "string" },
          source: { type: ["string", "null"] },
          label: { type: ["string", "null"] },
        },
      },
    },
    notes: { type: "string" },
  },
} as const;

const BATCH_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["results"],
  properties: {
    results: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "index",
          "company",
          "email",
          "confidence",
          "source",
          "alternatives",
          "applyUrl",
          "notes",
        ],
        properties: {
          index: { type: "integer" },
          company: { type: "string" },
          ...SINGLE_SCHEMA.properties,
        },
      },
    },
  },
} as const;

/** Hol keressük a binárist. Ha sehol, `npx`-szel is elindítható. */
function candidates(): { command: string; args: string[]; via: string }[] {
  const configured = credential("CODEX_CLI_PATH");
  const paths = [
    ...(configured ? [configured] : []),
    join(homedir(), ".local/bin/codex"),
    "/opt/homebrew/bin/codex",
    "/usr/local/bin/codex",
    "codex",
  ];

  const found = paths
    .map((path) => findExecutable(path))
    .find((path): path is string => Boolean(path));
  if (found) return [{ command: found, args: [], via: "telepített codex" }];

  // Végső mentsvár: telepítés nélkül is fusson. Lassabb, mert letölti a bináris
  // csomagot az npx gyorsítótárba, de működik.
  const npx = findExecutable("npx");
  if (npx) {
    return [
      { command: npx, args: ["-y", "@openai/codex@latest"], via: "npx (nincs telepítve)" },
    ];
  }
  return [];
}

function buildPrompt(contact: ContactDoc): string {
  return [
    "Keresd meg a weben ennek a cégnek a publikus, jelentkezésre használható e-mail címét.",
    "",
    `Cég: ${contact.company}`,
    contact.website ? `Weboldal: ${contact.website}` : "Weboldal: nem ismert",
    contact.linkedinUrl ? `LinkedIn: ${contact.linkedinUrl}` : null,
    `Ország: ${contact.country}${contact.city ? ` · ${contact.city}` : ""}`,
    contact.note ? `Amit tudunk: ${contact.note.slice(0, 300)}` : null,
    "",
    "Prioritás: karrier/HR cím (jobs@, karrier@, hr@, allas@) > általános cím (info@, office@).",
    "Nézd meg a cég saját oldalát (Kapcsolat / Karrier / Impresszum / Impressum) is.",
    "",
    "SZABÁLYOK:",
    "- Ne találj ki címet, ne tippelj mintából. Csak azt add vissza, amit tényleg láttál, forrás URL-lel.",
    "- Amit láttál, ne hallgasd el: az általános címek is menjenek az alternatives közé, label-lel.",
    "- Ha csak jelentkezési űrlap van: email legyen null, applyUrl az űrlap URL-je.",
    '- confidence: "high" = a cég saját oldala, "medium" = más hiteles forrás, "low" = bizonytalan.',
    "- A notes mező 1-2 mondat magyarul.",
  ]
    .filter((line) => line !== null)
    .join("\n");
}

/** Egy JSONL esemény emberi mondattá — élőben a konzolra. */
function describeEvent(event: Record<string, unknown>): void {
  const type = String(event.type ?? "");
  const item = (event.item ?? {}) as Record<string, unknown>;
  const itemType = String(item.item_type ?? item.type ?? "");

  if (type === "thread.started") {
    log.debug("munkamenet indul", { thread: String(event.thread_id ?? "").slice(0, 8) });
    return;
  }
  if (itemType.includes("web_search")) {
    const query = item.query ?? (item as { action?: { query?: string } }).action?.query;
    if (query) log.info(`🔍 keresés: ${query}`);
    return;
  }
  if (itemType === "command_execution") {
    log.debug(`parancs: ${String(item.command ?? "").slice(0, 80)}`);
    return;
  }
  if (itemType === "agent_message" && typeof item.text === "string") {
    log.debug("modell szöveg", item.text.slice(0, 160));
    return;
  }
  if (type === "turn.completed") {
    const usage = (event.usage ?? {}) as Record<string, number>;
    const input = usage.input_tokens ?? 0;
    const output = usage.output_tokens ?? 0;
    const cached = usage.cached_input_tokens ?? 0;
    lastStats = {
      model: "codex-cli",
      inputTokens: input,
      outputTokens: output,
      cacheWriteTokens: 0,
      cacheReadTokens: cached,
      totalTokens: input + output + cached,
      costUsd: null,
      ms: 0,
      turns: null,
      webSearch: null,
      webFetch: null,
    };
    log.info("kész", { input_tokens: input, output_tokens: output, cached });
    return;
  }
  if (type === "turn.failed" || type === "error") {
    log.error("Codex hiba", event.error ?? event);
  }
}

interface RunResult {
  text: string;
}

function spawnCodex(
  entry: { command: string; args: string[]; via?: string },
  prompt: string,
  workdir: string,
  schemaFile: string,
  outputFile: string,
  timeoutMs: number,
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const args = [
      ...entry.args,
      // A --search globális kapcsoló: az `exec` ELÉ kell, különben nem ismeri fel.
      "--search", // natív web_search eszköz, élő találatokkal
      "exec",
      "--json",
      "--sandbox",
      "read-only", // a keresés soha ne írhasson fájlt
      "--skip-git-repo-check",
      "--ephemeral", // ne hagyjon maga után munkamenet-fájlokat
      "--ignore-user-config", // a te ~/.codex beállításaid ne szóljanak bele
      "--color",
      "never",
      "-C",
      workdir,
      "--output-schema",
      schemaFile,
      "--output-last-message",
      outputFile,
      prompt,
    ];

    // `nice`: a keresés ne vegye el a gépet a felhasználó elől.
    const child = spawn("/usr/bin/nice", ["-n", "10", entry.command, ...args], {
      cwd: workdir,
      env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=768" },
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
    });

    log.debug("folyamat indul", {
      binary: entry.command,
      szabadMemoriaMb: freeMemoryMb(),
      timeoutMs,
    });

    let pending = "";
    let stderr = "";
    let timedOut = false;
    let authError = false;

    const timer = setTimeout(() => {
      timedOut = true;
      try {
        if (child.pid) process.kill(-child.pid, "SIGKILL");
      } catch {
        child.kill("SIGKILL");
      }
      log.error(`időtúllépés ${Math.round(timeoutMs / 1000)} mp után — folyamat kilőve`);
      reject(
        new Error(
          `A Codex CLI ${Math.round(timeoutMs / 1000)} mp alatt nem válaszolt. ` +
            "Emeld a CODEX_CLI_TIMEOUT_MS értékét, vagy válts OpenAI API motorra.",
        ),
      );
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      pending += chunk.toString();
      const lines = pending.split("\n");
      pending = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("{")) continue;
        try {
          const event = JSON.parse(trimmed) as Record<string, unknown>;
          if (/401|unauthorized|not logged in/i.test(JSON.stringify(event.message ?? ""))) {
            authError = true;
          }
          describeEvent(event);
        } catch {
          // nem JSON sor — a haladásjelzés a stderr-en megy, azt nem kell értelmezni
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

    child.on("close", async (code) => {
      clearTimeout(timer);
      if (timedOut) return;

      // A végső üzenetet fájlból olvassuk: ez a legmegbízhatóbb forrás.
      const text = await readFile(outputFile, "utf8").catch(() => "");
      if (text.trim()) {
        resolve({ text });
        return;
      }

      const detail = stderr.trim().slice(0, 400);
      if (authError || /401|unauthorized|not logged in|please log in/i.test(detail)) {
        reject(
          new Error(
            "A Codex CLI nincs bejelentkezve (401). Futtasd egyszer a terminálban: " +
              "`npm i -g @openai/codex && codex login` — ChatGPT-fiókkal. Utána innen is megy.",
          ),
        );
        return;
      }
      reject(
        new Error(detail || `A Codex CLI ${code} kóddal állt le, válasz nélkül.`),
      );
    });
  });
}

/** Ideiglenes munkakönyvtár + séma- és kimeneti fájl, futás után törölve. */
async function runCodex(
  prompt: string,
  schema: unknown,
  timeoutMs: number,
): Promise<string> {
  const workdir = await mkdtemp(join(tmpdir(), "melodia-codex-"));
  const schemaFile = join(workdir, "schema.json");
  const outputFile = join(workdir, "last-message.txt");
  await writeFile(schemaFile, JSON.stringify(schema), "utf8");

  try {
    const entries = candidates();
    if (!entries.length) {
      throw new Error(
        "Nem találom a Codex CLI-t és az npx-et sem. Telepítsd: `npm i -g @openai/codex`, " +
          "majd jelentkezz be: `codex login`. Egyedi útvonal: CODEX_CLI_PATH.",
      );
    }

    let lastError: Error | null = null;
    for (const entry of entries) {
      log.debug(`indítás: ${entry.via}`);
      try {
        const { text } = await spawnCodex(
          entry,
          prompt,
          workdir,
          schemaFile,
          outputFile,
          timeoutMs,
        );
        return text;
      } catch (error) {
        lastError = error as Error;
        // Csak akkor próbálunk másik útvonalat, ha maga a bináris hiányzik.
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") break;
      }
    }
    throw (
      lastError ??
      new Error("Nem sikerült elindítani a Codex CLI-t.")
    );
  } finally {
    await rm(workdir, { recursive: true, force: true }).catch(() => {});
  }
}

const baseTimeout = (): number => Number(credential("CODEX_CLI_TIMEOUT_MS", "300000"));

function parseObject(raw: string): Record<string, unknown> {
  const cleaned = raw.replace(/```(?:json)?/gi, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error(`A Codex válasza nem JSON: ${cleaned.slice(0, 200)}`);
  }
  return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
}

export async function findEmailWithCodexCli(
  contact: ContactDoc,
): Promise<EmailFinding> {
  const text = await runExclusive("codex", () =>
    runCodex(buildPrompt(contact), SINGLE_SCHEMA, baseTimeout()),
  );
  return normaliseFinding(parseObject(text), "codex-cli");
}

/** Általános futtató a Codexhez: prompt be, JSON objektum ki. */
export async function runCodexSearch(
  prompt: string,
  timeoutMs?: number,
): Promise<Record<string, unknown> | null> {
  const text = await runExclusive("codex", () =>
    runCodex(prompt, undefined, timeoutMs ?? baseTimeout()),
  );
  try {
    return parseObject(text);
  } catch {
    log.info("nincs értelmezhető JSON a Codex válaszában — üres eredmény");
    return null;
  }
}

export async function findEmailsBatchWithCodexCli(
  contacts: ContactDoc[],
): Promise<BatchFinding[]> {
  const timeoutMs = Math.min(900_000, baseTimeout() + contacts.length * 60_000);
  const text = await runExclusive("codex", () =>
    runCodex(buildBatchPrompt(contacts), BATCH_SCHEMA, timeoutMs),
  );
  return matchBatch(contacts, parseJsonArray(text), "codex-cli");
}
