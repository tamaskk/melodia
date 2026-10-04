import { Collection, Db, MongoClient } from "mongodb";
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

function createClient(): Promise<MongoClient> {
  const started = Date.now();
  log.info("kapcsolódás az Atlashoz…", { db: MONGODB_DB });
  return new MongoClient(MONGODB_URI, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 15000,
  })
    .connect()
    .then((client) => {
      log.info("kapcsolat él", { ms: Date.now() - started });
      return client;
    })
    .catch((error: Error) => {
      log.error("nem sikerült kapcsolódni", error.message);
      throw error;
    });
}

// Reuse the connection across hot reloads in dev and across lambda invocations.
export const clientPromise: Promise<MongoClient> =
  globalWithMongo._melodiaMongoClient ??
  (globalWithMongo._melodiaMongoClient = createClient());

export async function getDb(): Promise<Db> {
  const client = await clientPromise;
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
