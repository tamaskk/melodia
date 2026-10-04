import Dashboard from "@/components/Dashboard";
import {
  facetValues,
  getStats,
  listContacts,
  upsertContacts,
} from "@/lib/contacts";
import { allSeedContacts } from "@/data";
import { isAiEnabled, isEmailSearchEnabled } from "@/lib/openai";
import { searchProvider } from "@/lib/emailFinder";

export const dynamic = "force-dynamic";

export default async function Home() {
  // First visit on an empty database seeds itself from the parsed PDFs.
  let stats = await getStats();
  if (stats.total === 0) {
    await upsertContacts(allSeedContacts(), { prune: true });
    stats = await getStats();
  }

  // Az első oldal + a teljes darabszám: a lapozó és a találatszám így már az
  // első kirajzoláskor a valóságot mutatja, nem az 50 betöltött sort.
  const [contacts, facets] = await Promise.all([
    listContacts({ sort: "score" }, { page: 0, pageSize: 50 }),
    facetValues(),
  ]);

  return (
    <main className="flex-1">
      <Dashboard
        initialContacts={contacts}
        initialTotal={stats.total}
        initialStats={stats}
        initialFacets={facets}
        aiEnabled={isAiEnabled()}
        emailSearchEnabled={isEmailSearchEnabled()}
        defaultProvider={searchProvider()}
      />
    </main>
  );
}
