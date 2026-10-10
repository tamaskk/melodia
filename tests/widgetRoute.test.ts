import assert from "node:assert/strict";
import { test } from "node:test";
import { NextRequest } from "next/server";

// London School: az adatbázis itt mockolt collaborator. A kapcsolat ígérete
// sosem teljesül — ha a hibás kérés mégis hozzányúlna, a teszt lógna.
process.env.MONGODB_URI ||= "mongodb://teszt.invalid/melodia";
(
  globalThis as typeof globalThis & { _melodiaMongoClient?: Promise<never> }
)._melodiaMongoClient = new Promise<never>(() => {});

async function call(query: string) {
  const { GET } = await import("../src/app/api/widget/queues/route");
  return GET(
    new NextRequest(`http://localhost:3000/api/widget/queues${query}`),
  );
}

test("hibás dátummal 400 — adatbázis nélkül", async () => {
  // Act
  const response = await call("?date=2026-02-30");

  // Assert
  assert.equal(response.status, 400);
});

test("a hibaválasz sem gyorsítótárazható", async () => {
  // Act
  const response = await call("?date=ma");

  // Assert
  assert.equal(response.headers.get("cache-control"), "no-store");
});
