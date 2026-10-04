import { NextRequest, NextResponse } from "next/server";
import { companyAliases, companyIndexKeys } from "@/lib/companyMatch";
import { contactDomain } from "@/lib/recipients";
import { upsertContacts } from "@/lib/contacts";
import { getContacts } from "@/lib/mongodb";
import { looksLikeCsv } from "@/lib/csvImport";
import { KINDS, parseImport } from "@/lib/importSchema";
import { createLogger, requestId } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * Validates pasted JSON and — when mode is "apply" — writes it to Atlas.
 * "preview" never touches the database.
 */
export async function POST(request: NextRequest) {
  const log = createLogger(`api:import#${requestId()}`);
  try {
    const body = (await request.json()) as {
      json?: unknown;
      mode?: "preview" | "apply";
      kind?: string;
      /** Igaz: a már meglévő cégeket békén hagyjuk, csak az újakat vesszük fel. */
      skipExisting?: boolean;
      /**
       * Csak domainben egyező soroknál (más név, ugyanaz a weboldal/cím):
       * `merge` = a meglévő sort frissíti, `new` = új iroda (külön sor),
       * `skip` = kimarad. Kulcs: a sor eredeti kulcsa. Alap: `merge`.
       */
      domainDecisions?: Record<string, "merge" | "new" | "skip">;
    };
    const forceKind = KINDS.find((kind) => kind === body.kind);

    // parseImport maga dönti el, hogy JSON-szöveg, CSV vagy objektum jött.
    const { contacts, errors, warnings } = parseImport(body.json, {
      forceKind,
    });

    // A CSV-ből generált sorokban soha nincs e-mail cím, ezért ezek alapból
    // nem nyúlhatnak a meglévő sorokhoz — csak új cégeket vihetnek fel.
    const looksGenerated =
      typeof body.json === "string" && looksLikeCsv(body.json.trim());
    const noEmailsAtAll =
      contacts.length > 0 && contacts.every((contact) => !contact.primaryEmail);
    const skipExisting = body.skipExisting ?? (looksGenerated || noEmailsAtAll);
    log.info(
      `${body.mode === "apply" ? "importálás" : "ellenőrzés"}: ${contacts.length} sor, ` +
        `${errors.length} hiba, ${warnings.length} figyelmeztetés`,
      { forceKind: forceKind ?? "automatikus" },
    );

    // Which rows already exist, so the preview can say new vs. update.
    // Célzottan, indexből: kulcs, cégnév-alias vagy domain egyezés — nem
    // húzzuk át a teljes (133 ezer soros) listát minden előnézetnél.
    const collection = await getContacts();
    const domainOf = new Map(
      contacts.map((contact) => [contact.key, contactDomain(contact)]),
    );
    const known = await collection
      .find(
        {
          $or: [
            { key: { $in: contacts.map((contact) => contact.key) } },
            {
              aliases: {
                $in: contacts.flatMap((contact) =>
                  companyAliases(contact.company),
                ),
              },
            },
            {
              domain: {
                $in: [...new Set([...domainOf.values()].filter(Boolean))],
              },
            },
          ],
        } as never,
        {
          projection: {
            key: 1,
            company: 1,
            country: 1,
            kind: 1,
            size: 1,
            source: 1,
            domain: 1,
          },
        },
      )
      .toArray();
    const byDomain = new Map<string, (typeof known)[number]>();
    for (const doc of known) {
      if (doc.domain && !byDomain.has(doc.domain))
        byDomain.set(doc.domain, doc);
    }
    const domainMatches = new Map<
      string,
      { key: string; company: string; decision: "merge" | "new" | "skip" }
    >();
    const existingKeys = new Set(known.map((doc) => doc.key));

    // Ugyanaz a cég másik listából más kulcsot kapna (pl. a CSV-ből felvitt IT
    // cég + egy kutatott "agency" sor). Ilyenkor a meglévő sort frissítjük,
    // nem veszünk fel másodikat.
    const byCompany = new Map<string, (typeof known)[number]>();
    for (const doc of known) {
      for (const alias of companyIndexKeys(doc.country, doc.company)) {
        if (!byCompany.has(alias)) byCompany.set(alias, doc);
      }
    }

    // Melyik sor miért számít meglévőnek — az előnézet ezt is megmutatja.
    const matchReason = new Map<string, "kulcs" | "cegnev" | "domain">();
    for (const contact of contacts) {
      if (existingKeys.has(contact.key)) {
        matchReason.set(contact.key, "kulcs");
        continue;
      }
      const nameMatch = companyIndexKeys(contact.country, contact.company)
        .map((alias) => byCompany.get(alias))
        .find(Boolean);
      // Más név, de ugyanaz a weboldal vagy céges cím: az előnézetben dönthetsz
      // (összevonás / új iroda / kihagyás) — alapból összevonás.
      const domain = domainOf.get(contact.key);
      const domainMatch =
        !nameMatch && domain ? byDomain.get(domain) : undefined;
      if (domainMatch) {
        const originalKey = contact.key;
        const decision = body.domainDecisions?.[originalKey] ?? "merge";
        domainMatches.set(originalKey, {
          key: domainMatch.key,
          company: domainMatch.company,
          decision,
        });
        warnings.push({
          index: 0,
          company: contact.company,
          field: "domain",
          message: `Ugyanaz a domain (${domain}), mint „${domainMatch.company}” — ${
            decision === "merge"
              ? "összevonom vele"
              : decision === "new"
                ? "új irodaként veszem fel"
                : "kihagyom"
          }. Az előnézetben átállíthatod.`,
        });
        if (decision !== "merge") continue;
      }
      const match = nameMatch ?? domainMatch;
      if (!match) continue;
      matchReason.set(match.key, nameMatch ? "cegnev" : "domain");

      warnings.push({
        index: 0,
        company: contact.company,
        field: "key",
        message: `Már szerepel a listában (${match.key}) — azt a sort frissítem, nem veszek fel újat.`,
      });
      contact.key = match.key;
      contact.source = match.source;
      contact.kind = match.kind;
      contact.size = contact.size ?? match.size ?? null;
    }

    // Amit kihagyunk, azt csak megmutatjuk; írásra nem kerül.
    const isExisting = (key: string) =>
      existingKeys.has(key) || matchReason.has(key);
    const skippedByDomain = new Set(
      [...domainMatches.entries()]
        .filter(([, match]) => match.decision === "skip")
        .map(([key]) => key),
    );
    const writable = contacts.filter(
      (contact) => !skippedByDomain.has(contact.key),
    );
    const toWrite = skipExisting
      ? writable.filter((contact) => !isExisting(contact.key))
      : writable;

    // Az előnézet sorkulcsa összevonásnál már a meglévő sor kulcsa, különben
    // az eredeti — mindkettőről megtaláljuk a döntést.
    const domainByRow = new Map<
      string,
      {
        originalKey: string;
        company: string;
        decision: "merge" | "new" | "skip";
      }
    >();
    for (const [originalKey, match] of domainMatches) {
      const entry = {
        originalKey,
        company: match.company,
        decision: match.decision,
      };
      domainByRow.set(originalKey, entry);
      if (match.decision === "merge") domainByRow.set(match.key, entry);
    }

    const preview = contacts
      .map((contact) => ({
        key: contact.key,
        company: contact.company,
        person: contact.person,
        email: contact.primaryEmail,
        country: contact.country,
        size: contact.size,
        kind: contact.kind,
        exists: existingKeys.has(contact.key),
        /** "kulcs" = azonos kulcs, "cegnev" = cégnév + ország, "domain" = azonos domain. */
        matchedBy: existingKeys.has(contact.key)
          ? (matchReason.get(contact.key) ?? "kulcs")
          : null,
        /** Ez a sor kimarad az írásból (meglévő cég, védett módban). */
        skipped:
          (skipExisting && existingKeys.has(contact.key)) ||
          skippedByDomain.has(contact.key),
        /** Csak domainben egyezik egy meglévő céggel — ehhez tartozik a döntés. */
        domainMatch: domainByRow.get(contact.key) ?? null,
      }))
      // Elöl, amit még nem ismerünk — azokkal van dolgod; a meglévők alul.
      .sort((a, b) => Number(a.exists) - Number(b.exists));

    const newCount = preview.filter(
      (row) => !row.exists && !row.skipped,
    ).length;
    const existingCount = preview.filter((row) => row.exists).length;

    if (skipExisting && existingCount) {
      warnings.push({
        index: 0,
        company: "—",
        field: "duplikáció",
        message:
          `${existingCount} cég már szerepel az adatbázisban — ezeket NEM írom felül, ` +
          "csak a(z) " +
          `${newCount} új sor kerül be. (Ez az alapértelmezés a CSV-ből generált, ` +
          "e-mail nélküli listáknál.)",
      });
    }

    if (errors.length || body.mode !== "apply") {
      return NextResponse.json({
        applied: false,
        errors,
        warnings,
        preview,
        skipExisting,
        newCount,
        updateCount: skipExisting ? 0 : existingCount,
        skippedCount: skipExisting ? existingCount : 0,
      });
    }

    if (!toWrite.length) {
      log.info("nincs új sor — nem írtam semmit");
      return NextResponse.json({
        applied: true,
        errors,
        warnings,
        preview,
        skipExisting,
        newCount: 0,
        updateCount: 0,
        skippedCount: existingCount,
        total: 0,
      });
    }

    const result = await upsertContacts(toWrite, { origin: "import" });
    log.info(`kiírva: ${result.inserted} új, ${result.updated} frissítve`);

    return NextResponse.json({
      applied: true,
      errors,
      warnings,
      preview,
      skipExisting,
      newCount: result.inserted,
      updateCount: result.updated,
      skippedCount: skipExisting ? existingCount : 0,
      total: result.total,
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
}
