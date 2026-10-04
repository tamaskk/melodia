/**
 * Cégnév-aliasok visszamenőleges feltöltése.
 *
 * A `/check` oldal ezen az indexen keresi, hogy egy cég szerepel-e már a
 * listában. Új és frissített soroknál a mentés maga állítja be; ez a script a
 * meglévő 130 ezer sort tölti fel, kötegelve — az Atlas M0-n egyesével
 * órákig tartana.
 *
 *   npx tsx scripts/backfill-aliases.ts
 */
import { companyAliases } from "../src/lib/companyMatch";
import { getContacts } from "../src/lib/mongodb";

const BATCH = 1000;

async function main() {
  const collection = await getContacts();
  const missing = await collection.countDocuments({ aliases: { $exists: false } });
  console.log(`alias nélküli sor: ${missing}`);
  if (!missing) {
    console.log("nincs teendő");
    process.exit(0);
  }

  let done = 0;
  const started = Date.now();

  while (true) {
    const rows = await collection
      .find({ aliases: { $exists: false } }, { projection: { company: 1 } })
      .limit(BATCH)
      .toArray();
    if (!rows.length) break;

    await collection.bulkWrite(
      rows.map((row) => ({
        updateOne: {
          filter: { _id: row._id },
          update: { $set: { aliases: companyAliases(row.company) } },
        },
      })),
      { ordered: false },
    );

    done += rows.length;
    const perSecond = Math.round(done / ((Date.now() - started) / 1000));
    console.log(`${done}/${missing} kész (${perSecond} sor/mp)`);
  }

  console.log(`kész: ${done} sor, ${Math.round((Date.now() - started) / 1000)} mp`);
  process.exit(0);
}

void main();
