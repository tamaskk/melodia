import { credential } from "./env";
import type { ContactDoc } from "./types";
import { PROFILE } from "./profile";

export const OPENAI_MODEL = credential("OPENAI_MODEL", "gpt-4o");

export function openAiKey(): string {
  return credential("OPENAI_API_KEY");
}

export function isAiEnabled(): boolean {
  return openAiKey().length > 0;
}

/**
 * A webes e-mail kereséshez elég a helyi Claude CLI is — ahhoz nem kell
 * OpenAI kulcs, mert az előfizetéses bejelentkezésedet használja.
 */
export function isEmailSearchEnabled(): boolean {
  return (
    openAiKey().length > 0 ||
    credential("EMAIL_SEARCH_PROVIDER", "").toLowerCase() === "claude"
  );
}

/** Facts about the candidate — kept here so the model never invents a CV. */
const CANDIDATE_PROFILE = `
Név: ${PROFILE.name}
Szerep: full stack fejlesztő, Budapest, EU-állampolgár
Stack: TypeScript végig — React, Next.js, Angular a frontenden; Node.js, NestJS a backenden; MongoDB adatbázis
Tapasztalat: több terméket vitt végig specifikációtól élesítésig — egészségügy, utazás, ingatlan, e-kereskedelem;
  AI-alapú rendszerek magánklinikáknak; egy mobilalkalmazás 100 000+ letöltéssel
Munkamód: AI-támogatott fejlesztés napi szinten, de a generált kódért a fejlesztő felel — review és teszt nélkül semmi nem megy ki;
  designerekkel szorosan együttműködik, fontos neki a terv szerinti megjelenés
Keresett pozíció: medior full stack / Forward Deployed Engineer
Elérhetőség: ${PROFILE.email} · ${PROFILE.phone} · ${PROFILE.github} · ${PROFILE.portfolio}
Feltételek: EU-remote vagy Budapest; nem tervez költözni, alkalmi on-site nap megoldható
`.trim();

export interface GeneratedLetter {
  subject: string;
  body: string;
  model: string;
}

function buildPrompt(contact: ContactDoc, instruction: string): string {
  const target = [
    `Cég: ${contact.company}`,
    contact.person ? `Címzett: ${contact.person}` : "Címzett: a cég csapata",
    contact.role ? `Pozíciója: ${contact.role}` : null,
    `Típus: ${
      contact.kind === "company-leader"
        ? "cégvezető"
        : contact.kind === "recruiter"
          ? "toborzó"
          : "toborzó ügynökség"
    }`,
    `Ország: ${contact.country}${contact.city ? ` · ${contact.city}` : ""}`,
    contact.note ? `Megjegyzés a cégről: ${contact.note}` : null,
    contact.tags.length ? `Címkék: ${contact.tags.join(", ")}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return `JELÖLT PROFILJA (csak ezekre a tényekre hivatkozz, ne találj ki újakat):
${CANDIDATE_PROFILE}

CÍMZETT:
${target}

JELENLEGI LEVÉL (ez a kiindulási sablon, ennek a hangvételét és hosszát tartsd):
Tárgy: ${contact.emailSubject}

${contact.emailBody}

${instruction ? `KÜLÖN KÉRÉS A FELHASZNÁLÓTÓL: ${instruction}\n` : ""}
FELADAT: írd újra a levelet erre a konkrét címzettre szabva.`;
}

export async function generateLetter(
  contact: ContactDoc,
  instruction = "",
): Promise<GeneratedLetter> {
  const language =
    contact.language === "hu"
      ? "magyarul, tegeződve, ahogy az eredeti levél"
      : "angolul, udvarias, közvetlen üzleti hangnemben";

  // A helyi Claude CLI viszi (előfizetési keret) — az OpenAI API-kvóta véges.
  // Dinamikus import: statikusan kör lenne (openai → aiText → emailFinderClaude
  // → emailFinder → openai), és az emailFinder betöltéskor már olvasná ezt a modult.
  const { askClaude } = await import("./aiText");
  const { data, model } = await askClaude(
    `Álláskeresési megkereső leveleket írsz egy full stack fejlesztő nevében.
Szabályok:
- Írj ${language}.
- Csak a megadott jelölt-profil tényeire hivatkozz. Semmit ne találj ki: se céges kutatást, se számokat, se korábbi munkahelyet.
- A levél maradjon rövid és konkrét: 4-6 bekezdés, a jelenlegi levél hosszához hasonló.
- A levél a megszólítással kezdődjön, pontosan úgy, ahogy a jelenlegi levél (pl. „Tisztelt … Csapat!” vagy a címzett neve), és az aláírással záruljon.
- Személyre szabás a címzett neve, pozíciója, a cég profilja és a megjegyzés alapján történjen.
- Ne használj közhelyes nyitást ("Remélem jól vagy"), ne dicsérd túl a céget.
- A GitHub / portfólió / elérhetőség sorok maradjanak a levél végén.
- Ne írj olyat, hogy csatolmány, ha az eredeti levél sem írt.
Válasz kizárólag JSON: {"subject": "...", "body": "..."} — a body sortörésekkel tagolt sima szöveg, nem markdown.\n\n${buildPrompt(contact, instruction)}`,
    {
      contactId: contact._id ?? null,
      company: contact.company,
      origin: "levelgeneralas",
    },
  );
  const parsed = data as { subject?: string; body?: string };

  if (!parsed.body?.trim()) {
    throw new Error("A Claude üres levelet adott vissza.");
  }

  return {
    subject: parsed.subject?.trim() || contact.emailSubject,
    body: parsed.body.trim(),
    model,
  };
}
