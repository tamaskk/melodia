import { countryName } from "./countries";
import type { ContactDoc } from "./types";

export type ExportFormat = "csv" | "json" | "prompt" | "markdown";


function place(contact: ContactDoc): string {
  return [countryName(contact.country), contact.city]
    .filter(Boolean)
    .join(" / ");
}

export type ExportScope = "page" | "filtered" | "selected";

const COLUMNS = [
  "cég",
  "weboldal",
  "kapcsolattartó",
  "pozíció",
  "email",
  "további_emailek",
  "linkedin",
  "ország",
  "város",
  "létszám",
  "típus",
  "forrás",
  "kategória",
  "címkék",
  "megjegyzés",
  "elküldve",
  "kész",
] as const;

function row(contact: ContactDoc): (string | null)[] {
  return [
    contact.company,
    contact.website,
    contact.person,
    contact.role,
    contact.primaryEmail,
    contact.emails.slice(1).join(" ") || null,
    contact.linkedinUrl,
    contact.country,
    contact.city,
    contact.size,
    contact.kind,
    contact.source,
    contact.category,
    contact.tags.join(" ") || null,
    contact.note,
    contact.sent ? "igen" : "nem",
    contact.done ? "igen" : "nem",
  ];
}

function csvCell(value: string | null): string {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

export function toCsv(contacts: ContactDoc[]): string {
  const lines = [
    COLUMNS.join(","),
    ...contacts.map((contact) => row(contact).map(csvCell).join(",")),
  ];
  return lines.join("\n");
}

export function toJson(contacts: ContactDoc[]): string {
  return JSON.stringify(
    contacts.map((contact) => ({
      company: contact.company,
      website: contact.website,
      person: contact.person,
      role: contact.role,
      email: contact.primaryEmail,
      otherEmails: contact.emails.slice(1),
      linkedin: contact.linkedinUrl,
      country: contact.country,
      city: contact.city,
      size: contact.size,
      kind: contact.kind,
      source: contact.source,
      category: contact.category,
      tags: contact.tags,
      note: contact.note,
      sent: contact.sent,
      done: contact.done,
    })),
    null,
    2,
  );
}

export function toMarkdown(contacts: ContactDoc[]): string {
  const head =
    "| Cég | Weboldal | Kapcsolattartó | E-mail | Ország | Létszám | Megjegyzés |";
  const sep = "| --- | --- | --- | --- | --- | --- | --- |";
  const body = contacts.map((contact) =>
    [
      contact.company,
      contact.website ?? "—",
      [contact.person, contact.role].filter(Boolean).join(", ") || "—",
      contact.primaryEmail ?? "—",
      place(contact),
      contact.size ?? "—",
      (contact.note ?? "—").replace(/\|/g, "/"),
    ]
      .map((cell) => ` ${cell} `)
      .join("|")
      .replace(/^/, "|")
      .replace(/$/, "|"),
  );
  return [head, sep, ...body].join("\n");
}

/**
 * Plain-text block meant to be pasted into another AI chat: a short research
 * brief followed by the numbered list of contacts.
 */
export function toPrompt(contacts: ContactDoc[]): string {
  const missing = contacts.filter((contact) => !contact.primaryEmail).length;

  const brief = [
    `Alább ${contacts.length} toborzó ügynökség / cég adatai szerepelnek egy álláskeresési listából.`,
    "",
    "Kérlek keresd meg mindegyikhez, és add vissza táblázatban:",
    "1. publikus jelentkezési e-mail cím (karrier / HR / info), ha van",
    "2. a karrieroldal vagy jelentkezési űrlap közvetlen URL-je",
    "3. foglalkoznak-e full stack fejlesztői (TypeScript, React/Next.js, Angular, Node.js/NestJS, MongoDB) pozíciókkal",
    "4. vállalnak-e EU-n belüli távmunkát / Magyarországról dolgozó jelöltet",
    "",
    "Csak ellenőrizhető, publikus forrásból származó adatot adj meg; ha valamit nem találsz, írd, hogy nincs adat.",
    ...(missing
      ? [
          `${missing} sornál nincs e-mail cím a listában — ezeknél ez a legfontosabb keresendő adat.`,
        ]
      : []),
    "",
    "LISTA:",
  ].join("\n");

  const items = contacts.map((contact, index) => {
    const parts = [
      `${index + 1}. ${contact.company}`,
      place(contact),
      contact.website ?? "weboldal: nincs adat",
      contact.primaryEmail ? `e-mail: ${contact.primaryEmail}` : "e-mail: nincs",
      contact.size ? `létszám: ${contact.size} fő` : null,
      contact.person
        ? `kapcsolattartó: ${contact.person}${contact.role ? ` (${contact.role})` : ""}`
        : null,
      contact.note ? `megjegyzés: ${contact.note}` : null,
    ].filter(Boolean);
    return parts.join(" — ");
  });

  return `${brief}\n${items.join("\n")}\n`;
}

export function buildExport(
  contacts: ContactDoc[],
  format: ExportFormat,
): { text: string; extension: string; mime: string } {
  switch (format) {
    case "json":
      return {
        text: toJson(contacts),
        extension: "json",
        mime: "application/json",
      };
    case "markdown":
      return {
        text: toMarkdown(contacts),
        extension: "md",
        mime: "text/markdown",
      };
    case "prompt":
      return { text: toPrompt(contacts), extension: "txt", mime: "text/plain" };
    case "csv":
    default:
      // BOM keeps Excel happy with the Hungarian accents.
      return {
        text: `﻿${toCsv(contacts)}`,
        extension: "csv",
        mime: "text/csv;charset=utf-8",
      };
  }
}

export function downloadText(
  text: string,
  filename: string,
  mime: string,
): void {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
