/**
 * Kézi kapcsolattartó-kutatás: prompt kifelé, JSON befelé.
 *
 * Az automata keresés nem mindig talál — ilyenkor a promptot átviszed egy
 * másik eszközbe (ChatGPT, Claude, Perplexity), és a kapott JSON-t ide
 * illeszted vissza. A cégnév a promptban is, az ellenőrzésnél is szerepel:
 * így nem kerül más cég embere a sorra.
 */
import { categorise } from "./peopleRoles";
import type { CompanyPerson } from "./types";

/** A kutatási prompt, a cég nevével kitöltve. Ez megy a vágólapra. */
export function buildManualPeoplePrompt(company: string): string {
  return `Keress a ${company} cégnél dolgozó, HR-, vezetői és döntéshozói pozícióban lévő embereket, akikkel szoftverfejlesztői álláskeresés vagy szakmai kapcsolatépítés céljából érdemes lehet felvennem a kapcsolatot.

A célod egy minél teljesebb, megbízhatóan ellenőrzött lista összeállítása a releváns ${company}-munkatársakról.

KERESD ELSŐSORBAN EZEKET A POZÍCIÓKAT:

Vezetői és technológiai döntéshozók:
- CEO / Chief Executive Officer
- CTO / Chief Technology Officer
- CHRO / Chief Human Resources Officer
- VP of Engineering / VP of Technology
- Head of Engineering / Head of Software Engineering
- Engineering Director / Director of Engineering
- Head of Technology / Head of Software Development
- Software Engineering Manager / Engineering Manager
- Egyéb releváns technológiai vagy szoftverfejlesztési vezető

HR, recruitment és talent acquisition:
- Head of HR / HR Director
- Talent Acquisition Lead / Talent Acquisition Manager
- Technical Recruiter / IT Recruiter
- Recruitment Lead / Recruitment Manager
- People & Culture vezető
- HR Business Partner
- Egyéb releváns HR-es vagy technológiai toborzási döntéshozó

Keresd azokat a személyeket is, akiknek a pozíciója nem pontosan egyezik a fenti megnevezésekkel, de a szoftverfejlesztői álláskeresés vagy kapcsolatépítés szempontjából relevánsak.

KERESÉSI ÉS ELLENŐRZÉSI SZABÁLYOK:

1. Elsősorban jelenlegi ${company}-munkatársakat keress.
2. Minden személy esetében ellenőrizd, hogy valóban a ${company}-nál dolgozik-e.
3. A LinkedIn-profilokat keresd, ne a cégoldalt.
4. A LinkedIn mellett a ${company} hivatalos weboldalát és más megbízható forrásokat is használhatod az ellenőrzéshez.
5. Ha egy személy több releváns pozíciót tölt be, csak egyszer szerepeljen.
6. Ha a profil nem található meg megbízhatóan, ne találj ki nevet vagy linket.
7. Ha egy személy ${company}-hoz tartozása vagy aktuális pozíciója nem ellenőrizhető megbízhatóan, ne add hozzá a találatokhoz.
8. Ha több országban vagy irodában dolgoznak releváns emberek, mindet keresd.
9. Ne korlátozd a találatok számát; minden megbízhatóan azonosítható, releváns személyt gyűjts össze.
10. Ne adj hozzá olyan személyt, aki csak korábban dolgozott a ${company}-nál, kivéve, ha a jelenlegi ${company}-hoz tartozása megbízhatóan igazolható.
11. A LinkedIn URL-jét csak akkor add meg, ha az a személy saját profiljára mutat, és megbízhatóan azonosítható.
12. Ne használj keresési találati oldalra, cégoldalra, posztra vagy más személy profiljára mutató URL-t.
13. Ne adj hozzá duplikált személyeket akkor sem, ha több pozícióval vagy több forrásban szerepelnek.
14. A position mezőben a személy releváns aktuális ${company}-pozícióját add meg.
15. Ha egy személynek több aktuális releváns pozíciója van, a legfontosabbat vagy a leginkább álláskeresés szempontjából relevánsat add meg.
16. Ne találj ki adatokat, és ne egészítsd ki feltételezések alapján a hiányzó információkat.

KIMENETI FORMÁTUM — EZ KÖTELEZŐ:

A választ kizárólag érvényes JSON-ként add vissza.
Ne legyen előtte vagy utána semmilyen szöveg, Markdown, kommentár vagy magyarázat.
Ne használj Markdown-kódblokkot.

A JSON struktúrája pontosan ez legyen:

{
  "company": "${company}",
  "profiles": [
    {
      "name": "Teljes név",
      "position": "Pozíció",
      "linkedin_url": "https://www.linkedin.com/in/..."
    }
  ]
}

ADATOKRA VONATKOZÓ SZABÁLYOK:

- A name a személy teljes neve legyen.
- A position a releváns aktuális ${company}-pozíciója legyen.
- A linkedin_url kizárólag a személy saját LinkedIn-profiljának URL-je legyen.
- Minden URL legyen teljes, https:// kezdetű LinkedIn-link.
- Ne adj hozzá céges LinkedIn-oldalt.
- Ne adj hozzá olyan személyt, akinek a ${company}-hoz tartozása vagy LinkedIn-profilja nem ellenőrizhető megbízhatóan.
- Ne legyenek duplikált profilok.
- Ha nincs találat, a profiles tömb legyen üres.
- A JSON legyen szintaktikailag érvényes és közvetlenül feldolgozható JavaScriptben JSON.parse() segítségével.
- Ne adj hozzá további mezőket, például sources, notes, confidence vagy description.
- Ne adj hozzá semmilyen, a megadott struktúrán kívüli mezőt.

A VÉGSŐ VÁLASZ CSAK A JSON LEGYEN.`;
}

/**
 * A beillesztett URL kicsomagolása.
 *
 * A másolás gyakran Markdown-linket hoz (`[szöveg](url)`), néha szögletes
 * zárójelet vagy `<url>` alakot. A nyers szöveg így nem illeszkedne a
 * LinkedIn-mintára, és elvesznének a profilok.
 */
function cleanUrl(raw: string): string {
  const trimmed = raw.trim();
  const markdown = trimmed.match(/\]\(\s*<?([^)\s>]+)/);
  if (markdown) return markdown[1];
  return trimmed.replace(/^[[<]+/, "").replace(/[\]>]+$/, "");
}

export interface ManualPeopleResult {
  people: CompanyPerson[];
  /** Amit nem fogadtunk el, és miért — a felület ezt kiírja. */
  skipped: string[];
  /** A JSON-ban szereplő cégnév, ha eltér a soron lévőtől. */
  companyMismatch: string | null;
}

/**
 * A beillesztett válasz feldolgozása.
 *
 * Elnéző a formával (kódblokk, körítő szöveg), de szigorú a tartalommal: név
 * nélkül, hibás LinkedIn-linkkel vagy cégoldalra mutató URL-lel nem veszünk fel
 * senkit. Inkább maradjon ki egy sor, mint hogy rossz profil kerüljön a céghez.
 */
export function parseManualPeople(
  raw: string,
  company: string,
): ManualPeopleResult {
  const cleaned = raw.replace(/```(?:json)?/gi, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error(
      "Nem találtam JSON-t a beillesztett szövegben. A válasznak `{` jellel kell kezdődnie.",
    );
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(cleaned.slice(start, end + 1)) as Record<
      string,
      unknown
    >;
  } catch (error) {
    throw new Error(`Hibás JSON: ${(error as Error).message}`);
  }

  // A tömb lehet a gyökérben is, ha a másik eszköz elhagyta a burkot.
  const rows = Array.isArray(parsed.profiles)
    ? (parsed.profiles as Record<string, unknown>[])
    : Array.isArray(parsed.people)
      ? (parsed.people as Record<string, unknown>[])
      : [];

  const now = new Date().toISOString();
  const people: CompanyPerson[] = [];
  const skipped: string[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    const name = String(row.name ?? "").trim();
    const position = String(row.position ?? row.role ?? "").trim();
    const rawUrl = cleanUrl(String(row.linkedin_url ?? row.linkedinUrl ?? ""));

    if (name.length < 3) {
      skipped.push(`név nélküli sor (${position || "pozíció sincs"})`);
      continue;
    }
    if (seen.has(name.toLowerCase())) {
      skipped.push(`${name} — kétszer szerepel`);
      continue;
    }
    seen.add(name.toLowerCase());

    // Csak személyes profil: a cégoldal és a keresési találat nem jó.
    const linkedinUrl = /^https?:\/\/([a-z]{2,3}\.)?linkedin\.com\/in\//i.test(
      rawUrl,
    )
      ? rawUrl.split("?")[0]
      : null;
    if (rawUrl && !linkedinUrl) {
      skipped.push(
        `${name} — a link nem személyes profil (${rawUrl.slice(0, 60)})`,
      );
    }

    people.push({
      name,
      role: position || "ismeretlen pozíció",
      category: categorise(position),
      linkedinUrl,
      email: null,
      source: linkedinUrl,
      note: "kézi kutatásból",
      foundAt: now,
    });
  }

  const declared =
    typeof parsed.company === "string" ? parsed.company.trim() : "";
  const mismatch =
    declared && declared.toLowerCase() !== company.toLowerCase()
      ? declared
      : null;

  return { people, skipped, companyMismatch: mismatch };
}
