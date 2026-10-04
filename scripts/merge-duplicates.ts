/**
 * Összeolvasztja ugyanannak a cégnek a több forrásból bekerült sorait.
 *
 *   npx tsx scripts/merge-duplicates.ts            # száraz futás, csak kiírja
 *   npx tsx scripts/merge-duplicates.ts --apply    # ír is
 *   npx tsx scripts/merge-duplicates.ts --all      # a PDF-es sorokra is
 *
 * Alapból CSAK a kézzel importált sorokat (origin: "import") vonja össze: a
 * PDF-ekből származó, városonként külön felvitt irodák (Kforce Atlanta,
 * Robert Half Sacramento …) szándékosan külön sorok, azokhoz nem nyúlunk.
 *
 * A megtartott sor a *gazdagabb* azonosságú: ha van IT cég (van létszám-sáva),
 * az marad, és megkapja a másik sor kutatott tartalmát (e-mail, megjegyzés,
 * címkék, levélszövegek). A másik sor törlődik.
 */
import { sameCompany } from "../src/lib/companyMatch";
import { normaliseName } from "../src/lib/name";
import { clientPromise, getContacts } from "../src/lib/mongodb";
import type { Contact } from "../src/lib/types";
import type { WithId } from "mongodb";

const APPLY = process.argv.includes("--apply");
const ALL = process.argv.includes("--all");

/** Melyik sor maradjon? Létszám-sáv > több kitöltött mező > régebbi. */
function score(doc: Contact): number {
  return (
    (doc.size ? 8 : 0) +
    (doc.kind === "it-company" ? 4 : 0) +
    (doc.linkedinUrl ? 1 : 0) +
    (doc.website ? 1 : 0)
  );
}

function longer(a: string | null, b: string | null): string | null {
  const left = a?.trim() ?? "";
  const right = b?.trim() ?? "";
  return (right.length > left.length ? right : left) || null;
}

async function main() {
  const collection = await getContacts();
  const docs = await collection
    .find(ALL ? {} : { origin: "import" })
    .toArray();

  // Csak az azonos országon belüli, azonos nevű cégeket vonjuk össze.
  const byCountry = new Map<string, WithId<Contact>[]>();
  for (const doc of docs) {
    const list = byCountry.get(doc.country) ?? [];
    list.push(doc);
    byCountry.set(doc.country, list);
  }

  const groups: WithId<Contact>[][] = [];
  for (const list of byCountry.values()) {
    const used = new Set<string>();
    for (const doc of list) {
      const id = doc._id.toString();
      if (used.has(id)) continue;
      const group = list.filter(
        (other) =>
          !used.has(other._id.toString()) && sameCompany(doc.company, other.company),
      );
      group.forEach((item) => used.add(item._id.toString()));
      if (group.length > 1) groups.push(group);
    }
  }

  let merged = 0;
  let removed = 0;

  for (const group of groups) {
    const sorted = [...group].sort((a, b) => score(b) - score(a));
    const [winner, ...losers] = sorted;

    // A kutatott (hosszabb, konkrétabb) tartalom nyer, az azonosság a győztesé.
    const patch: Partial<Contact> = {};
    for (const loser of losers) {
      patch.primaryEmail = winner.primaryEmail ?? loser.primaryEmail ?? patch.primaryEmail ?? null;
      patch.emails = [
        ...new Set([
          ...(patch.emails ?? winner.emails ?? []),
          ...(loser.emails ?? []),
          ...(patch.primaryEmail ? [patch.primaryEmail] : []),
        ]),
      ];
      patch.website = winner.website ?? loser.website ?? null;
      patch.linkedinUrl = winner.linkedinUrl ?? loser.linkedinUrl ?? null;
      patch.person = winner.person ?? loser.person ?? null;
      patch.role = winner.role ?? loser.role ?? null;
      patch.city = winner.city ?? loser.city ?? null;
      // A megjegyzések kiegészítik egymást (CSV leírás + kutatási jegyzet).
      patch.note =
        [...new Set([patch.note ?? winner.note, loser.note].filter(Boolean))].join(
          " · ",
        ) || null;
      patch.emailSubject = longer(patch.emailSubject ?? winner.emailSubject, loser.emailSubject) ?? "";
      patch.emailBody = longer(patch.emailBody ?? winner.emailBody, loser.emailBody) ?? "";
      patch.linkedinMessage = longer(patch.linkedinMessage ?? winner.linkedinMessage, loser.linkedinMessage);
      patch.connectionRequest = longer(
        patch.connectionRequest ?? winner.connectionRequest,
        loser.connectionRequest,
      );
      patch.tags = [...new Set([...(patch.tags ?? winner.tags), ...loser.tags])];
      // Az állapotot soha nem veszítjük el: ha bármelyik sor kész/elküldött volt.
      patch.sent = winner.sent || loser.sent;
      patch.done = winner.done || loser.done;
      patch.starred = winner.starred || loser.starred;
      patch.sentAt = winner.sentAt ?? loser.sentAt;
      patch.doneAt = winner.doneAt ?? loser.doneAt;
    }

    // A nyelv a megtartott levélszöveghez igazodik.
    if (patch.emailBody && patch.emailBody === losers[0]?.emailBody) {
      patch.language = losers[0].language;
    }

    for (const field of ["emailSubject", "emailBody", "linkedinMessage", "connectionRequest"] as const) {
      const value = patch[field];
      if (typeof value === "string") patch[field] = normaliseName(value);
    }

    console.log(
      `${winner.company} — marad: ${winner.key} (${winner.kind}${winner.size ? `, ${winner.size}` : ""}), törlés: ${losers
        .map((l) => l.key)
        .join(", ")}${patch.primaryEmail ? ` · e-mail: ${patch.primaryEmail}` : ""}`,
    );

    if (APPLY) {
      await collection.updateOne(
        { _id: winner._id },
        { $set: { ...patch, updatedAt: new Date().toISOString() } },
      );
      await collection.deleteMany({ _id: { $in: losers.map((l) => l._id) } });
    }
    merged += 1;
    removed += losers.length;
  }

  const grouped = new Set(groups.flat().map((doc) => doc._id.toString()));
  const alone = docs.filter((doc) => !grouped.has(doc._id.toString()));
  console.log(
    `\npáratlan sorok (${alone.length}):`,
    alone.map((doc) => `${doc.company} [${doc.kind}]`).join(", "),
  );
  const oddWinners = groups
    .map((group) => [...group].sort((a, b) => score(b) - score(a))[0])
    .filter((doc) => doc.kind !== "it-company");
  console.log(`nem IT cég győztes: ${oddWinners.length}`, oddWinners.map((d) => d.key).join(", "));

  console.log(
    `\n${APPLY ? "KÉSZ" : "SZÁRAZ FUTÁS"} — ${merged} cég összevonva, ${removed} sor ${
      APPLY ? "törölve" : "törlődne"
    }. Összes sor most: ${docs.length}${APPLY ? ` → ${docs.length - removed}` : ""}`,
  );

  const client = await clientPromise;
  await client.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
