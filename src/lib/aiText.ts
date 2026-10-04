/**
 * Szöveges AI-feladatok (válasz-osztályozás, válaszpiszkozat, interjú-brief)
 * a helyi Claude CLI-vel — az előfizetési keretből, nem az OpenAI API-kvótából.
 *
 * Eszköz nélkül fut (se webkeresés, se letöltés), egyszerre egy folyamat
 * (cliQueue), és minden hívás fogyása bekerül a `/usage` oldalra.
 */
import { runClaudeJson, takeLastStats } from "./emailFinderClaude";
import { recordUsage } from "./usage";

export async function askClaude(
  prompt: string,
  meta: { contactId: string | null; company: string; origin: string },
): Promise<{ data: Record<string, unknown>; model: string }> {
  const data = await runClaudeJson(prompt);
  const stats = takeLastStats();
  if (stats) {
    await recordUsage({
      provider: "claude",
      ...stats,
      at: new Date().toISOString(),
      contactId: meta.contactId,
      company: meta.company,
      found: true,
      origin: meta.origin,
    });
  }
  return { data, model: stats?.model ?? "claude" };
}
