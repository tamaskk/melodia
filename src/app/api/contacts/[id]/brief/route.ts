import { NextRequest, NextResponse } from "next/server";
import { createInterviewBrief } from "@/lib/interviewBrief";

export const dynamic = "force-dynamic";

/** Interjú-brief készítése (vagy újrakészítése) egy sorhoz. */
export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  try {
    return NextResponse.json({ brief: await createInterviewBrief(id) });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 },
    );
  }
}
