import type { CompanySize } from "../types";

/** A Hunter CSV egy sora, ahogy az exportból jön. */
export interface HunterRow {
  companyName: string;
  domain: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  industry: string;
  headcount: string;
  companyType: string;
  tags: string;
  linkedin: string;
  description: string;
}

/** A CSV oszlopnevek leképezése — a Hunter több néven is exportál. */
export const COLUMN_ALIASES: Record<keyof HunterRow, string[]> = {
  companyName: ["company name", "company", "name"],
  domain: ["domain", "website", "domain name"],
  city: ["city"],
  state: ["state", "region"],
  postalCode: ["postal code", "zip", "postcode"],
  country: ["country"],
  industry: ["industry"],
  headcount: ["headcount", "company size", "size", "employees"],
  companyType: ["company type", "type"],
  tags: ["tags"],
  linkedin: ["linkedin", "linkedin url"],
  description: ["description", "about"],
};

export type Language = "hu" | "en";

/** Prioritás sáv — ez kerül a `prioritas-*` címkébe is. */
export type Priority = "magas" | "kozepes" | "alacsony" | "nem-celpont";

export const PRIORITY_ORDER: Priority[] = [
  "magas",
  "kozepes",
  "alacsony",
  "nem-celpont",
];

export const PRIORITY_LABELS: Record<Priority, string> = {
  magas: "magas",
  kozepes: "közepes",
  alacsony: "alacsony",
  "nem-celpont": "nem célpont",
};

/** Egy adatminőségi észrevétel, ami a note-ba kerül. */
export interface Flag {
  severity: "info" | "warn";
  text: string;
}

/** Egy kimeneti sor — pontosan az import-séma alakja. */
export interface Lead {
  kind: "it-company";
  company: string;
  website: string;
  email: string | null;
  otherEmails: string[];
  country: string;
  city: string;
  size: CompanySize;
  language: Language;
  tags: string[];
  note: string;
  emailSubject: string;
  emailBody: string;
}

/** A leadhez tartozó, nem exportált elemzés — a felület ezt mutatja. */
export interface LeadReport {
  lead: Lead;
  domain: string;
  priority: Priority;
  score: number;
  flags: Flag[];
  duplicate: boolean;
}
