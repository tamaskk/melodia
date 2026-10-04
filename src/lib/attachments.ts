/**
 * Csatolmányok az `attachments/` mappából.
 *
 * Amit oda beteszel, az minden kiküldött levélre felkerül. Nyelvenként is
 * szétválasztható: a gyökér tartalma mindig megy, plusz a kontakt nyelvének
 * megfelelő `hu/` vagy `en/` almappa, ha létezik.
 */
import { readdir, stat } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { credential } from "./env";
import { createLogger } from "./logger";
import type { Language } from "./types";

const log = createLogger("csatolmany");

/** Amit e-mailben értelmes küldeni; minden mást kihagyunk. */
const ALLOWED = new Set([
  ".pdf",
  ".doc",
  ".docx",
  ".odt",
  ".rtf",
  ".txt",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
]);

/** A Gmail 25 MB-nál elutasít; 20 MB-nál megállunk. */
const MAX_TOTAL_BYTES = 20 * 1024 * 1024;

export interface AttachmentInfo {
  filename: string;
  /** Az `attachments/` mappához relatív név — ezzel hivatkozunk rá a felületről. */
  key?: string;
  path: string;
  bytes: number;
  /** Melyik almappából jött: "közös", "hu" vagy "en". */
  scope: string;
}

export function attachmentsDir(): string {
  return resolve(credential("MAIL_ATTACHMENTS_DIR", "") || join(process.cwd(), "attachments"));
}

async function filesIn(dir: string, scope: string): Promise<AttachmentInfo[]> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return []; // nincs ilyen mappa — nem hiba
  }

  const found: AttachmentInfo[] = [];
  for (const name of entries.sort()) {
    if (name.startsWith(".") || name.toLowerCase() === "readme.md") continue;
    const path = join(dir, name);
    const info = await stat(path).catch(() => null);
    if (!info?.isFile()) continue;
    if (!ALLOWED.has(extname(name).toLowerCase())) {
      log.warn(`kihagyva (nem támogatott típus): ${name}`);
      continue;
    }
    found.push({
      filename: name,
      key: scope === "közös" ? name : `${scope}/${name}`,
      path,
      bytes: info.size,
      scope,
    });
  }
  return found;
}

/**
 * A levélhez tartozó csatolmányok. Nyelv nélkül csak a közös fájlokat adja —
 * a felület ezzel mutatja meg, mi fog menni.
 */
export async function listAttachments(
  language?: Language,
): Promise<{ files: AttachmentInfo[]; totalBytes: number; warning: string | null }> {
  const root = attachmentsDir();
  const common = await filesIn(root, "közös");
  const localised = language ? await filesIn(join(root, language), language) : [];

  const files = [...common, ...localised];
  let totalBytes = files.reduce((sum, file) => sum + file.bytes, 0);
  let warning: string | null = null;

  if (totalBytes > MAX_TOTAL_BYTES) {
    // Inkább kevesebb csatolmány, mint elutasított levél.
    const kept: AttachmentInfo[] = [];
    let running = 0;
    for (const file of files) {
      if (running + file.bytes > MAX_TOTAL_BYTES) continue;
      kept.push(file);
      running += file.bytes;
    }
    warning =
      `A csatolmányok együtt ${Math.round(totalBytes / 1048576)} MB-ot tesznek ki, ` +
      `ez túl sok — csak ${kept.length} fájl megy el.`;
    log.warn(warning);
    files.length = 0;
    files.push(...kept);
    totalBytes = running;
  }

  return { files, totalBytes, warning };
}

/**
 * Kézzel kiválasztott fájlok feloldása. A név mindig az `attachments/` mappához
 * relatív (`CV.pdf`, `en/Letter.pdf`) — kilépni belőle nem lehet.
 *
 * A nyelvi almappák továbbra is nyelvhez kötöttek: egy `en/` fájl akkor sem megy
 * magyar címzettnek, ha ki van pipálva.
 */
export async function resolveSelection(
  names: string[],
  language?: Language,
): Promise<{ files: AttachmentInfo[]; totalBytes: number; warning: string | null }> {
  const root = attachmentsDir();
  const files: AttachmentInfo[] = [];

  for (const raw of names) {
    const name = raw.replace(/^\/+/, "");
    const path = resolve(root, name);
    // Útvonal-kitörés ellen: a feloldott útvonal a mappán belül kell maradjon.
    if (!path.startsWith(root + "/")) {
      log.warn(`kihagyva (mappán kívüli útvonal): ${raw}`);
      continue;
    }
    const info = await stat(path).catch(() => null);
    if (!info?.isFile()) {
      log.warn(`kihagyva (nincs ilyen fájl): ${raw}`);
      continue;
    }
    if (!ALLOWED.has(extname(path).toLowerCase())) continue;

    const folder = name.includes("/") ? name.split("/")[0] : "közös";
    // Nyelvhez kötött fájl csak az adott nyelvű levélre mehet.
    if ((folder === "hu" || folder === "en") && language && folder !== language) {
      continue;
    }
    files.push({
      filename: name.split("/").pop() ?? name,
      path,
      bytes: info.size,
      scope: folder,
    });
  }

  const totalBytes = files.reduce((sum, file) => sum + file.bytes, 0);
  return {
    files,
    totalBytes,
    warning:
      totalBytes > MAX_TOTAL_BYTES
        ? `A kiválasztott fájlok ${Math.round(totalBytes / 1048576)} MB-ot tesznek ki — a Gmail 25 MB fölött elutasít.`
        : null,
  };
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}
