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

  // A felületen felvett fiókok: a szinkron és a folytatás is ezeket olvassa.
  await (await import("@/lib/accounts")).ensureAccounts();

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

  // A telepített példány ebből a jegyzékből kínálja a csatolmányokat.
  void (await import("@/lib/attachmentIndex")).publishAttachments();

  const { claimSender, isSender, machineName } = await import("@/lib/role");
  // A szerep az első, amit a naplóban látni kell: ettől függ, küld-e ez a gép.
  if (!isSender()) {
    log.warn(
      process.env.VERCEL
        ? "szerep: NÉZŐ (telepített példány) — innen nem megy levél"
        : "szerep: NÉZŐ — ez a gép nem küld és nem ütemez. Küldő géphez: " +
            "MELODIA_ROLE=kuldo az atlas-credentials.env-ben, majd újraindítás.",
    );
  } else if (await claimSender()) {
    log.info(`szerep: KÜLDŐ (${machineName()})`);
  }

  const { startQueueRunner, syncQueueMembership } =
    await import("@/lib/sendQueues");
  // Csak a küldő gépen: a néző minden indulásnál feleslegesen lefuttatná.
  if (isSender()) {
    void syncQueueMembership().catch((error: Error) =>
      log.warn(`queue-tagság pótlása nem sikerült: ${error.message}`),
    );
  }

  // Előbb a félbehagyott küldések folytatódnak, és csak utána indul az
  // ütemező: különben az első kör szabadnak látna egy fiókot, amelyen épp
  // folytatódna egy küldés, és másik queue-t tenne rá.
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

  // Queue-ütemező: 10 percenként felveszi az esedékes queue-kat (csak a küldő gépen).
  log.info(
    startQueueRunner()
      ? "queue-ütemező fut: 10 percenként, indítás 7 és 19 óra között"
      : "queue-ütemező kikapcsolva (néző példány)",
  );
}
