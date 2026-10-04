/**
 * Interjú-brief: egy oldal felkészülés egy interjú előtt.
 *
 * A cég adataiból, a te első leveledből és a teljes levélváltásból: mit csinál
 * a cég, kivel beszélsz, mi történt eddig, öt várható kérdés, három kérdés
 * tőled, és mire készülj. Csak a megadott tényekre épít — ami nem derül ki,
 * az „nem ismert”, nem kitalált.
 */
import { ObjectId } from "mongodb";
import { conversation } from "./mailStore";
import { getContacts } from "./mongodb";
import { askClaude } from "./aiText";
import { PROFILE } from "./profile";
import type { ContactDoc } from "./types";

export interface InterviewBrief {
  at: string;
  model: string;
  company: string;
  people: string;
  situation: string;
  expectedQuestions: string[];
  myQuestions: string[];
  prep: string[];
}

export async function createInterviewBrief(
  id: string,
): Promise<InterviewBrief> {
  if (!ObjectId.isValid(id)) throw new Error("Érvénytelen sor.");
  const collection = await getContacts();
  const raw = await collection.findOne({ _id: new ObjectId(id) });
  if (!raw) throw new Error("Nincs ilyen sor.");
  const contact = { ...raw, _id: id } as unknown as ContactDoc;
  const thread = await conversation(id);

  const facts = [
    `Cég: ${contact.company}`,
    contact.website ? `Weboldal: ${contact.website}` : null,
    [contact.city, contact.country, contact.size ? `${contact.size} fő` : null]
      .filter(Boolean)
      .join(" · "),
    contact.note ? `Megjegyzés / profil: ${contact.note.slice(0, 1500)}` : null,
    contact.careers?.positions?.length
      ? `Nyitott pozíciók a karrieroldalukon: ${contact.careers.positions.join("; ")}`
      : null,
    contact.people?.length
      ? `Ismert emberek: ${contact.people.map((person) => `${person.name} (${person.role})`).join("; ")}`
      : null,
    "",
    `Az első levelem (${contact.emailSubject}):`,
    (contact.emailBody ?? "").slice(0, 2500),
    "",
    "A levélváltás időrendben:",
    ...thread.map(
      (message) =>
        `--- ${message.date.slice(0, 10)} · ${message.direction === "in" ? `tőlük (${message.from})` : "tőlem"}\n${message.text}`,
    ),
  ]
    .filter((line) => line !== null)
    .join("\n");

  const { data, model } = await askClaude(
    `Interjú-felkészítő briefet írsz magyarul egy full stack fejlesztőnek (${PROFILE.name}; stack: ${PROFILE.stackLetter}).
Csak a megadott tényekből dolgozz. Ami nem derül ki, arra írd: „nem ismert” — semmit ne találj ki (se a cégről, se az interjúztatóról, se számokat).
JSON: {"company":"2-3 mondat: mit tudunk a cégről","people":"kivel beszél / ki írt, szerepe, ha ismert","situation":"hol tart a folyamat a levelezés alapján (időpont, forma, következő lépés)","expectedQuestions":["5 valószínű kérdés, a cégre és a pozícióra szabva"],"myQuestions":["3 okos kérdés tőle, a cég helyzetére építve"],"prep":["3-5 konkrét teendő a felkészüléshez (mit nézzen meg, mit készítsen elő)"]}\n\n${facts}`,
    {
      contactId: id,
      company: contact.company,
      origin: "interju-brief",
    },
  );
  const parsed = data as Partial<InterviewBrief>;
  const list = (value: unknown, max: number) =>
    Array.isArray(value) ? value.map(String).filter(Boolean).slice(0, max) : [];

  const brief: InterviewBrief = {
    at: new Date().toISOString(),
    model,
    company: String(parsed.company ?? "nem ismert"),
    people: String(parsed.people ?? "nem ismert"),
    situation: String(parsed.situation ?? "nem ismert"),
    expectedQuestions: list(parsed.expectedQuestions, 6),
    myQuestions: list(parsed.myQuestions, 4),
    prep: list(parsed.prep, 6),
  };
  await collection.updateOne({ _id: new ObjectId(id) }, {
    $set: { interviewBrief: brief },
  } as never);
  return brief;
}
