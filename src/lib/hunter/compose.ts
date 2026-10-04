import type { Classification } from "./classify";
import { toCountryCode } from "../countries";
import { hooks, templates } from "./profile";
import type { HunterRow, Lead } from "./types";

/**
 * A levéltörzs szerkezete: megszólítás, bemutatkozás, horgony, referenciák,
 * zárás, linkek, aláírás. A blokkokat üres sor választja el.
 */
export function buildBody(row: HunterRow, c: Classification): string {
  const t = templates[c.language];
  const hook = hooks[c.hook][c.language];
  return [
    t.greeting(row.companyName),
    t.intro,
    hook,
    t.track,
    t.close,
    ...t.links,
    t.signature,
  ].join("\n\n");
}

export function buildSubject(c: Classification): string {
  return templates[c.language].subject;
}

/**
 * A note három részből áll: a Hunter leírása, az általunk detektált
 * figyelmeztetések, végül a nyers Hunter metaadat + LinkedIn.
 * A " | Hunter:" elválasztó szándékos: erre lehet később hasítani.
 */
export function buildNote(row: HunterRow, c: Classification): string {
  const parts: string[] = [];

  const desc = row.description.trim();
  parts.push(desc.length > 0 ? `Profil: ${desc}` : "Profil: a Hunter exportjában nincs leírás.");

  const warns = c.flags.filter((f) => f.severity === "warn").map((f) => f.text);
  const infos = c.flags.filter((f) => f.severity === "info").map((f) => f.text);
  if (warns.length > 0) parts.push(warns.join(" "));
  if (infos.length > 0) parts.push(infos.join(" "));

  parts.push(`Pontszám: ${c.score} — prioritás: ${c.priority}.`);

  const meta = [row.industry, `${row.headcount || "ismeretlen"} fő`, row.companyType || "n/a"]
    .filter((s) => s.length > 0)
    .join(", ");
  const linkedin = row.linkedin.trim().length > 0 ? ` LinkedIn: ${row.linkedin}` : "";

  return `${parts.join(" ")} | Hunter: ${meta}.${linkedin}`;
}


export function buildLead(row: HunterRow, c: Classification): Lead {
  return {
    kind: "it-company",
    company: row.companyName,
    website: `https://${row.domain}`,
    email: null,
    otherEmails: [],
    country: toCountryCode(row.country) || "HU",
    city: row.city.trim().length > 0 ? row.city : "Budapest",
    size: c.size,
    language: c.language,
    tags: c.tags,
    note: buildNote(row, c),
    emailSubject: buildSubject(c),
    emailBody: buildBody(row, c),
  };
}
