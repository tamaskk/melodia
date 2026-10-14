import { Collection, Db, MongoClient, MongoStalePrimaryError } from "mongodb";
import { CONTACTS_COLLECTION, MONGODB_DB, MONGODB_URI } from "./env";
import { createLogger } from "./logger";
import type { Contact } from "./types";

if (!MONGODB_URI) {
  throw new Error(
    "MONGODB_URI missing. Add it to atlas-credentials.env or the environment.",
  );
}

type GlobalWithMongo = typeof globalThis & {
  _melodiaMongoClient?: Promise<MongoClient>;
};

const globalWithMongo = globalThis as GlobalWithMongo;

const log = createLogger("mongo");

/** Ennyi ideig lehet a klaszter elavultnak látott elsődlegessel, mielőtt újranyitunk. */
const STALE_PRIMARY_GRACE_MS = 60_000;

type TopologyView = {
  type: string;
  servers: Map<string, { error: unknown }>;
};

/**
 * Igaz, ha a driver nem lát elsődleges szervert, mert az újat elavultnak
 * jelölte. Választás közben ez pár másodpercig természetes; ha megmarad, a
 * klaszter kicserélődött alattunk (Atlas-költöztetés, tierváltás), és a kliens
 * a régi electionId-re emlékszik — ebből magától sosem gyógyul ki.
 */
export function hasStalePrimary(description: TopologyView): boolean {
  if (description.type === "ReplicaSetWithPrimary") return false;
  return [...description.servers.values()].some(
    (server) => server.error instanceof MongoStalePrimaryError,
  );
}

/** Ha a kliens beragadt, eldobjuk: a következő kérés frisset nyit. */
function watchForStalePrimary(
  client: MongoClient,
  promise: Promise<MongoClient>,
) {
  let timer: NodeJS.Timeout | null = null;
  client.on("topologyDescriptionChanged", (event) => {
    if (!hasStalePrimary(event.newDescription)) {
      if (timer) clearTimeout(timer);
      timer = null;
      return;
    }
    timer ??= setTimeout(() => {
      log.warn("a kapcsolat elavult elsődlegesnél ragadt, újranyitom");
      if (globalWithMongo._melodiaMongoClient === promise) {
        globalWithMongo._melodiaMongoClient = undefined;
      }
      client.close().catch(() => {});
    }, STALE_PRIMARY_GRACE_MS);
    // Rövid életű scriptet ne tartson életben az időzítő.
    timer.unref();
  });
}

function createClient(): Promise<MongoClient> {
  const started = Date.now();
  log.info("kapcsolódás az Atlashoz…", { db: MONGODB_DB });
  const promise: Promise<MongoClient> = new MongoClient(MONGODB_URI, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 15000,
  })
    .connect()
    .then((client) => {
      log.info("kapcsolat él", { ms: Date.now() - started });
      watchForStalePrimary(client, promise);
      return client;
    })
    .catch((error: Error) => {
      log.error("nem sikerült kapcsolódni", error.message);
      // Sikertelen kapcsolódás ne ragadjon be: a következő kérés újrapróbálja.
      if (globalWithMongo._melodiaMongoClient === promise) {
        globalWithMongo._melodiaMongoClient = undefined;
      }
      throw error;
    });
  return promise;
}

// Reuse the connection across hot reloads in dev and across lambda invocations.
function currentClient(): Promise<MongoClient> {
  return (globalWithMongo._melodiaMongoClient ??= createClient());
}

/** A scriptek kliense: rövid életűek, a végén ezt zárják le. */
export const clientPromise: Promise<MongoClient> = currentClient();

export async function getDb(): Promise<Db> {
  const client = await currentClient();
  return client.db(MONGODB_DB);
}

let indexesReady: Promise<void> | null = null;

export async function getContacts(): Promise<Collection<Contact>> {
  const db = await getDb();
  const collection = db.collection<Contact>(CONTACTS_COLLECTION);

  indexesReady ??= (async () => {
    const started = Date.now();
    await Promise.all([
      collection.createIndex({ key: 1 }, { unique: true }),

      // Rendezések. Index nélkül a Mongo memóriában rendez, ami 100 000+ sornál
      // percekbe telik — a lista alapértelmezett rendezése ez a kettős kulcs.
      collection.createIndex(
        { source: 1, company: 1 },
        { name: "sort_default" },
      ),
      collection.createIndex({ company: 1 }, { name: "sort_company" }),
      collection.createIndex({ createdAt: -1 }, { name: "sort_newest" }),
      collection.createIndex({ updatedAt: -1 }, { name: "sort_updated" }),
      collection.createIndex(
        { emailSearchedAt: -1 },
        { name: "sort_searched" },
      ),
      collection.createIndex({ score: -1, company: 1 }, { name: "sort_score" }),
      collection.createIndex({ domain: 1 }, { name: "company_domain" }),
      collection.createIndex(
        { primaryEmail: -1, company: 1 },
        { name: "sort_email" },
      ),
      collection.createIndex(
        { done: 1, sent: 1, company: 1 },
        { name: "sort_status" },
      ),

      // Szűrők.
      collection.createIndex({ done: 1 }),
      collection.createIndex({ sent: 1 }),
      collection.createIndex({ starred: 1 }),
      collection.createIndex({ country: 1 }),
      collection.createIndex({ category: 1 }),
      collection.createIndex({ kind: 1 }),
      collection.createIndex({ size: 1 }),
      collection.createIndex({ city: 1 }),
      collection.createIndex({ tags: 1 }),
      collection.createIndex({ outcome: 1 }),
      collection.createIndex({ "replyTriage.category": 1 }),
      // Kapcsolattartó-keresés: "kinél van már ember" és "kinél kerestünk".
      collection.createIndex(
        { peopleSearchedAt: -1 },
        { name: "people_searched" },
      ),
      // Cégnév-aliasok: ezen fut a "megvan-e már a listában?" ellenőrzés.
      collection.createIndex({ aliases: 1 }, { name: "company_aliases" }),
      // A beérkező levelek párosítása a másodlagos címekkel is keres.
      collection.createIndex({ emails: 1 }),
      collection.createIndex({ language: 1 }),
      // A begyűjtés kérdése: "nincs e-mail és még nem kerestem".
      collection.createIndex(
        { primaryEmail: 1, emailSearchedAt: 1, company: 1 },
        { name: "sweep_candidates" },
      ),

      // A naptár kérdése: "melyik napon hány levél ment ki" — csak a kiküldöttekre.
      collection.createIndex(
        { sentAt: 1 },
        { name: "sent_at", partialFilterExpression: { sent: true } },
      ),

      // "Benne van egy queue-ban" szűrő: csak a queue-ba tett sorokat indexeli.
      collection.createIndex(
        { queueId: 1 },
        {
          name: "in_queue",
          partialFilterExpression: { queueId: { $type: "string" } },
        },
      ),

      // A teljes szöveges indexet (company/person/note/role) szándékosan nem
      // építjük: a kereső reguláris kifejezéssel dolgozik, a szöveges index
      // pedig 115 MB volt — az M0 512 MB-os kvótájának ötöde, használat nélkül.
    ]);
    log.info("indexek rendben", { ms: Date.now() - started });
  })().catch(() => {
    // Index creation is best-effort; never block reads on it.
    indexesReady = null;
  });

  await indexesReady;
  return collection;
}
