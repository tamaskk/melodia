import { NextResponse } from "next/server";
import { sourceCatalog } from "@/lib/jobs/sources";

export const dynamic = "force-dynamic";

/** A forráskatalógus: mi van bekötve, mi fut, és melyik beállítás hiányzik. */
export async function GET() {
  return NextResponse.json({ sources: sourceCatalog() });
}
