import { NextRequest, NextResponse } from "next/server";
import { getContactById, updateContact } from "@/lib/contacts";
import { createLogger, requestId } from "@/lib/logger";
import {
  missingPlaceholders,
  renderTemplate,
  TEMPLATE_FIELDS,
  type TemplateField,
} from "@/lib/templates";
import type { ContactDoc } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Tömeges szövegcsere sablonból: a `{{cegnev}}` típusú helyettesítőket minden
 * kijelölt sornál a saját adataival tölti ki.
 *
 * `mode: "preview"` semmit nem ír, csak megmutatja, mi lenne az eredmény.
 *
 * `field: "language"`: nem szöveget cserél, hanem a sorok nyelvét állítja a
 * `value`-ra ("hu" | "en"). A nyelv dönt a nyelvhez kötött csatolmányról és a
 * follow-up szövegéről, ezért más nyelvű levél beírása után ezt is át kell
 * állítani.
 */
const LANGUAGE_LABEL = { hu: "magyar", en: "angol" } as const;

/**
 * A kijelölt sorok nyelvének átállítása. Akinek már ez a nyelve, az kimarad;
 * az előnézet a régi és az új nyelvet mutatja.
 */
async function setLanguage(
  ids: string[],
  value: unknown,
  apply: boolean,
  log: ReturnType<typeof createLogger>,
) {
  if (value !== "hu" && value !== "en") {
    return NextResponse.json(
      { error: "Válaszd ki, mi legyen a nyelv: magyar vagy angol." },
      { status: 400 },
    );
  }
  const contacts = (
    await Promise.all(ids.map((id) => getContactById(id)))
  ).filter((contact): contact is ContactDoc => contact !== null);
  const targets = contacts.filter((contact) => contact.language !== value);
  const rows = targets.map((contact) => ({
    id: contact._id,
    company: contact.company,
    language: contact.language,
    value: `${LANGUAGE_LABEL[contact.language] ?? contact.language} → ${LANGUAGE_LABEL[value]}`,
    missing: [] as string[],
  }));

  if (apply) {
    for (const row of rows) {
      await updateContact(row.id, { language: value }, "nyelv");
    }
    log.info(`${rows.length} sor nyelve átállítva: ${value}`, {
      kihagyva: contacts.length - rows.length,
    });
  }
  return NextResponse.json({
    applied: apply,
    total: contacts.length,
    affected: rows.length,
    skipped: contacts.length - rows.length,
    tooLong: [],
    rows: rows.slice(0, 50),
  });
}

export async function POST(request: NextRequest) {
  const log = createLogger(`api:sablon#${requestId()}`);
  try {
    const body = (await request.json()) as {
      ids?: string[];
      field?: string;
      template?: string;
      /** Csak `field: "language"` mellett: az új nyelv. */
      value?: string;
      /** "all" | "hu" | "en" — csak az adott nyelvű sorokra alkalmazzuk. */
      language?: string;
      mode?: "preview" | "apply";
    };

    const ids = Array.isArray(body.ids)
      ? body.ids.filter((id): id is string => typeof id === "string")
      : [];
    if (!ids.length) {
      return NextResponse.json(
        { error: "Nincs kijelölt sor." },
        { status: 400 },
      );
    }

    if (body.field === "language") {
      return await setLanguage(ids, body.value, body.mode === "apply", log);
    }

    const field = TEMPLATE_FIELDS.find((item) => item.key === body.field)
      ?.key as TemplateField | undefined;
    if (!field) {
      return NextResponse.json(
        {
          error: `Ismeretlen mező. Ezek közül lehet: ${TEMPLATE_FIELDS.map((f) => f.key).join(", ")}`,
        },
        { status: 400 },
      );
    }

    const template = String(body.template ?? "");
    if (!template.trim()) {
      return NextResponse.json({ error: "Üres sablon." }, { status: 400 });
    }

    const contacts = (
      await Promise.all(ids.map((id) => getContactById(id)))
    ).filter((contact): contact is ContactDoc => contact !== null);

    const scope =
      body.language === "hu" || body.language === "en" ? body.language : "all";
    const targets = contacts.filter(
      (contact) => scope === "all" || contact.language === scope,
    );

    const rows = targets.map((contact) => ({
      id: contact._id,
      company: contact.company,
      language: contact.language,
      value: renderTemplate(template, contact),
      missing: missingPlaceholders(template, contact),
    }));

    // A 300 karakteres LinkedIn-korlátot előre jelezzük, nem utólag.
    const tooLong =
      field === "connectionRequest"
        ? rows.filter((row) => row.value.length > 300).map((row) => row.company)
        : [];

    if (body.mode !== "apply") {
      return NextResponse.json({
        applied: false,
        total: contacts.length,
        affected: rows.length,
        skipped: contacts.length - rows.length,
        tooLong,
        rows: rows.slice(0, 5),
      });
    }

    for (const row of rows) {
      await updateContact(row.id, { [field]: row.value }, "sablon");
    }

    log.info(`${rows.length} sor frissítve: ${field}`, {
      nyelv: scope,
      kihagyva: contacts.length - rows.length,
    });

    return NextResponse.json({
      applied: true,
      total: contacts.length,
      affected: rows.length,
      skipped: contacts.length - rows.length,
      tooLong,
      rows: rows.slice(0, 5),
    });
  } catch (error) {
    log.error("hiba", (error as Error).message);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 },
    );
  }
}
