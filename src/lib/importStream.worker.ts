/**
 * Nagy JSON-fájl darabolt beolvasása Web Workerben.
 *
 * A fájlt nem töltjük be egyben (egy 200 MB-os tömb `JSON.parse`-a ~1,2 GB
 * memória): streamként olvassuk, és a legfelső szintű tömb elemeit egyenként
 * vágjuk ki. A memória így a darab méretével arányos, nem a fájléval.
 *
 * Üzenetek:
 * - be: `{ type: "open", file, batchSize }`, utána `{ type: "next" }` darabonként
 * - ki: `{ type: "batch", rows, offset, bytesRead, done }` vagy `{ type: "error", message }`
 */

export interface OpenMessage {
  type: "open";
  file: File;
  batchSize: number;
}

export interface NextMessage {
  type: "next";
}

export interface BatchMessage {
  type: "batch";
  rows: unknown[];
  /** Az első sor sorszáma a teljes fájlban (0-tól). */
  offset: number;
  bytesRead: number;
  done: boolean;
}

export interface ErrorMessage {
  type: "error";
  message: string;
}

const worker = self as unknown as Worker;

let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
let batchSize = 10;
let bytesRead = 0;
let rowCount = 0;
let finished = false;
const queue: unknown[] = [];

// A szkenner állapota darabok között is megmarad.
const decoder = new TextDecoder();
let buffer = "";
let scanned = 0;
let depth = 0;
let inString = false;
let escaped = false;
let objectStart = -1;
let sawArray = false;

function scan() {
  for (let i = scanned; i < buffer.length; i++) {
    const char = buffer[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
    } else if (char === "[" || char === "{") {
      if (depth === 0) {
        if (char !== "[") throw new Error("A fájl nem JSON-tömb ([ … ]).");
        sawArray = true;
      } else if (depth === 1) {
        objectStart = i;
      }
      depth++;
    } else if (char === "]" || char === "}") {
      depth--;
      if (depth === 1 && objectStart >= 0) {
        const text = buffer.slice(objectStart, i + 1);
        try {
          queue.push(JSON.parse(text));
        } catch (error) {
          throw new Error(
            `Hibás JSON a(z) ${rowCount + queue.length + 1}. sorban: ${(error as Error).message}`,
          );
        }
        objectStart = -1;
      }
    }
  }
  // A már feldolgozott részt eldobjuk; a félig olvasott objektum marad.
  const keepFrom = objectStart >= 0 ? objectStart : buffer.length;
  buffer = buffer.slice(keepFrom);
  if (objectStart >= 0) objectStart = 0;
  scanned = buffer.length;
}

async function fill() {
  while (queue.length < batchSize && !finished && reader) {
    const { value, done } = await reader.read();
    if (done) {
      buffer += decoder.decode();
      scan();
      finished = true;
      if (!sawArray) throw new Error("Üres fájl, vagy nem JSON-tömb.");
      break;
    }
    bytesRead += value.byteLength;
    buffer += decoder.decode(value, { stream: true });
    scan();
  }
}

worker.onmessage = async (event: MessageEvent<OpenMessage | NextMessage>) => {
  try {
    if (event.data.type === "open") {
      reader = event.data.file.stream().getReader();
      batchSize = event.data.batchSize;
      return;
    }
    await fill();
    const rows = queue.splice(0, batchSize);
    const message: BatchMessage = {
      type: "batch",
      rows,
      offset: rowCount,
      bytesRead,
      done: finished && queue.length === 0,
    };
    rowCount += rows.length;
    worker.postMessage(message);
  } catch (error) {
    const message: ErrorMessage = {
      type: "error",
      message: (error as Error).message,
    };
    worker.postMessage(message);
  }
};
