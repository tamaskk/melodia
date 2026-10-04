import { NextResponse } from "next/server";
import { upsertContacts } from "@/lib/contacts";
import { allSeedContacts } from "@/data";

export const dynamic = "force-dynamic";

/**
 * Re-imports every contact extracted from the PDFs.
 * Safe to run any time — sent/done/starred state is preserved.
 */
export async function POST() {
  try {
    const result = await upsertContacts(allSeedContacts(), { prune: true });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
}
