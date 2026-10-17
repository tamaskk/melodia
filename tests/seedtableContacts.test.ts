import assert from "node:assert/strict";
import { test } from "node:test";
import type { SeedtableCompany } from "../src/lib/seedtable";

// Az adatbázis ki van kapcsolva: a kapcsolat ígérete sosem teljesül, így a
// modul betöltése nem nyit Atlas-kapcsolatot (és a teszt nem lóg utána).
process.env.MONGODB_URI ||= "mongodb://teszt.invalid/melodia";
(
  globalThis as typeof globalThis & { _melodiaMongoClient?: Promise<never> }
)._melodiaMongoClient = new Promise<never>(() => {});

async function build(
  ...args: Parameters<typeof import("../src/lib/seedtable").seedtableContacts>
) {
  const { seedtableContacts } = await import("../src/lib/seedtable");
  return seedtableContacts(...args);
}

// Chicago School: valódi import-ellenőrzés, adatbázis nélkül.
const company: SeedtableCompany = {
  id: "c1",
  name: "Fusion Labs GmbH",
  slug: "fusion-labs",
  description: "Developer tools for data teams.",
  website: "fusionlabs.de",
  city: "Berlin",
  country: "Germany",
  industry: "Developer Tools",
  employeeCount: 120,
  foundedYear: 2019,
  status: "active",
  fundingStage: "series_a",
  totalFunding: 12_000_000,
  lastFundingAmount: 8_000_000,
  lastFundingDate: "2026-03-01",
  score: 72,
  likelyToHire: true,
  likelyToOutsource: false,
  tags: ["b2b"],
};

test("a mentett sor a forrást, a sávot és a teljes Seedtable-adatlapot is viszi", async () => {
  // Act
  const { contacts, errors } = await build(
    [company],
    new Map([
      [
        "c1",
        { name: "Anna Weber", email: "anna@fusionlabs.de", linkedin: null },
      ],
    ]),
    "CTO",
    "2026-10-14T20:00:00.000Z",
  );

  // Assert
  assert.equal(errors.size, 0);
  const [contact] = contacts;
  assert.equal(contact.source, "seedtable-de");
  assert.equal(contact.country, "DE");
  assert.equal(contact.size, "51-200");
  assert.equal(contact.person, "Anna Weber");
  assert.equal(contact.primaryEmail, "anna@fusionlabs.de");
  assert.equal(contact.website, "https://fusionlabs.de");
  assert.ok(contact.tags.includes("stadium-series_a"));
  assert.ok(contact.tags.includes("toke-10-50m"));
  assert.deepEqual(contact.seedtable, {
    id: "c1",
    slug: "fusion-labs",
    url: "https://seedtable.com/companies/fusion-labs",
    description: "Developer tools for data teams.",
    industry: "Developer Tools",
    employeeCount: 120,
    foundedYear: 2019,
    status: "active",
    fundingStage: "series_a",
    totalFunding: 12_000_000,
    lastFundingAmount: 8_000_000,
    lastFundingDate: "2026-03-01",
    score: 72,
    likelyToHire: true,
    likelyToOutsource: false,
    tags: ["b2b"],
    importedAt: "2026-10-14T20:00:00.000Z",
  });
});

test("ismeretlen országú és létszámú cég is bekerül: INT forrás, ismeretlen sáv", async () => {
  // Act
  const { contacts } = await build(
    [{ ...company, id: "c2", country: null, employeeCount: null }],
    new Map(),
    null,
    "2026-10-14T20:00:00.000Z",
  );

  // Assert
  assert.equal(contacts[0].source, "seedtable-int");
  assert.equal(contacts[0].size, "ismeretlen");
  assert.equal(contacts[0].person, null);
  assert.equal(contacts[0].seedtable?.id, "c2");
});
