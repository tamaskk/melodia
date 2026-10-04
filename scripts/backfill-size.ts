/**
 * One-off migration: adds the new `size` field (null) to every contact that
 * predates IT companies, so filters and exports see a consistent shape.
 *
 *   npx tsx scripts/backfill-size.ts
 */
import { clientPromise, getContacts } from "../src/lib/mongodb";

async function main() {
  const collection = await getContacts();
  const result = await collection.updateMany(
    { size: { $exists: false } },
    { $set: { size: null } },
  );
  console.log(`size: null beírva ${result.modifiedCount} kapcsolathoz`);
  const client = await clientPromise;
  await client.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
