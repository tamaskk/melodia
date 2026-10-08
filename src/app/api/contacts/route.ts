import { NextRequest, NextResponse } from "next/server";
import {
  bulkUpdateContacts,
  countContacts,
  deleteContacts,
  facetValues,
  listContactIds,
  listContacts,
  upsertContacts,
} from "@/lib/contacts";
import type { Contact, ContactFilters } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Query paraméterek → szűrő. A /api/stats is ezt használja. */
export function filtersFromParams(params: URLSearchParams): ContactFilters {
  return {
    q: params.get("q") ?? undefined,
    source: params.get("source") ?? undefined,
    kind: params.get("kind") ?? undefined,
    channel: params.get("channel") ?? undefined,
    country: params.get("country") ?? undefined,
    language: params.get("language") ?? undefined,
    category: params.get("category") ?? undefined,
    city: params.get("city") ?? undefined,
    size: params.get("size") ?? undefined,
    tag: params.get("tag") ?? undefined,
    hasEmail: (params.get("hasEmail") as ContactFilters["hasEmail"]) ?? undefined,
    emailSearched:
      (params.get("emailSearched") as ContactFilters["emailSearched"]) ?? undefined,
    hasPeople: (params.get("hasPeople") as ContactFilters["hasPeople"]) ?? undefined,
    peopleSearched:
      (params.get("peopleSearched") as ContactFilters["peopleSearched"]) ?? undefined,
    emailStatus: (params.get("emailStatus") as ContactFilters["emailStatus"]) ?? undefined,
    contactStatus:
      (params.get("contactStatus") as ContactFilters["contactStatus"]) ?? undefined,
    stage: (params.get("stage") as ContactFilters["stage"]) ?? undefined,
    followUp: (params.get("followUp") as ContactFilters["followUp"]) ?? undefined,
    reply: (params.get("reply") as ContactFilters["reply"]) ?? undefined,
    outcome: (params.get("outcome") as ContactFilters["outcome"]) ?? undefined,
    sent: (params.get("sent") as ContactFilters["sent"]) ?? undefined,
    done: (params.get("done") as ContactFilters["done"]) ?? undefined,
    starred: (params.get("starred") as ContactFilters["starred"]) ?? undefined,
    inQueue: (params.get("inQueue") as ContactFilters["inQueue"]) ?? undefined,
    sort: params.get("sort") ?? undefined,
  };
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const filters = filtersFromParams(params);

  try {
    const page = Math.max(0, Number(params.get("page") ?? 0));
    const pageSize = Math.max(1, Math.min(2000, Number(params.get("pageSize") ?? 50)));

    // "Mind a szűrt sor kijelölése": csak az azonosítók kellenek, a teljes
    // dokumentumok áthúzása 900 sornál percekbe telne.
    if (params.get("idsOnly") === "1") {
      const ids = await listContactIds(filters, 0);
      return NextResponse.json({ ids, total: ids.length });
    }

    const [contacts, facets, total] = await Promise.all([
      listContacts(filters, { page, pageSize }),
      params.get("facets") === "1" ? facetValues() : Promise.resolve(null),
      countContacts(filters),
    ]);
    // `count` = amit visszaadtunk (max 2000), `total` = ahány sor tényleg illik.
    return NextResponse.json({
      contacts,
      facets,
      count: contacts.length,
      total,
      page,
      pageSize,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
}

/** Bulk import — used by the seeder and by future PDF imports. */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { contacts?: Contact[] };
    if (!Array.isArray(body.contacts)) {
      return NextResponse.json(
        { error: "Body must be { contacts: Contact[] }" },
        { status: 400 },
      );
    }
    const result = await upsertContacts(body.contacts);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
}

/** Tömeges törlés: { ids: string[] } — a kijelölt sorok az Atlasból is eltűnnek. */
export async function DELETE(request: NextRequest) {
  try {
    const body = (await request.json()) as { ids?: unknown };
    const ids = Array.isArray(body.ids)
      ? body.ids.filter((id): id is string => typeof id === "string")
      : [];
    if (!ids.length) {
      return NextResponse.json(
        { error: "Nincs megadva törlendő sor." },
        { status: 400 },
      );
    }
    const deleted = await deleteContacts(ids);
    return NextResponse.json({ deleted });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
}

/**
 * Tömeges módosítás: `{ ids: string[], patch: {...} }`.
 *
 * Egy hívás, egy `updateMany` — a soronkénti PATCH több száz sornál
 * használhatatlanul lassú.
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      ids?: unknown;
      patch?: Record<string, unknown>;
      source?: string;
    };
    const ids = Array.isArray(body.ids)
      ? body.ids.filter((id): id is string => typeof id === "string")
      : [];
    if (!ids.length) {
      return NextResponse.json({ error: "Nincs kijelölt sor." }, { status: 400 });
    }
    if (!body.patch || typeof body.patch !== "object") {
      return NextResponse.json({ error: "Hiányzik a módosítás." }, { status: 400 });
    }

    const result = await bulkUpdateContacts(
      ids,
      body.patch,
      typeof body.source === "string" ? body.source : "tömeges művelet",
    );
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
