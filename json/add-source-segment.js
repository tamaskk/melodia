#!/usr/bin/env node
/**
 * add-source-segment.js
 *
 * A "source" mezőben beszúr egy szöveget a "companies" és az országkód közé.
 *
 *   "source": "goodfirms_companies_us"
 *   -> "source": "goodfirms_companies_android_us"
 *
 * Használat:
 *   node add-source-segment.js <fájl.json> <szöveg> [--in-place] [--out f.json] [--dry-run]
 *
 * Példák:
 *   node add-source-segment.js android-all-companies.json android
 *   node add-source-segment.js ios.json ios --in-place
 *
 * Alapból új fájlba ment: <név>.out.json. Ha a szöveg már benne van a
 * source-ban, nem teszi bele még egyszer, így többször is lefuttatható.
 */

const fs = require("fs");
const path = require("path");

function usage(msg) {
  if (msg) console.error("Hiba: " + msg + "\n");
  console.error("Használat: node add-source-segment.js <fájl.json> <szöveg> [--in-place] [--out f.json] [--dry-run]");
  process.exit(1);
}

const args = process.argv.slice(2);
const positional = [];
let inPlace = false;
let dryRun = false;
let out = null;

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--in-place") inPlace = true;
  else if (a === "--dry-run") dryRun = true;
  else if (a === "--out") out = args[++i];
  else if (a === "-h" || a === "--help") usage();
  else if (a.startsWith("--")) usage("ismeretlen opció: " + a);
  else positional.push(a);
}

const [inputFile, segment] = positional;
if (!inputFile || !segment) usage("add meg a fájlt és a beszúrandó szöveget");
if (segment.includes("_")) usage("a szöveg nem tartalmazhat '_' karaktert");

// goodfirms_companies_us -> goodfirms_companies_<segment>_us
function transform(source) {
  if (typeof source !== "string" || !source) return source;
  const parts = source.split("_");
  if (parts.length < 2 || parts.includes(segment)) return source;

  const idx = parts.indexOf("companies");
  // a "companies" után; ha nincs ilyen, akkor az utolsó rész (országkód) elé
  const insertAt = idx !== -1 ? idx + 1 : parts.length - 1;
  parts.splice(insertAt, 0, segment);
  return parts.join("_");
}

let raw;
try {
  raw = fs.readFileSync(inputFile, "utf8");
} catch {
  usage("nem tudom beolvasni: " + inputFile);
}

let data;
try {
  data = JSON.parse(raw);
} catch (e) {
  usage("a fájl nem érvényes JSON: " + e.message);
}

const lists = Array.isArray(data)
  ? [data]
  : data && typeof data === "object"
  ? Object.values(data).filter(Array.isArray)
  : [];
if (!lists.length) usage("nem találtam rekord-tömböt a fájlban");

let total = 0;
let changed = 0;
const counts = new Map();

for (const list of lists) {
  for (const item of list) {
    if (!item || typeof item !== "object" || !("source" in item)) continue;
    total++;
    const before = item.source;
    const after = transform(before);
    if (after !== before) {
      item.source = after;
      changed++;
      const k = `${before} -> ${after}`;
      counts.set(k, (counts.get(k) || 0) + 1);
    }
  }
}

console.log(`Rekordok source mezővel: ${total}`);
console.log(`Módosítva:              ${changed}`);
console.log(`Változatlan:            ${total - changed}`);
if (counts.size) {
  console.log("\nVáltozások (top 10):");
  [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .forEach(([k, n]) => console.log(`  ${k}  (${n} db)`));
}

if (dryRun) {
  console.log("\n--dry-run: nem mentettem semmit.");
  process.exit(0);
}

const outFile = inPlace
  ? inputFile
  : out || path.join(path.dirname(inputFile), path.basename(inputFile, path.extname(inputFile)) + ".out.json");

// eredeti behúzás megtartása
const m = raw.match(/^[\[{]\r?\n([ \t]+)/);
const indent = m ? m[1] : raw.includes("\n") ? 2 : 0;

const tmp = outFile + ".tmp";
fs.writeFileSync(tmp, JSON.stringify(data, null, indent) + (raw.endsWith("\n") ? "\n" : ""), "utf8");
fs.renameSync(tmp, outFile);
console.log(`\nMentve: ${outFile}`);
