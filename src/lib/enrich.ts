/**
 * Új cégek felvétele puszta névből, majd feltöltése adatokkal.
 *
 * A `/check` oldalon kiderül, mely cégek hiányoznak a listából. Ez a modul
 * veszi azt a névsort, felviszi őket, és **egyesével** végigmegy rajtuk: a
 * webes keresővel megkeresi a publikus e-mail címet és a weboldalt, majd a
 * megtalált adatokból megírja a levelet (tárgy, szöveg, LinkedIn-üzenet,
 * kapcsolatkérés).
 *
 * Egyesével halad, mert a keresés a szűk keresztmetszet: egy CLI-hívás
 * 400-500 MB memóriát visz, és egyszerre csak egy futhat (`cliQueue`).
 */
import { buildCompanyLetter } from "./csvImport";
import { checkCompanies } from "./companyLookup";
import { getContactById, saveEmailSearch, updateContact, upsertContacts } from "./contacts";
import { findEmail, type SearchProvider } from "./emailFinder";
import { parseImport, type ImportRow } from "./importSchema";
import { createLogger } from "./logger";
import { getContacts } from "./mongodb";
import type { CompanySize, ContactDoc, ContactKind, Language } from "./types";

const log = createLogger("felvetel");

/** Ezekből a domainekből nem lesz céges weboldal. */
const FREEMAIL = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "yahoo.com",
  "icloud.com",
  "protonmail.com",
  "freemail.hu",
  "citromail.hu",
]);

export interface EnrichItem {
  company: string;
  contactId: string | null;
  email: string | null;
  website: string | null;
  /** Mi lett a sorral ebben a körben. */
  result: "talalat" | "nincs-cim" | "hiba";
  ms: number;
  message?: string;
}

export interface EnrichState {
  status: "idle" | "running" | "stopping" | "done" | "error";
  provider: SearchProvider;
  /** Hány nevet kaptunk, és ebből hány új sor lett. */
  requested: number;
  skipped: number;
  created: number;
  /** A kutatás állása. */
  total: number;
  processed: number;
  found: number;
  failed: number;
  current: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  etaSeconds: number | null;
  message: string | null;
  recent: EnrichItem[];
}

export interface EnrichOptions {
  names: string[];
  /** Melyik forráslistába kerüljenek (pl. `manual-2026-09`). */
  source: string;
  kind: ContactKind;
  /** Létszám-sáv. IT cégnél kötelező, különben nem jön létre a sor. */
  size: CompanySize | null;
  /** Kétbetűs kód: HU, DE, AT… */
  country: string;
  language: Language;
  provider: SearchProvider;
  /** Szünet két cég között, hogy ne fussunk limitbe. */
  delayMs: number;
}

const state: EnrichState = {
  status: "idle",
  provider: "claude",
  requested: 0,
  skipped: 0,
  created: 0,
  total: 0,
  processed: 0,
  found: 0,
  failed: 0,
  current: null,
  startedAt: null,
  finishedAt: null,
  etaSeconds: null,
  message: null,
  recent: [],
};

let stopRequested = false;
let running: Promise<void> | null = null;

export function enrichState(): EnrichState {
  return { ...state, recent: [...state.recent] };
}

export function stopEnrich(): EnrichState {
  if (state.status === "running") {
    stopRequested = true;
    state.status = "stopping";
    state.message = "Leállítás kérve — az épp futó cég még befejeződik.";
    log.warn("leállítás kérve");
  }
  return enrichState();
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** A találatból kikövetkeztetett céges weboldal. */
function deriveWebsite(email: string | null, source: string | null): string | null {
  const domain = email?.split("@")[1]?.toLowerCase();
  if (domain && !FREEMAIL.has(domain)) return `https://${domain}`;

  if (source) {
    try {
      const url = new URL(source);
      return `${url.protocol}//${url.host}`;
    } catch {
      // nem URL — hagyjuk
    }
  }
  return null;
}

/** A név alapján felvett üres sorok. A levél már itt elkészül, hogy ne maradjon üres mező. */
async function createRows(options: EnrichOptions): Promise<{
  ids: string[];
  created: number;
  skipped: number;
}> {
  // Amit már ismerünk, azt nem vesszük fel másodszor.
  const check = await checkCompanies(options.names);
  const fresh = check.missing;
  if (!fresh.length) return { ids: [], created: 0, skipped: check.found.length };

  const rows: ImportRow[] = fresh.map((company) => {
    const letter = buildCompanyLetter({
      company,
      city: null,
      industry: null,
      size: options.size,
      language: options.language,
    });
    return {
      kind: options.kind,
      company,
      // IT cégnél a séma kötelezővé teszi; a kutatás később pontosíthatja.
      ...(options.size ? { size: options.size } : {}),
      country: options.country,
      language: options.language,
      source: options.source,
      tags: ["kezi-felvetel", "kutatando"],
      ...letter,
    } satisfies ImportRow;
  });

  const parsed = parseImport(rows, { forceKind: options.kind });
  if (!parsed.contacts.length) {
    throw new Error(
      parsed.errors[0]?.message ?? "Egyetlen sort sem sikerült felvenni.",
    );
  }

  await upsertContacts(parsed.contacts, { origin: "import" });

  // A frissen felvett sorok azonosítói — a kutatás ezeken megy végig.
  const collection = await getContacts();
  const docs = await collection
    .find(
      { key: { $in: parsed.contacts.map((contact) => contact.key) } },
      { projection: { _id: 1 } },
    )
    .toArray();

  return {
    ids: docs.map((doc) => String(doc._id)),
    created: docs.length,
    skipped: check.found.length,
  };
}

/** Egy cég feltöltése: keresés, mentés, levél újraírása a megtalált adatokkal. */
async function enrichOne(
  contact: ContactDoc,
  provider: SearchProvider,
  position: string,
): Promise<EnrichItem> {
  const started = Date.now();
  log.info(`${position} · ${contact.company} — kutatás indul`);

  try {
    const finding = await findEmail(contact, provider, "felvetel");

    await saveEmailSearch(contact._id, {
      at: new Date().toISOString(),
      result: finding.email ? "found" : "none",
      email: finding.email,
      confidence: finding.confidence,
      source: finding.source,
      applyUrl: finding.applyUrl,
      alternatives: finding.alternatives,
      notes: finding.notes,
      citations: finding.citations,
      model: finding.model,
      usage: finding.usage
        ? {
            provider: finding.usage.provider,
            model: finding.usage.model,
            totalTokens: finding.usage.totalTokens,
            inputTokens: finding.usage.inputTokens,
            outputTokens: finding.usage.outputTokens,
            cacheReadTokens: finding.usage.cacheReadTokens,
            costUsd: finding.usage.costUsd,
            ms: finding.usage.ms,
            turns: finding.usage.turns,
          }
        : null,
    });

    // Csak forrással alátámasztott címet írunk be.
    const useEmail = finding.email && finding.confidence !== "low" ? finding.email : null;
    const website =
      contact.website ?? deriveWebsite(useEmail ?? finding.email, finding.source);

    // A levél most már a megtalált adatokkal készül (weboldal, város, méret).
    const letter = buildCompanyLetter({
      company: contact.company,
      city: contact.city,
      industry: null,
      size: contact.size,
      language: contact.language,
    });

    await updateContact(
      contact._id,
      {
        ...(useEmail ? { primaryEmail: useEmail } : {}),
        ...(website ? { website } : {}),
        emailSubject: letter.emailSubject,
        emailBody: letter.emailBody,
        linkedinMessage: letter.linkedinMessage,
        connectionRequest: letter.connectionRequest,
        note: finding.source
          ? [contact.note, `e-mail forrása: ${finding.source}`].filter(Boolean).join(" · ")
          : contact.note,
        // A felvételkor kapott "nincs-email" címkét felül kell írni, ha lett
        // cím — különben egyszerre állna a soron mindkettő.
        tags: [
          ...new Set([
            ...contact.tags.filter(
              (tag) => !["kutatando", "van-email", "nincs-email"].includes(tag),
            ),
            useEmail ? "van-email" : "nincs-email",
            "kutatott-email",
          ]),
        ],
      },
      "felvétel + kutatás",
    );

    const ms = Date.now() - started;
    log.info(
      `${position} · ${contact.company} → ${useEmail ?? "nincs cím"}` +
        `${website ? ` · ${website}` : ""}`,
      { confidence: finding.confidence, ms },
    );

    return {
      company: contact.company,
      contactId: contact._id,
      email: useEmail,
      website,
      result: useEmail ? "talalat" : "nincs-cim",
      ms,
    };
  } catch (error) {
    const message = (error as Error).message;
    log.error(`${position} · ${contact.company} — hiba: ${message}`);
    return {
      company: contact.company,
      contactId: contact._id,
      email: null,
      website: null,
      result: "hiba",
      ms: Date.now() - started,
      message,
    };
  }
}

async function run(options: EnrichOptions): Promise<void> {
  const { ids, created, skipped } = await createRows(options);
  state.created = created;
  state.skipped = skipped;
  state.total = ids.length;

  log.info(
    `felvéve: ${created} új cég (${skipped} már megvolt) — kutatás egyesével, ${options.provider}`,
  );

  if (!ids.length) {
    state.status = "done";
    state.finishedAt = new Date().toISOString();
    state.message = skipped
      ? `Mind a(z) ${skipped} cég már szerepelt a listában — nem vettem fel újat.`
      : "Nem maradt felvehető cégnév.";
    return;
  }

  let consecutiveErrors = 0;

  for (const [index, id] of ids.entries()) {
    if (stopRequested) {
      state.message = `Leállítva ${state.processed}/${state.total} után. A felvett sorok megmaradtak.`;
      log.warn(state.message);
      break;
    }

    const contact = await getContactById(id);
    if (!contact) continue;

    state.current = contact.company;
    const item = await enrichOne(contact, options.provider, `${index + 1}/${ids.length}`);

    state.processed += 1;
    if (item.result === "hiba") {
      state.failed += 1;
      consecutiveErrors += 1;
    } else {
      consecutiveErrors = 0;
      if (item.email) state.found += 1;
    }

    state.recent.unshift(item);
    if (state.recent.length > 50) state.recent.pop();

    const elapsed = Date.now() - new Date(state.startedAt ?? Date.now()).getTime();
    state.etaSeconds = Math.round(
      ((ids.length - state.processed) * (elapsed / state.processed)) / 1000,
    );

    // Sorozatos hiba jellemzően limit vagy hálózat — nincs értelme tovább hajtani.
    if (consecutiveErrors >= 3) {
      state.message =
        "Három egymás utáni hiba után leálltam (limit vagy hálózati gond lehet). " +
        "A felvett sorok megmaradtak, később folytathatod a begyűjtéssel.";
      log.error(state.message);
      break;
    }

    if (options.delayMs > 0 && index < ids.length - 1) await sleep(options.delayMs);
  }

  state.current = null;
  state.finishedAt = new Date().toISOString();
  state.status = stopRequested ? "idle" : "done";
  state.etaSeconds = null;
  log.info(
    `kész: ${state.created} új sor, ${state.processed} kutatva, ${state.found} címmel, ${state.failed} hiba`,
  );
}

export function startEnrich(options: EnrichOptions): EnrichState {
  if (state.status === "running" || state.status === "stopping") return enrichState();

  stopRequested = false;
  Object.assign(state, {
    status: "running",
    provider: options.provider,
    requested: options.names.length,
    skipped: 0,
    created: 0,
    total: 0,
    processed: 0,
    found: 0,
    failed: 0,
    current: null,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    etaSeconds: null,
    message: null,
    recent: [],
  } satisfies Partial<EnrichState>);

  // Nem várjuk meg: a kérés visszatér, a munka a szerveren fut tovább.
  running = run(options)
    .catch((error: Error) => {
      state.status = "error";
      state.message = error.message;
      state.current = null;
      log.error("a felvétel elszállt", error.message);
    })
    .finally(() => {
      running = null;
    });

  return enrichState();
}

/** Teszthez: megvárja a futó menetet. */
export function enrichPromise(): Promise<void> | null {
  return running;
}
