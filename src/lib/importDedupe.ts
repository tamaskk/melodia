/**
 * Import előtti egyeztetés: melyik sor van már bent az adatbázisban.
 *
 * Ugyanaz a szabály, mint az e-mail nélküli listák védett módjában: ami kulcs,
 * cégnév + ország vagy domain alapján már szerepel, azt nem írjuk felül. Egy
 * kötegre egyetlen lekérdezés megy (`$in`), nem soronként egy.
 */
import { companyAliases, companyIndexKeys } from "./companyMatch";
import { getContacts } from "./mongodb";
import { contactDomain } from "./recipients";
import type { Contact } from "./types";

export interface KnownMatch {
  contact: Contact;
  /** Mi alapján van már bent: kulcs, domain vagy cégnév. */
  reason: "kulcs" | "domain" | "cégnév";
  /** A meglévő sor cégneve. */
  existing: string;
}

/** A köteg szétválasztva: ami új, és ami már bent van (indokkal). */
export async function splitKnown(
  batch: Contact[],
): Promise<{ fresh: Contact[]; known: KnownMatch[] }> {
  if (!batch.length) return { fresh: [], known: [] };
  const collection = await getContacts();
  const domainOf = new Map(
    batch.map((contact) => [contact.key, contactDomain(contact)]),
  );
  const docs = await collection
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

  const byKey = new Map(docs.map((doc) => [doc.key, doc.company]));
  const byDomain = new Map(
    docs.flatMap((doc) => (doc.domain ? [[doc.domain, doc.company]] : [])),
  );
  const byName = new Map(
    docs.flatMap((doc) =>
      companyIndexKeys(doc.country, doc.company).map(
        (alias) => [alias, doc.company] as const,
      ),
    ),
  );

  const fresh: Contact[] = [];
  const known: KnownMatch[] = [];
  for (const contact of batch) {
    const domain = domainOf.get(contact.key);
    const name = companyIndexKeys(contact.country, contact.company)
      .map((alias) => byName.get(alias))
      .find(Boolean);
    const match: KnownMatch | null = byKey.has(contact.key)
      ? { contact, reason: "kulcs", existing: byKey.get(contact.key)! }
      : domain && byDomain.has(domain)
        ? { contact, reason: "domain", existing: byDomain.get(domain)! }
        : name
          ? { contact, reason: "cégnév", existing: name }
          : null;
    if (match) known.push(match);
    else fresh.push(contact);
  }
  return { fresh, known };
}
