/**
 * CSV → import rows.
 *
 * A cég-exportok (LinkedIn / Apollo / Crunchbase-szerű listák) oszlopnevei
 * ismertek, de levélszöveg soha nincs bennük — ezért a hiányzó `emailSubject` /
 * `emailBody` / LinkedIn szövegeket itt generáljuk a cég adataiból.
 */
import type { ImportRow } from "./importSchema";
import { COMPANY_SIZES } from "./types";
import type { CompanySize } from "./types";
import { PROFILE } from "./profile";

/* ------------------------------------------------------------------ */
/* CSV                                                                 */
/* ------------------------------------------------------------------ */

/** RFC 4180 parser: idézőjeles mezők, bennük vessző és sortörés is lehet. */
export function parseCsvTable(input: string): string[][] {
  const text = input.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }

  return rows.filter((line) => line.some((value) => value.trim().length));
}

/**
 * UTF-8 szöveg, amit valaki latin-1-ként olvasott ki ("kÃ¶nnyedÃ©n").
 * Csak akkor javítunk, ha tényleg ez a minta látszik, és minden karakter
 * belefér egy bájtba — különben marad az eredeti.
 */
export function fixMojibake(value: string): string {
  if (!/[\u00c3\u00c2][\u0080-\u00bf]/.test(value)) return value;
  const bytes = new Uint8Array(value.length);
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code > 0xff) return value;
    bytes[i] = code;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return value;
  }
}

function headerKey(value: string): string {
  return fixMojibake(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

/** Oszlopnév → belső mező. Magyar és angol fejlécek is mennek. */
const COLUMNS: Record<string, string> = {
  companyname: "company",
  company: "company",
  cegnev: "company",
  ceg: "company",
  name: "company",
  organization: "company",

  domain: "domain",
  website: "website",
  weboldal: "website",
  url: "website",
  webhely: "website",

  city: "city",
  varos: "city",
  location: "city",
  country: "country",
  orszag: "country",

  industry: "industry",
  iparag: "industry",
  szektor: "industry",
  headcount: "size",
  size: "size",
  letszam: "size",
  employees: "size",
  companysize: "size",
  employeecount: "size",
  numberofemployees: "size",

  companytype: "companyType",
  type: "companyType",
  tags: "tags",
  cimkek: "tags",
  linkedin: "linkedin",
  linkedinurl: "linkedin",
  linkedinprofile: "linkedin",
  description: "description",
  leiras: "description",
  about: "description",

  email: "email",
  emailaddress: "email",
  eppmail: "email",
  emailcim: "email",
  otheremails: "otherEmails",
  tovabbiemailek: "otherEmails",
  person: "person",
  contact: "contact",
  contactname: "person",
  kapcsolattarto: "person",
  fullname: "person",
  role: "role",
  title: "role",
  jobtitle: "role",
  pozicio: "role",

  kind: "kind",
  tipus: "kind",
  note: "note",
  megjegyzes: "note",
  notes: "note",
  emailsubject: "emailSubject",
  subject: "emailSubject",
  targy: "emailSubject",
  emailbody: "emailBody",
  body: "emailBody",
  level: "emailBody",
  linkedinmessage: "linkedinMessage",
  uzenet: "linkedinMessage",
  connectionrequest: "connectionRequest",
  kapcsolatkeres: "connectionRequest",
  key: "key",
  source: "source",
  language: "language",
  nyelv: "language",
  category: "category",
  kategoria: "category",
};

/** Ránézésre CSV? (nem JSON, van fejléce, és felismerünk benne oszlopot) */
export function looksLikeCsv(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || trimmed.startsWith("[") || trimmed.startsWith("{"))
    return false;
  const [first] = parseCsvTable(trimmed.split("\n").slice(0, 1).join("\n"));
  if (!first || first.length < 2) return false;
  return first.some((cell) => COLUMNS[headerKey(cell)] === "company");
}

/* ------------------------------------------------------------------ */
/* Létszám                                                             */
/* ------------------------------------------------------------------ */

const SIZE_EDGES: [number, CompanySize][] = [
  [10, "1-10"],
  [50, "11-50"],
  [200, "51-200"],
  [500, "201-500"],
  [1000, "501-1000"],
  [5000, "1001-5000"],
  [10000, "5001-10000"],
];

/**
 * "1 to 10", "5,001-10,000", "10001+", "120 fő" → a nyolc sáv egyike.
 * A felső határ dönt, mert az exportok is így adják meg a sávot.
 */
export function toSizeBucket(
  raw: string | null | undefined,
): CompanySize | null {
  if (!raw) return null;
  const value = raw
    .toLowerCase()
    .replace(/[,\s\u00a0]/g, "")
    .replace(/[–—]/g, "-");
  if (!value) return null;

  const exact = COMPANY_SIZES.find((size) => size === value);
  if (exact) return exact;

  const numbers = value.match(/\d+/g)?.map(Number) ?? [];
  if (!numbers.length) return null;

  const isOpenEnded = /\+|felett|over|more|plus/.test(value);
  const top = isOpenEnded ? Infinity : Math.max(...numbers);
  if (top > 10000) return "10000+";

  for (const [edge, bucket] of SIZE_EDGES) {
    if (top <= edge) return bucket;
  }
  return "10000+";
}

/* ------------------------------------------------------------------ */
/* Levélszöveg                                                         */
/* ------------------------------------------------------------------ */

const STACK = `${PROFILE.stackLetter}`;

const SIGNATURE_HU = `GitHub: ${PROFILE.github}\n\nPortfólió: ${PROFILE.portfolio}\n\nÜdvözlettel,\n\n${PROFILE.name}\n\n${PROFILE.email} · ${PROFILE.phone}`;
const SIGNATURE_EN = `GitHub: ${PROFILE.github}\n\nPortfolio: ${PROFILE.portfolio}\n\nBest regards,\n\n${PROFILE.name}\n\n${PROFILE.email} · ${PROFILE.phone}`;

/** Angol iparág-nevek magyarul, hogy a levél ne keveredjen. */
const INDUSTRY_HU: Record<string, string> = {
  "it services and it consulting": "IT szolgáltatás és tanácsadás",
  "computer and network security": "IT- és hálózatbiztonság",
  "it system custom software development": "egyedi szoftverfejlesztés",
  "it system operations and maintenance": "rendszerüzemeltetés",
  "software development": "szoftverfejlesztés",
  "computer software": "szoftverfejlesztés",
  "information technology": "információtechnológia",
  "financial services": "pénzügyi szolgáltatások",
  "staffing and recruiting": "toborzás",
};

function industryLabel(
  industry: string | null,
  hungarian: boolean,
): string | null {
  if (!industry) return null;
  if (!hungarian) return industry;
  return INDUSTRY_HU[industry.toLowerCase()] ?? industry;
}

/** Cégnév megszólításhoz: a jogi forma ("Kft.", "Zrt.", "Ltd") lekerül róla. */
function shortName(company: string): string {
  return (
    company
      .replace(
        /\s+(kft\.?|bt\.?|zrt\.?|nyrt\.?|kkt\.?|ltd\.?|limited|gmbh|inc\.?|llc|b\.?v\.?|s\.?a\.?|ag|oy|ab)\s*$/i,
        "",
      )
      .trim() || company
  );
}

interface LetterInput {
  company: string;
  city: string | null;
  industry: string | null;
  size: CompanySize | null;
  language: "hu" | "en";
}

export function buildCompanyLetter(input: LetterInput): {
  emailSubject: string;
  emailBody: string;
  linkedinMessage: string;
  connectionRequest: string;
} {
  const name = shortName(input.company);
  const hu = input.language === "hu";
  const field = industryLabel(input.industry, hu);

  const emailSubject = hu
    ? "Jelentkezés – full stack fejlesztő"
    : "Application – full stack developer";

  const emailBody = hu
    ? [
        `Kedves ${name} Csapat!`,
        `${PROFILE.name} vagyok, full stack fejlesztő Budapestről. ${
          field
            ? `A ${name} ${field} területen dolgozik, ami közel áll ahhoz, amivel nap mint nap foglalkozom, ezért írok nektek.`
            : `A ${name} munkája közel áll ahhoz, amivel nap mint nap foglalkozom, ezért írok nektek.`
        }`,
        `Amivel dolgozom: ${STACK}. Termékfejlesztésben és ügyfélprojektekben is végigvittem feladatokat a tervezéstől az üzemeltetésig, önállóan és csapatban is.`,
        "Ha van most nyitott medior full stack pozíciótok — vagy a közeljövőben lesz —, szívesen küldök önéletrajzot és portfóliót. Budapesten vagy EU-n belüli távmunkában is elérhető vagyok.",
        SIGNATURE_HU,
      ].join("\n\n")
    : [
        `Dear ${name} Team,`,
        `My name is ${PROFILE.name} and I am a full stack developer based in Budapest. ${
          field
            ? `${name} works in ${field}, which is close to what I do day to day, so I wanted to reach out.`
            : `Your work is close to what I do day to day, so I wanted to reach out.`
        }`,
        `My stack: ${STACK}. I have delivered both product and client projects end to end, from design to running them in production.`,
        "If you have an open mid-level full stack position — now or soon — I would be glad to send my CV and portfolio. I am available in Budapest or remotely within the EU.",
        SIGNATURE_EN,
      ].join("\n\n");

  const linkedinMessage = hu
    ? [
        `Sziasztok!`,
        `${PROFILE.name} vagyok, full stack fejlesztő Budapestről (${STACK}).`,
        `A ${name} csapatában szívesen dolgoznék medior full stack pozícióban. Ha van nyitott pozíciótok, küldök önéletrajzot és portfóliót.`,
        `Üdv, ${PROFILE.name}`,
      ].join("\n\n")
    : [
        `Hi ${name} team,`,
        `I'm ${PROFILE.name}, a full stack developer based in Budapest (${STACK}).`,
        `I'd be glad to join ${name} as a mid-level full stack developer. If you have an opening, I'll gladly send my CV and portfolio.`,
        `Best, ${PROFILE.name}`,
      ].join("\n\n");

  // A LinkedIn 300 karakternél levágja a kapcsolatkérést, ezért van rövid
  // változat is arra az esetre, ha a cégnévvel együtt túllógna.
  const long = hu
    ? `Sziasztok! ${PROFILE.name} vagyok, full stack fejlesztő (${STACK}). A ${name} csapatához szívesen csatlakoznék medior full stack pozícióban. Ha van nyitott pozíciótok, küldök CV-t. Üdv, ${PROFILE.name}`
    : `Hi! I'm ${PROFILE.name}, a full stack developer (${STACK}). I'd love to join ${name} as a mid-level full stack developer. If you have an opening, I'll send my CV. Best, ${PROFILE.name}`;
  const short = hu
    ? `Sziasztok! ${PROFILE.name} vagyok, full stack fejlesztő (${STACK}). Medior full stack pozíciót keresek Budapesten vagy EU remote-ban. Üdv, ${PROFILE.name}`
    : `Hi! I'm ${PROFILE.name}, a full stack developer (${STACK}). Looking for a mid-level full stack role in Budapest or EU remote. Best, ${PROFILE.name}`;

  return {
    emailSubject,
    emailBody,
    linkedinMessage,
    connectionRequest: long.length <= 300 ? long : short,
  };
}

/* ------------------------------------------------------------------ */
/* CSV → ImportRow[]                                                   */
/* ------------------------------------------------------------------ */

function clean(value: string | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = fixMojibake(value).trim().replace(/\s+/g, " ");
  return trimmed.length ? trimmed : null;
}

function toUrl(value: string | null): string | null {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+/i.test(value)) return `https://${value}`;
  return value;
}

function splitTags(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(/[;,|]/)
    .map((tag) => tag.trim().toLowerCase().replace(/\s+/g, "-"))
    .filter(Boolean);
}

/**
 * A CSV-t ugyanarra az alakra hozza, amit a JSON-import vár, hogy utána
 * ugyanaz a validálás fusson rá.
 */
export function csvToImportRows(text: string): ImportRow[] {
  const table = parseCsvTable(text);
  if (table.length < 2) return [];

  const [head, ...body] = table;
  const fields = head.map((cell) => COLUMNS[headerKey(cell)] ?? null);

  return body.map((line) => {
    const get = (field: string): string | null => {
      const index = fields.indexOf(field);
      return index === -1 ? null : clean(line[index]);
    };

    const company = get("company") ?? "";
    const country = get("country") ?? "HU";
    const city = get("city");
    const industry = get("industry");
    const companyType = get("companyType");
    const description = get("description");
    const size = toSizeBucket(get("size"));
    const person = get("person");

    const language: "hu" | "en" =
      country.toLowerCase().startsWith("hu") || country.toUpperCase() === "HU"
        ? "hu"
        : "en";

    const kind =
      get("kind") ?? (size && !person ? "it-company" : person ? "" : "agency");

    const generated = buildCompanyLetter({
      company,
      city,
      industry,
      size,
      language,
    });

    const note =
      get("note") ??
      ([
        industry,
        companyType,
        size && size !== "ismeretlen" ? `${size} fő` : null,
        description,
      ]
        .filter(Boolean)
        .join(" · ") ||
        null);

    return {
      kind,
      company,
      website: toUrl(get("website") ?? get("domain")),
      person,
      role: get("role"),
      email: get("email"),
      otherEmails: splitTags(get("otherEmails")).map((item) => item),
      linkedin: toUrl(get("linkedin")),
      country,
      city,
      size,
      language: get("language") ?? language,
      category: get("category"),
      tags: [
        ...splitTags(get("tags")),
        ...(industry ? [slugTag(industry)] : []),
        ...(companyType ? [slugTag(companyType)] : []),
        "csv-import",
      ],
      note,
      emailSubject: get("emailSubject") ?? generated.emailSubject,
      emailBody: get("emailBody") ?? generated.emailBody,
      linkedinMessage: get("linkedinMessage") ?? generated.linkedinMessage,
      connectionRequest:
        get("connectionRequest") ?? generated.connectionRequest,
      key: get("key") ?? undefined,
      source: get("source") ?? undefined,
    } satisfies ImportRow;
  });
}

function slugTag(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}
