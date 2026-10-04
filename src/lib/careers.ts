/**
 * Nyitott fejlesztői pozíciók a cég karrieroldalán — token nélkül.
 *
 * A kezdőlapon megkeresi a karrier-linket (vagy kipróbálja a szokásos
 * útvonalakat), követi a külső álláskezelőt is (Teamtailor, Workable, Lever …),
 * és kigyűjti a fejlesztői pozíciók címeit. A levél hivatkozhat rájuk, a
 * pontszám pedig előrébb veszi az ilyen céget.
 */
import { ObjectId } from "mongodb";
import { createLogger } from "./logger";
import { getContacts } from "./mongodb";
import { rescoreIds } from "./contacts";
import { fetchPage } from "./scrapeEmail";

const log = createLogger("karrier");

const CAREER_LINK =
  /(karrier|career|jobs?\b|állás|allas|csatlakozz|join[\s-]?us|work[\s-]?with[\s-]?us|dolgozz|open[\s-]?positions|vacanc|stellen|empleo)/i;
const PATHS = [
  "/karrier",
  "/careers",
  "/career",
  "/jobs",
  "/allasok",
  "/allas",
  "/en/careers",
  "/hu/karrier",
];
/** Külső álláskezelők: ide gyakran kivezet a karrier-link. */
const ATS =
  /(teamtailor|workable|lever\.co|greenhouse|recruitee|personio|smartrecruiters|bamboohr|jobs\.ashbyhq|breezy|homerun|join\.com|profession\.hu)/i;
const DEV =
  /(developer|fejleszt[őo]|engineer|programoz|full[\s-]?stack|front[\s-]?end|back[\s-]?end|react|node\.?js|typescript|angular|javascript|software|szoftver|devops|web[\s-]?dev)/i;
const NOISE =
  /(cookie|adatvédelem|privacy|gdpr|newsletter|hírlevél|©|copyright|blog)/i;

export interface CareersResult {
  url: string | null;
  positions: string[];
  checkedAt: string;
}

function baseDomain(host: string): string {
  return host
    .replace(/^www\./, "")
    .split(".")
    .slice(-2)
    .join(".");
}

function careerLinks(html: string, base: URL): string[] {
  const found = new Set<string>();
  const rx = /<a[^>]+href=["']([^"'#]+)["'][^>]*>([\s\S]{0,120}?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = rx.exec(html)) !== null && found.size < 4) {
    const [, href, inner] = match;
    const text = inner.replace(/<[^>]+>/g, " ");
    if (!CAREER_LINK.test(`${href} ${text}`)) continue;
    try {
      const url = new URL(href, base);
      const same = baseDomain(url.host) === baseDomain(base.host);
      if (!same && !ATS.test(url.host)) continue;
      found.add(url.toString());
    } catch {
      // hibás href
    }
  }
  return [...found];
}

/** Pozíciócímek: címsorok, linkek, listaelemek szövegéből a fejlesztői jellegűek. */
export function extractPositions(html: string): string[] {
  const texts = [
    ...html.matchAll(
      /<(h[1-4]|a|li|strong|span|p)[^>]*>([\s\S]{0,300}?)<\/\1>/gi,
    ),
  ]
    .map((match) =>
      match[2]
        .replace(/<[^>]+>/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&nbsp;/g, " ")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter(
      (text) =>
        text.length >= 6 &&
        text.length <= 110 &&
        DEV.test(text) &&
        !NOISE.test(text),
    );
  const seen = new Set<string>();
  const positions: string[] = [];
  for (const text of texts) {
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    positions.push(text);
    if (positions.length >= 8) break;
  }
  return positions;
}

export async function findCareers(website: string): Promise<CareersResult> {
  const checkedAt = new Date().toISOString();
  let base: URL;
  try {
    base = new URL(
      /^https?:\/\//i.test(website) ? website : `https://${website}`,
    );
  } catch {
    return { url: null, positions: [], checkedAt };
  }
  const home = await fetchPage(base.toString(), 8000);
  const candidates = [
    ...(home ? careerLinks(home, base) : []),
    ...PATHS.map((path) => new URL(path, base).toString()),
  ];
  const tried = new Set<string>();
  let firstCareersPage: string | null = null;
  for (const url of candidates) {
    if (tried.has(url) || tried.size >= 5) continue;
    tried.add(url);
    const html = await fetchPage(url, 8000);
    if (!html) continue;
    firstCareersPage ??= url;
    const positions = extractPositions(html);
    if (positions.length) return { url, positions, checkedAt };
  }
  return { url: firstCareersPage, positions: [], checkedAt };
}

/** Egy sor ellenőrzése és mentése (a pontszám is frissül). */
export async function checkCareers(id: string): Promise<CareersResult | null> {
  if (!ObjectId.isValid(id)) return null;
  const collection = await getContacts();
  const contact = await collection.findOne(
    { _id: new ObjectId(id) },
    { projection: { website: 1, company: 1 } },
  );
  if (!contact?.website) return null;
  const result = await findCareers(contact.website);
  await collection.updateOne({ _id: new ObjectId(id) }, {
    $set: { careers: result },
  } as never);
  rescoreIds([id]);
  log.info(
    `${contact.company}: ${result.positions.length ? `${result.positions.length} fejlesztői pozíció` : "nincs fejlesztői pozíció"}`,
    {
      oldal: result.url,
    },
  );
  return result;
}

/* Tömeges ellenőrzés a háttérben: egyesével, leállíthatóan. */

export interface CareersRunState {
  status: "idle" | "running" | "done";
  total: number;
  processed: number;
  withPositions: number;
  current: string | null;
}

const shared = globalThis as typeof globalThis & {
  __melodiaCareers?: { state: CareersRunState; stop: boolean };
};
const run = (shared.__melodiaCareers ??= {
  state: {
    status: "idle",
    total: 0,
    processed: 0,
    withPositions: 0,
    current: null,
  },
  stop: false,
});

export function careersState(): CareersRunState {
  return { ...run.state };
}

export function stopCareers(): CareersRunState {
  run.stop = true;
  return careersState();
}

export function startCareers(ids: string[]): CareersRunState {
  if (run.state.status === "running") return careersState();
  const valid = ids.filter((id) => ObjectId.isValid(id));
  run.stop = false;
  Object.assign(run.state, {
    status: "running",
    total: valid.length,
    processed: 0,
    withPositions: 0,
    current: null,
  });
  void (async () => {
    for (const id of valid) {
      if (run.stop) break;
      run.state.current = id;
      try {
        const result = await checkCareers(id);
        if (result?.positions.length) run.state.withPositions += 1;
      } catch (error) {
        log.warn(`karrieroldal hiba: ${(error as Error).message}`);
      }
      run.state.processed += 1;
    }
    run.state.status = "done";
    run.state.current = null;
    log.info(
      `karrieroldalak: ${run.state.processed} ellenőrizve, ${run.state.withPositions} helyen van fejlesztői pozíció`,
    );
  })();
  return careersState();
}
