/**
 * Kapcsolattartó-keresés a helyi CLI-kkel (Claude, Codex).
 *
 * A futtatókörnyezetet az e-mail keresés moduljai adják — ugyanaz a sor
 * (`cliQueue`), ugyanaz a memória-vészfék, ugyanaz a modell és körkorlát. Itt
 * csak a prompt más, és a **WebSearch kell**: a LinkedIn bejelentkezés nélkül
 * nem tölthető le, tehát a találati oldalakból dolgozunk.
 */
import { runClaudeSearch } from "./emailFinderClaude";
import { runCodexSearch } from "./emailFinderCodex";
import {
  buildPeoplePrompt,
  normalisePeople,
  type PeopleFinding,
} from "./peopleFinder";
import type { ContactDoc } from "./types";

export async function findPeopleWithClaudeCli(
  contact: ContactDoc,
): Promise<PeopleFinding> {
  const parsed = await runClaudeSearch(buildPeoplePrompt(contact), {
    // A LinkedIn nem tölthető le, csak keresésből látszik.
    tools: ["WebSearch", "WebFetch"],
  });
  return normalisePeople(parsed ?? { people: [] }, "claude-code-cli");
}

export async function findPeopleWithCodexCli(
  contact: ContactDoc,
): Promise<PeopleFinding> {
  const parsed = await runCodexSearch(buildPeoplePrompt(contact));
  return normalisePeople(parsed ?? { people: [] }, "codex-cli");
}
