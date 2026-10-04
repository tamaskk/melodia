/**
 * E-mail keresés **modell nélkül**: letöltjük a cég kapcsolati oldalait, és
 * regexszel kiszedjük a címeket.
 *
 * Húsz véletlen, még nem keresett cégen mérve: **40%-nál megvan a cég saját
 * domainjén lévő cím**, átlag 2 másodperc alatt, nulla tokenből. A modellre így
 * a nehezebb 60% marad. (Egy modellel futtatott keresés átlaga 259 ezer token
 * és 46 másodperc volt — a drága rész nem a gondolkodás, hanem az oldalak
 * szövegének a kontextusba öntése: körönként ~25 ezer token.)
 */
import { createLogger } from "./logger";
import type { ContactDoc } from "./types";

const log = createLogger("scrape");

/** Ezeken a útvonalakon szokott lenni a cím. A sorrend számít: elöl a legjobbak. */
const PATHS = [
  "",
  "/kapcsolat",
  "/contact",
  "/contact-us",
  "/contacts",
  "/karrier",
  "/careers",
  "/jobs",
  "/impressum",
  "/impresszum",
  "/about",
  "/rolunk",
];

/** Amit sose fogadunk el címnek: követők, példák, képfájlok. */
const JUNK =
  /(sentry|wixpress|example\.(com|org)|domain\.com|yourdomain|yourcompany|email\.com|your\.email|firstname|lastname|yourname|sample@|test@|user@|@2x|\.(png|jpe?g|gif|svg|webp|css|js|woff2?)$)/i;

const EMAIL_RX = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/** Karrier- és HR-címek előre, általános cím utána, személyes cím a végére. */
function score(email: string, sameDomain: boolean): number {
  const local = email.split("@")[0].toLowerCase();
  let value = sameDomain ? 100 : 0;
  if (/^(jobs?|karrier|career|hr|allas|állás|recruit|talent|munka)/.test(local))
    value += 50;
  else if (
    /^(info|office|hello|contact|kapcsolat|mail|iroda|welcome)/.test(local)
  )
    value += 30;
  else if (
    /^(no-?reply|noreply|privacy|dpo|gdpr|adatvedelem|press|sajto|legal)/.test(
      local,
    )
  )
    value -= 40;
  else value += 10; // személyes cím: jó, de nem elsődleges
  return value;
}

export interface ScrapeCandidate {
  email: string;
  source: string;
  label: string | null;
}

export interface ScrapeResult {
  email: string | null;
  source: string | null;
  candidates: ScrapeCandidate[];
  /** Hány oldalt töltöttünk le, és mennyi ideig tartott. */
  pages: number;
  ms: number;
}

export async function fetchPage(
  url: string,
  timeoutMs: number,
): Promise<string | null> {
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        // Sok oldal kizárja a fejléc nélküli klienst; ez egy hétköznapi böngésző.
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        accept: "text/html,application/xhtml+xml",
      },
    });
    if (!response.ok) return null;
    const type = response.headers.get("content-type") ?? "";
    if (!type.includes("html") && !type.includes("text")) return null;
    // 400 kB bőven elég: a kapcsolati adat sosem a HTML végén van.
    return (await response.text()).slice(0, 400_000);
  } catch {
    return null;
  }
}

/** A kezdőlapon megkeresett kapcsolati/karrier link — gyakran nem szabványos úton van. */
function contactLinks(html: string, base: URL): string[] {
  const found = new Set<string>();
  const rx = /<a[^>]+href=["']([^"']+)["'][^>]*>([^<]{0,80})</gi;
  let match: RegExpExecArray | null;

  while ((match = rx.exec(html)) !== null && found.size < 4) {
    const [, href, text] = match;
    const hay = `${href} ${text}`.toLowerCase();
    if (
      !/(kapcsolat|contact|karrier|career|impressum|impresszum|jobs|állás|allas)/.test(
        hay,
      )
    ) {
      continue;
    }
    try {
      const url = new URL(href, base);
      // Csak a saját domain: idegen oldalról nem szedünk címet.
      if (url.host !== base.host) continue;
      url.hash = "";
      found.add(url.toString());
    } catch {
      // hibás href — hagyjuk
    }
  }
  return [...found];
}

function harvest(html: string, url: string, host: string): ScrapeCandidate[] {
  const out = new Map<string, ScrapeCandidate>();

  // A mailto: linkek a legmegbízhatóbbak: azokat tényleg címnek szánták.
  for (const match of html.matchAll(/mailto:([^"'?>\s]+)/gi)) {
    const email = decodeURIComponent(match[1]).trim().toLowerCase();
    if (EMAIL_RX.test(email) && !JUNK.test(email)) {
      out.set(email, { email, source: url, label: "mailto link" });
    }
    EMAIL_RX.lastIndex = 0;
  }

  for (const raw of html.match(EMAIL_RX) ?? []) {
    const email = raw.trim().toLowerCase();
    if (JUNK.test(email) || out.has(email)) continue;
    out.set(email, { email, source: url, label: null });
  }

  return [...out.values()].map((candidate) => ({
    ...candidate,
    label:
      candidate.label ??
      (candidate.email.endsWith(`@${host}`) ? "céges domain" : "más domain"),
  }));
}

/**
 * Egy cég kapcsolati oldalainak átnézése. Weboldal nélkül nem indul: találgatni
 * domaint rosszabb, mint a modellre bízni.
 */
export async function scrapeEmail(
  contact: ContactDoc,
  options: { maxPages?: number; timeoutMs?: number } = {},
): Promise<ScrapeResult> {
  const started = Date.now();
  const maxPages = options.maxPages ?? 6;
  const timeoutMs = options.timeoutMs ?? 8000;

  if (!contact.website) {
    return { email: null, source: null, candidates: [], pages: 0, ms: 0 };
  }

  let base: URL;
  try {
    base = new URL(contact.website);
  } catch {
    return { email: null, source: null, candidates: [], pages: 0, ms: 0 };
  }

  const host = base.host.replace(/^www\./, "");
  const queue = PATHS.map((path) => new URL(path, base).toString());
  const seen = new Set<string>();
  const candidates = new Map<string, ScrapeCandidate>();
  let pages = 0;

  // Kettesével haladunk: a kezdőlap linkjeit még be tudjuk fűzni a sorba.
  for (let index = 0; index < queue.length && pages < maxPages; index += 2) {
    const batch = queue.slice(index, index + 2).filter((url) => !seen.has(url));
    if (!batch.length) continue;
    for (const url of batch) seen.add(url);

    const pagesHtml = await Promise.all(
      batch.map((url) => fetchPage(url, timeoutMs)),
    );
    pages += batch.filter((_, position) => pagesHtml[position] !== null).length;

    pagesHtml.forEach((html, position) => {
      if (!html) return;
      const url = batch[position];

      // A kezdőlapról a valódi kapcsolati linkeket is felvesszük a sorba.
      if (url === queue[0]) {
        for (const link of contactLinks(html, base)) {
          if (!seen.has(link)) queue.push(link);
        }
      }

      for (const candidate of harvest(html, url, host)) {
        if (!candidates.has(candidate.email))
          candidates.set(candidate.email, candidate);
      }
    });

    // Ha már van céges domainű címünk, nem töltünk le többet.
    if ([...candidates.keys()].some((email) => email.endsWith(`@${host}`)))
      break;
  }

  const ranked = [...candidates.values()].sort(
    (a, b) =>
      score(b.email, b.email.endsWith(`@${host}`)) -
      score(a.email, a.email.endsWith(`@${host}`)),
  );

  const best = ranked[0] ?? null;
  const ms = Date.now() - started;

  log.debug(
    `${contact.company}: ${pages} oldal · ${ranked.length} cím` +
      `${best ? ` · legjobb ${best.email}` : ""}`,
    { ms },
  );

  return {
    email: best?.email ?? null,
    source: best?.source ?? null,
    candidates: ranked,
    pages,
    ms,
  };
}
