/**
 * Seeds MongoDB Atlas with every contact extracted from the PDFs.
 *
 *   npm run seed
 *
 * Idempotent: existing rows keep their sent / done / starred state, only the
 * content fields are refreshed. Brand new rows are inserted.
 */
import { allSeedContacts } from "../src/data";
import { upsertContacts } from "../src/lib/contacts";
import { getContacts } from "../src/lib/mongodb";
import { clientPromise } from "../src/lib/mongodb";

async function main() {
  const contacts = allSeedContacts();
  const bySource = contacts.reduce<Record<string, number>>((acc, contact) => {
    acc[contact.source] = (acc[contact.source] ?? 0) + 1;
    return acc;
  }, {});

  console.log("Payload:", contacts.length, bySource);

  const result = await upsertContacts(contacts, { prune: true });
  const collection = await getContacts();

  console.log(
    `Seed done — inserted: ${result.inserted}, updated: ${result.updated}, stale removed: ${result.removed}`,
  );
  console.log("Collection size:", await collection.countDocuments());

  const client = await clientPromise;
  await client.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
