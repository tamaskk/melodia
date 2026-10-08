/**
 * A kanban tábla tára: melyik állás melyik oszlopban van.
 *
 * Az állásról pillanatképet mentünk — a hirdetés később megváltozhat vagy
 * megszűnhet, a táblán a mentéskori állapot marad. A kulcs a `dedupKey`:
 * ugyanaz az állás több forrásból is egy sor.
 */
import type { Collection } from "mongodb";
import { getDb } from "../mongodb";
import {
  BOARD_COLUMNS,
  type BoardItem,
  type BoardJob,
  type BoardStatus,
} from "./types";

/** A kártya ennyit mutat a leírásból — többet tárolni és áthúzni felesleges. */
const DESCRIPTION_CHARS = 240;
/** A tábla felső korlátja egy lekérésben. */
const BOARD_LIMIT = 500;

interface BoardDoc extends BoardItem {
  _id: string;
  updatedAt: Date;
}

let indexReady: Promise<unknown> | null = null;

async function collection(): Promise<Collection<BoardDoc>> {
  const board = (await getDb()).collection<BoardDoc>("job_board");
  // Az index csak gyorsít: ha nem jön létre, az olvasás attól még megy.
  indexReady ??= board
    .createIndex({ updatedAt: -1 }, { name: "board_recent" })
    .catch(() => {
      indexReady = null;
    });
  await indexReady;
  return board;
}

export function isBoardStatus(value: unknown): value is BoardStatus {
  return BOARD_COLUMNS.some((column) => column.id === value);
}

const text = (value: unknown) => (typeof value === "string" ? value : "");

/**
 * A klienstől kapott állásból tárolható pillanatkép, vagy `null`, ha
 * hiányzik belőle, ami nélkül a kártya használhatatlan.
 */
export function toBoardJob(input: unknown): BoardJob | null {
  if (!input || typeof input !== "object") return null;
  const job = { ...(input as Record<string, unknown>) };
  delete job.raw;
  for (const key of ["dedupKey", "sourceId", "title", "company", "url"]) {
    if (!text(job[key]).trim()) return null;
  }
  // Csak webcímet tárolunk: a kártya címe erre mutató link lesz.
  if (!/^https?:\/\//i.test(text(job.url))) return null;
  if (job.description !== undefined) {
    job.description = text(job.description).slice(0, DESCRIPTION_CHARS);
  }
  return job as unknown as BoardJob;
}

export async function listBoard(): Promise<BoardItem[]> {
  return (await collection())
    .find({}, { projection: { _id: 0, status: 1, job: 1 } })
    .sort({ updatedAt: -1 })
    .limit(BOARD_LIMIT)
    .toArray();
}

export async function saveBoardItem(
  job: BoardJob,
  status: BoardStatus,
): Promise<void> {
  await (
    await collection()
  ).updateOne(
    { _id: job.dedupKey },
    { $set: { status, job, updatedAt: new Date() } },
    { upsert: true },
  );
}

export async function removeBoardItem(dedupKey: string): Promise<void> {
  await (await collection()).deleteOne({ _id: dedupKey });
}
