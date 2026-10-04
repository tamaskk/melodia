/**
 * Parses every outreach PDF in ./pdfs (or the folder given as argv[2]) into
 * src/data/imported.json — the single dataset the app and the seeder read.
 *
 *   npm run parse -- ~/Downloads/files1
 *
 * Page families recognised:
 *   A. leader page    — "1. E-MAIL" + "2. LINKEDIN …"        (person + company)
 *   B. recruiter page — "KAPCSOLATKÉRÉSHEZ" / "FOR A CONNECTION REQUEST"
 *   C. letter page    — "Subject:" / "Tárgy:" without "1. E-MAIL"  (agency)
 *   D. anything else  — index/table pages, skipped
 *
 * Output is deduplicated: identical company+person+email pairs collapse into a
 * single contact, keeping the richest version.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import type { Contact, ContactKind, Language } from "../src/lib/types";
import { linkedinSearch, slug, websiteFromEmail } from "../src/data/helpers";

const require = createRequire(import.meta.url);
const { PDFParse } = require("pdf-parse");

/* ------------------------------------------------------------------ */
/* Per-file metadata                                                   */
/* ------------------------------------------------------------------ */

interface FileMeta {
  source: string;
  label: string;
  kind: ContactKind;
  country: string;
  language: Language;
  category: string;
  /** Table-only documents carry no letters and are skipped. */
  skip?: boolean;
}

const FILES: Record<string, FileMeta> = {
  "Nemet_IT_vezetok_es_levelek.pdf": {
    source: "german-leaders", label: "Német IT-cégvezetők",
    kind: "company-leader", country: "DE", language: "en", category: "leadership",
  },
  "Osztrak_IT_vezetok_es_levelek.pdf": {
    source: "austrian-leaders", label: "Osztrák IT-cégvezetők",
    kind: "company-leader", country: "AT", language: "en", category: "leadership",
  },
  "Belga_IT_vezetok_es_levelek.pdf": {
    source: "belgian-leaders", label: "Belga IT-cégvezetők",
    kind: "company-leader", country: "BE", language: "en", category: "leadership",
  },
  "Holland_IT_vezetok_es_levelek.pdf": {
    source: "dutch-leaders", label: "Holland IT-cégvezetők",
    kind: "company-leader", country: "NL", language: "en", category: "leadership",
  },
  "USA_IT_vezetok_es_levelek.pdf": {
    source: "usa-leaders", label: "USA IT-cégvezetők",
    kind: "company-leader", country: "US", language: "en", category: "leadership",
  },
  "Magyar_IT_CEO_k_es_levelek.pdf": {
    source: "hungarian-leaders", label: "Magyar IT-cégvezetők",
    kind: "company-leader", country: "HU", language: "hu", category: "leadership",
  },
  "LinkedIn_uzenetek_toborzoknak.pdf": {
    source: "linkedin-recruiters", label: "LinkedIn toborzók",
    kind: "recruiter", country: "HU", language: "hu", category: "agency",
  },
  "LinkedIn_IT_toborzok.pdf": {
    source: "linkedin-recruiters", label: "LinkedIn toborzók (névsor)",
    kind: "recruiter", country: "HU", language: "hu", category: "agency",
    skip: true, // same 112 people, no letters — covered by the document above
  },
  "Jelentkezo_emailek_ugynoksegeknek.pdf": {
    source: "agency-emails-hu", label: "Magyar ügynökségek",
    kind: "agency", country: "HU", language: "hu", category: "agency",
  },
  "Application_emails_Austria.pdf": {
    source: "agency-emails-at", label: "Osztrák ügynökségek",
    kind: "agency", country: "AT", language: "en", category: "agency",
  },
  "Application_emails_Belgium.pdf": {
    source: "agency-emails-be", label: "Belga ügynökségek",
    kind: "agency", country: "BE", language: "en", category: "agency",
  },
  "Application_emails_Germany.pdf": {
    source: "agency-emails-de", label: "Német ügynökségek",
    kind: "agency", country: "DE", language: "en", category: "agency",
  },
  "Application_emails_Netherlands.pdf": {
    source: "agency-emails-nl", label: "Holland ügynökségek",
    kind: "agency", country: "NL", language: "en", category: "agency",
  },
  "Application_emails_Spain_Barcelona.pdf": {
    source: "agency-emails-es", label: "Spanyol ügynökségek (Barcelona)",
    kind: "agency", country: "ES", language: "en", category: "agency",
  },
  "US_MASTER_all_agencies_letters.pdf": {
    source: "agency-emails-us", label: "USA ügynökségek",
    kind: "agency", country: "US", language: "en", category: "agency",
  },
  "US_MASTER_agencies_and_letters.pdf": {
    source: "agency-emails-us", label: "USA ügynökségek",
    kind: "agency", country: "US", language: "en", category: "agency",
  },
  "US_agencies_emails_letters.pdf": {
    source: "agency-emails-us", label: "USA ügynökségek",
    kind: "agency", country: "US", language: "en", category: "agency",
  },
};

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const EMAIL_RX = /[\w.+-]+@[\w-]+\.[\w.-]+/g;

/** Footer/button lines injected by the PDF generator. */
const NOISE = [
  /^E-MAIL MEGNYITÁSA/i,
  /^LINKEDIN PROFIL MEGNYITÁSA/i,
  /^MEGNYITÁS LEVELEZŐBEN/i,
  /^KÜLDÉS\s*→/i,
  /^SEND\s*→/i,
  /^OPEN IN MAIL APP/i,
  /^OPEN IN YOUR MAIL/i,
  /^A gomb megnyitja/i,
  /^The button opens/i,
  /^Ennél a cégnél nincs publikus/i,
  /^At this company there is no/i,
  /^\d+\s*\/\s*\d+$/,
];

function isNoise(line: string): boolean {
  return NOISE.some((rx) => rx.test(line.trim()));
}

function cleanLines(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !isNoise(line));
}

const BLOCK_START_RX =
  /^(Subject:|Tárgy:|Dear\b|Hi\b|Hallo\b|Kedves\b|Szia\b|Best regards|Kind regards|Mit freundlichen|Met vriendelijke|Üdvözlettel|Best,|Üdv,|GitHub:|Portfolio:|Portfólió:|LinkedIn:|Kálmán Tamás|Tamás\b|\+36\b)/;

const GREETING_RX = /^(Dear|Hi|Hallo|Kedves|Szia)\b.*[,!]$/;

/**
 * Joins hard-wrapped PDF lines back into paragraphs.
 *
 * The PDF wraps every paragraph at a fixed width, so a line noticeably
 * shorter than the widest line in the block is a paragraph ending.
 */
function joinLines(lines: string[]): string {
  if (!lines.length) return "";

  const widest = Math.max(...lines.map((line) => line.length));
  const wrapWidth = Math.max(40, widest * 0.78);

  const out: string[] = [];
  let buffer = "";

  const flush = () => {
    if (buffer.trim()) out.push(buffer.trim());
    buffer = "";
  };

  for (const line of lines) {
    if (buffer && BLOCK_START_RX.test(line)) flush();

    buffer = buffer ? `${buffer} ${line}` : line;

    const short = line.length < wrapWidth;
    const sentenceEnd = /[.!?:]["”')]?$/.test(line);
    if (GREETING_RX.test(line) || (short && (sentenceEnd || BLOCK_START_RX.test(line)))) {
      flush();
    }
  }
  flush();
  return out.join("\n\n");
}

const FULL_NAME = "Kálmán Tamás Krisztián";

/**
 * The PDFs sign the messages inconsistently — "Tamás Krisztián Kálmán",
 * "Tamás Kálmán", "Kálmán Tamás", or just "Tamás". Normalise every one of them
 * to the full Hungarian form.
 *
 * The greeting is never touched: some recipients are called Tamás too, and
 * those lines end with "!" or start with "Szia/Kedves/Hi", which none of the
 * patterns below can match.
 */
/** The short stack list in the connection requests omitted Angular and Node.js. */
const STACK_RX = /TypeScript,\s*React\/Next\.js,\s*NestJS,\s*MongoDB/g;
const STACK_FULL = "TypeScript, React/Next.js, Angular, NodeJS, NestJS, MongoDB";

function normaliseName(text: string): string {
  return (
    text
      .replace(STACK_RX, STACK_FULL)
      .replace(/Tamás Krisztián Kálmán/g, FULL_NAME)
      .replace(/Tamás Kálmán/g, FULL_NAME)
      .replace(/Kálmán Tamás(?! Krisztián)/g, FULL_NAME)
      // "Hi Mark, I'm Tamás, a full stack developer…"
      .replace(/\bI'm Tamás(?=\s*,)/g, `I'm ${FULL_NAME}`)
      .replace(/\bI am Tamás(?=\s*,)/g, `I am ${FULL_NAME}`)
      // "Üdv, Tamás" / "Best, Tamás" sign-offs (also across a line break)
      .replace(
        /(Üdvözlettel|Üdv|Best regards|Kind regards|Best),(\s*)Tamás(?!\s*Kriszti)/g,
        `$1,$2${FULL_NAME}`,
      )
  );
}

/** Paragraph reconstruction + footer removal + name normalisation. */
function toParagraphs(lines: string[]): string {
  return normaliseName(stripFooter(joinLines(lines)));
}

/**
 * The PDF pages end with an instruction footer ("…attach your CV and reference
 * letter there"). It is wrapped across lines, so the tail can survive the
 * line-level noise filter and get glued onto the signature. Everything after
 * the signature line is footer, so cut there.
 */
const FOOTER_FRAGMENTS = [
  /\bAz önéletrajzot(\s+és az ajánlólevelet)?\b[\s\S]*$/i,
  /\bajánlólevelet\b[\s\S]*$/i,
  /\bA gomb megnyitja\b[\s\S]*$/i,
  /\bThe button opens\b[\s\S]*$/i,
  /\bEnnél a cégnél\b[\s\S]*$/i,
  /\battach your CV and reference letter\b[\s\S]*$/i,
  /\bcímzettet te (adod meg|írod be)\b[\s\S]*$/i,
  /\bmásold a szöveget\b[\s\S]*$/i,
  /\byou fill in the recipient\b[\s\S]*$/i,
];

/** "Üdv, Tamás" / "Best, Tamás" — the last line of the short messages. */
// No \b before "Üdv": JS word boundaries are ASCII-only, so \bÜ never matches.
const SIGN_OFF_RX =
  /(?:^|[\s(])(Üdvözlettel|Üdv|Best regards|Kind regards|Best)\s*,?\s+Tamás/gu;

function stripFooter(body: string): string {
  let out = body;

  // Signature phone number is always the last real content of a full letter.
  const phone = out.lastIndexOf("+36 70 315 7553");
  if (phone !== -1) {
    out = out.slice(0, phone + "+36 70 315 7553".length);
  } else {
    // Short messages end with the sign-off; the PDF glues its usage hint after
    // it ("…Üdv, Tamás  Az önéletrajzot ott csatold.").
    const matches = [...out.matchAll(SIGN_OFF_RX)];
    const last = matches[matches.length - 1];
    if (last?.index !== undefined) {
      out = out.slice(0, last.index + last[0].length);
    }
  }

  for (const rx of FOOTER_FRAGMENTS) out = out.replace(rx, "");

  return out
    .split("\n\n")
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

function uniqueEmails(text: string): string[] {
  const found = text.match(EMAIL_RX) ?? [];
  return [
    ...new Set(
      found
        .map((email) => email.toLowerCase().replace(/[.,;)]+$/, ""))
        .filter((email) => !email.includes("kalman.tamaskrisztian")),
    ),
  ];
}

function sectionBetween(
  lines: string[],
  startRx: RegExp,
  endRx: RegExp | null,
): string[] {
  const start = lines.findIndex((line) => startRx.test(line));
  if (start === -1) return [];
  const rest = lines.slice(start + 1);
  if (!endRx) return rest;
  const end = rest.findIndex((line) => endRx.test(line));
  return end === -1 ? rest : rest.slice(0, end);
}

/* ------------------------------------------------------------------ */
/* Page parsers                                                        */
/* ------------------------------------------------------------------ */

interface Parsed {
  company: string;
  person: string | null;
  role: string | null;
  emails: string[];
  note: string | null;
  emailSubject: string;
  emailBody: string;
  linkedinMessage: string | null;
  connectionRequest: string | null;
  city: string | null;
  category?: string;
  language?: Language;
}

const SUBJECT_RX = /^(Subject|Tárgy):\s*/i;
const LEADER_EMAIL_RX = /^1\.\s*E-?MAIL/i;
const LEADER_LI_RX = /^2\.\s*LINKEDIN/i;
const LEADER_CONN_RX = /^3\.\s*(RÖVID|SHORT|KAPCSOLAT)/i;
const CONNECTION_RX = /^(KAPCSOLATKÉRÉSHEZ|FOR A CONNECTION REQUEST)/i;
const RECRUITER_CATEGORY_RX =
  /^(ÜGYNÖKSÉGI IT-TOBORZÓ|CÉGEN BELÜLI TECH-TOBORZÓ|ÁLTALÁNOS TOBORZÓ)/i;

function parseLeaderPage(lines: string[]): Parsed | null {
  if (lines.length < 4) return null;

  const company = lines[1]?.includes("·")
    ? lines[1].split("·").slice(1).join("·").trim()
    : (lines[1] ?? "").trim();
  const role = lines[1]?.includes("·") ? lines[1].split("·")[0].trim() : null;
  const person = lines[0].trim();

  const headerEnd = lines.findIndex((line) => LEADER_EMAIL_RX.test(line));
  const header = lines.slice(2, headerEnd === -1 ? 4 : headerEnd);
  const emails = uniqueEmails(header.join(" "));
  const note =
    header
      .filter((line) => !EMAIL_RX.test(line) && !/^Nincs publikus/i.test(line))
      .join(" · ") || null;

  const emailSection = sectionBetween(lines, LEADER_EMAIL_RX, LEADER_LI_RX);
  const subjectLine = emailSection.find((line) => SUBJECT_RX.test(line)) ?? "";
  const emailSubject = normaliseName(subjectLine.replace(SUBJECT_RX, "").trim());
  const emailBody = toParagraphs(
    emailSection.filter((line) => !SUBJECT_RX.test(line)),
  );

  const linkedinMessage = toParagraphs(
    sectionBetween(lines, LEADER_LI_RX, LEADER_CONN_RX),
  );
  const connectionRequest = toParagraphs(
    sectionBetween(lines, LEADER_CONN_RX, null),
  );

  if (!emailBody) return null;

  return {
    company: company || person,
    person,
    role,
    emails,
    note,
    emailSubject: emailSubject || "Full stack developer – introduction",
    emailBody,
    linkedinMessage: linkedinMessage || null,
    connectionRequest: connectionRequest || null,
    city: note ? (note.split("·")[0].trim() || null) : null,
  };
}

function parseRecruiterPage(lines: string[]): Parsed | null {
  const person = lines[0]?.trim();
  if (!person) return null;

  const categoryLine = lines[1] ?? "";
  const language: Language = /in English/i.test(categoryLine) ? "en" : "hu";
  const roleLine = lines[2] ?? "";

  const connectionIndex = lines.findIndex((line) => CONNECTION_RX.test(line));
  const messageLines = lines.slice(3, connectionIndex === -1 ? undefined : connectionIndex);
  const connectionLines =
    connectionIndex === -1 ? [] : lines.slice(connectionIndex + 1);

  const message = toParagraphs(messageLines);
  if (!message) return null;

  const [role, ...companyParts] = roleLine.split("·").map((part) => part.trim());
  const companyCandidate = companyParts.join(" · ");
  // "Executive search · 25 év headhunting" — the tail is a qualifier, not a firm.
  const looksLikeCompany =
    companyCandidate.length > 0 &&
    !/^\d/.test(companyCandidate) &&
    !/^(freelance|független|karriertanácsadó)$/i.test(companyCandidate);

  return {
    company: looksLikeCompany ? companyCandidate : "Független / freelance",
    person,
    role: looksLikeCompany ? role || null : roleLine || null,
    emails: [],
    note: `${categoryLine} · ${roleLine}`,
    emailSubject:
      language === "hu"
        ? "Full stack fejlesztő – bemutatkozás"
        : "Full stack developer – introduction",
    emailBody: message,
    linkedinMessage: message,
    connectionRequest: toParagraphs(connectionLines) || null,
    city: null,
    category:
      /CÉGEN BELÜLI/i.test(categoryLine)
        ? "inhouse"
        : /ÁLTALÁNOS/i.test(categoryLine)
          ? "general"
          : "agency",
    language,
  };
}

function parseLetterPage(lines: string[]): Parsed | null {
  const subjectIndex = lines.findIndex((line) => SUBJECT_RX.test(line));
  if (subjectIndex === -1) return null;

  const company = lines[0]?.trim();
  if (!company) return null;

  const header = lines.slice(1, subjectIndex);
  const emails = uniqueEmails(header.join(" "));
  // These pages repeat their header above the letter, so drop repeats.
  const note =
    [
      ...new Set(
        header.filter(
          (line) =>
            !EMAIL_RX.test(line) &&
            !/^(Dear |Kedves |Hi )/.test(line) &&
            !/^My name is/.test(line) &&
            !/^(I am|am )/.test(line),
        ),
      ),
    ].join(" · ") || null;

  const emailSubject = normaliseName(
    lines[subjectIndex].replace(SUBJECT_RX, "").trim(),
  );
  const emailBody = toParagraphs(lines.slice(subjectIndex + 1));
  if (!emailBody) return null;

  const cityMatch = note?.match(
    /batch\s*·\s*([^·]+)/i,
  );

  return {
    company,
    person: null,
    role: null,
    emails,
    note,
    emailSubject,
    emailBody,
    linkedinMessage: null,
    connectionRequest: null,
    city: cityMatch ? cityMatch[1].trim() : null,
  };
}

function classify(lines: string[]): "leader" | "recruiter" | "letter" | null {
  const hasLeaderEmail = lines.some((line) => LEADER_EMAIL_RX.test(line));
  const hasLeaderLinkedin = lines.some((line) => LEADER_LI_RX.test(line));
  if (hasLeaderEmail && hasLeaderLinkedin) return "leader";
  if (RECRUITER_CATEGORY_RX.test(lines[1] ?? "")) return "recruiter";
  if (lines.some((line) => SUBJECT_RX.test(line))) return "letter";
  return null;
}

/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */

const sourceDir = process.argv[2]
  ? path.resolve(process.argv[2].replace(/^~/, process.env.HOME ?? "~"))
  : path.join(process.cwd(), "pdfs");

async function readPages(file: string): Promise<string[]> {
  const parser = new PDFParse({ data: new Uint8Array(fs.readFileSync(file)) });
  const result = await parser.getText();
  await parser.destroy();
  return result.pages.map((page: { text: string }) => page.text);
}

/**
 * The PDFs carry the real destinations as link annotations: the company name
 * points at the company website, the person name at their LinkedIn search and
 * the send button at a mailto with every recipient. Plain text extraction drops
 * all of that, so read the annotations separately.
 */
async function readPageLinks(file: string): Promise<string[][]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(fs.readFileSync(file)),
    useSystemFonts: true,
    // The parser only needs annotations, so keep the console quiet.
    verbosity: 0,
  }).promise;

  const pages: string[][] = [];
  for (let index = 1; index <= doc.numPages; index += 1) {
    const page = await doc.getPage(index);
    const annotations = (await page.getAnnotations()) as {
      subtype?: string;
      url?: string;
    }[];
    pages.push(
      annotations
        .filter((item) => item.subtype === "Link" && item.url)
        .map((item) => item.url as string),
    );
    page.cleanup();
  }
  await doc.destroy();
  return pages;
}

const OWN_LINK_RX = /(github\.com\/tamaskk|tamaskk\.com|kalman\.tamaskrisztian)/i;

interface PageLinks {
  website: string | null;
  linkedinUrl: string | null;
  mailtoEmails: string[];
}

function classifyLinks(urls: string[]): PageLinks {
  let website: string | null = null;
  let linkedinUrl: string | null = null;
  const mailtoEmails: string[] = [];

  for (const url of urls) {
    if (url.startsWith("mailto:")) {
      const recipients = decodeURIComponent(
        url.slice("mailto:".length).split("?")[0],
      );
      for (const address of recipients.split(/[,;]/)) {
        const clean = address.trim().toLowerCase();
        if (clean.includes("@") && !OWN_LINK_RX.test(clean)) {
          mailtoEmails.push(clean);
        }
      }
      continue;
    }
    if (!/^https?:\/\//i.test(url)) continue;
    if (OWN_LINK_RX.test(url)) continue;
    if (/linkedin\.com/i.test(url)) {
      linkedinUrl ??= url;
      continue;
    }
    website ??= url;
  }

  return { website, linkedinUrl, mailtoEmails: [...new Set(mailtoEmails)] };
}

function normalise(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Two contacts are the same when the person (or company) and email match. */
function dedupeKey(contact: Contact): string {
  const who = contact.person ? normalise(contact.person) : "";
  const company = normalise(contact.company)
    .replace(
      /\b(gmbh|ag|kft|zrt|bv|nv|sa|sl|inc|llc|ltd|co|group|international|hungary|deutschland|austria|usa)\b/g,
      "",
    )
    .trim();
  const email = contact.primaryEmail ?? "";
  return `${contact.kind}|${who || company}|${email}`;
}

/**
 * "Motion Recruitment – Atlanta" / "Aerotek / Allegis – Detroit" → "motion recruitment".
 * City offices of one firm share a mailbox, so they must collapse into one row.
 */
function baseCompany(company: string): string {
  const head = company
    .split(/\s[–—-]\s|\s*\(|\s*\/\s*/)[0]
    .replace(
      /\b(gmbh|ag|kft|zrt|bv|nv|sa|sl|inc|llc|ltd|co|group|international|hungary|deutschland|austria|usa|us|nederland|belgium|espana)\b/gi,
      "",
    );
  return normalise(head);
}

function richness(contact: Contact): number {
  return (
    (contact.primaryEmail ? 100 : 0) +
    (contact.website ? 30 : 0) +
    (contact.linkedinUrl ? 5 : 0) +
    (contact.linkedinMessage ? 40 : 0) +
    (contact.connectionRequest ? 20 : 0) +
    (contact.person ? 10 : 0) +
    (contact.note?.length ?? 0) / 100 +
    contact.emailBody.length / 10000
  );
}

async function main() {
  if (!fs.existsSync(sourceDir)) {
    console.error(`PDF folder not found: ${sourceDir}`);
    process.exit(1);
  }

  const now = new Date().toISOString();
  const contacts: Contact[] = [];
  const sourceLabels: Record<string, string> = {};
  const perFile: Record<string, number> = {};

  const files = fs
    .readdirSync(sourceDir)
    .filter((name) => name.toLowerCase().endsWith(".pdf"))
    .sort();

  for (const file of files) {
    const meta = FILES[file];
    if (!meta) {
      console.warn(`! unknown PDF, skipped: ${file}`);
      continue;
    }
    if (meta.skip) {
      console.log(`- skipped (duplicate index): ${file}`);
      continue;
    }
    sourceLabels[meta.source] = meta.label;

    const fullPath = path.join(sourceDir, file);
    const pages = await readPages(fullPath);
    const pageLinks = await readPageLinks(fullPath);
    let parsedCount = 0;

    for (const [pageIndex, page] of pages.entries()) {
      const lines = cleanLines(page);
      const type = classify(lines);
      if (!type) continue;

      const parsed =
        type === "leader"
          ? parseLeaderPage(lines)
          : type === "recruiter"
            ? parseRecruiterPage(lines)
            : parseLetterPage(lines);

      if (!parsed) continue;

      // Real destinations come from the page's link annotations.
      const links = classifyLinks(pageLinks[pageIndex] ?? []);
      const emails = [...new Set([...parsed.emails, ...links.mailtoEmails])];
      const primaryEmail = emails[0] ?? null;
      const language = parsed.language ?? meta.language;
      const category = parsed.category ?? meta.category;

      contacts.push({
        key: `${meta.source}:${slug(parsed.person ?? parsed.company)}${
          parsed.person ? `-${slug(parsed.company)}` : ""
        }`,
        source: meta.source as Contact["source"],
        kind: meta.kind,
        channel:
          meta.kind === "recruiter"
            ? "linkedin"
            : parsed.linkedinMessage && primaryEmail
              ? "both"
              : parsed.linkedinMessage
                ? "linkedin"
                : "email",

        company: parsed.company,
        website: links.website ?? websiteFromEmail(primaryEmail),
        person: parsed.person,
        role: parsed.role,

        emails,
        primaryEmail,
        linkedinUrl:
          links.linkedinUrl ??
          (parsed.person ? linkedinSearch(parsed.person) : null),

        city: parsed.city,
        country: meta.country,
        size: null,
        language,
        category,
        tags: [
          ...new Set([
            meta.country.toLowerCase(),
            meta.kind,
            category,
            primaryEmail ? "van-email" : "nincs-email",
          ]),
        ],
        note: parsed.note,

        emailSubject: parsed.emailSubject,
        emailBody: parsed.emailBody,
        linkedinMessage: parsed.linkedinMessage,
        connectionRequest: parsed.connectionRequest,

        sent: false,
        sentAt: null,
        done: false,
        doneAt: null,
        starred: false,

        createdAt: now,
        updatedAt: now,
      });
      parsedCount += 1;
    }

    perFile[file] = parsedCount;
    console.log(
      `${String(parsedCount).padStart(4)} / ${String(pages.length).padStart(4)} pages  ${file}`,
    );
  }

  // --- dedupe -------------------------------------------------------
  const best = new Map<string, Contact>();
  const keySeen = new Map<string, number>();
  let duplicates = 0;

  for (const contact of contacts) {
    const dk = dedupeKey(contact);
    const existing = best.get(dk);
    if (!existing) {
      best.set(dk, contact);
      continue;
    }
    duplicates += 1;
    if (richness(contact) > richness(existing)) {
      // Keep the richer record but preserve any note the other one had.
      best.set(dk, {
        ...contact,
        note: contact.note ?? existing.note,
        website: contact.website ?? existing.website,
        linkedinUrl: contact.linkedinUrl ?? existing.linkedinUrl,
        emails: [...new Set([...contact.emails, ...existing.emails])],
      });
    } else {
      existing.emails = [...new Set([...existing.emails, ...contact.emails])];
      existing.website ??= contact.website;
      existing.linkedinUrl ??= contact.linkedinUrl;
    }
  }

  // --- second pass: one mailbox, many city offices --------------------
  const byMailbox = new Map<string, Contact>();
  const merged: Contact[] = [];
  let officesMerged = 0;

  for (const contact of best.values()) {
    if (!contact.primaryEmail || contact.person) {
      merged.push(contact);
      continue;
    }
    const mailboxKey = `${contact.kind}|${contact.country}|${baseCompany(
      contact.company,
    )}|${contact.primaryEmail}`;
    const existing = byMailbox.get(mailboxKey);

    if (!existing) {
      byMailbox.set(mailboxKey, contact);
      merged.push(contact);
      continue;
    }

    officesMerged += 1;
    // Keep the shortest (base) name, collect the office locations in the note.
    existing.website ??= contact.website;
    if (contact.company.length < existing.company.length) {
      existing.company = contact.company;
      existing.emailSubject = contact.emailSubject;
      existing.emailBody = contact.emailBody;
    }
    const offices = new Set(
      [existing.city, contact.city].filter((city): city is string =>
        Boolean(city),
      ),
    );
    if (offices.size) {
      const label = `Irodák: ${[...offices].join(", ")}`;
      existing.note = existing.note?.includes("Irodák:")
        ? existing.note.replace(/Irodák: .*/, label)
        : [existing.note, label].filter(Boolean).join(" · ");
    }
    if (!existing.tags.includes("tobb-iroda")) existing.tags.push("tobb-iroda");
  }

  // The recruiter pages only link to the person, never to their employer.
  // Borrow the website from the agency row of the same company when we have it.
  const websiteByCompany = new Map<string, string>();
  for (const contact of merged) {
    if (!contact.website) continue;
    const name = baseCompany(contact.company);
    if (name.length > 2 && !websiteByCompany.has(name)) {
      websiteByCompany.set(name, contact.website);
    }
  }
  let websitesBorrowed = 0;
  for (const contact of merged) {
    if (contact.website) continue;
    const match = websiteByCompany.get(baseCompany(contact.company));
    if (match) {
      contact.website = match;
      websitesBorrowed += 1;
    }
  }

  // Different firms sometimes share one mailbox in the source PDFs — flag them
  // so the same inbox does not get several near-identical letters unnoticed.
  const mailboxUse = new Map<string, number>();
  for (const contact of merged) {
    if (contact.primaryEmail) {
      mailboxUse.set(
        contact.primaryEmail,
        (mailboxUse.get(contact.primaryEmail) ?? 0) + 1,
      );
    }
  }
  for (const contact of merged) {
    if (contact.primaryEmail && (mailboxUse.get(contact.primaryEmail) ?? 0) > 1) {
      contact.tags.push("kozos-postafiok");
    }
  }

  // Storage key must be unique too (different companies can share a slug).
  const final = merged.map((contact) => {
    const count = (keySeen.get(contact.key) ?? 0) + 1;
    keySeen.set(contact.key, count);
    return count === 1 ? contact : { ...contact, key: `${contact.key}-${count}` };
  });

  final.sort((a, b) =>
    a.source === b.source
      ? a.company.localeCompare(b.company, "hu")
      : a.source.localeCompare(b.source),
  );

  const outFile = path.join(process.cwd(), "src", "data", "imported.json");
  fs.writeFileSync(
    outFile,
    `${JSON.stringify({ generatedAt: now, sourceLabels, contacts: final }, null, 1)}\n`,
  );

  const bySource = final.reduce<Record<string, number>>((acc, contact) => {
    acc[contact.source] = (acc[contact.source] ?? 0) + 1;
    return acc;
  }, {});

  console.log("\nparsed pages:", contacts.length);
  console.log("duplicates merged:", duplicates);
  console.log("city offices merged:", officesMerged);
  console.log("websites borrowed for recruiters:", websitesBorrowed);
  console.log("unique contacts:", final.length);
  console.log("with email:", final.filter((c) => c.primaryEmail).length);
  console.log("with website:", final.filter((c) => c.website).length);
  console.table(bySource);
  console.log(`\nwritten: ${outFile}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
