import { COUNTRY_CODES, toCountryCode } from "./countries";
import { csvToImportRows, looksLikeCsv } from "./csvImport";
import { normaliseName } from "./name";
import { COMPANY_SIZES } from "./types";
import type { CompanySize, Contact, ContactKind, Language } from "./types";
import { PROFILE } from "./profile";

/** Slug helper — kept local so the schema module has no data dependency. */
function slug(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

export const KINDS: ContactKind[] = [
  "agency",
  "recruiter",
  "company-leader",
  "it-company",
];

export const KIND_LABELS: Record<ContactKind, string> = {
  agency: "Ügynökség",
  recruiter: "LinkedIn toborzó",
  "company-leader": "IT cégvezető",
  "it-company": "IT cég",
};

/** One row as the user (or an AI) writes it. */
export interface ImportRow {
  kind?: string;
  company?: string;
  website?: string | null;
  person?: string | null;
  role?: string | null;
  email?: string | null;
  otherEmails?: string[];
  linkedin?: string | null;
  country?: string;
  city?: string | null;
  /** Head count bucket, required for kind "it-company". */
  size?: string | null;
  language?: string;
  category?: string | null;
  tags?: string[];
  note?: string | null;
  emailSubject?: string;
  emailBody?: string;
  linkedinMessage?: string | null;
  connectionRequest?: string | null;
  /** Optional: set it to update an existing row instead of creating one. */
  key?: string;
  source?: string;
}

export interface RowIssue {
  index: number;
  company: string;
  field: string;
  message: string;
}

export interface ParseResult {
  contacts: Contact[];
  errors: RowIssue[];
  warnings: RowIssue[];
}

const EMAIL_RX = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function asArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

/**
 * Turns the loose import shape into full Contact documents.
 * Everything the dashboard needs but the user did not supply is derived here.
 */
export interface ParseOptions {
  /** Kézzel választott típus: felülír mindent, ami a sorban van. */
  forceKind?: ContactKind;
}

export function parseImport(
  input: unknown,
  options: ParseOptions = {},
): ParseResult {
  const errors: RowIssue[] = [];
  const warnings: RowIssue[] = [];
  const contacts: Contact[] = [];

  // A bemenet lehet JSON-szöveg, CSV-szöveg vagy már kész objektum.
  let payload = input;
  if (typeof payload === "string") {
    const text = payload.trim();
    if (looksLikeCsv(text)) {
      const csvRows = csvToImportRows(text);
      warnings.push({
        index: 0,
        company: "—",
        field: "csv",
        message: `CSV-ként olvastam be: ${csvRows.length} sor. A hiányzó levélszöveget a cég adataiból generáltam.`,
      });
      payload = csvRows;
    } else {
      try {
        payload = JSON.parse(text);
      } catch (error) {
        errors.push({
          index: 0,
          company: "—",
          field: "JSON",
          message: `Hibás JSON: ${(error as Error).message}. Ha CSV-t illesztettél be, hagyd benne a fejlécsort (Company Name, Domain, Country, Headcount…).`,
        });
        return { contacts, errors, warnings };
      }
    }
  }

  const rows: unknown[] = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as { contacts?: unknown[] })?.contacts)
      ? ((payload as { contacts: unknown[] }).contacts as unknown[])
      : [];

  if (!rows.length) {
    errors.push({
      index: 0,
      company: "—",
      field: "root",
      message:
        'A bemenet legyen JSON-tömb, { "contacts": [ … ] } objektum, vagy fejléces CSV — legalább egy adatsorral.',
    });
    return { contacts, errors, warnings };
  }

  const now = new Date().toISOString();
  const seenKeys = new Set<string>();

  rows.forEach((raw, index) => {
    const row = (raw ?? {}) as ImportRow;
    const company = asString(row.company) ?? "";
    const label = company || `#${index + 1}`;
    const fail = (field: string, message: string) =>
      errors.push({ index, company: label, field, message });
    const warn = (field: string, message: string) =>
      warnings.push({ index, company: label, field, message });

    const person = asString(row.person);

    // Missing "kind" is unambiguous when there is no contact person: an entry
    // without a name can only be a company/agency letter.
    let kind = (options.forceKind ?? asString(row.kind) ?? "") as ContactKind;
    if (
      options.forceKind &&
      asString(row.kind) &&
      asString(row.kind) !== options.forceKind
    ) {
      warn(
        "kind",
        `A sorban "${asString(row.kind)}" volt, de a kézi választásod szerint "${options.forceKind}" lett.`,
      );
    }
    if (!kind && !person) {
      kind = "agency";
      warn(
        "kind",
        'Hiányzott, de nincs személy a sorban — "agency"-ként vettem fel.',
      );
    }
    if (!KINDS.includes(kind)) {
      fail(
        "kind",
        `Kötelező, és ez lehet: ${KINDS.join(" | ")}. Ha van "person" mező, neked kell megadnod, hogy "recruiter" vagy "company-leader".`,
      );
    }
    if (!company) fail("company", "Kötelező mező.");

    const rawCountry = asString(row.country) ?? "";
    const country = toCountryCode(rawCountry);
    // Kétbetűs ISO-kód vagy a saját "INT" (nemzetközi) kódunk.
    if (!/^[A-Z]{2,3}$/.test(country) || !COUNTRY_CODES.includes(country)) {
      fail(
        "country",
        rawCountry
          ? `Nem ismerem fel ezt az országot: "${rawCountry}". Támogatott kódok: ${COUNTRY_CODES.join(", ")}.`
          : `Kötelező. Kétbetűs kód vagy országnév, pl. HU, DE, GB, AE — támogatott: ${COUNTRY_CODES.join(", ")}.`,
      );
    }

    const emailSubject = asString(row.emailSubject);
    const emailBody = asString(row.emailBody);
    if (!emailSubject) fail("emailSubject", "Kötelező mező.");
    if (!emailBody) fail("emailBody", "Kötelező mező.");

    if ((kind === "recruiter" || kind === "company-leader") && !person) {
      fail("person", `A(z) "${kind}" típusnál kötelező a személy neve.`);
    }

    const email = asString(row.email)?.toLowerCase() ?? null;
    if (email && !EMAIL_RX.test(email)) {
      fail("email", `Nem érvényes e-mail cím: ${email}`);
    }

    const otherEmails = asArray(row.otherEmails).map((item) =>
      item.toLowerCase(),
    );
    for (const extra of otherEmails) {
      if (!EMAIL_RX.test(extra)) {
        fail("otherEmails", `Nem érvényes e-mail cím: ${extra}`);
      }
    }

    const website = asString(row.website);
    if (website && !/^https?:\/\//i.test(website)) {
      fail("website", "http:// vagy https:// előtaggal add meg.");
    }
    const linkedin = asString(row.linkedin);
    if (linkedin && !/^https?:\/\//i.test(linkedin)) {
      fail("linkedin", "http:// vagy https:// előtaggal add meg.");
    }

    const rawSize = asString(row.size);
    const size = (rawSize?.replace(/\s|\u00a0/g, "").replace(/–|—/g, "-") ??
      null) as CompanySize | null;
    if (size && !COMPANY_SIZES.includes(size)) {
      fail(
        "size",
        `Csak ezek lehetnek: ${COMPANY_SIZES.join(" | ")} (kaptam: "${rawSize}")`,
      );
    }
    if (kind === "it-company" && !size) {
      fail(
        "size",
        `IT cégnél kötelező. Lehetséges értékek: ${COMPANY_SIZES.join(" | ")}`,
      );
    }

    const connectionRequest = asString(row.connectionRequest);
    if (connectionRequest && connectionRequest.length > 300) {
      warn(
        "connectionRequest",
        `${connectionRequest.length} karakter — a LinkedIn 300-nál levágja.`,
      );
    }

    const language = (asString(row.language) ?? "hu") as Language;
    if (language !== "hu" && language !== "en") {
      fail("language", '"hu" vagy "en" lehet.');
    }

    if (errors.some((issue) => issue.index === index)) return;

    const source =
      asString(row.source) ??
      (kind === "agency"
        ? `agency-emails-${country.toLowerCase()}`
        : kind === "recruiter"
          ? "linkedin-recruiters"
          : kind === "it-company"
            ? `it-companies-${country.toLowerCase()}`
            : `${country.toLowerCase()}-leaders`);

    const key =
      asString(row.key) ??
      `${source}:${slug(person ?? company)}${person ? `-${slug(company)}` : ""}`;

    if (seenKeys.has(key)) {
      warn("key", `Ismétlődő sor ebben a JSON-ban (${key}) — az utolsó nyer.`);
    }
    seenKeys.add(key);

    const emails = [
      ...new Set([email, ...otherEmails].filter(Boolean)),
    ] as string[];
    const category =
      asString(row.category) ??
      (kind === "company-leader"
        ? "leadership"
        : kind === "it-company"
          ? "it-company"
          : "agency");

    contacts.push({
      key,
      source,
      kind,
      channel: linkedin && email ? "both" : linkedin ? "linkedin" : "email",

      company,
      website,
      person,
      role: asString(row.role),

      emails,
      primaryEmail: email,
      linkedinUrl: linkedin,

      city: asString(row.city),
      country,
      size,
      language,
      category,
      tags: [
        ...new Set([
          country.toLowerCase(),
          kind,
          category,
          // Az "ismeretlen" sávból nem csinálunk címkét: azzal nem lehet szűrni
          // semmi hasznosat, a `size` mező viszont megmarad.
          ...(size && size !== "ismeretlen" ? [`meret-${size}`] : []),
          email ? "van-email" : "nincs-email",
          "importalt",
          ...asArray(row.tags),
        ]),
      ],
      note: asString(row.note),

      // A jelölt neve minden szövegben "Kálmán Tamás Krisztián".
      emailSubject: normaliseName(emailSubject as string),
      emailBody: normaliseName(emailBody as string),
      linkedinMessage: asString(row.linkedinMessage)
        ? normaliseName(asString(row.linkedinMessage) as string)
        : null,
      connectionRequest: connectionRequest
        ? normaliseName(connectionRequest)
        : null,

      sent: false,
      sentAt: null,
      done: false,
      doneAt: null,
      starred: false,
      origin: "import",

      createdAt: now,
      updatedAt: now,
    });
  });

  return { contacts, errors, warnings };
}

/* ------------------------------------------------------------------ */
/* Templates                                                           */
/* ------------------------------------------------------------------ */

const SIGNATURE_HU = `GitHub: ${PROFILE.github}\n\nPortfólió: ${PROFILE.portfolio}\n\nÜdvözlettel,\n\n${PROFILE.name}\n\n${PROFILE.email} · ${PROFILE.phone}`;
const SIGNATURE_EN = `GitHub: ${PROFILE.github}\n\nPortfolio: ${PROFILE.portfolio}\n\nBest regards,\n\n${PROFILE.name}\n\n${PROFILE.email} · ${PROFILE.phone}`;

export function template(kind: ContactKind): ImportRow[] {
  if (kind === "agency") {
    return [
      {
        kind: "agency",
        company: "Példa Recruiting Kft.",
        website: "https://pelda-recruiting.hu",
        email: "info@pelda-recruiting.hu",
        otherEmails: ["hr@pelda-recruiting.hu"],
        country: "HU",
        city: "Budapest",
        language: "hu",
        tags: ["it-staffing"],
        note: "Honnan van az adat, mire figyelj a jelentkezésnél.",
        emailSubject: "Jelentkezés – full stack fejlesztő",
        emailBody: `Kedves Példa Recruiting Csapat!\n\n${PROFILE.name} vagyok, full stack fejlesztő Budapestről…\n\n${SIGNATURE_HU}`,
      },
    ];
  }

  if (kind === "recruiter") {
    return [
      {
        kind: "recruiter",
        company: "Példa Consulting",
        person: "Példa Anna",
        role: "IT Recruiter",
        linkedin: "https://www.linkedin.com/in/pelda-anna/",
        email: null,
        country: "HU",
        language: "hu",
        category: "agency",
        tags: ["linkedin"],
        note: "ÜGYNÖKSÉGI IT-TOBORZÓ · magyarul",
        emailSubject: "Full stack fejlesztő – bemutatkozás",
        emailBody: `Szia Anna!\n\n${PROFILE.name} vagyok, full stack fejlesztő Budapestről…\n\n${SIGNATURE_HU}`,
        linkedinMessage: `Szia Anna!\n\n${PROFILE.name} vagyok, full stack fejlesztő Budapestről…`,
        connectionRequest: `Szia Anna! ${PROFILE.name} vagyok, full stack fejlesztő (${PROFILE.stackLetter}). Új lehetőséget keresek. Üdv, ${PROFILE.name}`,
      },
    ];
  }

  if (kind === "it-company") {
    return [
      {
        kind: "it-company",
        company: "Példa Tech Zrt.",
        website: "https://pelda-tech.hu",
        size: "51-200",
        person: "Példa Péter",
        role: "Head of Engineering",
        linkedin: "https://www.linkedin.com/company/pelda-tech/",
        email: "jobs@pelda-tech.hu",
        country: "HU",
        city: "Budapest",
        language: "hu",
        category: "it-company",
        tags: ["fintech"],
        note: "Saját termék · 120 fő · React + Node stack.",
        emailSubject: "Jelentkezés – full stack fejlesztő",
        emailBody: `Kedves Példa Tech Csapat!\n\n${PROFILE.name} vagyok, full stack fejlesztő Budapestről…\n\n${SIGNATURE_HU}`,
      },
    ];
  }

  return [
    {
      kind: "company-leader",
      company: "Példa Software GmbH",
      website: "https://pelda-software.de",
      person: "Max Mustermann",
      role: "Geschäftsführer",
      linkedin:
        "https://www.linkedin.com/search/results/people/?keywords=Max%20Mustermann",
      email: "info@pelda-software.de",
      country: "DE",
      city: "München",
      language: "en",
      category: "leadership",
      note: "München, 2011 · ~200 fő · cloud-native szoftver",
      emailSubject: "Full stack developer – introduction",
      emailBody: `Dear Max,\n\nMy name is ${PROFILE.name} and I am a full stack developer based in Budapest…\n\n${SIGNATURE_EN}`,
      linkedinMessage: `Hi Max, I'm ${PROFILE.name}, a full stack developer based in Budapest…`,
      connectionRequest: `Hi Max, I'm ${PROFILE.name}, a full stack developer (${PROFILE.stackLetter}) based in Budapest. Best, ${PROFILE.name}`,
    },
  ];
}

/** Copy-paste brief that makes another AI produce valid import JSON. */
export function schemaPrompt(kind: ContactKind): string {
  const example = JSON.stringify(template(kind), null, 2);

  return `Készíts JSON-t az alábbi séma szerint. A válasz KIZÁRÓLAG a JSON tömb legyen, magyarázat nélkül.

Típus: "${kind}" (${KIND_LABELS[kind]})

KÖTELEZŐ mezők minden elemnél:
- kind: pontosan "${kind}"
- company: a cég neve
- country: kétbetűs országkód nagybetűvel vagy országnév. Támogatott kódok:
  ${COUNTRY_CODES.join(", ")}
- emailSubject: a levél tárgya
- emailBody: a teljes levél szövege, bekezdések között üres sorral (\\n\\n)${
    kind === "agency" || kind === "it-company"
      ? ""
      : "\n- person: a megszólított személy teljes neve"
  }${
    kind === "it-company"
      ? `\n- size: létszám-sáv, pontosan az egyik: ${COMPANY_SIZES.join(" | ")}`
      : ""
  }

OPCIONÁLIS mezők:
- website: a cég weboldala, https:// előtaggal
- email: publikus jelentkezési cím; ha nincs, hagyd null-on (ne találj ki címet!)
- otherEmails: további címek tömbje
- linkedin: LinkedIn profil vagy keresési URL
- role: a személy pozíciója
- city: város
- language: "hu" vagy "en" (alapértelmezés: "hu")
- category: "agency" | "inhouse" | "general" | "leadership" | "it-company"
- tags: saját címkék tömbje
- note: megjegyzés (honnan az adat, mire figyelj)${
    kind === "it-company"
      ? "\n- person: kapcsolattartó neve, ha ismert"
      : `\n- size: létszám-sáv (${COMPANY_SIZES.join(" | ")})`
  }
- linkedinMessage: hosszabb LinkedIn-üzenet
- connectionRequest: kapcsolatkérés, legfeljebb 300 karakter
- key: csak akkor add meg, ha meglévő sort akarsz felülírni

SZABÁLYOK:
- Ne találj ki e-mail címet, weboldalt vagy nevet. Amit nem tudsz ellenőrizni, az legyen null.
- A levelekben a név mindig "${PROFILE.name}".
- A stack: ${PROFILE.stackLetter}.
- A jelölt Budapesten él, EU-állampolgár, EU-n belüli távmunkát keres.

PÉLDA (egy elem):
${example}`;
}
