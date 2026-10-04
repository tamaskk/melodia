/**
 * Fills in missing e-mail addresses from a research answer.
 *
 *   npm run emails -- notes.md          # file
 *   pbpaste | npm run emails            # or stdin
 *
 * Accepts any text where a company name is bold and an address appears on the
 * same line, e.g. the format an AI research answer comes back in:
 *
 *   - **Adecco Austria** – A cég bécsi e-mail címe: `office@adecco.at`.
 *
 * Only contacts that currently have NO address are touched, and the change goes
 * through updateContact, so it is recorded in `manualFields` and a later
 * `npm run parse` / Szinkronizálás will not overwrite it.
 */
import fs from "node:fs";
import { listContacts, updateContact } from "../src/lib/contacts";
import { clientPromise } from "../src/lib/mongodb";
import type { ContactDoc } from "../src/lib/types";

const PAIR_RX =
  /\*\*(.+?)\*\*[^\n]*?([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;

function normalise(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function readInput(): string {
  const file = process.argv[2];
  if (file && fs.existsSync(file)) return fs.readFileSync(file, "utf8");
  return fs.readFileSync(0, "utf8");
}

/** Best contact for a company name: exact match first, then prefix. */
function findMatches(contacts: ContactDoc[], name: string): ContactDoc[] {
  const wanted = normalise(name);
  const exact = contacts.filter((c) => normalise(c.company) === wanted);
  if (exact.length) return exact;
  return contacts.filter((c) => {
    const company = normalise(c.company);
    return company.startsWith(wanted) || wanted.startsWith(company);
  });
}

async function main() {
  const text = readInput();
  const pairs = [...text.matchAll(PAIR_RX)].map(
    ([, company, email]) => [company.trim(), email.toLowerCase()] as const,
  );

  if (!pairs.length) {
    console.error(
      "Nem találtam **Cégnév** + e-mail párokat a bemenetben. Formátum: - **Cég** … `mail@cim.hu`",
    );
    process.exit(1);
  }

  const contacts = await listContacts({});
  let updated = 0;
  let skipped = 0;
  let missing = 0;

  for (const [company, email] of pairs) {
    const matches = findMatches(contacts, company);

    if (!matches.length) {
      console.log(`✗ nincs ilyen cég: ${company}`);
      missing += 1;
      continue;
    }

    const empty = matches.filter((c) => !c.primaryEmail);
    if (!empty.length) {
      console.log(
        `· kihagyva (már van címe): ${matches[0].company} → ${matches[0].primaryEmail}`,
      );
      skipped += 1;
      continue;
    }

    for (const contact of empty) {
      const tags = [
        ...new Set([
          ...contact.tags.filter((tag) => tag !== "nincs-email"),
          "van-email",
          "kutatott-email",
        ]),
      ];
      await updateContact(contact._id, { primaryEmail: email, tags });
      console.log(`✓ ${contact.company.padEnd(34)} → ${email}`);
      updated += 1;
    }
  }

  console.log(
    `\nKész — beírva: ${updated}, kihagyva: ${skipped}, nem talált cég: ${missing} (${pairs.length} pár a bemenetben)`,
  );

  const client = await clientPromise;
  await client.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
