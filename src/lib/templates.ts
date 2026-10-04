/**
 * Sablonos szövegkitöltés: `{{cegnev}}` és társai a kontakt adataiból.
 *
 * A tömeges szerkesztés ezzel dolgozik — egy sablont írsz, és minden kijelölt
 * céghez a saját adataival illeszti be.
 */
import type { ContactDoc } from "./types";
import { countryName } from "./countries";
import { PROFILE } from "./profile";

export interface PlaceholderInfo {
  key: string;
  label: string;
  example: string;
}

/** Amit a felület felkínál. A sorrend a hasznosság szerinti. */
export const PLACEHOLDERS: PlaceholderInfo[] = [
  { key: "cegnev", label: "Cég neve", example: "Példa Tech Kft." },
  {
    key: "cegnev_rovid",
    label: "Cégnév jogi forma nélkül",
    example: "Példa Tech",
  },
  {
    key: "kapcsolattarto",
    label: "Kapcsolattartó teljes neve",
    example: "Példa Péter",
  },
  { key: "keresztnev", label: "Kapcsolattartó keresztneve", example: "Péter" },
  { key: "pozicio", label: "Pozíció", example: "Head of Engineering" },
  { key: "varos", label: "Város", example: "Budapest" },
  { key: "orszag", label: "Ország", example: "Magyarország" },
  { key: "meret", label: "Létszám-sáv", example: "51-200 fő" },
  { key: "weboldal", label: "Weboldal", example: "https://pelda.hu" },
  { key: "email", label: "E-mail cím", example: "info@pelda.hu" },
];

/** A jogi forma levágása a megszólításhoz. */
function shortCompany(company: string): string {
  return (
    company
      .replace(
        /\s+(kft\.?|bt\.?|zrt\.?|nyrt\.?|kkt\.?|ltd\.?|limited|gmbh|inc\.?|llc|b\.?v\.?|s\.?a\.?|ag|oy|ab)\s*$/i,
        "",
      )
      .trim() || company
  );
}

function values(contact: ContactDoc): Record<string, string> {
  const person = contact.person?.trim() ?? "";
  // Magyar névsorrend: az utolsó szó a keresztnév ("Példa Péter" → "Péter").
  const first = person ? (person.split(/\s+/).pop() ?? person) : "";

  return {
    cegnev: contact.company,
    cegnev_rovid: shortCompany(contact.company),
    kapcsolattarto: person,
    keresztnev: first,
    pozicio: contact.role ?? "",
    varos: contact.city ?? "",
    orszag: countryName(contact.country),
    meret: contact.size ? `${contact.size} fő` : "",
    weboldal: contact.website ?? "",
    email: contact.primaryEmail ?? "",
  };
}

/**
 * Sablon kitöltése. Az ismeretlen vagy üres helyettesítők kimaradnak, és a
 * körülöttük maradó dupla szóköz/üres sor is összehúzódik — így nem lesz
 * "Tisztelt  Csapat!" alakú félmondat.
 */
export function renderTemplate(template: string, contact: ContactDoc): string {
  const data = values(contact);

  const filled = template.replace(
    /\{\{\s*([a-z_]+)\s*\}\}/gi,
    (_match, key: string) => data[key.toLowerCase()] ?? "",
  );

  return filled
    .split("\n")
    .map((line) => line.replace(/[ \t]{2,}/g, " ").trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}

/** Mely helyettesítők üresek ennél a kontaktnál — a felület ezt jelzi előre. */
export function missingPlaceholders(
  template: string,
  contact: ContactDoc,
): string[] {
  const data = values(contact);
  const used = [...template.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/gi)].map(
    (match) => match[1].toLowerCase(),
  );
  return [...new Set(used)].filter((key) => !data[key]?.trim());
}

/** A megkeresés alap magyar szövege — ez tölti ki a sablonmezőt. */
export const DEFAULT_TEMPLATE_HU = `Tisztelt {{cegnev}} Csapat!

${PROFILE.name} vagyok, Budapesten élő full stack fejlesztő. Elsősorban TypeScript-alapú technológiákkal dolgozom: React, Next.js és Angular a frontenden, NestJS és Node.js a backenden, MongoDB adatbázissal.

Legutóbb a BLCKS-nél, egy Clutch Top 100 digitális ügynökségnél dolgoztam, ahol junior fejlesztőből medior pozícióba léptem elő. Több terméket is végigvittem a specifikációtól az élesítésig, különböző területeken, többek között az egészségügy, utazás, ingatlan és e-kereskedelem világában.

A korábbi munkáim közül különösen két projektet emelnék ki. Az egyik a Wingman, egy utazási mobilalkalmazás, amely több mint 100 000 letöltést ért el. A másik a Flinkit, amely a Product Hunt #2 helyezését érte el. Emellett AI-alapú rendszereken is dolgoztam, és gyakorlati tapasztalatot szereztem az OpenAI és Claude API-k használatában is.

Azért keresem Önöket, mert a technológiai stackjük és a fejlesztési irányuk közel áll ahhoz, amivel napi szinten dolgozom. Érdekelne, hogy van-e jelenleg nyitott fejlesztői pozíció a csapatukban, vagy várható-e ilyen lehetőség a közeljövőben.

Önéletrajzomat csatoltan küldöm, és örömmel egyeztetnék Önökkel egy rövid telefonos beszélgetést is.

GitHub: ${PROFILE.github}
Portfólió: ${PROFILE.portfolio}

Üdvözlettel,
${PROFILE.name}
${PROFILE.email} · ${PROFILE.phone}`;

export const DEFAULT_SUBJECT_HU =
  "Jelentkezés – full stack fejlesztő (TypeScript / Node.js)";

/** LinkedIn üzenet: rövidebb, közvetlenebb, mint a levél. */
export const DEFAULT_LINKEDIN_HU = `Szia {{keresztnev}}!

${PROFILE.name} vagyok, full stack fejlesztő Budapestről (${PROFILE.stackLetter}).

A {{cegnev_rovid}} csapatában szívesen dolgoznék medior full stack pozícióban. Ha van nyitott pozíciótok, küldök önéletrajzot és portfóliót.

Üdv, ${PROFILE.name}`;

/** Kapcsolatkérés: a LinkedIn 300 karakternél levágja. */
export const DEFAULT_CONNECTION_HU =
  `Szia {{keresztnev}}! ${PROFILE.name} vagyok, full stack fejlesztő ` +
  `(${PROFILE.stackLetter}). A {{cegnev_rovid}} ` +
  "csapatához szívesen csatlakoznék medior pozícióban. Ha van nyitott állásotok, " +
  `küldök CV-t. Üdv, ${PROFILE.name}`;

/** Mezőnkénti alapszöveg — a felület ezzel tölti fel a piszkozatokat. */
export const DEFAULT_TEMPLATES: Record<string, string> = {
  emailSubject: DEFAULT_SUBJECT_HU,
  emailBody: DEFAULT_TEMPLATE_HU,
  linkedinMessage: DEFAULT_LINKEDIN_HU,
  connectionRequest: DEFAULT_CONNECTION_HU,
};

/** Szerkeszthető mezők a tömeges sablonozáshoz. */
export const TEMPLATE_FIELDS = [
  { key: "emailSubject", label: "E-mail tárgy" },
  { key: "emailBody", label: "E-mail szövege" },
  { key: "linkedinMessage", label: "LinkedIn üzenet" },
  { key: "connectionRequest", label: "Kapcsolatkérés (max. 300)" },
] as const;

export type TemplateField = (typeof TEMPLATE_FIELDS)[number]["key"];
