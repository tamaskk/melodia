/**
 * ATS board-azonosítók.
 *
 * A LISTA MAGA a boards.json-ben van — adat, nem kód. Ez a fájl csak típust
 * ad neki, hogy az adapterek `COMPANIES.greenhouse` alakban érjék el.
 *
 * Ezek a cégek "slugjai" a saját ATS-üknél. Az ATS API-k nem tudnak keresni —
 * cégenként kell lekérdezni, aztán szűrünk. Ezért a lista minősége határozza
 * meg, mennyit ér neked ez a réteg.
 *
 * Bővítés és ellenőrzés:
 *   npm run boards -- greenhouse          # a jelöltlista élő ellenőrzése
 *   npm run boards -- lever acme foo      # célzottan
 *
 * Hogyan találsz újat:
 *   Greenhouse:     site:job-boards.greenhouse.io "Budapest"
 *   Lever:          site:jobs.lever.co "Berlin"
 *   Ashby:          site:jobs.ashbyhq.com "Amsterdam"
 *   Recruitee:      site:recruitee.com "Amsterdam"
 *   Workable:       site:apply.workable.com "Vienna"
 *   Personio:       site:jobs.personio.de
 *
 * Vagy: nyisd meg a cég karrieroldalát, és nézd meg, hová redirectel.
 *
 * A nem létező slugok csendben kimaradnak (404), nem törik el a keresést —
 * de felesleges hívások, ezért a greenhouse listát élőben ellenőriztük.
 */
import boards from "./boards.json";

export const COMPANIES = {
  greenhouse: boards.greenhouse,
  lever: boards.lever,
  ashby: boards.ashby,
  recruitee: boards.recruitee,
  workable: boards.workable,
  personio: boards.personio,
  smartrecruiters: boards.smartrecruiters,
} satisfies Record<string, string[]>;

export type AtsVendor = keyof typeof COMPANIES;
