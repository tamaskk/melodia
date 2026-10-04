/**
 * Kapcsolattartók keresése a cégekhez: HR és vezetés, LinkedIn-profillal.
 *
 * A cél nem egy név, hanem **kinek érdemes írni**: a HR/toborzás dönt a
 * jelentkezésről, a vezetés viszont válaszol is. Ezért mindkettőből kell —
 * ahány van, annyi —, és a kettő külön kategóriában.
 *
 * Ugyanaz a három motor viszi, mint az e-mail keresést (OpenAI API, Claude CLI,
 * Codex CLI), ugyanabban a sorban (`cliQueue`): egyszerre egy folyamat.
 */
import { credential } from "./env";
import { createLogger } from "./logger";
import { searchProvider, type SearchProvider } from "./emailFinder";
import { recordUsage, type SearchUsage } from "./usage";
import { categorise } from "./peopleRoles";
import type { CompanyPerson, ContactDoc } from "./types";

const log = createLogger("kapcsolattarto");

export interface PeopleFinding {
  people: CompanyPerson[];
  notes: string;
  model: string;
  citations: string[];
  usage?: SearchUsage | null;
}

/** A keresés szabályai. Ugyanaz megy mindhárom motornak. */
export const PEOPLE_RULES = `KEMÉNY SZABÁLYOK:
- SOHA ne találj ki nevet vagy profilt. Csak olyan embert adj vissza, akit egy
  konkrét, megnyitott oldalon láttál, és add meg annak az oldalnak az URL-jét.
- Elsősorban LinkedIn-profilokat keress ("<cégnév> HR site:linkedin.com/in",
  "<cégnév> CEO linkedin"), de a cég saját "Rólunk / Csapat / Vezetőség" oldala
  is jó forrás.
- HR-ből ÉS vezetésből is hozz, amennyit találsz — nem csak egyet-egyet.
  Ha öt HR-es van, mind az öt kell; ha három ügyvezető, mind a három.
- Ha HR-es egyáltalán nincs, akkor a vezetésből hozz (CEO, ügyvezető, alapító,
  igazgató) — ilyenkor is legalább egyet.
- A "role" mezőbe az EREDETI titulust írd, ahogy a profilon szerepel.
- A linkedinUrl a személyes profil URL-je (linkedin.com/in/...), nem a cégoldal.
- Ha egy embert nem tudsz a céghez kötni (más cégnél dolgozik, régi pozíció),
  inkább hagyd ki.
- Ha semmit nem találsz, üres listát adj vissza, magyarázattal.`;

const RESPONSE_SHAPE = `Válasz KIZÁRÓLAG JSON, magyarázat nélkül:
{"people":[{"name":"Teljes név","role":"eredeti titulus","linkedinUrl":"URL vagy null",
 "email":"cím vagy null","source":"az oldal URL-je, ahol láttad"}],
 "notes":"1-2 mondat magyarul: mit találtál, mit nem"}`;

export function buildPeoplePrompt(contact: ContactDoc): string {
  return [
    `Cég: ${contact.company}`,
    contact.website ? `Weboldal: ${contact.website}` : "Weboldal: nem ismert",
    contact.linkedinUrl ? `Cég LinkedIn: ${contact.linkedinUrl}` : null,
    `Ország: ${contact.country}${contact.city ? ` · ${contact.city}` : ""}`,
    contact.person ? `Akit már ismerünk: ${contact.person}` : null,
    "",
    "FELADAT: keresd meg, kinél érdemes jelentkezni ennél a cégnél.",
    "Kell: minden HR-es / toborzó / people-partner, ÉS a vezetés (CEO, ügyvezető,",
    "alapító, igazgató). Ha HR nincs, a vezetés a cél. Legfeljebb 8 embert hozz.",
    "",
    PEOPLE_RULES,
    "",
    RESPONSE_SHAPE,
  ]
    .filter((line) => line !== null)
    .join("\n");
}

/** A modell nyers válaszából ellenőrzött, kategorizált emberek. */
export function normalisePeople(
  parsed: Record<string, unknown>,
  model: string,
  citations: string[] = [],
): PeopleFinding {
  const now = new Date().toISOString();
  const raw = Array.isArray(parsed.people)
    ? (parsed.people as Record<string, unknown>[])
    : [];

  const people: CompanyPerson[] = [];
  const seen = new Set<string>();

  for (const item of raw) {
    const name = String(item.name ?? "").trim();
    const role = String(item.role ?? "").trim();
    if (!name || name.length < 3) continue;

    // Egy embert egyszer: a modell néha kétszer sorolja fel más titulussal.
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const linkedinUrl =
      typeof item.linkedinUrl === "string" &&
      /linkedin\.com\/in\//i.test(item.linkedinUrl)
        ? item.linkedinUrl.split("?")[0]
        : null;

    people.push({
      name,
      role: role || "ismeretlen pozíció",
      category: categorise(role),
      linkedinUrl,
      email:
        typeof item.email === "string" && /.+@.+\..+/.test(item.email)
          ? item.email.trim().toLowerCase()
          : null,
      source:
        typeof item.source === "string" && item.source ? item.source : null,
      note: typeof item.note === "string" ? item.note : null,
      foundAt: now,
    });
  }

  // HR elöl, utána a vezetés, végül a többi — a felület így is mutatja.
  const order = { hr: 0, vezetes: 1, egyeb: 2 } as const;
  people.sort((a, b) => order[a.category] - order[b.category]);

  return {
    people: people.slice(0, 12),
    notes: typeof parsed.notes === "string" ? parsed.notes : "",
    model,
    citations,
  };
}

/**
 * Kapcsolattartók keresése egy céghez.
 *
 * A LinkedIn a bejelentkezés nélküli letöltést tiltja, ezért itt a webkeresés
 * **kell** — az e-mail kereséssel ellentétben nem tudjuk kikapcsolni.
 */
export async function findPeople(
  contact: ContactDoc,
  provider: SearchProvider = searchProvider(),
  origin = "kezi",
): Promise<PeopleFinding> {
  const done = log.step(`kapcsolattartók: ${contact.company}`, { provider });

  try {
    const finding = await runPeopleSearch(contact, provider);
    const hr = finding.people.filter(
      (person) => person.category === "hr",
    ).length;
    const lead = finding.people.filter(
      (person) => person.category === "vezetes",
    ).length;
    done(`${finding.people.length} fő (${hr} HR, ${lead} vezetés)`);

    finding.usage = await trackPeopleUsage(contact, provider, origin, finding);
    return finding;
  } catch (error) {
    log.error(
      `kapcsolattartó-keresés hiba: ${contact.company}`,
      (error as Error).message,
    );
    throw error;
  }
}

async function runPeopleSearch(
  contact: ContactDoc,
  provider: SearchProvider,
): Promise<PeopleFinding> {
  if (provider === "claude") {
    const { findPeopleWithClaudeCli } = await import("./peopleFinderCli");
    return findPeopleWithClaudeCli(contact);
  }
  if (provider === "codex") {
    const { findPeopleWithCodexCli } = await import("./peopleFinderCli");
    return findPeopleWithCodexCli(contact);
  }

  const { findPeopleWithOpenAi } = await import("./peopleFinderOpenAi");
  return findPeopleWithOpenAi(contact);
}

async function trackPeopleUsage(
  contact: ContactDoc,
  provider: SearchProvider,
  origin: string,
  finding: PeopleFinding,
): Promise<SearchUsage | null> {
  let usage: SearchUsage | null = null;

  if (provider === "claude" || provider === "codex") {
    const { takeLastStats } =
      provider === "claude"
        ? await import("./emailFinderClaude")
        : await import("./emailFinderCodex");
    const stats = takeLastStats();
    if (stats) usage = { provider, ...stats };
  }

  if (!usage) return null;

  await recordUsage({
    ...usage,
    at: new Date().toISOString(),
    contactId: contact._id,
    company: contact.company,
    found: finding.people.length > 0,
    origin: `${origin}-emberek`,
  });
  return usage;
}

/** Hány embert tartunk soronként legfeljebb — a felület táblázata ennyit mutat. */
export const MAX_PEOPLE = Number(credential("PEOPLE_MAX_PER_COMPANY", "12"));
