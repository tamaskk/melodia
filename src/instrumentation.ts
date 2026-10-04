/**
 * A szerver indulásakor egyszer lefut.
 *
 * Ez teszi lehetővé, hogy a kiküldés túlélje az újraindítást: ami futó
 * állapotban maradt az adatbázisban, azt itt vesszük fel újra. Egy szerverre
 * telepítve ettől megy magától tovább minden fiók küldése.
 */
export async function register() {
  // Csak a Node-futásidőben van adatbázis és SMTP.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { resumeCampaigns } = await import("@/lib/sendCampaign");
  const { createLogger } = await import("@/lib/logger");
  const log = createLogger("indulas");

  // Illeszkedési pontszám: induláskor a teljes listára (a háttérben, ~1 perc),
  // hogy a szabályok változása után is friss legyen a rendezés.
  void import("@/lib/contacts")
    .then(({ rescoreAll }) => rescoreAll())
    .then((result) =>
      log.info(
        `pontszám újraszámolva: ${result.updated} sor, ${Math.round(result.ms / 1000)} mp`,
      ),
    )
    .catch((error: Error) =>
      log.error("pontszám-számolás hiba", error.message),
    );

  // A Gmail-szinkron magától fut: a Teendők (új válasz, follow-up) így friss.
  try {
    const { startAutoSync } = await import("@/lib/inbox");
    const minutes = startAutoSync();
    log.info(
      minutes
        ? `automatikus Gmail-szinkron ${minutes} percenként (az első 1 perc múlva)`
        : "automatikus Gmail-szinkron kikapcsolva",
    );
  } catch (error) {
    log.error("az automatikus szinkron nem indult", (error as Error).message);
  }

  try {
    const resumed = await resumeCampaigns();
    log.info(
      resumed
        ? `${resumed} félbehagyott küldés folytatódik`
        : "nincs folytatandó küldés",
    );
  } catch (error) {
    log.error("a folytatás nem sikerült", (error as Error).message);
  }
}
