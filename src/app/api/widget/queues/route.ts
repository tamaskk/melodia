import { NextRequest, NextResponse } from "next/server";
import { isDayKey } from "@/lib/widgetQueues";
import { widgetQueues } from "@/lib/widgetQueuesData";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * A queue-k mai állása a telefonos widgetnek. Csak olvas, és szándékosan
 * nyíltan hívható (belépés és token nélkül). `?date=ÉÉÉÉ-HH-NN` másik napot
 * kér (budapesti naptár szerint).
 */
export async function GET(request: NextRequest) {
  const date = request.nextUrl.searchParams.get("date");
  if (date !== null && !isDayKey(date)) {
    return NextResponse.json(
      { error: "A date paraméter ÉÉÉÉ-HH-NN alakú, létező dátum legyen." },
      { status: 400, headers: NO_STORE },
    );
  }

  try {
    return NextResponse.json(await widgetQueues(date), { headers: NO_STORE });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500, headers: NO_STORE },
    );
  }
}
