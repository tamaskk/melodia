/**
 * Beérkezett válaszok osztályozása és válaszpiszkozat.
 *
 * Minden emberi válaszhoz: kategória (interjú / kérdés / elutasítás / később /
 * automatikus / egyéb), egy mondatos összefoglaló, és egy rövid válasz-
 * piszkozat a válasz nyelvén. Magas bizonyosságnál a kimenetel magától áll
 * (interjú → Interjú, elutasítás → Elutasítva, később → Nem aktuális) — de csak
 * ha még nincs kézi kimenetel, és „AI” jelzéssel, bármikor átírható.
 *
 * A helyi Claude CLI-vel fut (előfizetési keret); ha nem érhető el, vagy
 * REPLY_AI=off, kulcsszavas szabályokkal osztályoz, piszkozat nélkül.
 */
import { ObjectId } from "mongodb";
import { credential } from "./env";
import { createLogger } from "./logger";
import { latestReplies, type LatestReply } from "./mailStore";
import { getContacts } from "./mongodb";
import { askClaude } from "./aiText";
import { PROFILE } from "./profile";
import type { Outcome } from "./stage";
import type { ContactDoc, ReplyCategory, ReplyTriage } from "./types";

const log = createLogger("valaszok");

const CATEGORIES: ReplyCategory[] = [
  "interju",
  "kerdes",
  "elutasitas",
  "kesobb",
  "automatikus",
  "egyeb",
];

/** Kategória → kimenetel, ha elég biztos az osztályozás. */
const OUTCOME_FOR: Partial<Record<ReplyCategory, Outcome>> = {
  interju: "interju",
  elutasitas: "elutasitva",
  kesobb: "nem-aktualis",
};

/** Ennél biztosabb osztályozásnál a kimenetel magától áll. */
const AUTO_OUTCOME_CONFIDENCE = 0.8;

/** AI nélkül: kulcsszavak — durva, de 0 token, és a nyilvánvalót elkapja. */
export function classifyByRules(text: string): {
  category: ReplyCategory;
  confidence: number;
} {
  const t = text.toLowerCase();
  if (
    /(automatikus válasz|out of office|abwesenheit|szabadságon|vacation|auto-?reply)/.test(
      t,
    )
  ) {
    return { category: "automatikus", confidence: 0.9 };
  }
  if (
    /(interjú|interju|interview|meeting|megbeszél|időpont|call\b|hívás|calendly|teams|google meet|zoom)/.test(
      t,
    )
  ) {
    return { category: "interju", confidence: 0.6 };
  }
  if (
    /(sajnos|unfortunately|nem tudunk|nincs nyitott|no open|not able|not hiring|lamentablemente|leider)/.test(
      t,
    )
  ) {
    return { category: "elutasitas", confidence: 0.7 };
  }
  if (
    /(később|jövőben|elmentettem|future|keep your|in mente|megőrizzük|adatbázisunk)/.test(
      t,
    )
  ) {
    return { category: "kesobb", confidence: 0.6 };
  }
  if (t.includes("?")) return { category: "kerdes", confidence: 0.5 };
  return { category: "egyeb", confidence: 0.3 };
}

interface AiTriage {
  category: ReplyCategory;
  confidence: number;
  summary: string;
  draft: { subject: string; body: string } | null;
}

async function classifyWithAi(
  contact: ContactDoc,
  reply: LatestReply,
): Promise<AiTriage & { model: string }> {
  const prompt = [
    `Egy full stack fejlesztő (${PROFILE.name}) álláskereső megkeresésére érkezett válaszokat osztályozol, és rövid válaszpiszkozatot írsz a nevében.
Kategóriák:
- interju: interjúra, hívásra, megbeszélésre hívják, vagy időpontot kérnek
- kerdes: kérdeznek (fizetési igény, elérhetőség, portfólió, CV más formában)
- elutasitas: most nem, nincs pozíció, nem folytatják
- kesobb: elmentették, később jelentkeznek, adatbázisba tették
- automatikus: automatikus válasz, szabadság, ticket-visszaigazolás
- egyeb: nem a jelentkezésről szól (pl. ügyfélszolgálati ügy)
A piszkozat: a válasz nyelvén, rövid (3-6 mondat), udvarias, konkrét; interjúnál időpont-rugalmasságot jelez, kérdésnél válaszol vagy jelzi, hogy küldi; elutasításnál röviden megköszöni és kapcsolatban maradna. Semmilyen tényt ne találj ki (fizetési összeget, dátumot, tapasztalatot), és NE vállalj el semmit a jelölt nevében (munkavégzési formát, díjat, kezdést, költözést): ahol az ő döntése kell, írd, hogy szívesen egyeztet róla, vagy tegyél [kitöltendő: …] jelölést — ezt ő tölti ki küldés előtt. Aláírás: ${PROFILE.name}. Automatikus vagy egyéb kategóriánál a draft legyen null.
Időpontot NE fogadj el és ne erősíts meg a nevében — ha időpontot javasolnak, írd, hogy visszajelez, vagy tegyél [kitöltendő: időpont] jelölést; ha a javasolt időpont a mai napnál korábbi, a piszkozat kérjen új időpontot.
A summary harmadik személyben szóljon arról, mit írt a cég (pl. „Interjúra hívnak, időpontot kérnek.”), ne a jelölt nevében.
Válasz kizárólag JSON: {"category":"...","confidence":0-1,"summary":"1 mondat magyarul","draft":{"subject":"Re: ...","body":"..."}|null}`,
    "",
    `Cég: ${contact.company}`,
    `Az eredeti levelem tárgya: ${contact.emailSubject ?? ""}`,
    `Mai dátum: ${new Date().toISOString().slice(0, 10)} · a válasz dátuma: ${reply.date.slice(0, 10)}`,
    `A válasz feladója: ${reply.from}`,
    `A válasz tárgya: ${reply.subject}`,
    "A válasz szövege:",
    reply.text,
  ].join("\n");
  const { data, model } = await askClaude(prompt, {
    contactId: contact._id,
    company: contact.company,
    origin: "valasz-osztalyozas",
  });
  const parsed = data as Partial<AiTriage>;
  const category = CATEGORIES.includes(parsed.category as ReplyCategory)
    ? (parsed.category as ReplyCategory)
    : "egyeb";
  const draft =
    parsed.draft &&
    typeof parsed.draft.body === "string" &&
    parsed.draft.body.trim()
      ? {
          subject: String(parsed.draft.subject || `Re: ${reply.subject}`).slice(
            0,
            200,
          ),
          body: parsed.draft.body.trim(),
        }
      : null;
  return {
    category,
    confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0)),
    summary: String(parsed.summary ?? "").slice(0, 300),
    draft,
    model,
  };
}

/**
 * A megadott kontaktok legutóbbi válaszának osztályozása. Ami már az adott
 * levélre osztályozva van, azt kihagyja (`force` nélkül). Egyesével fut.
 */
export async function triageContacts(
  ids: string[],
  options: { force?: boolean } = {},
): Promise<{ triaged: number; outcomes: number; skipped: number }> {
  const valid = ids.filter((id) => ObjectId.isValid(id));
  if (!valid.length) return { triaged: 0, outcomes: 0, skipped: 0 };
  const collection = await getContacts();
  const contacts = await collection
    .find({ _id: { $in: valid.map((id) => new ObjectId(id)) } })
    .toArray();
  const replies = await latestReplies(valid);
  // A helyi Claude CLI viszi; ha nem érhető el, kulcsszavas szabályok.
  const useAi = credential("REPLY_AI", "claude") !== "off";

  let triaged = 0;
  let outcomes = 0;
  let skipped = 0;
  for (const raw of contacts) {
    const contact = { ...raw, _id: String(raw._id) } as unknown as ContactDoc;
    const reply = replies.get(contact._id);
    if (!reply) {
      skipped += 1;
      continue;
    }
    if (
      !options.force &&
      contact.replyTriage?.messageId &&
      contact.replyTriage.messageId === reply.messageId
    ) {
      skipped += 1;
      continue;
    }

    let result: AiTriage;
    let model = "szabály";
    try {
      if (useAi) {
        const ai = await classifyWithAi(contact, reply);
        result = ai;
        model = ai.model;
      } else {
        result = {
          ...classifyByRules(reply.text),
          summary: reply.text.replace(/\s+/g, " ").slice(0, 160),
          draft: null,
        };
      }
    } catch (error) {
      log.warn(
        `${contact.company}: AI-osztályozás nem sikerült, szabállyal megyek — ${(error as Error).message}`,
      );
      result = {
        ...classifyByRules(reply.text),
        summary: reply.text.replace(/\s+/g, " ").slice(0, 160),
        draft: null,
      };
    }

    const triage: ReplyTriage = {
      at: new Date().toISOString(),
      messageId: reply.messageId,
      category: result.category,
      confidence: result.confidence,
      summary: result.summary,
      draft: result.draft,
      model,
    };
    const set: Record<string, unknown> = { replyTriage: triage };
    // A kimenetel magától csak biztos esetben, és csak ha nincs kézzel beállítva.
    const outcome = OUTCOME_FOR[result.category];
    if (
      outcome &&
      result.confidence >= AUTO_OUTCOME_CONFIDENCE &&
      !contact.outcome
    ) {
      Object.assign(set, {
        outcome,
        outcomeAt: triage.at,
        outcomeSource: "ai",
      });
      outcomes += 1;
    }
    // Automatikus válasz / nem a jelentkezésről: nincs vele teendő.
    if (result.category === "automatikus" || result.category === "egyeb") {
      set.replyHandledAt = triage.at;
    }
    await collection.updateOne({ _id: new ObjectId(contact._id) }, {
      $set: set,
    } as never);
    triaged += 1;
    log.info(
      `${contact.company}: ${result.category} (${Math.round(result.confidence * 100)}%) — ${result.summary}`,
    );
  }
  return { triaged, outcomes, skipped };
}

/** Szinkron után: minden még nem osztályozott (vagy azóta új) válasz. */
export async function triagePending(
  limit = 40,
): Promise<{ triaged: number; outcomes: number; skipped: number }> {
  const collection = await getContacts();
  const pending = await collection
    .find(
      {
        repliedAt: { $ne: null },
        $or: [
          { replyTriage: null },
          { $expr: { $lt: ["$replyTriage.at", "$repliedAt"] } },
        ],
      } as never,
      { projection: { _id: 1 } },
    )
    .limit(limit)
    .toArray();
  return triageContacts(pending.map((row) => String(row._id)));
}
