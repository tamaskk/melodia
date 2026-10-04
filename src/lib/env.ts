import fs from "node:fs";
import path from "node:path";

/**
 * Single source of truth for credentials: atlas-credentials.env in the repo root.
 * process.env still wins (useful on hosted deployments), but locally the file
 * is read directly so there is only one place to keep in sync.
 */
/**
 * Egy `KULCS=érték` sor értéke.
 *
 * Két csapdát kezel, mert mindkettőbe bele lehet futni kézi szerkesztésnél:
 * az idézőjel **után** írt megjegyzést (`"jelszó"   # magyarázat`), és az
 * idézőjel nélküli érték végére kerülő megjegyzést. Idézőjelen belül a `#`
 * marad, mert ott a jelszó része lehet.
 */
export function parseEnvValue(raw: string): string {
  const value = raw.trim();

  if (value.startsWith('"') || value.startsWith("'")) {
    const quote = value[0];
    const end = value.indexOf(quote, 1);
    // Lezáratlan idézőjel: a maradékot adjuk vissza, ne dobjuk el az értéket.
    if (end === -1) return value.slice(1);
    return value.slice(1, end);
  }

  // Idézőjel nélkül a " #" előtti rész az érték; a szóköz nélküli `#` maradhat.
  const comment = value.search(/\s#/);
  return (comment === -1 ? value : value.slice(0, comment)).trim();
}

export function parseEnvText(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    out[trimmed.slice(0, eq).trim()] = parseEnvValue(trimmed.slice(eq + 1));
  }
  return out;
}

function readCredentialsFile(): Record<string, string> {
  const candidates = [
    path.join(process.cwd(), "atlas-credentials.env"),
    path.join(process.cwd(), "..", "atlas-credentials.env"),
  ];

  for (const file of candidates) {
    try {
      if (!fs.existsSync(file)) continue;
      return parseEnvText(fs.readFileSync(file, "utf8"));
    } catch {
      // ignore and try the next candidate
    }
  }
  return {};
}

const fileEnv = readCredentialsFile();

export function credential(name: string, fallback = ""): string {
  // An empty value in the file means "not set", so the fallback still applies.
  const value = process.env[name] || fileEnv[name] || "";
  return value.length ? value : fallback;
}

export const MONGODB_URI = credential("MONGODB_URI");
export const MONGODB_DB = credential("MONGODB_DB", "melodia");
export const CONTACTS_COLLECTION = credential(
  "MONGODB_COLLECTION",
  "contacts",
);
