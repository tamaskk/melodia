/**
 * Follow-up: egy udvarias második levél ugyanabban a szálban, ha az elsőre
 * nem jött válasz. Cégenként legfeljebb egy, és csak jóváhagyás után megy ki.
 *
 * Tiszta modul: a lekérdezés és a piszkozat. A küldés a meglévő kiküldő
 * menetén fut (munkaidő a címzett idejében, napi keret, szünet, leállítás).
 */
import { PROFILE } from "./profile";

/** Ennyi nap után esedékes, ha nem jött válasz. */
export const FOLLOW_UP_AFTER_DAYS = 7;

/**
 * Esedékes: kiment az első levél legalább N napja, azóta nem jött válasz, nem
 * pattant vissza, nincs kézi kimenetel, és még nem ment follow-up.
 */
export function followUpDueQuery(now = new Date()): Record<string, unknown> {
  const cutoff = new Date(
    now.getTime() - FOLLOW_UP_AFTER_DAYS * 86_400_000,
  ).toISOString();
  return {
    sent: true,
    primaryEmail: { $ne: null },
    repliedAt: null,
    bouncedAt: null,
    outcome: null,
    followUpSentAt: null,
    sentAt: { $ne: null, $lte: cutoff },
  };
}

interface DraftInput {
  company: string;
  person?: string | null;
  language?: string | null;
  emailSubject?: string | null;
  sentAt?: string | null;
}

/** „Néhány napja” vagy „néhány hete” — a valóságnak megfelelően. */
function ago(
  sentAt: string | null | undefined,
  language: string | null | undefined,
): string {
  const days = sentAt
    ? (Date.now() - new Date(sentAt).getTime()) / 86_400_000
    : 0;
  if (language === "hu") return days >= 14 ? "Néhány hete" : "Néhány napja";
  return days >= 14 ? "a few weeks ago" : "a few days ago";
}

/**
 * A follow-up szövege: rövid, a korábbi levélre hivatkozik, nem ismétli meg.
 * A tárgy `Re:` + az eredeti tárgy, hogy a címzettnél egy szálban maradjon.
 */
export function followUpDraft(
  contact: DraftInput,
  originalSubject?: string | null,
): { subject: string; body: string } {
  const base = (originalSubject || contact.emailSubject || "").replace(
    /^(re|vs|aw):\s*/i,
    "",
  );
  const subject = base
    ? `Re: ${base}`
    : contact.language === "hu"
      ? "Jelentkezés — emlékeztető"
      : "Application — follow-up";

  if (contact.language === "hu") {
    const greeting = contact.person
      ? `Tisztelt ${contact.person}!`
      : `Tisztelt ${contact.company} Csapat!`;
    return {
      subject,
      body: [
        greeting,
        "",
        `${ago(contact.sentAt, "hu")} írtam Önöknek a full stack fejlesztői jelentkezésem kapcsán — szeretném a levelemet ismét a figyelmükbe ajánlani, hátha elsikkadt a sok levél között.`,
        "",
        "Ha jelenleg nincs nyitott pozíció, egy rövid visszajelzésnek is nagyon örülnék, és szívesen maradnék kapcsolatban a későbbi lehetőségek miatt.",
        "",
        "Üdvözlettel,",
        PROFILE.name,
        `${PROFILE.email} · ${PROFILE.phone}`,
      ].join("\n"),
    };
  }

  const greeting = contact.person
    ? `Dear ${contact.person},`
    : `Dear ${contact.company} Team,`;
  return {
    subject,
    body: [
      greeting,
      "",
      `I wrote to you ${ago(contact.sentAt, "en")} about a full stack developer role — I just wanted to bring my message back to the top of your inbox in case it got buried.`,
      "",
      "If there is no open position right now, a short reply would still be much appreciated, and I would be glad to stay in touch for future opportunities.",
      "",
      "Best regards,",
      PROFILE.name,
      `${PROFILE.email} · ${PROFILE.phone}`,
    ].join("\n"),
  };
}

/**
 * Ugyanez egy betöltött sorra — a küldő közvetlenül a küldés előtt még egyszer
 * ellenőrzi: ha közben válasz jött vagy kimenetelt rögzítettél, nem megy ki.
 */
export function isFollowUpDue(
  contact: {
    sent?: boolean;
    primaryEmail?: string | null;
    repliedAt?: string | null;
    bouncedAt?: string | null;
    outcome?: string | null;
    followUpSentAt?: string | null;
    sentAt?: string | null;
  },
  now = new Date(),
): boolean {
  if (!contact.sent || !contact.primaryEmail || !contact.sentAt) return false;
  if (
    contact.repliedAt ||
    contact.bouncedAt ||
    contact.outcome ||
    contact.followUpSentAt
  ) {
    return false;
  }
  return (
    now.getTime() - new Date(contact.sentAt).getTime() >=
    FOLLOW_UP_AFTER_DAYS * 86_400_000
  );
}
