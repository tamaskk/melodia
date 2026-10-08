import QueuesPanel from "@/components/QueuesPanel";
import { searchProvider } from "@/lib/emailFinder";
import { isAiEnabled, isEmailSearchEnabled } from "@/lib/openai";

export const metadata = { title: "Queue-k és naptár — Melodia" };

// A kontakt panelje a futásidejű környezetből tudja, mi van bekapcsolva.
export const dynamic = "force-dynamic";

export default function QueuesPage() {
  return (
    <main className="flex-1">
      <QueuesPanel
        aiEnabled={isAiEnabled()}
        emailSearchEnabled={isEmailSearchEnabled()}
        defaultProvider={searchProvider()}
      />
    </main>
  );
}
