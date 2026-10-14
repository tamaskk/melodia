/**
 * Importfájlok előzetes javítása: ugyanazt a normalizálást futtatja le, amit az
 * /import oldal minden feltöltésnél magától is elvégez (létszám-sáv, ország,
 * elavult `meret-*` címke) — lásd `normaliseImportRow`.
 *
 *   npx tsx scripts/fix-import-json.ts json/*.json
 *
 * Fájlonként egy `<név>.fixed.json` készül mellé; az eredetit nem írja felül.
 * Utána lefuttatja a teljes ellenőrzést is, és kiírja, mi maradt hibás.
 */
import { createWriteStream, readFileSync } from "node:fs";
import { normaliseImportRow, parseImport } from "../src/lib/importSchema";
import type { ImportRow } from "../src/lib/importSchema";

function count(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

async function fixFile(path: string) {
  const rows = JSON.parse(readFileSync(path, "utf8")) as ImportRow[];
  if (!Array.isArray(rows)) throw new Error(`${path}: nem JSON-tömb`);

  const changes = new Map<string, number>();
  const target = path.replace(/\.json$/i, "") + ".fixed.json";
  const out = createWriteStream(target);
  // Soronként írjuk ki, hogy a több száz MB-os fájl se egy stringben álljon össze.
  out.write("[\n");
  rows.forEach((raw, index) => {
    const { row, notes } = normaliseImportRow(raw);
    for (const note of notes) {
      // A konkrét cég nélkül összesítünk: "size: "10-49" → 11-50".
      count(changes, `${note.field}: ${note.message}`);
    }
    rows[index] = row;
    out.write(JSON.stringify(row) + (index < rows.length - 1 ? ",\n" : "\n"));
  });
  out.write("]\n");
  await new Promise<void>((resolve, reject) =>
    out.end((error?: Error | null) => (error ? reject(error) : resolve())),
  );

  // Ellenőrzés ezres darabokban, ahogy az import is látná.
  const errors = new Map<string, number>();
  for (let start = 0; start < rows.length; start += 1000) {
    for (const issue of parseImport(rows.slice(start, start + 1000)).errors) {
      count(errors, `${issue.field}: ${issue.message.slice(0, 140)}`);
    }
  }

  console.log(`\n${path} → ${target} (${rows.length} sor)`);
  for (const [change, times] of [...changes].sort((a, b) => b[1] - a[1])) {
    console.log(`  javítva ${String(times).padStart(6)} × ${change}`);
  }
  if (errors.size) {
    for (const [error, times] of [...errors].sort((a, b) => b[1] - a[1])) {
      console.log(`  HIBA    ${String(times).padStart(6)} × ${error}`);
    }
  } else {
    console.log("  hiba nincs — importálható");
  }
}

async function main() {
  const paths = process.argv
    .slice(2)
    .filter((path) => !/\.fixed\.json$/i.test(path));
  if (!paths.length) {
    console.error("Használat: npx tsx scripts/fix-import-json.ts json/*.json");
    process.exit(1);
  }
  for (const path of paths) await fixFile(path);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
