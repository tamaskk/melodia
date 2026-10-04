import { NextRequest } from "next/server";
import { snapshot, subscribe, type LogEntry } from "@/lib/logger";

export const dynamic = "force-dynamic";
// A Vercel Hobby csomag 300 mp-nél levágja a függvényt; saját szerveren ez a
// beállítás nem számít, ott a folyam addig él, amíg a böngésző nyitva tartja.
export const maxDuration = 300;

/**
 * Élő naplófolyam (SSE). Először a puffer tartalmát küldi, utána minden új
 * bejegyzést azonnal. A /debug oldal ezt hallgatja.
 */
export async function GET(request: NextRequest) {
  const encoder = new TextEncoder();
  const since = Number(request.nextUrl.searchParams.get("since") ?? 0);

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const send = (entry: LogEntry) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(entry)}\n\n`));
        } catch {
          closed = true;
        }
      };

      for (const entry of snapshot()) {
        if (entry.id > since) send(entry);
      }

      const unsubscribe = subscribe(send);
      // Néhány másodpercenként komment-sor, hogy a proxy ne bontsa a kapcsolatot.
      const heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          closed = true;
        }
      }, 15000);

      request.signal.addEventListener("abort", () => {
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // már zárva
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
