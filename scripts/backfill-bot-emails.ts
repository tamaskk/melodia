/**
 * Visszamenőleges pótlás: a Grokbot által talált, de a régi szabály (csak
 * high/medium + forrás) miatt be nem írt címek a sor elsődleges címe lesznek.
 * Ugyanaz a szabály, mint most a /api/bot/save-ben: csak üres sorba, a
 * bizonytalan cím `ellenorizetlen-email` címkét kap.
 *
 *   npx tsx scripts/backfill-bot-emails.ts           # csak számol
 *   npx tsx scripts/backfill-bot-emails.ts --apply   # be is írja
 */
import { clientPromise, getContacts } from "../src/lib/mongodb";
import { updateContact } from "../src/lib/contacts";

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function main() {
  const apply = process.argv.includes("--apply");
  const collection = await getContacts();
  const rows = await collection
    .find(
      {
        "emailSearch.model": { $regex: "grok", $options: "i" },
        "emailSearch.email": { $type: "string" },
        $or: [{ primaryEmail: null }, { primaryEmail: "" }],
      } as never,
      {
        projection: {
          company: 1,
          tags: 1,
          note: 1,
          "emailSearch.email": 1,
          "emailSearch.confidence": 1,
          "emailSearch.source": 1,
        },
      },
    )
    .toArray();

  let written = 0;
  let unverifiedCount = 0;
  for (const row of rows) {
    const search = row.emailSearch as
      | { email?: string; confidence?: string; source?: string | null }
      | undefined;
    const email = search?.email?.trim().toLowerCase();
    if (!email || !EMAIL_RX.test(email)) continue;
    const source = /^https?:\/\/\S+$/i.test(search?.source ?? "")
      ? search?.source
      : null;
    const unverified = search?.confidence === "low" || !source;
    if (unverified) unverifiedCount++;
    written++;
    if (!apply) continue;
    await updateContact(
      String(row._id),
      {
        primaryEmail: email,
        tags: [
          ...new Set([
            ...(row.tags ?? []).filter((tag: string) => tag !== "nincs-email"),
            "van-email",
            "kutatott-email",
            ...(unverified ? ["ellenorizetlen-email"] : []),
          ]),
        ],
        note: [row.note, `e-mail forrása: ${source ?? "nincs megadva"}`]
          .filter(Boolean)
          .join(" · "),
      },
      "grokbot (pótlás)",
    );
  }

  console.log(
    `${apply ? "Beírva" : "Beírnám (--apply nélkül nem írok)"}: ${written} cím, ` +
      `ebből ${unverifiedCount} ellenőrizetlen (low vagy forrás nélkül).`,
  );
  const client = await clientPromise;
  await client.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
