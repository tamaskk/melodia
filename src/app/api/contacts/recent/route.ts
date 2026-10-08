import { NextRequest, NextResponse } from "next/server";
import { listRecentSearches } from "@/lib/contacts";

export const dynamic = "force-dynamic";

/** A legutóbb keresett cégek: `?page=0&pageSize=50&withEmail=1`. */
export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const page = Number(params.get("page") ?? 0);
    const pageSize = Number(params.get("pageSize") ?? 50);
    if (!Number.isInteger(page) || page < 0 || !Number.isInteger(pageSize)) {
      return NextResponse.json(
        { error: "A page és a pageSize egész szám legyen." },
        { status: 400 },
      );
    }
    const result = await listRecentSearches({
      page,
      pageSize,
      withEmail: params.get("withEmail") === "1",
    });
    return NextResponse.json({ ...result, page });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
