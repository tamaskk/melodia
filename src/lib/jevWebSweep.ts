/**
 * Folyamatos startupkeresés az interneten: körönként egy webkeresés hoz
 * néhány startupot, a Jev mindegyikről eldönti, hogy lead-e, és a leadek
 * (kérésre) bekerülnek a kontaktok közé.
 *
 * Az eredmény ugyanabba a `jevResults` gyűjteménybe megy, mint az adatbázisos
 * futásé (`origin: "web"`), ugyanazzal az egyedi indexszel: egy cég egy
 * kérdésre egyszer kerül sorra, akárhonnan jön.
 */
import { rescore, upsertContacts } from "./contacts";
import { COUNTRIES, countryName } from "./countries";
import { buildCompanyLetter, toSizeBucket } from "./csvImport";
import { splitKnown } from "./importDedupe";
import { parseImport, type ImportRow } from "./importSchema";
import { askBoolean, JevError } from "./jev";
import { getJevResults, saveVerdict, type JevResult } from "./jevSweep";
import { getContacts } from "./mongodb";
import { createLogger } from "./logger";
import { findStartups, type FoundStartup } from "./startupFinder";

const log = createLogger("jev-web");

export interface JevWebState {
  status: "idle" | "running" | "stopping" | "done" | "error";
  question: string;
  focus: string;
  countries: string[];
  threshold: number;
  autoImport: boolean;
  rounds: number;
  /** A keresés ennyi céget hozott összesen. */
  found: number;
  processed: number;
  leads: number;
  imported: number;
  /** Már értékelt vagy körön belül ismétlődő — kihagyva. */
  skipped: number;
  failed: number;
  jevCost: number;
  searchTokens: number;
  currentAngle: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  message: string | null;
}

export interface JevWebOptions {
  question: string;
  focus: string;
  countries: string[];
  threshold: number;
  autoImport: boolean;
}

/** Körönként más szempont, hogy a keresés ne ugyanazt a listát adja vissza. */
const ANGLES = [
  "raised a seed or Series A round in the last 6 months",
  "currently hiring software engineers (open roles on their careers page)",
  "recent accelerator or incubator graduates (Y Combinator, Techstars, Antler, Entrepreneur First, local programs)",
  "featured in tech news or startup newsletters this month",
  "listed on startup databases or 'top startups to watch' lists for this year",
  "founded in the last 3 years and growing their team",
  "B2B software startups that recently launched a new product",
  "startups that announced expansion to new markets recently",
];

const PER_ROUND = 10;
/** Ennyi egymás utáni kör után, ami nem hozott új céget, megállunk. */
const MAX_EMPTY_ROUNDS = 3;
/** Ennyi korábbi cégnevet adunk át kizárásként (a prompt ne nőjön végtelenre). */
const EXCLUDE_LIMIT = 150;

const state: JevWebState = {
  status: "idle",
  question: "",
  focus: "",
  countries: [],
  threshold: 0.8,
  autoImport: true,
  rounds: 0,
  found: 0,
  processed: 0,
  leads: 0,
  imported: 0,
  skipped: 0,
  failed: 0,
  jevCost: 0,
  searchTokens: 0,
  currentAngle: null,
  startedAt: null,
  finishedAt: null,
  message: null,
};

let stopRequested = false;

export function jevWebState(): JevWebState {
  return { ...state, countries: [...state.countries] };
}

export function stopJevWeb(): JevWebState {
  if (state.status === "running") {
    stopRequested = true;
    state.status = "stopping";
    state.message = "Leállítás kérve — az épp futó kör még befejeződik.";
    log.warn("leállítás kérve");
  }
  return jevWebState();
}

function domainOf(website: string): string {
  try {
    return new URL(website).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return website.toLowerCase();
  }
}

/** Amit a Jev kap: a keresés által hozott tények, angolul. */
function startupState(startup: FoundStartup): string {
  const parts: [string, string | number | null][] = [
    ["Company", startup.name],
    ["Website", startup.website],
    [
      "Location",
      [
        startup.city,
        startup.country
          ? (COUNTRIES[startup.country]?.en ?? startup.country)
          : null,
      ]
        .filter(Boolean)
        .join(", ") || null,
    ],
    ["Size", startup.employees ? `${startup.employees} employees` : null],
    ["Industry", startup.industry],
    ["Founded", startup.founded],
    ["Funding", startup.funding],
    ["Description", startup.description],
    ["Hiring signal", startup.hiringSignal],
  ];
  return parts
    .filter(([, value]) => value != null && String(value).trim() !== "")
    .map(
      ([label, value]) =>
        `${label}: ${String(value).trim().replace(/\.+$/, "")}.`,
    )
    .join(" ");
}

function toImportRow(startup: FoundStartup): ImportRow {
  const country =
    startup.country && COUNTRIES[startup.country] ? startup.country : "INT";
  const size = toSizeBucket(startup.employees);
  const language = country === "HU" ? "hu" : "en";
  const letter = buildCompanyLetter({
    company: startup.name,
    city: startup.city,
    industry: startup.industry,
    size,
    language,
  });
  const note =
    [
      startup.description,
      startup.funding ? `finanszírozás: ${startup.funding}` : null,
      startup.hiringSignal ? `felvétel: ${startup.hiringSignal}` : null,
      startup.founded ? `alapítva ${startup.founded}` : null,
      startup.sourceUrl ? `forrás: ${startup.sourceUrl}` : null,
    ]
      .filter(Boolean)
      .join(" · ") || null;
  return {
    kind: "it-company",
    company: startup.name,
    website: startup.website,
    country,
    city: startup.city,
    size: size ?? "ismeretlen",
    language,
    category: "it-company",
    tags: ["startup", "jev-web"],
    note,
    emailSubject: letter.emailSubject,
    emailBody: letter.emailBody,
    linkedinMessage: letter.linkedinMessage,
    connectionRequest: letter.connectionRequest,
    source: `jev-web-${country.toLowerCase()}`,
  };
}

async function handleStartup(
  startup: FoundStartup,
  options: JevWebOptions,
): Promise<void> {
  const results = await getJevResults();
  const companyKey = domainOf(startup.website);
  const stateText = startupState(startup);
  const parsed = parseImport([toImportRow(startup)], {});
  const contact = parsed.contacts[0];
  const known = contact ? (await splitKnown([contact])).known[0] : undefined;

  const run = await askBoolean(stateText, options.question);
  const lead = run.probability >= options.threshold;

  let contactId: string | null = null;
  let imported = false;
  if (lead && options.autoImport && contact && !known) {
    const saved = await upsertContacts([contact], { origin: "import" });
    imported = saved.inserted > 0;
    if (imported) {
      await rescore({ key: contact.key } as never);
      state.imported += 1;
      const inserted = await (
        await getContacts()
      ).findOne({ key: contact.key }, { projection: { _id: 1 } });
      contactId = inserted ? String(inserted._id) : null;
    }
  }

  const doc: JevResult = {
    companyKey,
    question: options.question,
    contactId,
    origin: "web",
    found: startup,
    alreadyInDb: Boolean(known),
    imported,
    company: startup.name,
    website: startup.website,
    country: startup.country ?? "INT",
    source: contact?.source ?? "jev-web-int",
    state: stateText,
    probability: run.probability,
    lead,
    threshold: options.threshold,
    cost: run.cost,
    inputTokens: run.inputTokens,
    elapsedMs: run.elapsedMs,
    evaluatedAt: new Date().toISOString(),
  };
  try {
    await results.insertOne(doc);
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      state.skipped += 1;
      return;
    }
    throw error;
  }
  // A már bent lévő vagy most felvett kontakton is ott legyen a döntés.
  const ownKey = imported ? contact?.key : known?.contact.key;
  if (ownKey) {
    await saveVerdict(
      { key: ownKey },
      {
        probability: run.probability,
        question: options.question,
        lead,
        at: doc.evaluatedAt,
      },
    );
  }
  state.processed += 1;
  state.jevCost += run.cost ?? 0;
  if (lead) state.leads += 1;
  log.info(
    `${startup.name} → ${run.probability.toFixed(2)}${lead ? " · LEAD" : ""}${imported ? " · felvéve" : known ? " · már bent volt" : ""}`,
  );
}

async function loop(options: JevWebOptions): Promise<void> {
  const results = await getJevResults();
  let emptyRounds = 0;

  while (!stopRequested) {
    const angle = ANGLES[state.rounds % ANGLES.length];
    state.currentAngle = angle;
    state.rounds += 1;

    // A korábban látott cégeket kizárjuk, hogy mindig új jöjjön.
    const seenBefore = await results
      .find(
        { origin: "web" },
        { projection: { company: 1 }, sort: { evaluatedAt: -1 } },
      )
      .limit(EXCLUDE_LIMIT)
      .toArray();
    const { startups, usage } = await findStartups({
      focus: options.focus,
      countries: options.countries,
      angle,
      count: PER_ROUND,
      exclude: seenBefore.map((doc) => doc.company),
    });
    state.searchTokens += usage.totalTokens;
    state.found += startups.length;

    const keys = [...new Set(startups.map((item) => domainOf(item.website)))];
    const done = new Set(
      (
        await results
          .find(
            { question: options.question, companyKey: { $in: keys } },
            { projection: { companyKey: 1 } },
          )
          .toArray()
      ).map((doc) => doc.companyKey),
    );
    const seen = new Set<string>();
    const fresh = startups.filter((startup) => {
      const key = domainOf(startup.website);
      if (done.has(key) || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    state.skipped += startups.length - fresh.length;

    if (!fresh.length) {
      emptyRounds += 1;
      if (emptyRounds >= MAX_EMPTY_ROUNDS) {
        state.message = `${MAX_EMPTY_ROUNDS} kör egymás után nem hozott új céget — próbálj más fókuszt vagy országot.`;
        return;
      }
      continue;
    }
    emptyRounds = 0;

    const outcomes = await Promise.allSettled(
      fresh.map((startup) => handleStartup(startup, options)),
    );
    for (const outcome of outcomes) {
      if (outcome.status === "fulfilled") continue;
      state.failed += 1;
      const error = outcome.reason;
      const message = error instanceof Error ? error.message : String(error);
      log.error("hiba egy cégnél", { message });
      const status = (
        (error as { cause?: { statusCode?: number } }).cause ?? {}
      ).statusCode;
      if (
        error instanceof JevError &&
        (status === undefined || [401, 402, 403].includes(status))
      ) {
        throw error;
      }
    }
  }
}

export function startJevWeb(options: JevWebOptions): JevWebState {
  if (state.status === "running" || state.status === "stopping") {
    return jevWebState();
  }
  Object.assign(state, {
    status: "running",
    question: options.question,
    focus: options.focus,
    countries: options.countries,
    threshold: options.threshold,
    autoImport: options.autoImport,
    rounds: 0,
    found: 0,
    processed: 0,
    leads: 0,
    imported: 0,
    skipped: 0,
    failed: 0,
    jevCost: 0,
    searchTokens: 0,
    currentAngle: null,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    message: null,
  } satisfies JevWebState);
  stopRequested = false;
  log.info("indul", {
    focus: options.focus,
    countries: options.countries.map(countryName).join(", ") || "bárhol",
  });

  void loop(options)
    .catch((error) => {
      state.status = "error";
      state.message = error instanceof Error ? error.message : String(error);
      log.error("a futás megállt", { message: state.message });
    })
    .finally(() => {
      if (state.status !== "error") state.status = "done";
      state.finishedAt = new Date().toISOString();
      state.currentAngle = null;
      log.info("vége", {
        rounds: state.rounds,
        processed: state.processed,
        leads: state.leads,
        imported: state.imported,
      });
    });

  return jevWebState();
}
