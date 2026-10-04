/**
 * Kinek ment már levél — címre és cégdomainre.
 *
 * Ugyanaz a cég több forrásból, több soron is szerepelhet (fiókiroda, két
 * import). A sor saját `sent` mezője ezt nem látja: a másik soron ugyanarra a
 * címre már elment a levél. Ez a modul a küldés előtt mindent ÖSSZES sorra néz.
 */
import { ObjectId } from "mongodb";
import { getContacts } from "./mongodb";

/** Közös szolgáltatók: itt a domain nem cég, ugyanazon a domainen sok ember van. */
const FREEMAIL = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
  "yahoo.com",
  "icloud.com",
  "me.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "gmx.com",
  "gmx.de",
  "gmx.at",
  "web.de",
  "t-online.de",
  "freemail.hu",
  "citromail.hu",
  "indamail.hu",
  "vipmail.hu",
  "t-online.hu",
]);

export function emailKey(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Pontos egyezés a tárolt címre, indexelhetően. Az import kisbetűsít; a kézzel
 * beírt cím maradhat eredeti alakban — ezért mindkettőt nézzük.
 */
function sameAddress(email: string) {
  return {
    primaryEmail: { $in: [...new Set([emailKey(email), email.trim(), email])] },
  };
}

/** A cím cégdomainje, vagy `null`, ha közös szolgáltató (gmail, freemail …). */
export function companyDomain(email: string): string | null {
  const domain =
    emailKey(email)
      .split("@")[1]
      ?.replace(/^www\./, "") ?? "";
  if (!domain || FREEMAIL.has(domain)) return null;
  return domain;
}

export interface Contacted {
  emails: Set<string>;
  domains: Set<string>;
}

/**
 * Minden cím és cégdomain, ahová már ment levél. Csak a címeket hozzuk át,
 * egyedivé téve a szerveren — néhány száz rövid sztring.
 */
export async function contactedIndex(): Promise<Contacted> {
  const collection = await getContacts();
  const rows = await collection
    .aggregate<{ _id: string }>([
      { $match: { sent: true, primaryEmail: { $nin: [null, ""] } } },
      { $group: { _id: { $toLower: { $trim: { input: "$primaryEmail" } } } } },
    ])
    .toArray();

  const emails = new Set<string>();
  const domains = new Set<string>();
  for (const row of rows) {
    emails.add(row._id);
    const domain = companyDomain(row._id);
    if (domain) domains.add(domain);
  }
  return { emails, domains };
}

/**
 * `same-email` / `same-domain` = erre a címre / cégre már ment levél;
 * `in-queue` = a mostani sorban ugyanaz a cím vagy cég korábban már szerepel.
 */
export type SkipReason = "same-email" | "same-domain" | "in-queue";

export interface Skipped<T> {
  row: T;
  reason: SkipReason;
}

/**
 * A sorrendet megtartva kiszűri, aki már kapott levelet, és a soron belüli
 * ismétlődést is (ugyanaz a cím vagy domain kétszer a mostani sorban).
 * Tiszta függvény: az adatbázist a hívó olvassa be.
 */
export function dedupeRecipients<T extends { email: string }>(
  rows: T[],
  contacted: Contacted,
  options: { allowSameDomain?: boolean } = {},
): { keep: T[]; skipped: Skipped<T>[] } {
  // A mostani sorban már kiosztott címek és cégek — külön a korábbiaktól,
  // hogy a felület meg tudja mondani, miért maradt ki valaki.
  const queuedEmails = new Set<string>();
  const queuedDomains = new Set<string>();
  const keep: T[] = [];
  const skipped: Skipped<T>[] = [];

  for (const row of rows) {
    const key = emailKey(row.email);
    const domain = companyDomain(key);
    const checkDomain = Boolean(domain) && !options.allowSameDomain;

    if (contacted.emails.has(key)) {
      skipped.push({ row, reason: "same-email" });
      continue;
    }
    if (checkDomain && contacted.domains.has(domain!)) {
      skipped.push({ row, reason: "same-domain" });
      continue;
    }
    if (queuedEmails.has(key) || (checkDomain && queuedDomains.has(domain!))) {
      skipped.push({ row, reason: "in-queue" });
      continue;
    }

    keep.push(row);
    queuedEmails.add(key);
    if (domain) queuedDomains.add(domain);
  }
  return { keep, skipped };
}

/** Az azonosítókhoz tartozó címek, egyetlen lekérdezéssel, a sorrendet tartva. */
export async function recipientsFor(
  ids: string[],
): Promise<{ id: string; company: string; email: string }[]> {
  const valid = ids.filter((id) => ObjectId.isValid(id));
  if (!valid.length) return [];
  const collection = await getContacts();
  const docs = await collection
    .find(
      { _id: { $in: valid.map((id) => new ObjectId(id)) } },
      { projection: { company: 1, primaryEmail: 1 } },
    )
    .toArray();

  const byId = new Map(docs.map((doc) => [String(doc._id), doc]));
  return valid.flatMap((id) => {
    const doc = byId.get(id);
    return doc?.primaryEmail
      ? [{ id, company: doc.company, email: doc.primaryEmail }]
      : [];
  });
}

/**
 * Küldés előtti utolsó ellenőrzés egy címre: ment-e már rá (vagy a cégre)
 * levél azóta, hogy a sor összeállt — például egy párhuzamosan futó másik
 * fiókból. A `sent: true` részhalmazon fut, ez néhány száz sor.
 */
export async function alreadyContacted(
  contactId: string,
  email: string,
  options: { allowSameDomain?: boolean } = {},
): Promise<SkipReason | null> {
  const collection = await getContacts();
  const key = emailKey(email);
  const domain = companyDomain(key);
  const others = { sent: true, _id: { $ne: new ObjectId(contactId) } };

  const sameEmail = await collection.countDocuments(
    { ...others, ...sameAddress(email) },
    { limit: 1 },
  );
  if (sameEmail) return "same-email";

  if (domain && !options.allowSameDomain) {
    const escaped = domain.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const sameDomain = await collection.countDocuments(
      {
        ...others,
        primaryEmail: { $regex: `@(www\\.)?${escaped}\\s*$`, $options: "i" },
      },
      { limit: 1 },
    );
    if (sameDomain) return "same-domain";
  }
  return null;
}

/**
 * Egy kiküldés után a testvérsorok (ugyanaz a cím, más sor) is elküldöttek
 * lesznek, `masik-soron-ment` címkével — így a lista sem mutatja őket nyitottnak.
 */
export async function markSiblingsSent(
  contactId: string,
  email: string,
): Promise<number> {
  const collection = await getContacts();
  const now = new Date().toISOString();
  const result = await collection.updateMany(
    {
      ...sameAddress(email),
      sent: { $ne: true },
      _id: { $ne: new ObjectId(contactId) },
    },
    {
      $set: {
        sent: true,
        sentAt: now,
        done: true,
        doneAt: now,
        updatedAt: now,
      },
      $addToSet: { tags: "masik-soron-ment" },
    },
  );
  return result.modifiedCount;
}

/** Az azonosítókhoz tartozó ország — a címzett helyi munkaidejéhez. */
export async function countriesFor(
  ids: string[],
): Promise<Map<string, string>> {
  const valid = ids.filter((id) => ObjectId.isValid(id));
  const result = new Map<string, string>();
  if (!valid.length) return result;
  const collection = await getContacts();
  const docs = await collection
    .find(
      { _id: { $in: valid.map((id) => new ObjectId(id)) } },
      { projection: { country: 1 } },
    )
    .toArray();
  for (const doc of docs) result.set(String(doc._id), doc.country ?? "INT");
  // Ami közben eltűnt, az is kapjon értéket — különben újra meg újra lekérdeznénk.
  for (const id of valid) if (!result.has(id)) result.set(id, "INT");
  return result;
}

/**
 * A küldés előtti ellenőrzéshez: a sorok címe, nyelve, országa, és a levélből
 * csak két számított jelző (van-e kitöltetlen `{{…}}`, milyen hosszú). A teljes
 * levélszöveg nem jön át — 500 sornál ez másodperceket spórol az M0-n.
 */
export async function preflightRows(ids: string[]): Promise<
  {
    id: string;
    company: string;
    email: string;
    language: string;
    country: string;
    hasPlaceholder: boolean;
    bodyLength: number;
    subjectLength: number;
  }[]
> {
  const valid = ids.filter((id) => ObjectId.isValid(id));
  if (!valid.length) return [];
  const collection = await getContacts();
  const rows = await collection
    .aggregate<{
      _id: ObjectId;
      company: string;
      email: string | null;
      language: string;
      country: string;
      hasPlaceholder: boolean;
      bodyLength: number;
      subjectLength: number;
    }>([
      { $match: { _id: { $in: valid.map((id) => new ObjectId(id)) } } },
      {
        $project: {
          company: 1,
          email: "$primaryEmail",
          language: 1,
          country: 1,
          hasPlaceholder: {
            $or: [
              {
                $regexMatch: {
                  input: { $ifNull: ["$emailSubject", ""] },
                  regex: "\\{\\{",
                },
              },
              {
                $regexMatch: {
                  input: { $ifNull: ["$emailBody", ""] },
                  regex: "\\{\\{",
                },
              },
            ],
          },
          bodyLength: { $strLenCP: { $ifNull: ["$emailBody", ""] } },
          subjectLength: { $strLenCP: { $ifNull: ["$emailSubject", ""] } },
        },
      },
    ])
    .toArray();
  const byId = new Map(rows.map((row) => [String(row._id), row]));
  return valid.flatMap((id) => {
    const row = byId.get(id);
    return row?.email
      ? [
          {
            id,
            company: row.company,
            email: row.email,
            language: row.language ?? "",
            country: row.country ?? "",
            hasPlaceholder: Boolean(row.hasPlaceholder),
            bodyLength: row.bodyLength ?? 0,
            subjectLength: row.subjectLength ?? 0,
          },
        ]
      : [];
  });
}

/** Cégdomainek, ahonnan már visszapattant levél — néhány tucat. */
export async function bouncedDomains(): Promise<Set<string>> {
  const collection = await getContacts();
  const rows = await collection
    .find({ bouncedAt: { $ne: null } } as never, {
      projection: { primaryEmail: 1 },
    })
    .toArray();
  const domains = new Set<string>();
  for (const row of rows) {
    const domain = row.primaryEmail ? companyDomain(row.primaryEmail) : null;
    if (domain) domains.add(domain);
  }
  return domains;
}

/** A közös szolgáltatók listája a Mongo-kifejezéshez is. */
export const FREEMAIL_DOMAINS = [...FREEMAIL];

/**
 * A cég domainje: a weboldalból, vagy ha az nincs, a céges e-mail-címből
 * (a gmail-féle közös szolgáltatók nem számítanak). `null`, ha egyik sem.
 */
export function contactDomain(contact: {
  website?: string | null;
  primaryEmail?: string | null;
}): string | null {
  const site = (contact.website ?? "")
    .toLowerCase()
    .match(/^(?:https?:\/\/)?(?:www\.)?([^/:?#\s]+)/);
  if (site?.[1] && site[1].length > 3) return site[1];
  return contact.primaryEmail ? companyDomain(contact.primaryEmail) : null;
}

/**
 * Ugyanez Mongo-kifejezésként — a pontszámmal együtt számolja az adatbázis
 * (`rescore`), így a `domain` mező minden mentés és import után friss.
 */
export const DOMAIN_EXPRESSION = {
  $let: {
    vars: {
      site: {
        $regexFind: {
          input: { $toLower: { $ifNull: ["$website", ""] } },
          regex: "^(?:https?://)?(?:www\\.)?([^/:?#\\s]+)",
        },
      },
      mail: {
        $arrayElemAt: [
          {
            $split: [
              {
                $toLower: {
                  $trim: { input: { $ifNull: ["$primaryEmail", ""] } },
                },
              },
              "@",
            ],
          },
          1,
        ],
      },
    },
    in: {
      $cond: [
        {
          $gt: [
            {
              $strLenCP: {
                $ifNull: [{ $arrayElemAt: ["$$site.captures", 0] }, ""],
              },
            },
            3,
          ],
        },
        { $arrayElemAt: ["$$site.captures", 0] },
        {
          $cond: [
            {
              $and: [
                { $gt: [{ $strLenCP: { $ifNull: ["$$mail", ""] } }, 3] },
                { $not: [{ $in: ["$$mail", FREEMAIL_DOMAINS] }] },
              ],
            },
            "$$mail",
            null,
          ],
        },
      ],
    },
  },
};
