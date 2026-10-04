import DebugConsole from "@/components/DebugConsole";
import type { LogLevel } from "@/lib/logger";

export const metadata = { title: "Élő napló — Melodia" };

const LEVELS: LogLevel[] = ["debug", "info", "warn", "error"];

/**
 * A futtató sávok hibadoboza ide linkel, szűrve: `?scope=kuldes&level=warn`.
 */
export default async function DebugPage({ searchParams }: PageProps<"/debug">) {
  const params = await searchParams;
  const scope = typeof params.scope === "string" ? params.scope : "";
  const level = LEVELS.find((value) => value === params.level) ?? "debug";

  return (
    <main className="flex-1">
      <DebugConsole initialScope={scope} initialLevel={level} />
    </main>
  );
}
