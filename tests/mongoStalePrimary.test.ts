import assert from "node:assert/strict";
import { test } from "node:test";
import { MongoStalePrimaryError } from "mongodb";

// A kapcsolat ígérete sosem teljesül: a teszt nem nyúl az adatbázishoz.
process.env.MONGODB_URI ||= "mongodb://teszt.invalid/melodia";
(
  globalThis as typeof globalThis & { _melodiaMongoClient?: Promise<never> }
)._melodiaMongoClient = new Promise<never>(() => {});

const stale = {
  error: new MongoStalePrimaryError(
    "primary marked stale due to electionId/setVersion mismatch",
  ),
};
const healthy = { error: null };

async function check(type: string, servers: { error: unknown }[]) {
  const { hasStalePrimary } = await import("../src/lib/mongodb");
  return hasStalePrimary({
    type,
    servers: new Map(servers.map((server, index) => [`s${index}`, server])),
  });
}

test("elsődleges nélkül, elavultnak jelölt szerverrel beragadt a kliens", async () => {
  // Act
  const result = await check("ReplicaSetNoPrimary", [stale, healthy, healthy]);

  // Assert
  assert.equal(result, true);
});

test("ha van elsődleges, a régi szerver elavult jelzése nem számít", async () => {
  // Act
  const result = await check("ReplicaSetWithPrimary", [stale, healthy]);

  // Assert
  assert.equal(result, false);
});

test("más okból hiányzó elsődleges nem ok az újranyitásra", async () => {
  // Act
  const result = await check("ReplicaSetNoPrimary", [
    { error: new Error("ECONNRESET") },
    healthy,
  ]);

  // Assert
  assert.equal(result, false);
});
