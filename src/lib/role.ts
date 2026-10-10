/**
 * A példány szerepe: **küldő** vagy **néző**.
 *
 * Levelet küldeni, queue-t ütemezni és a csatolmány-jegyzéket közzétenni csak a
 * küldő gép tud. Küldő az, ahol az `atlas-credentials.env`-ben ez áll:
 *
 *     MELODIA_ROLE=kuldo
 *
 * Minden más néző: a telepített (Vercel) példány mindig, és a helyi gép is,
 * amíg a beállítás nincs megadva. A néző mindent lát és szerkeszthet (queue-k,
 * kontaktok, beállítások) — csak nem küld. Így egy fejlesztésre elindított
 * `npm run dev` nem kezd el párhuzamosan küldeni az igazi küldő gép mellett.
 *
 * Egyszerre egy küldő lehet: a küldő rendszeresen életjelet ír az adatbázisba,
 * és ha egy másik gép életjele friss, a később induló nem veszi át a szerepet.
 */
import { hostname } from "node:os";
import { credential } from "./env";
import { createLogger } from "./logger";
import { getDb } from "./mongodb";

const log = createLogger("szerep");

/** Ennyi ideig számít élőnek egy életjel — az ütemező 10 percenként ír. */
const FRESH_MS = 25 * 60_000;
const DOC_ID = "sender";

const SENDER_VALUES = new Set(["kuldo", "küldő", "sender"]);

/** A beállítás szerint ez a gép küldő-e. A telepített példány sosem az. */
export function isSender(): boolean {
  if (process.env.VERCEL) return false;
  return SENDER_VALUES.has(credential("MELODIA_ROLE").trim().toLowerCase());
}

/** Ahogy ez a gép az életjelben és a felületen szerepel. */
export function machineName(): string {
  return credential("MELODIA_NAME").trim() || hostname();
}

/** Amit a néző példány mond, ha küldést kérnek tőle. */
export const VIEWER_MESSAGE = process.env.VERCEL
  ? "A telepített példány nem küld levelet — az a küldő gépen megy. Itt " +
    "összeállíthatod és elmentheted a queue-t; a küldő gép 7 és 19 óra " +
    "között magától elindítja."
  : "Ez a gép néző: nem küld levelet. Küldő az a gép, ahol az " +
    "atlas-credentials.env-ben MELODIA_ROLE=kuldo áll (utána újraindítás). " +
    "A queue-kat innen is összeállíthatod — a küldő gép indítja el őket.";

interface SenderDoc {
  _id: string;
  host: string;
  at: string;
}

async function state() {
  return (await getDb()).collection<SenderDoc>("app_state");
}

export interface SenderStatus {
  host: string;
  at: string;
  /** Friss-e az életjel: van-e most élő küldő gép. */
  alive: boolean;
}

/** Melyik gép a küldő, és mikor adott utoljára életjelet. */
export async function senderStatus(
  now = new Date(),
): Promise<SenderStatus | null> {
  const doc = await (await state()).findOne({ _id: DOC_ID });
  if (!doc) return null;
  return {
    host: doc.host,
    at: doc.at,
    alive: now.getTime() - new Date(doc.at).getTime() < FRESH_MS,
  };
}

/**
 * A küldő szerep lefoglalása és megújítása — életjel az adatbázisba.
 *
 * Igaz, ha ez a gép a küldő. Hamis, ha a beállítás szerint néző, vagy ha egy
 * másik gép életjele még friss: ilyenkor ez a gép nem küld, amíg az a másik
 * le nem áll (az életjele le nem jár).
 */
export async function claimSender(now = new Date()): Promise<boolean> {
  if (!isSender()) return false;
  const host = machineName();
  const stale = new Date(now.getTime() - FRESH_MS).toISOString();
  try {
    // Csak akkor írható, ha a miénk, vagy ha a másiké már lejárt. Ha egy másik
    // gép életjele friss, a szűrő nem talál, a beszúrás pedig kulcsütközik.
    await (
      await state()
    ).updateOne(
      { _id: DOC_ID, $or: [{ host }, { at: { $lt: stale } }] },
      { $set: { host, at: now.toISOString() } },
      { upsert: true },
    );
    return true;
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error;
    const other = await senderStatus(now);
    log.error(
      `másik küldő gép aktív (${other?.host ?? "ismeretlen"}, utolsó életjel: ${other?.at ?? "?"}) — ` +
        "ez a gép most nem küld. Egyszerre egy küldő lehet: állítsd le a másikat, " +
        "vagy ezen a gépen vedd ki a MELODIA_ROLE=kuldo beállítást.",
    );
    return false;
  }
}
