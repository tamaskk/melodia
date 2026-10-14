/**
 * Nagy import-JSON betöltése az Atlasba, a saját gépről, adagokban.
 *
 * Az Import oldal az egész fájlt egy kérésben küldi — több tízezer sornál ez
 * nem megy át. Ez a script ugyanazt az ellenőrzést és ugyanazt a mentést
 * használja, csak kötegelve.
 *
 *   npx tsx scripts/import-json.ts <fájl.json>           # csak számol
 *   npx tsx scripts/import-json.ts <fájl.json> --apply   # ír is
 *
 * Védett mód, mint az e-mail nélküli listáknál az Import oldalon: ami kulcs,
 * cégnév + ország vagy domain alapján már szerepel, azt békén hagyja — csak új
 * cég kerül be. Újrafuttatható: a már beírt sorokat kihagyja.
 */
import { readFileSync } from "node:fs";
import { companyAliases, companyIndexKeys } from "../src/lib/companyMatch";
import { rescore, upsertContacts } from "../src/lib/contacts";
import { parseImport } from "../src/lib/importSchema";
import { clientPromise, getContacts } from "../src/lib/mongodb";
import { contactDomain } from "../src/lib/recipients";
import type { Contact } from "../src/lib/types";

const BATCH = 500;

/** A kötegből azok, amik még nincsenek az adatbázisban. */
async function onlyNew(batch: Contact[]): Promise<Contact[]> {
  const collection = await getContacts();
  const domainOf = new Map(
    batch.map((contact) => [contact.key, contactDomain(contact)]),
  );
  const known = await collection
    .find(
      {
        $or: [
          { key: { $in: batch.map((contact) => contact.key) } },
          {
            aliases: {
              $in: batch.flatMap((contact) => companyAliases(contact.company)),
            },
          },
          {
            domain: {
              $in: [...new Set([...domainOf.values()].filter(Boolean))],
            },
          },
        ],
      } as never,
      { projection: { key: 1, company: 1, country: 1, domain: 1 } },
    )
    .toArray();

  const keys = new Set(known.map((doc) => doc.key));
  const domains = new Set(known.map((doc) => doc.domain).filter(Boolean));
  const names = new Set(
    known.flatMap((doc) => companyIndexKeys(doc.country, doc.company)),
  );
  return batch.filter((contact) => {
    const domain = domainOf.get(contact.key);
    return (
      !keys.has(contact.key) &&
      !(domain && domains.has(domain)) &&
      !companyIndexKeys(contact.country, contact.company).some((alias) =>
        names.has(alias),
      )
    );
  });
}

async function main() {
  const file = process.argv[2];
  const apply = process.argv.includes("--apply");
  if (!file) throw new Error("Add meg a JSON fájl útvonalát.");

  const { contacts, errors } = parseImport(
    JSON.parse(readFileSync(file, "utf8")),
    {},
  );
  console.log(`sorok: ${contacts.length}, hibák: ${errors.length}`);
  if (errors.length) {
    for (const issue of errors.slice(0, 10)) {
      console.log(
        `  #${issue.index} ${issue.company}: ${issue.field} — ${issue.message}`,
      );
    }
    throw new Error("Hibás sorokkal nem töltök be semmit.");
  }

  const started = Date.now();
  let inserted = 0;
  let skipped = 0;
  for (let from = 0; from < contacts.length; from += BATCH) {
    const batch = contacts.slice(from, from + BATCH);
    const fresh = await onlyNew(batch);
    skipped += batch.length - fresh.length;
    if (apply && fresh.length) {
      inserted += (await upsertContacts(fresh, { origin: "import" })).inserted;
    } else {
      inserted += fresh.length;
    }
    const done = Math.min(from + BATCH, contacts.length);
    if (done % 5000 === 0 || done === contacts.length) {
      console.log(
        `${done}/${contacts.length} — ${apply ? "beírva" : "új lenne"}: ${inserted}, ` +
          `már megvolt: ${skipped}, ${Math.round((Date.now() - started) / 1000)} mp`,
      );
    }
  }

  if (apply) {
    // A mentés a pontszámot a háttérben számolja; itt megvárjuk, mielőtt kilépünk.
    const scored = await rescore({
      key: { $in: contacts.map((contact) => contact.key) },
    } as never);
    console.log(`pontszám és domain frissítve: ${scored} sor`);
  }
  await (await clientPromise).close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
