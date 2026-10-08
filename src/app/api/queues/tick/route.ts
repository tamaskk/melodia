import { NextResponse } from "next/server";
import { tickQueues } from "@/lib/sendQueues";

export const dynamic = "force-dynamic";

/**
 * Egy ellenőrző kör kézzel: felveszi az esedékes, várakozó queue-kat. A
 * lokális szerver ezt magától futtatja 10 percenként. Telepített példányon és
 * 19–7 óra között `{ ran: false }` a válasz, és semmi nem indul.
 */
export async function GET() {
  try {
    return NextResponse.json(await tickQueues());
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
