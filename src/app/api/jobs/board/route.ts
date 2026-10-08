import { NextRequest, NextResponse } from "next/server";
import {
  isBoardStatus,
  listBoard,
  removeBoardItem,
  saveBoardItem,
  toBoardJob,
} from "@/lib/jobs/board";

export const dynamic = "force-dynamic";

const failed = (error: unknown) =>
  NextResponse.json(
    {
      error: `A tábla most nem érhető el: ${(error as Error).message}. Próbáld újra.`,
    },
    { status: 500 },
  );

/** A kanban tábla: `{ items: [{ status, job }] }`, a legutóbb mozgatott elöl. */
export async function GET() {
  try {
    return NextResponse.json({ items: await listBoard() });
  } catch (error) {
    return failed(error);
  }
}

/** Állás felvétele vagy áthelyezése: `{ job, status }`. */
export async function PUT(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    job?: unknown;
    status?: unknown;
  };
  if (!isBoardStatus(body.status)) {
    return NextResponse.json(
      { error: "Ismeretlen oszlop. Válassz a tábla hat oszlopa közül." },
      { status: 400 },
    );
  }
  const job = toBoardJob(body.job);
  if (!job) {
    return NextResponse.json(
      { error: "Hiányos állás: azonosító, cím, cég és webcím kell hozzá." },
      { status: 400 },
    );
  }
  try {
    await saveBoardItem(job, body.status);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return failed(error);
  }
}

/** Levétel a tábláról: `{ dedupKey }`. */
export async function DELETE(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    dedupKey?: unknown;
  };
  if (typeof body.dedupKey !== "string" || !body.dedupKey) {
    return NextResponse.json(
      { error: "Hiányzik az állás azonosítója." },
      { status: 400 },
    );
  }
  try {
    await removeBoardItem(body.dedupKey);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return failed(error);
  }
}
